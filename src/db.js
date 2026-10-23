'use strict';
// اتصال به PostgreSQL (دیتابیس لیارا) + خواندن دیتاست + ذخیره‌ی پرسش‌ها/پیگیری‌ها.
// مستندات لیارا: URI اتصال در متغیر محیطی قرار می‌گیرد (نمونه‌ی رسمی: PG_URI)؛
// برای سازگاری، نام‌های رایج دیگر هم پذیرفته می‌شوند. هیچ مقداری در لاگ چاپ نمی‌شود.
const ENV = {
  url: ['DATABASE_URL', 'PG_URI', 'POSTGRES_URI', 'POSTGRESQL_URI', 'PG_URL', 'DB_URI', 'DB_URL'],
  host: ['PGHOST', 'DB_HOST', 'POSTGRES_HOST', 'POSTGRESQL_HOST'],
  port: ['PGPORT', 'DB_PORT', 'POSTGRES_PORT', 'POSTGRESQL_PORT'],
  user: ['PGUSER', 'DB_USER', 'DB_USERNAME', 'POSTGRES_USER', 'POSTGRESQL_USER'],
  password: ['PGPASSWORD', 'DB_PASS', 'DB_PASSWORD', 'POSTGRES_PASSWORD', 'POSTGRESQL_PASSWORD'],
  database: ['PGDATABASE', 'DB_NAME', 'DB_DATABASE', 'POSTGRES_DB', 'POSTGRES_DATABASE'],
  ssl: ['PGSSLMODE', 'PG_SSL', 'DB_SSL', 'POSTGRES_SSL']
};
const pick = (env, names) => { for (const n of names) if (env[n] != null && env[n] !== '') return env[n]; };
const sslOf = (env, url) => {
  const raw = String(pick(env, ENV.ssl) || (url && /[?&]sslmode=([^&]+)/.exec(url) || [])[1] || '').toLowerCase();
  if (['require', 'true', '1', 'verify-full', 'verify-ca', 'prefer'].includes(raw)) return { rejectUnauthorized: false };
  return undefined;
};
function config(env = process.env) {
  const url = pick(env, ENV.url);
  if (url) return { connectionString: String(url), ssl: sslOf(env, String(url)) };
  const host = pick(env, ENV.host), database = pick(env, ENV.database);
  if (!host || !database) return null;
  return {
    host, port: Number(pick(env, ENV.port)) || 5432,
    user: pick(env, ENV.user), password: pick(env, ENV.password), database,
    ssl: sslOf(env)
  };
}
// برای /api/health: کدام نام‌های متغیر در محیط حاضرند (بدون مقدار)
function envReport(env = process.env) {
  const out = {};
  for (const [k, names] of Object.entries(ENV)) out[k] = names.filter(n => env[n] != null && env[n] !== '');
  return out;
}
function createPool(env = process.env) {
  const cfg = config(env);
  if (!cfg) return null;
  let Pool;
  try { ({ Pool } = require('pg')); } catch { throw new Error('پکیج pg نصب نیست؛ `npm install` را اجرا کنید'); }
  const pool = new Pool({
    ...cfg, max: Number(env.PG_POOL_MAX) || 6,
    connectionTimeoutMillis: Number(env.PG_CONNECT_TIMEOUT_MS) || 8000,
    idleTimeoutMillis: 30000, keepAlive: true,
    application_name: 'torob-assistant',
    statement_timeout: Number(env.PG_STATEMENT_TIMEOUT_MS) || 120000
  });
  pool.on('error', e => console.error('[pg] idle client error:', e.message));
  return pool;
}

