import { parseTree, findNodeAtLocation } from "../../vendor/jsonc-parser/main.js";
import { spliceAddRow, spliceRemoveRow, verifySplice } from "../../splice.js";
import { exclusiveConflicts } from "../../consequences.js";
import { addToLocationSupplies } from "./add_ingredient.js";
import { wizardStep, textField, selectField, continueButton } from "./shell.js";

// Add a location (plans/authoring-tool-task10.md Task 10.4): a rung on the
// distance ladder, a cell on the goods diagonal, and a place in
// run.json's rumor_deck — the two obligations data/README.md's own prose
// states, made structurally impossible to skip.
export const TABLES = ["locations", "run"];

// old_millpond is the one location the deck-order test itself hardcodes as
// the implicit starting bound (test_the_ladder_runs_outward_in_the_rumor_decks_order
// reads its distance directly, not a generically-named "starting location")
// and the one entry with empty demands/tags/fittings — the only sibling
// whose clone needs no fittings/demands cleanup, only targets/named_stock/
// supplies, all of which the wizard's own edits already replace outright.
const CLONE_SOURCE_ID = "old_millpond";

function cloneIndexOf(locationsData) {
  return locationsData.entries.findIndex((e) => e.id === CLONE_SOURCE_ID);
}

// The locations.json half: clone old_millpond, overwrite id/name/distance/
// unlock.rumor, then clear out the clone's inherited targets and named_stock
// (both meaningless, possibly-mismatched leftovers a plain scalar edit can't
// reach) before adding the wizard's own chosen supplies line. Correction to
// the plan's own sequencing note ("10.1 is a hard prerequisite for 10.7
// only") — a clean clone needs spliceRemoveRow too, since no real location
// is a blank enough template on its own.
export function addLocationEdit(locationsText, { id, name, distance, category, amount }) {
  const parsed = JSON.parse(locationsText);
  const cloneIndex = cloneIndexOf(parsed);
  const newIndex = cloneIndex + 1;

  const intended = JSON.parse(locationsText);
  const clone = JSON.parse(JSON.stringify(intended.entries[cloneIndex]));
  clone.id = id;
  clone.name = name;
  clone.distance = distance;
  clone.unlock = { ...clone.unlock, rumor: true };
  clone.supplies = [{ category, amount }];
  clone.named_stock = [];
  clone.targets = [];
  intended.entries.splice(newIndex, 0, clone);

  let text = spliceAddRow(locationsText, ["entries"], [
    { path: ["id"], value: id },
    { path: ["name"], value: name },
    { path: ["distance"], value: distance },
    { path: ["unlock", "rumor"], value: true },
  ], cloneIndex);

  text = spliceRemoveRow(text, ["entries", newIndex, "named_stock"], 0);
  // old_millpond's targets has two entries — remove the last, then the only
  // remaining one, each a valid spliceRemoveRow case on its own.
  text = spliceRemoveRow(text, ["entries", newIndex, "targets"], 1);
  text = spliceRemoveRow(text, ["entries", newIndex, "targets"], 0);
  // old_millpond's own supplies (crops) is cleared the same way before the
  // wizard's chosen category goes in via addToLocationSupplies (reused
  // unchanged from add_ingredient.js) — otherwise the clone would keep
  // supplying crops alongside whatever the co-author actually chose.
  text = spliceRemoveRow(text, ["entries", newIndex, "supplies"], 0);
  text = addToLocationSupplies(text, newIndex, category, amount);

  const verdict = verifySplice(text, intended);
  if (!verdict.ok) throw new Error(`add_location wizard: ${verdict.reason}`);
  return text;
}

// The run.json half. rumor_deck's real formatting wraps several bare id_ref
// strings per line (never one-per-line, unlike every table Task 8's row-
// clone convention was built against) — spliceAddRow's own leading-indent
// calculation assumes a sibling starts its own line, which isn't true here,
// so cloning it would duplicate whatever else shares that sibling's line.
// A bare `"id", ` inserted directly before (or after, at the end) the target
// element sidesteps that instead, matching this array's own wrapped style
// rather than forcing the one-row-per-line convention onto a table that was
// never authored that way.
export function insertIntoRumorDeck(runText, id, insertIndex) {
  const tree = parseTree(runText);
  const arrayNode = findNodeAtLocation(tree, ["rumor_deck"]);
  const children = arrayNode.children;
  const literal = JSON.stringify(id);

  const intended = JSON.parse(runText);
  intended.rumor_deck.splice(insertIndex, 0, id);

  let text;
  if (insertIndex >= children.length) {
    const last = children[children.length - 1];
    const insertAt = last.offset + last.length;
    text = runText.slice(0, insertAt) + `, ${literal}` + runText.slice(insertAt);
  } else {
    const target = children[insertIndex];
    text = runText.slice(0, target.offset) + `${literal}, ` + runText.slice(target.offset);
  }

  const verdict = verifySplice(text, intended);
  if (!verdict.ok) throw new Error(`add_location wizard: ${verdict.reason}`);
  return text;
}

