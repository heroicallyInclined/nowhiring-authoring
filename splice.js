import { parseTree, findNodeAtLocation, applyEdits } from "./vendor/jsonc-parser/main.js";

// Every write here is a surgical text splice, never a parse-mutate-stringify
// round trip — see plans/authoring-tool.md Task 4. Only touch the exact byte
// range a change requires; everything else in the file is untouched text.

function literalFor(value) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  throw new Error(`splice: cannot write a literal for ${typeof value}`);
}

// Replaces the scalar value at `path` in place. The rest of the file's bytes
// are untouched, so a one-number change is a one-token diff.
export function spliceScalar(text, path, value) {
  const tree = parseTree(text);
  const node = findNodeAtLocation(tree, path);
  if (!node) throw new Error(`splice: no node at path ${JSON.stringify(path)}`);
  if (node.type === "object" || node.type === "array") {
    throw new Error(`splice: path ${JSON.stringify(path)} is a ${node.type}, not a scalar`);
  }
  return applyEdits(text, [{ offset: node.offset, length: node.length, content: literalFor(value) }]);
}

// Clones the raw source text of the array's last element (or `afterIndex`,
// if given), applies scalar edits to the clone, and inserts it as a new row —
// compaction and column alignment come from copying real bytes, never from
// an emitter. `edits` is [{path: [...fieldPath], value}], paths relative to
// the row itself.
export function spliceAddRow(text, arrayPath, edits, afterIndex = -1) {
  const tree = parseTree(text);
  const arrayNode = findNodeAtLocation(tree, arrayPath);
  if (!arrayNode || arrayNode.type !== "array") {
    throw new Error(`splice: path ${JSON.stringify(arrayPath)} is not an array`);
  }
  const children = arrayNode.children;
  const siblingIndex = afterIndex < 0 ? children.length - 1 : afterIndex;
  const sibling = children[siblingIndex];
  const isLastElement = siblingIndex === children.length - 1;

  const lineStart = text.lastIndexOf("\n", sibling.offset) + 1;
  const leading = text.slice(lineStart, sibling.offset);

  let rowText = text.slice(sibling.offset, sibling.offset + sibling.length);
  const rowTree = parseTree(rowText);
  // Apply from the highest offset down so earlier offsets stay valid as we splice.
  const rowEdits = edits
    .map(({ path, value }) => {
      const node = findNodeAtLocation(rowTree, path);
      if (!node) throw new Error(`splice: no field ${JSON.stringify(path)} on the cloned row`);
      return { offset: node.offset, length: node.length, content: literalFor(value) };
    })
    .sort((a, b) => b.offset - a.offset);
  for (const edit of rowEdits) {
    rowText = rowText.slice(0, edit.offset) + edit.content + rowText.slice(edit.offset + edit.length);
  }

  const afterSibling = sibling.offset + sibling.length;
  const hasCommaAfter = text[afterSibling] === ",";

  const insertion = isLastElement
    ? `,\n${leading}${rowText}`
    : `\n${leading}${rowText},`;
  const insertAt = hasCommaAfter ? afterSibling + 1 : afterSibling;

  return text.slice(0, insertAt) + insertion + text.slice(insertAt);
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (typeof a !== "object") return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key]));
}

// The mandatory guard: the spliced text must parse, and must parse to
// exactly the object the caller intended — not just at the edited path, so a
// splice that clobbered an unrelated byte range is caught too. Returns
// {ok: true} or {ok: false, reason}.
export function verifySplice(splicedText, intendedValue) {
  let parsed;
  try {
    parsed = JSON.parse(splicedText);
  } catch (error) {
    return { ok: false, reason: `spliced text is not valid JSON: ${error.message}` };
  }
  if (!deepEqual(parsed, intendedValue)) {
    return { ok: false, reason: "spliced text parses, but does not match the intended object" };
  }
  return { ok: true };
}
