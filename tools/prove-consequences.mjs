// Dev-only proof for the structural consequence panel (Task 9.1) — not
// shipped, not referenced by index.html. Run with:
// node tools/prove-consequences.mjs
//
// Checks unsuppliedCategories and orphansFrom against the real
// sibling game checkout (../nowHiringHeroes), the same way tools/prove-*.mjs
// already check Tasks 7 and 8. Uses structuredClone to build a `before`/
// `after` pair for each case, mirroring how app.js's structuralConsequences()
// diffs loaded.tables against edited.
import { readFileSync } from "node:fs";
import { tableNames } from "./sibling.mjs";
import { buildInverseIndex } from "../graph.js";
import { unsuppliedCategories, orphansFrom, referrerSummary, idRowsField } from "../consequences.js";

const TABLE_NAMES = tableNames();

const GAME_REPO = new URL("../../nowHiringHeroes/", import.meta.url);

const schemas = new Map();
const tables = new Map();
for (const name of TABLE_NAMES) {
  schemas.set(name, JSON.parse(readFileSync(new URL(`data/schema/${name}.schema.json`, GAME_REPO), "utf-8")));
  tables.set(name, JSON.parse(readFileSync(new URL(`data/${name}.json`, GAME_REPO), "utf-8")));
}

let failures = 0;
function check(label, condition) {
  console.log(`${condition ? "ok" : "FAIL"} — ${label}`);
  if (!condition) failures++;
}

// --- unsuppliedCategories: every location supplies staples today, so strip
// them to get an unsupplied category, then add one back.
{
  const before = new Map(tables);
  const stripped = structuredClone(tables.get("locations"));
  for (const l of stripped.entries) l.supplies = l.supplies.filter((s) => s.category !== "staples");
  before.set("locations", stripped);
  const beforeIndex = buildInverseIndex(schemas, before);
  check("staples is unsupplied before any location supplies it", unsuppliedCategories(beforeIndex, schemas).includes("staples"));

  const after = new Map(before);
  const locations = structuredClone(before.get("locations"));
  const millpond = locations.entries.find((l) => l.id === "old_millpond");
  millpond.supplies.push({ category: "staples", amount: 2 });
  after.set("locations", locations);
  const afterIndex = buildInverseIndex(schemas, after);
  check("staples leaves the unsupplied list once a location supplies it", !unsuppliedCategories(afterIndex, schemas).includes("staples"));
}

// --- orphansFrom: deleting barrow_rows (named in run.rumor_deck, per the
// plan's own worked example) should surface at least that referrer.
{
  const before = tables;
  const beforeIndex = buildInverseIndex(schemas, before);
  const after = new Map(before);
  const locations = structuredClone(before.get("locations"));
  locations.entries = locations.entries.filter((l) => l.id !== "barrow_rows");
  after.set("locations", locations);

  const orphans = orphansFrom(schemas, beforeIndex, before, after);
  check(
    "deleting barrow_rows surfaces run as a referrer",
    orphans.some((line) => line.includes("barrow_rows") && line.includes("run")),
  );
}

// --- referrerSummary / idRowsField: plain sanity against real data.
{
  const index = buildInverseIndex(schemas, tables);
  check("referrerSummary is empty for an id nothing points at", referrerSummary(index, "no-such-id") === "");
  check("referrerSummary names locations for the meat category", referrerSummary(index, "meat").includes("locations"));
  check("idRowsField finds locations.entries", idRowsField(schemas.get("locations")) === "entries");
  check("idRowsField finds prices.goods", idRowsField(schemas.get("prices")) === "goods");
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
