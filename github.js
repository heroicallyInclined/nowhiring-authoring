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

export async function getCheckRuns(token, org, repo, sha) {
  const response = await ghFetch(token, `/repos/${org}/${repo}/commits/${sha}/check-runs`);
  return response.json();
}

// A GitHub Actions check run's id is also its job id — verified against a
// live run rather than assumed. The redirect this hits lands on Azure Blob
// Storage, which strips our Authorization header (cross-origin) and answers
// with Access-Control-Allow-Origin: * on the log itself.
export async function getJobLog(token, org, repo, jobId) {
  const response = await ghFetch(token, `/repos/${org}/${repo}/actions/jobs/${jobId}/logs`);
  return response.text();
}

// A save's own commit (`{ headSha }`) or the latest successful run on a
// branch (`{ branch, status }`, e.g. main's baseline) — plans/authoring-
// tool-task9.md Task 9.3.
export async function getWorkflowRuns(token, org, repo, { headSha, branch, status } = {}) {
  const query = new URLSearchParams();
  if (headSha) query.set("head_sha", headSha);
  if (branch) query.set("branch", branch);
  if (status) query.set("status", status);
  const response = await ghFetch(token, `/repos/${org}/${repo}/actions/runs?${query}`);
  return response.json();
}

export async function listRunArtifacts(token, org, repo, runId) {
  const response = await ghFetch(token, `/repos/${org}/${repo}/actions/runs/${runId}/artifacts`);
  return response.json();
}

// Redirects the same way getJobLog's does (Azure Blob Storage, Authorization
// stripped on the cross-origin hop, Access-Control-Allow-Origin: * on the
// answer) — assumed by analogy, not independently confirmed; see
// plans/authoring-tool-task9.md Task 9.3's own open question. The response
// is a binary zip, so it's read as an ArrayBuffer rather than json()/text().
export async function downloadArtifact(token, org, repo, artifactId) {
  const response = await ghFetch(token, `/repos/${org}/${repo}/actions/artifacts/${artifactId}/zip/zip`);
  return response.arrayBuffer();
}
