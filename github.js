const API_ROOT = "https://api.github.com";

const STATUS_MESSAGES = {
  401: "That token was rejected. Check it was copied in full.",
  403: "That token does not have access to this repository.",
  404: "Repository or path not found — check the token's repository access.",
};

export class GitHubError extends Error {}

// Task 1's proof: a wrong token must surface a sentence, never a blank page.
export async function ghFetch(token, path, options = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    throw new GitHubError(STATUS_MESSAGES[response.status] || `GitHub returned ${response.status}.`);
  }

  return response;
}

export function tokenExpiration(response) {
  return response.headers.get("github-authentication-token-expiration");
}

function jsonPost(token, path, body, method = "POST") {
  return ghFetch(token, path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((response) => response.json());
}

export async function createBlob(token, org, repo, content) {
  const { sha } = await jsonPost(token, `/repos/${org}/${repo}/git/blobs`, { content, encoding: "utf-8" });
  return sha;
}

export async function createTree(token, org, repo, baseTree, entries) {
  const { sha } = await jsonPost(token, `/repos/${org}/${repo}/git/trees`, { base_tree: baseTree, tree: entries });
  return sha;
}

export function createCommit(token, org, repo, message, tree, parent) {
  return jsonPost(token, `/repos/${org}/${repo}/git/commits`, { message, tree, parents: [parent] });
}

export async function getCommitTree(token, org, repo, sha) {
  const response = await ghFetch(token, `/repos/${org}/${repo}/git/commits/${sha}`);
  const { tree } = await response.json();
  return tree.sha;
}

export function createRef(token, org, repo, branch, sha) {
  return jsonPost(token, `/repos/${org}/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha });
}

export function updateRef(token, org, repo, branch, sha) {
  return jsonPost(token, `/repos/${org}/${repo}/git/refs/heads/${branch}`, { sha, force: false }, "PATCH");
}

// A ref path prefix has no fixed length, so matching-refs is the only reliable
// way to find whichever balance/<today> branch a prior save this day created.
export async function matchingBranches(token, org, repo, prefix) {
  const response = await ghFetch(token, `/repos/${org}/${repo}/git/matching-refs/heads/${prefix}`);
  return response.json();
}

export async function findOpenPullRequest(token, org, repo, branch) {
  const response = await ghFetch(token, `/repos/${org}/${repo}/pulls?head=${org}:${branch}&state=open`);
  const [pr] = await response.json();
  return pr || null;
}

export function createPullRequest(token, org, repo, branch, title) {
  return jsonPost(token, `/repos/${org}/${repo}/pulls`, { title, head: branch, base: "main", body: title });
}
