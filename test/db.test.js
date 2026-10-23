'use strict';
// تست‌های مهاجرت و پیام‌های خطای دیتابیس: رگرسیون 42P17 (ایندکس غیرقطعی) و نشت رمز
const test = require('node:test');
const assert = require('node:assert');
const db = require('../src/db');

// استخر ساختگی: SQLها را ثبت می‌کند و می‌تواند برای یک عبارت خاص خطا بدهد
function fakePool(failWhen) {
  const seen = [];
  return {
    seen,
    async query(sql) {
      seen.push(sql);
      const e = failWhen && failWhen(sql);
      if (e) throw e;
      return { rows: [], rowCount: 0 };
    }
  };
}
const err = (code, message = 'boom') => Object.assign(new Error(message), { code });

test('هیچ ایندکسی روی عبارت غیرقطعی (created_at::date یا now()) ساخته نمی‌شود', () => {
  // در PostgreSQL: «functions in index expression must be marked IMMUTABLE» (42P17)
  const idx = db.MIGRATIONS.filter(m => /CREATE\s+(UNIQUE\s+)?INDEX/i.test(m.sql));
  assert.ok(idx.length >= 3);
  for (const m of idx) {
    const expr = m.sql.replace(/^(CREATE\s+(UNIQUE\s+)?INDEX[^O]*ON\s+\w+\s*)/i, '');
    assert.ok(!/created_at\s*::\s*date|now\s*\(\s*\)/i.test(expr), `ایندکس ${m.name} عبارت غیرقطعی دارد: ${expr}`);
  }
});

test('مهاجرت با خطای یک گام متوقف نمی‌شود و همه‌ی جدول‌ها ساخته می‌شوند', async () => {
  let failedOnce = false;
  const pool = fakePool(sql => {
    if (!failedOnce && /ADD COLUMN IF NOT EXISTS created_day/i.test(sql)) { failedOnce = true; return err('42P17', 'functions in index expression must be marked IMMUTABLE'); }
    return null;
  });
  const r = await db.migrate(pool);
  assert.equal(r.ok, true);
  assert.equal(r.degraded, true, 'باید از مسیر جایگزین استفاده کند');
  assert.ok(r.applied.some(x => /created_day/.test(x) && /fallback/.test(x)));
  assert.ok(pool.seen.some(s => /CREATE TABLE IF NOT EXISTS inquiries/i.test(s)));
  assert.ok(pool.seen.some(s => /CREATE TABLE IF NOT EXISTS call_requests/i.test(s)));
  assert.ok(pool.seen.some(s => /CREATE TABLE IF NOT EXISTS watches/i.test(s)));
  // ایندکس قدیمیِ معیوب حذف می‌شود تا دوباره دردسر نسازد
  assert.ok(pool.seen.some(s => /DROP INDEX IF EXISTS call_requests_daily_idx/i.test(s)));
});

test('وقتی هیچ مسیری موفق نشود، خطا گزارش می‌شود ولی استثنا پرتاب نمی‌شود', async () => {
  const pool = fakePool(sql => /ADD COLUMN IF NOT EXISTS created_day/i.test(sql) ? err('42703', 'column does not exist') : null);
  const r = await db.migrate(pool);
  assert.equal(r.ok, false);
  assert.equal(r.failed.length, 1);
  assert.equal(r.failed[0].step, 'call_requests.created_day');
  assert.ok(r.applied.length > 0, 'گام‌های دیگر باید اجرا شده باشند');
});

test('پیام خطا رمز و رشته‌ی اتصال را لو نمی‌دهد', () => {
  const msg = db.scrub("password authentication failed: postgresql://root:S3cretPass@db.liara.ir:5432/postgres password=S3cretPass");
  assert.ok(!msg.includes('S3cretPass'), 'رمز نباید در پیام بماند');
  assert.ok(msg.length <= 400);
  assert.equal(db.scrub(null), '');
});

