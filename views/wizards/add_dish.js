import { spliceAddRow, verifySplice } from "../../splice.js";
import { buildChip } from "../menu.js";
import { wizardStep, textField, selectField, continueButton } from "./shell.js";

// Add a dish (plans/authoring-tool-task10.md Task 10.5): slots by category,
// with a live read on whether the world supplies each one.
export const TABLES = ["recipes"];

// Every real recipe has 2-4 slots (roast/fry/saute/compote at 2, stew/
// chowder/pottage/preserve/mash at 3, pie/bake/tart/pudding/casserole at 4)
// — cloning is the only way this splice layer adds a whole nested `slots`
// array, so the wizard offers exactly the slot counts a sibling already
// has to clone from, rather than a size nothing in the real data can seed.
export const SLOT_COUNTS = [2, 3, 4];

function slugify(label) {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function addDishEdit(recipesText, { id, label, categories }) {
  const parsed = JSON.parse(recipesText);
  const cloneIndex = parsed.entries.findIndex((r) => r.slots.length === categories.length);
  if (cloneIndex < 0) throw new Error(`add_dish wizard: no existing recipe has ${categories.length} slots to clone`);
  const newIndex = cloneIndex + 1;

  const intended = JSON.parse(recipesText);
  const clone = JSON.parse(JSON.stringify(intended.entries[cloneIndex]));
  clone.id = id;
  clone.label = label;
  clone.slots = clone.slots.map((slot, i) => ({ ...slot, category: categories[i] }));
  intended.entries.splice(newIndex, 0, clone);

  const edits = [
    { path: ["id"], value: id },
    { path: ["label"], value: label },
    ...categories.map((category, i) => ({ path: ["slots", i, "category"], value: category })),
  ];
  const text = spliceAddRow(recipesText, ["entries"], edits, cloneIndex);
  const verdict = verifySplice(text, intended);
  if (!verdict.ok) throw new Error(`add_dish wizard: ${verdict.reason}`);
  return text;
}

function formStep() {
  return {
    render(ctx, state, next) {
      let label = state.label ?? "";
      let slotCount = state.slotCount ?? SLOT_COUNTS[0];

      const { row: labelRow } = textField("Name:", label, (value) => { label = value; });
      const { row: countRow } = selectField(
        "Number of slots:", SLOT_COUNTS.map(String), String(slotCount),
        (value) => { slotCount = parseInt(value, 10); },
      );

      const button = continueButton("Continue", () => {
        if (!label.trim()) return;
        next({ label: label.trim(), id: slugify(label), slotCount, categories: [] });
      });

      return wizardStep("Add a dish", labelRow, countRow, button);
    },
  };
}

// One step per slot, up to the largest offered slot count — a step beyond
// `state.slotCount` skips itself (runWizard's own synchronous-next support,
// Task 10.2) since `steps(ctx)` must return a fixed-length array before the
// slot count is even known.
function slotStep(slotIndex) {
  return {
    render(ctx, state, next) {
      if (slotIndex >= state.slotCount) {
        next({});
        return null;
      }

      const categories = ctx.schemas.get("ingredients").fields.entries.item.fields.category.values;
      const innData = ctx.tables.get("inn");
      let chosen = state.categories[slotIndex] ?? categories[0];

      const chips = document.createElement("div");
      chips.className = "menu-slots";
      function renderChips() {
        chips.replaceChildren();
        for (const category of categories) {
          const chip = buildChip(ctx.index, innData, category);
          chip.style.cursor = "pointer";
          if (category === chosen) chip.style.outline = "2px solid #2563eb";
          chip.addEventListener("click", () => { chosen = category; renderChips(); });
          chips.appendChild(chip);
        }
      }
      renderChips();

      const isLastSlot = slotIndex === state.slotCount - 1;
      const button = continueButton(isLastSlot ? "Continue to review" : "Continue", () => {
        const categories2 = [...state.categories];
        categories2[slotIndex] = chosen;
        if (!isLastSlot) {
          next({ categories: categories2 });
          return;
        }
        const edits = new Map([["recipes", addDishEdit(ctx.edited.get("recipes"), {
          id: state.id, label: state.label, categories: categories2,
        })]]);
        next({ categories: categories2, edits });
      });

      return wizardStep(`Add a dish — slot ${slotIndex + 1} of ${state.slotCount}`, chips, button);
    },
  };
}

export function steps(ctx) {
  const maxSlots = Math.max(...SLOT_COUNTS);
  return [formStep(), ...Array.from({ length: maxSlots }, (_, i) => slotStep(i))];
}
