// Dev-only proof for the Add an ingredient wizard (plans/authoring-tool-task10.md
// Task 10.3) — not shipped, not referenced by index.html. Run with:
// node tools/prove-wizard-add-ingredient.mjs
//
// add_ingredient.js's DOM steps can't run outside a browser, but the splice
// logic behind them — addIngredientEdit, addToLocationSupplies, addAsTarget,
// addToBuyOnly — is plain data over real text, checked here the same way
// tools/prove-splice.mjs checks the primitives underneath it.
import { readFileSync } from "node:fs";
import {
  slugify, addIngredientEdit, addToLocationSupplies, addAsTarget, addToBuyOnly,
} from "../views/wizards/add_ingredient.js";
import { deadCategories } from "../consequences.js";
import { buildInverseIndex } from "../graph.js";
import { TABLE_NAMES } from "../tables.js";

const GAME_REPO = new URL("../../nowHiringHeroes/", import.meta.url);

function loadSchema(name) {
  return JSON.parse(readFileSync(new URL(`data/schema/${name}.schema.json`, GAME_REPO), "utf-8"));
}
function loadTableText(name) {
  return readFileSync(new URL(`data/${name}.json`, GAME_REPO), "utf-8");
}

let failures = 0;
function check(label, condition) {
  console.log(`${condition ? "ok" : "FAIL"} — ${label}`);
  if (!condition) failures++;
}

check("slugify turns a label into a snake_case id", slugify("Wild Garlic") === "wild_garlic");
check("slugify strips punctuation", slugify("Bear's Den!") === "bear_s_den");

const schemas = new Map(TABLE_NAMES.map((n) => [n, loadSchema(n)]));
const tables = new Map(TABLE_NAMES.map((n) => [n, JSON.parse(loadTableText(n))]));
const index = buildInverseIndex(schemas, tables);

// --- an already-suppliable category (meat) needs no branch ---
{
  const ingredientsText = loadTableText("ingredients");
  const spliced = addIngredientEdit(ingredientsText, { id: "fox", label: "Fox", category: "meat", rarity: "uncommon" });
  const parsed = JSON.parse(spliced);
  check("meat is already suppliable", !deadCategories(index, schemas).includes("meat"));
  check("the new entry lands right after the last meat entry", parsed.entries.some((e) => e.id === "fox" && e.category === "meat"));
}

// --- staples is the real dead category today ---
check("staples is dead today", deadCategories(index, schemas).includes("staples"));

// --- branch 1: add to a location's supplies ---
{
  const locationsText = loadTableText("locations");
  const locationsData = JSON.parse(locationsText);
  const locationIndex = locationsData.entries.findIndex((l) => l.id === "old_millpond"); // supplies non-empty
  const spliced = addToLocationSupplies(locationsText, locationIndex, "staples", 3);
  const parsed = JSON.parse(spliced);
  check(
    "supplies branch appends onto a non-empty supplies array",
    parsed.entries[locationIndex].supplies.some((s) => s.category === "staples" && s.amount === 3),
  );

  const emptyIndex = locationsData.entries.findIndex((l) => l.id === "drowned_vineyard"); // supplies empty
  const splicedEmpty = addToLocationSupplies(locationsText, emptyIndex, "staples", 2);
  const parsedEmpty = JSON.parse(splicedEmpty);
  check(
    "supplies branch handles an empty supplies array",
    parsedEmpty.entries[emptyIndex].supplies.length === 1 && parsedEmpty.entries[emptyIndex].supplies[0].category === "staples",
  );
}

// --- branch 2: name as a target ---
{
  const locationsText = loadTableText("locations");
  const locationsData = JSON.parse(locationsText);
  const locationIndex = locationsData.entries.findIndex((l) => l.id === "old_millpond"); // has targets
  const spliced = addAsTarget(locationsText, locationIndex, "salt", "Salt", "staples", "common");
  const parsed = JSON.parse(spliced);
  check(
    "target branch appends onto an existing targets array",
    parsed.entries[locationIndex].targets.some((t) => t.id === "salt" && t.category === "staples"),
  );
}

// --- branch 3: buy-only ---
{
  const pricesText = loadTableText("prices");
  const spliced = addToBuyOnly(pricesText, "salt", 2);
  const parsed = JSON.parse(spliced);
  check("buy-only branch appends onto prices.buy", parsed.buy.some((b) => b.good === "salt" && b.price === 2));
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
