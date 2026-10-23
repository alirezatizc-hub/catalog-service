// آزمون شکل واقعی دیتاست: weekly_hours دیکشنری، contacts، payment_options، warranty، آدرس پاساژ
const t = require('node:test'), a = require('node:assert');
const L = require('../src/data/loader'), { build } = L;
const { hoursStatus, Index } = require('../src/engine'), { advise, planTrip, hubsOf } = require('../src/advice');
const { make } = require('./real-fixture');

const data = build(make());
const ix = new Index(data); ix.registry = data.registry;
const shop = id => data.shops.find(s => s.id === id);
const at = iso => new Date(iso);

t.test('weekly_hours دیکشنری: هر روز، تعطیل، جای‌خالی 00:00 و نامشخص', () => {
  // جمعه ۲۲:۰۰ تهران = 2026-10-23T18:30Z
  const fri = at('2026-10-23T18:30:00Z');
  a.equal(hoursStatus(shop('s1'), fri).state, 'closed');       // fri: closed
  a.equal(hoursStatus(shop('s3'), fri).state, 'open');         // 10:00–23:30
  a.ok(hoursStatus(shop('s3'), fri).closeInMin > 60);
  a.equal(hoursStatus(shop('s6'), fri).state, 'unknown');      // فقط 00:00–00:00 = نامشخص، نه ۲۴ساعته
  a.equal(hoursStatus(shop('s4'), fri).state, 'unknown');       // بدون ساعت ثبت‌شده
  // یکشنبه ظهر تهران = 2026-10-25T08:30Z
  a.equal(hoursStatus(shop('s1'), at('2026-10-25T08:30:00Z')).state, 'open');
  a.equal(hoursStatus(shop('s5'), at('2026-10-25T08:30:00Z')).state, 'closed'); // sun: closed
});

t.test('شیفت شبانه و چند شیفتی در ساعت کاری پشتیبانی می‌شود', () => {
  const hours = Array(7).fill(null); hours[6] = [[22, 26], [9, 13]]; // شنبه ۲۲ تا ۰۲ + ۹ تا ۱۳
  const satLate = at('2026-10-24T21:00:00Z'); // ۰۰:۳۰ یکشنبه تهران (شیفت دیروز)
  a.equal(hoursStatus({ hours }, satLate).state, 'open');
  const sunMorning = at('2026-10-25T06:30:00Z'); // ۱۰:۰۰ یکشنبه
  a.equal(hoursStatus({ hours }, sunMorning).state, 'closed'); // شیفت ۹–۱۳ فقط شنبه است
});

t.test('تماس‌ها: تلفن ثابت و واتساپ جدا می‌شوند و ارقام یکدست می‌شوند', () => {
  a.equal(shop('s1').tel, '02188776655');
  a.equal(shop('s1').wa, '09123456789');
  a.equal(shop('s6').tel, null);
});

t.test('پرداخت: اقساط حضوری، ترب‌پی، سقف و دسته‌ی هر ارائه‌دهنده', () => {
  a.equal(shop('s1').installment, true);
  a.equal(shop('s1').torobpay, true);
  a.equal(shop('s3').torobpay, null);
  a.equal(shop('s5').installment, null);
  a.equal(shop('s3').pay[0].min, 1000000);
  a.deepEqual(shop('s3').pay[0].cats, ['لوازم جانبی موبایل']);
  // آفر ۳۹۹هزار تومانی زیر کف ۱ میلیون تومان است ⇒ مشمول اقساط حضوری نیست
  const rows = ix.offers('p1', { credit: true }).map(r => r.shop.id);
  a.ok(!rows.includes('s3')); // ۳۹۹هزار تومان، زیر کف ۱ میلیون
  a.ok(rows.includes('s1') && rows.includes('s6'));
  a.ok(!ix.offers('p2', { credit: true }).map(r => r.shop.id).includes('s3'));
});

t.test('اعلام اقساط فروشگاه با فیلتر inst (سطح فروشگاه) و credit (سطح آفر) فرق دارد', () => {
  a.deepEqual(ix.offers('p1', { inst: true }).map(r => r.shop.id).sort(), ['s1', 's3', 's6']);
});

t.test('گارانتی از دیکشنری ساخته می‌شود و «None» نمایش داده نمی‌شود', () => {
  const o = id => data.offers.find(x => x.shop === id && x.product === 'p1');
  a.match(o('s1').warranty, /انکر/);
  a.match(o('s1').warranty, /12 ماهه/);
  a.equal(o('s3').warranty, 'گارانتی 18 ماهه');
  a.equal(o('s2').warranty, null);
});

