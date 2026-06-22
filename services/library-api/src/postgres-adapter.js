const CAMEL_ALIASES = {
  sessionid: "sessionId", readdate: "readDate", ownrating: "ownRating",
  createdat: "createdAt", updatedat: "updatedAt", actiondate: "actionDate",
  authorid: "authorId", authorname: "authorName", titleid: "titleId",
  displayname: "displayName", missingcovers: "missingCovers",
  missingannotations: "missingAnnotations", missingauthors: "missingAuthors"
};

function translate(query) {
  let index = 0;
  return query
    .replace(/\s+COLLATE\s+NOCASE/gi, "")
    .replace(/\?/g, () => `$${++index}`);
}

function normalizeRow(row) {
  if (!row) return null;
  const result = { ...row };
  for (const [key, value] of Object.entries(row)) {
    const alias = CAMEL_ALIASES[key];
    if (alias) result[alias] = value;
  }
  return result;
}

class Statement {
  constructor(client, query, params = [], executor = null) {
    this.client = client;
    this.query = query;
    this.params = params;
    this.executor = executor;
  }

  bind(...params) { return new Statement(this.client, this.query, params, this.executor); }

  async rows(client = this.client) {
    if (this.executor) return this.executor(client);
    const rows = await client.unsafe(translate(this.query), this.params);
    return rows.map(normalizeRow);
  }

  async first() { return (await this.rows())[0] || null; }
  async all() { return { results: await this.rows() }; }
  async run() { await this.rows(); return { success: true }; }
}

export function createPostgresAdapter(sql) {
  return {
    dialect: "postgres",
    prepare(query) { return new Statement(sql, query); },
    bulkItems(items) {
      return new Statement(sql, "", [], async client => {
        for (const item of items) {
          await client`
            INSERT INTO library_items (
              id,title,author,item_type,reading_status,cover_url,hd_cover_url,isbn,publisher,
              publication_date,language,series,genres,annotation,read_date,rating,review,quotes,
              acquired_on,purchase_cost_cents,is_sold,sold_on,sale_price_cents,added
            ) VALUES (
              ${item.id},${item.title},${item.author},${item.type},${item.status},${item.cover},${item.hdCover},
              ${item.isbn},${item.publisher},${item.pubDate},${item.language},${item.series},${JSON.stringify(item.genres)},
              ${item.annotation},${item.read},${item.rating},${item.review},${JSON.stringify(item.quotes)},${item.acquired},
              ${item.cost == null ? null : Math.round(item.cost * 100)},${item.sold ? 1 : 0},${item.soldDate},
              ${item.soldPrice == null ? null : Math.round(item.soldPrice * 100)},${item.added}
            ) ON CONFLICT (id) DO UPDATE SET
              title=EXCLUDED.title,author=EXCLUDED.author,item_type=EXCLUDED.item_type,
              reading_status=EXCLUDED.reading_status,cover_url=EXCLUDED.cover_url,
              hd_cover_url=EXCLUDED.hd_cover_url,isbn=EXCLUDED.isbn,publisher=EXCLUDED.publisher,
              publication_date=EXCLUDED.publication_date,language=EXCLUDED.language,series=EXCLUDED.series,
              genres=EXCLUDED.genres,annotation=EXCLUDED.annotation,read_date=EXCLUDED.read_date,
              rating=EXCLUDED.rating,review=EXCLUDED.review,quotes=EXCLUDED.quotes,
              acquired_on=EXCLUDED.acquired_on,purchase_cost_cents=EXCLUDED.purchase_cost_cents,
              is_sold=EXCLUDED.is_sold,sold_on=EXCLUDED.sold_on,sale_price_cents=EXCLUDED.sale_price_cents,
              added=EXCLUDED.added
          `;
        }
        return [];
      });
    },
    async batch(statements) {
      return sql.begin(async transaction => {
        const output = [];
        for (const statement of statements) output.push({ results: await statement.rows(transaction) });
        return output;
      });
    }
  };
}
