// Dev-only proof for the Tuning view (plans/authoring-tool-task8.md Task
// 8.10) -- not shipped, not referenced by index.html. Run with:
// node tools/prove-tuning.mjs
//
// tuning.js builds DOM itself, but the plain-data functions behind it --
// fieldsInOrder, formatRowLabel, walkField -- are checked here against the
// real sibling game checkout (../nowHiringHeroes), the same way the other
// prove-*.mjs scripts check their view's pure functions. The acceptance
// test itself ("every scalar ... diffs as a single line on change") is
// checked directly: walk every table, splice every scalar leaf found, and
// confirm each one changes exactly one line.
import { readFileSync } from "node:fs";
import { fieldsInOrder, formatRowLabel, walkField } from "../views/tuning.js";
import { spliceScalar, verifySplice } from "../splice.js";
import { lineDiff } from "../diff.js";

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

// Collects every scalar leaf node a walkField tree contains, depth-first --
// the same nodes the view would render as an editable field.
function collectScalars(node, out = []) {
  if (!node) return out;
  if (node.kind === "scalar") {
    out.push(node);
  } else if (node.kind === "object") {
    for (const child of node.children) collectScalars(child, out);
  } else if (node.kind === "array") {
    for (const { node: itemNode } of node.items) collectScalars(itemNode, out);
  }
  return out;
}

// --- fieldsInOrder / formatRowLabel ---

const bandsSchema = loadSchema("bands");
const bandsData = JSON.parse(loadTableText("bands"));

check(
  "fieldsInOrder follows the schema's own field order, filtered to what's present",
  fieldsInOrder(bandsSchema, bandsData).join(",") ===
    "margin_multiplier,die_faces,escrow_fraction,bands,outcomes,expected_distribution",
);

check(
  "formatRowLabel substitutes {id} from the item",
  formatRowLabel("{id}", { id: "routine" }) === "routine",
);
check(
  "formatRowLabel substitutes every placeholder, in order",
  formatRowLabel("{id} — {label}", { id: "triumph", label: "Triumph" }) === "triumph — Triumph",
);

// A bands.bands row only carries min_margin/min_inclusive/min_margin_disaster_free
// selectively (the schema's own optional fields) -- fieldsInOrder must skip
// whichever ones a given row doesn't have, not render a blank.
const routineRow = bandsData.bands.find((b) => b.id === "routine");
const goodChanceRow = bandsData.bands.find((b) => b.id === "good_chance");
check(
  "a row's fields skip what it doesn't carry (routine has no min_margin_disaster_free)",
  !fieldsInOrder(bandsSchema.fields.bands.item, routineRow).includes("min_margin_disaster_free"),
);
check(
  "good_chance carries min_margin_disaster_free instead of min_margin",
  fieldsInOrder(bandsSchema.fields.bands.item, goodChanceRow).includes("min_margin_disaster_free") &&
    !fieldsInOrder(bandsSchema.fields.bands.item, goodChanceRow).includes("min_margin"),
);

// --- walkField, across all three tables ---

const attractionSchema = loadSchema("attraction");
const attractionData = JSON.parse(loadTableText("attraction"));
const runSchema = loadSchema("run");
const runData = JSON.parse(loadTableText("run"));

const bandsTree = walkField(bandsSchema, bandsData, [], null);
const attractionTree = walkField(attractionSchema, attractionData, [], null);
const runTree = walkField(runSchema, runData, [], null);

check("walkField's root node is an object with no label", bandsTree.kind === "object" && bandsTree.label === null);

const bandsScalars = collectScalars(bandsTree);
const attractionScalars = collectScalars(attractionTree);
const runScalars = collectScalars(runTree);

check("walkField finds a scalar leaf for a top-level field (bands.die_faces)", bandsScalars.some((s) => s.path.join(".") === "die_faces" && s.value === 20));

check(
  "walkField reaches into an array of objects (bands.bands[0].min_margin)",
  bandsScalars.some((s) => s.path.join(".") === "bands.0.min_margin" && s.value === 1.5),
);

check(
  "walkField reaches through a nested object into its own array (attraction.road_pass.stranger_bands[0].min_appeal)",
  attractionScalars.some((s) => s.path.join(".") === "road_pass.stranger_bands.0.min_appeal" && s.value === 12),
);

check(
  "walkField reaches into an array of bare id_ref scalars (run.rumor_deck[0])",
  runScalars.some((s) => s.path.join(".") === "rumor_deck.0" && s.value === "ashen_wood"),
);

check(
  "an id_ref array item's own render label is its index, since there is no row_label",
  runTree.children.find((c) => c.label === "rumor_deck").items[0].rowLabel === "0",
);

check(
  "an object-item array's row_label names the row instead (run.endings)",
  runTree.children.find((c) => c.label === "endings").items[0].rowLabel === "barrow_innkeeper — The Barrow Innkeeper",
);

// write_falsy fields (e.g. bands.outcomes' triumph-row min_total/max_total
// absence, expected_distribution's zero-valued face counts) are still
// *present* keys in the real data -- write_falsy only affects whether a
// future write omits a zero, never whether an existing key renders.
check(
  "a write_falsy scalar that's present in the data (expected_distribution's disaster face, 0) still renders",
  bandsScalars.some((s) => s.path.join(".") === "expected_distribution.0.faces.disaster" && s.value === 0),
);

// --- the acceptance test itself: every scalar splices as a one-line diff ---

function checkOneLineDiffs(table, text, scalars) {
  for (const { path, value } of scalars) {
    const bumped = typeof value === "number" ? value + 1
      : typeof value === "boolean" ? !value
      : `${value}__x`;
    const intended = JSON.parse(JSON.stringify(JSON.parse(text)));
    let target = intended;
    for (let i = 0; i < path.length - 1; i++) target = target[path[i]];
    target[path[path.length - 1]] = bumped;

    const spliced = spliceScalar(text, path, bumped);
    const verdict = verifySplice(spliced, intended);
    if (!verdict.ok) {
      check(`${table} ${path.join(".")} splices and reverifies`, false);
      continue;
    }
    const changed = lineDiff(text, spliced).filter((r) => r.type !== "same").length;
    check(`${table} ${path.join(".")} diffs as exactly one changed line pair`, changed === 2);
  }
}

checkOneLineDiffs("bands", loadTableText("bands"), bandsScalars);
checkOneLineDiffs("attraction", loadTableText("attraction"), attractionScalars);
checkOneLineDiffs("run", loadTableText("run"), runScalars);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
