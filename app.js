import { ghFetch, GitHubError, tokenExpiration } from "./github.js";

const ORG = "heroicallyInclined";
const REPO = "nowHiringHeroes";
const TOKEN_KEY = "nowhiring-authoring-token";

const app = document.getElementById("app");

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
  status.textContent = "Checking token…";
  section.appendChild(status);

  const list = document.createElement("ul");
  section.appendChild(list);

  checkTokenAndListData(token, status, list);

  return section;
}

async function checkTokenAndListData(token, status, list) {
  try {
    const response = await ghFetch(token, `/repos/${ORG}/${REPO}/contents/data`);
    const expiry = tokenExpiration(response);
    const entries = await response.json();

    status.textContent = expiry ? `Authorized. Token expires ${expiry}.` : "Authorized.";

    for (const entry of entries) {
      const item = document.createElement("li");
      item.textContent = entry.name;
      list.appendChild(item);
    }
  } catch (error) {
    status.textContent = error instanceof GitHubError
      ? error.message
      : "Something went wrong reaching GitHub.";
  }
}

render();
