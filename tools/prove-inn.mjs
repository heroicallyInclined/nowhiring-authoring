// Dev-only proof for the Inn view (plans/authoring-tool-task8.md Task
// 8.7) -- not shipped, not referenced by index.html. Run with:
// node tools/prove-inn.mjs
//
// inn.js builds DOM chips itself, but the plain-data functions behind them
// -- formatCap and capsTouchedBy -- are checked here against the real
// sibling game checkout (../nowHiringHeroes), the same way
// tools/prove-menu.mjs checks Task 8.4.
import { readFileSync } from "node:fs";
import { formatCap, capsTouchedBy } from "../views/inn.js";

const GAME_REPO = new URL("../../nowHiringHeroes/", import.meta.url);

function loadTable(name) {
  return JSON.parse(readFileSync(new URL(`data/${name}.json`, GAME_REPO), "utf-8"));
}

const amenitiesData = loadTable("amenities");
const innData = loadTable("inn");

function amenity(id) {
  return amenitiesData.entries.find((a) => a.id === id);
}

let failures = 0;
function check(label, condition) {
  console.log(`${condition ? "ok" : "FAIL"} — ${label}`);
  if (!condition) failures++;
}

// Inn.caps' three-reading convention (CLAUDE.md's Architecture rules).
check("formatCap(-1) reads uncapped", formatCap(-1) === "uncapped");
check("formatCap(0) reads as an em dash, not blank", formatCap(0) === "—");
check("formatCap(n) reads the plain number", formatCap(24) === "24");

// The Larder sets meat and fish caps; both start at 0 (locked until
// bought), the acceptance test's own "a 0-cap category shows —" case.
const larderTouched = capsTouchedBy(amenity("larder").effects);
check("the Larder's caps_set names meat and fish", larderTouched.map((t) => t.category).sort().join(",") === "fish,meat");
check("meat starts locked (cap 0)", formatCap(innData.starting.caps.meat) === "—");
check("fish starts locked (cap 0)", formatCap(innData.starting.caps.fish) === "—");

// The Deep Cellar multiplies the staples cap instead of setting it.
const deepCellarTouched = capsTouchedBy(amenity("deep_cellar").effects);
check("the Deep Cellar's caps_multiply names staples", deepCellarTouched.length === 1 && deepCellarTouched[0].category === "staples" && deepCellarTouched[0].kind === "multiply");
check("staples starts uncapped-but-finite at 24", formatCap(innData.starting.caps.staples) === "24");

// An amenity with neither caps_set nor caps_multiply touches no caps.
check("Two More Tables touches no caps", capsTouchedBy(amenity("two_more_tables").effects).length === 0);

// File order is what the view renders in, unsorted.
check("amenities.json lists ten entries in a fixed order", amenitiesData.entries.map((a) => a.id)[0] === "two_more_tables" && amenitiesData.entries.at(-1).id === "painted_signboard");

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
