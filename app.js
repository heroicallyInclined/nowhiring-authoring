import { GitHubError } from "./github.js";
import { loadTables } from "./tables.js";
import { saveChanges } from "./save.js";

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
    loaded = { sha, treeSha, tables };
    edited = new Map(tables);

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

function renderEditor(token, editor) {
  for (const [name, text] of edited) {
    const details = document.createElement("details");

    const summary = document.createElement("summary");
    summary.textContent = `${name}.json — ${text.length} bytes`;
    details.appendChild(summary);

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.rows = 20;
    textarea.cols = 100;
    textarea.addEventListener("input", () => edited.set(name, textarea.value));
    details.appendChild(textarea);

    editor.appendChild(details);
  }

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

  const saveStatus = document.createElement("p");
  editor.appendChild(saveStatus);

  saveButton.addEventListener("click", () => handleSave(token, messageInput, saveStatus));
}

async function handleSave(token, messageInput, saveStatus) {
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
  } catch (error) {
    saveStatus.textContent = error instanceof GitHubError
      ? error.message
      : "Something went wrong saving.";
  }
}

render();
