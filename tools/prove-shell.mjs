// Dev-only proof for the view shell — not shipped, not referenced by
// index.html. Run with: node tools/prove-shell.mjs
//
// The shell itself (views/shell.js, views/raw_tab.js) builds DOM elements
// and can't run outside a browser, but everything it depends on before
// touching the DOM — schema + table loading, VIEWS' table list against the
// real data, buildInverseIndex not throwing — is plain data and is checked
// here against the real sibling game checkout (../nowHiringHeroes), the same
// way tools/prove-graph.mjs checks Task 7.
import { readFileSync } from "node:fs";
import { TABLE_NAMES } from "../tables.js";
import { buildInverseIndex } from "../graph.js";
import { VIEWS } from "../views/shell.js";

const GAME_REPO = new URL("../../nowHiringHeroes/", import.meta.url);

const schemas = new Map();
const tables = new Map();
for (const name of TABLE_NAMES) {
  schemas.set(name, JSON.parse(readFileSync(new URL(`data/schema/${name}.schema.json`, GAME_REPO), "utf-8")));
  tables.set(name, JSON.parse(readFileSync(new URL(`data/${name}.json`, GAME_REPO), "utf-8")));
}

let failures = 0;
function check(label, condition) {
  console.log(`${condition ? "ok" : "FAIL"} — ${label}`);
  if (!condition) failures++;
}

const viewedTables = new Set(VIEWS.flatMap((v) => v.tables));
check(
  "every table VIEWS names is a real table",
  [...viewedTables].every((name) => TABLE_NAMES.includes(name)),
);
check(
  "every real table is claimed by at least one view",
  TABLE_NAMES.every((name) => viewedTables.has(name)),
);

// Mirrors app.js's buildContext(): parse every table, build the index off
// the parsed maps. Proves the exact call shape app.js uses doesn't throw
// against real data, without needing a DOM to render the result.
let index;
try {
  index = buildInverseIndex(schemas, tables);
  check("buildInverseIndex runs against every real table and schema", true);
} catch (error) {
  console.log(`  threw: ${error.message}`);
  check("buildInverseIndex runs against every real table and schema", false);
}
check("the index resolved at least one edge", index && index.size > 0);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
