# دیتاست ترب در PostgreSQL (لیارا)

داده‌ی نمایش‌داده‌شده در اپ **همیشه** از دیتابیس (یا فایل واقعی در `DATA_DIR`) می‌آید. هیچ دیتای نمونه‌ای در محصول وجود ندارد؛ فیکسچرهای تست فقط زیر `test/` هستند و در استقرار استفاده نمی‌شوند.

## ۱) جدول‌های موردنیاز

| نقش | نام پیش‌فرض | ستون‌های شناخته‌شده |
|---|---|---|
| محصول | `products` | `product_id, persian_title, brand_name, category_name, model, specs, image_urls` |
| فروشگاه | `shops` | `shop_id, name, address, category_names, contacts, instagram, lat, location_label, lon, payment_options, supports_fast_delivery, website_url, weekly_hours` |
| آفِر | `offers` | `offer_id, product_id, shop_id, price_toman, last_price_changed_at, seller_title, description, warranty` |

- پیشوند جدول‌ها را با `PG_TABLE_PREFIX` تغییر دهید (مثلاً `catalog_`).
- اگر نام جدول‌ها فرق دارد، سرور با `detectDatasetTables` هم‌معنی‌ها را پیدا می‌کند؛ نتیجه در `GET /api/status` دیده می‌شود.
- نام ستون‌های دیگر را در `data/mapping.json` (یا `SHOPS`/`CONFIRMED` در `src/data/schema.js`) بنویسید؛ گزارش ناسازگاری در `/api/status` می‌آید.

قالب `mapping.json`:

```json
{
  "SHOPS": { "lat": "latitude", "lng": "longitude" },
  "CONFIRMED": { "offers": { "price": "price_toman" } }
}
```

## ۲) ایمپورت

```bash
# فایل‌ها: products.csv | offers.csv | shops.csv  (JSON تک‌آرایه هم پشتیبانی می‌شود)
DATABASE_URL='postgresql://user:pass@host:5432/db' npm run import:pg -- ./data
# یا با PG_URI (روش مستندات لیارا)
PG_URI='postgresql://…' npm run import:pg -- ./data --dry   # فقط بررسی، بدون نوشتن
```

`psql` هم کافی است (`\copy shops FROM 'shops.csv' WITH CSV HEADER`)، ولی `import:pg` ارقام فارسی، JSON خراب، BOM و `null` متنی را هم نرمال می‌کند.

## ۳) قاعده‌های پاک‌سازی (اعمال‌شده در `src/data/loader.js`)

- BOM حذف، ارقام فارسی/عربی → لاتین، `null`/`None` متنی → خالی.
- مختصات غیرمتناهی یا خارج از ایران → «بدون موقعیت» (فروشگاه حذف نمی‌شود).
- قیمت: خالی `missingPrice`، غیرعددی `badPrice`، ≤۰ `nonpositivePrice`، >۱۰۰ میلیارد `priceOutlier`، `1` یا ≥۶ رقم یکسان `placeholderPrice`.
- `weekly_hours`: `{mon..sun:{status,shifts:[{start_time,end_time}]}}`؛ `status=closed` بسته، `declared` با شیفت، `unsupported` نامشخص؛ `00:00–00:00` جای‌خالی.
- `contacts`: `[{channel:"phone"|"whatsapp"|…, display_number}]` → `tel`/`wa`/`bale`.
- `payment_options`: `[{provider_name, channel, category_names, min_price_toman, max_price_toman}]`؛ فقط `channel=in_person` با سقف/کف معتبر و تطابق دسته «اقساط حضوری» حساب می‌شود.
- `warranty`: `{provider, description, period_months}`؛ رشته‌ی `"None"` یعنی بدون گارانتی.

## ۴) بررسی بعد از ایمپورت

```bash
curl -s "$APP_URL/api/status" | head -c 800   # اتصال، جدول‌ها، نگاشت، memoryMb
curl -s "$APP_URL/api/meta"   | head -c 400   # ready/source/counts
curl -s "$APP_URL/api/offers?pid=<شناسه>&lat=35.72&lng=51.41&rad=10" | head -c 400
```

اگر `source:"none"` بود، `status.dbInfo` و `mapping` را ببینید؛ اپ با پیام روشن بالا می‌ماند و داده‌ی ساختگی نشان نمی‌دهد.
