// The structural half of the consequence panel (plans/authoring-tool.md Task 9,
// broken down in plans/authoring-tool-task9.md Task 9.1) — pure set arithmetic
// over the tables and graph.js's inverse index, no game logic, so it can run
// synchronously in the browser with no CI round trip. The probabilistic half
// (world_probe.gd's derived odds) is Task 9.2-9.4, fetched separately.
//
// Every export here is a pure function of (schemas, before, after) — Map<table,
// parsed JSON> pairs — so a Task 10 wizard can call the same functions against
// its own proposed edit before the user ever reaches Save.
import { referrersOf } from "./graph.js";

// The single id-bearing row array a table's schema declares at its top level
// — "entries" for most tables, but not by name; found by shape (an array of
// objects with a required string/id_ref "id" field) since prices.json names
// its own goods[] instead. Used by orphansFrom and by the review panel to
// find which rows an edit added or removed.
export function idRowsField(schema) {
  for (const [key, field] of Object.entries(schema.fields || {})) {
    if (field.type !== "array") continue;
    const idField = field.item?.fields?.id;
    if (idField && (idField.type === "string" || idField.type === "id_ref") && idField.required) {
      return key;
    }
  }
  return null;
}

// Reused by views/menu.js's chip tint (Task 8.4) — moved here rather than
// duplicated, since the dead-category check below is the same test.
export function isSuppliable(index, category) {
  return referrersOf(index, category).some((r) => r.table === "locations");
}

// Every ingredient category no location supplies — nothing added there can
// ever be found. Read off ingredients.schema.json's own category enum, never
// re-authored.
export function deadCategories(index, schemas) {
  const categoryField = schemas.get("ingredients").fields.entries.item.fields.category;
  return (categoryField.values || []).filter((category) => !isSuppliable(index, category));
}

// What points at `id`, grouped and counted by referring table — the plain-
// language clause a caller wraps into a sentence ("<id> is " + this + ".").
// Empty string when nothing refers to it.
export function referrerSummary(index, id) {
  const referrers = referrersOf(index, id);
  if (referrers.length === 0) return "";

  const byTable = new Map();
  for (const r of referrers) {
    const bucket = byTable.get(r.table) || { count: 0, targets: 0 };
    bucket.count += 1;
    if (/\.targets\[\]/.test(r.path)) bucket.targets += 1;
    byTable.set(r.table, bucket);
  }

  const parts = [];
  for (const [table, { count, targets }] of byTable) {
    if (targets > 0) parts.push(targets === 1 ? "named as a Target" : `named as a Target in ${targets} places`);
    const plain = count - targets;
    if (plain > 0) parts.push(`referenced by ${plain} ${table}${plain === 1 ? "" : " rows"}`);
  }
  return parts.join(" and ");
}

// The one check that reads test_content_tables.gd's own exclusivity rule
// (test_every_location_is_the_exclusive_source_of_its_named_goods_and_categories)
// structurally: a good or category now supplied by more than one location.
// Reads `after`'s locations.json directly — location-to-location, not a
// referrer lookup, so the inverse index isn't involved.
export function exclusiveConflicts(before, after) {
  const locations = after.get("locations");
  if (!locations) return [];

  const goodSource = new Map();
  const categorySource = new Map();
  const conflicts = [];

  for (const location of locations.entries) {
    for (const entry of [...(location.named_stock || []), ...(location.fittings || [])]) {
      const good = entry.good;
      if (goodSource.has(good)) {
        conflicts.push(`${good} would be supplied by both ${goodSource.get(good)} and ${location.id}.`);
      } else {
        goodSource.set(good, location.id);
      }
    }
    for (const entry of location.supplies || []) {
      const category = entry.category;
      if (categorySource.has(category)) {
        conflicts.push(`${category} would be supplied by both ${categorySource.get(category)} and ${location.id}.`);
      } else {
        categorySource.set(category, location.id);
      }
    }
  }

  return conflicts;
}

// The probabilistic half (Task 9.4) — pure `(beforeWorld, afterWorld) => …`
// functions over the two fetched world.json objects (tools/world_probe.gd,
// Task 9.2), never touching a schema, `ctx.index`, or the tables themselves.
// `category`'s ladder gaining or losing a rarity tier, and which locations
// (in `after`) that reaches — every location whose own `categories` map
// still names this category once the edit lands.
export function ladderChanges(before, after, category) {
  const beforeLadder = before.categories[category]?.ladder || [];
  const afterLadder = after.categories[category]?.ladder || [];
  const changed = beforeLadder.join(",") !== afterLadder.join(",");

  const locations = Object.entries(after.locations || {})
    .filter(([, location]) => category in (location.categories || {}))
    .map(([id]) => id);

  return {
    changed,
    before: beforeLadder,
    after: afterLadder,
    gained: afterLadder.filter((rarity) => !beforeLadder.includes(rarity)),
    locations,
  };
}

// A category's ingredients, each one's share within its own rarity tier
// before/after (world_probe.gd's `share_within_tier`, 1 / how many
// ingredients share that category+rarity) — the "33% → 25% each" line. Only
// ingredients whose share actually moved (added, removed, or diluted by a
// sibling landing in the same tier).
export function dilutionChanges(before, after, category) {
  const shareOf = (world) => {
    const shares = new Map();
    for (const [id, row] of Object.entries(world.ingredients || {})) {
      if (row.category === category) shares.set(id, row.share_within_tier);
    }
    return shares;
  };

  const beforeShare = shareOf(before);
  const afterShare = shareOf(after);
  const ids = new Set([...beforeShare.keys(), ...afterShare.keys()]);

  const changes = [];
  for (const id of ids) {
    const from = beforeShare.has(id) ? beforeShare.get(id) : null;
    const to = afterShare.has(id) ? afterShare.get(id) : null;
    if (from !== to) changes.push({ id, before: from, after: to });
  }
  return changes;
}

// Rows a table's edit removed (present in `before`, gone from `after`) that
// something else still points at — looked up against `beforeIndex` since a
// removed row's own outgoing edges are gone from `after`'s index, but who
// still points at the id that no longer exists is exactly what `beforeIndex`
// still has recorded.
export function orphansFrom(schemas, beforeIndex, before, after) {
  const messages = [];

  for (const [table, schema] of schemas) {
    const field = idRowsField(schema);
    if (!field) continue;

    const beforeRows = before.get(table)?.[field] || [];
    const afterIds = new Set((after.get(table)?.[field] || []).map((row) => row.id));

    for (const row of beforeRows) {
      if (afterIds.has(row.id)) continue;
      const summary = referrerSummary(beforeIndex, row.id);
      if (!summary) continue;
      messages.push(`Deleting ${table}.${row.id} orphans: ${summary}.`);
    }
  }

  return messages;
}
