// Dev-only proof for the Board view (plans/authoring-tool-task8.md Task
// 8.5) -- not shipped, not referenced by index.html. Run with:
// node tools/prove-board.mjs
//
// board.js builds DOM cells itself, but the two plain-data functions behind
// them -- combinedDemands and addsOverlap -- are checked here against the
// real sibling game checkout (../nowHiringHeroes), the same way
// tools/prove-menu.mjs checks Task 8.4.
import { readFileSync } from "node:fs";
import { combinedDemands, addsOverlap } from "../views/board.js";

const GAME_REPO = new URL("../../nowHiringHeroes/", import.meta.url);

function loadTable(name) {
  return JSON.parse(readFileSync(new URL(`data/${name}.json`, GAME_REPO), "utf-8"));
}

const objectivesData = loadTable("objectives");
const locationsData = loadTable("locations");
const schema = JSON.parse(readFileSync(new URL("data/schema/objectives.schema.json", GAME_REPO), "utf-8"));
const skillOrder = schema.fields.entries.item.fields.demands.key.values;

function objective(id) {
  return objectivesData.entries.find((o) => o.id === id);
}
function location(id) {
  return locationsData.entries.find((l) => l.id === id);
}

let failures = 0;
function check(label, condition) {
  console.log(`${condition ? "ok" : "FAIL"} — ${label}`);
  if (!condition) failures++;
}

// thin_the_boar_runs demands {violence:1, endurance:1}; ashen_wood demands
// {endurance:2} -- sim/model/quest.gd's base_demands() sums per skill.
const demands = combinedDemands(skillOrder, objective("thin_the_boar_runs"), location("ashen_wood"));
check("combined demands sum per skill, in schema order", demands.join(", ") === "violence 1, endurance 3");

// run_the_errand declares no adds[] at all -- nothing to check, so every
// location reads as "not applicable" rather than "no overlap".
check("an objective with no adds[] is never flagged", addsOverlap(objective("run_the_errand"), location("old_millpond")) === null);

// retrieve_the_heirloom adds curios (fittings). Only the Barrow Rows'
// fittings line names curios; Ashen Wood's (timber, hides) doesn't.
check("adds[] overlaps a location whose fittings name the same good", addsOverlap(objective("retrieve_the_heirloom"), location("barrow_rows")) === true);
check("adds[] does not overlap a location with no matching fittings", addsOverlap(objective("retrieve_the_heirloom"), location("ashen_wood")) === false);

// raid_the_smugglers_cellar adds wine (stock). Only the Drowned Vineyard's
// named_stock names wine; the Old Millpond's (hops) doesn't.
check("adds[] overlaps a location whose named_stock names the same good", addsOverlap(objective("raid_the_smugglers_cellar"), location("drowned_vineyard")) === true);
check("adds[] does not overlap a location with no matching named_stock", addsOverlap(objective("raid_the_smugglers_cellar"), location("old_millpond")) === false);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
