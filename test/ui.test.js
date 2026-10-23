'use strict';
// تست‌های ایستا برای اتصال رابط کاربری به بک‌اند: بدون مرورگر، ولی جلوی شکستن مسیرها/آیکن‌ها را می‌گیرد.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PUB = path.join(__dirname, '..', 'public');
const read = f => fs.readFileSync(path.join(PUB, f), 'utf8');
const app = read('app.js'), html = read('index.html'), css = read('app.css'), map = read('map.js');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('همه‌ی آیکن‌های استفاده‌شده در index.html تعریف شده‌اند', () => {
  const ids = new Set([...html.matchAll(/id="i-([a-z-]+)"/g)].map(m => m[1]));
  const used = new Set([...app.matchAll(/icon\('([a-z-]+)'/g)].map(m => m[1]));
  for (const u of used) assert.ok(ids.has(u), `آیکن ${u} در index.html نیست`);
  assert.ok(used.size > 10);
});

test('اسکریپت‌های صفحه واقعاً در public وجود دارند', () => {
  const src = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  for (const s of src) assert.ok(fs.existsSync(path.join(PUB, s)), `فایل ${s} پیدا نشد`);
  assert.ok(src.includes('map.js') && src.includes('app.js'));
});

test('مسیرهای /api که رابط صدا می‌زند در سرور وجود دارند', () => {
  const used = new Set([...app.matchAll(/'(\/api\/[a-z/]+)'/g)].map(m => m[1]));
  const known = new Set([...server.matchAll(/(\/api\/[a-z/]+)/g)].map(m => m[1]));
  for (const u of used) assert.ok(known.has(u), `مسیر ${u} در server.js نیست`);
  assert.ok(used.has('/api/advice') && used.has('/api/hubs') && used.has('/api/trip') && used.has('/api/watch') && used.has('/api/call'));
});

test('نقشه فقط از meta کاشی می‌گیرد و به سرویس ثالث hard-code نشده', () => {
  assert.match(map, /window\.TorobMap\s*=\s*\{\s*create/);
  assert.ok(!/tile\.openstreetmap\.org/.test(map + app), 'آدرس کاشی باید از /api/meta بیاید');
  for (const fn of ['setUser', 'setShops', 'setHubs', 'setRoute', 'fit', 'panTo', 'setPick', 'invalidate', 'destroy']) {
    assert.ok(new RegExp(fn + '\\s*[\\(:]').test(map), `متد ${fn} در map.js نیست`);
  }
});

test('رابط برای همه‌ی داده‌actions کارت فروشگاه هندلر دارد', () => {
  for (const act of ['ask', 'map', 'watch', 'sel']) assert.ok(app.includes(`k === '${act}'`), `اکشن ${act} هندلر ندارد`);
});

test('هیچ بنر یا داده‌ی نمونه‌ای در رابط نمایش داده نمی‌شود', () => {
  assert.ok(!/demo\s*[:=]\s*true/.test(app), 'رابط نباید داده‌ی نمونه فعال کند');
  assert.ok(!/حالت\s*نمایشی|دمو/.test(html + app), 'بنر حالت نمایشی نباید وجود داشته باشد');
});

test('کلاس‌های کلیدی تصمیم‌یار در CSS تعریف شده‌اند', () => {
  for (const c of ['.advice', '.advc', '.trip', '.box-ok', '.box-warn', '.pin.unk', '.hub-pin', '.row-chk']) assert.ok(css.includes(c), `${c} در CSS نیست`);
});
