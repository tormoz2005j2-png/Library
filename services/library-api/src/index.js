const CURRENCIES = new Set(["€", "$", "₽", "£", "¥"]);
const ITEM_TYPES = new Set(["Книга", "Комикс", "Манга"]);
const STATUSES = new Set(["Хочу прочитать", "Читаю сейчас", "Прочитал", "Перечитал", "Не дочитал"]);
const RATINGS = new Set([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]);

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env.ALLOWED_ORIGINS);

    if (request.method === "OPTIONS") {
      return originAllowed(origin, env.ALLOWED_ORIGINS)
        ? new Response(null, { status: 204, headers: cors })
        : json({ error: "Источник запроса запрещён." }, 403, cors);
    }

    if (origin && !originAllowed(origin, env.ALLOWED_ORIGINS)) {
      return json({ error: "Источник запроса запрещён." }, 403, cors);
    }

    if (!env.LIBRARY_TOKEN || !(await tokensEqual(request.headers.get("X-Library-Token"), env.LIBRARY_TOKEN))) {
      return json({ error: "Неверный ключ доступа." }, 401, cors);
    }

    try {
      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/api/library") {
        return json(await loadLibrary(env.DB), 200, cors);
      }

      if (request.method === "PUT" && url.pathname === "/api/settings") {
        const body = await readJson(request);
        validateCurrency(body.currency);
        await env.DB.prepare(
          "INSERT INTO library_settings (id, currency, initialized, updated_at) VALUES (1, ?, 1, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET currency = excluded.currency, updated_at = CURRENT_TIMESTAMP"
        ).bind(body.currency).run();
        return json({ ok: true }, 200, cors);
      }

      if (request.method === "PUT" && url.pathname === "/api/items") {
        const item = normalizeItem(await readJson(request));
        await itemStatement(env.DB, item).run();
        return json({ item }, 200, cors);
      }

      if (request.method === "DELETE" && url.pathname.startsWith("/api/items/")) {
        const id = decodeURIComponent(url.pathname.slice("/api/items/".length));
        if (!id || id.length > 100) throw new ApiError("Некорректный идентификатор.", 400);
        await env.DB.prepare("DELETE FROM library_items WHERE id = ?").bind(id).run();
        return json({ ok: true }, 200, cors);
      }

      if (request.method === "PUT" && url.pathname === "/api/library") {
        const body = await readJson(request);
        validateCurrency(body.currency);
        if (!Array.isArray(body.items) || body.items.length > 10000) {
          throw new ApiError("Некорректный список книг.", 400);
        }
        const items = body.items.map(normalizeItem);
        const uniqueIds = new Set(items.map(item => item.id));
        if (uniqueIds.size !== items.length) throw new ApiError("В библиотеке есть повторяющиеся ID.", 400);

        const statements = [
          env.DB.prepare("DELETE FROM library_items"),
          env.DB.prepare(
            "INSERT INTO library_settings (id, currency, initialized, updated_at) VALUES (1, ?, 1, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET currency = excluded.currency, initialized = 1, updated_at = CURRENT_TIMESTAMP"
          ).bind(body.currency),
          bulkItemsStatement(env.DB, items)
        ];
        await env.DB.batch(statements);
        return json({ ok: true, count: items.length }, 200, cors);
      }

      return json({ error: "Маршрут не найден." }, 404, cors);
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 500;
      if (status === 500) console.error(error);
      return json({ error: status === 500 ? "Внутренняя ошибка сервера." : error.message }, status, cors);
    }
  }
};

class ApiError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new ApiError("Ожидался корректный JSON.", 400);
  }
}

