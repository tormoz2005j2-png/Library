import postgres from "postgres";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../migrations-postgres");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const sql = postgres(process.env.DATABASE_URL, { ssl: process.env.DATABASE_SSL === "true" ? "require" : false, max: 1 });

await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
const applied = new Set((await sql`SELECT name FROM schema_migrations`).map(row => row.name));
for (const name of (await readdir(root)).filter(name => name.endsWith(".sql")).sort()) {
  if (applied.has(name)) continue;
  const source = await readFile(resolve(root, name), "utf8");
  await sql.begin(async transaction => {
    await transaction.unsafe(source, [], { prepare: false });
    await transaction`INSERT INTO schema_migrations (name) VALUES (${name})`;
  });
  console.log(`applied ${name}`);
}
await sql.end();
