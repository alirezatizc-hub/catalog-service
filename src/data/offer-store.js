'use strict';
// ذخیره‌سازی ستونی (columnar) آفِرها برای اجرای کم‌حافظه روی دیتاست کامل.
// چرا: دیتاست چالش ۳۳۱٬۵۰۶ آفِر دارد؛ اگر هر آفِر یک آبجکت با ۸ فیلد باشد
// (با تاریخ ISO و عنوان فروشنده و توضیح) حدود ۲۵۰ بایت می‌شود ≈ ۸۰ مگابایت،
// به‌علاوهٔ هزینهٔ GC و ایندکس‌های موازی. اینجا فقط عدد و اندیس نگه می‌داریم
// (≈ ۷ مگابایت) و آبجکت کامل را فقط برای ردیف‌هایی که واقعاً نمایش داده
// می‌شوند می‌سازیم.
//
// قرارداد بیرونی همان آفِر قبلی است: {shop, product, price, unit, updated,
// warranty, seller, description} — از طریق at(i) یا پیمایش.
const UNIT = 'تومان';

class OfferStore {
  constructor() {
    // مرحلهٔ ساخت: آرایه‌های معمولی و قابل رشد (ریشه‌های محلی؛ بعد از bind()
    // رها می‌شوند تا GC جمعشان کند)
    this._shop = [];
    this._prod = [];
    this._price = [];
    this._upd = [];   // ثانیهٔ یونیکس (۰ = نامشخص) → Int32
    this._war = [];   // متن گارانتی یا null (فقط اگر ستون داشته باشد)
    this._sel = [];
    this._des = [];
    this._hasWar = false; this._hasSel = false; this._hasDes = false;
    this.products = null;
    this.shops = null;
    this._built = false;
  }

  get isOfferStore() { return true; }
  get length() { return this._built ? this.price.length : this._price.length; }

  push(shopPos, prodPos, price, tsMs, extra) {
    const i = this._price.length;
    this._shop.push(shopPos);
    this._prod.push(prodPos);
    this._price.push(price);
    this._upd.push(Number.isFinite(tsMs) ? Math.round(tsMs / 1000) : 0);
    // ستون‌های اختیاری فقط وقتی ساخته می‌شوند که اولین مقدار واقعی برسد؛
    // ردیف‌های قبلی با null پر می‌شوند تا اندیس‌ها هم‌تراز بمانند.
    const put = (name, flag, v) => {
      if (this[flag]) { this[name].push(v); return; }
      if (v == null) return;
      this[flag] = true;
      this[name] = new Array(i).fill(null);
      this[name].push(v);
    };
    put('_war', '_hasWar', extra ? extra.warranty || null : null);
    put('_sel', '_hasSel', extra ? extra.seller || null : null);
    put('_des', '_hasDes', extra ? extra.description || null : null);
    return i;
  }

  // آرایه‌های موقت → تایپ‌دار؛ شناسه‌ها از آرایهٔ محصولات/فروشگاه‌ها خوانده می‌شوند
  bind(products, shops) {
    this.products = products;
    this.shops = shops;
    if (this._built) return this;
    this.shopPos = Int32Array.from(this._shop);
    this.prodPos = Int32Array.from(this._prod);
    this.price = Float64Array.from(this._price);
    this.updated = Int32Array.from(this._upd);
    this.warranty = this._hasWar ? this._war : null;
    this.seller = this._hasSel ? this._sel : null;
    this.description = this._hasDes ? this._des : null;
    this._shop = this._prod = this._price = this._upd = this._war = this._sel = this._des = null;
    this._built = true;
    return this;
  }

  shopIdAt(i) { const s = this.shops && this.shops[this.shopPos[i]]; return s ? s.id : null; }
  productIdAt(i) { const p = this.products && this.products[this.prodPos[i]]; return p ? p.id : null; }
  productAt(i) { return (this.products && this.products[this.prodPos[i]]) || null; }
  shopAt(i) { return (this.shops && this.shops[this.shopPos[i]]) || null; }
  priceAt(i) { return this._built ? this.price[i] : this._price[i]; }
  updatedAt(i) { const s = this._built ? this.updated[i] : this._upd[i]; return s ? s * 1000 : null; }

