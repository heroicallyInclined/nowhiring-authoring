import {
  createBlob,
  createTree,
  createCommit,
  createRef,
  updateRef,
  getCommitTree,
  matchingBranches,
  findOpenPullRequest,
  createPullRequest,
} from "./github.js";

// One branch per day of saves, not per save, so a second Save in the same
// session lands as a second commit on the same PR rather than a new one.
let session = null;

function datePrefix(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `balance/${y}-${m}-${d}`;
}

function newBranchName(date) {
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${datePrefix(date)}-${h}${min}`;
}

async function ensureSession(token, org, repo, loaded) {
  if (session) return session;

  const existing = await matchingBranches(token, org, repo, datePrefix(new Date()));
  if (existing.length > 0) {
    const [latest] = existing.sort((a, b) => (a.ref < b.ref ? 1 : -1));
    const branch = latest.ref.replace("refs/heads/", "");
    const parentSha = latest.object.sha;
    const baseTree = await getCommitTree(token, org, repo, parentSha);
    const pr = await findOpenPullRequest(token, org, repo, branch);
    session = { branch, parentSha, baseTree, prNumber: pr?.number ?? null, prUrl: pr?.html_url ?? null, isNewBranch: false };
  } else {
    session = { branch: newBranchName(new Date()), parentSha: loaded.sha, baseTree: loaded.treeSha, prNumber: null, prUrl: null, isNewBranch: true };
  }
  return session;
}

// changedTables: Map<tableName, newRawText> — already filtered to what actually differs.
export async function saveChanges(token, org, repo, loaded, changedTables, message) {
  const s = await ensureSession(token, org, repo, loaded);

  const entries = [];
  for (const [name, text] of changedTables) {
    const sha = await createBlob(token, org, repo, text);
    entries.push({ path: `data/${name}.json`, mode: "100644", type: "blob", sha });
  }

  const treeSha = await createTree(token, org, repo, s.baseTree, entries);
  const commit = await createCommit(token, org, repo, message, treeSha, s.parentSha);

  if (s.isNewBranch) {
    await createRef(token, org, repo, s.branch, commit.sha);
    s.isNewBranch = false;
  } else {
    await updateRef(token, org, repo, s.branch, commit.sha);
  }

  s.parentSha = commit.sha;
  s.baseTree = commit.tree.sha;

  if (!s.prNumber) {
    const pr = await createPullRequest(token, org, repo, s.branch, message);
    s.prNumber = pr.number;
    s.prUrl = pr.html_url;
  }

  return { branch: s.branch, prNumber: s.prNumber, prUrl: s.prUrl };
}
