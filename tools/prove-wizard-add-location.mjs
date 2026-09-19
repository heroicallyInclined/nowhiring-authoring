// Dev-only proof for the Add a location wizard (plans/authoring-tool-task10.md
// Task 10.4) — not shipped, not referenced by index.html. Run with:
// node tools/prove-wizard-add-location.mjs
import { readFileSync } from "node:fs";
import {
  addLocationEdit, insertIntoRumorDeck, validRumorDeckPositions,
} from "../views/wizards/add_location.js";
import { exclusiveConflicts } from "../consequences.js";

const GAME_REPO = new URL("../../nowHiringHeroes/", import.meta.url);
function loadTableText(name) {
  return readFileSync(new URL(`data/${name}.json`, GAME_REPO), "utf-8");
}

let failures = 0;
function check(label, condition) {
  console.log(`${condition ? "ok" : "FAIL"} — ${label}`);
  if (!condition) failures++;
}

const locationsText = loadTableText("locations");
const runText = loadTableText("run");
const locationsData = JSON.parse(locationsText);
const runData = JSON.parse(runText);

// --- locations.json half ---
{
  const spliced = addLocationEdit(locationsText, { id: "salt_flats", name: "The Salt Flats", distance: "near", category: "spices", amount: 3 });
  const parsed = JSON.parse(spliced);
  const newEntry = parsed.entries.find((e) => e.id === "salt_flats");
  check("the new location exists at the expected index", parsed.entries[1].id === "salt_flats");
  check("it carries the chosen distance", newEntry.distance === "near");
  check("it carries the chosen supplies line", newEntry.supplies.length === 1 && newEntry.supplies[0].category === "spices" && newEntry.supplies[0].amount === 3);
  check("its named_stock is empty, not old_millpond's hops", newEntry.named_stock.length === 0);
  check("its targets is empty, not old_millpond's wheat/turnips", newEntry.targets.length === 0);
  check("its demands is still {} (inherited from old_millpond, unedited)", Object.keys(newEntry.demands).length === 0);
  check("it's marked rumor-unlocked, unlike old_millpond itself", newEntry.unlock.rumor === true);
  check("old_millpond itself is untouched", parsed.entries[0].id === "old_millpond" && parsed.entries[0].supplies.length === 1);
  check("every other location is untouched", parsed.entries.length === locationsData.entries.length + 1);
}

// --- exclusiveConflicts refuses an already-supplied category ---
{
  const hypothetical = JSON.parse(JSON.stringify(locationsData));
  hypothetical.entries.push({ supplies: [{ category: "crops", amount: 1 }], fittings: [], named_stock: [] }); // crops already old_millpond's
  const conflicts = exclusiveConflicts(null, new Map([["locations", hypothetical]]));
  check("supplying an already-exclusive category is refused by name", conflicts.some((c) => c.includes("crops") && c.includes("old_millpond")));
}
{
  const hypothetical = JSON.parse(JSON.stringify(locationsData));
  hypothetical.entries.push({ supplies: [{ category: "staples", amount: 1 }], fittings: [], named_stock: [] }); // staples is dead, no conflict
  const conflicts = exclusiveConflicts(null, new Map([["locations", hypothetical]]));
  check("supplying the dead category has no conflict", conflicts.length === 0);
}

// --- run.json half: rumor deck insertion ---
{
  // rumor_deck: ashen_wood(near=2), drowned_vineyard(far=3), weir_pools(far=3),
  // caravan_road(far=3), long_orchard(distant=5), deepwood(distant=5), barrow_rows(distant=5)
  const spliced = insertIntoRumorDeck(runText, "salt_flats", 0);
  const parsed = JSON.parse(spliced);
  check("inserting at position 0 puts it first in the deck", parsed.rumor_deck[0] === "salt_flats");
  check("nothing else in the deck moved out of order", parsed.rumor_deck.slice(1).join(",") === runData.rumor_deck.join(","));
}
{
  const spliced = insertIntoRumorDeck(runText, "salt_flats", runData.rumor_deck.length);
  const parsed = JSON.parse(spliced);
  check("inserting at the end appends after barrow_rows", parsed.rumor_deck[parsed.rumor_deck.length - 1] === "salt_flats");
}
{
  const spliced = insertIntoRumorDeck(runText, "salt_flats", 3); // mid-deck, between drowned_vineyard/weir_pools/caravan_road and long_orchard
  const parsed = JSON.parse(spliced);
  check("a mid-deck insertion lands at the requested index", parsed.rumor_deck[3] === "salt_flats");
}

// --- validRumorDeckPositions keeps the deck non-decreasing ---
{
  const deadlineDays = locationsData.deadline_days;
  const nearPositions = validRumorDeckPositions(deadlineDays, locationsData, runData, "near");
  // near=2: valid anywhere before the first far/distant entry, i.e. only position 0
  // (ashen_wood is already near=2, so position 1 (after it, before drowned_vineyard far=3) also keeps it non-decreasing)
  check("a 'near' location may go first", nearPositions.includes(0));
  check("a 'near' location may not go after a 'far' one starts", !nearPositions.includes(4));

  const distantPositions = validRumorDeckPositions(deadlineDays, locationsData, runData, "distant");
  check("a 'distant' location may go at the very end", distantPositions.includes(runData.rumor_deck.length));
  check("a 'distant' location may not go first (ahead of ashen_wood's near)", !distantPositions.includes(0));

  const farPositions = validRumorDeckPositions(deadlineDays, locationsData, runData, "far");
  // Verify every reported position actually keeps the real test's rule when spliced in.
  for (const pos of farPositions) {
    const spliced = JSON.parse(insertIntoRumorDeck(runText, "test_far_loc", pos));
    const locationsWithStub = JSON.parse(JSON.stringify(locationsData));
    locationsWithStub.entries.push({ id: "test_far_loc", distance: "far" });
    let previous = deadlineDays[locationsWithStub.entries.find((l) => l.id === "old_millpond").distance];
    let ok = true;
    for (const id of spliced.rumor_deck) {
      const days = deadlineDays[locationsWithStub.entries.find((l) => l.id === id).distance];
      if (days < previous) ok = false;
      previous = days;
    }
    check(`validRumorDeckPositions' position ${pos} for 'far' keeps the deck non-decreasing`, ok);
  }
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
