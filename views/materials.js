import { spliceScalar, spliceAddRow, spliceInsertIntoEmptyArray, spliceAddKey, verifySplice } from "../splice.js";
import { editInline } from "./tuning.js";

// The Materials (plans/materials.md Task 5): per material, where it comes
// from and what it is spent on. Set arithmetic only -- listed amounts and
// totals, never trips: what a trip brings home is Returns' weighted roll,
// which stays out of the browser.

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

// Exported so a node script can print the same ledger against the real
// sibling data without a DOM.
export function materialsLedger(prices, locations, objectives, amenities) {
  return prices.goods.filter((g) => g.category === "materials").map((good) => {
    const locationSources = [];
    locations.entries.forEach((location, locationIndex) => {
      (location.materials || []).forEach((row, rowIndex) => {
        if (row.good === good.id) locationSources.push({ location, locationIndex, rowIndex, amount: row.amount });
      });
    });
    const objectiveSources = [];
    objectives.entries.forEach((objective, objectiveIndex) => {
      (objective.adds || []).forEach((add, addIndex) => {
        if (add.category === "materials" && add.good === good.id) {
          objectiveSources.push({ objective, objectiveIndex, addIndex, amount: add.amount });
        }
      });
    });
    const costs = [];
    amenities.entries.forEach((amenity, amenityIndex) => {
      if (good.id in (amenity.cost || {})) costs.push({ amenity, amenityIndex, amount: amenity.cost[good.id] });
    });
    return {
      good,
      locationSources,
      objectiveSources,
      costs,
      total: costs.reduce((sum, c) => sum + c.amount, 0),
    };
  });
}