t.test('آدرس پاساژ/طبقه/واحد استخراج می‌شود (فقط آنچه نوشته شده)', () => {
  a.deepEqual(shop('s1').place, { mall: 'پاساژ ونک', floor: 'طبقه ۲', unit: 'واحد ۱۲' });
  a.equal(shop('s5').place.floor, 'طبقه منفی ۱');
  a.equal(shop('s6').place, null);
});

t.test('قیمت جای‌خالی/غیرمعتبر جدا شمرده می‌شود، بی‌صدا حذف نمی‌شود', () => {
  a.equal(data.report.issues.placeholderPrice, 1);
  a.ok(data.offers.some(o => o.shop === 's4' && o.product === 'p1' && o.price === 1));
});

t.test('سازنده به‌صورت جریانی (generator) هم همان نتیجه را می‌دهد', () => {
  const raw = make();
  const b = L.createBuilder({});
  const gen = (rows, cols) => (function* () { for (const r of rows) yield r; })(rows, cols);
  b.addShops(gen(raw.shops.rows), raw.shops.cols);
  b.addProducts(gen(raw.products.rows), raw.products.cols);
  b.addOffers(gen(raw.offers.rows), raw.offers.cols);
  const d2 = b.finish();
  a.equal(d2.report.counts.offers, data.report.counts.offers);
  a.equal(d2.report.counts.shops, data.report.counts.shops);
  a.deepEqual(Object.keys(d2.registry.cats).sort(), Object.keys(data.registry.cats).sort());
});

const friNight = at('2026-10-23T18:30:00Z'); // جمعه ۲۲:۰۰ تهران
const sunNoon = at('2026-10-25T08:30:00Z');  // یکشنبه ۱۲:۰۰ تهران
const loc = { lat: 35.7575, lng: 51.4105 };  // میدان ونک

t.test('سناریوی شب: نزدیک‌ها بسته‌اند، یک فروشگاه دورتر باز است + پیشنهاد پاساژ', () => {
  const r = advise(ix, 'p1', { loc, radKm: 2, maxKm: 15, now: friNight });
  a.equal(r.verdict.level, 'far');
  a.equal(r.verdict.shop, 's3');
  a.ok(r.counts.near >= 2 && r.counts.nearOpen === 0);
  a.ok(r.farther.length >= 1);
  a.ok(r.hubs.length >= 1);
  a.ok(r.hubs.some(h => /علاءالدین/.test(h.name)));
  a.ok(/علاءالدین/.test(r.verdict.text)); // پیشنهاد پاساژ نزدیک، با برچسب احتیاط
  a.ok(r.honesty.some(x => /موجودی/.test(x)));
});

t.test('روز و ساعت اداری: همان محدوده باز است و توصیه «برو» می‌شود', () => {
  const r = advise(ix, 'p1', { loc, radKm: 2, maxKm: 15, now: sunNoon });
  a.equal(r.verdict.level, 'go');
  a.ok(r.openNow.length >= 1);
  a.equal(r.lateNight, false);
  a.ok(r.maybeShops.some(x => x.shop.id === 's7')); // فروشگاه هم‌دسته که این محصول را در ترب ثبت نکرده
});

t.test('برنامه‌ی مراجعه: ترتیب نزدیک‌ترین و بررسی بسته بودن در لحظه‌ی رسیدن', () => {
  const p = planTrip(ix, 'p1', ['s3', 's1', 's5'], { loc, now: friNight });
  a.equal(p.steps[0].shop, 's1');
  a.ok(p.steps.every(s => s.arriveInMin >= 0));
  const closedStop = p.steps.find(s => s.shop === 's5');
  a.equal(closedStop.state, 'closed');
  a.equal(closedStop.willMakeIt, false);
  a.ok(p.note.includes('بسته'));
});

t.test('پاساژها بر اساس آدرس گروه‌بندی و بر اساس دسته اولویت‌بندی می‌شوند', () => {
  const h = hubsOf(ix, loc, { radKm: 8, cat: 'لوازم جانبی موبایل', now: friNight });
  a.ok(h.length >= 2);
  a.ok(h.some(x => /علاءالدین/.test(x.name) && x.related >= 2));
  a.ok(h.every(x => x.openNow <= x.shops));
});
