import { GitHubError } from "./github.js";
import { loadTables, loadSchemas } from "./tables.js";
import { buildInverseIndex } from "./graph.js";
import { buildShell } from "./views/shell.js";
import { saveChanges } from "./save.js";
import { lineDiff, hunks } from "./diff.js";
import { pollChecks } from "./checks.js";

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

  const forgetButton = document.createElement("button");
  forgetButton.type = "button";
  forgetButton.textContent = "Forget token";
  forgetButton.addEventListener("click", () => {
    clearToken();
    render();
  });
  section.appendChild(forgetButton);

  const status = document.createElement("p");
  status.textContent = "Loading tables…";
  section.appendChild(status);

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

// Parses `edited`'s current text fresh, per plans/authoring-tool-task8.md's
// shared architecture decision — a table whose Raw text doesn't currently
// parse falls back to the last text that did, so a mid-edit typo elsewhere
// doesn't blank out every other view.
function buildContext() {
  const tables = new Map();
  for (const [name, text] of edited) {
    try {
      const parsed = JSON.parse(text);
      lastGoodParsed.set(name, parsed);
      tables.set(name, parsed);
    } catch {
      tables.set(name, lastGoodParsed.get(name));
    }
  }
  return {
    tables,
    schemas,
    index: buildInverseIndex(schemas, tables),
    edited,
    onEdit: (name, text) => edited.set(name, text),
  };
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
  review.replaceChildren(renderReview(changed, () => {
    saveButton.disabled = false;
    review.replaceChildren();
  }, () => confirmSave(token, changed, message, saveButton, review, saveStatus, checksStatus)));
}

// One diff per changed file, each collapsed to a few lines of context around
// what actually moved — see plans/authoring-tool.md Task 4.
function renderReview(changed, onCancel, onConfirm) {
  const container = document.createElement("div");

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
    stopChecksPolling = pollChecks(token, ORG, REPO, result.sha, (update) => renderCheckStatus(checksStatus, update));
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
function renderCheckStatus(container, update) {
  container.replaceChildren();

  if (update.state === "pending") {
    container.textContent = "Checks: running…";
  } else if (update.state === "pass") {
    container.textContent = "Checks passed.";
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

render();
