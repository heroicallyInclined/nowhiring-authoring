// Dev-only proof for the reference graph — not shipped, not referenced by
// index.html. Run with: node tools/prove-graph.mjs
//
// Reads the real schema and data files from the sibling game checkout
// (../nowHiringHeroes) and answers plans/authoring-tool.md Task 7's own
// acceptance check: "what points at ashen_wood" and "what points at the
// meat category" — with no hand-written list, the inverse index built
// straight from data/schema/*.json.
import { readFileSync } from "node:fs";
import { TABLE_NAMES } from "../tables.js";
import { buildInverseIndex, referrersOf } from "../graph.js";

const GAME_REPO = new URL("../../nowHiringHeroes/", import.meta.url);

const schemas = new Map();
const tables = new Map();
for (const name of TABLE_NAMES) {
  schemas.set(name, JSON.parse(readFileSync(new URL(`data/schema/${name}.schema.json`, GAME_REPO), "utf-8")));
  tables.set(name, JSON.parse(readFileSync(new URL(`data/${name}.json`, GAME_REPO), "utf-8")));
}

const index = buildInverseIndex(schemas, tables);

function printReferrers(label, value) {
  console.log(`\n=== what points at ${label} ===`);
  const referrers = referrersOf(index, value);
  if (referrers.length === 0) {
    console.log("  nothing");
    return;
  }
  for (const { table, path } of referrers) console.log(`  ${table}: ${path}`);
}

printReferrers("'ashen_wood' (a location id)", "ashen_wood");
printReferrers("the 'meat' category", "meat");

let failures = 0;
function check(label, condition) {
  console.log(`\n${condition ? "ok" : "FAIL"} — ${label}`);
  if (!condition) failures++;
}

// ashen_wood is named by run.rumor_deck and by two quirk conditions
// (grave_born's `when.location` is barrow_rows, not ashen_wood — the
// deck and the tags are what name it).
check(
  "ashen_wood is pointed at by run.rumor_deck",
  referrersOf(index, "ashen_wood").some((r) => r.table === "run"),
);

// meat is a category with a supplying location (Ashen Wood) and recipe
// slots naming it (roast, stew, pie) — never a hand-written list.
check(
  "meat is pointed at by locations.supplies and by recipes.slots",
  referrersOf(index, "meat").some((r) => r.table === "locations") &&
    referrersOf(index, "meat").some((r) => r.table === "recipes"),
);

// staples is the carve-out the plan names explicitly: no location supplies
// it, so nothing in `locations` should point at it.
check(
  "staples has no location referrer (the deliberate carve-out)",
  !referrersOf(index, "staples").some((r) => r.table === "locations"),
);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
