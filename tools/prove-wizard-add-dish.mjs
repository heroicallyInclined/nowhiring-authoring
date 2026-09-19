// Dev-only proof for the Add a dish wizard (plans/authoring-tool-task10.md
// Task 10.5) — not shipped, not referenced by index.html. Run with:
// node tools/prove-wizard-add-dish.mjs
import { readFileSync } from "node:fs";
import { addDishEdit, SLOT_COUNTS } from "../views/wizards/add_dish.js";

const GAME_REPO = new URL("../../nowHiringHeroes/", import.meta.url);
function loadTableText(name) {
  return readFileSync(new URL(`data/${name}.json`, GAME_REPO), "utf-8");
}

let failures = 0;
function check(label, condition) {
  console.log(`${condition ? "ok" : "FAIL"} — ${label}`);
  if (!condition) failures++;
}

const recipesText = loadTableText("recipes");
const recipesData = JSON.parse(recipesText);

for (const count of SLOT_COUNTS) {
  const categories = Array.from({ length: count }, (_, i) => ["meat", "crops", "fish", "spices"][i % 4]);
  const spliced = addDishEdit(recipesText, { id: "test_dish", label: "Test Dish", categories });
  const parsed = JSON.parse(spliced);
  const added = parsed.entries.find((r) => r.id === "test_dish");
  check(`a ${count}-slot dish is added with the right slot count`, added && added.slots.length === count);
  check(`a ${count}-slot dish carries the chosen categories in order`, added.slots.every((s, i) => s.category === categories[i]));
  check(`a ${count}-slot dish keeps its first slot primary, like every real recipe`, added.slots[0].primary === true);
  check(`adding a ${count}-slot dish doesn't touch any other recipe`, parsed.entries.length === recipesData.entries.length + 1);
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
