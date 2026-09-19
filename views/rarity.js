// One rarity badge, reused everywhere a rarity or `leans` value (the same
// enum, per locations.schema.json's `targets[].leans`, pinned to the same
// Pantry.RARITY_ORDER as ingredients[].rarity) needs to render as color
// rather than plain text — plans/authoring-tool-ui-polish.md Task 2.
export function buildRarityBadge(rarity) {
  const span = document.createElement("span");
  span.className = `rarity-badge rarity-badge--${rarity}`;
  span.textContent = rarity;
  return span;
}
