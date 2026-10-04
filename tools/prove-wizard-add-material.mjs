// Dev-only proof for the Add a material wizard (plans/materials.md Task 6).
// Run with: node tools/prove-wizard-add-material.mjs
import { readFileSync } from "node:fs";
import { idRefusal, addMaterialEdits } from "../views/wizards/add_material.js";
import { lineDiff } from "../diff.js";
import { buildInverseIndex, referrersOf } from "../graph.js";
import { tableNames } from "./sibling.mjs";

const TABLE_NAMES = tableNames();
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

const texts = new Map(TABLE_NAMES.map((n) => [n, loadTableText(n)]));
const parsed = (name) => JSON.parse(texts.get(name));

check("wheat is refused", idRefusal(parsed("ingredients"), parsed("prices"), "wheat") !== null);
check("timber is refused", idRefusal(parsed("ingredients"), parsed("prices"), "timber") !== null);
check("slate is accepted", idRefusal(parsed("ingredients"), parsed("prices"), "slate") === null);

const locationIndex = parsed("locations").entries.findIndex((l) => l.id === "barrow_rows");
const amenityIndex = parsed("amenities").entries.findIndex((a) => a.id === "painted_signboard");
const edits = addMaterialEdits(texts, {
  id: "slate", label: "Slate",
  source: { locationIndex, amount: 2 },
  costs: [{ amenityIndex, amount: 3 }],
});

check("touches prices, locations and amenities", [...edits.keys()].sort().join(",") === "amenities,locations,prices");
for (const [table, newText] of edits) {
  const changed = lineDiff(texts.get(table), newText).filter((row) => row.type !== "same");
  const added = changed.filter((row) => row.type === "add").map((row) => row.line);
  const removed = changed.filter((row) => row.type === "del").map((row) => row.line);
  // An append after an array's last row also gives that row its comma.
  const onlyComma = removed.length === 1 && added.length === 2 && added.includes(`${removed[0]},`);
  const inPlace = removed.length === 1 && added.length === 1;
  check(`${table}.json changes one line (+${added.length} -${removed.length})`, onlyComma || inPlace);
}

const after = new Map(texts);
for (const [table, newText] of edits) after.set(table, newText);
const slate = JSON.parse(after.get("prices")).goods.find((g) => g.id === "slate");
check("slate is a material", slate?.category === "materials" && slate.label === "Slate");

const schemas = new Map(TABLE_NAMES.map((n) => [n, loadSchema(n)]));
const tables = new Map(TABLE_NAMES.map((n) => [n, JSON.parse(after.get(n))]));
const refs = referrersOf(buildInverseIndex(schemas, tables), "slate");
console.log("  referrers of slate:", JSON.stringify(refs.map((r) => r.table)));
check("Retire sees its two referrers", refs.length === 2);

const bare = addMaterialEdits(texts, { id: "slate", label: "Slate", source: null, costs: [] });
check("no source and no cost touches prices alone", [...bare.keys()].join(",") === "prices");

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
