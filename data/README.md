# Torob Assistant v3 — دستیار هوشمند خرید حضوری
اجرا: `npm install && npm start` → http://localhost:3000 | تست: `npm test`

## معماری
- `server.js` API + فایل‌های استاتیک (gzip، CSP) · راه‌اندازی: PostgreSQL → `data/*.csv|json` → Demo
- `src/db.js` اتصال PostgreSQL (لیارا)، مهاجرت، ایمپورت/خواندن دیتاست، ذخیره‌ی پرسش‌ها · `scripts/import-pg.js`
- `src/llm.js` هوش مصنوعی **boxapi.ir** (`https://ai.boxapi.ir/ai/v1/chat/completions`) · `src/nlu.js` فهم جمله (قاعده‌محور + اعتبارسنجی خروجی مدل با داده‌ی واقعی)
- `src/geo.js` تنظیم نقشه و مسیریابی (Neshan، اختیاری) · `src/insight.js` خلاصه‌ی تصمیم‌یار
- `src/engine.js` جست‌وجو/فیلتر/فاصله/ساعت کاری/جایگزین · `src/data/*` نگاشت و بارگذاری دیتاست
- `public/` رابط RTL ریسپانسیو (فونت وزیرمتن و Leaflet محلی، بدون CDN)

## متغیرهای محیطی (روی لیارا)
| کاربرد | نام‌های پشتیبانی‌شده |
|---|---|
| PostgreSQL | `DATABASE_URL` یا `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE` (یا `POSTGRES_*` / `DB_HOST`…`DB_DATABASE`)؛ `PGSSLMODE=require` در صورت نیاز؛ `PG_TABLE_PREFIX` (پیش‌فرض `catalog_`) |
| boxapi AI | `BOXAPI_API_KEY` (یا `BOXAPI_KEY` / `LLM_API_KEY`)؛ اختیاری: `BOXAPI_MODEL` (پیش‌فرض `gpt-5.4-mini`)، `BOXAPI_AI_URL` |
| مسیریابی نشان | `NESHAN_SERVICE_KEY` (اختیاری؛ بدون آن «خط مستقیم») |
| نقشه | `MAP_TILE_URL`, `MAP_TILE_ATTRIBUTION` (پیش‌فرض OpenStreetMap) |

نام‌ها در بالای `src/db.js` / `src/llm.js` / `src/geo.js` هستند و راحت تغییر می‌کنند.

## دیتاست در PostgreSQL
`products/offers/shops` (csv/json) را در `data/` بگذارید و یک‌بار `npm run import:pg` بزنید؛ از آن پس سرور دیتاست را از دیتابیس می‌خواند. پرسش‌ها و پیگیری‌ها در جدول `inquiries` ذخیره می‌شوند (بدون PostgreSQL در حافظه).

## API تازه
`GET /api/interpret?q=` · `POST /api/chat {message}` (AI؛ بدون کلید ۵۰۳) · `GET /api/route` · `POST /api/inquiry` · `POST /api/inquiry/update` · `GET /api/inquiries?client=` · `/api/offers` با `tp/kb/ex` و `insight`.

## نکته
تست‌های `test/e2e/*.py` برای رابط قدیمی بودند و با رابط جدید سازگار نیستند؛ بازنویسی یا حذف شوند.
