import { GitHubError } from "./github.js";
import { loadTables, loadSchemas } from "./tables.js";
import { buildInverseIndex } from "./graph.js";
import { buildShell } from "./views/shell.js";
import { saveChanges } from "./save.js";
import { lineDiff, hunks } from "./diff.js";
import { pollChecks } from "./checks.js";
import {
  deadCategories, referrerSummary, exclusiveConflicts, orphansFrom, idRowsField,
  dilutionChanges, ladderChanges,
} from "./consequences.js";
import { fetchWorldJson } from "./artifacts.js";

const ORG = "heroicallyInclined";
const REPO = "nowHiringHeroes";
const TOKEN_KEY = "nowhiring-authoring-token";

const app = document.getElementById("app");

// The tables as last read or last saved, keyed by table name to its raw JSON
// text, plus the commit sha and tree sha they were pinned to.
let loaded = null;

// The same tables with the session's live edits. Diffed against `loaded` at
// Save time to find which files actually changed.
let edited = null;

// data/schema/<table>.schema.json, read once and never edited.
let schemas = null;

// The most recent text that parsed for each table, used when the current
// Raw text is mid-edit and invalid — a view still has something to render.
let lastGoodParsed = null;

// Cancels a previous save's check poll if a new save starts before it settles.
let stopChecksPolling = null;

function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function storeToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Private window or blocked storage — the token screen simply reappears next render.
  }
}

function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing to clear if storage never worked.
  }
}

function render() {
  const token = getStoredToken();
  app.replaceChildren(token ? renderAuthedScreen(token) : renderTokenScreen());
}

function renderTokenScreen() {
  const section = document.createElement("section");

  const heading = document.createElement("h1");
  heading.textContent = "Now Hiring: Heroes — Authoring";
  section.appendChild(heading);

  const label = document.createElement("label");
  label.htmlFor = "token-input";
  label.textContent = `Fine-grained token, scoped to ${ORG}/${REPO}:`;
  section.appendChild(label);

  section.appendChild(document.createElement("br"));

  const input = document.createElement("input");
  input.type = "password";
  input.id = "token-input";
  input.autocomplete = "off";
  section.appendChild(input);

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.textContent = "Save token";
  saveButton.addEventListener("click", () => {
    const value = input.value.trim();
    if (!value) return;
    storeToken(value);
    render();
  });
  section.appendChild(saveButton);

  return section;
}

function renderAuthedScreen(token) {
  const section = document.createElement("section");

  const header = document.createElement("header");
  header.className = "app-header";
  section.appendChild(header);

  const forgetButton = document.createElement("button");
  forgetButton.type = "button";
  forgetButton.textContent = "Forget token";
  forgetButton.addEventListener("click", () => {
    clearToken();
    render();
  });
  header.appendChild(forgetButton);

  const status = document.createElement("p");
  status.className = "app-status";
  status.textContent = "Loading tables…";
  header.appendChild(status);

  const editor = document.createElement("div");
  section.appendChild(editor);

  checkTokenAndLoadTables(token, status, editor);

  return section;
}

async function checkTokenAndLoadTables(token, status, editor) {
  try {
    const { sha, treeSha, expiry, tables } = await loadTables(token, ORG, REPO);
    schemas = await loadSchemas(token, ORG, REPO, sha);
    loaded = { sha, treeSha, tables };
    edited = new Map(tables);
    lastGoodParsed = new Map();
    for (const [name, text] of tables) lastGoodParsed.set(name, JSON.parse(text));

    const shortSha = sha.slice(0, 7);
    status.textContent = expiry
      ? `Authorized. Token expires ${expiry}. Loaded ${tables.size} tables at ${shortSha}.`
      : `Authorized. Loaded ${tables.size} tables at ${shortSha}.`;

    renderEditor(token, editor);
  } catch (error) {
    status.textContent = error instanceof GitHubError
      ? error.message
      : "Something went wrong reaching GitHub.";
  }
}

// Parses a raw-text table map fresh, per plans/authoring-tool-task8.md's
// shared architecture decision — a table whose Raw text doesn't currently
// parse falls back to the last text that did, so a mid-edit typo elsewhere
// doesn't blank out every other view.
function parseAll(rawTables) {
  const tables = new Map();
  for (const [name, text] of rawTables) {
    try {
      const parsed = JSON.parse(text);
      lastGoodParsed.set(name, parsed);
      tables.set(name, parsed);
    } catch {
      tables.set(name, lastGoodParsed.get(name));
    }
  }
  return tables;
}

function buildContext() {
  const tables = parseAll(edited);
  return {
    tables,
    schemas,
    index: buildInverseIndex(schemas, tables),
    edited,
    onEdit: (name, text) => edited.set(name, text),
  };
}

