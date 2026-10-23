'use strict';
// نگاشت ستون‌های دیتاست چالش (نسخه‌ی starcoach-dataset-v16-cap300-csv).
// این نام‌ها با هدر واقعی سه فایل products.csv / shops.csv / offers.csv یکسان‌اند.
// برای هر فیلد، «نامزدهای» اضافی هم آمده تا اگر نسخه‌ی دیگری از دیتاست یا جدول
// دست‌ساخت در PostgreSQL نام ستون‌ها را کمی متفاوت داشت، خودکار پیدا شوند.
// هر فیلد را می‌توان با data/mapping.json بازنویسی کرد (بخش CONFIRMED / SHOPS).

exports.CONFIRMED = {
  products: {
    id: 'product_id',
    title_fa: 'persian_title',
    brand: 'brand_name',
    cat: 'category_name',
    images: 'image_urls',
    model: 'model',
    specs: 'specs'
  },
  offers: {
    id: 'offer_id',
    product: 'product_id',
    shop: 'shop_id',
    price: 'price_toman',
    updated: 'last_price_changed_at',
    description: 'description',
    seller: 'seller_title',
    warranty: 'warranty'
  },
  shops: {
    id: 'shop_id',
    name: 'name',
    address: 'address',
    lat: 'lat',
    lng: 'lon',
    hours: 'weekly_hours',
    contacts: 'contacts',
    categories: 'category_names',
    payments: 'payment_options',
    express: 'supports_fast_delivery',
    place_desc: 'location_label',
    instagram: 'instagram',
    website: 'website_url'
  }
};

// نامزدهای هر فیلد shops؛ اولی همان ستون واقعی دیتاست است.
const SHOPS = {
  name: ['name', 'shop_name', 'store_title', 'title'],
  address: ['address', 'full_address', 'address_text'],
  lat: ['lat', 'latitude', 'y'],
  lng: ['lon', 'lng', 'longitude', 'x'],
  hours: ['weekly_hours', 'working_hours', 'opening_hours', 'biz_hours', 'hours'],
  contacts: ['contacts', 'contact', 'phone_numbers', 'phones'],
  categories: ['category_names', 'categories', 'shop_categories', 'business_categories'],
  payments: ['payment_options', 'payments', 'installment_options', 'credit_options'],
  express: ['supports_fast_delivery', 'fast_delivery', 'express_delivery', 'supports_express'],
  place_desc: ['location_label', 'location_description', 'location'],
  instagram: ['instagram', 'instagram_url', 'ig'],
  website: ['website_url', 'website', 'site', 'url']
};
exports.SHOP_FIELDS = SHOPS;
// سازگاری با نگاشت قدیمی (mapping.json → SHOPS)
exports.SHOP_CANDIDATES = {
  ...SHOPS,
  phone: ['phone', 'telephone', 'tel'],
  installment: ['payment_options', 'installments'],
  torobpay: ['torob_pay', 'torobpay'],
  kalabarg: ['kalabarg', 'kala_barg'],
  whatsapp: ['whatsapp'],
  bale: ['bale']
};


// نام‌های جایگزین برای وقتی جدول‌ها با ابزار دیگری (مثل Django/Prisma) ساخته شده‌اند.
exports.ALIASES = {
  products: {
    id: ['source_id', 'id', 'base_product_id'],
    title_fa: ['title_fa', 'title', 'name_fa', 'name', 'persian_name'],
    brand: ['brand', 'brand_name_fa'],
    cat: ['category', 'category_title', 'cat'],
    images: ['images', 'image_url', 'image', 'photos'],
    specs: ['specifications', 'attributes', 'specs_json'],
    model: ['model_name']
  },
  offers: {
    id: ['source_id', 'id', 'offerId'],
    product: ['base_product_id'],
    shop: ['seller_id', 'store_id'],
    price: ['price', 'price_rial', 'amount'],
    updated: ['updated_at', 'last_price_change_at', 'price_updated_at', 'last_updated'],
    seller: ['seller_name', 'title'],
    description: ['seller_description', 'desc'],
    warranty: ['warranty_info', 'guarantee']
  },
  shops: {
    id: ['source_id', 'id', 'store_id', 'seller_id'],
    name: ['shop_name', 'store_name', 'title'],
    address: ['full_address', 'address_text', 'addr'],
    lat: ['latitude'],
    lng: ['longitude', 'long'],
    hours: ['working_hours', 'opening_hours', 'hours_json', 'biz_hours'],
    contacts: ['contact', 'phone_numbers', 'phones'],
    categories: ['categories', 'shop_categories', 'business_categories'],
    payments: ['payments', 'installment_options', 'credit_options'],
    express: ['fast_delivery', 'express_delivery', 'supports_express'],
    place_desc: ['location_description', 'location'],
    instagram: ['instagram_url', 'ig'],
    website: ['website', 'site', 'url']
  }
};

// کلیدهای specs.key که به فیلترهای اصلی نگاشت می‌شوند (تطبیق پس از نرمال‌سازی متن).
exports.SPEC_ALIASES = {
  color: ['رنگ', 'رنگ بندی', 'رنگبندی', 'color'],
  ram: ['مقدار رم', 'رم', 'حافظه رم', 'ram'],
  storage: ['حافظه داخلی', 'ظرفیت حافظه داخلی', 'حافظه', 'storage'],
  size: ['سایز', 'اندازه', 'size'],
  model: ['مدل', 'model']
};
// فیلترهای اصلی که همیشه (اگر پوشش داشته باشند) پرسیده می‌شوند
exports.CORE = [['brand', 'برند'], ['color', 'رنگ'], ['ram', 'رم'], ['storage', 'حافظه'], ['size', 'سایز']];
// آستانه‌های ساخت فیلترهای پویا از specs
exports.EXTRA = { minCoverage: 0.15, maxValues: 40, maxFilters: 6 };
// mapping.json می‌تواند هر بخش را بازنویسی کند (ادغام سطحی در هر زیرشاخه)
exports.merge = (base, o = {}) => {
  const r = {};
  for (const k of Object.keys(base)) {
    r[k] = o[k] && typeof base[k] === 'object' && !Array.isArray(base[k]) ? { ...base[k], ...o[k] } : (o[k] ?? base[k]);
  }
  return r;
};
