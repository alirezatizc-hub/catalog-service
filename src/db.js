'use strict';
// اتصال به PostgreSQL (دیتابیس لیارا). فقط وقتی تنظیمات اتصال در محیط باشد فعال می‌شود؛ وگرنه برنامه با فایل/Demo و حافظه کار می‌کند.
// نام متغیرها: لیارا هنگام اتصال دیتابیس به برنامه متغیرهایی می‌سازد؛ چون نام دقیق آن‌ها در مستندات قابل‌خواندن نبود،
// چند نام رایج پشتیبانی می‌شود. اگر نام‌های شما فرق دارد فقط همین جدول ENV را اصلاح کنید.
const ENV = {
  url: ['DATABASE_URL', 'POSTGRES_URL', 'POSTGRESQL_URL', 'PG_URL', 'DB_URL'],
  host: ['PGHOST', 'POSTGRES_HOST', 'POSTGRESQL_HOST', 'DB_HOST'],
  port: ['PGPORT', 'POSTGRES_PORT', 'POSTGRESQL_PORT', 'DB_PORT'],
  user: ['PGUSER', 'POSTGRES_USER', 'POSTGRESQL_USER', 'DB_USER', 'DB_USERNAME'],
  password: ['PGPASSWORD', 'POSTGRES_PASSWORD', 'POSTGRESQL_PASSWORD', 'DB_PASSWORD'],
  database: ['PGDATABASE', 'POSTGRES_DB', 'POSTGRES_DATABASE', 'POSTGRESQL_DB', 'DB_NAME', 'DB_DATABASE'],
  ssl: ['PGSSLMODE', 'DB_SSL', 'POSTGRES_SSL']
};
const pick = (env, names) => { for (const n of names) if (env[n] != null && env[n] !== '') return env[n]; };

function config(env = process.env) {
  const url = pick(env, ENV.url);
  const sslRaw = String(pick(env, ENV.ssl) || '').toLowerCase();
  const ssl = ['require', 'true', '1', 'verify-full', 'verify-ca'].includes(sslRaw) ? { rejectUnauthorized: false } : undefined;
  if (url) return { connectionString: url, ssl };
  const host = pick(env, ENV.host), database = pick(env, ENV.database);
  if (!host || !database) return null;
  return { host, port: Number(pick(env, ENV.port)) || 5432, user: pick(env, ENV.user), password: pick(env, ENV.password), database, ssl };
}

function createPool(env = process.env) {
  const cfg = config(env);
  if (!cfg) return null;
  let Pool;
  try { ({ Pool } = require('pg')); } catch { throw new Error('پکیج pg نصب نیست؛ `npm install` را اجرا کنید'); }
  const pool = new Pool({ ...cfg, max: Number(env.PG_POOL_MAX) || 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 });
  pool.on('error', e => console.error('[pg] idle client error:', e.message));
  return pool;
}