// Every rumor_deck index a new location of `distance` could slot into
// without the deck ever stepping backward
// (test_the_ladder_runs_outward_in_the_rumor_decks_order) — computed from
// the existing deck rather than left to the co-author to get right by eye.
export function validRumorDeckPositions(deadlineDays, locationsData, runData, distance) {
  const deckDeadline = (id) => deadlineDays[locationsData.entries.find((l) => l.id === id).distance];
  const startDeadline = deadlineDays[locationsData.entries.find((l) => l.id === CLONE_SOURCE_ID).distance];
  const newDeadline = deadlineDays[distance];

  const deck = runData.rumor_deck;
  const positions = [];
  for (let i = 0; i <= deck.length; i++) {
    const prev = i === 0 ? startDeadline : deckDeadline(deck[i - 1]);
    const next = i === deck.length ? Infinity : deckDeadline(deck[i]);
    if (newDeadline >= prev && newDeadline <= next) positions.push(i);
  }
  return positions;
}

function positionLabel(runData, index) {
  const deck = runData.rumor_deck;
  if (index >= deck.length) return "At the end of the deck";
  return `Before ${deck[index]}`;
}

function formStep() {
  return {
    render(ctx, state, next) {
      const deadlineDays = ctx.tables.get("locations").deadline_days;
      const rungs = Object.keys(deadlineDays);

      let name = state.name ?? "";
      let distance = state.distance ?? rungs[0];

      const { row: nameRow } = textField("Name:", name, (value) => { name = value; });
      const { row: distanceRow } = selectField("Distance:", rungs, distance, (value) => { distance = value; });

      const button = continueButton("Continue", () => {
        if (!name.trim()) return;
        const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
        next({ name: name.trim(), id, distance });
      });

      return wizardStep("Add a location — name and distance", nameRow, distanceRow, button);
    },
  };
}

function suppliesStep() {
  return {
    render(ctx, state, next) {
      const categories = ctx.schemas.get("ingredients").fields.entries.item.fields.category.values;
      const locationsData = ctx.tables.get("locations");

      let category = state.category ?? categories[0];
      let amount = 4;

      const conflictNote = document.createElement("p");
      function refreshConflict() {
        const hypothetical = JSON.parse(JSON.stringify(locationsData));
        hypothetical.entries.push({ supplies: [{ category, amount: 1 }], fittings: [], named_stock: [] });
        const conflicts = exclusiveConflicts(null, new Map([["locations", hypothetical]]));
        conflictNote.textContent = conflicts.join(" ");
        button.disabled = conflicts.length > 0;
      }

      const { row: categoryRow } = selectField("Supplies category:", categories, category, (value) => {
        category = value;
        refreshConflict();
      });
      const { row: amountRow } = textField("Amount:", String(amount), (value) => { amount = parseInt(value, 10) || 0; });

      const button = continueButton("Continue", () => next({ category, amount }));
      refreshConflict();

      return wizardStep("Add a location — what it supplies", categoryRow, amountRow, conflictNote, button);
    },
  };
}

function rumorDeckStep() {
  return {
    render(ctx, state, next) {
      const locationsData = ctx.tables.get("locations");
      const runData = ctx.tables.get("run");
      const deadlineDays = locationsData.deadline_days;

      const positions = validRumorDeckPositions(deadlineDays, locationsData, runData, state.distance);
      let position = positions[0];

      const options = positions.map(String);
      const { row: positionRow, select } = selectField(
        "Rumor deck slot:", options, String(position),
        (value) => { position = parseInt(value, 10); },
      );
      for (const option of select.options) {
        option.textContent = positionLabel(runData, parseInt(option.value, 10));
      }

      const note = document.createElement("p");
      note.textContent = positions.length === 0
        ? "No slot keeps the deck ordered outward for this distance — pick a different rung."
        : "";

      const button = continueButton("Continue to review", () => {
        if (positions.length === 0) return;
        const locationsEdit = addLocationEdit(ctx.edited.get("locations"), {
          id: state.id, name: state.name, distance: state.distance, category: state.category, amount: state.amount,
        });
        const runEdit = insertIntoRumorDeck(ctx.edited.get("run"), state.id, position);
        next({ edits: new Map([["locations", locationsEdit], ["run", runEdit]]) });
      });
      button.disabled = positions.length === 0;

      return wizardStep("Add a location — its place in the rumor deck", note, positionRow, button);
    },
  };
}

export function steps(ctx) {
  return [formStep(), suppliesStep(), rumorDeckStep()];
}
