// Dev-only proof for the Pantry view (plans/authoring-tool-task8.md Task
// 8.3) — not shipped, not referenced by index.html. Run with:
// node tools/prove-pantry.mjs
//
// pantry.js builds DOM elements for the table itself, but the logic behind
// its acceptance check — the staples carve-out, and a target reading as
// more specific than its supplying category — is plain data and is checked
// here against the real sibling game checkout (../nowHiringHeroes), the same
// way tools/prove-graph.mjs checks Task 7.
import { readFileSync } from "node:fs";
import { TABLE_NAMES } from "../tables.js";
import { buildInverseIndex } from "../graph.js";
import { locationSourcing, marketSourcing, dishesUsing, sellPriceOf } from "../views/pantry.js";

const GAME_REPO = new URL("../../nowHiringHeroes/", import.meta.url);

const schemas = new Map();
const tables = new Map();
for (const name of TABLE_NAMES) {
  schemas.set(name, JSON.parse(readFileSync(new URL(`data/schema/${name}.schema.json`, GAME_REPO), "utf-8")));
  tables.set(name, JSON.parse(readFileSync(new URL(`data/${name}.json`, GAME_REPO), "utf-8")));
}

const index = buildInverseIndex(schemas, tables);
const locationsData = tables.get("locations");
const pricesData = tables.get("prices");
const recipesData = tables.get("recipes");
const ingredientsData = tables.get("ingredients");

function ingredient(id) {
  return ingredientsData.entries.find((e) => e.id === id);
}

let failures = 0;
function check(label, condition) {
  console.log(`${condition ? "ok" : "FAIL"} — ${label}`);
  if (!condition) failures++;
}

// flour is a staple: no location supplies or targets it (the Task 7
// carve-out), but prices.buy names it directly.
const flour = ingredient("flour");
check(
  "flour has no location referrer",
  locationSourcing(index, locationsData, flour).length === 0,
);
check(
  "flour has a Market referrer from prices.buy",
  marketSourcing(pricesData, flour).some((tag) => tag.includes("Market")),
);

// wheat is old_millpond's named target; carrots is the same category
// (crops) but not named anywhere — it should read as a plain supplier,
// not a target.
const wheat = ingredient("wheat");
const carrots = ingredient("carrots");
check(
  "wheat's sourcing names The Old Millpond as a target",
  locationSourcing(index, locationsData, wheat).some((tag) =>
    typeof tag === "object" && tag.label.includes("The Old Millpond") && tag.label.includes("target") && tag.rarity),
);
check(
  "carrots' sourcing names The Old Millpond only as a supplier, not a target",
  locationSourcing(index, locationsData, carrots).some((tag) => tag === "The Old Millpond"),
);

// Every recipe naming the staples category should be dish usage for a
// staple, even though recipes only ever name a category, never an
// ingredient id (recipes.schema.json's slots have no id_ref).
check(
  "flour (staples) is used by at least one dish",
  dishesUsing(index, recipesData, flour).length > 0,
);

// sim/rules/prices.gd's sell_price_of: half the rarity's base price,
// floored, never below 1g.
const chicken = ingredient("chicken");
const deer = ingredient("deer");
check("a common ingredient (chicken, base 1) sells for 1g, floored up from 0", sellPriceOf(pricesData, chicken) === 1);
check("a rare ingredient (deer, base 6) sells for 3g", sellPriceOf(pricesData, deer) === 3);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
