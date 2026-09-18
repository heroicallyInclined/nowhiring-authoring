// The raw-text fallback every view carries (plans/authoring-tool-task8.md
// Task 8.1): one textarea per table the view touches, editing the exact
// source text app.js will splice or ship untouched at Save — never
// re-serialized. Live JSON.parse validation surfaces under each textarea;
// invalid text stays editable, it only stops pretending the file parses.

export function isValidJSON(text) {
  if (text === undefined) return true;
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

export function buildRawTab(ctx, tableNames) {
  const container = document.createElement("div");
  container.className = "raw-tab";

  for (const name of tableNames) {
    const text = ctx.edited.get(name);
    if (text === undefined) continue;

    const details = document.createElement("details");
    details.open = true;

    const summary = document.createElement("summary");
    summary.textContent = `${name}.json — ${text.length} bytes`;
    details.appendChild(summary);

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.rows = 20;
    textarea.cols = 100;
    details.appendChild(textarea);

    const validation = document.createElement("p");
    validation.className = "validation";
    details.appendChild(validation);

    const validate = () => {
      try {
        JSON.parse(textarea.value);
        validation.textContent = "";
      } catch (error) {
        validation.textContent = `Not valid JSON: ${error.message}`;
      }
    };
    validate();

    textarea.addEventListener("input", () => {
      ctx.onEdit(name, textarea.value);
      summary.textContent = `${name}.json — ${textarea.value.length} bytes`;
      validate();
    });

    container.appendChild(details);
  }

  return container;
}
