// Dev-only proof for the splice layer — not shipped, not referenced by
// index.html. Run with: node tools/prove-splice.mjs
//
// Reads real tables from the sibling game checkout (../nowHiringHeroes) and
// runs the two cases plans/authoring-tool.md Task 4 names as its acceptance
// check: a scalar edit and a row add, each producing a minimal line diff and
// passing the round-trip guard.
import { readFileSync } from "node:fs";
import { spliceScalar, spliceAddRow, spliceInsertIntoEmptyArray, spliceRemoveRow, verifySplice } from "../splice.js";
import { lineDiff, hunks } from "../diff.js";

const GAME_REPO = new URL("../../nowHiringHeroes/", import.meta.url);

function printDiff(oldText, newText) {
  for (const row of hunks(lineDiff(oldText, newText), 0)) {
    if (row.type === "gap") console.log("  ⋮");
    else console.log(`  ${row.type === "add" ? "+" : row.type === "del" ? "-" : " "} ${row.line}`);
  }
}

function changedLineCount(oldText, newText) {
  return lineDiff(oldText, newText).filter((row) => row.type !== "same").length;
}

// A same-position value change renders as a -/+ pair in the line diff (as
// `git diff` would too) — this counts it as the one line position it is.
function changedLinePositions(oldText, newText) {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  if (a.length !== b.length) return null;
  return a.filter((line, index) => line !== b[index]).length;
}

let failures = 0;

function check(label, condition) {
  console.log(`${condition ? "ok" : "FAIL"} — ${label}`);
  if (!condition) failures++;
}

// --- Case 1: scalar edit, run.json starting_gold 50 -> 60 ---
{
  const path = new URL("data/run.json", GAME_REPO);
  const original = readFileSync(path, "utf-8");
  const intended = JSON.parse(original);
  intended.starting_gold = 60;

  const spliced = spliceScalar(original, ["starting_gold"], 60);
  const verdict = verifySplice(spliced, intended);

  console.log("\n=== scalar edit: run.json starting_gold 50 -> 60 ===");
  printDiff(original, spliced);
  check("guard passed", verdict.ok);
  if (!verdict.ok) console.log("  reason:", verdict.reason);
  check("exactly one changed line", changedLinePositions(original, spliced) === 1);
}

// --- Case 2: row add, ingredients.json new meat entry after "boar" ---
{
  const path = new URL("data/ingredients.json", GAME_REPO);
  const original = readFileSync(path, "utf-8");
  const intended = JSON.parse(original);
  const boarIndex = intended.entries.findIndex((e) => e.id === "boar");
  intended.entries.splice(boarIndex + 1, 0, {
    id: "fox",
    label: "Fox",
    category: "meat",
    rarity: "uncommon",
  });

  const spliced = spliceAddRow(
    original,
    ["entries"],
    [
      { path: ["id"], value: "fox" },
      { path: ["label"], value: "Fox" },
      { path: ["rarity"], value: "uncommon" },
    ],
    boarIndex,
  );
  const verdict = verifySplice(spliced, intended);

  console.log("\n=== row add: ingredients.json, a new meat entry after boar ===");
  printDiff(original, spliced);
  check("guard passed", verdict.ok);
  if (!verdict.ok) console.log("  reason:", verdict.reason);
  check("exactly one added line, nothing else touched", changedLineCount(original, spliced) === 1);
}

// --- Case 3: insert into empty array, locations.json drowned_vineyard's supplies [] -> one entry ---
{
  const path = new URL("data/locations.json", GAME_REPO);
  const original = readFileSync(path, "utf-8");
  const intended = JSON.parse(original);
  const locationIndex = intended.entries.findIndex((e) => e.id === "drowned_vineyard");
  intended.entries[locationIndex].supplies.push({ category: "fruits", amount: 2 });

  const spliced = spliceInsertIntoEmptyArray(
    original,
    ["entries", locationIndex, "supplies"],
    { category: "fruits", amount: 2 },
  );
  const verdict = verifySplice(spliced, intended);

  console.log("\n=== insert into empty array: locations.json drowned_vineyard's supplies ===");
  printDiff(original, spliced);
  check("guard passed", verdict.ok);
  if (!verdict.ok) console.log("  reason:", verdict.reason);
}

// --- Case 4: row delete, ingredients.json's mid-array "duck" entry, then round-trip back ---
{
  const path = new URL("data/ingredients.json", GAME_REPO);
  const original = readFileSync(path, "utf-8");
  const parsed = JSON.parse(original);
  const duckIndex = parsed.entries.findIndex((e) => e.id === "duck");
  const goatIndex = duckIndex - 1; // "goat", duck's own previous sibling — re-add clones from here

  const intended = JSON.parse(original);
  intended.entries.splice(duckIndex, 1);

  const removed = spliceRemoveRow(original, ["entries"], duckIndex);
  const verdict = verifySplice(removed, intended);

  console.log("\n=== row delete: ingredients.json, the mid-array \"duck\" entry ===");
  printDiff(original, removed);
  check("guard passed", verdict.ok);
  if (!verdict.ok) console.log("  reason:", verdict.reason);
  check("exactly one removed line, nothing else touched", changedLineCount(original, removed) === 1);

  const roundTripped = spliceAddRow(
    removed,
    ["entries"],
    [
      { path: ["id"], value: "duck" },
      { path: ["label"], value: "Duck" },
      { path: ["rarity"], value: "uncommon" },
    ],
    goatIndex,
  );
  check("remove + re-add round-trips to byte-identical text", roundTripped === original);
}

// --- Case 5: row delete, the only element of an array collapses to "[]" ---
{
  const path = new URL("data/locations.json", GAME_REPO);
  const original = readFileSync(path, "utf-8");
  const parsed = JSON.parse(original);
  const locationIndex = parsed.entries.findIndex((e) => e.id === "old_millpond");

  const intended = JSON.parse(original);
  intended.entries[locationIndex].supplies = [];

  const removed = spliceRemoveRow(original, ["entries", locationIndex, "supplies"], 0);
  const verdict = verifySplice(removed, intended);

  console.log("\n=== row delete: locations.json, old_millpond's only supplies entry ===");
  printDiff(original, removed);
  check("guard passed", verdict.ok);
  if (!verdict.ok) console.log("  reason:", verdict.reason);
  check("collapses to a bare []", /"supplies":\s*\[\]/.test(removed));
}

// --- Case 6: row delete, the last of several elements drops the trailing comma correctly ---
{
  const path = new URL("data/locations.json", GAME_REPO);
  const original = readFileSync(path, "utf-8");
  const parsed = JSON.parse(original);
  const locationIndex = parsed.entries.findIndex((e) => e.id === "ashen_wood");
  const targets = parsed.entries[locationIndex].targets;
  const lastIndex = targets.length - 1; // "bear"

  const intended = JSON.parse(original);
  intended.entries[locationIndex].targets = targets.slice(0, lastIndex);

  const removed = spliceRemoveRow(original, ["entries", locationIndex, "targets"], lastIndex);
  const verdict = verifySplice(removed, intended);

  console.log("\n=== row delete: locations.json, ashen_wood's last target (\"bear\") ===");
  printDiff(original, removed);
  check("guard passed", verdict.ok);
  if (!verdict.ok) console.log("  reason:", verdict.reason);
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
