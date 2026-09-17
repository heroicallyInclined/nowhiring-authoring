import { getCheckRuns, getJobLog } from "./github.js";

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

const TIMESTAMP_PREFIX = /^\S+ /;
const ANSI_ESCAPE = /\x1b\[[0-9;]*[a-zA-Z]/g;

function cleanLine(line) {
  return line.replace(TIMESTAMP_PREFIX, "").replace(ANSI_ESCAPE, "");
}

// GUT's own "Run Summary" block already names the failing test and the
// assertion — everything after it is Actions' post-job cleanup noise, and
// everything before it is import/reimport chatter. A job that failed before
// tests ran (no Godot, bad --import) has no such block, so fall back to a
// fixed tail.
export function logTail(rawLog, fallbackLines = 40) {
  const lines = rawLog.split("\n").map(cleanLine);
  const bannerAt = lines.findIndex((line) => line.includes("Run Summary"));

  const from = bannerAt === -1 ? Math.max(0, lines.length - fallbackLines) : bannerAt - 1;
  const stopAt = lines.findIndex((line, i) => i > from && line.startsWith("##[error]"));
  const to = stopAt === -1 ? lines.length : stopAt;

  return lines.slice(from, to).join("\n").trim();
}

// Polls check-runs for `sha` until every run completes or the timeout
// elapses, calling `onUpdate` with each state change. Returns a function
// that cancels the poll.
export function pollChecks(token, org, repo, sha, onUpdate) {
  let stopped = false;
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  async function tick() {
    if (stopped) return;

    const { check_runs } = await getCheckRuns(token, org, repo, sha);
    const reschedule = () => {
      if (Date.now() < deadline) setTimeout(tick, POLL_INTERVAL_MS);
      else onUpdate({ state: "timeout" });
    };

    if (check_runs.length === 0 || check_runs.some((run) => run.status !== "completed")) {
      onUpdate({ state: "pending", runs: check_runs });
      reschedule();
      return;
    }

    const failed = check_runs.find((run) => run.conclusion !== "success");
    if (!failed) {
      onUpdate({ state: "pass", runs: check_runs });
      return;
    }

    const rawLog = await getJobLog(token, org, repo, failed.id);
    onUpdate({ state: "fail", run: failed, tail: logTail(rawLog) });
  }

  tick();
  return () => {
    stopped = true;
  };
}
