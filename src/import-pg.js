'use strict';
// ایمپورت دیتاست (CSV/JSON در data/ یا مسیر داده‌شده) به PostgreSQL لیارا.
//   node src/import-pg.js [مسیر-پوشه] [--dry]
// اتصال از متغیرهای محیطی خوانده می‌شود (DATABASE_URL / PG_URI / DB_* … — src/db.js).
// جدول‌ها: products / offers / shops (بدون پیشوند؛ با PG_TABLE_PREFIX قابل تغییر است).
const path = require('path');
const db = require('../src/db'), { readTable } = require('../src/data/loader'), S = require('../src/data/schema');

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const dir = path.resolve(args.find(a => !a.startsWith('--')) || process.env.DATA_DIR || path.join(__dirname, '..', 'data'));

(async () => {
  const pool = db.createPool();
  if (!pool) {
    console.error('تنظیمات PostgreSQL در محیط پیدا نشد. یکی از این‌ها را تنظیم کنید:');
    console.error('  DATABASE_URL / PG_URI = postgresql://user:pass@host:5432/db   (روش مستندات لیارا)');
    console.error('  یا DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME');
    process.exit(1);
  }
  try {
    const h = await db.health(pool);
    if (!h.connected) throw new Error('اتصال به دیتابیس برقرار نشد: ' + h.error);
    console.log('متصل شد به', h.database, '|', h.version);
    const mig = await db.migrate(pool);
    if (mig.failed.length) {
      console.error('⚠ مهاجرت جدول‌های برنامه با خطا مواجه شد (ایمپورت دیتاست ادامه می‌یابد):');
      for (const f of mig.failed) console.error('  - ' + f.step + ': ' + (f.code || '') + ' ' + f.message + (f.hint ? '\n    راهنما: ' + f.hint : ''));
    } else console.log('مهاجرت جدول‌های برنامه: ' + mig.applied.length + ' گام انجام شد');
    const pre = db.PREFIX();
    const tables = { products: readTable(dir, 'products'), offers: readTable(dir, 'offers'), shops: readTable(dir, 'shops') };
    for (const t of db.TABLES) {
      const raw = tables[t];
      if (!raw) throw new Error(`فایل ${t}.csv یا ${t}.json در ${dir} نیست`);
      console.log(`${t}: ${raw.rows.length} ردیف، ${raw.cols.length} ستون`);
      if (dry) continue;
      const id = S.CONFIRMED[t].id;
      const idx = raw.cols.includes(id) ? [id] : [];
      const n = await db.importTable(pool, pre + t, raw, { indexes: idx });
      console.log(`  → ${pre}${t}: ${n} ردیف ایمپورت شد`);
    }
    if (!dry) {
      const cols = await db.tableColumns(pool);
      const det = db.detectDatasetTables(cols, pre);
      console.log('جدول‌های شناسایی‌شده برای برنامه:', JSON.stringify(det.tables));
      if (db.TABLES.some(t => !det.tables[t])) console.warn('⚠ هر سه جدول شناسایی نشدند؛ /api/status را بعد از دیپلوی ببینید.');
    }
    console.log(dry ? 'حالت --dry: چیزی نوشته نشد.' : 'تمام شد. سرور در راه‌اندازی بعدی دیتاست را از PostgreSQL می‌خواند.');
  } finally { await pool.end(); }
})().catch(e => { console.error('خطا:', e.message); process.exit(1); });
