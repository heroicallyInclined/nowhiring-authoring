// The Board (plans/authoring-tool-task8.md Task 8.5): objectives x locations,
// the contract cross-product. A cell shows the pairing's combined demand --
// the same sum sim/model/quest.gd's `base_demands()` computes, objective
// demands plus location demands, per skill -- and the objective's own
// `adds[]`, if it has any, tagged by whether this location's targets,
// named_stock or fittings name that exact good.
//
// That match is a plain id-level presence check, not `Returns.returns_nothing`
// (a floored, weighted, probabilistic yields-to-nothing check the parent plan
// reserves for Task 9's consequence panel) -- it doesn't reach into
// ingredients.json for a category, and an objective with no `adds[]` isn't
// flagged either way, since nothing was declared to check against.

function combinedDemands(skillOrder, objective, location) {
  const demands = { ...(objective.demands || {}) };
  for (const skill of Object.keys(location.demands || {})) {
    demands[skill] = (demands[skill] || 0) + location.demands[skill];
  }
  return skillOrder.filter((skill) => demands[skill] > 0).map((skill) => `${skill} ${demands[skill]}`);
}

function addMatchesLocation(add, location) {
  if (add.category === "fittings") return (location.fittings || []).some((f) => f.good === add.good);
  return (location.targets || []).some((t) => t.id === add.good)
    || (location.named_stock || []).some((n) => n.good === add.good);
}

// null: the objective declares no `adds[]`, so there's nothing to check.
// Exported alongside `combinedDemands` and `build` so tools/prove-board.mjs
// can check the same logic against the real sibling data without a DOM.
export function addsOverlap(objective, location) {
  const adds = objective.adds || [];
  if (adds.length === 0) return null;
  return adds.some((add) => addMatchesLocation(add, location));
}

export { combinedDemands };

function buildDemandChips(demands) {
  const wrap = document.createElement("div");
  wrap.className = "demand-chips";
  for (const text of demands) {
    const chip = document.createElement("span");
    chip.className = "demand-chip";
    chip.textContent = text;
    wrap.appendChild(chip);
  }
  return wrap;
}

function buildAddsTags(objective, location) {
  const adds = objective.adds || [];
  if (adds.length === 0) return null;

  const wrap = document.createElement("div");
  wrap.className = "tags";
  for (const add of adds) {
    const tag = document.createElement("span");
    tag.className = `tag ${addMatchesLocation(add, location) ? "tag-match" : "tag-no-match"}`;
    tag.textContent = `${add.good} (${add.category})`;
    wrap.appendChild(tag);
  }
  return wrap;
}

function buildCell(skillOrder, objective, location) {
  const td = document.createElement("td");
  const overlap = addsOverlap(objective, location);
  td.className = `board-cell${overlap === true ? " cell-overlap" : overlap === false ? " cell-no-overlap" : ""}`;

  td.appendChild(buildDemandChips(combinedDemands(skillOrder, objective, location)));
  const tags = buildAddsTags(objective, location);
  if (tags) td.appendChild(tags);

  return td;
}

function buildObjectiveHeader(objective) {
  const th = document.createElement("th");
  th.className = "objective-header";

  const name = document.createElement("div");
  name.className = "objective-name";
  name.textContent = objective.name;
  name.title = objective.known_for;
  th.appendChild(name);

  const weights = document.createElement("div");
  weights.className = "yield-weights";
  weights.textContent = `stock ${objective.yield_weights.stock} · fittings ${objective.yield_weights.fittings}`;
  th.appendChild(weights);

  return th;
}

function buildLocationHeader(location) {
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

  return th;
}

export function build(ctx) {
  const skillOrder = ctx.schemas.get("objectives").fields.entries.item.fields.demands.key.values;
  const objectivesData = ctx.tables.get("objectives");
  const locationsData = ctx.tables.get("locations");

  const table = document.createElement("table");
  table.className = "board-grid";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.appendChild(document.createElement("th"));
  for (const location of locationsData.entries) headRow.appendChild(buildLocationHeader(location));
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const objective of objectivesData.entries) {
    const row = document.createElement("tr");
    row.appendChild(buildObjectiveHeader(objective));
    for (const location of locationsData.entries) row.appendChild(buildCell(skillOrder, objective, location));
    tbody.appendChild(row);
  }
  table.appendChild(tbody);

  const root = document.createElement("div");
  root.className = "board-view";
  root.appendChild(table);
  return root;
}
