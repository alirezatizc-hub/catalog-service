'use strict';
// فهم جمله‌ی کاربر بدون نیاز به مدل (قاعده‌محور) + اعتبارسنجی خروجی مدل با داده‌ی واقعی.
// هر مقداری که از اینجا بیرون بیاید حتماً در داده وجود دارد؛ چیزی «حدس» زده نمی‌شود.
const { nm } = require('./engine');

const P2L = s => String(s).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/٫/g, '.').replace(/[٬,]/g, '');
const UNIT = { 'میلیارد': 1e9, 'میلیون': 1e6, 'هزار': 1e3, 'تومان': 1, 'تومن': 1 };
const NUM = '([۰-۹]+(?:[.٫][۰-۹]+)?)\\s*(میلیارد|میلیون|هزار|تومان|تومن)?';

function priceOf(text) {
  const f = {}, val = (n, u) => { const x = parseFloat(P2L(n)) * (UNIT[u] || (parseFloat(P2L(n)) < 1000 ? 1e6 : 1)); return Number.isFinite(x) && x > 0 ? Math.round(x) : null; };
  let m = text.match(new RegExp('بین\\s*' + NUM + '\\s*(?:تا|و)\\s*' + NUM));
  if (m) { const a = val(m[1], m[2] || m[4]), b = val(m[3], m[4]); if (a && b) { f.min = Math.min(a, b); f.max = Math.max(a, b); } return f; }
  m = text.match(new RegExp('(?:زیر|تا|حداکثر|کمتر از|ارزون‌تر از|ارزان‌تر از)\\s*' + NUM));
  if (m) { const v = val(m[1], m[2]); if (v) f.max = v; }
  m = text.match(new RegExp('(?:بالای|حداقل|بیشتر از|از)\\s*' + NUM + '\\s*(?:به بالا|بالا)?'));
  if (m && /(?:بالای|حداقل|بیشتر از|به بالا)/.test(m[0])) { const v = val(m[1], m[2]); if (v) f.min = v; }
  return f;
}

function togglesOf(text) {
  const f = {};
  if (/اقساط|قسطی|قسط/.test(text)) f.inst = true;
  if (/باز باشه|الان باز|بازه|فقط باز|همین الان باز/.test(text)) f.open = true;
  if (/نزدیک/.test(text)) f.sort = 'dist';
  else if (/ارزان|کمترین قیمت|ارزون/.test(text)) f.sort = 'price';
  if (/ترب ?پی|torobpay/.test(text)) f.torobpay = true;
  if (/کالابرگ/.test(text)) f.kalabarg = true;
  if (/ارسال فوری|پیک|فوری/.test(text)) f.express = true;
  return f;
}

// عدد + «گیگ/ترابایت» → رم یا حافظه
function capacityOf(text, ix, cat) {
  const sel = {}, re = /([۰-۹]+)\s*(گیگابایت|گیگ|gb|ترابایت|ترا|tb)/gi;
  let m;
  while ((m = re.exec(text))) {
    const n = +P2L(m[1]), tb = /ترا|tb/i.test(m[2]), before = text.slice(Math.max(0, m.index - 8), m.index), after = text.slice(m.index + m[0].length, m.index + m[0].length + 8);
    const kind = /رم|ram/i.test(before + after) ? 'ram' : (tb || n >= 64 ? 'storage' : 'ram');
    const unit = tb ? 'ترابایت' : 'گیگابایت';
    const opts = ix.options({ cat, sel: {} }, kind).options;
    const hit = opts.find(o => { const s = nm(o.v); const mm = s.match(/([۰-۹]+)/); return mm && +P2L(mm[1]) === n && s.includes(unit.slice(0, 3)); }) || opts.find(o => { const mm = nm(o.v).match(/([۰-۹]+)/); return mm && +P2L(mm[1]) === n; });
    if (hit) sel[kind] = String(hit.v);
  }
  return sel;
}

function detectCat(ix, text) {
  const cats = (ix.registry && ix.registry.cats) || {};
  let best = null, score = 0;
  for (const name of Object.keys(cats)) {
    const toks = nm(name).split(/\s+/).filter(w => w.length > 2);
    const s = toks.filter(w => text.includes(w)).length;
    if (s > score) { score = s; best = name; }
  }
  return best;
}

