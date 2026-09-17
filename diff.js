// Line-level diff via the classic LCS table. Files here run to a few hundred
// lines at most, so the O(n*m) table is cheap; this is a save-time preview,
// not a hot path.
export function lineDiff(oldText, newText) {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const n = a.length;
  const m = b.length;

  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const rows = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ type: "same", line: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      rows.push({ type: "del", line: a[i] });
      i++;
    } else {
      rows.push({ type: "add", line: b[j] });
      j++;
    }
  }
  while (i < n) rows.push({ type: "del", line: a[i++] });
  while (j < m) rows.push({ type: "add", line: b[j++] });

  return rows;
}

// Collapses runs of unchanged lines to `context` lines around each change, so
// a one-line edit in a 60-line file previews as a few lines, not the whole
// file.
export function hunks(rows, context = 2) {
  const changedAt = new Set();
  rows.forEach((row, index) => {
    if (row.type !== "same") {
      for (let k = index - context; k <= index + context; k++) changedAt.add(k);
    }
  });
  if (changedAt.size === 0) return [];

  const out = [];
  let lastPrinted = -2;
  for (let index = 0; index < rows.length; index++) {
    if (!changedAt.has(index)) continue;
    if (index > lastPrinted + 1) out.push({ type: "gap" });
    out.push({ ...rows[index], index });
    lastPrinted = index;
  }
  return out;
}
