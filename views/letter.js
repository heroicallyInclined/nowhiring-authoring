import { spliceScalar, verifySplice } from "../splice.js";
import { resolveVariant } from "../graph.js";

// The Letter (plans/authoring-tool-task8.md Task 8.9): `notice.segments` is
// a flat, ordered union list -- a `blank` (the "present" variant, filled
// from another table at deal time) or prose (the "absent" variant, one
// `variants[0].text` -- real data never authors more than one phrasing, so
// that's the only one rendered/edited here). Reordering is out of scope
// (Task 4 never built a segment-reorder splice); this view is read/edit only.

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Splits a segment's authored text on the schema's own `placeholders` list
// ("{days}", "{day}") so a caller can mark them without a second parser.
export function splitPlaceholders(text, placeholders) {
  if (!placeholders || placeholders.length === 0) return [{ text, isPlaceholder: false }];
  const pattern = new RegExp(`(${placeholders.map(escapeRegExp).join("|")})`, "g");
  return text.split(pattern).filter((part) => part !== "").map((part) => ({
    text: part,
    isPlaceholder: placeholders.includes(part),
  }));
}

export function textPlaceholdersOf(schema) {
  return schema.fields.segments.item.variants.absent.fields.variants.item.fields.text.placeholders || [];
}

// Groups `segments` into paragraphs (a new one wherever `starts_block` is
// true) and each paragraph into parts. `leads_with` is trailing punctuation
// for the segment *before* it, not a prefix for its own content -- it's
// pushed onto the still-open paragraph before `starts_block` is checked, so
// a segment that both leads-with a "." and opens a new paragraph (e.g.
// "terms", following the "place" blank) closes the old paragraph with that
// "." and opens the new one with its own text, never the other way round.
export function buildParagraphs(segments, segmentField) {
  const paragraphs = [];
  let current = null;

  segments.forEach((segment, index) => {
    if (segment.leads_with && current) {
      current.parts.push({ kind: "glue", glue: true, value: segment.leads_with, index });
    }
    if (!current || segment.starts_block) {
      current = { align: segment.align || "", style: segment.style || "", parts: [] };
      paragraphs.push(current);
    }
    const isBlank = resolveVariant(segmentField, segment)?.name === "present";
    current.parts.push({
      kind: isBlank ? "blank" : "text",
      glue: current.parts.length === 0,
      value: isBlank ? segment.blank : (segment.variants || [])[0]?.text || "",
      index,
    });
  });

  return paragraphs;
}

export function build(ctx) {
  const schema = ctx.schemas.get("notice");
  const segmentField = schema.fields.segments.item;
  const placeholders = textPlaceholdersOf(schema);

  const root = document.createElement("div");
  root.className = "letter-view";

  function commit(segmentIndex, value) {
    const text = ctx.edited.get("notice");
    const intended = deepClone(JSON.parse(text));
    intended.segments[segmentIndex].variants[0].text = value;
    const newText = spliceScalar(text, ["segments", segmentIndex, "variants", 0, "text"], value);
    const verdict = verifySplice(newText, intended);
    if (!verdict.ok) throw new Error(`Letter view: ${verdict.reason}`);
    ctx.onEdit("notice", newText);
    rerender();
  }

  // Mirrors world.js's editInline, for a whole-line string instead of a
  // number: click swaps the span for a text input, Enter/blur commits
  // (skipped if blank or unchanged), Escape cancels. `done` guards against
  // the native blur a removed, focused input fires on its way out.
  function editInlineText(anchor, initialValue, onCommit) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "letter-edit-input";
    input.value = initialValue;
    anchor.replaceWith(input);
    input.focus();
    input.select();

    let done = false;
    function finish(shouldCommit) {
      if (done) return;
      done = true;
      if (shouldCommit) {
        const value = input.value.trim();
        if (value !== "" && value !== initialValue) onCommit(value);
        else rerender();
      } else {
        rerender();
      }
    }
    input.addEventListener("blur", () => finish(true));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") finish(true);
      else if (event.key === "Escape") finish(false);
    });
  }

  function buildTextPart(part) {
    const span = document.createElement("span");
    span.className = "letter-text";
    span.tabIndex = 0;
    for (const token of splitPlaceholders(part.value, placeholders)) {
      if (token.isPlaceholder) {
        const mark = document.createElement("span");
        mark.className = "letter-placeholder";
        mark.textContent = token.text;
        span.appendChild(mark);
      } else {
        span.appendChild(document.createTextNode(token.text));
      }
    }
    const activate = () => editInlineText(span, part.value, (value) => commit(part.index, value));
    span.addEventListener("click", activate);
    span.addEventListener("keydown", (event) => {
      if (event.key === "Enter") activate();
    });
    return span;
  }

  function buildBlankPart(part) {
    const chip = document.createElement("span");
    chip.className = "letter-blank";
    chip.textContent = `[${part.value}]`;
    chip.title = `Filled from ${part.value} when the letter is drawn -- not authored here`;
    return chip;
  }

  function buildParagraph(paragraph) {
    const p = document.createElement("p");
    p.className = "letter-block";
    if (paragraph.align) p.classList.add(`letter-align-${paragraph.align}`);
    if (paragraph.style) p.classList.add(`letter-style-${paragraph.style}`);
    paragraph.parts.forEach((part, i) => {
      if (i > 0 && !part.glue) p.appendChild(document.createTextNode(" "));
      if (part.kind === "glue") p.appendChild(document.createTextNode(part.value));
      else if (part.kind === "blank") p.appendChild(buildBlankPart(part));
      else p.appendChild(buildTextPart(part));
    });
    return p;
  }

  function rerender() {
    const data = JSON.parse(ctx.edited.get("notice"));
    const paragraphs = buildParagraphs(data.segments, segmentField);
    root.replaceChildren(...paragraphs.map(buildParagraph));
  }

  rerender();
  return root;
}
