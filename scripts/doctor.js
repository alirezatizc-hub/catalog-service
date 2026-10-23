'use strict';
// دکترِ اتصال و دیتاست — بدون نیاز به دسترسی به پنل لیارا.
//   DATABASE_URL='postgresql://…' npm run doctor
//   npm run doctor -- --local          # همان بررسی، ولی روی فایل‌های data/ (بدون دیتابیس)
//   npm run doctor -- --limit 200000   # با دیدن جدول‌های بزرگ‌تر رد شود (پیش‌فرض ۵۰۰۰ ردیف نمونه)
// هیچ رمز یا رشته‌ی اتصالی چاپ نمی‌شود؛ فقط نام متغیرها و نتیجه.
const path = require('path');
const db = require('../src/db'), L = require('../src/data/loader'), { readTable } = L;

const args = process.argv.slice(2);
const localOnly = args.includes('--local');
const limit = (i => Number(args[i]) || 0)(args.indexOf('--limit') + 1) || 5000;
const dir = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));

const ok = m => console.log('  ✅ ' + m);
const bad = m => console.log('  ❌ ' + m);
const warn = m => console.log('  ⚠️  ' + m);
const info = m => console.log('  • ' + m);
const head = m => console.log('\n' + m);

const ALIASES = {
  products: ['product_id', 'source_id', 'id'],
  shops: ['shop_id', 'source_id', 'id'],
  offers: ['offer_id', 'source_id', 'id']
};

