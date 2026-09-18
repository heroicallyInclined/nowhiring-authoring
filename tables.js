import { ghFetch, tokenExpiration } from "./github.js";

// ContentDB.TABLES (sim/content_db.gd) is the source of truth for this list.
export const TABLE_NAMES = [
  "objectives",
  "locations",
  "archetypes",
  "quirks",
  "amenities",
  "interrupts",
  "prices",
  "ingredients",
  "recipes",
  "inn",
  "guest_schedule",
  "bands",
  "attraction",
  "run",
  "names",
  "notice",
];

// Pinning every table read to one commit sha is what makes a later commit
// honest: if main moved underneath the session, GitHub reports a real
// conflict instead of silently reverting the edit.
export async function loadTables(token, org, repo) {
  const commitResponse = await ghFetch(token, `/repos/${org}/${repo}/commits/main`);
  const expiry = tokenExpiration(commitResponse);
  const { sha, commit } = await commitResponse.json();
  const treeSha = commit.tree.sha;

  const tables = new Map();
  await Promise.all(TABLE_NAMES.map(async (name) => {
    // vnd.github.raw returns the blob text already UTF-8 decoded; the base64
    // `content` field is latin-1 through atob and would mojibake the three
    // tables with multi-byte characters (amenities, objectives, recipes).
    const response = await ghFetch(token, `/repos/${org}/${repo}/contents/data/${name}.json?ref=${sha}`, {
      headers: { Accept: "application/vnd.github.raw" },
    });
    tables.set(name, await response.text());
  }));

  return { sha, treeSha, expiry, tables };
}

// Schemas (data/schema/<table>.schema.json, plans/authoring-tool.md Task 7)
// aren't edited and don't need pinning against a later save — read once per
// session, parsed immediately since every consumer (graph.js, the views)
// wants the schema object, never its source text.
export async function loadSchemas(token, org, repo, sha) {
  const schemas = new Map();
  await Promise.all(TABLE_NAMES.map(async (name) => {
    const response = await ghFetch(token, `/repos/${org}/${repo}/contents/data/schema/${name}.schema.json?ref=${sha}`, {
      headers: { Accept: "application/vnd.github.raw" },
    });
    schemas.set(name, JSON.parse(await response.text()));
  }));
  return schemas;
}
