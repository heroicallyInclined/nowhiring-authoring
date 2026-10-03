import { spliceScalar, verifySplice } from "../splice.js";
import { splitPlaceholders } from "./letter.js";

// Words (nowHiringHeroes plans/strings.md Task 7): `strings` is a map of
// sections, each a map of key -> English. The game's code fills a sentence's
// `{name}` placeholders from arguments it always passes, so the schema can't
// list them per key -- the English as loaded from main is the only record of
// which names a key's code supplies, and every warning is against that.

export function placeholdersIn(text) {
  return [...new Set(text.match(/\{\w+\}/g) || [])];
}

// `{x}` the code never passes shows on screen exactly as typed; `{x}` the
// code passes but the text dropped silently loses the value.
export function placeholderWarnings(originalText, text) {
  const before = placeholdersIn(originalText);
  const after = placeholdersIn(text);
  return [
    ...after.filter((p) => !before.includes(p)).map((p) => `${p} isn't filled in by the game — it will show as typed.`),
    ...before.filter((p) => !after.includes(p)).map((p) => `${p} is gone — the game's value for it won't show.`),
  ];
}

export function build(ctx) {
  const original = JSON.parse(ctx.original.get("strings"));

  const root = document.createElement("div");
  root.className = "words-view";

  function commit(section, key, value) {
    const text = ctx.edited.get("strings");
    const intended = JSON.parse(text);
    intended[section][key] = value;
    const newText = spliceScalar(text, [section, key], value);
    const verdict = verifySplice(newText, intended);
    if (!verdict.ok) throw new Error(`Words view: ${verdict.reason}`);
    ctx.onEdit("strings", newText);
  }

  // Mirrors letter.js's editInlineText. Only the edited row is rebuilt, so
  // the open/closed state of every section survives an edit.
  function editInline(row, section, key, initialValue) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "words-edit-input";
    input.value = initialValue;
    row.querySelector(".words-text").replaceWith(input);
    input.focus();
    input.select();

    let done = false;
    function finish(shouldCommit) {
      if (done) return;
      done = true;
      const value = input.value.trim();
      if (shouldCommit && value !== "" && value !== initialValue) {
        commit(section, key, value);
        row.replaceWith(buildRow(section, key, value));
      } else {
        row.replaceWith(buildRow(section, key, initialValue));
      }
    }
    input.addEventListener("blur", () => finish(true));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") finish(true);
      else if (event.key === "Escape") finish(false);
    });
  }

  function buildRow(section, key, value) {
    const row = document.createElement("div");
    row.className = "words-row";

    const keyLabel = document.createElement("span");
    keyLabel.className = "words-key";
    keyLabel.textContent = key;
    row.appendChild(keyLabel);

    const span = document.createElement("span");
    span.className = "words-text";
    span.tabIndex = 0;
    for (const token of splitPlaceholders(value, placeholdersIn(value))) {
      if (token.isPlaceholder) {
        const mark = document.createElement("span");
        mark.className = "letter-placeholder";
        mark.textContent = token.text;
        span.appendChild(mark);
      } else {
        span.appendChild(document.createTextNode(token.text));
      }
    }
    const activate = () => editInline(row, section, key, value);
    span.addEventListener("click", activate);
    span.addEventListener("keydown", (event) => {
      if (event.key === "Enter") activate();
    });
    row.appendChild(span);

    const originalText = original[section]?.[key] ?? value;
    const warnings = placeholderWarnings(originalText, value);
    if (warnings.length > 0) {
      const warning = document.createElement("p");
      warning.className = "validation words-warning";
      warning.textContent = warnings.join(" ");
      row.appendChild(warning);
    }
    return row;
  }

  const data = JSON.parse(ctx.edited.get("strings"));
  for (const [section, entries] of Object.entries(data)) {
    const details = document.createElement("details");
    details.className = "words-section";
    const summary = document.createElement("summary");
    summary.textContent = `${section} (${Object.keys(entries).length})`;
    details.appendChild(summary);
    for (const [key, value] of Object.entries(entries)) details.appendChild(buildRow(section, key, value));
    root.appendChild(details);
  }

  return root;
}