const PREFIX = (env = process.env) => String(env.PG_TABLE_PREFIX || 'catalog_').replace(/[^a-z0-9_]/gi, '');
const TABLES = ['products', 'offers', 'shops'];
const qi = s => '"' + String(s).replace(/"/g, '""') + '"';

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS inquiries(
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
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  'CREATE INDEX IF NOT EXISTS inquiries_client_idx ON inquiries(client_id, created_at DESC)'
];
async function migrate(pool) { for (const sql of MIGRATIONS) await pool.query(sql); }

// ---- خواندن دیتاست از PostgreSQL به همان شکل {cols, rows} که loader از CSV می‌سازد ----
async function loadRaw(pool, env = process.env) {
  const out = {}, pre = PREFIX(env);
  for (const t of TABLES) {
    const name = pre + t;
    const ex = await pool.query('SELECT to_regclass($1) AS r', ['public.' + name]);
    if (!ex.rows[0] || !ex.rows[0].r) return null;
    const r = await pool.query('SELECT * FROM ' + qi(name));
    if (!r.rows.length) return null;
    const cols = r.fields ? r.fields.map(f => f.name) : Object.keys(r.rows[0]);
    out[t] = { cols, rows: r.rows.map(row => Object.fromEntries(cols.map(c => [c, cell(row[c])]))) };
  }
  return out;
}
const cell = v => v == null || v === '' ? null : typeof v === 'object' ? (v instanceof Date ? v.toISOString() : JSON.stringify(v)) : String(v);

// ---- ایمپورت یک جدول (همه ستون‌ها TEXT؛ مثل CSV اصلی) ----
async function importTable(pool, name, { cols, rows }, { indexes = [] } = {}) {
  const c = pool.connect ? await pool.connect() : pool;
  try {
    await c.query('BEGIN');
    await c.query('DROP TABLE IF EXISTS ' + qi(name));
    await c.query('CREATE TABLE ' + qi(name) + '(' + cols.map(x => qi(x) + ' TEXT').join(',') + ')');
    const per = Math.max(1, Math.floor(60000 / cols.length));
    for (let i = 0; i < rows.length; i += per) {
      const chunk = rows.slice(i, i + per), params = [];
      const values = chunk.map(r => '(' + cols.map(col => { params.push(r[col] == null ? null : String(r[col])); return '$' + params.length; }).join(',') + ')').join(',');
      await c.query('INSERT INTO ' + qi(name) + '(' + cols.map(qi).join(',') + ') VALUES ' + values, params);
    }
    for (const col of new Set(indexes)) if (cols.includes(col)) await c.query('CREATE INDEX ' + qi(name + '_' + col + '_idx') + ' ON ' + qi(name) + '(' + qi(col) + ')');
    await c.query('COMMIT');
    return rows.length;
  } catch (e) { try { await c.query('ROLLBACK'); } catch { /* ignore */ } throw e; }
  finally { if (c.release) c.release(); }
}

// ---- ذخیره‌ی پرسش‌ها / پیگیری‌ها ----
const PUB = r => ({ id: Number(r.id), client: r.client_id, shop: r.shop_id, product: r.product_id, topic: r.topic, message: r.message, channel: r.channel, status: r.status, reason: r.reason, availability: r.availability, answer: r.answer, created: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at, updated: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at });

function memoryStore() {
  const rows = []; let seq = 0;
  return {
    kind: 'memory',
    async add(x) { const now = new Date().toISOString(); const r = { id: ++seq, client: x.client, shop: x.shop, product: x.product, topic: x.topic, message: x.message || null, channel: x.channel || null, status: x.status, reason: x.reason || null, availability: null, answer: null, created: now, updated: now }; rows.push(r); if (rows.length > 5000) rows.shift(); return { ...r }; },
    async list(client) { return rows.filter(r => r.client === client).slice(-50).reverse().map(r => ({ ...r })); },
    async update(id, client, patch) { const r = rows.find(x => x.id === id && x.client === client); if (!r) return null; Object.assign(r, patch, { updated: new Date().toISOString() }); return { ...r }; }
  };
}

function pgStore(pool) {
  const cols = 'id,client_id,shop_id,product_id,topic,message,channel,status,reason,availability,answer,created_at,updated_at';
  return {
    kind: 'postgres',
    async add(x) {
      const r = await pool.query(`INSERT INTO inquiries(client_id,shop_id,product_id,topic,message,channel,status,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${cols}`,
        [x.client, x.shop, x.product, x.topic, x.message || null, x.channel || null, x.status, x.reason || null]);
      return PUB(r.rows[0]);
    },
    async list(client) { const r = await pool.query(`SELECT ${cols} FROM inquiries WHERE client_id=$1 ORDER BY created_at DESC LIMIT 50`, [client]); return r.rows.map(PUB); },
    async update(id, client, patch) {
      const sets = [], vals = [id, client];
      for (const [k, v] of Object.entries(patch)) { if (!['status', 'availability', 'answer', 'channel'].includes(k)) continue; vals.push(v); sets.push(k + '=$' + vals.length); }
      if (!sets.length) return null;
      const r = await pool.query(`UPDATE inquiries SET ${sets.join(',')}, updated_at=now() WHERE id=$1 AND client_id=$2 RETURNING ${cols}`, vals);
      return r.rows[0] ? PUB(r.rows[0]) : null;
    }
  };
}

module.exports = { config, createPool, migrate, loadRaw, importTable, memoryStore, pgStore, PREFIX, TABLES, ENV };