function normalizeItem(value) {
  const item = value && typeof value === "object" ? value : {};
  const rating = Number(item.rating) || 0;
  const normalized = {
    id: text(item.id, 100),
    title: text(item.title, 500).trim(),
    author: text(item.author, 500),
    type: text(item.type, 30),
    status: text(item.status, 40),
    cover: text(item.cover, 2000),
    hdCover: text(item.hdCover, 2000),
    isbn: text(item.isbn, 100),
    publisher: text(item.publisher, 500),
    pubDate: text(item.pubDate, 50),
    language: text(item.language, 100),
    series: text(item.series, 500),
    genres: normalizeList(item.genres, 100),
    annotation: text(item.annotation, 30000),
    read: text(item.read, 10),
    rating,
    review: text(item.review, 50000),
    quotes: normalizeList(item.quotes, 500),
    acquired: text(item.acquired, 10),
    cost: nullableNumber(item.cost),
    sold: Boolean(item.sold),
    soldDate: text(item.soldDate, 10),
    soldPrice: nullableNumber(item.soldPrice),
    added: Number.isFinite(Number(item.added)) ? Math.trunc(Number(item.added)) : Date.now()
  };

  if (!/^[A-Za-z0-9_-]{1,100}$/.test(normalized.id) || !normalized.title) {
    throw new ApiError("У книги должны быть безопасный ID и название.", 400);
  }
  if (!ITEM_TYPES.has(normalized.type)) throw new ApiError("Некорректный тип книги.", 400);
  if (!STATUSES.has(normalized.status)) throw new ApiError("Некорректный статус чтения.", 400);
  if (!RATINGS.has(normalized.rating)) throw new ApiError("Некорректная оценка.", 400);
  if (!validPartialDate(normalized.read)) throw new ApiError("Некорректная дата прочтения.", 400);
  if (!validFullDate(normalized.acquired)) throw new ApiError("Некорректная дата приобретения.", 400);
  if (!validFullDate(normalized.soldDate)) throw new ApiError("Некорректная дата продажи.", 400);
  if (normalized.cost !== null && normalized.cost < 0) throw new ApiError("Стоимость не может быть отрицательной.", 400);
  if (normalized.soldPrice !== null && normalized.soldPrice < 0) throw new ApiError("Цена продажи не может быть отрицательной.", 400);
  return normalized;
}

function text(value, maxLength) {
  const result = String(value ?? "");
  if (result.length > maxLength) throw new ApiError(`Текстовое поле превышает ${maxLength} символов.`, 400);
  return result;
}

function normalizeList(value, maxItems) {
  const list = Array.isArray(value)
    ? value
    : String(value || "").split(",");
  const normalized = list.map(entry => String(entry).trim()).filter(Boolean);
  if (normalized.length > maxItems) throw new ApiError(`В списке допускается не более ${maxItems} значений.`, 400);
  if (normalized.some(entry => entry.length > 5000)) throw new ApiError("Элемент списка слишком длинный.", 400);
  return normalized;
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new ApiError("Некорректное числовое значение.", 400);
  return Math.round(number * 100) / 100;
}

function validPartialDate(value) {
  if (!value) return true;
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(value);
  if (!match) return false;
  if (!match[2]) return true;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return false;
  if (!match[3]) return true;
  const day = Number(match[3]);
  const date = new Date(Date.UTC(Number(match[1]), month - 1, day));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validFullDate(value) {
  return !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && validPartialDate(value));
}

function validateCurrency(currency) {
  if (!CURRENCIES.has(currency)) throw new ApiError("Некорректная валюта.", 400);
}

function itemStatement(db, item) {
  return db.prepare(`
    INSERT INTO library_items (
      id, title, author, item_type, reading_status, cover_url, hd_cover_url, isbn,
      publisher, publication_date, language, series, genres, annotation, read_date,
      rating, review, quotes, acquired_on, purchase_cost_cents, is_sold, sold_on, sale_price_cents, added
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title, author=excluded.author, item_type=excluded.item_type,
      reading_status=excluded.reading_status, cover_url=excluded.cover_url,
      hd_cover_url=excluded.hd_cover_url, isbn=excluded.isbn, publisher=excluded.publisher,
      publication_date=excluded.publication_date, language=excluded.language, series=excluded.series,
      genres=excluded.genres, annotation=excluded.annotation, read_date=excluded.read_date,
      rating=excluded.rating, review=excluded.review, quotes=excluded.quotes,
      acquired_on=excluded.acquired_on, purchase_cost_cents=excluded.purchase_cost_cents,
      is_sold=excluded.is_sold, sold_on=excluded.sold_on, sale_price_cents=excluded.sale_price_cents,
      added=excluded.added
  `).bind(
    item.id, item.title, item.author, item.type, item.status, item.cover, item.hdCover,
    item.isbn, item.publisher, item.pubDate, item.language, item.series,
    JSON.stringify(item.genres), item.annotation, item.read, item.rating, item.review,
    JSON.stringify(item.quotes), item.acquired, toCents(item.cost), item.sold ? 1 : 0,
    item.soldDate, toCents(item.soldPrice), item.added
  );
}

