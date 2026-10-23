'use strict';
// سنجش حافظهٔ مسیر بارگذاری دیتاست در اندازهٔ واقعی (۲۲۵٬۹۰۳ محصول / ۳۳۱٬۵۰۶ آفِر)
// بدون نگه‌داشتن نسخهٔ خام جدول‌ها: ردیف‌ها به‌صورت جریان (چانک ۲۰ هزارتایی) ساخته
// و مثل مسیر PostgreSQL با pageRows به builder داده می‌شوند.
//
// اجرا:
//   npm run bench:memory                # اندازهٔ کامل دیتاست چالش
//   NP=20000 NO=30000 npm run bench:memory
// برای دیدن حافظهٔ زنده بعد از GC (بهتر است):
//   node --expose-gc scripts/bench-memory.js
const { createBuilder } = require('../src/data/loader');
const { Index } = require('../src/engine');

const NP = Number(process.env.NP || 225903);
const NS = Number(process.env.NS || 6476);
const NO = Number(process.env.NO || 331506);
const CHUNK = Number(process.env.CHUNK || 20000);

let seed = 7;
const R = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = a => a[Math.floor(R() * a.length)];
const memory = () => process.memoryUsage();
const mark = label => {
  if (global.gc) { global.gc(); global.gc(); }
  const m = memory(), v8 = require('v8').getHeapStatistics();
  console.log(
    label.padEnd(28),
    String(Math.round(m.heapUsed / 1048576)).padStart(5), 'MB heap ·',
    String(Math.round(m.rss / 1048576)).padStart(5), 'MB rss ·',
    'limit', Math.round(v8.heap_size_limit / 1048576), 'MB'
  );
};

const CATS = ['گوشی موبایل', 'لپ‌تاپ', 'هدفون و هندزفری', 'ساعت هوشمند', 'تبلت', 'دوربین عکاسی', 'لوازم جانبی موبایل', 'کفش ورزشی'];
const BRANDS = ['سامسونگ', 'اپل', 'شیائومی', 'هوآوی', 'لنوو', 'ایسوس', 'سونی', 'ال‌جی', 'نوکیا', 'ایسر', 'ام‌اس‌آی', 'انکر', 'بیتس', 'کاسیو', 'سیتیزن', 'فیلیپس'];
const MODELS = ['Galaxy S24 Ultra', 'iPhone 15 Pro Max', 'Redmi Note 13 Pro', 'P60 Pro', 'ThinkPad X1', 'ZenBook 14', 'WH-1000XM5', 'AirPods Pro 2', 'Watch GT 4', 'iPad Air 5', 'EOS R50'];
const MALLS = ['پاساژ علاءالدین', 'پاساژ ونک', 'بازار موبایل جمهوری', 'پاساژ آرژانتین', 'مجتمع تجاری کوروش'];
const WORDS = ['اورجینال', 'رسمی', 'با گارانتی', 'شرکتی', 'پلمپ', 'اکتیو', 'نسل جدید', 'نسخه جهانی'];
const HOURS = JSON.stringify(Object.fromEntries(['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri']
  .map(d => [d, { status: d === 'fri' ? 'closed' : 'declared', shifts: [{ start_time: '09:00:00', end_time: '21:00:00' }] }])));
const SPEC_KEYS = ['رنگ', 'حافظه داخلی', 'رم', 'صفحه نمایش', 'دوربین اصلی', 'باتری', 'سیستم عامل', 'وزن', 'جنس بدنه', 'گارانتی', 'نوع اتصال', 'درگاه شارژ'];
const SPEC_VALS = {
  'رنگ': ['مشکی', 'سفید', 'آبی', 'قرمز', 'سبز', 'خاکستری'], 'حافظه داخلی': ['64 گیگابایت', '128 گیگابایت', '256 گیگابایت'],
  'رم': ['4 گیگابایت', '6 گیگابایت', '8 گیگابایت', '12 گیگابایت'], 'صفحه نمایش': ['6.1 اینچ', '6.7 اینچ', '14 اینچ'],
  'دوربین اصلی': ['12 مگاپیکسل', '48 مگاپیکسل', '50 مگاپیکسل'], 'باتری': ['4000 میلی‌آمپر', '5000 میلی‌آمپر'],
  'سیستم عامل': ['اندروید 14', 'iOS 17', 'ویندوز 11'], 'وزن': ['180 گرم', '1.4 کیلوگرم'], 'جنس بدنه': ['شیشه و فلز', 'پلاستیک', 'آلومینیوم'],
  'گارانتی': ['18 ماه گارانتی', '12 ماه گارانتی'], 'نوع اتصال': ['بلوتوث 5.3', 'USB-C'], 'درگاه شارژ': ['USB Type-C', 'Lightning']
};

