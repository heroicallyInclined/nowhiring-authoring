import { lineDiff, hunks } from "../../diff.js";
import { verifySplice } from "../../splice.js";

// The same splice-then-verify shape every Task 8 view's own commit()
// closure already runs (world.js, tuning.js) — factored here since every
// wizard below needs it and it's splice-layer glue, not a domain question.
// Returns the spliced text rather than calling ctx.onEdit, since a wizard
// only ever queues edits into its own `state.edits` until Confirm.
export function spliceAndVerify(text, mutate, splice) {
  const intended = JSON.parse(text);
  mutate(intended);
  const newText = splice(text);
  const verdict = verifySplice(newText, intended);
  if (!verdict.ok) throw new Error(`wizard splice: ${verdict.reason}`);
  return newText;
}

// Small shared field builders every wizard's own step closures reach for —
// the wizard equivalent of tuning.js's editInline/buildScalarNode, factored
// here once rather than five times, since a wizard file "only knows its own
// domain questions" (the architecture decision), not how to lay out a label
// next to an input.
export function wizardStep(title, ...children) {
  const section = document.createElement("div");
  section.className = "wizard-step";
  const heading = document.createElement("h3");
  heading.textContent = title;
  section.appendChild(heading);
  for (const child of children) section.appendChild(child);
  return section;
}

export function textField(labelText, initialValue, onChange) {
  const row = document.createElement("div");
  row.className = "wizard-field";
  const label = document.createElement("span");
  label.className = "wizard-label";
  label.textContent = labelText;
  row.appendChild(label);
  const input = document.createElement("input");
  input.type = "text";
  input.value = initialValue ?? "";
  input.addEventListener("input", () => onChange(input.value));
  row.appendChild(input);
  return { row, input };
}

export function selectField(labelText, options, initialValue, onChange) {
  const row = document.createElement("div");
  row.className = "wizard-field";
  const label = document.createElement("span");
  label.className = "wizard-label";
  label.textContent = labelText;
  row.appendChild(label);
  const select = document.createElement("select");
  for (const option of options) {
    const opt = document.createElement("option");
    opt.value = option;
    opt.textContent = option;
    opt.selected = option === initialValue;
    select.appendChild(opt);
  }
  select.addEventListener("change", () => onChange(select.value));
  row.appendChild(select);
  return { row, select };
}

export function continueButton(label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

// The wizard step-runner (plans/authoring-tool-task10.md Task 10.2): one
// reusable "form → review → commit" flow every wizard below is built on,
// mirroring 8.1's "one shell, nine views" decision — five wizards share one
// step-runner and one review renderer, not five bespoke ones.
//
// `steps` is an array of question steps only — `{ render(ctx, state, next) }`
// closures a wizard file supplies. `state` accumulates each step's answers
// across `next(patch)` calls; the wizard's own last step is the one that
// finishes gathering answers and computes `state.edits` (a
// `Map<table, splicedText>`, via splice.js against `ctx.edited`'s current
// text) before calling `next({ edits })`. Once `steps` is exhausted,
// `runWizard` appends its own generic review step — a per-file diff of
// `state.edits` against `ctx.edited`, Confirm/Cancel — rather than each
// wizard hand-rolling one, which is the one correction to the parent plan's
// own phrasing ("the last step always renders a review"): the review is
// `runWizard`'s own step, appended after a wizard's questions, not one of
// the `steps` a wizard file supplies.
//
// `onComplete(state)` fires on Confirm — it never runs `ctx.onEdit` itself,
// only hands the accumulated state back to the shell, per the architecture
// decision that Save stays the one place a PR is opened. `onCancel()` fires
// on Cancel, a correction/addition to the plan's own three-argument
// signature: something has to tell the shell to close the wizard and
// discard everything without touching `ctx.edited`, and the plan's own
// acceptance line ("Cancel at review discards nothing") needs exactly that.
export function runWizard(ctx, steps, onComplete, onCancel) {
  const container = document.createElement("div");
  container.className = "wizard";

  let state = {};

  function renderStep(index) {
    if (index >= steps.length) {
      container.replaceChildren();
      renderReview();
      return;
    }
    // A step may call `next` synchronously from inside its own `render` (a
    // step that finds it has nothing to ask given the state so far, and
    // skips itself) — `advanced` guards against then also painting this
    // step's own (stale) return value on top of whatever that recursive
    // call already drew.
    let advanced = false;
    const next = (patch) => {
      advanced = true;
      state = { ...state, ...patch };
      renderStep(index + 1);
    };
    const element = steps[index].render(ctx, state, next);
    if (advanced) return;
    container.replaceChildren(element);
  }

  function renderReview() {
    const heading = document.createElement("h3");
    heading.textContent = "Review";
    container.appendChild(heading);

    const edits = state.edits || new Map();
    if (edits.size === 0) {
      const none = document.createElement("p");
      none.textContent = "Nothing to change.";
      container.appendChild(none);
    }

    for (const [table, newText] of edits) {
      const details = document.createElement("details");
      details.open = true;

      const summary = document.createElement("summary");
      summary.textContent = `${table}.json`;
      details.appendChild(summary);

      const pre = document.createElement("pre");
      const rows = hunks(lineDiff(ctx.edited.get(table) ?? "", newText));
      for (const row of rows) {
        const line = document.createElement("div");
        if (row.type === "gap") {
          line.textContent = "⋮";
        } else {
          line.textContent = `${row.type === "add" ? "+" : row.type === "del" ? "-" : " "} ${row.line}`;
          line.className = `diff-${row.type}`;
        }
        pre.appendChild(line);
      }
      details.appendChild(pre);
      container.appendChild(details);
    }

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = "Cancel";
    cancelButton.addEventListener("click", () => onCancel());
    container.appendChild(cancelButton);

    const confirmButton = document.createElement("button");
    confirmButton.type = "button";
    confirmButton.textContent = "Confirm";
    confirmButton.disabled = edits.size === 0;
    confirmButton.addEventListener("click", () => onComplete(state));
    container.appendChild(confirmButton);
  }

  renderStep(0);
  return container;
}
