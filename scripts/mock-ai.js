'use strict';
// سرور ساختگی سازگار با OpenAI برای توسعه‌ی محلی (بدون مصرف اعتبار BoxAPI).
//   npm run ai:mock            # روی پورت 4010
//   BOXAPI_BASE_URL=http://127.0.0.1:4010/ai/v1 BOXAPI_API_KEY=local npm start
// این فایل فقط برای تست/دموست و هیچ‌جای اپ استفاده نمی‌شود.
const http = require('http');

const PORT = Number(process.env.MOCK_AI_PORT) || 4010;
const MODEL = process.env.MOCK_AI_MODEL || 'gpt-5.4-mini';

// پاسخ ساده و قابل‌پیش‌بینی: کلیدواژه‌های فارسی را به یک ساختار معنادار تبدیل می‌کند.
function answer(text) {
  const t = String(text || '');
  const out = { cat: null, sel: {}, filters: {}, reply: null };
  const cats = [['گوشی موبایل', /گوشی|موبایل|iphone|سامسونگ/], ['لوازم جانبی موبایل', /شارژر|کابل|هندزفری|هدفون|پاوربانک/], ['لپ‌تاپ', /لپ ?تاپ|نوت‌بوک/]];
  for (const [name, re] of cats) if (re.test(t)) { out.cat = name; break; }
  const brands = ['سامسونگ', 'اپل', 'شیائومی', 'انکر', 'سونی', 'لنوو', 'ایسوس', 'جی‌بل'];
  const brand = brands.find(b => t.includes(b));
  if (brand) out.sel.brand = brand;
  // «۵۰۰ هزار» → 500000 ، «دو میلیون» → 2000000 (همان قاعده‌ای که در پرامپت خواسته شده)
  const WORDS = { 'یک': 1, 'دو': 2, 'سه': 3, 'چهار': 4, 'پنج': 5, 'شش': 6, 'هفت': 7, 'هشت': 8, 'نه': 9, 'ده': 10, 'نیم': 0.5 };
  let ascii = t.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/٫/g, '.');
  ascii = ascii.replace(/(یک|دو|سه|چهار|پنج|شش|هفت|هشت|نه|ده|نیم)\s*(هزار|میلیون|میلیارد)/g, (_, w, u) => (WORDS[w] || 1) + u);
  const m = ascii.match(/(\d[\d,.]*)\s*(هزار|میلیون|میلیارد)?/);
  if (m) {
    const base = Number(m[1].replace(/[,]/g, ''));
    const mul = { 'هزار': 1e3, 'میلیون': 1e6, 'میلیارد': 1e9 }[m[2]] || 1;
    if (Number.isFinite(base) && base * mul >= 1000) out.filters.max = Math.round(base * mul);
  }
  if (/باز|الان/.test(t)) out.filters.open = true;
  if (!out.cat && /سلام|درود|چطوری|خوبی/.test(t)) out.reply = 'سلام! بگو دنبال چه محصولی هستی تا نزدیک‌ترین و ارزان‌ترین فروشگاه تهران را پیدا کنم.';
  return out;
}

const srv = http.createServer((req, res) => {
  if (req.method !== 'POST' || !/\/chat\/completions$/.test(req.url)) {
    res.writeHead(404, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ error: { message: 'not found' } }));
  }
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    let j = {};
    try { j = JSON.parse(body || '{}'); } catch { /* ignore */ }
    if (!req.headers.authorization) {
      res.writeHead(401, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: { message: 'missing api key' } }));
    }
    const user = (j.messages || []).filter(m => m.role === 'user').map(m => m.content).join(' ');
    const out = answer(user);
    console.log(JSON.stringify({ event: 'mock_ai', model: j.model, in: user.slice(0, 60), out }));
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      id: 'mock-' + Date.now(), model: j.model || MODEL,
      choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(out) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 80, completion_tokens: 30, total_tokens: 110 }
    }));
  });
});
srv.listen(PORT, '0.0.0.0', () => console.log(`mock AI on http://127.0.0.1:${PORT}/ai/v1 (model ${MODEL})`));
