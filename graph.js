// The reference graph (plans/authoring-tool.md Task 7): every `id_ref` and
// every `values_from` edge, declared once in data/schema/<table>.schema.json
// and walked here into one inverse index — for any value, everything that
// points at it. This never re-derives what an edge resolves *to* (that is
// tools/world_probe.gd and the CI schema check in the game repo); it only
// walks the *schema's shape* over the *real data* to find where a value is
// used, which is exactly what the World grid and the consequence panel need.
//
// Mirrors tests/schema_validator.gd's locator grammar on the game side
// deliberately, so both halves read the same schema the same way.

function addEdge(index, value, edge) {
  if (typeof value !== "string" || value === "") return;
  if (!index.has(value)) index.set(value, []);
  index.get(value).push(edge);
}

// Resolves a union field's discriminator against one data item, returning
// the matched variant's name and its merged (common + variant) field defs,
// or null when nothing matches. Exported so a view (people.js, Task 8.6)
// can read a union item's shape the same way `walk` below does, instead of
// re-deriving the discriminator lookup a second time.
export function resolveVariant(field, data) {
  if (!data || typeof data !== "object") return null;
  const { by, key } = field.discriminator || {};
  const variantName = by === "value" ? String(data[key] ?? "") : data && key in data ? "present" : "absent";
  const variant = (field.variants || {})[variantName];
  if (!variant) return null;
  return { name: variantName, fields: { ...(field.common_fields || {}), ...(variant.fields || {}) } };
}

// Walks `data` against `field` (a schema field definition), recording an
// edge for every `id_ref` value and every `enum` value that carries a
// `values_from` (both are "edges" per the schema's own vocabulary — see
// the plan's edge table). `path` is a display path, not used for lookups.
function walk(data, field, path, tableName, index) {
  if (!field || typeof field !== "object") return;
  switch (field.type) {
    case "id_ref":
      if (typeof data === "string") addEdge(index, data, { table: tableName, path });
      return;
    case "enum":
      if (typeof data === "string" && field.values_from) {
        addEdge(index, data, { table: tableName, path });
      }
      return;
    case "object": {
      if (!data || typeof data !== "object" || Array.isArray(data)) return;
      const fields = field.fields || {};
      for (const key of Object.keys(fields)) {
        if (key in data) walk(data[key], fields[key], `${path}.${key}`, tableName, index);
      }
      return;
    }
    case "array": {
      if (!Array.isArray(data)) return;
      for (const item of data) walk(item, field.item || {}, `${path}[]`, tableName, index);
      return;
    }
    case "map": {
      if (!data || typeof data !== "object") return;
      for (const key of Object.keys(data)) {
        if (key.startsWith("_")) continue;
        if (field.key) walk(key, field.key, `${path}{${key}}`, tableName, index);
        walk(data[key], field.item || {}, `${path}{${key}}`, tableName, index);
      }
      return;
    }
    case "union": {
      const resolved = resolveVariant(field, data);
      if (!resolved) return;
      walk(data, { type: "object", fields: resolved.fields }, path, tableName, index);
      return;
    }
    default:
      return;
  }
}

// `schemas` and `tables` are both Map<tableName, parsed JSON>. Returns
// Map<value, Array<{table, path}>> — everything that points at `value`.
export function buildInverseIndex(schemas, tables) {
  const index = new Map();
  for (const [tableName, schema] of schemas) {
    const data = tables.get(tableName);
    if (data === undefined || !schema) continue;
    walk(data, schema, tableName, tableName, index);
  }
  return index;
}

export function referrersOf(index, value) {
  return index.get(value) || [];
}