  // رکورد کامل یک آفِر — فقط برای ردیف‌های نمایش‌داده‌شده ساخته می‌شود
  at(i) {
    if (i == null || i < 0 || i >= this.length) return undefined;
    const s = this.updated[i];
    return {
      shop: this.shopIdAt(i), product: this.productIdAt(i),
      price: this.price[i], unit: UNIT,
      updated: s ? new Date(s * 1000).toISOString() : null,
      warranty: this.warranty ? this.warranty[i] : null,
      seller: this.seller ? this.seller[i] : null,
      description: this.description ? this.description[i] : null
    };
  }

  // نسخهٔ سبک (بدون تاریخ ISO) برای محاسبات داخلی
  row(i) { return { shop: this.shopIdAt(i), product: this.productIdAt(i), price: this.price[i] }; }

  *[Symbol.iterator]() { for (let i = 0; i < this.length; i++) yield this.at(i); }
  forEach(fn) { for (let i = 0; i < this.length; i++) fn(this.at(i), i); }
  map(fn) { const out = []; for (let i = 0; i < this.length; i++) out.push(fn(this.at(i), i)); return out; }
  filter(fn) { const out = []; for (let i = 0; i < this.length; i++) { const o = this.at(i); if (fn(o, i)) out.push(o); } return out; }
  find(fn) { for (let i = 0; i < this.length; i++) { const o = this.at(i); if (fn(o, i)) return o; } return undefined; }
  findIndex(fn) { for (let i = 0; i < this.length; i++) if (fn(this.at(i), i)) return i; return -1; }
  some(fn) { for (let i = 0; i < this.length; i++) if (fn(this.at(i), i)) return true; return false; }
  every(fn) { for (let i = 0; i < this.length; i++) if (!fn(this.at(i), i)) return false; return true; }
  slice(a, b) {
    const s = a || 0, e = Math.min(b == null ? this.length : b, this.length), out = [];
    for (let i = s; i < e; i++) out.push(this.at(i));
    return out;
  }
  toJSON() { return this.slice(0, 500); }

  // نگه‌داشتن فقط آفِرهایی که محصولشان زنده است؛ remap: Int32Array قدیمی→جدید (−۱ = حذف)
  keep(remap) {
    const out = new OfferStore();
    out._hasWar = this._hasWar; out._hasSel = this._hasSel; out._hasDes = this._hasDes;
    for (let i = 0; i < this.length; i++) {
      const np = remap[this.prodPos ? this.prodPos[i] : this._prod[i]];
      if (np < 0) continue;
      out._shop.push(this.shopPos ? this.shopPos[i] : this._shop[i]);
      out._prod.push(np);
      out._price.push(this.priceAt(i));
      out._upd.push(this.updated ? this.updated[i] : this._upd[i]);
      if (this._hasWar) out._war.push(this._built ? this.warranty[i] : this._war[i]);
      if (this._hasSel) out._sel.push(this._built ? this.seller[i] : this._sel[i]);
      if (this._hasDes) out._des.push(this._built ? this.description[i] : this._des[i]);
    }
    return out;
  }

  // ساخت از رکوردهای ساده (سازگاری با کدهای قبلی / تست‌ها)
  static fromRecords(products, shops, records) {
    const store = new OfferStore();
    const prodPos = new Map(products.map((p, i) => [p.id, i]));
    const shopPos = new Map(shops.map((s, i) => [s.id, i]));
    for (const o of records || []) {
      const pp = prodPos.get(o.product), sp = shopPos.get(o.shop);
      if (pp == null || sp == null) continue;
      store.push(sp, pp, o.price, o.updated ? Date.parse(o.updated) : NaN,
        { warranty: o.warranty, seller: o.seller, description: o.description });
    }
    return store.bind(products, shops);
  }
}

module.exports = { OfferStore, UNIT };
