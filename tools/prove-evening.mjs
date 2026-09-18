// Dev-only proof for the Evening view (plans/authoring-tool-task8.md Task
// 8.8) -- not shipped, not referenced by index.html. Run with:
// node tools/prove-evening.mjs
//
// evening.js builds DOM tables itself, but the plain-data functions behind
// them -- formatDayRange and formatPercent -- are checked here against the
// real sibling game checkout (../nowHiringHeroes), the same way
// tools/prove-inn.mjs checks Task 8.7.
import { readFileSync } from "node:fs";
import { formatDayRange, formatPercent } from "../views/evening.js";

const GAME_REPO = new URL("../../nowHiringHeroes/", import.meta.url);

function loadTable(name) {
  return JSON.parse(readFileSync(new URL(`data/${name}.json`, GAME_REPO), "utf-8"));
}

const guestScheduleData = loadTable("guest_schedule");
const interruptsData = loadTable("interrupts");

function entry(id) {
  return guestScheduleData.entries.find((e) => e.id === id);
}
function perDay(id) {
  return interruptsData.per_day.find((p) => p.id === id);
}

let failures = 0;
function check(label, condition) {
  console.log(`${condition ? "ok" : "FAIL"} — ${label}`);
  if (!condition) failures++;
}

// day_1 is a single-day entry; days_3_5 spans a range.
const day1 = entry("day_1");
check("a single-day entry reads 'Day N'", formatDayRange(day1.from_day, day1.to_day) === "Day 1");
const days35 = entry("days_3_5");
check("a multi-day entry reads 'Days N–M'", formatDayRange(days35.from_day, days35.to_day) === "Days 3–5");

// interrupts.json's "opening" per_day entry spans days 1-5.
const opening = perDay("opening");
check("interrupts.per_day entries use the same range formatting", formatDayRange(opening.from_day, opening.to_day) === "Days 1–5");

// arrival.span_fraction and defer_stays_chance are both fractions.
check("formatPercent renders a fraction as a whole-number percent", formatPercent(guestScheduleData.arrival.span_fraction) === "70%");
check("formatPercent renders interrupts.defer_stays_chance", formatPercent(interruptsData.defer_stays_chance) === "50%");

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