const shopCols = ['shop_id', 'name', 'address', 'lat', 'lon', 'contacts', 'category_names', 'payment_options', 'supports_fast_delivery', 'weekly_hours', 'location_label', 'instagram', 'website_url'];
const prodCols = ['product_id', 'persian_title', 'brand_name', 'category_name', 'model', 'specs', 'image_urls'];
const offerCols = ['offer_id', 'product_id', 'shop_id', 'price_toman', 'last_price_changed_at', 'seller_title', 'description', 'warranty'];

function* shops() {
  for (let i = 0; i < NS; i++) {
    yield {
      shop_id: 's' + i, name: 'فروشگاه ' + pick(WORDS) + ' ' + i,
      address: 'تهران، خیابان ولیعصر، ' + pick(MALLS) + '، طبقه ' + (1 + (i % 4)) + '، واحد ' + (i % 200),
      lat: String(35.6 + R() * 0.4), lon: String(51.2 + R() * 0.5),
      contacts: JSON.stringify([{ channel: 'phone', display_number: '021' + (10000000 + i) }]),
      category_names: JSON.stringify([CATS[i % CATS.length]]),
      payment_options: R() < 0.3 ? JSON.stringify([{ provider_name: 'اسنپ پی', channel: 'in_person', category_names: [CATS[i % CATS.length]], min_price_toman: 1000000, max_price_toman: 80000000 }]) : null,
      supports_fast_delivery: R() < 0.3 ? 'true' : 'false',
      weekly_hours: R() < 0.1 ? null : HOURS, location_label: 'تهران', instagram: '@shop' + i, website_url: null
    };
  }
}

function* products() {
  for (let i = 0; i < NP; i++) {
    const cat = CATS[i % CATS.length], b = pick(BRANDS), specs = [], used = new Set();
    if (R() < 0.72) {
      const n = 6 + Math.floor(R() * 10);
      for (let k = 0; k < n; k++) {
        const key = pick(SPEC_KEYS); if (used.has(key)) continue; used.add(key);
        specs.push({ key, section: 'مشخصات', value: pick(SPEC_VALS[key] || ['نامشخص']) });
      }
    }
    yield {
      product_id: 'p' + i,
      persian_title: b + ' ' + pick(MODELS) + ' ' + pick(WORDS) + ' ' + pick(WORDS) + ' ' + cat,
      brand_name: R() < 0.2 ? null : b, category_name: cat, model: R() < 0.95 ? null : pick(MODELS),
      specs: specs.length ? JSON.stringify(specs) : null,
      image_urls: JSON.stringify([1, 2].slice(0, 1 + Math.floor(R() * 2)).map(k => 'https://cdn.torob.com/auto/product/' + i + '/' + k + '-' + Math.floor(R() * 1e6) + '.jpg'))
    };
  }
}

function* offers() {
  for (let i = 0; i < NO; i++) {
    yield {
      offer_id: 'o' + i, product_id: 'p' + (i % NP), shop_id: 's' + Math.floor(R() * NS),
      price_toman: String(Math.round((1 + R() * 99) * 1e5)),
      last_price_changed_at: new Date(1760000000000 - Math.floor(R() * 90) * 864e5).toISOString(),
      seller_title: 'فروشگاه ' + pick(BRANDS) + ' ' + pick(WORDS),
      description: 'قیمت به‌روز، ارسال سریع، خرید حضوری با گارانتی معتبر — آفر ' + i,
      warranty: JSON.stringify({ provider: pick(['شرکتی', 'بین‌المللی']), description: 'گارانتی معتبر', period_months: 12 })
    };
  }
}

function* chunks(iter) { let buf = []; for (const x of iter) { buf.push(x); if (buf.length >= CHUNK) { yield buf; buf = []; } } if (buf.length) yield buf; }

(async () => {
  mark('شروع');
  const t0 = Date.now();
  const b = createBuilder({});
  for (const ch of chunks(shops())) b.addShops(ch, shopCols);
  mark('فروشگاه‌ها');
  for (const ch of chunks(products())) b.addProducts(ch, prodCols);
  mark('محصولات');
  for (const ch of chunks(offers())) await b.addOffers(ch, offerCols);
  mark('آفِرها');
  const data = b.finish();
  mark('finish()');
  const ix = new Index(data);
  mark('Index');
  ix.options({ cat: ix.items[0].cat, sel: {}, q: 'سامسونگ' }, 'brand');
  mark('اولین جست‌وجوی متنی');
  ix.offers(ix.items[0].id, { loc: { lat: 35.72, lng: 51.41 }, rad: 20, sort: 'smart' });
  ix.alternatives(ix.items[0].id, {});
  ix.priceRange(ix.items[0].id);
  mark('پرس‌وجوها');
  console.log(JSON.stringify({
    counts: data.report.counts, ms: Date.now() - t0, offersStored: data.offers.length,
    peakRssMb: Math.round(process.resourceUsage().maxRSS / 1024), heapLimitMb: Math.round(require('v8').getHeapStatistics().heap_size_limit / 1048576)
  }));
})();
