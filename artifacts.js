// Fetches tools/world_probe.gd's `world` artifact (plans/authoring-tool-
// task9.md Task 9.3) — the derived-odds JSON the .github/workflows/
// content.yml pipeline uploads for both a PR's head commit and main's own
// baseline (once Task 9.2's push trigger has run there). GitHub Actions
// artifacts always come back as a zip; fflate is vendored (no CDN, per
// Task 1's rule) to unzip the one world.json entry.
import { getWorkflowRuns, listRunArtifacts, downloadArtifact } from "./github.js";
import { unzipSync, strFromU8 } from "./vendor/fflate/browser.js";

export function unzipWorldJson(arrayBuffer) {
  const files = unzipSync(new Uint8Array(arrayBuffer));
  const entry = files["world.json"];
  if (!entry) throw new Error("Artifact zip has no world.json entry.");
  return JSON.parse(strFromU8(entry));
}

// `ref` is `{ headSha }` for this save's own commit, or `{ branch }` for the
// latest successful run there (main's baseline). Returns null when there is
// no matching successful run yet, or no `world` artifact on it — a caller
// treats that as "not available yet", not an error.
export async function fetchWorldJson(token, org, repo, ref) {
  const { workflow_runs } = await getWorkflowRuns(
    token, org, repo,
    ref.headSha ? { headSha: ref.headSha } : { branch: ref.branch, status: "success" },
  );
  const run = ref.headSha
    ? workflow_runs.find((r) => r.status === "completed" && r.conclusion === "success")
    : workflow_runs[0];
  if (!run) return null;

  const { artifacts } = await listRunArtifacts(token, org, repo, run.id);
  const worldArtifact = artifacts.find((a) => a.name === "world");
  if (!worldArtifact) return null;

  const arrayBuffer = await downloadArtifact(token, org, repo, worldArtifact.id);
  return unzipWorldJson(arrayBuffer);
}
