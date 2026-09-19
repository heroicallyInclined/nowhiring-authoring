// Dev-only proof for the Retire anything wizard (plans/authoring-tool-task10.md
// Task 10.7) — not shipped, not referenced by index.html. Run with:
// node tools/prove-wizard-retire.mjs
//
// Correction to this task's own acceptance line: checked against the real
// data — every "staples" ingredient already has a referrer (prices.buy[] or
// prices.service[]), so "most staples rows" have zero referrers doesn't
// hold today. `chicken` (meat) is a real, currently zero-referrer ingredient
// used below instead, the same kind of correction Task 9's own breakdown
// made repeatedly when a plan-prose example didn't survive contact with the
// real table.
import { readFileSync } from "node:fs";
import { buildInverseIndex, referrersOf } from "../graph.js";
import { locateOccurrences, retireEdit } from "../views/wizards/retire.js";
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

const schemas = new Map(TABLE_NAMES.map((n) => [n, loadSchema(n)]));
const editedTexts = new Map(TABLE_NAMES.map((n) => [n, loadTableText(n)]));
const tables = new Map(TABLE_NAMES.map((n) => [n, JSON.parse(editedTexts.get(n))]));
const index = buildInverseIndex(schemas, tables);

// --- zero-referrer row: a plain confirm, no cascade offered ---
{
  const refs = referrersOf(index, "chicken");
  check("chicken (meat) has zero referrers today", refs.length === 0);

  const occurrences = locateOccurrences(schemas, tables, "chicken");
  check("locateOccurrences agrees — nothing to cascade", occurrences.length === 0);

  const changed = retireEdit(schemas, tables, editedTexts, "ingredients", "chicken", false);
  check("retiring it touches only ingredients.json", [...changed.keys()].join(",") === "ingredients");
  const parsed = JSON.parse(changed.get("ingredients"));
  check("chicken is gone", !parsed.entries.some((e) => e.id === "chicken"));
  check("every sibling ingredient survives", parsed.entries.length === tables.get("ingredients").entries.length - 1);
}

// --- barrow_rows: referenced by run.rumor_deck, a "row" cascade ---
{
  const refs = referrersOf(index, "barrow_rows");
  check("barrow_rows is referenced (run.rumor_deck)", refs.some((r) => r.table === "run"));

  const occurrences = locateOccurrences(schemas, tables, "barrow_rows");
  const runOccurrence = occurrences.find((o) => o.table === "run");
  check("locateOccurrences finds it in run.rumor_deck", Boolean(runOccurrence));
  check("it's classified as a cascadable row (a bare id_ref array element)", runOccurrence.kind === "row");
  check("its array path is rumor_deck", runOccurrence.arrayPath.join(".") === "rumor_deck");

  const withoutCascade = retireEdit(schemas, tables, editedTexts, "locations", "barrow_rows", false);
  check("without cascade, only locations.json changes", [...withoutCascade.keys()].join(",") === "locations");

  const withCascade = retireEdit(schemas, tables, editedTexts, "locations", "barrow_rows", true);
  check("with cascade, both locations.json and run.json change", new Set(withCascade.keys()).size === 2 && withCascade.has("locations") && withCascade.has("run"));
  const parsedRun = JSON.parse(withCascade.get("run"));
  check("barrow_rows is gone from the rumor deck", !parsedRun.rumor_deck.includes("barrow_rows"));
  check("every other deck entry survives, in order", parsedRun.rumor_deck.join(",") === JSON.parse(editedTexts.get("run")).rumor_deck.filter((id) => id !== "barrow_rows").join(","));
  const parsedLocations = JSON.parse(withCascade.get("locations"));
  check("barrow_rows is gone from locations", !parsedLocations.entries.some((e) => e.id === "barrow_rows"));
}

// --- a synthetic "field"-kind occurrence: quirks.effects[].when.location ---
// (no real quirk names a location today; this proves the classification
// itself, matching the plan's own "when it happens, settle it" framing for
// open question 2, without inventing a real quirk row in the fixture data.)
{
  const quirksWithLocation = new Map(tables);
  const quirksClone = JSON.parse(JSON.stringify(tables.get("quirks")));
  quirksClone.entries.push({
    id: "test_quirk", name: "Test Quirk", group: "conditional", phase: 1, hidden_until_known: false,
    effects: [{ type: "skill_modifier", skill: "violence", amount: 1, when: { location: "old_millpond" } }],
  });
  quirksWithLocation.set("quirks", quirksClone);

  const occurrences = locateOccurrences(schemas, quirksWithLocation, "old_millpond");
  const quirkOccurrence = occurrences.find((o) => o.table === "quirks");
  check("a quirk's when.location is located", Boolean(quirkOccurrence));
  check("it's classified as an uncascadable field (optional, not the row itself)", quirkOccurrence.kind === "field");
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
