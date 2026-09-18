import { resolveVariant } from "../graph.js";

// The People view (plans/authoring-tool-task8.md Task 8.6): archetypes and
// quirks read together, since a quirk's effects target a skill and an
// archetype is defined by its skill ratings. Read-only — this task's own
// Changes never asked for an edit affordance, matching the Pantry/Menu/Board
// precedent.
//
// Correction to this task's own Changes: it describes filtering by "an
// archetype's skills or tags". Checked against archetypes.schema.json (no
// tags field at all) and quirks.schema.json (an effect's `when` conditions —
// location, location_tag, objective_demands, party_size_above — describe the
// contract a hero is on, never the hero's own archetype). The only real join
// between the two tables is a `skill_modifier`/`demand_modifier` effect's
// own `skill` field, which names one of the same five skills an archetype
// rates. A plain "does this skill exist on the archetype" test would
// highlight identically for all six archetypes (every archetype rates all
// five), so relevance here is instead: a quirk is relevant to an archetype
// when one of its effects names a skill the archetype is *best* at (its top
// rating, ties included) — the reading that actually varies by archetype.
//
// `resolveVariant` (graph.js) is reused to read each effect's variant
// instead of re-deriving the union discriminator a second time.

// Exported alongside `build` so tools/prove-people.mjs can check the same
// logic against the real sibling data without a DOM.
export function skillsTouchedBy(quirksSchema, quirk) {
  const effectField = quirksSchema.fields.entries.item.fields.effects.item;
  const skills = new Set();
  for (const effect of quirk.effects) {
    const resolved = resolveVariant(effectField, effect);
    if (resolved && "skill" in resolved.fields && typeof effect.skill === "string") {
      skills.add(effect.skill);
    }
  }
  return skills;
}

export function topSkillsOf(archetype) {
  const entries = Object.entries(archetype.skills);
  const max = Math.max(...entries.map(([, value]) => value));
  return new Set(entries.filter(([, value]) => value === max).map(([skill]) => skill));
}

export function isRelevant(quirksSchema, quirk, archetype) {
  const touched = skillsTouchedBy(quirksSchema, quirk);
  for (const skill of touched) if (topSkillsOf(archetype).has(skill)) return true;
  return false;
}

function buildArchetypeRow(archetype, selectedId, onSelect) {
  const li = document.createElement("li");

  const button = document.createElement("button");
  button.type = "button";
  button.className = `people-archetype${archetype.id === selectedId ? " active" : ""}`;
  button.textContent = archetype.name;
  button.addEventListener("click", () => onSelect(archetype.id === selectedId ? null : archetype.id));
  li.appendChild(button);

  const top = topSkillsOf(archetype);
  const skills = document.createElement("div");
  skills.className = "people-skills";
  for (const [skill, value] of Object.entries(archetype.skills)) {
    const chip = document.createElement("span");
    chip.className = `skill-chip${top.has(skill) ? " skill-top" : ""}`;
    chip.textContent = `${skill} ${value}`;
    skills.appendChild(chip);
  }
  li.appendChild(skills);

  return li;
}

function buildQuirkRow(quirksSchema, quirk, selectedArchetype) {
  const li = document.createElement("li");
  const skills = [...skillsTouchedBy(quirksSchema, quirk)];
  const relevant = selectedArchetype ? isRelevant(quirksSchema, quirk, selectedArchetype) : false;
  li.className = `people-quirk${selectedArchetype ? (relevant ? " quirk-relevant" : " quirk-dimmed") : ""}`;

  const heading = document.createElement("div");
  heading.className = "people-quirk-name";
  heading.textContent = `${quirk.name} — ${quirk.group}`;
  li.appendChild(heading);

  if (skills.length > 0) {
    const tags = document.createElement("div");
    tags.className = "tags";
    for (const skill of skills) {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = skill;
      tags.appendChild(tag);
    }
    li.appendChild(tags);
  }

  return li;
}

export function build(ctx) {
  const quirksSchema = ctx.schemas.get("quirks");
  const archetypesData = ctx.tables.get("archetypes");
  const quirksData = ctx.tables.get("quirks");

  const root = document.createElement("div");
  root.className = "people-view";

  const archetypeList = document.createElement("ul");
  archetypeList.className = "people-archetype-list";

  const quirkList = document.createElement("ul");
  quirkList.className = "people-quirk-list";

  let selectedId = null;

  function rerender() {
    const selectedArchetype = archetypesData.entries.find((a) => a.id === selectedId) || null;

    archetypeList.replaceChildren(...archetypesData.entries.map((archetype) =>
      buildArchetypeRow(archetype, selectedId, (id) => { selectedId = id; rerender(); })));

    quirkList.replaceChildren(...quirksData.entries.map((quirk) =>
      buildQuirkRow(quirksSchema, quirk, selectedArchetype)));
  }

  rerender();
  root.appendChild(archetypeList);
  root.appendChild(quirkList);
  return root;
}