// The structural half of the consequence panel (plans/authoring-tool-task9.md
// Task 9.1) — pure set arithmetic over the tables and the inverse index, so
// it costs nothing to compute and never waits on CI. `before` is main's own
// state (loaded.tables); `after` is this save's edit (edited).
function structuralConsequences() {
  const before = parseAll(loaded.tables);
  const after = parseAll(edited);
  const beforeIndex = buildInverseIndex(schemas, before);
  const afterIndex = buildInverseIndex(schemas, after);

  const lines = [];

  for (const category of deadCategories(afterIndex, schemas)) {
    lines.push(`No location supplies ${category} — nothing added there can be found.`);
  }

  lines.push(...exclusiveConflicts(before, after));
  lines.push(...orphansFrom(schemas, beforeIndex, before, after));

  for (const [table, schema] of schemas) {
    const field = idRowsField(schema);
    if (!field) continue;
    const beforeIds = new Set((before.get(table)?.[field] || []).map((row) => row.id));
    for (const row of after.get(table)?.[field] || []) {
      if (beforeIds.has(row.id)) continue;
      const summary = referrerSummary(afterIndex, row.id);
      if (summary) lines.push(`${row.id} (new in ${table}) is ${summary}.`);
    }
  }

  return lines;
}

function renderEditor(token, editor) {
  let activeKey = "world";
  let activeTab = "structured";

  const shellContainer = document.createElement("div");
  editor.appendChild(shellContainer);

  function redrawShell() {
    shellContainer.replaceChildren(buildShell(buildContext(), activeKey, activeTab, (key, tab) => {
      activeKey = key;
      activeTab = tab;
      redrawShell();
    }));
  }
  redrawShell();

  const messageLabel = document.createElement("label");
  messageLabel.htmlFor = "commit-message";
  messageLabel.textContent = "What changed, and why:";
  editor.appendChild(messageLabel);

  editor.appendChild(document.createElement("br"));

  const messageInput = document.createElement("input");
  messageInput.type = "text";
  messageInput.id = "commit-message";
  messageInput.size = 80;
  editor.appendChild(messageInput);

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.textContent = "Save";
  editor.appendChild(saveButton);

  const review = document.createElement("div");
  editor.appendChild(review);

  const saveStatus = document.createElement("p");
  editor.appendChild(saveStatus);

  const checksStatus = document.createElement("div");
  editor.appendChild(checksStatus);

  saveButton.addEventListener("click", () => requestSave(token, messageInput, saveButton, review, saveStatus, checksStatus));
}

function requestSave(token, messageInput, saveButton, review, saveStatus, checksStatus) {
  const message = messageInput.value.trim();
  if (!message) {
    saveStatus.textContent = "Say what changed before saving.";
    return;
  }

  const changed = new Map();
  for (const [name, text] of edited) {
    if (text !== loaded.tables.get(name)) changed.set(name, text);
  }
  if (changed.size === 0) {
    saveStatus.textContent = "Nothing changed.";
    return;
  }

  saveStatus.textContent = "";
  saveButton.disabled = true;
  review.replaceChildren(renderReview(changed, structuralConsequences(), () => {
    saveButton.disabled = false;
    review.replaceChildren();
  }, () => confirmSave(token, changed, message, saveButton, review, saveStatus, checksStatus)));
}