test('خطاهای رایج دیتابیس راهنمای فارسی دارند', () => {
  assert.match(db.hintFor('42P17'), /PostgreSQL/);
  assert.match(db.hintFor('dataset_tables_not_found'), /products\/offers\/shops/);
  assert.match(db.hintFor('28P01'), /PG_URI|DATABASE_URL/);
  assert.match(db.hintFor('ECONNREFUSED'), /شبکه|خصوصی/);
  assert.match(db.hintFor(null, 'password authentication failed for user "root"'), /احراز هویت/);
  assert.equal(db.hintFor('random_code', 'nothing'), null);
});

test('نبود تنظیم اتصال، به‌جای استثنا، پیام روشن می‌دهد', () => {
  assert.equal(db.config({}), null);
  assert.equal(db.config({ PG_URI: 'postgresql://u:p@h:5432/d' }).connectionString, 'postgresql://u:p@h:5432/d');
  assert.equal(db.config({ DATABASE_URL: 'postgresql://u:p@h/d' }).connectionString, 'postgresql://u:p@h/d');
  assert.equal(db.config({ DB_HOST: 'h', DB_NAME: 'd' }).host, 'h');
});

/* ───────── عیب‌یابی (/api/diagnose و /doctor) ───────── */
const { diagnose } = require('../src/diagnose');

test('وقتی داده از فایل خوانده شده، نبود دیتابیس خطا نیست', async () => {
  const r = await diagnose({ state: { ready: true, source: 'files' }, env: {} });
  assert.equal(r.ok, true);
  assert.ok(!r.checks.some(c => c.status === 'fail'));
  assert.ok(r.checks.some(c => c.id === 'env' && c.status === 'warn'));
});

test('وقتی دیتابیس تنظیم نشده و داده هم نیست، راهنمای گام‌به‌گام می‌دهد', async () => {
  const r = await diagnose({ state: { ready: false, source: 'none', error: 'dataset_not_available' }, env: {} });
  assert.equal(r.ok, false);
  assert.ok(r.checks.some(c => c.id === 'env' && c.status === 'fail'));
  assert.match(r.checks.find(c => c.id === 'env').hint, /PG_URI/);
  assert.ok(r.nextSteps.length >= 1);
});

test('عیب‌یابی هرگز رمز یا رشته‌ی اتصال را لو نمی‌دهد', async () => {
  const r = await diagnose({ state: { ready: false, source: 'none', error: 'dataset_not_available' }, env: { PG_URI: 'postgresql://root:TopSecret99@db:5432/postgres' } });
  const dump = JSON.stringify(r);
  assert.ok(!dump.includes('TopSecret99'));
  assert.ok(!dump.includes('postgresql://root'));
  assert.ok(dump.includes('PG_URI'), 'نام متغیر باید دیده شود');
});

test('مسیرهای /api/diagnose و /doctor حتی وقتی دیتاست بارگذاری نشده جواب می‌دهند', async () => {
  const { createServer } = require('../server');
  const s = createServer(null, { loading: true });
  await new Promise(r => s.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + s.address().port;
  try {
    const r = await fetch(base + '/api/diagnose');
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.ok, false);
    assert.ok(j.checks.length >= 2);
    assert.ok(Array.isArray(j.nextSteps) && j.nextSteps.length);
    const page = await fetch(base + '/doctor');
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    const html = await page.text();
    assert.match(html, /عیب‌یابی/);
    assert.match(html, /قدم بعدی/);
  } finally { s.close(); }
});

test('DIAG_TOKEN اگر تنظیم شده باشد، گزارش بدون توکن نمی‌آید', async () => {
  const { createServer } = require('../server');
  process.env.DIAG_TOKEN = 'tok-1234';
  const s = createServer(null, { loading: true });
  await new Promise(r => s.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + s.address().port;
  try {
    assert.equal((await fetch(base + '/api/diagnose')).status, 403);
    assert.equal((await fetch(base + '/api/diagnose?token=tok-1234')).status, 200);
    assert.equal((await fetch(base + '/doctor', { headers: { 'x-diag-token': 'tok-1234' } })).status, 200);
  } finally { s.close(); delete process.env.DIAG_TOKEN; }
});
