'use strict';
// عیب‌یابی درون‌برنامه‌ای: «چرا دیتاست خوانده نمی‌شود؟»
// همان بررسی‌های scripts/doctor.js، ولی از داخل خود اپ و بدون دسترسی به کنسول لیارا.
// هیچ رمز/رشته‌ی اتصالی برنمی‌گرداند؛ فقط نام متغیرها و نتیجه‌ی بررسی‌ها.
const db = require('./db');
const llm = require('./llm');

const ID_ALIASES = { products: ['product_id', 'source_id', 'id'], shops: ['shop_id', 'source_id', 'id'], offers: ['offer_id', 'source_id', 'id'] };

async function countRows(pool, table) {
  const t = '"' + String(table).replace(/"/g, '""') + '"';
  const r = await pool.query(`SELECT count(*)::bigint AS n FROM ${t}`);
  return Number(r.rows[0].n);
}

/**
 * @param {{ pool?: any, state?: any, env?: NodeJS.ProcessEnv }} opts
 */
async function diagnose({ pool = null, state = null, env = process.env, probeAi = false } = {}) {
  const checks = [];
  const add = (id, label, status, detail, hint) => checks.push({ id, label, status, detail: detail || null, hint: hint || null });
  const out = { at: new Date().toISOString(), ok: false, source: state ? state.source : null, ready: !!(state && state.ready), checks, nextSteps: [] };
  // وقتی داده از فایل محلی خوانده شده، نبودِ دیتابیس «خطا» نیست؛ فقط یک هشدار است.
  const soft = state && state.ready && state.source === 'files' ? 'warn' : 'fail';

  /* ۱) متغیرها */
  const rep = db.envReport(env);
  const names = Object.values(rep).flat();
  if (!names.length) {
    add('env', 'متغیرهای اتصال', soft, 'هیچ متغیر اتصالی در محیط اپ نیست.',
      soft === 'warn' ? 'داده در این اجرا از فایل محلی خوانده شد. برای خواندن از دیتابیس، PG_URI را در پنل لیارا بگذارید.'
        : 'در پنل لیارا → اپ → تنظیمات → متغیرهای محیطی، مقدار PG_URI (یا DATABASE_URL) را بگذارید و اپ را دوباره دیپلوی/ری‌استارت کنید.');
  } else {
    add('env', 'متغیرهای اتصال', 'pass', 'موجود: ' + names.join(', ') + (rep.url.length ? '' : ' (بدون رشته‌ی اتصال؛ از میزبان/نام‌کاربری استفاده می‌شود)'));
  }

  /* ۲) پیکربندی */
  let cfg = null;
  try { cfg = db.config(env); } catch (e) { add('config', 'پیکربندی اتصال', 'fail', db.scrub(e.message)); }
  if (cfg) add('config', 'پیکربندی اتصال', 'pass', cfg.connectionString ? 'از رشته‌ی اتصال خوانده شد' : `میزبان ${cfg.host} · دیتابیس ${cfg.database} · پورت ${cfg.port}`);
  else if (!checks.some(c => c.id === 'config')) add('config', 'پیکربندی اتصال', soft, 'نه رشته‌ی اتصال و نه میزبان+نام دیتابیس کامل است.', 'PG_URI را کامل بگذارید: postgresql://user:pass@host:5432/db');

  /* ۳) اتصال */
  let ownPool = false;
  if (!pool && cfg) {
    try { pool = db.createPool(env); ownPool = true; } catch (e) { add('connect', 'اتصال به دیتابیس', 'fail', db.scrub(e.message)); }
  }
  let health = null;
  if (pool) {
    health = await db.health(pool);
    if (health.connected) add('connect', 'اتصال به دیتابیس', 'pass', `دیتابیس «${health.database}» · ${health.version || ''}`);
    else {
      add('connect', 'اتصال به دیتابیس', 'fail', health.error || 'اتصال برقرار نشد', db.hintFor(health.error, health.error));
      if (['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EHOSTUNREACH'].includes(health.error)) {
        out.nextSteps.push('دیتابیس لیارا معمولاً «خصوصی» است؛ اپ و دیتابیس باید در یک پروژه/شبکه باشند و متغیر بعد از ساخت دیتابیس تنظیم و اپ دوباره دیپلوی شود.');
      }
      if (health.error === '28P01') out.nextSteps.push('رمز/کاربر دیتابیس با رشته‌ی اتصال نمی‌خواند؛ مقدار PG_URI را از پنل دیتابیس کپی کنید.');
    }
  } else if (cfg) {
    // pool ساخت نشد
    if (!checks.some(c => c.id === 'connect')) add('connect', 'اتصال به دیتابیس', 'fail', 'استخر اتصال ساخته نشد.');
  }

  /* ۴) جدول‌های دیتاست */
  let det = null, cols = null;
  if (pool && health && health.connected) {
    try {
      cols = await db.tableColumns(pool);
      det = db.detectDatasetTables(cols, db.PREFIX(env));
      const missing = db.TABLES.filter(t => !det.tables[t]);
      if (missing.length) {
        add('tables', 'جدول‌های دیتاست', 'fail',
          'پیدا نشد: ' + missing.join(', ') + (det.all.length ? ' · جدول‌های موجود: ' + det.all.slice(0, 10).map(x => x.table).join(', ') : ' · اسکیمای فعلی هیچ جدولی ندارد'),
          db.hintFor('dataset_tables_not_found'));
        out.nextSteps.push('اگر جدول‌ها را با نام دیگر ساخته‌اید، PG_TABLE_PREFIX/نام جدول را تنظیم کنید؛ وگرنه یک‌بار ایمپورت کنید: npm run import:pg -- ./data');
      } else {
        add('tables', 'جدول‌های دیتاست', 'pass', `products→${det.tables.products} · shops→${det.tables.shops} · offers→${det.tables.offers}`);
        const counts = {};
        for (const role of ['products', 'shops', 'offers']) {
          try { counts[role] = await countRows(pool, det.tables[role]); } catch (e) { counts[role] = null; }
        }
        out.counts = counts;
        const empty = Object.entries(counts).filter(([, n]) => !n).map(([r]) => r);
        if (empty.length) {
          add('rows', 'ردیف‌های دیتاست', 'fail', 'خالی: ' + empty.join(', ') + ' · ' + JSON.stringify(counts),
            'ایمپورت نیمه‌کاره مانده یا ستون‌ها با نگاشت نمی‌خوانند؛ npm run doctor را با همان متغیر اجرا کنید.');
          out.nextSteps.push('جدول‌های خالی را دوباره ایمپورت کنید (npm run import:pg -- ./data).');
        } else {
          add('rows', 'ردیف‌های دیتاست', 'pass', `${counts.products} محصول · ${counts.shops} فروشگاه · ${counts.offers} آفِر`);
        }
        // ستون قیمت واقعاً مقدار دارد؟
        try {
          const oc = cols.get(det.tables.offers) || [];
          const priceCol = ['price_toman', 'price', 'price_irr'].find(c => oc.includes(c));
          if (!priceCol) add('price', 'ستون قیمت', 'fail', 'ستون قیمتی پیدا نشد. ستون‌ها: ' + oc.slice(0, 10).join(', '), 'نگاشت ستون‌ها را در data/mapping.json بگذارید.');
          else {
            const q = await pool.query(`SELECT count(*)::bigint AS n FROM "${String(det.tables.offers).replace(/"/g, '""')}" WHERE "${priceCol}" IS NOT NULL AND "${priceCol}"::text <> ''`);
            const n = Number(q.rows[0].n);
            add('price', 'ستون قیمت', n ? 'pass' : 'fail', `${priceCol}: ${n} ردیف مقدار دارد`, n ? null : 'همه‌ی قیمت‌ها خالی‌اند؛ همه‌ی آفِرها «قیمت نامشخص» می‌شوند.');
          }
        } catch (e) { add('price', 'ستون قیمت', 'warn', db.scrub(e.message)); }
      }
    } catch (e) {
      add('tables', 'جدول‌های دیتاست', 'fail', (e.code || '') + ' ' + db.scrub(e.message), db.hintFor(e.code, e.message));
    }
  }

  /* ۵) جدول‌های برنامه */
  if (pool && health && health.connected) {
    try {
      const mig = await db.migrate(pool);
      const have = await db.appTables(pool);
      if (mig.failed.length) {
        add('store', 'جدول‌های پیگیری', 'fail', mig.failed.map(f => `${f.step}: ${f.code || ''} ${f.message}`).join(' | '), mig.failed[0].hint);
        out.nextSteps.push('خطای مهاجرت جدول‌های پیگیری: پیام بالا را ببینید؛ این نسخه مشکل 42P17 را برطرف می‌کند، فقط اپ را دوباره دیپلوی کنید.');
      } else {
        const missing = ['inquiries', 'call_requests', 'watches'].filter(t => !have.has(t));
        add('store', 'جدول‌های پیگیری', missing.length ? 'warn' : 'pass',
          missing.length ? 'ساخته نشد: ' + missing.join(', ') : 'inquiries / call_requests / watches آماده‌اند' + (mig.degraded ? ' (با مسیر جایگزین)' : ''));
      }
    } catch (e) { add('store', 'جدول‌های پیگیری', 'fail', db.scrub(e.message)); }
  }

  /* ۶) هوش مصنوعی (BoxAPI) */
  const ai = llm.info();
  if (!ai.enabled) {
    add('ai', 'هوش مصنوعی (BoxAPI)', 'warn', `کلید تنظیم نشده؛ مدل پیش‌فرض ${ai.model} روی ${ai.host}`,
      'اختیاری: BOXAPI_API_KEY را در پنل لیارا بگذارید تا فهم جمله با مدل انجام شود؛ بدون آن، قواعد محلی جواب می‌دهند.');
  } else {
    add('ai', 'هوش مصنوعی (BoxAPI)', 'pass', `آماده · مدل ${ai.model} · ${ai.endpoint}`);
    if (probeAi) {
      const pr = await llm.probe();
      add('ai_probe', 'اتصال واقعی به مدل', pr.ok ? 'pass' : 'fail', `مدل ${pr.model} · ${pr.ms}ms` + (pr.ok ? ` · نمونه: ${String(pr.sample || '').slice(0, 40)}` : ` · ${pr.code}`), pr.ok ? null : pr.hint || pr.error);
      if (!pr.ok) out.nextSteps.push('اتصال AI را بررسی کنید: مقدار BOXAPI_API_KEY، مسیر ' + ai.endpoint + ' و نام مدل ' + ai.model);
    }
  }

  /* ۷) وضعیت بارگذاری در حافظه */
  if (state) {
    const c = state.data ? state.data.report.counts : null;
    if (state.ready) add('load', 'بارگذاری در حافظه', 'pass', `منبع ${state.source} · ${c ? `${c.products} محصول / ${c.shops} فروشگاه / ${c.offers} آفِر` : ''} · ${state.loadedAt ? Math.round((Date.now() - state.loadedAt) / 1000) + ' ثانیه قبل' : ''}`);
    else add('load', 'بارگذاری در حافظه', 'fail', state.error || 'بارگذاری نشده', state.dbInfo ? state.dbInfo.hint : null);
  }

  out.ok = state ? !!state.ready : checks.every(c => c.status !== 'fail');
  if (!out.nextSteps.length) out.nextSteps.push(out.ok
    ? (state && state.source === 'files' ? 'داده از فایل محلی خوانده شد و اپ آماده است؛ برای خواندن از دیتابیس PG_URI را تنظیم کنید و دوباره دیپلوی کنید.' : 'همه‌چیز آماده است؛ /api/meta باید ready:true بدهد.')
    : 'موارد ❌ بالا را برطرف کنید، اپ را دوباره دیپلوی کنید و همین صفحه را تازه کنید.');
  if (ownPool && pool) { try { await pool.end(); } catch { /* ignore */ } }
  return out;
}

module.exports = { diagnose, ID_ALIASES };
