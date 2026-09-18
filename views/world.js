import { spliceScalar, spliceAddRow, spliceInsertIntoEmptyArray, verifySplice } from "../splice.js";

// The World grid (plans/authoring-tool-task8.md Task 8.2): locations as
// rows, ingredient categories as columns. Cell content and the row's rarity
// bar are read from `ctx.tables` (already-parsed JSON); an edit re-parses
// `ctx.edited`'s raw text, splices it, and re-renders only this view — the
// shell does not re-render on `onEdit` (see 8.1's raw-tab pattern).

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function build(ctx) {
  const categories = ctx.schemas.get("ingredients").fields.entries.item.fields.category.values;
  const rarityOrder = ctx.schemas.get("locations").fields.rarity_curves.item.key.values;

  const root = document.createElement("div");
  root.className = "world-view";

  function commit(mutate, splice) {
    const text = ctx.edited.get("locations");
    const intended = deepClone(JSON.parse(text));
    mutate(intended);
    const newText = splice(text);
    const verdict = verifySplice(newText, intended);
    if (!verdict.ok) throw new Error(`World view: ${verdict.reason}`);
    ctx.onEdit("locations", newText);
    rerender();
  }

  // Replaces `anchor` with a number input; Enter/blur commits via `onCommit`
  // (skipped if the value didn't change or doesn't parse), Escape cancels.
  // The `done` guard exists because removing a focused input from the DOM
  // fires a native blur, which would otherwise re-run whichever branch ran
  // first a second time.
  function editInline(anchor, initialValue, onCommit) {
    const input = document.createElement("input");
    input.type = "number";
    input.value = initialValue;
    anchor.replaceWith(input);
    input.focus();
    input.select();

    let done = false;
    function finish(shouldCommit) {
      if (done) return;
      done = true;
      if (shouldCommit) {
        const value = parseInt(input.value, 10);
        if (Number.isInteger(value) && value >= 0 && value !== initialValue) onCommit(value);
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

  function buildBar(curve) {
    const bar = document.createElement("div");
    bar.className = "bar";
    const total = rarityOrder.reduce((sum, rarity) => sum + (curve[rarity] || 0), 0) || 1;
    for (const rarity of rarityOrder) {
      const weight = curve[rarity];
      if (!weight) continue;
      const segment = document.createElement("span");
      segment.className = `bar-segment bar-${rarity}`;
      segment.style.width = `${(weight / total) * 100}%`;
      segment.title = `${rarity}: ${weight}`;
      bar.appendChild(segment);
    }
    return bar;
  }

  function buildLocationHeader(location, curves) {
    const th = document.createElement("th");
    th.className = "location-header";

    const name = document.createElement("div");
    name.className = "location-name";
    name.textContent = location.name;
    th.appendChild(name);

    const distance = document.createElement("div");
    distance.className = "distance";
    distance.textContent = location.distance;
    th.appendChild(distance);

    th.appendChild(buildBar(curves[location.distance] || {}));
    return th;
  }

  function buildAmountButton(locationIndex, supplyIndex, amount) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cell-amount";
    button.textContent = String(amount);
    button.addEventListener("click", () => {
      editInline(button, amount, (value) => commit(
        (intended) => { intended.entries[locationIndex].supplies[supplyIndex].amount = value; },
        (text) => spliceScalar(text, ["entries", locationIndex, "supplies", supplyIndex, "amount"], value),
      ));
    });
    return button;
  }

  function buildAddButton(locationIndex, category, supplies) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cell-empty";
    button.textContent = "+";
    button.addEventListener("click", () => {
      editInline(button, 0, (amount) => commit(
        (intended) => { intended.entries[locationIndex].supplies.push({ category, amount }); },
        (text) => (supplies.length === 0
          ? spliceInsertIntoEmptyArray(text, ["entries", locationIndex, "supplies"], { category, amount })
          : spliceAddRow(text, ["entries", locationIndex, "supplies"], [
              { path: ["category"], value: category },
              { path: ["amount"], value: amount },
            ])),
      ));
    });
    return button;
  }

  function buildCell(location, locationIndex, category) {
    const td = document.createElement("td");
    td.className = "cell";

    const supplies = location.supplies || [];
    const supplyIndex = supplies.findIndex((s) => s.category === category);
    td.appendChild(supplyIndex >= 0
      ? buildAmountButton(locationIndex, supplyIndex, supplies[supplyIndex].amount)
      : buildAddButton(locationIndex, category, supplies));

    const targets = (location.targets || []).filter((t) => t.category === category);
    if (targets.length > 0) {
      const tags = document.createElement("div");
      tags.className = "tags";
      for (const target of targets) {
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = `${target.label} (${target.leans})`;
        tags.appendChild(tag);
      }
      td.appendChild(tags);
    }

    return td;
  }

  function buildTable(locationsData) {
    const table = document.createElement("table");
    table.className = "world-grid";

    const headRow = document.createElement("tr");
    headRow.appendChild(document.createElement("th"));
    for (const category of categories) {
      const th = document.createElement("th");
      th.textContent = category;
      headRow.appendChild(th);
    }
    const thead = document.createElement("thead");
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    locationsData.entries.forEach((location, locationIndex) => {
      const row = document.createElement("tr");
      row.appendChild(buildLocationHeader(location, locationsData.rarity_curves));
      for (const category of categories) row.appendChild(buildCell(location, locationIndex, category));
      tbody.appendChild(row);
    });
    table.appendChild(tbody);

    return table;
  }

  function rerender() {
    root.replaceChildren(buildTable(JSON.parse(ctx.edited.get("locations"))));
  }

  rerender();
  return root;
}
