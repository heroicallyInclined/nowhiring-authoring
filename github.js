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
