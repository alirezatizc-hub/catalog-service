'use strict';
// خواندن و نرمال‌سازی دیتاست چالش (products / shops / offers).
// ساختار واقعی ستون‌ها در schema.js آمده است. همین ماژول هم CSV/JSON محلی و هم
// ردیف‌های PostgreSQL را می‌بلعد؛ برای دیتاست بزرگ (۳۳۱ هزار آفر) حالت
// createBuilder() بدون نگه‌داشتن نسخه‌ی خام کل جدول‌ها کار می‌کند.
const fs = require('fs'), path = require('path'), S = require('./schema'), { nm } = require('../engine');

/* ───────── CSV ───────── */
function parseCSV(t) {
  const rows = []; let r = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { r.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      r.push(f); f = ''; if (r.some(x => x !== '')) rows.push(r); r = [];
    } else f += c;
  }
  r.push(f); if (r.some(x => x !== '')) rows.push(r);
  return rows;
}
function csvRows(text) {
  const [h, ...b] = parseCSV(text.replace(/^\uFEFF/, ''));
  if (!h) return { cols: [], rows: [] };
  const cols = h.map(x => x.trim());
  return { cols, rows: b.map(v => Object.fromEntries(cols.map((k, i) => [k, v[i] === undefined || v[i] === '' ? null : v[i]]))) };
}

/* ───────── نرمال‌سازی پایه ───────── */
const FA = '۰۱۲۳۴۵۶۷۸۹', AR = '٠١٢٣٤٥٦٧٨٩';
const lat = s => String(s).replace(/[۰-۹]/g, d => FA.indexOf(d)).replace(/[٠-٩]/g, d => AR.indexOf(d));
const val = v => {
  if (v == null) return null;
  const s = String(Array.isArray(v) ? v.join('، ') : v).replace(/\s+/g, ' ').trim();
  return !s || /^null$/i.test(s) ? null : s;
};
const sv = v => { const s = val(v); return s && lat(s); };
const bool = v => {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (['1', 'true', 'yes', 'بله', 'دارد'].includes(s)) return true;
  if (['0', 'false', 'no', 'خیر', 'ندارد'].includes(s)) return false;
  return null;
};
const json = v => {
  if (v == null) return { v: null };
  if (typeof v !== 'string') return { v };
  const s = v.trim();
  if (!s || s.toLowerCase() === 'null') return { v: null };
  try { return { v: JSON.parse(s) }; } catch { return { err: 1 }; }
};
// شماره‌ها/نام‌ها را برای نمایش یکدست می‌کند ولی ارقام را به لاتین برمی‌گرداند
const cleanPhone = v => { const s = lat(val(v) || '').replace(/[^\d+]/g, ''); return s.length >= 4 ? s : null; };

