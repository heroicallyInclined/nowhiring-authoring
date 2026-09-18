// Dev-only proof for the Letter view (plans/authoring-tool-task8.md Task
// 8.9) — not shipped, not referenced by index.html. Run with:
// node tools/prove-letter.mjs
//
// letter.js builds DOM paragraphs itself, but the plain-data functions
// behind them — buildParagraphs, splitPlaceholders, textPlaceholdersOf — are
// checked here against the real sibling game checkout (../nowHiringHeroes),
// the same way tools/prove-people.mjs checks Task 8.6.
import { readFileSync } from "node:fs";
import { buildParagraphs, splitPlaceholders, textPlaceholdersOf } from "../views/letter.js";

const GAME_REPO = new URL("../../nowHiringHeroes/", import.meta.url);

const noticeSchema = JSON.parse(readFileSync(new URL("data/schema/notice.schema.json", GAME_REPO), "utf-8"));
const noticeData = JSON.parse(readFileSync(new URL("data/notice.json", GAME_REPO), "utf-8"));
const segmentField = noticeSchema.fields.segments.item;

let failures = 0;
function check(label, condition) {
  console.log(`${condition ? "ok" : "FAIL"} — ${label}`);
  if (!condition) failures++;
}

const paragraphs = buildParagraphs(noticeData.segments, segmentField);

// The heading is its own one-part block.
check("heading is its own paragraph", paragraphs[0].parts.length === 1 && paragraphs[0].parts[0].value === "WANTED: HEROES FOR HIRE");
check("heading is styled head, aligned center", paragraphs[0].style === "head" && paragraphs[0].align === "center");

// "terms" both leads with "." (closing the "place" blank's paragraph) and
// starts a new block with its own text — the sharpest case in the schema.
const placeParagraph = paragraphs.find((p) => p.parts.some((part) => part.kind === "blank" && part.value === "location"));
const lastPart = placeParagraph.parts[placeParagraph.parts.length - 1];
check("the period after the location blank glues onto its own paragraph, not the next", lastPart.kind === "glue" && lastPart.value === ".");

const termsParagraph = paragraphs.find((p) => p.parts[0].value?.startsWith("Whoever takes it"));
check("terms opens its own paragraph despite leading with a glued period", termsParagraph !== undefined && termsParagraph.parts[0].glue === true);

// Blanks never carry authored text — the fill comes from another table.
const verbPart = paragraphs.flatMap((p) => p.parts).find((part) => part.kind === "blank" && part.value === "objective");
check("a blank segment renders its own `blank` name, not any text", verbPart !== undefined);

// Placeholders inside authored text ({days}, {day}) are declared once on
// the schema's own text field, not re-authored here.
const placeholders = textPlaceholdersOf(noticeSchema);
check("the schema names both real placeholders", placeholders.includes("{days}") && placeholders.includes("{day}"));

const split = splitPlaceholders("overdue if {days} pass", placeholders);
check("splitPlaceholders isolates the placeholder as its own token", split.some((t) => t.isPlaceholder && t.text === "{days}"));
check("splitPlaceholders keeps the surrounding prose intact", split.map((t) => t.text).join("") === "overdue if {days} pass");

const noPlaceholder = splitPlaceholders("gold, good coin", placeholders);
check("text with no placeholder splits into a single non-placeholder token", noPlaceholder.length === 1 && !noPlaceholder[0].isPlaceholder);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
