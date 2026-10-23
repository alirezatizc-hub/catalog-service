// آزمون ذخیره‌سازی ستونی آفِرها (OfferStore) و مسیر کم‌حافظهٔ Index
const t = require('node:test'), a = require('node:assert');
const { OfferStore } = require('../src/data/offer-store');
const { Index } = require('../src/engine');
const { make } = require('./real-fixture');
const L = require('../src/data/loader');

const products = [{ id: 'p1', cat: 'لوازم' }, { id: 'p2', cat: 'لوازم' }, { id: 'p3', cat: 'لوازم' }];
const shops = [{ id: 's1' }, { id: 's2' }];

function small() {
  const st = new OfferStore();
  st.push(0, 0, 1000, Date.parse('2026-10-20T10:00:00Z'), { warranty: 'گارانتی ۱۲ ماهه', seller: 'فروشگاه الف', description: 'توضیح' });
  st.push(1, 0, 2000, NaN, { warranty: null, seller: null, description: null });
  st.push(0, 1, 3000, Date.parse('2026-10-01T00:00:00Z'), { warranty: 'گارانتی ۱۲ ماهه', seller: 'فروشگاه الف', description: null });
  return st;
}

t.test('at() همان شکل آفِر قبلی را می‌دهد', () => {
  const st = small().bind(products, shops);
  a.equal(st.length, 3);
  a.deepEqual(st.at(0), {
    shop: 's1', product: 'p1', price: 1000, unit: 'تومان',
    updated: '2026-10-20T10:00:00.000Z', warranty: 'گارانتی ۱۲ ماهه', seller: 'فروشگاه الف', description: 'توضیح'
  });
  a.equal(st.at(1).updated, null);
  a.equal(st.at(1).warranty, null);
  a.equal(st.at(2).description, null);
});

t.test('ستون‌های اختیاری وقتی دیرتر می‌رسند هم‌تراز می‌مانند', () => {
  const st = new OfferStore();
  st.push(0, 0, 10, NaN, null);
  st.push(0, 0, 11, NaN, null);
  st.push(0, 0, 12, NaN, { seller: 'فروشنده' });
  st.bind(products, shops);
  a.equal(st.at(0).seller, null);
  a.equal(st.at(1).seller, null);
  a.equal(st.at(2).seller, 'فروشنده');
});

t.test('متُدهای آرایه‌ای برای سازگاری (find/some/filter/slice)', () => {
  const st = small().bind(products, shops);
  a.equal(st.find(o => o.price === 2000).shop, 's2');
  a.ok(st.some(o => o.price === 3000));
  a.deepEqual(st.filter(o => o.product === 'p1').map(o => o.price), [1000, 2000]);
  a.equal(st.slice(0, 2).length, 2);
});

t.test('keep(remap) آفِرهای محصولات حذف‌شده را دور می‌ریزد و اندیس را اصلاح می‌کند', () => {
  const st = small();
  const remap = Int32Array.from([0, -1, 0]); // p2 حذف، p3 همان p1 می‌شود
  const out = st.keep(remap).bind([products[0], products[2]], shops);
  a.equal(out.length, 2);
  a.deepEqual(out.map(o => [o.product, o.price]), [['p1', 1000], ['p1', 2000]]);
});

t.test('Index با انبار ستونی: byP اندیس می‌دهد و offerList آبجکت کامل', () => {
  const st = small().bind(products, shops);
  const ix = new Index({ products, shops, offers: st });
  a.equal(ix.byP.get('p1').length, 2);
  a.deepEqual(ix.offerList('p1').map(o => o.price).sort(), [1000, 2000]);
  a.equal(ix.priceRange('p1').minPrice, 1000);
  a.equal(ix.priceRange('p1').maxPrice, 2000);
  a.equal(ix.offerAt(0).unit, 'تومان');
});

t.test('Index با آرایهٔ ساده (سازگاری عقب‌رو) همان نتیجه را می‌دهد', () => {
  const arr = [
    { shop: 's1', product: 'p1', price: 1000, unit: 'تومان', updated: null, warranty: null, seller: null, description: null },
    { shop: 's2', product: 'p1', price: 500, unit: 'تومان', updated: null, warranty: null, seller: null, description: null }
  ];
  const ix = new Index({ products, shops, offers: arr });
  a.equal(ix.byP.get('p1').length, 2);
  a.equal(ix.offerAt(1), arr[1]);
  a.equal(ix.offers('p1', { sort: 'price' })[0].offer.price, 500);
});

t.test('مسیر کامل build(): دیتاست کوچک با فیلتر پویا و آفِرهای ستونی', () => {
  const d = L.build(make());
  a.equal(d.offers.length, 10);
  a.ok(d.offers.at(0).shop);
  const ix = new Index(d);
  a.ok(ix.byP.size > 0);
  a.ok(ix.cands({}).length > 0);
  a.ok(ix.offers(d.products[0].id, {}).length > 0);
});
