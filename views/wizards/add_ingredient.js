import { spliceAddRow, spliceInsertIntoEmptyArray } from "../../splice.js";
import { unsuppliedCategories } from "../../consequences.js";
import { wizardStep, textField, selectField, continueButton, spliceAndVerify } from "./shell.js";

// Add an ingredient (plans/authoring-tool-task10.md Task 10.3): name,
// category, rarity, and — only when no location supplies the category — one
// of three explicit choices, so a cart-only category can never happen by
// accident the way it can through the Raw tab.
export const TABLES = ["ingredients", "locations"];

export function slugify(label) {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function lastIndexOfCategory(entries, category) {
  let index = -1;
  entries.forEach((entry, i) => { if (entry.category === category) index = i; });
  return index;
}

// The clone source decides whether the new row has a `dish_label` key, so it
// never has to be added or deleted: the last row with the same presence,
// preferring the category.
function cloneSourceIndex(entries, category, hasDishLabel) {
  let inCategory = -1;
  let anywhere = -1;
  entries.forEach((entry, i) => {
    if (("dish_label" in entry) !== hasDishLabel) return;
    anywhere = i;
    if (entry.category === category) inCategory = i;
  });
  return inCategory >= 0 ? inCategory : anywhere;
}

// The base ingredients.json edit every path below shares, inserted at the end
// of its category. Every field is overwritten, so the clone source's own
// values never reach the new row.
export function addIngredientEdit(ingredientsText, { id, label, dishLabel, category, rarity }) {
  const entries = JSON.parse(ingredientsText).entries;
  const afterIndex = lastIndexOfCategory(entries, category);
  const sourceIndex = cloneSourceIndex(entries, category, Boolean(dishLabel));
  const row = { id, label, category, rarity, icon: `res://ui/assets/icons/ingredients/${category}.png` };
  if (dishLabel) row.dish_label = dishLabel;
  const edits = Object.entries(row).map(([key, value]) => ({ path: [key], value }));
  return spliceAndVerify(
    ingredientsText,
    (intended) => { intended.entries.splice(afterIndex + 1, 0, row); },
    (text) => spliceAddRow(text, ["entries"], edits, afterIndex, sourceIndex),
  );
}

export function addToLocationSupplies(locationsText, locationIndex, category, amount) {
  const location = JSON.parse(locationsText).entries[locationIndex];
  const supplies = location.supplies || [];
  return spliceAndVerify(
    locationsText,
    (intended) => { intended.entries[locationIndex].supplies.push({ category, amount }); },
    (text) => (supplies.length === 0
      ? spliceInsertIntoEmptyArray(text, ["entries", locationIndex, "supplies"], { category, amount })
      : spliceAddRow(text, ["entries", locationIndex, "supplies"], [
          { path: ["category"], value: category },
          { path: ["amount"], value: amount },
        ])),
  );
}

export function addAsTarget(locationsText, locationIndex, id, label, category, leans) {
  const location = JSON.parse(locationsText).entries[locationIndex];
  const targets = location.targets || [];
  return spliceAndVerify(
    locationsText,
    (intended) => { intended.entries[locationIndex].targets.push({ id, label, category, leans }); },
    (text) => spliceAddRow(text, ["entries", locationIndex, "targets"], [
      { path: ["id"], value: id },
      { path: ["label"], value: label },
      { path: ["category"], value: category },
      { path: ["leans"], value: leans },
    ], targets.length - 1),
  );
}

const CART_ONLY = "Only Robert's cart brings it";

function formStep() {
  return {
    render(ctx, state, next) {
      const categories = ctx.schemas.get("ingredients").fields.entries.item.fields.category.values;
      const rarities = ctx.schemas.get("ingredients").fields.entries.item.fields.rarity.values;

      let label = state.label ?? "";
      let dishLabel = state.dishLabel ?? "";
      let category = state.category ?? categories[0];
      let rarity = state.rarity ?? rarities[0];

      const { row: labelRow } = textField("Name:", label, (value) => { label = value; });
      const { row: dishLabelRow } = textField("Name in a dish (optional):", dishLabel, (value) => { dishLabel = value; });
      const { row: categoryRow } = selectField("Category:", categories, category, (value) => { category = value; });
      const { row: rarityRow } = selectField("Rarity:", rarities, rarity, (value) => { rarity = value; });

      const button = continueButton("Continue", () => {
        if (!label.trim()) return;
        next({ label: label.trim(), dishLabel: dishLabel.trim(), id: slugify(label), category, rarity });
      });

      return wizardStep("Add an ingredient", labelRow, dishLabelRow, categoryRow, rarityRow, button);
    },
  };
}

// The one step every "add a row" wizard needs after its form: compute the
// base table edit, and — only when no location supplies the category —
// offer the three explicit choices, rather than letting a cart-only category
// happen by accident. This is one
// step (not three) so "no third step" holds for the already-suppliable case.
function finishStep() {
  return {
    render(ctx, state, next) {
      const { id, label, dishLabel, category, rarity } = state;
      const ingredientsEdit = addIngredientEdit(ctx.edited.get("ingredients"), { id, label, dishLabel, category, rarity });
      const unsupplied = unsuppliedCategories(ctx.index, ctx.schemas).includes(category);

      if (!unsupplied) {
        const note = document.createElement("p");
        note.textContent = `${category} is already reachable — nothing else to decide.`;
        const button = continueButton("Continue to review", () => {
          next({ edits: new Map([["ingredients", ingredientsEdit]]) });
        });
        return wizardStep("Add an ingredient", note, button);
      }

      const locations = ctx.tables.get("locations").entries;
      const warning = document.createElement("p");
      warning.textContent = `No location supplies ${category} — only Robert's cart can bring it. Choose how ${label} reaches the world:`;

      const container = document.createElement("div");
      let choice = "supplies";
      let locationIndex = 0;
      let amount = 1;
      let targetLabel = label;
      let leans = ctx.schemas.get("ingredients").fields.entries.item.fields.rarity.values[0];

      const targetLocations = locations
        .map((location, index) => ({ location, index }))
        .filter(({ location }) => (location.targets || []).length > 0);

      function renderChoiceBody() {
        body.replaceChildren();
        if (choice === "supplies") {
          const { row: locRow } = selectField(
            "Location:", locations.map((l) => l.id), locations[locationIndex].id,
            (value) => { locationIndex = locations.findIndex((l) => l.id === value); },
          );
          const { row: amountRow } = textField("Amount:", String(amount), (value) => { amount = parseInt(value, 10) || 0; });
          body.appendChild(locRow);
          body.appendChild(amountRow);
        } else if (choice === "target") {
          if (targetLocations.length === 0) {
            const none = document.createElement("p");
            none.textContent = "No location has any Targets to name this alongside — pick a different option.";
            body.appendChild(none);
            return;
          }
          locationIndex = targetLocations[0].index;
          const { row: locRow } = selectField(
            "Location:", targetLocations.map(({ location }) => location.id), locations[locationIndex].id,
            (value) => { locationIndex = locations.findIndex((l) => l.id === value); },
          );
          const { row: labelRow } = textField("Target label:", targetLabel, (value) => { targetLabel = value; });
          const { row: leansRow } = selectField(
            "Leans:", ctx.schemas.get("ingredients").fields.entries.item.fields.rarity.values, leans,
            (value) => { leans = value; },
          );
          body.appendChild(locRow);
          body.appendChild(labelRow);
          body.appendChild(leansRow);
        }
      }

      const { row: choiceRow } = selectField(
        "How does it reach the world?",
        ["supplies", "target", CART_ONLY],
        choice,
        (value) => { choice = value; renderChoiceBody(); },
      );

      const body = document.createElement("div");

      const button = continueButton("Continue to review", () => {
        const edits = new Map([["ingredients", ingredientsEdit]]);
        if (choice === "supplies") {
          edits.set("locations", addToLocationSupplies(ctx.edited.get("locations"), locationIndex, category, amount));
        } else if (choice === "target") {
          if (targetLocations.length === 0) return;
          edits.set("locations", addAsTarget(ctx.edited.get("locations"), locationIndex, id, targetLabel, category, leans));
        }
        next({ edits });
      });

      renderChoiceBody();
      container.appendChild(choiceRow);
      container.appendChild(body);

      return wizardStep("Add an ingredient", warning, container, button);
    },
  };
}

export function steps(ctx) {
  return [formStep(), finishStep()];
}
