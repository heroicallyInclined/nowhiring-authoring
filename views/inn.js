// The Inn (plans/authoring-tool-task8.md Task 8.7): each amenity's cost,
// service/board effects, and structured effects, in amenities.json's own
// file order. Flat, not a tree -- checked against the schema, the data,
// sim/rules/amenities.gd and the GDD's own §6 table (this task's own
// Correction): `entries[]` carries no prerequisite field anywhere, so
// rendering a tree would draw a dependency that doesn't exist.
//
// A caps_set/caps_multiply entry is read alongside inn.json's own starting
// cap for that category -- Inn.caps' three-reading convention (CLAUDE.md's
// Architecture rules): -1 uncapped, 0 a shelf the house cannot keep at all,
// n a shelf that can fill. This never computes what the cap becomes after
// the effect applies (that's the engine's job); it only shows today's
// number next to the declared effect, the same restraint board.js takes
// with `Returns.returns_nothing`. Read-only, matching the Pantry/Menu/Board
// precedent -- this task's own Changes never asked for an edit affordance.

// Exported alongside `build` so tools/prove-inn.mjs can check the same
// logic against the real sibling data without a DOM.
export function formatCap(value) {
  if (value === -1) return "uncapped";
  if (value === 0) return "—";
  return String(value);
}

export function capsTouchedBy(effects) {
  const touched = [];
  for (const [category, value] of Object.entries(effects.caps_set || {})) {
    touched.push({ category, kind: "set", value });
  }
  for (const [category, value] of Object.entries(effects.caps_multiply || {})) {
    touched.push({ category, kind: "multiply", value });
  }
  return touched;
}

const COUNT_EFFECTS = [
  ["tables", "table"],
  ["rooms", "room"],
  ["stalls", "stall"],
  ["hearths", "hearth"],
  ["board_slots", "board slot"],
  ["signboard_bonus", "signboard bonus"],
];

function buildTag(text) {
  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = text;
  return tag;
}

function buildCostRow(cost) {
  const row = document.createElement("div");
  row.className = "inn-cost";
  for (const [good, amount] of Object.entries(cost)) row.appendChild(buildTag(`${amount} ${good}`));
  return row;
}

function buildLabeledLine(label, text) {
  const p = document.createElement("p");
  p.className = "inn-effect-line";
  const strong = document.createElement("strong");
  strong.textContent = `${label}: `;
  p.appendChild(strong);
  p.appendChild(document.createTextNode(text));
  return p;
}

function buildEffectChip(text) {
  const li = document.createElement("li");
  li.className = "inn-effect-chip";
  li.textContent = text;
  return li;
}

function buildEffectsList(innData, effects) {
  const list = document.createElement("ul");
  list.className = "inn-effects";

  for (const [key, noun] of COUNT_EFFECTS) {
    if (!effects[key]) continue;
    list.appendChild(buildEffectChip(`+${effects[key]} ${noun}`));
  }

  for (const flag of effects.flags || []) list.appendChild(buildEffectChip(flag));

  for (const { category, kind, value } of capsTouchedBy(effects)) {
    const current = formatCap(innData.starting.caps[category] ?? 0);
    list.appendChild(buildEffectChip(
      kind === "set"
        ? `sets ${category} cap to ${value} (currently ${current})`
        : `${category} cap ×${value} (currently ${current})`,
    ));
  }

  return list;
}

function buildAmenity(innData, amenity) {
  const li = document.createElement("li");
  li.className = "inn-amenity";

  const heading = document.createElement("div");
  heading.className = "inn-amenity-name";
  heading.textContent = amenity.name;
  li.appendChild(heading);

  li.appendChild(buildCostRow(amenity.cost));
  li.appendChild(buildLabeledLine("Service", amenity.service_effect));
  li.appendChild(buildLabeledLine("Board", amenity.board_effect));
  li.appendChild(buildEffectsList(innData, amenity.effects || {}));

  return li;
}

export function build(ctx) {
  const amenitiesData = ctx.tables.get("amenities");
  const innData = ctx.tables.get("inn");

  const root = document.createElement("ul");
  root.className = "inn-view";
  for (const amenity of amenitiesData.entries) root.appendChild(buildAmenity(innData, amenity));
  return root;
}