let pool = null;
(async () => {
  console.log('ترب‌یار — بررسی اتصال و دیتاست');
  console.log('='.repeat(52));

  /* ───── ۱) فایل‌های محلی ───── */
  head('۱) فایل‌های محلی (' + dir + ')');
  const files = {};
  for (const t of ['products', 'shops', 'offers']) {
    const raw = readTable(dir, t);
    files[t] = raw;
    if (!raw) { info(`${t}: فایل نیست`); continue; }
    ok(`${t}: ${raw.rows.length.toLocaleString('fa-IR')} ردیف، ${raw.cols.length} ستون`);
    const idCol = ALIASES[t].find(c => raw.cols.includes(c));
    if (!idCol) bad(`${t}: ستون شناسه (${ALIASES[t].join(' / ')}) پیدا نشد → ستون‌ها: ${raw.cols.slice(0, 8).join(', ')}`);
  }
  const hasFiles = ['products', 'shops', 'offers'].every(t => files[t] && files[t].rows.length);
  if (!hasFiles) info('اگر داده در دیتابیس است، این بخش مهم نیست (DATA_DIR خالی طبیعی است).');

  /* ───── ۲) پیکربندی دیتابیس ───── */
  head('۲) متغیرهای اتصال');
  const rep = db.envReport();
  for (const [k, names] of Object.entries(rep)) {
    if (!names.length) { if (k !== 'ssl') info(`${k}: تنظیم نشده`); continue; }
    ok(`${k}: ${names.join(', ')}`);
  }
  const cfg = db.config();
  if (!cfg) {
    bad('هیچ تنظیم اتصالی پیدا نشد. روی لیارا باید PG_URI یا DATABASE_URL تنظیم شود و اپ دوباره دیپلوی شود.');
    return finish(false);
  }
  info('اتصال برقرار می‌شود با ' + (cfg.connectionString ? 'رشته‌ی اتصال' : `میزبان ${cfg.host} / دیتابیس ${cfg.database}`));

  if (localOnly) return finish(hasFiles);

  /* ───── ۳) اتصال واقعی ───── */
  head('۳) اتصال به PostgreSQL');
  try { pool = db.createPool(); } catch (e) { bad('ساخت استخر اتصال ناموفق: ' + db.scrub(e.message)); return finish(false); }
  const h = await db.health(pool);
  if (!h.connected) {
    bad('اتصال برقرار نشد: ' + (h.error || 'خطای نامشخص'));
    const hint = db.hintFor(h.error, h.error);
    if (hint) warn(hint);
    info('اگر دیتابیس «خصوصی» است، اپ و دیتابیس باید در یک شبکه‌ی لیارا باشند (از داخل خود اپ اجرا کنید).');
    return finish(false);
  }
  ok(`متصل شد به دیتابیس «${h.database}» — ${h.version || ''}`);

  /* ───── ۴) داده‌های دیتاست ───── */
  head('۴) جدول‌های دیتاست');
  let datasetOk = false;
  try {
    const cols = await db.tableColumns(pool);
    const det = db.detectDatasetTables(cols, db.PREFIX());
    for (const role of ['shops', 'products', 'offers']) {
      if (det.tables[role]) ok(`${role} → جدول «${det.tables[role]}» (${(cols.get(det.tables[role]) || []).length} ستون)`);
      else bad(`${role}: جدولی با ستون‌های شناسایی‌شدنی پیدا نشد`);
    }
    if (det.all.length) info('جدول‌های موجود در اسکیما: ' + det.all.slice(0, 12).map(x => x.table).join(', ') + (det.all.length > 12 ? ' …' : ''));
    if (!['shops', 'products', 'offers'].every(r => det.tables[r])) {
      warn(db.hintFor('dataset_tables_not_found'));
      if (db.PREFIX()) info('PG_TABLE_PREFIX فعلی: «' + db.PREFIX() + '» — اگر جدول‌ها بدون پیشوندند، این متغیر را خالی بگذارید.');
      info('برای ساختن جدول‌ها از فایل‌ها: npm run import:pg -- ./data');
    } else {
      datasetOk = true;
      for (const role of ['offers', 'products', 'shops']) {
        const t = det.tables[role];
        const n = await pool.query(`SELECT count(*)::bigint AS n FROM "${String(t).replace(/"/g, '""')}"`);
        const count = Number(n.rows[0].n);
        ok(`${role}: ${count.toLocaleString('fa-IR')} ردیف در «${t}»` + (count === 0 ? ' ← خالی است!' : ''));
        if (count === 0) datasetOk = false;
        if (limit && count > limit) info(`  (${role} بزرگ است؛ نمونه‌خوانی ${limit} ردیف)`);
      }
      // نمونه‌ی واقعی: آیا ستون‌های کلیدی مقدار دارند؟
      const offersTable = det.tables.offers, ocols = cols.get(offersTable) || [];
      const priceCol = ['price_toman', 'price', 'price_irr', 'price_toman_rial'].find(c => ocols.includes(c));
      const rows = await pool.query(`SELECT * FROM "${String(offersTable).replace(/"/g, '""')}" LIMIT 5`);
      if (rows.rows.length) {
        const sample = rows.rows[0];
        const withPrice = priceCol ? rows.rows.filter(r => r[priceCol] != null).length : 0;
        if (priceCol) ok(`ستون قیمت «${priceCol}» در ${withPrice}/${rows.rows.length} ردیف نمونه مقدار دارد`);
        else bad('ستون قیمت پیدا نشد؛ نگاشت را در mapping.json بگذارید. ستون‌های نمونه: ' + Object.keys(sample).join(', '));
        if (!withPrice) warn('قیمت‌ها خالی‌اند → همه‌ی آفِرها «قیمت نامشخص» می‌شوند.');
      }
    }
  } catch (e) {
    bad('خواندن جدول‌ها ناموفق: ' + (e.code || '') + ' ' + db.scrub(e.message));
    const hint = db.hintFor(e.code, e.message);
    if (hint) warn(hint);
  }

  /* ───── ۵) جدول‌های برنامه (پرسش/تماس/هشدار) ───── */
  head('۵) جدول‌های برنامه');
  try {
    const mig = await db.migrate(pool);
    for (const f of mig.failed) bad(`گام «${f.step}»: ${f.code || ''} ${f.message}` + (f.hint ? '\n     راهنما: ' + f.hint : ''));
    if (!mig.failed.length) ok(`${mig.applied.length} گام مهاجرت بدون خطا اجرا شد`);
    const have = await db.appTables(pool);
    const missing = ['inquiries', 'call_requests', 'watches'].filter(t => !have.has(t));
    if (missing.length) { bad('این جدول‌ها ساخته نشدند: ' + missing.join(', ') + ' → پرسش/هشدار/تماس موقتاً در حافظه ذخیره می‌شوند'); datasetOk = datasetOk; }
    else ok('inquiries / call_requests / watches آماده‌اند (پیگیری‌ها در دیتابیس ذخیره می‌شوند)');
  } catch (e) {
    bad('مهاجرت ناموفق: ' + db.scrub(e.message));
  }

  /* ───── ۶) همان مسیری که اپ طی می‌کند ───── */
  head('۶) بارگذاری مثل خود اپ');
  if (datasetOk) {
    try {
      const { createBuilder } = L;
      const m = L.loadMapping(dir);
      const schema = (m && m.schema) || {};
      const cols = await db.tableColumns(pool);
      const det = db.detectDatasetTables(cols, db.PREFIX());
      const builder = createBuilder({ schema });
      for (const role of ['shops', 'products', 'offers']) {
        const table = det.tables[role], columns = cols.get(table) || [];
        const idCol = ALIASES[role].find(c => columns.includes(c));
        if (!idCol) { bad(`${role}: ستون شناسه پیدا نشد`); continue; }
        await (builder['add' + role[0].toUpperCase() + role.slice(1)])(db.pageRows(pool, table, columns, idCol), columns);
      }
      const data = builder.finish();
      const c = data.report.counts;
      if (data.report.ok && c.offers > 0) ok(`دیتاست معتبر خوانده شد: ${c.products.toLocaleString('fa-IR')} محصول، ${c.shops.toLocaleString('fa-IR')} فروشگاه، ${c.offers.toLocaleString('fa-IR')} آفِر`);
      else { bad('دیتاست خوانده شد ولی معتبر نیست: ' + (data.report.errors[0] || 'بدون آفِر معتبر')); warn('گزارش کامل: /api/status'); }
    } catch (e) { bad('بارگذاری ناموفق: ' + db.scrub(e.message)); }
  } else warn('تا وقتی جدول‌های دیتاست درست نباشند، اپ با ready:false و پیام روشن بالا می‌ماند (بدون داده‌ی ساختگی).');

  finish(true);

  function finish(reached) {
    console.log('\n' + '='.repeat(52));
    if (!reached) console.log('نتیجه: هنوز آماده نیست — موارد ❌ بالا را برطرف کنید.');
    console.log('بعد از هر تغییر، اپ را دوباره دیپلوی کنید و این دو را ببینید:');
    console.log('  GET /api/status   (اتصال، جدول‌ها، نگاشت، راهنما)');
    console.log('  GET /api/meta     (ready / source / counts)');
    pool && pool.end().then(() => process.exit(0)).catch(() => process.exit(0));
    if (!pool) process.exit(0);
  }
})().catch(e => { console.error('[doctor]', db.scrub(e.message)); process.exit(1); });
