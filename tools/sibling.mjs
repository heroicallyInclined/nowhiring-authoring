import { readdirSync } from "node:fs";

const SCHEMA_DIR = new URL("../../nowHiringHeroes/data/schema/", import.meta.url);

export function tableNames() {
  return readdirSync(SCHEMA_DIR)
    .filter((name) => name.endsWith(".schema.json"))
    .map((name) => name.slice(0, -".schema.json".length));
}
