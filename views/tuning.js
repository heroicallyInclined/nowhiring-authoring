import { spliceScalar, verifySplice } from "../splice.js";

// Tuning (plans/authoring-tool-task8.md Task 8.10): `bands`, `attraction`,
// `run` as raw knobs, plainly. No cross-table logic, no bespoke layout --
// this is the schema's generic field-renderer, pointed at three tables. It
// is the first view to need one (8.2-8.9 each hand-built a layout shaped by
// its own cross-table join), so it's factored out here rather than added to
// an existing view.

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function fieldsInOrder(field, data) {
  return Object.keys(field.fields || {}).filter((key) => data && typeof data === "object" && key in data);
}

export function formatRowLabel(template, item) {
  return template.replace(/\{(\w+)\}/g, (_, key) => item?.[key] ?? "");
}

// Walks a schema field against real data into a render tree -- mirrors
// graph.js's `walk` (object/array recursion, path tracking) but collects
// every scalar leaf as a render node instead of just `id_ref`/`enum` edges,
// since every scalar -- not only the ones that reference another table --
// needs to reach this view. `map` is unhandled: none of bands/attraction/run
// use it, and this view has no other consumer to build it for.
export function walkField(field, data, path, label) {
  if (!field || typeof field !== "object") return null;
  if (field.type === "object") {
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    const keys = fieldsInOrder(field, data);
    return {
      kind: "object",
      label,
      children: keys.map((key) => walkField(field.fields[key], data[key], [...path, key], key)),
    };
  }
  if (field.type === "array") {
    if (!Array.isArray(data)) return null;
    return {
      kind: "array",
      label,
      items: data.map((item, index) => {
        const rowLabel = field.row_label ? formatRowLabel(field.row_label, item) : String(index);
        const childLabel = field.row_label ? null : rowLabel;
        return { rowLabel, node: walkField(field.item, item, [...path, index], childLabel) };
      }),
    };
  }
  return { kind: "scalar", label, path, value: data, field };
}

export function build(ctx) {
  const tableNames = ["bands", "attraction", "run"];

  const root = document.createElement("div");
  root.className = "tuning-view";

  function commit(table, path, value) {
    const text = ctx.edited.get(table);
    const intended = deepClone(JSON.parse(text));
    let target = intended;
    for (let i = 0; i < path.length - 1; i++) target = target[path[i]];
    target[path[path.length - 1]] = value;
    const newText = spliceScalar(text, path, value);
    const verdict = verifySplice(newText, intended);
    if (!verdict.ok) throw new Error(`Tuning view: ${verdict.reason}`);
    ctx.onEdit(table, newText);
    rerender();
  }

  // Click-to-edit, mirrors world.js's/letter.js's editInline: Enter/blur
  // commits (skipped if unchanged or, for int/number, unparseable), Escape
  // cancels. `done` guards the native blur a removed, focused input fires.
  function editInline(anchor, initialValue, fieldType, onCommit) {
    const input = document.createElement("input");
    input.type = fieldType === "int" || fieldType === "number" ? "number" : "text";
    if (fieldType === "number") input.step = "any";
    input.className = "tuning-edit-input";
    input.value = initialValue;
    anchor.replaceWith(input);
    input.focus();
    input.select();

    let done = false;
    function finish(shouldCommit) {
      if (done) return;
      done = true;
      if (!shouldCommit) {
        rerender();
        return;
      }
      let value = input.value;
      let valid = value.trim() !== "";
      if (fieldType === "int") {
        value = parseInt(input.value, 10);
        valid = Number.isInteger(value);
      } else if (fieldType === "number") {
        value = parseFloat(input.value);
        valid = Number.isFinite(value);
      }
      if (valid && value !== initialValue) onCommit(value);
      else rerender();
    }
    input.addEventListener("blur", () => finish(true));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") finish(true);
      else if (event.key === "Escape") finish(false);
    });
  }

  function buildScalarNode(table, node) {
    const { path, value, field } = node;

    if (field.type === "bool") {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "tuning-checkbox";
      checkbox.checked = Boolean(value);
      checkbox.addEventListener("change", () => commit(table, path, checkbox.checked));
      return checkbox;
    }

    if (field.type === "enum" && Array.isArray(field.values)) {
      const select = document.createElement("select");
      select.className = "tuning-select";
      for (const option of field.values) {
        const opt = document.createElement("option");
        opt.value = option;
        opt.textContent = option;
        opt.selected = option === value;
        select.appendChild(opt);
      }
      select.addEventListener("change", () => commit(table, path, select.value));
      return select;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "tuning-value";
    button.textContent = String(value);
    button.addEventListener("click", () => {
      editInline(button, value, field.type, (newValue) => commit(table, path, newValue));
    });
    return button;
  }

  function buildNode(table, node) {
    if (node.kind === "object") {
      const section = document.createElement("div");
      section.className = "tuning-object";
      if (node.label) {
        const heading = document.createElement("h4");
        heading.className = "tuning-object-label";
        heading.textContent = node.label;
        section.appendChild(heading);
      }
      for (const child of node.children) section.appendChild(buildNode(table, child));
      return section;
    }
    if (node.kind === "array") {
      const list = document.createElement("div");
      list.className = "tuning-array";
      if (node.label) {
        const heading = document.createElement("h4");
        heading.className = "tuning-array-label";
        heading.textContent = node.label;
        list.appendChild(heading);
      }
      for (const { rowLabel, node: itemNode } of node.items) {
        const row = document.createElement("div");
        row.className = "tuning-row";
        if (itemNode.kind === "object") {
          const rowHeading = document.createElement("div");
          rowHeading.className = "tuning-row-label";
          rowHeading.textContent = rowLabel;
          row.appendChild(rowHeading);
        }
        row.appendChild(buildNode(table, itemNode));
        list.appendChild(row);
      }
      return list;
    }

    const line = document.createElement("div");
    line.className = "tuning-field";
    const nameSpan = document.createElement("span");
    nameSpan.className = "tuning-label";
    nameSpan.textContent = node.label;
    line.appendChild(nameSpan);
    line.appendChild(buildScalarNode(table, node));
    return line;
  }

  function buildTable(table) {
    const schema = ctx.schemas.get(table);
    const data = JSON.parse(ctx.edited.get(table));
    const section = document.createElement("section");
    section.className = "tuning-table";
    const heading = document.createElement("h3");
    heading.textContent = table;
    section.appendChild(heading);
    const rootNode = walkField(schema, data, [], null);
    for (const child of rootNode.children) section.appendChild(buildNode(table, child));
    return section;
  }

  function rerender() {
    root.replaceChildren(...tableNames.map(buildTable));
  }

  rerender();
  return root;
}
