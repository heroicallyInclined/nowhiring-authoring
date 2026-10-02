import { ghFetch, tokenExpiration } from "./github.js";

// test_content_tables.gd loads one schema per ContentDB.TABLES entry, so the
// schema directory's listing is that list — no hand copy to fall behind.
async function listTableNames(token, org, repo, sha) {
  const response = await ghFetch(token, `/repos/${org}/${repo}/contents/data/schema?ref=${sha}`);
  return (await response.json())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith(".schema.json"))
    .map((name) => name.slice(0, -".schema.json".length));
}

// Pinning every table read to one commit sha is what makes a later commit
// honest: if main moved underneath the session, GitHub reports a real
// conflict instead of silently reverting the edit.
export async function loadTables(token, org, repo) {
  const commitResponse = await ghFetch(token, `/repos/${org}/${repo}/commits/main`);
  const expiry = tokenExpiration(commitResponse);
  const { sha, commit } = await commitResponse.json();
  const treeSha = commit.tree.sha;
  const names = await listTableNames(token, org, repo, sha);

  const texts = await Promise.all(names.map(async (name) => {
    // vnd.github.raw returns the blob text already UTF-8 decoded; the base64
    // `content` field is latin-1 through atob and would mojibake the three
    // tables with multi-byte characters (amenities, objectives, recipes).
    const response = await ghFetch(token, `/repos/${org}/${repo}/contents/data/${name}.json?ref=${sha}`, {
      headers: { Accept: "application/vnd.github.raw" },
    });
    return response.text();
  }));
  const tables = new Map(names.map((name, i) => [name, texts[i]]));

  return { sha, treeSha, expiry, names, tables };
}

// Schemas (data/schema/<table>.schema.json, plans/authoring-tool.md Task 7)
// aren't edited and don't need pinning against a later save — read once per
// session, parsed immediately since every consumer (graph.js, the views)
// wants the schema object, never its source text.
export async function loadSchemas(token, org, repo, sha, names) {
  const schemas = new Map();
  await Promise.all(names.map(async (name) => {
    const response = await ghFetch(token, `/repos/${org}/${repo}/contents/data/schema/${name}.schema.json?ref=${sha}`, {
      headers: { Accept: "application/vnd.github.raw" },
    });
    schemas.set(name, JSON.parse(await response.text()));
  }));
  return schemas;
}
