'use strict';
const DAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const valid = l => !!l && Number.isFinite(l.lat) && Number.isFinite(l.lng) && Math.abs(l.lat) <= 90 && Math.abs(l.lng) <= 180;
// فاصله مستقیم (خط صاف) — نه مسیر رانندگی
const hav = (a, b) => {
  const r = x => x * Math.PI / 180, dl = r(b.lat - a.lat), dg = r(b.lng - a.lng);
  const q = Math.sin(dl / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dg / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(q));
};
const nm = x => String(x ?? '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]).toLowerCase();
const tok = q => nm(q).split(/\s+/).filter(w => w.length > 1);
const FMT = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tehran', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function tehranNow(now) {
  const p = {};
  for (const x of FMT.formatToParts(now || new Date())) p[x.type] = x.value;
  return { day: DAYS[p.weekday], min: +p.hour * 60 + +p.minute };
}
const hm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(Math.round(m % 60)).padStart(2, '0');

// ساعت: آرایه ۷تایی (۰=یکشنبه). هر روز: null=تعطیل، [باز,بسته] یا [[باز,بسته],...]، undefined=نامشخص
function normDay(d) {
  if (d === null) return { closed: true, shifts: [] };
  if (!Array.isArray(d)) return null;
  if (d.length === 2 && d.every(x => Number.isFinite(x))) return { shifts: [[d[0] * 60, d[1] * 60]] };
  if (d.length && d.every(x => Array.isArray(x) && x.length === 2 && x.every(Number.isFinite))) return { shifts: d.map(([a, b]) => [a * 60, b * 60]) };
  return null;
}
function hoursStatus(shop, now = new Date(), tn) {
  const h = shop && shop.hours;
  if (!Array.isArray(h) || h.length !== 7) return { state: 'unknown' };
  const { day, min } = tn || tehranNow(now);
  // شیفت شبانه‌ی دیروز (مثلاً ۲۰:۰۰ تا ۰۲:۰۰) اولویت دارد
  const yest = normDay(h[(day + 6) % 7]);
  if (yest && !yest.closed) {
    for (const [a, b0] of yest.shifts) {
      const b = b0 > 1440 ? b0 - 1440 : b0;
      if ((b0 <= a || b0 > 1440) && min < b) return { state: 'open', open: a / 60, close: b / 60, overnight: true, closeInMin: b - min };
    }
  }
  const t = normDay(h[day]);
  if (!t) return { state: 'unknown' };
  if (t.closed) return { state: 'closed', note: 'تعطیل', closeInMin: null };
  if (!t.shifts.length) return { state: 'unknown' };
  for (const [a, b] of t.shifts) {
    const end = b <= a ? b + 1440 : b;
    if (min >= a && min < end) return { state: 'open', open: a / 60, close: (b <= a ? b : b) / 60, closeInMin: end - min, shifts: t.shifts.map(s => s.map(x => x / 60)) };
  }
  const next = t.shifts.filter(([a]) => a > min).sort((x, y) => x[0] - y[0])[0];
  return {
    state: 'closed', open: t.shifts[0][0] / 60, close: t.shifts[t.shifts.length - 1][1] / 60,
    shifts: t.shifts.map(s => s.map(x => x / 60)),
    next: next ? { inMin: next[0] - min, at: hm(next[0]) } : null,
    note: next ? 'بعداً باز می‌شود' : 'امروز بسته است'
  };
}
// آیا در لحظه‌ی «رسیدن» (دقیقه‌های بعد) فروشگاه باز است؟
function openAtArrival(shop, now, minutes) {
  const t0 = now || new Date();
  const eta = Math.max(0, Math.round(minutes || 0));
  return hoursStatus(shop, new Date(t0.getTime() + eta * 60000));
}

// اشتراک دو آرایه‌ی مرتب‌شده (دوپوینتر یا جست‌وجوی دودویی وقتی اندازه‌ها خیلی فرق دارند)
function intersect(a, b) {
  if (a.length > b.length) [a, b] = [b, a];
  const r = [];
  if (a.length * 16 < b.length) {
    for (const x of a) { let lo = 0, hi = b.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (b[m] === x) { r.push(x); break; } b[m] < x ? lo = m + 1 : hi = m - 1; } }
    return r;
  }
  let i = 0, j = 0;
  while (i < a.length && j < b.length) { if (a[i] === b[j]) { r.push(a[i]); i++; j++; } else a[i] < b[j] ? i++ : j++; }
  return r;
}