export function build(ctx) {
  const root = document.createElement("div");
  root.className = "materials-view";

  function read(table) {
    return JSON.parse(ctx.edited.get(table));
  }

  function commit(table, mutate, splice) {
    const text = ctx.edited.get(table);
    const intended = deepClone(JSON.parse(text));
    mutate(intended);
    const newText = splice(text);
    const verdict = verifySplice(newText, intended);
    if (!verdict.ok) throw new Error(`Materials view: ${verdict.reason}`);
    ctx.onEdit(table, newText);
    rerender();
  }

  function commitScalar(table, path, value) {
    commit(
      table,
      (intended) => {
        let target = intended;
        for (let i = 0; i < path.length - 1; i++) target = target[path[i]];
        target[path[path.length - 1]] = value;
      },
      (text) => spliceScalar(text, path, value),
    );
  }

  function buildValue(table, path, value, fieldType) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tuning-value";
    button.textContent = String(value);
    button.addEventListener("click", () => {
      editInline(button, value, fieldType, (newValue) => commitScalar(table, path, newValue), rerender);
    });
    return button;
  }

  function buildLine(...parts) {
    const li = document.createElement("li");
    li.className = "materials-line";
    for (const part of parts) li.append(part);
    return li;
  }

  // A <select> whose first option is the prompt; picking one swaps it for an
  // amount input, the same `+`-then-amount shape world.js uses.
  function buildPicker(prompt, options, onPick) {
    const select = document.createElement("select");
    select.className = "materials-picker";
    const placeholder = document.createElement("option");
    placeholder.textContent = prompt;
    placeholder.value = "";
    select.appendChild(placeholder);
    for (const { value, label } of options) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      select.appendChild(option);
    }
    select.disabled = options.length === 0;
    select.addEventListener("change", () => {
      const picked = Number(select.value);
      editInline(select, 0, "int", (amount) => onPick(picked, amount), rerender);
    });
    return select;
  }

  function addSource(locationIndex, good, amount) {
    const arrayPath = ["entries", locationIndex, "materials"];
    commit(
      "locations",
      (intended) => { intended.entries[locationIndex].materials.push({ good, amount }); },
      (text) => (read("locations").entries[locationIndex].materials.length === 0
        ? spliceInsertIntoEmptyArray(text, arrayPath, { good, amount })
        : spliceAddRow(text, arrayPath, [
            { path: ["good"], value: good },
            { path: ["amount"], value: amount },
          ])),
    );
  }

  function addCost(amenityIndex, good, amount) {
    commit(
      "amenities",
      (intended) => { intended.entries[amenityIndex].cost[good] = amount; },
      (text) => spliceAddKey(text, ["entries", amenityIndex, "cost"], good, amount),
    );
  }

  function buildWeights(objectives) {
    const section = document.createElement("section");
    section.className = "materials-weights";
    const heading = document.createElement("h3");
    heading.textContent = "Yield weight — materials";
    section.appendChild(heading);
    const list = document.createElement("ul");
    objectives.entries.forEach((objective, objectiveIndex) => {
      const weight = objective.yield_weights?.materials;
      if (weight === undefined) return;
      list.appendChild(buildLine(
        `${objective.name} `,
        buildValue("objectives", ["entries", objectiveIndex, "yield_weights", "materials"], weight, "number"),
      ));
    });
    section.appendChild(list);
    return section;
  }

  function buildMaterial(entry, locations, amenities) {
    const { good, locationSources, objectiveSources, costs, total } = entry;
    const block = document.createElement("section");
    block.className = "materials-block";

    const heading = document.createElement("h3");
    heading.textContent = `${good.label} `;
    const idTag = document.createElement("span");
    idTag.className = "tag";
    idTag.textContent = good.id;
    heading.appendChild(idTag);
    block.appendChild(heading);

    const from = document.createElement("h4");
    from.textContent = "Comes from";
    block.appendChild(from);
    const fromList = document.createElement("ul");
    for (const { location, locationIndex, rowIndex, amount } of locationSources) {
      fromList.appendChild(buildLine(
        `${location.name} (${location.distance}) `,
        buildValue("locations", ["entries", locationIndex, "materials", rowIndex, "amount"], amount, "int"),
      ));
    }
    for (const { objective, objectiveIndex, addIndex, amount } of objectiveSources) {
      fromList.appendChild(buildLine(
        `${objective.name}, wherever it is sent `,
        buildValue("objectives", ["entries", objectiveIndex, "adds", addIndex, "amount"], amount, "int"),
      ));
    }
    block.appendChild(fromList);
    const supplied = new Set(locationSources.map((s) => s.locationIndex));
    block.appendChild(buildPicker(
      "+ source",
      locations.entries
        .map((location, index) => ({ value: index, label: location.name }))
        .filter(({ value }) => !supplied.has(value)),
      (locationIndex, amount) => addSource(locationIndex, good.id, amount),
    ));

    const spent = document.createElement("h4");
    spent.textContent = `Spent on — ${total} across the tree`;
    block.appendChild(spent);
    const spentList = document.createElement("ul");
    for (const { amenity, amenityIndex, amount } of costs) {
      spentList.appendChild(buildLine(
        `${amenity.name} `,
        buildValue("amenities", ["entries", amenityIndex, "cost", good.id], amount, "int"),
      ));
    }
    block.appendChild(spentList);
    const charged = new Set(costs.map((c) => c.amenityIndex));
    block.appendChild(buildPicker(
      "+ cost",
      amenities.entries
        .map((amenity, index) => ({ value: index, label: amenity.name }))
        .filter(({ value }) => !charged.has(value)),
      (amenityIndex, amount) => addCost(amenityIndex, good.id, amount),
    ));

    const warnings = [];
    if (locationSources.length === 0 && objectiveSources.length === 0) {
      warnings.push(`Nothing brings ${good.label} home — every amenity costing it is unbuildable.`);
    }
    if (costs.length === 0) warnings.push(`Nothing is built with ${good.label}.`);
    for (const text of warnings) {
      const p = document.createElement("p");
      p.className = "validation";
      p.textContent = text;
      block.appendChild(p);
    }

    return block;
  }

  function rerender() {
    const prices = read("prices");
    const locations = read("locations");
    const objectives = read("objectives");
    const amenities = read("amenities");
    const ledger = materialsLedger(prices, locations, objectives, amenities);
    root.replaceChildren(
      buildWeights(objectives),
      ...ledger.map((entry) => buildMaterial(entry, locations, amenities)),
    );
  }

  rerender();
  return root;
}
