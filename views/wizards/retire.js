import { spliceRemoveRow } from "../../splice.js";
import { referrersOf, resolveVariant } from "../../graph.js";
import { idRowsField } from "../../consequences.js";
import { TABLE_NAMES } from "../../tables.js";
import { wizardStep, selectField, continueButton } from "./shell.js";

// Retire anything (plans/authoring-tool-task10.md Task 10.7): deleting any
// row runs the inverse index first and shows every referrer before it can
// proceed — a delete is never silent.
export const TABLES = TABLE_NAMES;

function formatRowLabel(template, item) {
  return template.replace(/\{(\w+)\}/g, (_, key) => item?.[key] ?? "");
}

// Every table with a row array a whole id identifies — the set "Retire
// anything" can pick a row out of.
function retirableTables(schemas) {
  return TABLE_NAMES.filter((name) => idRowsField(schemas.get(name)));
}

// A concrete walk for `targetId` (mirrors graph.js's own `walk`, but records
// a real splice-ready path plus an enclosing array position, instead of a
// generic display string) — classifying each occurrence:
//  - "row": the array element *is* the id_ref/enum value (run.rumor_deck[])
//    or a *required* field on an object whose entire purpose is naming it
//    (locations.named_stock[].good) — spliceRemoveRow on the enclosing
//    array cleanly removes the reference.
//  - "field": an optional scalar on a row with other purpose too
//    (quirks.effects[].when.location) — no primitive clears one key alone
//    (Task 4's key-delete stayed deferred; 10.1 only ever built row-delete),
//    so this is reported, never auto-cascaded. Open question 2, settled.
export function locateOccurrences(schemas, tables, targetId) {
  const occurrences = [];

  // `arrayPath`/`arrayIndex` name the nearest enclosing array — the path to
  // the array itself, and the element index within it — so a "row" kind
  // occurrence always has an exact spliceRemoveRow(text, arrayPath, index)
  // to run, regardless of how many object/union layers sit between that
  // array element and the matched id_ref/enum leaf.
  function walk(data, field, path, tableName, requiredHere, arrayPath, arrayIndex) {
    if (!field || typeof field !== "object" || data === undefined) return;
    switch (field.type) {
      case "id_ref":
      case "enum":
        if ((field.type === "id_ref" || field.values_from) && data === targetId) {
          occurrences.push({
            table: tableName,
            path,
            kind: arrayPath && requiredHere ? "row" : "field",
            arrayPath,
            index: arrayIndex,
          });
        }
        return;
      case "object": {
        if (!data || typeof data !== "object" || Array.isArray(data)) return;
        for (const key of Object.keys(field.fields || {})) {
          if (key in data) {
            walk(data[key], field.fields[key], [...path, key], tableName, Boolean(field.fields[key].required), arrayPath, arrayIndex);
          }
        }
        return;
      }
      case "array": {
        if (!Array.isArray(data)) return;
        data.forEach((item, i) => walk(item, field.item || {}, [...path, i], tableName, true, path, i));
        return;
      }
      case "map": {
        if (!data || typeof data !== "object") return;
        for (const key of Object.keys(data)) {
          if (key.startsWith("_")) continue;
          // A map key can itself be an id_ref (prices.service[].feed{good}),
          // but there is no map-key-delete primitive either — always "field".
          if (field.key && key === targetId) occurrences.push({ table: tableName, path: [...path, key], kind: "field", arrayPath: null, index: null });
          walk(data[key], field.item || {}, [...path, key], tableName, false, null, null);
        }
        return;
      }
      case "union": {
        const resolved = resolveVariant(field, data);
        if (!resolved) return;
        walk(data, { type: "object", fields: resolved.fields }, path, tableName, requiredHere, arrayPath, arrayIndex);
        return;
      }
      default:
        return;
    }
  }

  for (const [tableName, schema] of schemas) {
    const data = tables.get(tableName);
    if (data === undefined || !schema) continue;
    walk(data, schema, [], tableName, false, null, null);
  }
  return occurrences;
}

