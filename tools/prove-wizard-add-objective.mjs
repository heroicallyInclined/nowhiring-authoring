// Dev-only proof for the Add an objective wizard (plans/authoring-tool-task10.md
// Task 10.6) — not shipped, not referenced by index.html. Run with:
// node tools/prove-wizard-add-objective.mjs
import { readFileSync } from "node:fs";
import { addObjectiveEdit, structurallyLooksEmpty, locationsThatLookEmpty } from "../views/wizards/add_objective.js";

const GAME_REPO = new URL("../../nowHiringHeroes/", import.meta.url);
function loadTableText(name) {
  return readFileSync(new URL(`data/${name}.json`, GAME_REPO), "utf-8");
}

let failures = 0;
function check(label, condition) {
  console.log(`${condition ? "ok" : "FAIL"} — ${label}`);
  if (!condition) failures++;
}

const objectivesText = loadTableText("objectives");
const objectivesData = JSON.parse(objectivesText);
const locationsData = JSON.parse(loadTableText("locations"));

// --- cloning a single-demand template, tuning only the amount ---
{
  const spliced = addObjectiveEdit(objectivesText, {
    id: "test_objective", name: "Test Objective", knownFor: "A test.",
    templateId: "cull_the_nest", demands: { violence: 5 }, stock: 0.75, fittings: 0.25,
    add: null, nothingToFind: undefined,
  });
  const parsed = JSON.parse(spliced);
  const added = parsed.entries.find((o) => o.id === "test_objective");
  check("the new objective exists right after its template", parsed.entries[objectivesData.entries.findIndex((o) => o.id === "cull_the_nest") + 1].id === "test_objective");
  check("it keeps the template's demand skill set", Object.keys(added.demands).join(",") === "violence");
  check("it carries the tuned demand amount", added.demands.violence === 5);
  check("it carries the tuned yield weights", added.yield_weights.stock === 0.75 && added.yield_weights.fittings === 0.25);
  check("it carries no nothing_to_find (cull_the_nest has none)", !("nothing_to_find" in added));
  check("it carries no adds (cull_the_nest has none)", !("adds" in added));
  check("every other objective is untouched", parsed.entries.length === objectivesData.entries.length + 1);
}

// --- a multi-skill template keeps every one of its skills ---
{
  const spliced = addObjectiveEdit(objectivesText, {
    id: "test_objective2", name: "Test Objective 2", knownFor: "A test.",
    templateId: "delve_the_ruin", demands: { wits: 2, nerve: 1 }, stock: 1, fittings: 1,
    add: null, nothingToFind: "Nothing left at %s.",
  });
  const added = JSON.parse(spliced).entries.find((o) => o.id === "test_objective2");
  check("it keeps both of delve_the_ruin's demand skills", added.demands.wits === 2 && added.demands.nerve === 1);
  check("it carries the tuned nothing_to_find sentence (delve_the_ruin has one)", added.nothing_to_find === "Nothing left at %s.");
}

// --- an adds-carrying template only lets good/amount change, not category ---
{
  const spliced = addObjectiveEdit(objectivesText, {
    id: "test_objective3", name: "Test Objective 3", knownFor: "A test.",
    templateId: "hunt_the_great_beast", demands: { violence: 5, nerve: 3 }, stock: 1, fittings: 1,
    add: { good: "curios", amount: 2, category: "fittings" }, nothingToFind: undefined,
  });
  const added = JSON.parse(spliced).entries.find((o) => o.id === "test_objective3");
  check("it carries the tuned adds line", added.adds[0].good === "curios" && added.adds[0].amount === 2);
  check("the adds line's category is unchanged (fittings)", added.adds[0].category === "fittings");
}

// --- the heuristic reads real content plausibly ---
{
  // escort_the_caravan: stock 1.5, fittings 0 -- weights to something at any
  // location with supplies or named_stock, nothing at a fittings-only one.
  const escort = objectivesData.entries.find((o) => o.id === "escort_the_caravan");
  const barrowRows = locationsData.entries.find((l) => l.id === "barrow_rows"); // supplies:[], named_stock:[], fittings:[silver,curios]
  check("escort_the_caravan structurally looks empty at the fittings-only Barrow Rows", structurallyLooksEmpty(escort, barrowRows));

  const oldMillpond = locationsData.entries.find((l) => l.id === "old_millpond"); // supplies non-empty
  check("escort_the_caravan doesn't look empty at a location with supplies", !structurallyLooksEmpty(escort, oldMillpond));

  const emptyAt = locationsThatLookEmpty(escort, locationsData);
  check("locationsThatLookEmpty names Barrow Rows for escort_the_caravan", emptyAt.includes("barrow_rows"));

  // map_the_far_reaches returns a rumor regardless of yields -- never looks empty anywhere.
  const mapFarReaches = objectivesData.entries.find((o) => o.id === "map_the_far_reaches");
  check("map_the_far_reaches never looks empty (returns a rumor)", locationsThatLookEmpty(mapFarReaches, locationsData).length === 0);
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