// حداکثر یک مقدار برای هر کلید؛ طولانی‌ترین تطبیق برنده است
function attrsOf(ix, text, cat) {
  const sel = {}, c = ix.registry.cats[cat];
  if (!c) return sel;
  for (const [k] of c.steps) {
    if (k === 'ram' || k === 'storage') continue;
    let best = null;
    for (const o of ix.options({ cat, sel: {} }, k).options) {
      const v = nm(o.v).trim();
      if (v.length < 2) continue;
      if (text.includes(v) && (!best || v.length > best.len)) best = { v: String(o.v), len: v.length };
    }
    if (best) sel[k] = best.v;
  }
  return sel;
}

function interpret(ix, query) {
  const text = nm(String(query || '').slice(0, 200));
  let cat = detectCat(ix, text);
  if (!cat) {
    // بدون نام دسته: دسته‌ی اولین محصول مطابق برند/مدل/عنوان
    const words = text.replace(/[^؀-ۿa-z0-9\s]/gi, ' ').split(/\s+/).filter(w => w.length > 1 && !/^[۰-۹0-9]+$/.test(w) && ix.cands({ q: w }).length);
    const hit = (words.length ? ix.cands({ q: words.join(' ') }).concat(ix.cands({ q: words[0] })) : [])[0];
    if (hit) cat = hit.cat;
  }
  const filters = { ...priceOf(text), ...togglesOf(text) };
  const sel = cat ? { ...attrsOf(ix, text, cat), ...capacityOf(text, ix, cat) } : {};
  return { cat: cat || null, sel, filters, source: 'rules' };
}

// خروجی مدل را فقط تا جایی می‌پذیرد که با داده‌ی واقعی بخواند
function sanitize(ix, raw) {
  const out = { cat: null, sel: {}, filters: {}, reply: null, source: 'llm' };
  if (!raw || typeof raw !== 'object') return out;
  const cats = ix.registry.cats;
  if (typeof raw.cat === 'string' && cats[raw.cat]) out.cat = raw.cat;
  if (out.cat && raw.sel && typeof raw.sel === 'object') {
    const keys = new Set(cats[out.cat].steps.map(s => s[0]));
    for (const [k, v] of Object.entries(raw.sel)) {
      if (!keys.has(k) || (typeof v !== 'string' && typeof v !== 'number')) continue;
      const hit = ix.options({ cat: out.cat, sel: {} }, k).options.find(o => nm(o.v) === nm(String(v)));
      if (hit) out.sel[k] = String(hit.v);
    }
  }
  const f = raw.filters && typeof raw.filters === 'object' ? raw.filters : {};
  for (const k of ['max', 'min']) if (Number.isFinite(f[k]) && f[k] > 0 && f[k] < 1e12) out.filters[k] = Math.round(f[k]);
  if (out.filters.min && out.filters.max && out.filters.min > out.filters.max) { delete out.filters.min; delete out.filters.max; }
  for (const k of ['inst', 'open']) if (f[k] === true) out.filters[k] = true;
  if (['price', 'dist', 'smart'].includes(f.sort)) out.filters.sort = f.sort;
  if (typeof raw.reply === 'string') out.reply = raw.reply.replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 160) || null;
  return out;
}

// ادغام: مقدار مدل مقدم است، قاعده‌ها جاهای خالی را پر می‌کنند
function merge(ai, rules) {
  const cat = ai.cat || rules.cat;
  const sel = ai.cat === cat ? { ...rules.sel, ...ai.sel } : { ...rules.sel };
  // اگر مدل فقط پاسخ متنی داده باشد هم منبع «llm» است تا در رابط با نشان هوش مصنوعی نمایش داده شود
  return { cat, sel: cat ? sel : {}, filters: { ...rules.filters, ...ai.filters }, reply: ai.reply, source: ai.cat || ai.reply || Object.keys(ai.filters).length ? 'llm' : 'rules' };
}

module.exports = { interpret, sanitize, merge, priceOf, togglesOf };