const TABLES = ['products', 'offers', 'shops'];
const qi = s => '"' + String(s).replace(/"/g, '""') + '"';
const PREFIX = (env = process.env) => String(env.PG_TABLE_PREFIX || '').replace(/[^a-z0-9_]/gi, '');

/* ───────── مهاجرت جداول برنامه ───────── */
// هر مهاجرت یک گام جداست تا یک خطا کل بارگذاری داده را از کار نیندازد.
// نکته‌ی مهم: ایندکس/UNIQUE روی عبارت‌های «غیرقطعی» مثل now() یا created_at::date
// در PostgreSQL رد می‌شود (کد 42P17: functions in index expression must be marked IMMUTABLE)
// چون تبدیل timestamptz به date به TimeZone نشست وابسته است. به‌جایش یک ستون واقعی
// created_day نگه می‌داریم که مقدار پیش‌فرضش روز تهران است.
const DAY_DEFAULT = "(now() AT TIME ZONE 'Asia/Tehran')::date";
const MIGRATIONS = [
  { name: 'inquiries', sql: `CREATE TABLE IF NOT EXISTS inquiries(
    id BIGSERIAL PRIMARY KEY,
    client_id TEXT NOT NULL,
    shop_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    topic TEXT NOT NULL,
    message TEXT,
    channel TEXT,
    status TEXT NOT NULL DEFAULT 'not_sent',
    reason TEXT,
    availability TEXT,
    answer TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now())` },
  { name: 'inquiries_client_idx', sql: 'CREATE INDEX IF NOT EXISTS inquiries_client_idx ON inquiries(client_id, created_at DESC)' },
  // درخواست تماس/استعلام: صف کار برای تیم عملیات یا اتصال آینده به سرویس تماس.
  // هیچ‌وقت خارج از ساعت کاری فروشگاه یا بدون رضایت کاربر ساخته نمی‌شود.
  { name: 'call_requests', sql: `CREATE TABLE IF NOT EXISTS call_requests(
    id BIGSERIAL PRIMARY KEY,
    client_id TEXT NOT NULL,
    shop_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    topic TEXT NOT NULL,
    question TEXT NOT NULL,
    phone TEXT,
    status TEXT NOT NULL DEFAULT 'queued',
    consent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    earliest_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    attempts INTEGER NOT NULL DEFAULT 0,
    answer TEXT,
    availability TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now())` },
  // روزِ تهران برای سقف «یک درخواست در روز». اگر نسخه‌ی PostgreSQL عبارت AT TIME ZONE را
  // در ستون پیش‌فرض نپذیرد، به CURRENT_DATE عقب‌نشینی می‌کنیم تا جدول/ایندکس ساخته شود.
  { name: 'call_requests.created_day', sql: `ALTER TABLE call_requests ADD COLUMN IF NOT EXISTS created_day DATE NOT NULL DEFAULT ${DAY_DEFAULT}`,
    fallback: ['ALTER TABLE call_requests ADD COLUMN IF NOT EXISTS created_day DATE NOT NULL DEFAULT CURRENT_DATE'] },
  // ایندکس قدیمی روی عبارت (created_at::date) — اگر در نسخه‌ی پیشین ساخته شده بود، برداشته می‌شود.
  { name: 'call_requests_daily_idx_legacy', sql: 'DROP INDEX IF EXISTS call_requests_daily_idx' },
  { name: 'call_requests_daily_day_idx', sql: 'CREATE UNIQUE INDEX IF NOT EXISTS call_requests_daily_day_idx ON call_requests(client_id, shop_id, product_id, topic, created_day)' },
  { name: 'call_requests_client_idx', sql: 'CREATE INDEX IF NOT EXISTS call_requests_client_idx ON call_requests(client_id, created_at DESC)' },
  { name: 'watches', sql: `CREATE TABLE IF NOT EXISTS watches(
    id BIGSERIAL PRIMARY KEY,
    client_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    shop_id TEXT,
    target_price BIGINT,
    lat DOUBLE PRECISION, lng DOUBLE PRECISION, rad DOUBLE PRECISION,
    active BOOLEAN NOT NULL DEFAULT true,
    last_state TEXT,
    notified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now())` },
  { name: 'watches_unique_idx', sql: "CREATE UNIQUE INDEX IF NOT EXISTS watches_unique_idx ON watches(client_id, product_id, COALESCE(shop_id, '*'))" }
];

// پیام خطا را از رشته‌ی اتصال/رمز پاک می‌کند تا در /api/status و لاگ نشت نکند
function scrub(msg) {
  return String(msg == null ? '' : msg)
    .replace(/postgres(ql)?:\/\/[^\s'"]+/gi, 'postgresql://***')
    .replace(/(password\s*=\s*)[^\s;&]+/gi, '$1***')
    .slice(0, 400);
}

// توضیح فارسی برای خطاهای رایج اتصال/داده — همان چیزی که در /api/status و رابط دیده می‌شود
function hintFor(code, message = '') {
  const c = String(code || '');
  const m = String(message || '');
  if (c === '42P17') return 'تعریف جدول/ایندکس داخلی برنامه با این نسخه‌ی PostgreSQL سازگار نیست (مهاجرت). این نسخه مشکل را برطرف می‌کند؛ بعد از دیپلوی دوباره /api/status را ببینید.';
  if (c === 'dataset_tables_not_found') return 'اتصال به دیتابیس برقرار شد، ولی جدول‌های products/offers/shops پیدا نشد. نام جدول‌ها و PG_TABLE_PREFIX را در /api/status ببینید.';
  if (c === '28P01') return 'رمز یا نام کاربری PostgreSQL پذیرفته نشد؛ مقدار PG_URI/DATABASE_URL را در پنل لیارا بررسی کنید.';
  if (c === '3D000') return 'چنین دیتابیسی روی سرور نیست؛ نام دیتابیس در رشته‌ی اتصال را بررسی کنید.';
  if (c === '42501') return 'کاربر دیتابیس اجازه‌ی خواندن جدول‌ها را ندارد؛ دسترسی SELECT را بدهید.';
  if (c === '42P01') return 'جدول موردنیاز وجود ندارد؛ دستور npm run doctor را اجرا کنید.';
  if (['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EHOSTUNREACH'].includes(c)) return 'به دیتابیس دسترسی شبکه‌ای نیست؛ اگر دیتابیس خصوصی است، اپ باید در همان شبکه‌ی لیارا باشد.';
  if (/password|authentication/i.test(m)) return 'احراز هویت دیتابیس رد شد؛ مقدار PG_URI/DATABASE_URL را بررسی کنید.';
  if (/permission denied/i.test(m)) return 'دسترسی کافی نیست؛ مالک/مجوز جدول‌ها را بررسی کنید.';
  if (c === 'dataset_not_available') return 'نه دیتابیس جواب داد و نه فایل محلی معتبری در DATA_DIR بود.';
  return null;
}

async function migrate(pool) {
  const out = { ok: true, applied: [], failed: [], degraded: false };
  for (const step of MIGRATIONS) {
    const tries = [step.sql, ...(step.fallback || [])];
    let lastErr = null, done = false;
    for (let i = 0; i < tries.length && !done; i++) {
      try {
        await pool.query(tries[i]);
        out.applied.push(step.name + (i ? ' (fallback)' : ''));
        if (i) out.degraded = true;
        done = true;
      } catch (e) { lastErr = e; }
    }
    if (!done) {
      out.ok = false;
      out.failed.push({ step: step.name, code: lastErr.code || null, message: scrub(lastErr.message), hint: hintFor(lastErr.code, lastErr.message) });
      console.error(JSON.stringify({ event: 'migration_failed', step: step.name, code: lastErr.code || null, message: scrub(lastErr.message) }));
    }
  }
  return out;
}

// جدول‌های کاربردی برنامه واقعاً ساخته شده‌اند؟ (اگر نه، استور حافظه‌ای امن‌تر است)
async function appTables(pool) {
  try {
    const r = await pool.query(`SELECT table_name FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_name IN ('inquiries','call_requests','watches')`);
    return new Set(r.rows.map(x => x.table_name));
  } catch { return new Set(); }
}

/* ───────── کشف جدول‌های دیتاست ───────── */
async function tableColumns(pool) {
  const r = await pool.query(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = current_schema() ORDER BY table_name, ordinal_position`);
  const m = new Map();
  for (const row of r.rows) {
    if (!m.has(row.table_name)) m.set(row.table_name, []);
    m.get(row.table_name).push(row.column_name);
  }
  return m;
}
const has = (cols, ...names) => names.every(n => cols.includes(n));
const anyOf = (cols, ...names) => names.some(n => cols.includes(n));
// حدس هوشمند جدول هر نقش: اول نام‌های رایج، بعد امضای ستون‌ها
function detectDatasetTables(map, prefix = '') {
  const entries = [...map.entries()];
  const cands = { products: [], offers: [], shops: [] };
  for (const [t, cols] of entries) {
    const c = new Set(cols);
    const id = anyOf(cols, 'product_id', 'source_id');
    if (id && anyOf(cols, 'persian_title', 'title_fa', 'title', 'name_fa') && anyOf(cols, 'category_name', 'category', 'brand_name', 'model')) cands.products.push({ t, score: /product/i.test(t) ? 2 : 1 });
    if (anyOf(cols, 'shop_id', 'source_id') && anyOf(cols, 'address', 'address_text') && anyOf(cols, 'lat', 'latitude')) cands.shops.push({ t, score: /shop|store|seller/i.test(t) ? 2 : 1 });
    if (anyOf(cols, 'offer_id', 'source_id') && has(cols, 'product_id', 'shop_id') && anyOf(cols, 'price_toman', 'price')) cands.offers.push({ t, score: /offer|price|listing/i.test(t) ? 2 : 1 });
  }
  const out = {};
  for (const role of TABLES) {
    const list = cands[role].sort((a, b) => b.score - a.score || a.t.length - b.t.length);
    out[role] = list.length ? list[0].t : null;
  }
  // ترجیح نام‌های رو‌در‌رو (products/offers/shops) یا با پیشوند تنظیم‌شده
  for (const role of TABLES) {
    const preferred = [prefix && prefix + role, role, 'torob_' + role, 'torob_assistant_' + role, 'catalog_' + role].filter(Boolean);
    const hit = entries.find(([t]) => preferred.some(p => t.toLowerCase() === p.toLowerCase()));
    if (hit && cands[role].some(x => x.t === hit[0])) out[role] = hit[0];
  }
  return { tables: out, candidates: Object.fromEntries(TABLES.map(r => [r, cands[r].map(x => x.t)])), all: entries.map(([t, cols]) => ({ table: t, columns: cols })) };
}

/* ───────── خواندن صفحه‌به‌صفحه در ساختن ایندکس ───────── */
async function* pageRows(pool, table, cols, idCol, pageSize = 20000) {
  const list = cols.map(qi).join(',');
  let last = null;
  for (;;) {
    const r = last == null
      ? await pool.query({ text: `SELECT ${list} FROM ${qi(table)} ORDER BY ${qi(idCol)} LIMIT $1`, values: [pageSize], rowMode: 'array' })
      : await pool.query({ text: `SELECT ${list} FROM ${qi(table)} WHERE ${qi(idCol)} > $1 ORDER BY ${qi(idCol)} LIMIT $2`, values: [last, pageSize], rowMode: 'array' });
    if (!r.rows.length) return;
    last = r.rows[r.rows.length - 1][cols.indexOf(idCol)];
    for (const arr of r.rows) {
      const o = {};
      for (let i = 0; i < cols.length; i++) o[cols[i]] = arr[i] instanceof Date ? arr[i].toISOString() : (arr[i] == null ? null : String(arr[i]));
      yield o;
    }
    if (r.rows.length < pageSize) return;
  }
}

/* ───────── ایمپورت CSV/JSON به PostgreSQL ───────── */
// همه‌ی ستون‌ها TEXT می‌مانند تا دیتاست بدون تبدیل از دست نرود؛ نرمال‌سازی در برنامه انجام می‌شود.
async function importTable(pool, name, { cols, rows }, { indexes = [] } = {}) {
  const c = await pool.connect();
  const staging = name + '_staging';
  try {
    await c.query('BEGIN');
    await c.query('DROP TABLE IF EXISTS ' + qi(staging));
    await c.query('CREATE TABLE ' + qi(staging) + '(' + cols.map(x => qi(x) + ' TEXT').join(',') + ')');
    const per = Math.max(1, Math.floor(60000 / Math.max(1, cols.length)));
    for (let i = 0; i < rows.length; i += per) {
      const chunk = rows.slice(i, i + per), params = [];
      const values = chunk.map(r => '(' + cols.map(col => { params.push(r[col] == null ? null : String(r[col])); return '$' + params.length; }).join(',') + ')').join(',');
      await c.query('INSERT INTO ' + qi(staging) + '(' + cols.map(qi).join(',') + ') VALUES ' + values, params);
    }
    const old = name + '_old';
    await c.query('DROP TABLE IF EXISTS ' + qi(old));
    await c.query('SELECT to_regclass($1) AS r', ['public.' + name]).then(async res => {
      if (res.rows[0] && res.rows[0].r) await c.query('ALTER TABLE ' + qi(name) + ' RENAME TO ' + qi(old));
    });
    await c.query('ALTER TABLE ' + qi(staging) + ' RENAME TO ' + qi(name));
    await c.query('DROP TABLE IF EXISTS ' + qi(old));
    for (const idx of indexes) {
      if (!cols.includes(idx)) continue;
      const iname = (name + '_' + idx + '_idx').slice(0, 60);
      await c.query('CREATE INDEX IF NOT EXISTS ' + qi(iname) + ' ON ' + qi(name) + '(' + qi(idx) + ')');
    }
    await c.query('COMMIT');
    return rows.length;
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch { /* ignore */ }
    throw e;
  } finally { c.release(); }
}

/* ───────── ذخیره‌سازی پرسش/پیگیری/هشدار (PostgreSQL یا حافظه) ───────── */
const PUB_INQ = r => ({
  id: Number(r.id), client: r.client_id, shop: r.shop_id, product: r.product_id, topic: r.topic,
  message: r.message, channel: r.channel, status: r.status, reason: r.reason, availability: r.availability,
  answer: r.answer, created: iso(r.created_at), updated: iso(r.updated_at)
});
const PUB_CALL = r => ({
  id: Number(r.id), client: r.client_id, shop: r.shop_id, product: r.product_id, topic: r.topic,
  question: r.question, phone: r.phone, status: r.status, earliest: iso(r.earliest_at), sent: iso(r.sent_at),
  attempts: r.attempts, answer: r.answer, availability: r.availability, created: iso(r.created_at), updated: iso(r.updated_at)
});
const PUB_WATCH = r => ({
  id: Number(r.id), client: r.client_id, product: r.product_id, shop: r.shop_id, target: r.target_price == null ? null : Number(r.target_price),
  lat: r.lat == null ? null : Number(r.lat), lng: r.lng == null ? null : Number(r.lng), rad: r.rad == null ? null : Number(r.rad),
  active: r.active, last: r.last_state, notified: iso(r.notified_at), created: iso(r.created_at)
});
const iso = v => v == null ? null : v instanceof Date ? v.toISOString() : String(v);
const nowISO = () => new Date().toISOString();

function memoryStore() {
  const inq = [], calls = [], watches = [];
  let i1 = 0, c1 = 0, w1 = 0;
  return {
    kind: 'memory',
    inquiries: {
      async add(x) { const n = nowISO(); const r = { id: ++i1, client: x.client, shop: x.shop, product: x.product, topic: x.topic, message: x.message || null, channel: x.channel || null, status: x.status, reason: x.reason || null, availability: null, answer: null, created: n, updated: n }; inq.push(r); if (inq.length > 5000) inq.shift(); return { ...r }; },
      async list(client) { return inq.filter(r => r.client === client).slice(-80).reverse().map(r => ({ ...r })); },
      async update(id, client, patch) { const r = inq.find(x => x.id === id && x.client === client); if (!r) return null; Object.assign(r, patch, { updated: nowISO() }); return { ...r }; }
    },
    calls: {
      async add(x) { const n = nowISO(); const r = { id: ++c1, client: x.client, shop: x.shop, product: x.product, topic: x.topic, question: x.question, phone: x.phone || null, status: 'queued', earliest: x.earliest || null, sent: null, attempts: 0, answer: null, availability: null, created: n, updated: n }; calls.push(r); if (calls.length > 2000) calls.shift(); return { ...r }; },
      async list(client) { return calls.filter(r => r.client === client).slice(-80).reverse().map(r => ({ ...r })); },
      async update(id, client, patch) { const r = calls.find(x => x.id === id && x.client === client); if (!r) return null; Object.assign(r, patch, { updated: nowISO() }); return { ...r }; }
    },
    watches: {
      async add(x) {
        const dup = watches.find(w => w.client === x.client && w.product === x.product && (w.shop || null) === (x.shop || null));
        if (dup) { Object.assign(dup, { target: x.target ?? dup.target, rad: x.rad ?? dup.rad, lat: x.lat ?? dup.lat, lng: x.lng ?? dup.lng, active: true, updated: nowISO() }); return { ...dup }; }
        const r = { id: ++w1, client: x.client, product: x.product, shop: x.shop || null, target: x.target ?? null, lat: x.lat ?? null, lng: x.lng ?? null, rad: x.rad ?? null, active: true, last: null, notified: null, created: nowISO() };
        watches.push(r); return { ...r };
      },
      async list(client) { return watches.filter(w => w.client === client).map(w => ({ ...w })); },
      async remove(id, client) { const i = watches.findIndex(w => w.id === id && w.client === client); return i >= 0 ? watches.splice(i, 1).length > 0 : false; },
      async touch(id, state) { const w = watches.find(x => x.id === id); if (w) { w.last = state; w.notified = nowISO(); } }
    }
  };
}

function pgStore(pool) {
  const inqCols = 'id,client_id,shop_id,product_id,topic,message,channel,status,reason,availability,answer,created_at,updated_at';
  const callCols = 'id,client_id,shop_id,product_id,topic,question,phone,status,earliest_at,sent_at,attempts,answer,availability,created_at,updated_at';
  const watchCols = 'id,client_id,product_id,shop_id,target_price,lat,lng,rad,active,last_state,notified_at,created_at';
  return {
    kind: 'postgres',
    inquiries: {
      async add(x) {
        const r = await pool.query(`INSERT INTO inquiries(client_id,shop_id,product_id,topic,message,channel,status,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${inqCols}`,
          [x.client, x.shop, x.product, x.topic, x.message || null, x.channel || null, x.status, x.reason || null]);
        return PUB_INQ(r.rows[0]);
      },
      async list(client) { const r = await pool.query(`SELECT ${inqCols} FROM inquiries WHERE client_id=$1 ORDER BY created_at DESC LIMIT 80`, [client]); return r.rows.map(PUB_INQ); },
      async update(id, client, patch) {
        const sets = [], vals = [id, client];
        for (const [k, v] of Object.entries(patch)) { if (!['status', 'availability', 'answer', 'channel'].includes(k)) continue; vals.push(v); sets.push(k + '=$' + vals.length); }
        if (!sets.length) return null;
        const r = await pool.query(`UPDATE inquiries SET ${sets.join(',')}, updated_at=now() WHERE id=$1 AND client_id=$2 RETURNING ${inqCols}`, vals);
        return r.rows[0] ? PUB_INQ(r.rows[0]) : null;
      }
    },
    calls: {
      async add(x) {
        const vals = [x.client, x.shop, x.product, x.topic, x.question, x.phone || null, x.earliest || null];
        const insert = `INSERT INTO call_requests(client_id,shop_id,product_id,topic,question,phone,status,earliest_at) VALUES($1,$2,$3,$4,$5,$6,'queued',$7)`;
        // یک درخواست برای هر (کاربر، فروشگاه، محصول، موضوع) در هر روز تهران
        let r;
        try {
          r = await pool.query(`${insert} ON CONFLICT (client_id, shop_id, product_id, topic, created_day)
            DO UPDATE SET question=EXCLUDED.question, earliest_at=EXCLUDED.earliest_at, updated_at=now() RETURNING ${callCols}`, vals);
        } catch (e) {
          // اگر ستون created_day یا ایندکس یکتایش روی این دیتابیس نبود (42703/42P10)،
          // حداقل درخواست را ذخیره کن تا صف تماس از کار نیفتد.
          const c = String(e.code || '');
          if (!['42703', '42P10'].includes(c) && !/no unique or exclusion constraint/i.test(String(e.message))) throw e;
          r = await pool.query(`${insert} RETURNING ${callCols}`, vals);
        }
        return PUB_CALL(r.rows[0]);
      },
      async list(client) { const r = await pool.query(`SELECT ${callCols} FROM call_requests WHERE client_id=$1 ORDER BY created_at DESC LIMIT 80`, [client]); return r.rows.map(PUB_CALL); },
      async update(id, client, patch) {
        const sets = [], vals = [id, client];
        for (const [k, v] of Object.entries(patch)) {
          if (!['status', 'answer', 'availability'].includes(k)) continue;
          vals.push(k === 'status' ? v : v); sets.push(k + '=$' + vals.length);
        }
        if (patch.status === 'sent') { vals.push(new Date().toISOString()); sets.push('sent_at=$' + vals.length); sets.push('attempts=attempts+1'); }
        if (!sets.length) return null;
        const r = await pool.query(`UPDATE call_requests SET ${sets.join(',')}, updated_at=now() WHERE id=$1 AND client_id=$2 RETURNING ${callCols}`, vals);
        return r.rows[0] ? PUB_CALL(r.rows[0]) : null;
      }
    },
    watches: {
      async add(x) {
        const vals = [x.client, x.product, x.shop || null, x.target ?? null, x.lat ?? null, x.lng ?? null, x.rad ?? null];
        const insert = `INSERT INTO watches(client_id,product_id,shop_id,target_price,lat,lng,rad,active) VALUES($1,$2,$3,$4,$5,$6,$7,true)`;
        let r;
        try {
          r = await pool.query(`${insert} ON CONFLICT (client_id, product_id, COALESCE(shop_id, '*')) DO UPDATE SET target_price=COALESCE(EXCLUDED.target_price, watches.target_price),
            lat=COALESCE(EXCLUDED.lat, watches.lat), lng=COALESCE(EXCLUDED.lng, watches.lng), rad=COALESCE(EXCLUDED.rad, watches.rad), active=true, updated_at=now()
          RETURNING ${watchCols}`, vals);
        } catch (e) {
          if (!/42P10|no unique or exclusion constraint/i.test(String(e.code) + ' ' + e.message)) throw e;
          r = await pool.query(`${insert} RETURNING ${watchCols}`, vals);
        }
        return PUB_WATCH(r.rows[0]);
      },
      async list(client) { const r = await pool.query(`SELECT ${watchCols} FROM watches WHERE client_id=$1 ORDER BY created_at DESC LIMIT 100`, [client]); return r.rows.map(PUB_WATCH); },
      async remove(id, client) { const r = await pool.query('DELETE FROM watches WHERE id=$1 AND client_id=$2', [id, client]); return r.rowCount > 0; },
      async touch(id, state) { await pool.query('UPDATE watches SET last_state=$2, notified_at=now(), updated_at=now() WHERE id=$1', [id, state]); }
    }
  };
}
const createStore = pool => pool ? pgStore(pool) : memoryStore();

/* ───────── سلامت اتصال ───────── */
async function health(pool) {
  const base = { configured: !!pool, connected: false, env: envReport(), error: null };
  if (!pool) { base.error = 'no_database_config'; return base; }
  try {
    const r = await pool.query('SELECT version() AS v, current_database() AS db');
    base.connected = true;
    base.version = String(r.rows[0].v).split(' ').slice(0, 2).join(' ');
    base.database = r.rows[0].db;
  } catch (e) {
    base.error = e.code || e.message;
  }
  return base;
}

module.exports = {
  config, createPool, migrate, appTables, hintFor, scrub, MIGRATIONS, importTable, memoryStore, pgStore, createStore, health,
  tableColumns, detectDatasetTables, pageRows, envReport, TABLES, PREFIX, ENV
};
