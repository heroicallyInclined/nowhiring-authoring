// The Menu (plans/authoring-tool-task8.md Task 8.4): recipes with slots as
// chips, tinted by two structural facts — whether the world can ever supply
// that category (same rule as the World grid's empty-column read) and
// whether inn.json's day-1 caps let the house stock it at all. No third
// state, no probability. Read-only, like the Pantry — no edit affordance
// was asked for.

// isSuppliable moved to consequences.js (Task 9.1) — the same dead-category
// check the structural consequence panel needs — imported and re-exported
// here so tools/prove-menu.mjs's existing import keeps working unchanged.
import { isSuppliable } from "../consequences.js";
export { isSuppliable };

// `Inn.caps`' three-reading convention (CLAUDE.md's Architecture rules): -1
// uncapped, 0 a category the house cannot keep at all, n a shelf that can
// fill. Either -1 or n>0 means the category can be on the shelf at day 1.
export function isOnShelfAtDayOne(innData, category) {
  return (innData.starting.caps[category] ?? 0) !== 0;
}

function slotCategories(slot) {
  return slot.categories || [slot.category];
}

// Exported for views/wizards/add_dish.js (Task 10.5) — the same tinting the
// Menu view already renders, reused rather than re-derived for the wizard's
// own per-slot category picker.
export function buildChip(index, innData, category) {
  const chip = document.createElement("span");
  const suppliable = isSuppliable(index, category);
  const onShelf = isOnShelfAtDayOne(innData, category);
  chip.className = `menu-chip ${suppliable ? "chip-suppliable" : "chip-unsuppliable"} ${onShelf ? "chip-day1" : "chip-no-day1"}`;
  chip.textContent = category;
  chip.title = `${suppliable ? "suppliable" : "never suppliable"}, ${onShelf ? "on the shelf at day 1" : "not stocked at day 1"}`;
  return chip;
}

function buildSlot(index, innData, slot) {
  const li = document.createElement("li");
  li.className = "menu-slot";
  for (const category of slotCategories(slot)) li.appendChild(buildChip(index, innData, category));
  return li;
}

function buildRecipe(index, innData, recipe) {
  const li = document.createElement("li");
  li.className = "menu-recipe";

  const heading = document.createElement("div");
  heading.className = "menu-recipe-label";
  heading.textContent = recipe.label;
  li.appendChild(heading);

  const slots = document.createElement("ul");
  slots.className = "menu-slots";
  for (const slot of recipe.slots) slots.appendChild(buildSlot(index, innData, slot));
  li.appendChild(slots);

  return li;
}

export function build(ctx) {
  const recipesData = ctx.tables.get("recipes");
  const innData = ctx.tables.get("inn");

  const root = document.createElement("ul");
  root.className = "menu-view";
  for (const recipe of recipesData.entries) root.appendChild(buildRecipe(ctx.index, innData, recipe));
  return root;
}
