import postgres from "postgres";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const sql = postgres(process.env.DATABASE_URL, { ssl: process.env.DATABASE_SSL === "true" ? "require" : false, max: 1 });
const [{ count }] = await sql`SELECT count(*)::int count FROM library_items`;
if (count > 0) {
  console.log(`seed skipped: ${count} titles already exist`);
  await sql.end();
  process.exit(0);
}

const path = resolve(dirname(fileURLToPath(import.meta.url)), "../seeds/catalog.json");
const source = JSON.parse(await readFile(path, "utf8"));
const rows = source.map(item => ({
  id: item.id, title: item.title, author: item.author || "", item_type: item.type || "Книга",
  reading_status: item.status || (item.read ? "Прочитал" : "Хочу прочитать"),
  cover_url: item.cover || "", hd_cover_url: item.hdCover || "", isbn: item.isbn || "",
  publisher: item.publisher || "", publication_date: item.pubDate || "", language: item.language || "",
  series: item.series || "", genres: JSON.stringify(Array.isArray(item.genres) ? item.genres : String(item.genres || "").split(",").map(x => x.trim()).filter(Boolean)),
  annotation: item.annotation || "", read_date: item.read || "", rating: Number(item.rating) || 0,
  review: item.review || "", quotes: JSON.stringify(item.quotes || []), acquired_on: item.acquired || "",
  purchase_cost_cents: item.cost == null ? null : Math.round(Number(item.cost) * 100),
  is_sold: item.sold ? 1 : 0, sold_on: item.soldDate || "",
  sale_price_cents: item.soldPrice == null ? null : Math.round(Number(item.soldPrice) * 100),
  added: Number(item.added) || Date.now()
}));

await sql.begin(async transaction => {
  for (let offset = 0; offset < rows.length; offset += 200) {
    const batch = rows.slice(offset, offset + 200);
    await transaction`INSERT INTO library_items ${transaction(batch)} ON CONFLICT (id) DO NOTHING`;
  }
  await transaction`UPDATE library_settings SET initialized=1, updated_at=NOW() WHERE id=1`;
});
console.log(`seeded ${rows.length} titles`);
await sql.end();
