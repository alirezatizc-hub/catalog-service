// آزمون API رابط جدید: مشاوره‌ی مراجعه، پاساژها، برنامه‌ی سفر، هشدار قیمت و صف تماس
const t = require('node:test'), a = require('node:assert');
const { createServer } = require('../server'), { build } = require('../src/data/loader'), db = require('../src/db'), { make } = require('./real-fixture');

const data = build(make());
const CLIENT = 'client-test-1234';
let s, base;
t.before(() => new Promise(r => {
  s = createServer(data, { store: db.memoryStore(), source: 'postgres', dbInfo: { configured: true, connected: true, tables: { products: 'products', offers: 'offers', shops: 'shops' } } });
  s.listen(0, '127.0.0.1', () => { base = 'http://127.0.0.1:' + s.address().port; r(); });
}));
t.after(() => s && s.close());
const j = async (p, o) => { const r = await fetch(base + p, o); return [r.status, await r.json().catch(() => null)]; };
const post = (p, body) => j(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const Q = 'lat=35.7575&lng=51.4105';

t.test('meta و سلامت: منبع دیتاست و آماده بودن مشخص است', async () => {
  const [c, m] = await j('/api/meta');
  a.equal(c, 200); a.equal(m.ready, true); a.equal(m.source, 'postgres'); a.equal(m.features.advice, true);
  a.equal(m.counts.shops, 7); a.equal(m.counts.offers, 10);
  a.equal(m.features.advice, true);
  const [hc, h] = await j('/api/health');
  a.equal(hc, 200); a.equal(h.ready, true); a.equal(h.db, 'memory');
  const [sc, st] = await j('/api/status');
  a.equal(sc, 200); a.ok(st.mapping.shops.resolved.id === 'shop_id'); a.ok(st.memoryMb > 0);
});

t.test('مشاوره‌ی مراجعه: ساختار روشن و بدون داده‌ی ساختگی', async () => {
  const [c, r] = await j('/api/advice?pid=p1&' + Q + '&rad=2&max=15');
  a.equal(c, 200);
  a.ok(['go', 'far', 'closed', 'none'].includes(r.verdict.level));
  a.ok(r.verdict.title.length > 3 && r.verdict.text.length > 20);
  a.ok(Array.isArray(r.openNow) && Array.isArray(r.closedNearby) && Array.isArray(r.hubs));
  for (const x of r.openNow) { a.equal(x.hours.state, 'open'); a.ok(x.etaMin > 0); a.ok(x.offer.price > 0); }
  for (const x of r.closedNearby) a.notEqual(x.hours.state, 'open');
  a.equal(r.counts.total, 6);
  a.ok(r.honesty.some(x => /موجودی/.test(x)));
});

t.test('مشاوره بدون موقعیت → 400 و محصول ناشناس → 404', async () => {
  a.equal((await j('/api/advice?pid=p1'))[0], 400);
  a.equal((await j('/api/advice?pid=nope&' + Q))[0], 404);
});

t.test('پاساژهای نزدیک: نام، فاصله و تعداد باز', async () => {
  const [c, r] = await j('/api/hubs?' + Q + '&rad=8&cat=' + encodeURIComponent('لوازم جانبی موبایل'));
  a.equal(c, 200); a.ok(r.hubs.length >= 2);
  const alaa = r.hubs.find(h => /علاءالدین/.test(h.name));
  a.ok(alaa && alaa.shops === 2 && alaa.km > 0);
});

t.test('برنامه‌ی سفر: ترتیب نزدیک‌ترین و زمان رسیدن', async () => {
  const [c, p] = await j('/api/trip?pid=p1&shops=s1,s3,s5&' + Q);
  a.equal(c, 200); a.equal(p.steps.length, 3);
  a.equal(p.steps[0].shop, 's1');
  a.ok(p.totalKm > 0 && p.totalMin > 0);
  a.ok(p.note.length > 10);
  a.equal((await j('/api/trip?pid=p1&shops=zzz&' + Q))[0], 400);
});

t.test('هشدار قیمت: ساخت، فهرست با وضعیت فعلی بازار، حذف', async () => {
  const [c, w] = await post('/api/watch', { client: CLIENT, product: 'p1', target: 410000, lat: 35.7575, lng: 51.4105, rad: 10 });
  a.equal(c, 200); a.ok(w.id > 0); a.equal(w.target, 410000);
  a.ok(w.best && w.best.price > 0);
  const [lc, list] = await j('/api/watches?client=' + CLIENT);
  a.equal(lc, 200); a.equal(list.items.length, 1);
  a.ok(list.items[0].productTitle.includes('شارژر'));
  a.equal((await j('/api/watch?client=' + CLIENT + '&id=' + w.id, { method: 'DELETE' }))[1].removed, true);
  a.equal((await j('/api/watch?client=' + CLIENT + '&id=999', { method: 'DELETE' }))[1].removed, false);
  a.equal((await post('/api/watch', { client: CLIENT, product: 'nope' }))[0], 400);
});

t.test('درخواست تماس: رضایت الزامی است و فقط در ساعت مجاز صف می‌شود', async () => {
  a.equal((await post('/api/call', { client: CLIENT, shop: 's2', product: 'p1', topic: 'availability', question: 'آیا موجود است؟' }))[0], 400);
  const [c, r] = await post('/api/call', { client: CLIENT, shop: 's2', product: 'p1', topic: 'availability', question: 'سلام، این شارژر موجود است؟', consent: true });
  a.equal(c, 200); a.equal(r.status, 'queued');
  a.ok(new Date(r.earliest).getTime() > Date.now() - 60000);
  const tehranHour = new Date(new Date(r.earliest).getTime() + 3.5 * 3600e3).getUTCHours();
  a.ok(tehranHour >= 9 && tehranHour < 21, 'ساعت تماس باید بین ۹ تا ۲۱ تهران باشد: ' + tehranHour);
  a.ok(/ساعت کاری|صف|تماس/.test(r.notice));
  const [lc, list] = await j('/api/calls?client=' + CLIENT);
  a.equal(lc, 200); a.equal(list.items.length, 1);
  a.equal(list.items[0].shopName, 'موبایل میرزایی');
  const [uc, up] = await post('/api/call/update', { client: CLIENT, id: list.items[0].id, status: 'answered', availability: 'in_stock', answer: 'بله موجود است' });
  a.equal(uc, 200); a.equal(up.availability, 'in_stock');
});

t.test('پرسش از فروشنده مثل قبل کار می‌کند و پاسخ جعلی نمی‌سازد', async () => {
  const [c, r] = await post('/api/inquiry', { client: CLIENT, shop: 's1', product: 'p1', topic: 'availability', channel: 'copy', message: 'موجود است؟' });
  a.equal(c, 200); a.equal(r.status, 'not_sent'); a.equal(r.answer, null);
  const [lc, list] = await j('/api/inquiries?client=' + CLIENT);
  a.equal(lc, 200); a.ok(list.items.some(x => x.id === r.id && x.shopName === 'دیجی‌کالا ونک'));
});

t.test('فیلتر اقساط سطح آفر (credit) و اعلام فروشگاه (inst)', async () => {
  const [, cr] = await j('/api/offers?pid=p2&credit=1');
  a.ok(!cr.rows.map(x => x.shop.id).includes('s3')); // ۵۶۰هزار زیر کف ۱ میلیون اسنپ پی
  a.ok(cr.rows.length >= 1);
  const [, ir] = await j('/api/offers?pid=p1&inst=1');
  a.deepEqual(ir.rows.map(x => x.shop.id).sort(), ['s1', 's3', 's6']);
});

t.test('فایل‌های استاتیک: نقشه‌ی محلی و صفحه‌ی اصلی موجودند', async () => {
  const leaf = await fetch(base + '/vendor/leaflet/leaflet.js');
  a.equal(leaf.status, 200);
  a.match(leaf.headers.get('content-type'), /javascript/);
  const home = await fetch(base + '/');
  a.equal(home.status, 200);
  a.match(await home.text(), /خرید حضوری/);
  a.equal((await fetch(base + '/..%2fserver.js')).status, 403);
});

t.test('بدون دیتاست: اپ بالا می‌ماند و صادقانه ready=false می‌گوید (بدون داده‌ی ساختگی)', async () => {
  const s2 = createServer(null, { loading: true });
  await new Promise(r => s2.listen(0, '127.0.0.1', r));
  const b2 = 'http://127.0.0.1:' + s2.address().port;
  try {
    s2.state.loading = false; // مثل وقتی که تلاش برای خواندن دیتابیس شکست خورده است
    const [c, m] = await (await fetch(b2 + '/api/meta')).json().then(x => [200, x]);
    a.equal(c, 200); a.equal(m.ready, false); a.equal(m.loading, false); a.equal(m.source, 'none');
    a.deepEqual(m.counts, { products: 0, shops: 0, offers: 0 });
    a.equal((await fetch(b2 + '/api/health')).status, 200);
    const nr = await fetch(b2 + '/api/advice?pid=p1');
    a.equal(nr.status, 503); a.match((await nr.json()).error, /^(not_ready|loading_dataset)$/);
    const home = await fetch(b2 + '/');
    a.equal(home.status, 200);
    a.ok(!/داده‌ی نمونه|حالت نمایشی/.test(await home.text()));
  } finally { s2.close(); }
});
