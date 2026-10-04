import { spliceAddRow, spliceInsertIntoEmptyArray, spliceAddKey } from "../../splice.js";
import { slugify } from "./add_ingredient.js";
import { wizardStep, textField, selectField, continueButton, spliceAndVerify } from "./shell.js";

// Add a material (plans/materials.md Task 6): declare the good, give it a
// source, charge it on amenities -- the same edits The Materials view makes.
export const TABLES = ["prices", "locations", "amenities", "ingredients"];

const NO_SOURCE = "Nothing brings it home yet";

// test_content_tables fails an ingredient id that collides with a material id.
export function idRefusal(ingredients, prices, id) {
  if (!id) return "Give it a name.";
  if (ingredients.entries.some((e) => e.id === id)) return `${id} is already an ingredient.`;
  if (prices.goods.some((g) => g.id === id)) return `${id} is already a good.`;
  return null;
}

function addGood(pricesText, id, label) {
  const goods = JSON.parse(pricesText).goods;
  let last = -1;
  goods.forEach((g, i) => { if (g.category === "materials") last = i; });
  return spliceAndVerify(
    pricesText,
    (intended) => { intended.goods.splice(last + 1, 0, { ...goods[last], id, label }); },
    (text) => spliceAddRow(text, ["goods"], [
      { path: ["id"], value: id },
      { path: ["label"], value: label },
    ], last),
  );
}

function addSource(locationsText, locationIndex, good, amount) {
  const arrayPath = ["entries", locationIndex, "materials"];
  const rows = JSON.parse(locationsText).entries[locationIndex].materials;
  return spliceAndVerify(
    locationsText,
    (intended) => { intended.entries[locationIndex].materials.push({ good, amount }); },
    (text) => (rows.length === 0
      ? spliceInsertIntoEmptyArray(text, arrayPath, { good, amount })
      : spliceAddRow(text, arrayPath, [
          { path: ["good"], value: good },
          { path: ["amount"], value: amount },
        ])),
  );
}

function addCosts(amenitiesText, good, costs) {
  return spliceAndVerify(
    amenitiesText,
    (intended) => { for (const { amenityIndex, amount } of costs) intended.entries[amenityIndex].cost[good] = amount; },
    (text) => costs.reduce(
      (acc, { amenityIndex, amount }) => spliceAddKey(acc, ["entries", amenityIndex, "cost"], good, amount),
      text,
    ),
  );
}

// `source` is `{ locationIndex, amount }` or null; `costs` is
// `[{ amenityIndex, amount }]`, possibly empty.
export function addMaterialEdits(texts, { id, label, source, costs }) {
  const edits = new Map([["prices", addGood(texts.get("prices"), id, label)]]);
  if (source) edits.set("locations", addSource(texts.get("locations"), source.locationIndex, id, source.amount));
  if (costs.length > 0) edits.set("amenities", addCosts(texts.get("amenities"), id, costs));
  return edits;
}

function nameStep() {
  return {
    render(ctx, state, next) {
      let label = state.label ?? "";
      const { row: labelRow } = textField("Name:", label, (value) => { label = value; refusal.textContent = ""; });
      const refusal = document.createElement("p");
      refusal.className = "validation";
      const button = continueButton("Continue", () => {
        const id = slugify(label);
        const reason = idRefusal(JSON.parse(ctx.edited.get("ingredients")), JSON.parse(ctx.edited.get("prices")), id);
        if (reason) { refusal.textContent = reason; return; }
        next({ label: label.trim(), id });
      });
      return wizardStep("Add a material", labelRow, refusal, button);
    },
  };
}

function sourceStep() {
  return {
    render(ctx, state, next) {
      const locations = JSON.parse(ctx.edited.get("locations")).entries;
      let choice = locations[0].id;
      let amount = 1;
      const { row: locationRow } = selectField(
        "Comes from:", [...locations.map((l) => l.id), NO_SOURCE], choice, (value) => { choice = value; },
      );
      const { row: amountRow } = textField("Amount:", String(amount), (value) => { amount = parseInt(value, 10) || 0; });
      const button = continueButton("Continue", () => {
        next({
          source: choice === NO_SOURCE
            ? null
            : { locationIndex: locations.findIndex((l) => l.id === choice), amount },
        });
      });
      return wizardStep(`Add a material — where ${state.label} comes from`, locationRow, amountRow, button);
    },
  };
}

function costStep() {
  return {
    render(ctx, state, next) {
      const amenities = JSON.parse(ctx.edited.get("amenities")).entries;
      const amounts = amenities.map(() => 0);
      const rows = amenities.map((amenity, i) =>
        textField(`${amenity.name}:`, "", (value) => { amounts[i] = parseInt(value, 10) || 0; }).row);
      const note = document.createElement("p");
      note.textContent = "Leave an amenity blank to not charge it.";
      const button = continueButton("Continue to review", () => {
        const costs = amounts
          .map((amount, amenityIndex) => ({ amenityIndex, amount }))
          .filter(({ amount }) => amount > 0);
        const warnings = costs.length === 0 ? [`Nothing is built with ${state.label}.`] : [];
        next({ edits: addMaterialEdits(ctx.edited, { ...state, costs }), warnings });
      });
      return wizardStep(`Add a material — what ${state.label} is spent on`, note, ...rows, button);
    },
  };
}

export function steps(ctx) {
  return [nameStep(), sourceStep(), costStep()];
}
