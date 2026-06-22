const CURRENCIES = new Set(["EUR", "USD", "RUB", "GBP", "JPY"]);
const ITEM_TYPES = new Set(["Книга", "Комикс", "Манга"]);
const LEGACY_STATUSES = new Set(["Хочу прочитать", "Читаю сейчас", "Прочитал", "Перечитал", "Не дочитал"]);
const USER_STATUSES = new Set(["read", "purchased", "sold", "want_to_read", "reading", "on_hold"]);
const TRANSACTION_TYPES = new Set(["purchase", "sale"]);
const SESSION_DAYS = 30;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env.ALLOWED_ORIGINS);
    if (request.method === "OPTIONS") return originAllowed(origin, env.ALLOWED_ORIGINS)
      ? new Response(null, { status: 204, headers: cors }) : json({ error: "Источник запроса запрещён." }, 403, cors);
    if (origin && !originAllowed(origin, env.ALLOWED_ORIGINS)) return json({ error: "Источник запроса запрещён." }, 403, cors);

    try {
      const url = new URL(request.url);
      const path = url.pathname;
      const user = await optionalUser(request, env.DB);

      if (request.method === "POST" && path === "/api/auth/register") return json(await register(await readJson(request), env.DB), 201, cors);
      if (request.method === "POST" && path === "/api/auth/login") return json(await login(await readJson(request), env.DB), 200, cors);
      if (request.method === "POST" && path === "/api/auth/logout") {
        if (user) await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(user.sessionId).run();
        return json({ ok: true }, 200, cors);
      }
      if (request.method === "GET" && path === "/api/auth/me") return json({ user: user ? publicUser(user) : null }, 200, cors);

      if (request.method === "GET" && path === "/api/library") return json(await loadLibrary(env.DB, user?.id), 200, cors);
      if (request.method === "GET" && /^\/api\/titles\/[^/]+$/.test(path)) {
        const titleId = pathId(path, "/api/titles/");
        return json(await loadTitle(env.DB, titleId, user?.id), 200, cors);
      }
      if (request.method === "GET" && /^\/api\/titles\/[^/]+\/reviews$/.test(path)) {
        const titleId = decodeURIComponent(path.split("/")[3]);
        await assertTitle(env.DB, titleId);
        return json({ reviews: await reviewsForTitle(env.DB, titleId) }, 200, cors);
      }

      if (request.method === "GET" && path === "/api/profile") return json(await profile(env.DB, requireUser(user).id), 200, cors);
      if (request.method === "PUT" && /^\/api\/titles\/[^/]+\/status$/.test(path)) {
        const titleId = decodeURIComponent(path.split("/")[3]);
        return json(await saveStatus(env.DB, requireUser(user).id, titleId, await readJson(request)), 200, cors);
      }
      if (request.method === "POST" && /^\/api\/titles\/[^/]+\/transactions$/.test(path)) {
        const titleId = decodeURIComponent(path.split("/")[3]);
        return json(await createTransaction(env.DB, requireUser(user).id, titleId, await readJson(request)), 201, cors);
      }
      if (request.method === "DELETE" && path.startsWith("/api/transactions/")) {
        const id = pathId(path, "/api/transactions/");
        await deleteOwned(env.DB, "title_transactions", id, requireUser(user).id);
        return json({ ok: true }, 200, cors);
      }
      if (request.method === "PUT" && /^\/api\/titles\/[^/]+\/review$/.test(path)) {
        const titleId = decodeURIComponent(path.split("/")[3]);
        return json(await saveReview(env.DB, requireUser(user).id, titleId, await readJson(request)), 200, cors);
      }
      if (request.method === "DELETE" && /^\/api\/titles\/[^/]+\/review$/.test(path)) {
        const titleId = decodeURIComponent(path.split("/")[3]);
        await env.DB.prepare("DELETE FROM reviews WHERE user_id = ? AND title_id = ?").bind(requireUser(user).id, titleId).run();
        return json({ ok: true }, 200, cors);
      }

      // Изменение публичного каталога требует входа. userId всегда берётся из сессии.
      if (request.method === "PUT" && path === "/api/settings") {
        requireUser(user); const body = await readJson(request); validateSymbolCurrency(body.currency);
        await env.DB.prepare("INSERT INTO library_settings (id,currency,initialized) VALUES (1,?,1) ON CONFLICT(id) DO UPDATE SET currency=excluded.currency,updated_at=CURRENT_TIMESTAMP").bind(body.currency).run();
        return json({ ok: true }, 200, cors);
      }
      if (request.method === "PUT" && path === "/api/items") {
        requireUser(user); const item = normalizeItem(await readJson(request)); await itemStatement(env.DB, item).run();
        return json({ item }, 200, cors);
      }
      if (request.method === "DELETE" && path.startsWith("/api/items/")) {
        requireUser(user); await env.DB.prepare("DELETE FROM library_items WHERE id = ?").bind(pathId(path, "/api/items/")).run();
        return json({ ok: true }, 200, cors);
      }
      if (request.method === "PUT" && path === "/api/library") {
        requireUser(user); const body = await readJson(request); validateSymbolCurrency(body.currency);
        if (!Array.isArray(body.items) || body.items.length > 10000) throw new ApiError("Некорректный список тайтлов.");
        const items = body.items.map(normalizeItem);
        if (new Set(items.map(x => x.id)).size !== items.length) throw new ApiError("Повторяющиеся ID.");
        await env.DB.batch([env.DB.prepare("DELETE FROM library_items"), env.DB.prepare("UPDATE library_settings SET currency=?,initialized=1 WHERE id=1").bind(body.currency), bulkItemsStatement(env.DB, items)]);
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

class ApiError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
const requireUser = user => { if (!user) throw new ApiError("Войдите, чтобы выполнить это действие.", 401); return user; };
const publicUser = row => ({ id: row.id, email: row.email, displayName: row.display_name });

async function register(body, db) {
  const email = validEmail(body.email); const displayName = text(body.displayName, 80).trim(); const password = validPassword(body.password);
  if (displayName.length < 2) throw new ApiError("Имя должно содержать минимум 2 символа.");
  const exists = await db.prepare("SELECT 1 FROM users WHERE email = ? COLLATE NOCASE").bind(email).first();
  if (exists) throw new ApiError("Пользователь с таким email уже существует.", 409);
  const id = crypto.randomUUID(), salt = randomToken(16), hash = await hashPassword(password, salt);
  await db.prepare("INSERT INTO users(id,email,display_name,password_hash,password_salt) VALUES(?,?,?,?,?)").bind(id,email,displayName,hash,salt).run();
  return createSession(db, { id, email, display_name: displayName });
}
async function login(body, db) {
  const email = validEmail(body.email); const password = text(body.password, 200);
  const user = await db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").bind(email).first();
  if (!user || !(await constantEqual(await hashPassword(password, user.password_salt), user.password_hash))) throw new ApiError("Неверный email или пароль.", 401);
  return createSession(db, user);
}
async function createSession(db, user) {
  const token = randomToken(32), tokenHash = await sha256(token), id = crypto.randomUUID();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  await db.prepare("DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP").run();
  await db.prepare("INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)").bind(id,user.id,tokenHash,expires).run();
  return { user: publicUser(user), token, expiresAt: expires };
}
async function optionalUser(request, db) {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get("Authorization") || ""); if (!match) return null;
  const row = await db.prepare("SELECT u.*,s.id sessionId FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>CURRENT_TIMESTAMP").bind(await sha256(match[1])).first();
  return row || null;
}

async function loadLibrary(db, userId) {
  const [settings, items, statuses] = await db.batch([db.prepare("SELECT currency,initialized FROM library_settings WHERE id=1"), db.prepare("SELECT * FROM library_items ORDER BY added DESC"), userId ? db.prepare("SELECT title_id,status FROM user_title_statuses WHERE user_id=?").bind(userId) : db.prepare("SELECT title_id,status FROM user_title_statuses WHERE 0")]);
  const map = Object.fromEntries(statuses.results.map(x => [x.title_id, x.status]));
  return { currency: settings.results[0]?.currency || "€", initialized: Boolean(settings.results[0]?.initialized), items: items.results.map(x => ({ ...rowToItem(x), userStatus: map[x.id] || null })) };
}
async function loadTitle(db, titleId, userId) {
  const item = await db.prepare("SELECT * FROM library_items WHERE id=?").bind(titleId).first(); if (!item) throw new ApiError("Тайтл не найден.", 404);
  let status = null, transactions = [], ownReview = null;
  if (userId) {
    [status, ownReview] = await Promise.all([db.prepare("SELECT status FROM user_title_statuses WHERE user_id=? AND title_id=?").bind(userId,titleId).first(), db.prepare("SELECT id,body,rating,created_at createdAt,updated_at updatedAt FROM reviews WHERE user_id=? AND title_id=?").bind(userId,titleId).first()]);
    const result = await db.prepare("SELECT id,type,amount_cents,currency,action_date actionDate,comment,created_at createdAt,updated_at updatedAt FROM title_transactions WHERE user_id=? AND title_id=? ORDER BY action_date DESC,created_at DESC").bind(userId,titleId).all();
    transactions = result.results.map(transactionDto);
  }
  return { title: rowToItem(item), userStatus: status?.status || null, transactions, ownReview, reviews: await reviewsForTitle(db,titleId) };
}
async function saveStatus(db, userId, titleId, body) {
  await assertTitle(db,titleId); const status = text(body.status,30); if (!USER_STATUSES.has(status)) throw new ApiError("Некорректный статус.");
  await db.prepare("INSERT INTO user_title_statuses(user_id,title_id,status) VALUES(?,?,?) ON CONFLICT(user_id,title_id) DO UPDATE SET status=excluded.status").bind(userId,titleId,status).run();
  return { status };
}
async function createTransaction(db,userId,titleId,body) {
  await assertTitle(db,titleId); const type=text(body.type,20), currency=text(body.currency,3), amount=Number(body.amount), actionDate=validDate(body.actionDate), comment=text(body.comment,2000).trim();
  if (!TRANSACTION_TYPES.has(type)) throw new ApiError("Некорректный тип операции."); if (!Number.isFinite(amount) || amount < 0) throw new ApiError("Сумма должна быть числом не меньше нуля."); if (!CURRENCIES.has(currency)) throw new ApiError("Некорректная валюта.");
  const id=crypto.randomUUID(), cents=Math.round(amount*100); await db.prepare("INSERT INTO title_transactions(id,user_id,title_id,type,amount_cents,currency,action_date,comment) VALUES(?,?,?,?,?,?,?,?)").bind(id,userId,titleId,type,cents,currency,actionDate,comment).run();
  return { transaction:{ id,type,amount:cents/100,currency,actionDate,comment } };
}
async function saveReview(db,userId,titleId,body) {
  await assertTitle(db,titleId); const reviewBody=text(body.body,10000).trim(), rating=Number(body.rating); if (!reviewBody) throw new ApiError("Текст рецензии не должен быть пустым."); if (!Number.isInteger(rating)||rating<1||rating>10) throw new ApiError("Оценка должна быть от 1 до 10.");
  const id=crypto.randomUUID(); await db.prepare("INSERT INTO reviews(id,user_id,title_id,body,rating) VALUES(?,?,?,?,?) ON CONFLICT(user_id,title_id) DO UPDATE SET body=excluded.body,rating=excluded.rating").bind(id,userId,titleId,reviewBody,rating).run();
  return { review: await db.prepare("SELECT id,body,rating,created_at createdAt,updated_at updatedAt FROM reviews WHERE user_id=? AND title_id=?").bind(userId,titleId).first() };
}
async function reviewsForTitle(db,titleId) { const r=await db.prepare("SELECT r.id,r.body,r.rating,r.created_at createdAt,r.updated_at updatedAt,u.id authorId,u.display_name authorName FROM reviews r JOIN users u ON u.id=r.user_id WHERE r.title_id=? ORDER BY r.updated_at DESC").bind(titleId).all(); return r.results; }
async function profile(db,userId) {
  const [statuses,transactions,reviews]=await db.batch([db.prepare("SELECT s.status,s.updated_at updatedAt,i.id titleId,i.title,i.author,i.cover_url cover FROM user_title_statuses s JOIN library_items i ON i.id=s.title_id WHERE s.user_id=? ORDER BY s.updated_at DESC").bind(userId),db.prepare("SELECT t.id,t.title_id titleId,t.type,t.amount_cents,t.currency,t.action_date actionDate,t.comment,i.title FROM title_transactions t JOIN library_items i ON i.id=t.title_id WHERE t.user_id=? ORDER BY t.action_date DESC").bind(userId),db.prepare("SELECT r.id,r.title_id titleId,r.body,r.rating,r.updated_at updatedAt,i.title FROM reviews r JOIN library_items i ON i.id=r.title_id WHERE r.user_id=? ORDER BY r.updated_at DESC").bind(userId)]);
  const tx=transactions.results.map(transactionDto), totals={}; for(const t of tx){totals[t.currency] ||= { spent:0,received:0,difference:0 }; totals[t.currency][t.type==="purchase"?"spent":"received"]+=t.amount;} for(const v of Object.values(totals))v.difference=Math.round((v.received-v.spent)*100)/100;
  return { titles:statuses.results, transactions:tx, reviews:reviews.results, totals };
}
const transactionDto = x => ({ ...x, amount:x.amount_cents/100, amount_cents:undefined });
async function assertTitle(db,id){if(!id||!(await db.prepare("SELECT 1 FROM library_items WHERE id=?").bind(id).first()))throw new ApiError("Тайтл не найден.",404);}
async function deleteOwned(db,table,id,userId){const row=await db.prepare(`SELECT user_id FROM ${table} WHERE id=?`).bind(id).first();if(!row)throw new ApiError("Запись не найдена.",404);if(row.user_id!==userId)throw new ApiError("Нельзя изменять чужую запись.",403);await db.prepare(`DELETE FROM ${table} WHERE id=? AND user_id=?`).bind(id,userId).run();}

function normalizeItem(value){const x=value&&typeof value==="object"?value:{};const item={id:text(x.id,100),title:text(x.title,500).trim(),author:text(x.author,500),type:text(x.type,30)||"Книга",status:text(x.status,40)||"Хочу прочитать",cover:text(x.cover,2000),hdCover:text(x.hdCover,2000),isbn:text(x.isbn,100),publisher:text(x.publisher,500),pubDate:text(x.pubDate,50),language:text(x.language,100),series:text(x.series,500),genres:list(x.genres,100),annotation:text(x.annotation,30000),read:text(x.read,10),rating:Number(x.rating)||0,review:text(x.review,50000),quotes:list(x.quotes,500),acquired:text(x.acquired,10),cost:nullableNumber(x.cost),sold:Boolean(x.sold),soldDate:text(x.soldDate,10),soldPrice:nullableNumber(x.soldPrice),added:Number.isFinite(Number(x.added))?Math.trunc(Number(x.added)):Date.now()};if(!/^[A-Za-z0-9_-]{1,100}$/.test(item.id)||!item.title)throw new ApiError("У тайтла должны быть безопасный ID и название.");if(!ITEM_TYPES.has(item.type)||!LEGACY_STATUSES.has(item.status))throw new ApiError("Некорректный тип или статус каталога.");return item;}
function itemStatement(db,x){return db.prepare(`INSERT INTO library_items(id,title,author,item_type,reading_status,cover_url,hd_cover_url,isbn,publisher,publication_date,language,series,genres,annotation,read_date,rating,review,quotes,acquired_on,purchase_cost_cents,is_sold,sold_on,sale_price_cents,added) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,author=excluded.author,item_type=excluded.item_type,reading_status=excluded.reading_status,cover_url=excluded.cover_url,hd_cover_url=excluded.hd_cover_url,isbn=excluded.isbn,publisher=excluded.publisher,publication_date=excluded.publication_date,language=excluded.language,series=excluded.series,genres=excluded.genres,annotation=excluded.annotation,read_date=excluded.read_date,rating=excluded.rating,review=excluded.review,quotes=excluded.quotes,acquired_on=excluded.acquired_on,purchase_cost_cents=excluded.purchase_cost_cents,is_sold=excluded.is_sold,sold_on=excluded.sold_on,sale_price_cents=excluded.sale_price_cents,added=excluded.added`).bind(x.id,x.title,x.author,x.type,x.status,x.cover,x.hdCover,x.isbn,x.publisher,x.pubDate,x.language,x.series,JSON.stringify(x.genres),x.annotation,x.read,x.rating,x.review,JSON.stringify(x.quotes),x.acquired,toCents(x.cost),x.sold?1:0,x.soldDate,toCents(x.soldPrice),x.added);}
function bulkItemsStatement(db,items){return db.prepare(`INSERT INTO library_items(id,title,author,item_type,reading_status,cover_url,hd_cover_url,isbn,publisher,publication_date,language,series,genres,annotation,read_date,rating,review,quotes,acquired_on,purchase_cost_cents,is_sold,sold_on,sale_price_cents,added) SELECT json_extract(value,'$.id'),json_extract(value,'$.title'),json_extract(value,'$.author'),json_extract(value,'$.type'),json_extract(value,'$.status'),json_extract(value,'$.cover'),json_extract(value,'$.hdCover'),json_extract(value,'$.isbn'),json_extract(value,'$.publisher'),json_extract(value,'$.pubDate'),json_extract(value,'$.language'),json_extract(value,'$.series'),json_extract(value,'$.genres'),json_extract(value,'$.annotation'),json_extract(value,'$.read'),json_extract(value,'$.rating'),json_extract(value,'$.review'),json_extract(value,'$.quotes'),json_extract(value,'$.acquired'),round(json_extract(value,'$.cost')*100),json_extract(value,'$.sold'),json_extract(value,'$.soldDate'),round(json_extract(value,'$.soldPrice')*100),json_extract(value,'$.added') FROM json_each(?)`).bind(JSON.stringify(items));}
function rowToItem(r){return{id:r.id,title:r.title,author:r.author,type:r.item_type,status:r.reading_status,cover:r.cover_url,hdCover:r.hd_cover_url,isbn:r.isbn,publisher:r.publisher,pubDate:r.publication_date,language:r.language,series:r.series,genres:JSON.parse(r.genres||"[]").join(", "),annotation:r.annotation,added:r.added};}

async function readJson(request){try{return await request.json();}catch{throw new ApiError("Ожидался корректный JSON.");}}
function text(v,max){const s=String(v??"");if(s.length>max)throw new ApiError(`Поле превышает ${max} символов.`);return s;}
function list(v,max){const a=Array.isArray(v)?v:String(v||"").split(",");const out=a.map(x=>String(x).trim()).filter(Boolean);if(out.length>max)throw new ApiError("Слишком много значений.");return out;}
function nullableNumber(v){if(v==null||v==="")return null;const n=Number(v);if(!Number.isFinite(n)||n<0)throw new ApiError("Некорректная сумма.");return Math.round(n*100)/100;}
const toCents=v=>v==null?null:Math.round(v*100);
function validEmail(v){const s=text(v,254).trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))throw new ApiError("Введите корректный email.");return s;}
function validPassword(v){const s=text(v,200);if(s.length<8)throw new ApiError("Пароль должен содержать минимум 8 символов.");return s;}
function validDate(v){const s=text(v,10),m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s);if(!m)throw new ApiError("Некорректная дата.");const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));if(d.getUTCFullYear()!==+m[1]||d.getUTCMonth()!==+m[2]-1||d.getUTCDate()!==+m[3])throw new ApiError("Некорректная дата.");return s;}
function validateSymbolCurrency(v){if(!new Set(["€","$","₽","£","¥"]).has(v))throw new ApiError("Некорректная валюта.");}
function pathId(path,prefix){const id=decodeURIComponent(path.slice(prefix.length));if(!id||id.includes("/")||id.length>100)throw new ApiError("Некорректный идентификатор.");return id;}
function randomToken(bytes){const a=new Uint8Array(bytes);crypto.getRandomValues(a);return btoa(String.fromCharCode(...a)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
async function hashPassword(password,salt){const material=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:new TextEncoder().encode(salt),iterations:210000},material,256);return bytesToHex(new Uint8Array(bits));}
async function sha256(v){return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v))));}
const bytesToHex=a=>[...a].map(x=>x.toString(16).padStart(2,"0")).join("");
async function constantEqual(a,b){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
function originAllowed(origin,configured){if(!origin)return true;return String(configured||"").split(",").map(x=>x.trim()).includes(origin);}
function corsHeaders(origin,configured){return{"Access-Control-Allow-Origin":originAllowed(origin,configured)?origin:"","Access-Control-Allow-Headers":"Content-Type, Authorization","Access-Control-Allow-Methods":"GET, POST, PUT, DELETE, OPTIONS","Cache-Control":"no-store","Vary":"Origin"};}
function json(body,status,headers){return new Response(JSON.stringify(body),{status,headers:{...headers,"Content-Type":"application/json; charset=utf-8"}});}

export const __test = { validDate, normalizeItem, validEmail, validPassword };