function bulkItemsStatement(db, items) {
  return db.prepare(`
    INSERT INTO library_items (
      id, title, author, item_type, reading_status, cover_url, hd_cover_url, isbn,
      publisher, publication_date, language, series, genres, annotation, read_date,
      rating, review, quotes, acquired_on, purchase_cost_cents, is_sold, sold_on, sale_price_cents, added
    )
    SELECT
      json_extract(value, '$.id'), json_extract(value, '$.title'), json_extract(value, '$.author'),
      json_extract(value, '$.type'), json_extract(value, '$.status'), json_extract(value, '$.cover'),
      json_extract(value, '$.hdCover'), json_extract(value, '$.isbn'), json_extract(value, '$.publisher'),
      json_extract(value, '$.pubDate'), json_extract(value, '$.language'), json_extract(value, '$.series'),
      json_extract(value, '$.genres'), json_extract(value, '$.annotation'), json_extract(value, '$.read'),
      json_extract(value, '$.rating'), json_extract(value, '$.review'), json_extract(value, '$.quotes'),
      json_extract(value, '$.acquired'), round(json_extract(value, '$.cost') * 100), json_extract(value, '$.sold'),
      json_extract(value, '$.soldDate'), round(json_extract(value, '$.soldPrice') * 100), json_extract(value, '$.added')
    FROM json_each(?)
  `).bind(JSON.stringify(items));
}

async function loadLibrary(db) {
  const [settings, items] = await db.batch([
    db.prepare("SELECT currency, initialized FROM library_settings WHERE id = 1"),
    db.prepare("SELECT * FROM library_items ORDER BY added DESC")
  ]);
  return {
    currency: settings.results[0]?.currency || "€",
    initialized: Boolean(settings.results[0]?.initialized),
    items: items.results.map(rowToItem)
  };
}

function rowToItem(row) {
  return {
    id: row.id, title: row.title, author: row.author, type: row.item_type,
    status: row.reading_status, cover: row.cover_url, hdCover: row.hd_cover_url,
    isbn: row.isbn, publisher: row.publisher, pubDate: row.publication_date,
    language: row.language, series: row.series, genres: JSON.parse(row.genres).join(", "),
    annotation: row.annotation, read: row.read_date, rating: row.rating,
    review: row.review, quotes: JSON.parse(row.quotes), acquired: row.acquired_on,
    cost: fromCents(row.purchase_cost_cents), sold: Boolean(row.is_sold), soldDate: row.sold_on,
    soldPrice: fromCents(row.sale_price_cents), added: row.added
  };
}

function toCents(value) {
  return value === null ? null : Math.round(value * 100);
}

function fromCents(value) {
  return value === null ? null : value / 100;
}

function originAllowed(origin, configured) {
  if (!origin) return true;
  return String(configured || "").split(",").map(value => value.trim()).includes(origin);
}

function corsHeaders(origin, configured) {
  const allowed = originAllowed(origin, configured) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "Content-Type, X-Library-Token",
    "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
    "Cache-Control": "no-store",
    "Vary": "Origin"
  };
}

async function tokensEqual(received, expected) {
  if (!received || !expected) return false;
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(received)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected))
  ]);
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) difference |= left[i] ^ right[i];
  return difference === 0;
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" }
  });
}
