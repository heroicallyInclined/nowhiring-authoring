// Dev-only proof for the structural consequence panel (Task 9.1) — not
// shipped, not referenced by index.html. Run with:
// node tools/prove-consequences.mjs
//
// Checks deadCategories, exclusiveConflicts and orphansFrom against the real
// sibling game checkout (../nowHiringHeroes), the same way tools/prove-*.mjs
// already check Tasks 7 and 8. Uses structuredClone to build a `before`/
// `after` pair for each case, mirroring how app.js's structuralConsequences()
// diffs loaded.tables against edited.
import { readFileSync } from "node:fs";
import { TABLE_NAMES } from "../tables.js";
import { buildInverseIndex } from "../graph.js";
import { deadCategories, exclusiveConflicts, orphansFrom, referrerSummary, idRowsField } from "../consequences.js";

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

// --- deadCategories: staples is the real, already-established carve-out
// (Task 7/8's own acceptance test) — no location supplies it today. Adding a
// staples supply to a location should make it leave the dead list.
{
  const before = tables;
  const beforeIndex = buildInverseIndex(schemas, before);
  check("staples is dead before any location supplies it", deadCategories(beforeIndex, schemas).includes("staples"));

  const after = new Map(before);
  const locations = structuredClone(before.get("locations"));
  const millpond = locations.entries.find((l) => l.id === "old_millpond");
  millpond.supplies.push({ category: "staples", amount: 2 });
  after.set("locations", locations);
  const afterIndex = buildInverseIndex(schemas, after);
  check("staples leaves the dead list once a location supplies it", !deadCategories(afterIndex, schemas).includes("staples"));
}

// --- exclusiveConflicts: old_millpond already supplies crops; adding the
// same category to drowned_vineyard (currently []) should conflict.
{
  const before = tables;
  const after = new Map(before);
  const locations = structuredClone(before.get("locations"));
  const vineyard = locations.entries.find((l) => l.id === "drowned_vineyard");
  vineyard.supplies.push({ category: "crops", amount: 3 });
  after.set("locations", locations);

  const conflicts = exclusiveConflicts(before, after);
  check(
    "a second crops supplier is flagged by name",
    conflicts.some((line) => line.includes("crops") && line.includes("old_millpond") && line.includes("drowned_vineyard")),
  );
  check("no conflict exists before the edit", exclusiveConflicts(before, before).length === 0);
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
