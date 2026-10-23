'use strict';
// قرارداد ابزارهای ایجنت. مدل فقط نام ابزار + آرگومان می‌فرستد؛ اجرا و اعتبارسنجی سمت سرور است.
// ابزارهای اجرایی (پرسش/تماس/هشدار) عمداً فقط «پیشنهاد» می‌سازند تا هیچ پیامی بدون رضایت کاربر
// و بدون ساعت کاری مناسب برای فروشگاه فرستاده نشود.
const { hoursStatus } = require('./engine');
const { advise, planTrip, hubsOf } = require('./advice');
const T = (name, description, parameters) => ({ name, description, parameters });

exports.TOOLS = [
  T('search_products', 'جست‌وجوی محصول با عنوان/برند/مدل؛ اگر چند دسته یا نتیجه‌ی مبهم برگشت، از next_question یا ask_clarification استفاده کن', { q: 'string', cat: 'string?' }),
  T('next_question', 'بعدی‌ترین مشخصه‌ی نامعلوم (برند/رنگ/مدل/...) و گزینه‌های واقعاً موجود؛ done=true یعنی اطلاعات کافی است', { cat: 'string?', sel: 'object?' }),
  T('ask_clarification', 'وقتی اطلاعات ضروری نامشخص است سؤال تکمیلی بپرس (حدس نزن). فقط سؤال را برمی‌گرداند', { question: 'string', options: 'string[]?' }),
  T('extract_filters', 'گزینه‌های موجود یک مشخصه با فیلترهای فعلی', { cat: 'string', key: 'string', sel: 'object?' }),
  T('compare_shops', 'مقایسه آفر فروشگاه‌ها برای یک محصول (فاصله خط مستقیم؛ موجودی همیشه تأییدنشده)', { product: 'string', lat: 'number?', lng: 'number?', rad: 'number?', min: 'number?', max: 'number?', inst: 'boolean?', credit: 'boolean?', open: 'boolean?', sort: 'price|dist|smart|closing?' }),
  T('check_hours', 'وضعیت ساعات کاری فروشگاه (open/closed/unknown) و زمان بسته شدن', { shop: 'string' }),
  T('suggest_alternatives', 'جایگزین با تفاوت در یک مشخصه', { product: 'string', lat: 'number?', lng: 'number?', rad: 'number?' }),
  T('advise_visit', 'تصمیم «الان کجا بروم»: نزدیک‌ترین فروشگاه باز، بسته‌های نزدیک، گزینه‌های دورتر باز، پاساژ/بازار پیشنهادی و فروشگاه‌های هم‌دسته که محصول را در ترب ثبت نکرده‌اند', { product: 'string', lat: 'number', lng: 'number', rad: 'number?', max: 'number?' }),
  T('find_hubs', 'پاساژ/بازارهای نزدیک کاربر به‌همراه تعداد فروشگاه، تعداد باز و ارتباط دسته‌ای', { lat: 'number', lng: 'number', rad: 'number?', cat: 'string?' }),
  T('plan_trip', 'برنامه‌ی مراجعه به ۲ تا ۵ فروشگاه با ترتیب بهینه، زمان رسیدن و بررسی باز بودن در لحظه‌ی رسیدن', { product: 'string', shops: 'string', lat: 'number', lng: 'number' }),
  T('draft_outreach', 'پیش‌نویس پیام/تماس برای فروشگاه (بدون ارسال) + بهترین زمان تماس با توجه به ساعت کاری', { shop: 'string', product: 'string', topic: 'availability|price|hours|installment|terms' })
];

function bad(spec, v) {
  const opt = spec.endsWith('?'), s = opt ? spec.slice(0, -1) : spec;
  if (v === undefined || v === null) return opt ? null : 'الزامی است';
  if (s === 'string') return typeof v === 'string' && v.length <= 200 ? null : 'باید رشته (حداکثر ۲۰۰) باشد';
  if (s === 'number') return Number.isFinite(v) ? null : 'باید عدد باشد';
  if (s === 'boolean') return typeof v === 'boolean' ? null : 'باید boolean باشد';
  if (s === 'object') return v && typeof v === 'object' && !Array.isArray(v) ? null : 'باید آبجکت باشد';
  if (s === 'string[]') return Array.isArray(v) && v.length <= 12 && v.every(x => typeof x === 'string' && x.length <= 100) ? null : 'باید آرایه‌ی رشته باشد';
  if (s.includes('|')) return s.split('|').includes(v) ? null : 'باید یکی از ' + s + ' باشد';
  return 'نوع ناشناخته';
}
exports.validate = (name, args) => {
  const t = exports.TOOLS.find(x => x.name === name);
  if (!t) return { error: 'unknown_tool' };
  if (args == null || typeof args !== 'object' || Array.isArray(args)) return { error: 'invalid_args', details: ['args باید آبجکت باشد'] };
  const d = [];
  for (const [k, s] of Object.entries(t.parameters)) { const e = bad(s, args[k]); if (e) d.push(k + ': ' + e); }
  for (const k of Object.keys(args)) if (!(k in t.parameters)) d.push(k + ': پارامتر ناشناخته');
  return d.length ? { error: 'invalid_args', details: d } : null;
};

