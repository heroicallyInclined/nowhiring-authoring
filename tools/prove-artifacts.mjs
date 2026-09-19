// Dev-only proof for artifacts.js (Task 9.3) — not shipped, not referenced
// by index.html. Run with: node tools/prove-artifacts.mjs
//
// No live GitHub Actions run or browser is available in this environment
// (see that task's own open question), so this checks what's checkable
// without either: unzipWorldJson against a real zip built the same way
// GitHub Actions' upload-artifact@v4 would (one entry, world.json), using
// fflate's own zipSync rather than a hand-rolled zip byte layout.
import { zipSync, strToU8 } from "../vendor/fflate/browser.js";
import { unzipWorldJson } from "../artifacts.js";

let failures = 0;
function check(label, condition) {
  console.log(`${condition ? "ok" : "FAIL"} — ${label}`);
  if (!condition) failures++;
}

const world = { categories: { meat: { ladder: ["common", "rare"] } }, locations: {}, ingredients: {} };
const zipped = zipSync({ "world.json": strToU8(JSON.stringify(world)) });
const arrayBuffer = zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength);

const parsed = unzipWorldJson(arrayBuffer);
check("unzipWorldJson recovers the exact object", JSON.stringify(parsed) === JSON.stringify(world));

let threw = false;
try {
  unzipWorldJson(zipSync({ "not-world.json": strToU8("{}") }).buffer);
} catch {
  threw = true;
}
check("unzipWorldJson throws when the zip has no world.json entry", threw);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
console.log(
  "\nNot verified here: fetchWorldJson against a real GitHub Actions run — no live run or " +
  "browser in this environment. First real use should confirm the artifact-download redirect " +
  "lands on an already-whitelisted host (plans/authoring-tool-task9.md Task 9.3's open question).",
);
process.exit(failures === 0 ? 0 : 1);