// The consequences section (plans/authoring-tool-task9.md), above the
// per-file diffs, then one diff per changed file, each collapsed to a few
// lines of context around what actually moved — see plans/authoring-tool.md
// Task 4.
function renderReview(changed, structuralLines, onCancel, onConfirm) {
  const container = document.createElement("div");

  const consequences = document.createElement("div");
  consequences.className = "consequences";

  const structuralHeading = document.createElement("h3");
  structuralHeading.textContent = "What this touches";
  consequences.appendChild(structuralHeading);

  if (structuralLines.length === 0) {
    const none = document.createElement("p");
    none.textContent = "Nothing structurally unusual.";
    consequences.appendChild(none);
  } else {
    const list = document.createElement("ul");
    for (const line of structuralLines) {
      const item = document.createElement("li");
      item.textContent = line;
      list.appendChild(item);
    }
    consequences.appendChild(list);
  }

  container.appendChild(consequences);

  for (const [name, newText] of changed) {
    const details = document.createElement("details");
    details.open = true;

    const summary = document.createElement("summary");
    summary.textContent = `${name}.json`;
    details.appendChild(summary);

    const pre = document.createElement("pre");
    const rows = hunks(lineDiff(loaded.tables.get(name), newText));
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
  cancelButton.addEventListener("click", onCancel);
  container.appendChild(cancelButton);

  const confirmButton = document.createElement("button");
  confirmButton.type = "button";
  confirmButton.textContent = "Confirm and save";
  confirmButton.addEventListener("click", onConfirm);
  container.appendChild(confirmButton);

  return container;
}

async function confirmSave(token, changed, message, saveButton, review, saveStatus, checksStatus) {
  review.replaceChildren();
  saveStatus.textContent = "Saving…";
  try {
    const result = await saveChanges(token, ORG, REPO, loaded, changed, message);
    for (const [name, text] of changed) loaded.tables.set(name, text);

    saveStatus.textContent = `Saved to ${result.branch}. `;
    const link = document.createElement("a");
    link.href = result.prUrl;
    link.textContent = `PR #${result.prNumber}`;
    link.target = "_blank";
    link.rel = "noopener";
    saveStatus.appendChild(link);

    if (stopChecksPolling) stopChecksPolling();
    checksStatus.textContent = "Checks: waiting…";
    stopChecksPolling = pollChecks(
      token, ORG, REPO, result.sha,
      (update) => renderCheckStatus(checksStatus, update, token, result.sha),
    );
  } catch (error) {
    saveStatus.textContent = error instanceof GitHubError
      ? error.message
      : "Something went wrong saving.";
  } finally {
    saveButton.disabled = false;
  }
}

// Reflects one poll tick from checks.js's pollChecks onto the page — the PR
// he opened is the one place this could otherwise only be seen by leaving.
// `token`/`sha` are only used on a pass, to fetch the numeric panel (Task
// 9.4) — it sits next to, not inside, this pass/fail text.
function renderCheckStatus(container, update, token, sha) {
  container.replaceChildren();

  if (update.state === "pending") {
    container.textContent = "Checks: running…";
  } else if (update.state === "pass") {
    container.textContent = "Checks passed.";
    const numeric = document.createElement("div");
    numeric.className = "numeric-consequences";
    container.appendChild(numeric);
    renderNumericPanel(numeric, token, sha);
  } else if (update.state === "timeout") {
    container.textContent = "Checks are still running — check the pull request on GitHub.";
  } else if (update.state === "fail") {
    const heading = document.createElement("p");
    heading.textContent = `Checks failed (${update.run.name}):`;
    container.appendChild(heading);

    const pre = document.createElement("pre");
    pre.textContent = update.tail;
    container.appendChild(pre);
  }
}

// The probabilistic half of the consequence panel (Task 9.4): this save's
// world.json against main's own baseline, both fetched from the workflow
// run's artifact (artifacts.js, Task 9.3) — never recomputed here, since
// that is exactly the reimplementation risk the parent plan's Risks section
// warns against.
async function renderNumericPanel(container, token, sha) {
  const status = document.createElement("p");
  status.textContent = "Fetching the derived world…";
  container.appendChild(status);

  let afterWorld, beforeWorld;
  try {
    [afterWorld, beforeWorld] = await Promise.all([
      fetchWorldJson(token, ORG, REPO, { headSha: sha }),
      fetchWorldJson(token, ORG, REPO, { branch: "main" }),
    ]);
  } catch (error) {
    status.textContent = error instanceof GitHubError ? error.message : "Couldn't fetch the derived world.";
    return;
  }

  if (!afterWorld || !beforeWorld) {
    status.textContent = "No world artifact yet for this commit or for main — try again shortly.";
    return;
  }

  const lines = [];
  for (const category of Object.keys(afterWorld.categories)) {
    const ladder = ladderChanges(beforeWorld, afterWorld, category);
    const dilution = dilutionChanges(beforeWorld, afterWorld, category);
    if (!ladder.changed && dilution.length === 0) continue;

    lines.push(`${category}:`);
    if (ladder.changed) {
      lines.push(`  ⚠ Extends the ${category} ladder    ${ladder.before.join(",") || "(none)"} → ${ladder.after.join(",")}`);
      if (ladder.locations.length > 0) {
        lines.push(`    This moves the odds for ${ladder.locations.join(", ")}, and changes where a Target's lean lands.`);
      }
    } else {
      lines.push(`  ${category} ladder unchanged`);
    }
    for (const change of dilution) {
      const pct = (share) => (share == null ? "—" : `${Math.round(share * 100)}%`);
      lines.push(`  ${change.id}  ${pct(change.before)} → ${pct(change.after)}`);
    }
  }

  status.remove();
  if (lines.length === 0) {
    const none = document.createElement("p");
    none.textContent = "No numeric effects.";
    container.appendChild(none);
  } else {
    const pre = document.createElement("pre");
    pre.textContent = lines.join("\n");
    container.appendChild(pre);
  }
}

render();
