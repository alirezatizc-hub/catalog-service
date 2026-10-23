'use strict';
// ایمپورت دیتاست (CSV/JSON داخل data/ یا مسیر داده‌شده) به PostgreSQL لیارا.
// اجرا:  node scripts/import-pg.js [مسیر-پوشه]      (اتصال از متغیرهای محیطی؛ نام‌ها در src/db.js)
// جدول‌ها: <PG_TABLE_PREFIX>products / offers / shops (پیش‌فرض catalog_) — هر بار اجرا جایگزین می‌شوند.
const path = require('path');
const db = require('../src/db'), { readTable } = require('../src/data/loader'), S = require('../src/data/schema');
(async () => {
  const dir = path.resolve(process.argv[2] || process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
  const pool = db.createPool();
  if (!pool) { console.error('تنظیمات PostgreSQL در محیط پیدا نشد (DATABASE_URL یا PGHOST/PGDATABASE/...).'); process.exit(1); }
  try {
    await db.migrate(pool);
    const pre = db.PREFIX(), idx = { products: [S.CONFIRMED.products.id], offers: [S.CONFIRMED.offers.product, S.CONFIRMED.offers.shop], shops: [S.CONFIRMED.shops.id] };
    for (const t of db.TABLES) {
      const raw = readTable(dir, t);
      if (!raw) throw new Error(`فایل ${t}.csv یا ${t}.json در ${dir} نیست`);
      const n = await db.importTable(pool, pre + t, raw, { indexes: idx[t] });
      console.log(`${pre}${t}: ${n} ردیف`);
    }
    console.log('تمام شد. سرور در راه‌اندازی بعدی دیتاست را از PostgreSQL می‌خواند.');
  } finally { await pool.end(); }
})().catch(e => { console.error(e.message); process.exit(1); });
