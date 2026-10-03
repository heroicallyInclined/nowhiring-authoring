// Dev-only proof for the Words view (nowHiringHeroes plans/strings.md Task 7)
// -- not shipped, not referenced by index.html. Run with:
// node tools/prove-words.mjs
//
// words.js builds DOM itself; its placeholder functions and the acceptance
// test ("rewording one sentence gives a one-line PR") are checked here
// against the real sibling game checkout (../nowHiringHeroes).
import { readFileSync } from "node:fs";
import { placeholdersIn, placeholderWarnings } from "../views/words.js";
import { spliceScalar, verifySplice } from "../splice.js";
import { lineDiff } from "../diff.js";

const GAME_REPO = new URL("../../nowHiringHeroes/", import.meta.url);
const text = readFileSync(new URL("data/strings.json", GAME_REPO), "utf-8");
const data = JSON.parse(text);

let failures = 0;
function check(label, condition) {
  if (!condition) console.log(`FAIL — ${label}`);
  if (!condition) failures++;
}

check("placeholdersIn finds each name once", placeholdersIn("{n} of {n} and {good}").join(",") === "{n},{good}");
check("placeholdersIn ignores text with none", placeholdersIn("Sign the Deed").length === 0);
check("an unchanged sentence has no warnings", placeholderWarnings("{n} day", "{n} day").length === 0);
check("a reword keeping the placeholder has no warnings", placeholderWarnings("{n} day", "a day, {n} of them").length === 0);
check("an unknown placeholder warns", placeholderWarnings("{n} day", "{n} day {foo}").some((w) => w.startsWith("{foo}")));
check("a dropped placeholder warns", placeholderWarnings("{n} day", "a day").some((w) => w.startsWith("{n}")));

// Every key, plural siblings ("days.one") included, splices as one line.
let keys = 0;
for (const [section, entries] of Object.entries(data)) {
  for (const [key, value] of Object.entries(entries)) {
    keys++;
    const label = `${section}.${key}`;
    const reworded = `${value} (reworded)`;
    const intended = JSON.parse(text);
    intended[section][key] = reworded;
    const spliced = spliceScalar(text, [section, key], reworded);
    check(`${label} splices and reverifies`, verifySplice(spliced, intended).ok);
    const changed = lineDiff(text, spliced).filter((r) => r.type !== "same").length;
    check(`${label} diffs as exactly one changed line pair`, changed === 2);
  }
}

console.log(failures === 0 ? `All checks passed (${keys} keys).` : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
