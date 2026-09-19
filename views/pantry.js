import { referrersOf } from "../graph.js";
import { buildRarityBadge } from "./rarity.js";

// The Pantry (plans/authoring-tool-task8.md Task 8.3): ingredients grouped by
// category in ladder order, with rarity, buy/sell price, sourcing and dish
// usage read together. Read-only — the plan calls for no edit affordance
// here, unlike the World grid's amount cells.
//
// `referrersOf` only says *which table* points at a value, not which entry —
// graph.js's edge paths carry no array index (plans/authoring-tool.md Task 7).
// So it gates whether a table has anything to say about this ingredient at
// all, and the actual names come from a plain filter over `ctx.tables`, the
// same kind of lookup the World grid already does for `location.targets`.

// Exported alongside `build` so tools/prove-pantry.mjs can check the same
// logic against the real sibling data without a DOM.
export function locationSourcing(index, locationsData, ingredient) {
  const refs = [...referrersOf(index, ingredient.id), ...referrersOf(index, ingredient.category)];
  if (!refs.some((r) => r.table === "locations")) return [];

  const tags = [];
  for (const location of locationsData.entries) {
    const target = (location.targets || []).find((t) => t.id === ingredient.id);
    if (target) {
      tags.push({ label: location.name, rarity: target.leans });
    } else if ((location.supplies || []).some((s) => s.category === ingredient.category)) {
      tags.push(location.name);
    }
  }
  return tags;
}

export function marketSourcing(pricesData, ingredient) {
  const tags = [];
  const buyRow = (pricesData.buy || []).find((b) => b.good === ingredient.id);
  if (buyRow) tags.push(`Market — buy ${buyRow.price}g`);
  for (const row of pricesData.service || []) {
    if (row.good === ingredient.id) tags.push(`Served as ${row.item} for ${row.price}g`);
  }
  return tags;
}

export function dishesUsing(index, recipesData, ingredient) {
  if (!referrersOf(index, ingredient.category).some((r) => r.table === "recipes")) return [];
  return recipesData.entries.filter((recipe) => recipe.slots.some((slot) =>
    slot.category === ingredient.category
    || (Array.isArray(slot.categories) && slot.categories.includes(ingredient.category)),
  ));
}

// GDD s5/s6, mirrored from sim/rules/prices.gd's `sell_price_of`: an
// ingredient has no `sell_price` row of its own, so its poor rate is half
// its rarity's base price, floored, never below 1g.
export function sellPriceOf(pricesData, ingredient) {
  const basePrice = (pricesData.rarities[ingredient.rarity] || {}).base_price || 0;
  return basePrice > 0 ? Math.max(1, Math.floor(basePrice / 2)) : 0;
}

// Each entry is either a plain string or `{ label, rarity }` — the latter for
// a location's target, whose `leans` renders as a single colored badge
// naming the location inside it ("The Old Millpond — Common") rather than a
// plain tag next to a bare color chip.
function buildTagList(entries) {
  const list = document.createElement("div");
  list.className = "tags";
  for (const entry of entries) {
    if (typeof entry === "string") {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = entry;
      list.appendChild(tag);
    } else {
      list.appendChild(buildRarityBadge(entry.rarity, entry.label));
    }
  }
  return list;
}

function buildRow(ctx, ingredient) {
  const locationsData = ctx.tables.get("locations");
  const pricesData = ctx.tables.get("prices");
  const recipesData = ctx.tables.get("recipes");

  const tr = document.createElement("tr");

  const nameCell = document.createElement("td");
  nameCell.textContent = ingredient.label;
  tr.appendChild(nameCell);

  const rarityCell = document.createElement("td");
  rarityCell.appendChild(buildRarityBadge(ingredient.rarity));
  tr.appendChild(rarityCell);

  const buyRow = (pricesData.buy || []).find((b) => b.good === ingredient.id);
  const buyCell = document.createElement("td");
  buyCell.textContent = buyRow ? `${buyRow.price}g` : "—";
  tr.appendChild(buyCell);

  const sellCell = document.createElement("td");
  const sellPrice = sellPriceOf(pricesData, ingredient);
  sellCell.textContent = sellPrice > 0 ? `${sellPrice}g` : "—";
  tr.appendChild(sellCell);

  const sourcingCell = document.createElement("td");
  const sourcingTags = [...locationSourcing(ctx.index, locationsData, ingredient), ...marketSourcing(pricesData, ingredient)];
  sourcingCell.appendChild(sourcingTags.length > 0 ? buildTagList(sourcingTags) : document.createTextNode("nowhere"));
  tr.appendChild(sourcingCell);

  const dishesCell = document.createElement("td");
  const dishes = dishesUsing(ctx.index, recipesData, ingredient);
  dishesCell.appendChild(dishes.length > 0 ? buildTagList(dishes.map((d) => d.label)) : document.createTextNode("no dish"));
  tr.appendChild(dishesCell);

  return tr;
}

export function build(ctx) {
  const categories = ctx.schemas.get("ingredients").fields.entries.item.fields.category.values;
  const rarityOrder = ctx.schemas.get("ingredients").fields.entries.item.fields.rarity.values;
  const ingredientsData = ctx.tables.get("ingredients");

  const root = document.createElement("div");
  root.className = "pantry-view";

  for (const category of categories) {
    const entries = ingredientsData.entries
      .filter((ingredient) => ingredient.category === category)
      .sort((a, b) => rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity));
    if (entries.length === 0) continue;

    const heading = document.createElement("h3");
    heading.className = "pantry-category";
    heading.textContent = category;
    root.appendChild(heading);

    const table = document.createElement("table");
    table.className = "pantry-table";

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const label of ["Ingredient", "Rarity", "Buy", "Sell", "Sourcing", "Dishes"]) {
      const th = document.createElement("th");
      th.textContent = label;
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (const ingredient of entries) tbody.appendChild(buildRow(ctx, ingredient));
    table.appendChild(tbody);

    root.appendChild(table);
  }

  return root;
}
