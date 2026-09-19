import { spliceAddRow, spliceInsertIntoEmptyArray } from "../../splice.js";
import { deadCategories } from "../../consequences.js";
import { wizardStep, textField, selectField, continueButton, spliceAndVerify } from "./shell.js";

// Add an ingredient (plans/authoring-tool-task10.md Task 10.3): name,
// category, rarity, and — only when the category would otherwise stay
// unreachable — one of three explicit ways to make it reachable, so a dead
// category can never happen by accident the way it can through the Raw tab.
export const TABLES = ["ingredients", "locations", "prices"];

export function slugify(label) {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function lastIndexOfCategory(entries, category) {
  let index = -1;
  entries.forEach((entry, i) => { if (entry.category === category) index = i; });
  return index;
}

// The base ingredients.json edit every path below shares — clone the last
// ingredient already in the same category (8.2's row-clone convention).
export function addIngredientEdit(ingredientsText, { id, label, category, rarity }) {
  const entries = JSON.parse(ingredientsText).entries;
  const afterIndex = lastIndexOfCategory(entries, category);
  return spliceAndVerify(
    ingredientsText,
    (intended) => { intended.entries.splice(afterIndex + 1, 0, { id, label, category, rarity }); },
    (text) => spliceAddRow(
      text,
      ["entries"],
      [{ path: ["id"], value: id }, { path: ["label"], value: label }, { path: ["rarity"], value: rarity }],
      afterIndex,
    ),
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

export function addToBuyOnly(pricesText, good, price) {
  const buy = JSON.parse(pricesText).buy;
  return spliceAndVerify(
    pricesText,
    (intended) => { intended.buy.push({ good, price }); },
    (text) => spliceAddRow(text, ["buy"], [
      { path: ["good"], value: good },
      { path: ["price"], value: price },
    ], buy.length - 1),
  );
}

function formStep() {
  return {
    render(ctx, state, next) {
      const categories = ctx.schemas.get("ingredients").fields.entries.item.fields.category.values;
      const rarities = ctx.schemas.get("ingredients").fields.entries.item.fields.rarity.values;

      let label = state.label ?? "";
      let category = state.category ?? categories[0];
      let rarity = state.rarity ?? rarities[0];

      const { row: labelRow } = textField("Name:", label, (value) => { label = value; });
      const { row: categoryRow } = selectField("Category:", categories, category, (value) => { category = value; });
      const { row: rarityRow } = selectField("Rarity:", rarities, rarity, (value) => { rarity = value; });

      const button = continueButton("Continue", () => {
        if (!label.trim()) return;
        next({ label: label.trim(), id: slugify(label), category, rarity });
      });

      return wizardStep("Add an ingredient", labelRow, categoryRow, rarityRow, button);
    },
  };
}

// The one step every "add a row" wizard needs after its form: compute the
// base table edit, and — only when the category is otherwise unreachable —
// offer the three explicit ways plans/authoring-tool-task10.md names to fix
// that, rather than letting a dead category happen by accident. This is one
// step (not three) so "no third step" holds for the already-suppliable case.
function finishStep() {
  return {
    render(ctx, state, next) {
      const { id, label, category, rarity } = state;
      const ingredientsEdit = addIngredientEdit(ctx.edited.get("ingredients"), { id, label, category, rarity });
      const dead = deadCategories(ctx.index, ctx.schemas).includes(category);

      if (!dead) {
        const note = document.createElement("p");
        note.textContent = `${category} is already reachable — nothing else to decide.`;
        const button = continueButton("Continue to review", () => {
          next({ edits: new Map([["ingredients", ingredientsEdit]]) });
        });
        return wizardStep("Add an ingredient", note, button);
      }

      const locations = ctx.tables.get("locations").entries;
      const warning = document.createElement("p");
      warning.textContent = `No location supplies ${category} — nothing added there could ever be found. Choose how ${label} reaches the world:`;

      const container = document.createElement("div");
      let choice = "supplies";
      let locationIndex = 0;
      let amount = 1;
      let targetLabel = label;
      let leans = ctx.schemas.get("ingredients").fields.entries.item.fields.rarity.values[0];
      let price = 2;

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
        } else {
          const { row: priceRow } = textField("Buy price:", String(price), (value) => { price = parseInt(value, 10) || 0; });
          body.appendChild(priceRow);
        }
      }

      const { row: choiceRow } = selectField(
        "How does it reach the world?",
        ["supplies", "target", "buy-only"],
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
        } else {
          edits.set("prices", addToBuyOnly(ctx.edited.get("prices"), id, price));
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