// Removes the row itself, plus — when `cascade` is true — every "row"-kind
// occurrence located above, grouped by (table, enclosing array) and removed
// highest-index-first so an earlier removal never invalidates a later one's
// index. The row itself is always removed *after* every cascade, since a
// cascade never touches the retired row's own top-level array (a row never
// occurs as a "row"-kind reference to itself), so its index only needs
// recomputing once, off whatever cascades already changed.
export function retireEdit(schemas, tables, editedTexts, table, id, cascade) {
  const edits = new Map(editedTexts);

  if (cascade) {
    const groups = new Map();
    for (const occ of locateOccurrences(schemas, tables, id)) {
      if (occ.kind !== "row") continue;
      const key = `${occ.table}::${occ.arrayPath.join(".")}`;
      if (!groups.has(key)) groups.set(key, { table: occ.table, arrayPath: occ.arrayPath, indices: [] });
      groups.get(key).indices.push(occ.index);
    }
    for (const { table: t, arrayPath, indices } of groups.values()) {
      indices.sort((a, b) => b - a);
      let text = edits.get(t);
      for (const index of indices) text = spliceRemoveRow(text, arrayPath, index);
      edits.set(t, text);
    }
  }

  const field = idRowsField(schemas.get(table));
  const currentRows = JSON.parse(edits.get(table))[field];
  const rowIndex = currentRows.findIndex((r) => r.id === id);
  edits.set(table, spliceRemoveRow(edits.get(table), [field], rowIndex));

  const changed = new Map();
  for (const [t, text] of edits) if (text !== editedTexts.get(t)) changed.set(t, text);
  return changed;
}

function tableStep() {
  return {
    render(ctx, state, next) {
      const tables = retirableTables(ctx.schemas);
      let table = state.table ?? tables[0];

      const rowsFor = (t) => {
        const field = idRowsField(ctx.schemas.get(t));
        const rowLabel = ctx.schemas.get(t).fields[field].row_label || "{id}";
        return ctx.tables.get(t)[field].map((row) => ({ id: row.id, label: formatRowLabel(rowLabel, row) }));
      };

      let rows = rowsFor(table);
      let rowId = rows[0]?.id;

      const { row: tableRow, select: tableSelect } = selectField("Table:", tables, table, (value) => {
        table = value;
        rows = rowsFor(table);
        rowId = rows[0]?.id;
        renderRowOptions();
      });

      const rowPicker = document.createElement("div");
      let rowSelect;
      function renderRowOptions() {
        const { row, select } = selectField("Row:", rows.map((r) => r.id), rowId, (value) => { rowId = value; });
        rowSelect = select;
        for (const option of rowSelect.options) {
          option.textContent = rows.find((r) => r.id === option.value)?.label || option.value;
        }
        rowPicker.replaceChildren(row);
      }
      renderRowOptions();

      const button = continueButton("Continue", () => {
        if (!rowId) return;
        next({ table, id: rowId });
      });

      return wizardStep("Retire — pick a row", tableRow, rowPicker, button);
    },
  };
}

function confirmStep() {
  return {
    render(ctx, state, next) {
      const referrers = referrersOf(ctx.index, state.id);

      const heading = document.createElement("p");
      const button = continueButton("Retire", () => {
        const edits = retireEdit(ctx.schemas, ctx.tables, ctx.edited, state.table, state.id, false);
        next({ edits });
      });

      if (referrers.length === 0) {
        heading.textContent = `Nothing refers to ${state.id} — retiring it needs only a plain confirm.`;
        return wizardStep("Retire — confirm", heading, button);
      }

      heading.textContent = `${state.id} is referenced ${referrers.length === 1 ? "once" : `${referrers.length} times`}, before anything proceeds:`;

      const list = document.createElement("ul");
      for (const r of referrers) {
        const li = document.createElement("li");
        li.textContent = `${r.table} at ${r.path}`;
        list.appendChild(li);
      }

      const occurrences = locateOccurrences(ctx.schemas, ctx.tables, state.id);
      const cascadable = occurrences.filter((o) => o.kind === "row");
      const uncascadable = occurrences.filter((o) => o.kind === "field");

      const cascadeNote = document.createElement("p");
      if (cascadable.length > 0) {
        cascadeNote.textContent = `${cascadable.length} of these can be removed along with it.`;
      }
      const uncascadableNote = document.createElement("p");
      if (uncascadable.length > 0) {
        uncascadableNote.textContent = `${uncascadable.length} of these (a value inside a kept row, e.g. ${uncascadable[0].table} at ${uncascadable[0].path.join(".")}) can't be cleared automatically — edit ${uncascadable.map((o) => o.table).join(", ")} by hand afterward.`;
      }

      button.textContent = "Retire without touching referrers";

      const cascadeButton = continueButton(`Retire and also remove ${cascadable.length} referring row(s)`, () => {
        const edits = retireEdit(ctx.schemas, ctx.tables, ctx.edited, state.table, state.id, true);
        next({ edits });
      });
      cascadeButton.disabled = cascadable.length === 0;

      return wizardStep("Retire — confirm", heading, list, cascadeNote, uncascadableNote, button, cascadeButton);
    },
  };
}

export function steps(ctx) {
  return [tableStep(), confirmStep()];
}
