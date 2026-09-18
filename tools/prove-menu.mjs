// Dev-only proof for the Menu view (plans/authoring-tool-task8.md Task
// 8.4) — not shipped, not referenced by index.html. Run with:
// node tools/prove-menu.mjs
//
// menu.js builds DOM chips itself, but the two booleans behind their tint —
// isSuppliable and isOnShelfAtDayOne — are plain data and are checked here
// against the real sibling game checkout (../nowHiringHeroes), the same way
// tools/prove-pantry.mjs checks Task 8.3.
import { readFileSync } from "node:fs";
import { TABLE_NAMES } from "../tables.js";
import { buildInverseIndex } from "../graph.js";
import { isSuppliable, isOnShelfAtDayOne } from "../views/menu.js";

const GAME_REPO = new URL("../../nowHiringHeroes/", import.meta.url);

const schemas = new Map();
const tables = new Map();
for (const name of TABLE_NAMES) {
  schemas.set(name, JSON.parse(readFileSync(new URL(`data/schema/${name}.schema.json`, GAME_REPO), "utf-8")));
  tables.set(name, JSON.parse(readFileSync(new URL(`data/${name}.json`, GAME_REPO), "utf-8")));
}

const index = buildInverseIndex(schemas, tables);
const innData = tables.get("inn");

let failures = 0;
function check(label, condition) {
  console.log(`${condition ? "ok" : "FAIL"} — ${label}`);
  if (!condition) failures++;
}

// staples: no location ever supplies it (World grid's empty column, Task
// 8.2's own acceptance test) but the market stocks it from day 1 (cap 24).
check("staples is not suppliable", isSuppliable(index, "staples") === false);
check("staples is on the shelf at day 1", isOnShelfAtDayOne(innData, "staples") === true);

// crops: old_millpond supplies it, and it's on the shelf from day 1.
check("crops is suppliable", isSuppliable(index, "crops") === true);
check("crops is on the shelf at day 1", isOnShelfAtDayOne(innData, "crops") === true);

// meat: locations supply it (boar, deer, bear) but the day-1 cap is 0 —
// locked until the Larder, per CLAUDE.md's Inn.caps convention.
check("meat is suppliable", isSuppliable(index, "meat") === true);
check("meat is not on the shelf at day 1 (locked until the Larder)", isOnShelfAtDayOne(innData, "meat") === false);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
