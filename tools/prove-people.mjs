// Dev-only proof for the People view (plans/authoring-tool-task8.md Task
// 8.6) — not shipped, not referenced by index.html. Run with:
// node tools/prove-people.mjs
//
// people.js builds DOM lists itself, but the join between a quirk's effects
// and an archetype's skills — skillsTouchedBy, topSkillsOf, isRelevant — is
// plain data and is checked here against the real sibling game checkout
// (../nowHiringHeroes), the same way tools/prove-board.mjs checks Task 8.5.
import { readFileSync } from "node:fs";
import { TABLE_NAMES } from "../tables.js";
import { skillsTouchedBy, topSkillsOf, isRelevant } from "../views/people.js";

const GAME_REPO = new URL("../../nowHiringHeroes/", import.meta.url);

const schemas = new Map();
const tables = new Map();
for (const name of TABLE_NAMES) {
  schemas.set(name, JSON.parse(readFileSync(new URL(`data/schema/${name}.schema.json`, GAME_REPO), "utf-8")));
  tables.set(name, JSON.parse(readFileSync(new URL(`data/${name}.json`, GAME_REPO), "utf-8")));
}

const quirksSchema = schemas.get("quirks");
const archetypesData = tables.get("archetypes");
const quirksData = tables.get("quirks");

function archetype(id) {
  return archetypesData.entries.find((a) => a.id === id);
}
function quirk(id) {
  return quirksData.entries.find((q) => q.id === id);
}

let failures = 0;
function check(label, condition) {
  console.log(`${condition ? "ok" : "FAIL"} — ${label}`);
  if (!condition) failures++;
}

// poacher's own top skill is stealth (6, unique) — poachers_eye is the only
// quirk that ever names stealth, via two skill_modifier effects.
check("poachers_eye touches stealth", [...skillsTouchedBy(quirksSchema, quirk("poachers_eye"))].join() === "stealth");
check("poacher's top skill is stealth", [...topSkillsOf(archetype("poacher"))].join() === "stealth");
check("poachers_eye is relevant to poacher", isRelevant(quirksSchema, quirk("poachers_eye"), archetype("poacher")) === true);
check("poachers_eye is not relevant to zealot", isRelevant(quirksSchema, quirk("poachers_eye"), archetype("zealot")) === false);

// zealot's top skill is nerve (6, unique) — grave_born names nerve.
check("grave_born is relevant to zealot", isRelevant(quirksSchema, quirk("grave_born"), archetype("zealot")) === true);

// knows_the_roads is a demand_modifier (not skill_modifier) naming
// endurance; green_recruit's top skill is endurance (3, unique) even though
// it's the lowest-rated archetype overall.
check("knows_the_roads touches endurance", [...skillsTouchedBy(quirksSchema, quirk("knows_the_roads"))].join() === "endurance");
check("knows_the_roads is relevant to green_recruit", isRelevant(quirksSchema, quirk("knows_the_roads"), archetype("green_recruit")) === true);

// sellsword's top skill is violence — no quirk in the real table ever names
// violence, so nothing is relevant. A real, uneven result, not a bug.
check("no quirk is relevant to sellsword", quirksData.entries.every((q) => !isRelevant(quirksSchema, q, archetype("sellsword"))));

// A quirk with no skill_modifier/demand_modifier effect at all (hard_block,
// inn_hook, economic groups) never touches any skill.
check("works_alone (hard_block) touches no skill", skillsTouchedBy(quirksSchema, quirk("works_alone")).size === 0);
check("drinks_your_profit (inn_hook) touches no skill", skillsTouchedBy(quirksSchema, quirk("drinks_your_profit")).size === 0);
check("knows_their_worth (economic) touches no skill", skillsTouchedBy(quirksSchema, quirk("knows_their_worth")).size === 0);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
