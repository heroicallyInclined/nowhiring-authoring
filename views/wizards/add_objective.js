import { spliceAddRow, verifySplice } from "../../splice.js";
import { wizardStep, textField, selectField, continueButton } from "./shell.js";

// Add an objective (plans/authoring-tool-task10.md Task 10.6): demands and
// yield weights, checked against every location for a pairing that weights
// to nothing — the one wizard blocked on Task 9.2-9.4 (Done), since that's
// the real, CI-side answer this wizard can only heuristically anticipate.
//
// Correction to the plan's own "demands per skill" phrasing: `demands` is a
// schema `map` (dynamic keys), and splice.js has no primitive that inserts
// or removes an object *key* — Task 4 named key-delete as deferred and
// Task 10.1 only ever built row-delete (array elements), not that. A brand
// new objective's demand *skills* can therefore only ever be the skill set
// an existing objective already demands — the wizard clones an existing
// objective as its "shape" and only ever edits values (demand amounts,
// yield weights, an existing adds[] line's good/amount, an existing
// nothing_to_find sentence's text), never a shape no real objective has.
export const TABLES = ["objectives"];

function slugify(label) {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

// The heuristic half (this wizard's own, not consequences.js's): a
// structural, presence-only reading of Returns._yields_at's real rule
// (sim/rules/returns.gd, read for reference, never reimplemented) — weight
// non-zero and *some* line to weight, without the floor(amount * weight)
// arithmetic that would mirror the sim too closely. Explicitly a heuristic:
// a location with a supply line whose amount is small enough to floor to
// zero anyway would read "ok" here and "empty" once world_probe.gd actually
// runs — the gap the plan's own open question 1 anticipates.
export function structurallyLooksEmpty(objective, location) {
  const weights = objective.yield_weights || {};
  const stockOk = (weights.stock ?? 1) !== 0
    && ((location.supplies || []).length > 0 || (location.named_stock || []).length > 0);
  const fittingsOk = (weights.fittings ?? 1) !== 0 && (location.fittings || []).length > 0;
  const addsOk = (objective.adds || []).some((a) => a.amount > 0);
  const rumorOk = objective.returns_rumor_on_success === true;
  const repOk = (objective.reputation_bonus || 0) > 0;
  return !(stockOk || fittingsOk || addsOk || rumorOk || repOk);
}

export function locationsThatLookEmpty(objective, locationsData) {
  return locationsData.entries.filter((location) => structurallyLooksEmpty(objective, location)).map((l) => l.id);
}

export function addObjectiveEdit(objectivesText, {
  id, name, knownFor, templateId, demands, stock, fittings, add, nothingToFind,
}) {
  const parsed = JSON.parse(objectivesText);
  const templateIndex = parsed.entries.findIndex((o) => o.id === templateId);
  if (templateIndex < 0) throw new Error(`add_objective wizard: no template "${templateId}"`);
  const newIndex = templateIndex + 1;
  const template = parsed.entries[templateIndex];

  const intended = JSON.parse(objectivesText);
  const clone = JSON.parse(JSON.stringify(template));
  clone.id = id;
  clone.name = name;
  clone.known_for = knownFor;
  for (const skill of Object.keys(clone.demands)) clone.demands[skill] = demands[skill];
  clone.yield_weights = { stock, fittings };
  if (add && clone.adds && clone.adds.length > 0) {
    clone.adds[0] = { ...clone.adds[0], good: add.good, amount: add.amount };
  }
  if (nothingToFind !== undefined && "nothing_to_find" in clone) clone.nothing_to_find = nothingToFind;
  intended.entries.splice(newIndex, 0, clone);

  const edits = [
    { path: ["id"], value: id },
    { path: ["name"], value: name },
    { path: ["known_for"], value: knownFor },
    ...Object.keys(template.demands).map((skill) => ({ path: ["demands", skill], value: demands[skill] })),
    { path: ["yield_weights", "stock"], value: stock },
    { path: ["yield_weights", "fittings"], value: fittings },
  ];
  if (add && template.adds && template.adds.length > 0) {
    edits.push({ path: ["adds", 0, "good"], value: add.good }, { path: ["adds", 0, "amount"], value: add.amount });
  }
  if (nothingToFind !== undefined && "nothing_to_find" in template) {
    edits.push({ path: ["nothing_to_find"], value: nothingToFind });
  }

  const text = spliceAddRow(objectivesText, ["entries"], edits, templateIndex);
  const verdict = verifySplice(text, intended);
  if (!verdict.ok) throw new Error(`add_objective wizard: ${verdict.reason}`);
  return text;
}

function formStep() {
  return {
    render(ctx, state, next) {
      let name = state.name ?? "";
      let knownFor = state.knownFor ?? "";

      const { row: nameRow } = textField("Name:", name, (value) => { name = value; });
      const { row: knownForRow } = textField("Known for:", knownFor, (value) => { knownFor = value; });

      const button = continueButton("Continue", () => {
        if (!name.trim()) return;
        next({ name: name.trim(), knownFor, id: slugify(name) });
      });

      return wizardStep("Add an objective — name", nameRow, knownForRow, button);
    },
  };
}

function templateStep() {
  return {
    render(ctx, state, next) {
      const objectives = ctx.tables.get("objectives").entries;
      let templateId = state.templateId ?? objectives[0].id;

      const note = document.createElement("p");
      note.textContent = "Demand skills come from the objective you base this on — splice.js can't add a new demand skill outright, only tune the amounts of an existing shape's.";

      const { row: templateRow } = selectField(
        "Base this on:", objectives.map((o) => o.id), templateId,
        (value) => { templateId = value; },
      );

      const button = continueButton("Continue", () => next({ templateId }));

      return wizardStep("Add an objective — base shape", note, templateRow, button);
    },
  };
}

function demandsStep() {
  return {
    render(ctx, state, next) {
      const template = ctx.tables.get("objectives").entries.find((o) => o.id === state.templateId);
      const skills = Object.keys(template.demands);
      const demands = { ...template.demands };

      const rows = skills.map((skill) => textField(`${skill}:`, String(demands[skill]), (value) => {
        demands[skill] = parseInt(value, 10) || 0;
      }).row);

      const button = continueButton("Continue", () => next({ demands }));

      return wizardStep("Add an objective — demands", ...rows, button);
    },
  };
}

function yieldsStep() {
  return {
    render(ctx, state, next) {
      const template = ctx.tables.get("objectives").entries.find((o) => o.id === state.templateId);
      let stock = template.yield_weights.stock;
      let fittings = template.yield_weights.fittings;

      const { row: stockRow } = textField("Yield weight — stock:", String(stock), (value) => { stock = parseFloat(value) || 0; });
      const { row: fittingsRow } = textField("Yield weight — fittings:", String(fittings), (value) => { fittings = parseFloat(value) || 0; });

      const button = continueButton("Continue", () => next({ stock, fittings }));

      return wizardStep("Add an objective — yield weights", stockRow, fittingsRow, button);
    },
  };
}

function addsStep() {
  return {
    render(ctx, state, next) {
      const template = ctx.tables.get("objectives").entries.find((o) => o.id === state.templateId);
      if (!template.adds || template.adds.length === 0) {
        const note = document.createElement("p");
        note.textContent = "This shape has no adds[] line to carry one — nothing to set here.";
        const button = continueButton("Continue", () => next({ add: null }));
        return wizardStep("Add an objective — adds", note, button);
      }

      const original = template.adds[0];
      let good = original.good;
      let amount = original.amount;

      const note = document.createElement("p");
      note.textContent = `This shape's own line names a ${original.category} good — only its identity and amount can change, not the kind.`;
      const { row: goodRow } = textField("Good id:", good, (value) => { good = value; });
      const { row: amountRow } = textField("Amount:", String(amount), (value) => { amount = parseInt(value, 10) || 0; });

      const button = continueButton("Continue", () => next({ add: { good, amount, category: original.category } }));

      return wizardStep("Add an objective — adds", note, goodRow, amountRow, button);
    },
  };
}

function nothingToFindStep() {
  return {
    render(ctx, state, next) {
      const objectivesData = ctx.tables.get("objectives");
      const template = objectivesData.entries.find((o) => o.id === state.templateId);
      const locationsData = ctx.tables.get("locations");

      const draft = {
        yield_weights: { stock: state.stock, fittings: state.fittings },
        adds: state.add ? [state.add] : (template.adds || []),
        returns_rumor_on_success: template.returns_rumor_on_success,
        reputation_bonus: template.reputation_bonus,
      };
      const emptyAt = locationsThatLookEmpty(draft, locationsData);
      const carriesSentence = "nothing_to_find" in template;

      const warning = document.createElement("p");
      if (emptyAt.length > 0) {
        warning.textContent = `Heuristic, not the real answer (that arrives with the PR's checks): this objective structurally looks like it could weight to nothing at ${emptyAt.join(", ")}.`;
      } else {
        warning.textContent = "Heuristic: no location structurally looks empty for this objective — the real answer still arrives with the PR's checks.";
      }

      if (!carriesSentence) {
        const note = document.createElement("p");
        note.textContent = emptyAt.length > 0
          ? "This shape carries no nothing_to_find sentence, and can't gain one outright — base this on Run the errand, Thin the boar-runs, Escort the caravan, or Delve the ruin instead if you want one."
          : "This shape carries no nothing_to_find sentence.";
        const button = continueButton("Continue to review", () => next({ nothingToFind: undefined }));
        return wizardStep("Add an objective — nothing to find", warning, note, button);
      }

      let sentence = template.nothing_to_find;
      const { row: sentenceRow } = textField("Sentence (%s is the location):", sentence, (value) => { sentence = value; });
      const button = continueButton("Continue to review", () => next({ nothingToFind: sentence }));
      return wizardStep("Add an objective — nothing to find", warning, sentenceRow, button);
    },
  };
}

function finishStep() {
  return {
    render(ctx, state, next) {
      const edits = new Map([["objectives", addObjectiveEdit(ctx.edited.get("objectives"), {
        id: state.id, name: state.name, knownFor: state.knownFor, templateId: state.templateId,
        demands: state.demands, stock: state.stock, fittings: state.fittings,
        add: state.add, nothingToFind: state.nothingToFind,
      })]]);
      next({ edits });
      return null;
    },
  };
}

export function steps(ctx) {
  return [formStep(), templateStep(), demandsStep(), yieldsStep(), addsStep(), nothingToFindStep(), finishStep()];
}
