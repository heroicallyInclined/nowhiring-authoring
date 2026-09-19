import { buildRawTab, isValidJSON } from "./raw_tab.js";
import { build as buildWorld } from "./world.js";
import { build as buildPantry } from "./pantry.js";
import { build as buildMenu } from "./menu.js";
import { build as buildBoard } from "./board.js";
import { build as buildPeople } from "./people.js";
import { build as buildInn } from "./inn.js";
import { build as buildEvening } from "./evening.js";
import { build as buildLetter } from "./letter.js";
import { build as buildTuning } from "./tuning.js";
import { runWizard } from "./wizards/shell.js";
import * as addIngredient from "./wizards/add_ingredient.js";
import * as addLocation from "./wizards/add_location.js";
import * as addDish from "./wizards/add_dish.js";
import * as addObjective from "./wizards/add_objective.js";
import * as retire from "./wizards/retire.js";

// One entry per view named in plans/authoring-tool.md Task 8. `tables` lists
// the data/*.json files the view reads and edits — the Raw JSON tab falls
// back to exactly these until the view has a real `build` (filled in by
// plans/authoring-tool-task8.md's 8.2 onward). `names` has no view of its
// own in the parent plan; parked on The People alongside `archetypes` since
// both describe NPC identity — see "Found while working" in that plan file.
export const VIEWS = [
  { key: "world", label: "The World", tables: ["locations", "ingredients"], build: buildWorld },
  { key: "pantry", label: "The Pantry", tables: ["ingredients", "prices", "recipes"], build: buildPantry },
  { key: "menu", label: "The Menu", tables: ["recipes", "inn"], build: buildMenu },
  { key: "board", label: "The Board", tables: ["objectives", "locations"], build: buildBoard },
  { key: "people", label: "The People", tables: ["archetypes", "quirks", "names"], build: buildPeople },
  { key: "inn", label: "The Inn", tables: ["amenities", "inn"], build: buildInn },
  { key: "evening", label: "The Evening", tables: ["guest_schedule", "interrupts"], build: buildEvening },
  { key: "letter", label: "The Letter", tables: ["notice"], build: buildLetter },
  { key: "tuning", label: "Tuning", tables: ["bands", "attraction", "run"], build: buildTuning },
];

// One entry per Task 10 wizard, in the parent plan's own order. `tables` is
// the superset a wizard could ever touch across its own branches (used only
// for the same isValidJSON guard tryNavigate already runs, not for anything
// a wizard reads structurally) — each wizard module's own `steps(ctx)` is
// what actually decides which of them a given run edits.
const WIZARDS = [
  { key: "add-ingredient", label: "Add an ingredient", tables: addIngredient.TABLES, steps: addIngredient.steps },
  { key: "add-location", label: "Add a location", tables: addLocation.TABLES, steps: addLocation.steps },
  { key: "add-dish", label: "Add a dish", tables: addDish.TABLES, steps: addDish.steps },
  { key: "add-objective", label: "Add an objective", tables: addObjective.TABLES, steps: addObjective.steps },
  { key: "retire", label: "Retire…", tables: retire.TABLES, steps: retire.steps },
];

// Renders the nav plus the active view into a fresh element. `ctx` is
// `{ tables, schemas, index, edited, onEdit }`, rebuilt by app.js on every
// navigation (plans/authoring-tool-task8.md's shared architecture decision).
// `onNavigate(key, tab)` is only ever called with a tab GitHub's own data can
// actually support switching to — see the Raw-tab guard below.
export function buildShell(ctx, activeKey, activeTab, onNavigate) {
  const view = VIEWS.find((v) => v.key === activeKey) || VIEWS[0];

  const root = document.createElement("div");
  root.className = "shell";

  const warning = document.createElement("p");
  warning.className = "validation";

  // Structured tabs read parsed JSON; a Raw edit that doesn't parse can't
  // feed one. Leaving Raw is refused rather than silently discarding the
  // edit — switching to a different view is unaffected, since that view's
  // own tables are checked independently.
  function tryNavigate(key, tab) {
    if (tab === "structured") {
      const target = VIEWS.find((v) => v.key === key) || view;
      const invalid = target.tables.filter((name) => !isValidJSON(ctx.edited.get(name)));
      if (invalid.length > 0) {
        warning.textContent = `Fix the JSON in ${invalid.join(", ")} before leaving Raw, or stay on Raw.`;
        return;
      }
    }
    onNavigate(key, tab);
  }

  // A wizard reads/writes ctx.edited the same way world.js's commit() does —
  // it needs the same guard tryNavigate already runs before trusting a
  // table's Raw text parses (open question 3 in authoring-tool-task10.md,
  // settled here rather than deferred further).
  function tryOpenWizard(wizard) {
    const invalid = wizard.tables.filter((name) => !isValidJSON(ctx.edited.get(name)));
    if (invalid.length > 0) {
      warning.textContent = `Fix the JSON in ${invalid.join(", ")} before running "${wizard.label}".`;
      return;
    }
    warning.textContent = "";
    wizardSlot.replaceChildren(runWizard(
      ctx,
      wizard.steps(ctx),
      (state) => {
        for (const [table, text] of state.edits || []) ctx.onEdit(table, text);
        onNavigate(activeKey, activeTab);
      },
      () => onNavigate(activeKey, activeTab),
    ));
  }

  const nav = document.createElement("nav");
  nav.className = "view-nav";
  for (const v of VIEWS) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = v.label;
    button.className = v.key === activeKey ? "active" : "";
    button.addEventListener("click", () => tryNavigate(v.key, "structured"));
    nav.appendChild(button);
  }
  root.appendChild(nav);

  const guidedNav = document.createElement("nav");
  guidedNav.className = "guided-nav";
  for (const wizard of WIZARDS) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = wizard.label;
    button.addEventListener("click", () => tryOpenWizard(wizard));
    guidedNav.appendChild(button);
  }
  root.appendChild(guidedNav);

  const wizardSlot = document.createElement("div");
  root.appendChild(wizardSlot);

  const tabs = document.createElement("div");
  tabs.className = "view-tabs";

  const structuredTab = document.createElement("button");
  structuredTab.type = "button";
  structuredTab.textContent = "Structured";
  structuredTab.className = activeTab === "structured" ? "active" : "";
  structuredTab.addEventListener("click", () => tryNavigate(view.key, "structured"));
  tabs.appendChild(structuredTab);

  const rawTab = document.createElement("button");
  rawTab.type = "button";
  rawTab.textContent = "Raw JSON";
  rawTab.className = activeTab === "raw" ? "active" : "";
  rawTab.addEventListener("click", () => tryNavigate(view.key, "raw"));
  tabs.appendChild(rawTab);

  root.appendChild(tabs);
  root.appendChild(warning);

  const bodyHeading = document.createElement("h2");
  bodyHeading.className = "view-title";
  bodyHeading.textContent = view.label;
  root.appendChild(bodyHeading);

  const body = document.createElement("div");
  body.className = "view-body";
  if (activeTab === "raw") {
    body.appendChild(buildRawTab(ctx, view.tables));
  } else if (view.build) {
    body.appendChild(view.build(ctx));
  } else {
    const placeholder = document.createElement("p");
    placeholder.className = "placeholder";
    placeholder.textContent = `${view.label} isn't built yet — see plans/authoring-tool-task8.md.`;
    body.appendChild(placeholder);
  }
  root.appendChild(body);

  return root;
}