// اعتبار خرید اقساطی حضوری: هر گزینه‌ی فروشنده سقف/کف مبلغ و دسته‌ی خودش را دارد.
// دسته‌ی فعالیت فروشگاه به‌تنهایی مدرک موجود بودن محصول نیست؛ قیمت و دسته‌ی خود آفر بررسی می‌شود.
function creditOk(shop, offer, product) {
  const opts = shop && Array.isArray(shop.pay) ? shop.pay : null;
  if (!opts || !opts.length) return false;
  for (const o of opts) {
    if (o.channel !== 'in_person') continue;
    if (o.min != null && offer.price < o.min) continue;
    if (o.max != null && offer.price > o.max) continue;
    if (o.cats && o.cats.length && !(product && o.cats.includes(product.cat))) continue;
    return true;
  }
  return false;
}

class Index {
  constructor({ products, shops, offers }) {
    this.P = new Map(products.map(p => [p.id, p]));
    this.S = new Map(shops.map(s => [s.id, s]));
    this.byP = new Map(); this.dropped = 0;
    for (const o of offers) {
      if (!this.P.has(o.product) || !this.S.has(o.shop) || !(o.price > 0)) { this.dropped++; continue; }
      if (!this.byP.has(o.product)) this.byP.set(o.product, []);
      this.byP.get(o.product).push(o);
    }
    // ایندکس‌ها: items = محصولات دارای آفر به ترتیب درج؛ همه‌ی لیست‌ها بر حسب اندیس items مرتب‌اند
    this.items = []; this.nShops = []; this.catIdx = new Map();
    for (const p of this.P.values()) {
      const os = this.byP.get(p.id); if (!os) continue;
      const i = this.items.length;
      this.items.push(p); this.nShops.push(new Set(os.map(o => o.shop)).size);
      let l = this.catIdx.get(p.cat); if (!l) this.catIdx.set(p.cat, l = []);
      l.push(i);
    }
    this._all = null; this._attr = new Map(); this._hay = null; this._opt = new Map();
    // فروشگاه‌ها با مختصات، برای پیشنهاد پاساژ/بازار نزدیک و فروشگاه‌های هم‌محدوده
    this.geoShops = shops.filter(s => valid(s));
  }
  shopCount(pid) { return new Set((this.byP.get(pid) || []).map(o => o.shop)).size; }
  _allIdx() { return this._all || (this._all = this.items.map((_, i) => i)); }
  _attrIdx(key) {
    let m = this._attr.get(key); if (m) return m;
    m = new Map();
    this.items.forEach((p, i) => { const v = p[key]; if (v == null) return; const k = String(v); let l = m.get(k); if (!l) m.set(k, l = []); l.push(i); });
    this._attr.set(key, m); return m;
  }
  _hayArr() { return this._hay || (this._hay = this.items.map(p => nm([p.title_fa, p.title_en, p.brand, p.model, p.color, p.cat].filter(Boolean).join(' ')))); }
  candIdx({ cat, sel = {}, q } = {}) {
    const lists = [];
    if (cat) lists.push(this.catIdx.get(cat) || []);
    for (const [k, v] of Object.entries(sel)) lists.push(this._attrIdx(k).get(String(v)) || []);
    let r;
    if (!lists.length) r = this._allIdx();
    else { lists.sort((a, b) => a.length - b.length); r = lists[0]; for (let i = 1; i < lists.length && r.length; i++) r = intersect(r, lists[i]); }
    const t = q ? tok(q) : [];
    if (t.length) { const H = this._hayArr(); r = r.filter(i => { const h = H[i]; return t.every(w => h.includes(w)); }); }
    return r;
  }
  cands(f = {}) { return this.candIdx(f).map(i => this.items[i]); }
  options(f, key) {
    const ck = JSON.stringify([f.cat, f.sel, f.q, key]), hit = this._opt.get(ck); if (hit) return hit;
    const idx = this.candIdx(f), m = new Map(); let missing = 0;
    for (const i of idx) {
      const v = this.items[i][key];
      if (v == null || v === '') { missing++; continue; }
      m.set(v, (m.get(v) || 0) + this.nShops[i]);
    }
    const r = { total: idx.length, missing, options: [...m].map(([v, n]) => ({ v, n })).sort((a, b) => b.n - a.n) };
    if (this._opt.size > 500) this._opt.clear();
    this._opt.set(ck, r); return r;
  }
  offers(pid, o = {}) {
    const tn = tehranNow(o.now || new Date());
    const product = this.P.get(pid);
    let out = [];
    for (const of of this.byP.get(pid) || []) {
      const s = this.S.get(of.shop);
      if (!s) continue;
      const d = valid(o.loc) && valid(s) ? hav(o.loc, s) : null;
      const hs = hoursStatus(s, o.now, tn);
      if (o.rad && d != null && d > o.rad) continue;
      if (o.inst && s.installment !== true) continue;
      if (o.credit && !creditOk(s, of, product)) continue;
      if (o.torobpay && s.torobpay !== true) continue;
      if (o.kalabarg && s.kalabarg !== true) continue;
      if (o.express && s.express !== true) continue;
      if (o.min && of.price < o.min) continue;
      if (o.max && of.price > o.max) continue;
      if (o.open && hs.state !== 'open') continue;
      if (o.pricedOnly && of.price === 1) continue;
      out.push({ shop: s, offer: of, km: d, hours: hs, credit: creditOk(s, of, product) });
    }
    if (!out.length) return out;
    const min = Math.min(...out.map(r => r.offer.price));
    for (const r of out) r.score = +(r.offer.price / min + 0.03 * (r.km || 0)).toFixed(3);
    const key = { price: r => r.offer.price, dist: r => r.km ?? 1e9, smart: r => r.score, closing: r => (r.hours.state === 'open' ? r.hours.closeInMin : 1e9) }[o.sort] || (r => r.offer.price);
    return out.sort((a, b) => key(a) - key(b));
  }
  // فروشگاه‌های جایگزین برای همان محصول (وقتی فروشگاه انتخابی بسته/بی‌پاسخ است): اول بازها، بعد امتیاز ترکیبی
  backups(pid, shopId, o = {}) {
    const rows = this.offers(pid, { ...o, rad: o.rad ? o.rad * 1.5 : undefined, sort: 'smart' }).filter(r => r.shop.id !== shopId);
    return rows.filter(r => r.hours.state === 'open').concat(rows.filter(r => r.hours.state !== 'open')).slice(0, 3);
  }
  priceRange(pid) {
    const os = this.byP.get(pid) || [];
    if (!os.length) return { minPrice: null, maxPrice: null, shops: 0 };
    let lo = Infinity, hi = 0;
    for (const o of os) { if (o.price < lo) lo = o.price; if (o.price > hi) hi = o.price; }
    return { minPrice: lo, maxPrice: hi, shops: this.shopCount(pid) };
  }
  alternatives(pid, o) {
    const p = this.P.get(pid), r = [];
    if (!p) return r;
    const sel = {};
    if (p.brand != null) sel.brand = p.brand;
    if (p.model != null) sel.model = p.model;
    for (const i of this.candIdx({ cat: p.cat, sel })) {
      const q = this.items[i];
      if (q.id === pid || q.brand !== p.brand) continue;
      if (p.model != null && q.model !== p.model) continue;
      const diff = ['color', 'ram', 'storage', 'size'].filter(k => q[k] !== p[k]);
      if (diff.length !== 1) continue;
      const rows = this.offers(q.id, o);
      if (rows.length) r.push({ product: q, diff, best: rows[0] });
    }
    return r.slice(0, 6);
  }
  // فروشگاه‌های نزدیک (مختصات دارند) با فاصله، برای پیشنهاد «همین محدوده را بگرد»
  nearShops(loc, radKm, filter) {
    if (!valid(loc)) return [];
    const out = [];
    for (const s of this.geoShops) {
      if (filter && !filter(s)) continue;
      const km = hav(loc, s);
      if (km <= radKm) out.push({ shop: s, km });
    }
    return out.sort((a, b) => a.km - b.km);
  }
}

module.exports = { Index, hav, valid, hoursStatus, openAtArrival, creditOk, tehranNow, hm, nm, tok, intersect };