const TOPIC_Q = { availability: 'آیا همین الان موجود است؟', price: 'قیمت فعلی همین است؟', hours: 'تا چه ساعتی باز هستید؟', installment: 'امکان خرید اقساطی حضوری دارید؟', terms: 'شرایط خرید و مرجوعی چطور است؟' };

exports.run = (ix, name, a = {}) => {
  const v = exports.validate(name, a);
  if (v) return v;
  const cats = (ix.registry && ix.registry.cats) || {};
  const loc = Number.isFinite(a.lat) && Number.isFinite(a.lng) ? { lat: a.lat, lng: a.lng } : null;
  switch (name) {
    case 'search_products': return { items: ix.cands({ q: a.q, cat: a.cat }).slice(0, 20) };
    case 'ask_clarification': return { type: 'clarification', question: a.question, options: a.options || [] };
    case 'next_question': {
      if (!a.cat || !cats[a.cat]) return { type: 'clarification', done: false, key: 'cat', question: 'چه دسته‌ای از محصول را می‌خواهید؟', options: Object.keys(cats) };
      const sel = { ...(a.sel || {}) };
      for (const [key, label] of cats[a.cat].steps) {
        if (sel[key] !== undefined) continue;
        const r = ix.options({ cat: a.cat, sel }, key);
        if (!r.options.length) continue;
        if (r.options.length === 1 && !r.missing) { sel[key] = String(r.options[0].v); continue; }
        return { type: 'clarification', done: false, key, label, question: 'کدام ' + label + '؟', options: r.options.map(o => ({ v: o.v, shops: o.n })), missing: r.missing, sel };
      }
      return { done: true, sel, candidates: ix.cands({ cat: a.cat, sel }).slice(0, 20) };
    }
    case 'extract_filters': return ix.options({ cat: a.cat, sel: a.sel || {} }, a.key);
    case 'compare_shops': {
      if (!ix.P.has(a.product)) return { error: 'unknown_product' };
      return {
        distanceKind: 'straight_line', availability: 'unconfirmed',
        rows: ix.offers(a.product, { loc, rad: a.rad, min: a.min, max: a.max, inst: a.inst, credit: a.credit, open: a.open, sort: a.sort })
      };
    }
    case 'check_hours': {
      if (!ix.S.has(a.shop)) return { error: 'unknown_shop' };
      const s = ix.S.get(a.shop), h = hoursStatus(s);
      return { state: h.state, open: h.open ?? null, close: h.close ?? null, closeInMin: h.closeInMin ?? null, next: h.next || null, source: 'registered_schedule' };
    }
    case 'suggest_alternatives': return ix.P.has(a.product) ? { items: ix.alternatives(a.product, { loc, rad: a.rad }) } : { error: 'unknown_product' };
    case 'advise_visit': {
      if (!ix.P.has(a.product)) return { error: 'unknown_product' };
      if (!loc) return { error: 'location_required' };
      return advise(ix, a.product, { loc, radKm: a.rad ?? 2, maxKm: a.max ?? 15 });
    }
    case 'find_hubs': {
      if (!loc) return { error: 'location_required' };
      const cat = a.cat && cats[a.cat] ? a.cat : null;
      return { hubs: hubsOf(ix, loc, { radKm: a.rad ?? 6, cat }) };
    }
    case 'plan_trip': {
      if (!ix.P.has(a.product)) return { error: 'unknown_product' };
      if (!loc) return { error: 'location_required' };
      const ids = String(a.shops).split(',').map(s => s.trim()).filter(Boolean).slice(0, 5);
      const out = planTrip(ix, a.product, ids, { loc });
      return out || { error: 'bad_input' };
    }
    case 'draft_outreach': {
      if (!ix.S.has(a.shop) || !ix.P.has(a.product)) return { error: 'bad_input' };
      const s = ix.S.get(a.shop), p = ix.P.get(a.product), h = hoursStatus(s);
      const spec = ['brand', 'color', 'ram', 'storage', 'size'].filter(k => p[k] != null).map(k => k + ': ' + p[k]).join('، ');
      return {
        channel: s.wa ? 'whatsapp' : s.tel ? 'phone' : 'copy',
        question: TOPIC_Q[a.topic],
        text: `سلام، وقت بخیر.\nمحصول «${p.title_fa || p.model}»${spec ? ' (' + spec + ')' : ''} را در ترب دیدم.\n${TOPIC_Q[a.topic]}\nممنون.`,
        bestTime: h.state === 'open' ? 'همین حالا (طبق ساعت ثبت‌شده باز است)' : h.next ? 'حدود ' + h.next.at : 'ساعت کاری ثبت نشده؛ در ساعات متعارف تماس بگیرید',
        caution: 'موجودی در دیتاست نیست؛ پاسخ فروشنده را جعل نکن و فقط نتیجه‌ی واقعی را ثبت کن.'
      };
    }
    default: return { error: 'unknown_tool' };
  }
};