/* ───────── ساعت کاری ───────── */
// قالب واقعی دیتاست: {"sat":{"status":"declared","shifts":[{"start_time":"09:00:00","end_time":"20:00:00"}]}, ...}
// خروجی: آرایه‌ی ۷تایی (۰=یکشنبه … ۶=شنبه)؛ هر روز null=تعطیل، [[باز,بسته],...]، undefined=نامشخص
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
function timeOf(t) {
  const m = String(t ?? '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h > 24 || mi > 59) return null;
  return h * 60 + mi;
}
function shiftOf(s) {
  if (Array.isArray(s) && s.length === 2 && s.every(Number.isFinite)) return [+s[0], +s[1]];
  if (s && typeof s === 'object') {
    const a = timeOf(s.start_time ?? s.from ?? s.start), b = timeOf(s.end_time ?? s.to ?? s.end);
    if (a != null && b != null) return [a / 60, b / 60];
    return null;
  }
  if (typeof s === 'string') {
    const m = lat(s).match(/(\d{1,2})(?::(\d\d))?\s*[-–—]\s*(\d{1,2})(?::(\d\d))?/);
    if (!m) return null;
    return [+m[1] + (+m[2] || 0) / 60, +m[3] + (+m[4] || 0) / 60];
  }
  return null;
}
// 00:00–00:00 در دیتاست «جای‌خالی» است، نه باز بودن ۲۴ساعته
const placeholder = sh => sh[0] === 0 && sh[1] === 0;
function dayOf(d) {
  if (d === null) return null;
  if (Array.isArray(d) && d.length === 2 && d.every(Number.isFinite)) return [d[0], d[1]];
  if (typeof d === 'string') { const s = shiftOf(d); return s ? [s] : undefined; }
  if (!d || typeof d !== 'object') return undefined;
  const st = String(d.status || '').toLowerCase();
  if (st === 'closed') return null;
  const list = Array.isArray(d.shifts) ? d.shifts : (d.shifts && typeof d.shifts === 'object' ? Object.values(d.shifts) : []);
  if (st === 'declared') {
    const shifts = list.map(shiftOf).filter(Boolean).filter(x => !placeholder(x));
    // روزی که فقط شیفت جای‌خالی دارد «نامشخص» است، نه تعطیل
    return shifts.length ? shifts : undefined;
  }
  return undefined; // unsupported / unknown / بدون وضعیت
}
function hoursOf(v) {
  const j = json(v);
  if (j.err || j.v == null) return undefined;
  const a = j.v;
  if (Array.isArray(a)) {
    if (a.length !== 7) return undefined;
    const out = a.map(dayOf);
    return out.some(x => x !== undefined) ? out : undefined;
  }
  if (typeof a === 'object') {
    const out = new Array(7).fill(undefined);
    let any = false;
    for (let i = 0; i < 7; i++) {
      const raw = a[DAY_KEYS[i]] ?? a[DAY_KEYS[i].toUpperCase()] ?? a[DAY_KEYS[i][0].toUpperCase() + DAY_KEYS[i].slice(1)];
      if (raw === undefined) continue;
      out[i] = dayOf(raw); any = true;
    }
    return any ? out : undefined;
  }
  return undefined;
}

/* ───────── تماس‌ها / پرداخت / گارانتی / تصویر ───────── */
// قالب دیتاست: [{"channel":"phone","display_number":"۰۲۱..."}, {"channel":"whatsapp",...}]
function contactsOf(v) {
  const j = json(v);
  const list = Array.isArray(j.v) ? j.v : [];
  const out = { phone: null, wa: null, bale: null, tg: null, raw: [] };
  const put = (ch, num) => {
    const n = cleanPhone(num);
    if (!n) return;
    const c = String(ch || '').toLowerCase();
    if (!out.phone && (c.includes('phone') || c.includes('tel') || c.includes('call') || c.includes('mobile'))) out.phone = n;
    else if (!out.wa && c.includes('whats')) out.wa = n;
    else if (!out.bale && c.includes('bale')) out.bale = n;
    else if (!out.tg && (c.includes('telegram') || c.includes('tg'))) out.tg = n;
    else if (!out.phone) out.phone = n;
    out.raw.push({ channel: c || 'unknown', number: n });
  };
  for (const it of list) {
    if (it == null) continue;
    if (typeof it === 'string' || typeof it === 'number') { put('phone', it); continue; }
    if (typeof it === 'object') put(it.channel ?? it.type ?? it.kind, it.display_number ?? it.number ?? it.value ?? it.phone);
  }
  return out;
}
const PROVIDER_TOROBPAY = /ترب\s*پی|torob\s*pay/i;
function paymentsOf(v) {
  const j = json(v);
  const list = Array.isArray(j.v) ? j.v : (typeof j.v === 'object' && j.v ? Object.values(j.v) : []);
  const out = { installment: null, torobpay: null, kalabarg: null, providers: [], options: [] };
  if (!list.length) return out;
  let any = false;
  for (const o of list) {
    if (!o || typeof o !== 'object') continue;
    const provider = val(o.provider_name ?? o.provider ?? o.name);
    const channel = val(o.channel) || 'unknown';
    const cats = Array.isArray(o.category_names) ? o.category_names.filter(x => typeof x === 'string') : [];
    const min = Number(o.min_price_toman), max = Number(o.max_price_toman);
    const opt = {
      provider: provider || 'نامشخص', channel,
      min: Number.isFinite(min) && min > 0 ? min : null,
      max: Number.isFinite(max) && max > 0 ? max : null,
      cats
    };
    out.options.push(opt);
    if (provider) out.providers.push(provider);
    if (PROVIDER_TOROBPAY.test(provider || '') && (channel === 'in_person' || channel === 'unknown')) out.torobpay = true;
    if (channel === 'in_person') { any = true; out.installment = true; }
    if (/کالابرگ|kalabarg/i.test(provider || '')) out.kalabarg = true;
  }
  out.installment = any ? true : (out.providers.length ? false : null);
  if (out.torobpay !== true && out.providers.some(p => PROVIDER_TOROBPAY.test(p))) out.torobpay = true;
  out.providers = [...new Set(out.providers)];
  return out;
}
// قالب دیتاست: {"provider":"...","description":"...","period_months":18}
function warrantyOf(v) {
  if (v == null) return null;
  const j = json(v);
  if (j.err) return val(v) ? { text: val(v), provider: null, months: null } : null;
  if (typeof j.v === 'string') return j.v.trim() ? { text: val(j.v), provider: null, months: null } : null;
  if (!j.v || typeof j.v !== 'object') return null;
  const provider = val(j.v.provider), desc = val(j.v.description);
  const months = Number(j.v.period_months);
  const parts = [];
  if (provider) parts.push(provider);
  if (Number.isFinite(months) && months > 0) parts.push('گارانتی ' + months + ' ماهه');
  if (desc && !/^none$/i.test(desc) && !parts.includes(desc)) parts.push(desc);
  if (!parts.length) return null;
  return { text: parts.join(' · ').slice(0, 160), provider, months: Number.isFinite(months) && months > 0 ? months : null };
}
function imagesOf(v) {
  const j = json(v);
  let a = j.v;
  if (typeof a === 'string') a = a.split(/[\s,;]+/);
  return Array.isArray(a) ? a.filter(x => typeof x === 'string' && /^https?:\/\//i.test(x)).slice(0, 8) : [];
}
function categoriesOf(v) {
  const j = json(v);
  if (Array.isArray(j.v)) return j.v.filter(x => typeof x === 'string' && x.trim()).map(x => val(x)).filter(Boolean);
  const s = val(v);
  return s ? [s] : [];
}
// نشانی دقیق داخل پاساژ: پاساژ/مجتمع، طبقه، واحد را از متن آدرس و توضیح مکان درمی‌آورد
function placeOf(...texts) {
  const t = lat(texts.filter(Boolean).join('، ')).replace(/\s+/g, ' ');
  if (!t) return null;
  const mall = (t.match(/(?:پاساژ|مجتمع(?:\s+تجاری)?|مرکز خرید|مرکز تجاری|مجموعه|برج|بازار|راسته|سرای)\s*[^،,\-–|\n]{1,40}/) || [])[0];
  const floor = (t.match(/طبقه\s*(?:منفی\s*)?(?:همکف|زیرزمین|اول|دوم|سوم|چهارم|پنجم|ششم|هفتم|هشتم|نهم|دهم|[0-9۰-۹]+)/) || [])[0];
  const unit = (t.match(/(?:واحد|پلاک|مغازه)\s*(?:شماره\s*)?[0-9۰-۹]+(?:\s*[-\/]\s*[0-9۰-۹]+)?/) || [])[0];
  const pd = x => (x && x.trim().replace(/[0-9]/g, d => FA[d]).replace(/\s+/g, ' ')) || null;
  const r = { mall: pd(mall), floor: pd(floor), unit: pd(unit) };
  return r.mall || r.floor || r.unit ? r : null;
}
function urlOf(v, kind) {
  const s = val(v);
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s.slice(0, 300);
  if (kind === 'instagram') {
    const u = s.replace(/^@/, '').replace(/^(?:www\.)?instagram\.com\//i, '').replace(/\/.*$/, '');
    return /^[A-Za-z0-9._]{1,30}$/.test(u) ? 'https://instagram.com/' + u : null;
  }
  if (/^[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(s)) return 'https://' + s.slice(0, 300);
  return null;
}

/* ───────── نگاشت ستون‌ها ───────── */
// override اگر داده شود «جایگزین» نامزدها می‌شود (نه اضافه)؛ تطبیق بدون حساسیت به حروف/فاصله
function resolveCols(cols, cand, over = {}) {
  const lc = new Map(cols.map(c => [String(c).trim().toLowerCase(), c]));
  const res = {}, missing = [], overrideMisses = [];
  for (const [f, names] of Object.entries(cand)) {
    const has = Object.prototype.hasOwnProperty.call(over, f);
    const list = [].concat(has ? over[f] : names);
    const hit = list.map(n => lc.get(String(n).trim().toLowerCase())).find(Boolean);
    if (hit) res[f] = hit;
    else { missing.push(f); if (has) overrideMisses.push({ field: f, tried: list }); }
  }
  const by = {};
  for (const [f, c] of Object.entries(res)) (by[c] = by[c] || []).push(f);
  const duplicates = Object.entries(by).filter(([, v]) => v.length > 1).map(([column, fields]) => ({ column, fields }));
  const used = new Set(Object.values(res));
  return { resolved: res, missing, overrideMisses, duplicates, unknown: cols.filter(c => !used.has(c)) };
}
const TOP = ['CONFIRMED', 'SHOP_CANDIDATES', 'SHOPS', 'SPEC_ALIASES', 'EXTRA', 'CORE'];
function validateSchema(sc, SC) {
  const w = [];
  if (!sc || typeof sc !== 'object' || Array.isArray(sc)) return ['mapping باید یک آبجکت JSON باشد'];
  const ok = v => typeof v === 'string' || (Array.isArray(v) && v.every(x => typeof x === 'string'));
  for (const k of Object.keys(sc)) if (!TOP.includes(k)) w.push('کلید ناشناخته در mapping: ' + k);
  const fields = ['id', ...Object.keys(SC || S.SHOP_CANDIDATES)];
  for (const [f, v] of Object.entries(sc.SHOPS || {})) {
    if (!fields.includes(f)) w.push('فیلد ناشناخته در SHOPS: ' + f);
    if (!ok(v)) w.push('مقدار SHOPS.' + f + ' باید رشته یا آرایه‌ی رشته باشد');
  }
  for (const [t, o] of Object.entries(sc.CONFIRMED || {})) {
    if (!S.CONFIRMED[t]) { w.push('جدول ناشناخته در CONFIRMED: ' + t); continue; }
    for (const [f, v] of Object.entries(o || {})) {
      if (!(f in S.CONFIRMED[t])) w.push('فیلد ناشناخته در CONFIRMED.' + t + ': ' + f);
      if (typeof v !== 'string') w.push('مقدار CONFIRMED.' + t + '.' + f + ' باید رشته باشد');
    }
  }
  for (const [f, v] of Object.entries(sc.SPEC_ALIASES || {})) if (!Array.isArray(v) || !v.every(x => typeof x === 'string')) w.push('SPEC_ALIASES.' + f + ' باید آرایه‌ی رشته باشد');
  return w;
}

// هر ردیف را می‌پیماید؛ هم آرایه (فایل CSV/JSON) و هم AsyncIterator (صفحه‌بندی PostgreSQL).
// برای آرایه همگام (و مقدار بازگشتی undefined) است و برای جریان ناهمگام یک Promise برمی‌گرداند.
function eachRow(rows, fn) {
  if (rows && typeof rows[Symbol.asyncIterator] === 'function') {
    return (async () => { for await (const r of rows) fn(r); })();
  }
  for (const r of rows) fn(r);
  return undefined;
}

/* ───────── ساخت داده (بدون نگه‌داشتن نسخه‌ی خام) ───────── */
const REQUIRED = { products: ['id', 'title_fa'], offers: ['product', 'shop', 'price'], shops: ['id'] };
const TABLE_LABEL = { products: 'محصولات', offers: 'آفرها', shops: 'فروشگاه‌ها' };

function createBuilder({ schema = {} } = {}) {
  const CF = S.merge(S.CONFIRMED, schema.CONFIRMED);
  const shopCand = { id: [CF.shops.id], ...S.SHOP_FIELDS };
  const AL = { ...S.SPEC_ALIASES, ...(schema.SPEC_ALIASES || {}) };
  const EX = { ...S.EXTRA, ...(schema.EXTRA || {}) };
  const CORE = schema.CORE || S.CORE;
  const over = schema.SHOPS || {};

  const rep = {
    ok: true, errors: [], warnings: validateSchema(schema, S.SHOP_CANDIDATES), tables: {},
    issues: { badShops: 0, duplicateShops: 0, badProducts: 0, duplicateProducts: 0, badOffers: 0, orphanOffers: 0, badHours: 0, badSpecs: 0, badCoords: 0, badPrice: 0, nonpositivePrice: 0, priceOutlier: 0, missingPrice: 0, placeholderPrice: 0, duplicateOfferPairs: 0, shopsWithoutProducts: 0, shopsWithoutLocation: 0 },
    specs: {}, counts: { products: 0, shops: 0, offers: 0 }
  };

  const resolved = {};
  const shops = [], products = [], offers = [];
  const sid = new Set(), pid = new Set(), used = new Set();
  const shopById = new Map();
  const kvList = []; // [product, Map] فقط برای محصولات دارای specs
  const keyCount = new Map(), keyVals = new Map(), matched = new Set();
  const intern = new Map();
  const pool = s => { if (s == null) return s; const hit = intern.get(s); if (hit) return hit; if (intern.size < 250000) intern.set(s, s); return s; };

  function cols(table, given) {
    if (resolved[table]) return resolved[table];
    const base = table === 'products' ? CF.products : table === 'offers' ? CF.offers : shopCand;
    const al = S.ALIASES[table] || {};
    const cand = Object.fromEntries(Object.entries(base).map(([f, name]) => [f, [...new Set([].concat(name, al[f] || []))]]));
    let r;
    if (table === 'shops') {
      r = resolveCols(given, cand, over);
      rep.tables.shops = { rows: 0, resolved: r.resolved, missingFields: r.missing, unknownColumns: r.unknown, overrideMisses: r.overrideMisses, duplicateColumns: r.duplicates };
      if (!r.resolved.id) { rep.ok = false; rep.errors.push('فروشگاه‌ها: ستون شناسه (' + [].concat(cand.id).join(' | ') + ') یافت نشد'); }
      for (const d of r.duplicates) rep.warnings.push('یک ستون به چند فیلد نگاشت شده: ' + d.column + ' ← ' + d.fields.join(', '));
      for (const m of r.overrideMisses) rep.warnings.push('ستون override یافت نشد برای ' + m.field + ': ' + m.tried.join(' | '));
    } else {
      r = resolveCols(given, cand, over.table ? over : {});
      const miss = r.missing.filter(f => REQUIRED[table].includes(f));
      const optional = r.missing.filter(f => !REQUIRED[table].includes(f));
      rep.tables[table] = { rows: 0, missingColumns: optional, missingRequired: miss, unknownColumns: r.unknown, resolved: r.resolved };
      if (miss.length) { rep.ok = false; rep.errors.push(TABLE_LABEL[table] + ': ستون ضروری یافت نشد: ' + miss.map(f => [].concat(cand[f])[0]).join(', ')); }
      if (optional.length) rep.warnings.push(TABLE_LABEL[table] + ': ستون‌های اختیاری یافت نشد: ' + optional.join(', '));
    }
    resolved[table] = r.resolved;
    return r.resolved;
  }

  function addShops(rows, columns) {
    const R = cols('shops', columns);
    const t = rep.tables.shops;
    const g = (r, k) => (R[k] ? r[R[k]] : null);
    const done = eachRow(rows, r => {
      t.rows++;
      const id = val(r[R.id]);
      if (!id) { rep.issues.badShops++; return; }
      if (sid.has(id)) { rep.issues.duplicateShops++; return; }
      let la = null, ln = null;
      if (R.lat && R.lng) {
        la = parseFloat(lat(g(r, 'lat')));
        ln = parseFloat(lat(g(r, 'lng')));
        if (!(Math.abs(la) <= 90) || !(Math.abs(ln) <= 180)) { la = ln = null; rep.issues.badCoords++; }
      }
      if (la == null || ln == null) rep.issues.shopsWithoutLocation++;
      const rawHours = g(r, 'hours');
      const hrs = hoursOf(rawHours);
      if (rawHours != null && hrs === undefined) rep.issues.badHours++;
      const ct = contactsOf(g(r, 'contacts'));
      const pay = paymentsOf(g(r, 'payments'));
      const cats = categoriesOf(g(r, 'categories'));
      const addr = val(g(r, 'address')), placeDesc = val(g(r, 'place_desc'));
      sid.add(id);
      const shop = {
        id, name: val(g(r, 'name')) || 'نامشخص',
        addr, mall: addr, place: placeOf(addr, placeDesc),
        lat: la, lng: ln, hours: hrs,
        installment: pay.installment, torobpay: pay.torobpay, kalabarg: pay.kalabarg,
        express: bool(g(r, 'express')), tel: ct.phone, wa: ct.wa, bale: ct.bale, tg: ct.tg,
        cats, pay: pay.options.slice(0, 8), providers: pay.providers.slice(0, 6),
        ig: urlOf(g(r, 'instagram'), 'instagram'), web: urlOf(g(r, 'website'), 'web'),
        hasProducts: false
      };
      shops.push(shop); shopById.set(id, shop);
    });
    return done ? done.then(() => t.rows) : t.rows;
  }

  function addProducts(rows, columns) {
    const R = cols('products', columns);
    const t = rep.tables.products;
    const done = eachRow(rows, r => {
      t.rows++;
      const id = val(r[R.id]);
      if (!id || pid.has(id) || !(val(r[R.title_fa]) || val(r[R.model]))) {
        if (id && pid.has(id)) rep.issues.duplicateProducts++; else rep.issues.badProducts++;
        return;
      }
      pid.add(id);
      const j = json(R.specs ? r[R.specs] : null);
      if (j.err) rep.issues.badSpecs++;
      const kv = new Map();
      if (Array.isArray(j.v)) {
        for (const e of j.v) {
          const k = e && val(e.key), v = e && sv(e.value);
          if (k && v && !kv.has(k)) kv.set(pool(k), pool(v));
        }
      }
      const p = {
        id, cat: val(R.cat ? r[R.cat] : null) || 'نامشخص',
        title_fa: val(r[R.title_fa]), brand: val(R.brand ? r[R.brand] : null) ?? undefined,
        model: val(R.model ? r[R.model] : null) ?? undefined,
        image: imagesOf(R.images ? r[R.images] : null)[0]
      };
      for (const [lk, names] of Object.entries(AL)) {
        let hit = null;
        for (const n of names) { const k = kv.has(n) ? n : (kv.has(nm(n)) ? nm(n) : null); if (k) { hit = k; break; } }
        if (hit) { p[lk] = kv.get(hit); kv.delete(hit); matched.add(lk); }
      }
      for (const k of kv.keys()) { const ck = p.cat + '\u0000' + k; keyCount.set(ck, (keyCount.get(ck) || 0) + 1); }
      products.push(p);
      if (kv.size) kvList.push([p, kv]);
    });
    return done ? done.then(() => t.rows) : t.rows;
  }

  function addOffers(rows, columns) {
    const R = cols('offers', columns);
    const t = rep.tables.offers;
    const done = eachRow(rows, r => {
      t.rows++;
      const rawPrice = R.price ? r[R.price] : null;
      const pr = val(R.product ? r[R.product] : null), sh = val(R.shop ? r[R.shop] : null);
      if (rawPrice == null || String(rawPrice).trim() === '') { rep.issues.missingPrice++; rep.issues.badOffers++; return; }
      const price = Number(lat(rawPrice).replace(/[,٬\s]/g, ''));
      if (!Number.isFinite(price)) { rep.issues.badPrice++; rep.issues.badOffers++; return; }
      if (price <= 0) { rep.issues.nonpositivePrice++; rep.issues.badOffers++; return; }
      if (price > 1e11) rep.issues.priceOutlier++;
      if (price === 1 || (String(price).length >= 6 && new Set(String(price)).size === 1)) rep.issues.placeholderPrice++;
      if (!pid.has(pr) || !sid.has(sh)) { rep.issues.orphanOffers++; rep.issues.badOffers++; return; }
      const w = warrantyOf(R.warranty ? r[R.warranty] : null);
      const up = R.updated ? val(r[R.updated]) : null;
      const ts = up ? Date.parse(lat(up)) : NaN;
      used.add(pr);
      offers.push({
        shop: sh, product: pr, price,
        unit: 'تومان', updated: Number.isNaN(ts) ? null : new Date(ts).toISOString(),
        warranty: w ? w.text : null, seller: R.seller ? val(r[R.seller]) : null,
        description: R.description ? val(r[R.description]) : null
      });
    });
    return done ? done.then(() => t.rows) : t.rows;
  }

  function finish() {
    // ساخت فیلترهای پویا از specs در سه گام کم‌حافظه:
    // ۱) نامزدها بر اساس پوشش، ۲) شمارش مقادیر یکتا با سقف، ۳) نشاندن مقدار روی محصول
    const byCat = {};
    for (const p of products) (byCat[p.cat] = byCat[p.cat] || []).push(p);
    const cands = [];
    for (const [cat, list] of Object.entries(byCat)) {
      for (const [ck, n] of keyCount) {
        if (!ck.startsWith(cat + '\u0000')) continue;
        if (n / list.length < EX.minCoverage) continue;
        cands.push({ cat, key: ck.slice(cat.length + 1), n });
      }
    }
    cands.sort((a, b) => b.n - a.n);
    const sets = new Map();
    for (const c of cands) sets.set(c.cat + '\u0000' + c.key, new Set());
    for (const [p, kv] of kvList) {
      for (const [k, v] of kv) {
        const set = sets.get(p.cat + '\u0000' + k);
        if (set && set.size <= EX.maxValues) set.add(v);
      }
    }
    const xid = new Map(); let xi = 0;
    const chosen = new Set();
    const picked = {};
    for (const c of cands) {
      const set = sets.get(c.cat + '\u0000' + c.key);
      if (!set || set.size < 2 || set.size > EX.maxValues) continue;
      const usage = picked[c.cat] = (picked[c.cat] || 0) + 1;
      if (usage > EX.maxFilters) continue;
      if (!xid.has(c.key)) xid.set(c.key, 'x' + (++xi));
      chosen.add(c.key);
    }
    if (chosen.size) {
      for (const [p, kv] of kvList) for (const k of chosen) if (kv.has(k) && p[xid.get(k)] === undefined) p[xid.get(k)] = kv.get(k);
    }
    kvList.length = 0;

    const live = products.filter(p => used.has(p.id));
    const liveSet = new Set(live.map(p => p.id));
    const offersOut = offers.filter(o => liveSet.has(o.product));
    for (const o of offersOut) { const s = shopById.get(o.shop); if (s) s.hasProducts = true; }
    rep.issues.shopsWithoutProducts = shops.filter(s => !s.hasProducts).length;

    const cats = {}, liveByCat = {};
    for (const p of live) (liveByCat[p.cat] = liveByCat[p.cat] || []).push(p);
    for (const [cat, list] of Object.entries(liveByCat)) {
      const steps = [], cov = k => list.filter(p => p[k] != null).length;
      for (const [k, l] of CORE) if (cov(k) / list.length >= 0.02) steps.push([k, l]);
      for (const [k, id] of xid) if (keyCount.has(cat + '\u0000' + k)) steps.push([id, k]);
      cats[cat] = { name: cat, count: list.length, steps };
    }
    const top = {};
    for (const [ck, n] of keyCount) { const k = ck.split('\u0000')[1]; top[k] = (top[k] || 0) + n; }
    rep.specs = {
      productsWithSpecs: live.filter(p => Object.keys(p).some(k => k.startsWith('x'))).length,
      matchedCore: [...matched], unmatchedCore: Object.keys(AL).filter(k => !matched.has(k)),
      topKeys: Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 40)
    };
    rep.counts = { products: live.length, shops: shops.length, offers: offersOut.length };
    return { products: live, shops, offers: offersOut, registry: { cats }, report: rep };
  }

  return { addShops, addProducts, addOffers, finish, report: rep };
}

function build(raw, { schema = {} } = {}) {
  const b = createBuilder({ schema });
  try {
    if (!raw || !raw.products || !raw.offers || !raw.shops) throw new Error('products/offers/shops لازم است');
    b.addShops(raw.shops.rows || [], raw.shops.cols || []);
    b.addProducts(raw.products.rows || [], raw.products.cols || []);
    b.addOffers(raw.offers.rows || [], raw.offers.cols || []);
    return b.finish();
  } catch (e) {
    const r = b.report;
    r.ok = false; r.errors.push(e.message);
    return { products: [], shops: [], offers: [], registry: { cats: {} }, report: r };
  }
}

/* ───────── فایل محلی ───────── */
function readTable(dir, name) {
  for (const ext of ['csv', 'json', 'jsonl']) {
    const f = path.join(dir, name + '.' + ext);
    if (!fs.existsSync(f)) continue;
    const t = fs.readFileSync(f, 'utf8');
    if (ext === 'csv') return csvRows(t);
    if (ext === 'jsonl') {
      const rows = t.split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));
      const cols = [...new Set(rows.flatMap(Object.keys))];
      return { cols, rows: rows.map(o => Object.fromEntries(cols.map(c => [c, flat(o[c])]))) };
    }
    const a = JSON.parse(t);
    const cols = [...new Set(a.flatMap(Object.keys))];
    return { cols, rows: a.map(o => Object.fromEntries(cols.map(c => [c, flat(o[c])]))) };
  }
  return null;
}
const flat = v => v == null || v === '' ? null : typeof v === 'object' ? JSON.stringify(v) : String(v);
function loadMapping(dir) {
  let schema = {};
  const mf = path.join(dir, 'mapping.json');
  if (fs.existsSync(mf)) { try { schema = JSON.parse(fs.readFileSync(mf, 'utf8')); } catch (e) { return { error: e.message }; } }
  return { schema };
}
const badMapping = e => ({ products: [], shops: [], offers: [], registry: { cats: {} }, report: { ok: false, errors: ['mapping.json نامعتبر است: ' + e], warnings: [], tables: {}, issues: {}, specs: {} } });
function loadDir(dir) {
  const raw = { products: readTable(dir, 'products'), offers: readTable(dir, 'offers'), shops: readTable(dir, 'shops') };
  if (!raw.products || !raw.offers || !raw.shops) return null;
  const m = loadMapping(dir);
  if (m.error) return badMapping(m.error);
  return build(raw, { schema: m.schema });
}
function fromRaw(raw, dir) {
  const m = dir ? loadMapping(dir) : { schema: {} };
  if (m.error) return badMapping(m.error);
  return build(raw, { schema: m.schema });
}

module.exports = { eachRow,
  parseCSV, csvRows, build, loadDir, fromRaw, readTable, loadMapping, resolveCols, validateSchema,
  placeOf, urlOf, hoursOf, contactsOf, paymentsOf, warrantyOf, imagesOf, categoriesOf, createBuilder, flat
};
