'use strict';
(() => {
/* ───────── ابزارهای پایه ───────── */
const $ = s => document.querySelector(s), chat = $('#chat');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PD = s => String(s ?? '').replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);               // ارقام فارسی در متن‌های نمایشی
const fa = n => Number.isFinite(+n) && n !== null && n !== '' ? (+n).toLocaleString('fa-IR') : '—';
const fa1 = n => (+n).toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const mil = n => (n / 1e6).toLocaleString('fa-IR', { maximumFractionDigits: 1 }) + ' میلیون';
const wait = ms => new Promise(r => setTimeout(r, ms));
const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } } };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
const CLIENT = (() => { let c = ls.get('torob_client'); if (!c || !/^[A-Za-z0-9_-]{8,64}$/.test(c)) { c = uid(); ls.set('torob_client', c); } return c; })();
const icon = (n, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${n}"/></svg>`;

const SW = { 'آبی': '#2563eb', 'مشکی': '#111', 'سفید': '#f3f4f6', 'بنفش': '#8b5cf6', 'سبز': '#16a34a', 'قرمز': '#dc2626', 'نقره‌ای': '#c0c4cc', 'طلایی': '#d4a017', 'خاکستری': '#6b7280', 'صورتی': '#ec4899', 'زرد': '#eab308', 'نارنجی': '#f97316' };
const sw = v => Object.prototype.hasOwnProperty.call(SW, v) ? SW[v] : 0;
const ST_FA = { not_sent: 'ثبت شد (ارسال نشده)', pending: 'در انتظار پاسخ', answered: 'پاسخ ثبت شد', failed: 'بی‌پاسخ / ناموفق' };
const ST_CLS = { not_sent: '', pending: 'info', answered: 'ok', failed: 'bad' };
const AV_FA = { in_stock: 'موجود', out_of_stock: 'ناموجود', unknown: 'نامشخص' };
const TOPIC_FA = { availability: 'موجودی', price: 'قیمت فعلی', hours: 'ساعت کاری', installment: 'اقساط', terms: 'شرایط خرید' };
const TOPIC_Q = { availability: 'آیا همین الان موجود است؟', price: 'آیا قیمت فعلی همین است؟', hours: 'امروز تا چه ساعتی باز هستید؟', installment: 'آیا امکان خرید اقساطی دارید؟' };
const HS = { open: ['باز', 'ok'], closed: ['بسته', 'no'], unknown: ['ساعت کاری نامشخص', 'wn'] };
const SORT_FA = { price: 'ارزان‌ترین', dist: 'نزدیک‌ترین', smart: 'بهترین ترکیب', closing: 'دیرتر بسته می‌شود' };
const PRESETS = [['مرکز تهران (پیش‌فرض)', 35.72, 51.41], ['میدان انقلاب', 35.7011, 51.3912], ['میدان ونک', 35.7575, 51.411], ['بازار تهران', 35.6738, 51.42], ['میدان صادقیه', 35.7156, 51.3436], ['میدان تجریش', 35.8040, 51.4300]];
const TOGGLES = [['inst', 'اقساطی (اعلام‌شده)'], ['credit', 'اقساط حضوری'], ['open', 'فقط بازها'], ['tp', 'ترب‌پی'], ['ex', 'ارسال فوری']];

let meta, st, box, mv = null, cmp = new Set(), rowsCache = [], inq = {}, lastFocus = null, routeTok = 0, advData = null, advSeq = 0, advTimer = null, waitT = null;
const routeCache = new Map();

async function api(p, params, opt, timeout = 12000) {
  const q = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v != null && v !== '' && v !== false)).toString(), ac = new AbortController(), t = setTimeout(() => ac.abort(), timeout);
  try { const r = await fetch(p + (q ? '?' + q : ''), { ...opt, signal: ac.signal }); if (!r.ok) { const e = new Error(r.status); e.status = r.status; throw e; } return await r.json(); }
  finally { clearTimeout(t); }
}
const post = (p, body, timeout) => api(p, null, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, timeout);

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3200); }
const scrollDown = () => window.scrollTo({ top: document.body.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });

/* ───────── پوسته (روشن/تیره) ───────── */
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  $('#thm').innerHTML = icon(t === 'dark' ? 'sun' : 'moon');
  document.querySelector('meta[name=theme-color]').content = t === 'dark' ? '#171b23' : '#e11d2e';
}
applyTheme(ls.get('torob_theme') || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light'));
$('#thm').onclick = () => { const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; ls.set('torob_theme', t); applyTheme(t); };

/* ───────── دیالوگ ───────── */
const dlg = $('#dlg');
function openDlg(title, node, wide) {
  lastFocus = document.activeElement;
  $('#dlg-t').textContent = title; const b = $('#dlg-b'); b.replaceChildren(); typeof node === 'string' ? (b.innerHTML = node) : b.append(node);
  dlg.classList.toggle('wide', !!wide);
  if (!dlg.open) { dlg.showModal ? dlg.showModal() : dlg.setAttribute('open', ''); }
  return b;
}
function closeDlg() { if (dlg.open) { dlg.close ? dlg.close() : dlg.removeAttribute('open'); } if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true }); }
$('#dlg-x').onclick = closeDlg;
dlg.addEventListener('click', e => { if (e.target === dlg) closeDlg(); });

/* ───────── گفتگو ───────── */
function say(h, u) { const d = document.createElement('div'); d.className = 'm' + (u ? ' u' : ''); d.innerHTML = (u ? '' : `<div class="av">${icon('spark')}</div>`) + '<div class="bub">' + h + '</div>'; chat.append(d); scrollDown(); return d; }
async function bot(h) { const t = say('<span class="dots" role="status" aria-label="در حال پردازش"><span></span><span></span><span></span></span>'); await wait(reduce ? 0 : 220); t.querySelector('.bub').innerHTML = h; scrollDown(); }
// items: [{l, sub, color, cls, fn}]
function choices(items) {
  const d = document.createElement('div'); d.className = 'chips';
  items.forEach((it, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip' + (it.cls ? ' ' + it.cls : ''); b.style.animationDelay = i * 30 + 'ms';
    if (it.color) { const s = document.createElement('span'); s.className = 'sw'; s.style.background = it.color; s.setAttribute('aria-hidden', 'true'); b.append(s); }
    b.append(document.createTextNode(PD(it.l)));
    if (it.sub) { const m = document.createElement('small'); m.textContent = '· ' + it.sub; b.append(m); }
    b.onclick = () => { d.remove(); say(esc(PD(it.l)), 1); it.fn(); };
    d.append(b);
  });
  chat.append(d); scrollDown(); const f = d.querySelector('button'); f && f.focus({ preventScroll: true });
}
function fail(retry, msg) {
  const b = document.createElement('div'); b.className = 'm'; b.innerHTML = `<div class="av">${icon('spark')}</div>`;
  const bub = document.createElement('div'); bub.className = 'bub'; bub.setAttribute('role', 'alert'); bub.append(document.createTextNode('⚠ ' + (msg || 'خطا در دریافت اطلاعات.') + ' '));
  const r = document.createElement('button'); r.type = 'button'; r.className = 'btn sm'; r.textContent = 'تلاش مجدد'; r.onclick = () => { b.remove(); retry(); }; bub.append(r); b.append(bub); chat.append(b); r.focus({ preventScroll: true }); scrollDown();
}

/* ───────── وضعیت و ناوبری مراحل ───────── */
function newState(keep) {
  return { cat: null, sel: {}, skip: new Set(), auto: new Set(), order: [], loc: keep ? keep.loc : { lat: PRESETS[0][1], lng: PRESETS[0][2] }, locSrc: keep ? keep.locSrc : 'default', f: { inst: 0, credit: 0, open: 0, tp: 0, kb: 0, ex: 0 }, sort: 'price', rad: 20, min: '', max: '', pid: null, aid: null, product: null, view: 'list', seq: 0, fitNext: true, pick: false };
}
function destroyPanel() { if (mv) { try { mv.destroy(); } catch { /* ignore */ } mv = null; } if (box) { box.remove(); box = null; } }
function invalidate() { destroyPanel(); if (st) { st.pid = null; st.aid = null; } cmp.clear(); routeTok++; }
function crumbs() {
  const c = $('#crumbs'); c.innerHTML = ''; if (!st || !st.cat) return;
  const C = meta.cats[st.cat], add = (t, f, a) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = t; b.setAttribute('aria-label', a); b.onclick = f; c.append(b); };
  add('→ بازگشت', back, 'بازگشت به مرحله قبل'); add(C.name + ' ✕', () => start(), 'شروع مجدد');
  C.steps.forEach(([k, l]) => { if (st.sel[k] !== undefined) add(l + ': ' + PD(st.sel[k]) + ' ✕', () => drop(k), 'حذف فیلتر ' + l); else if (st.skip.has(k)) add(l + ': فرقی ندارد ✕', () => drop(k), 'برگرداندن فیلتر ' + l); });
}
async function prune() {
  const steps = meta.cats[st.cat].steps, gone = [];
  for (let pass = 0; pass < 2; pass++) for (const [k, l] of steps) {
    if (st.sel[k] === undefined) continue;
    const rest = { ...st.sel }; delete rest[k];
    const r = await api('/api/options', { cat: st.cat, key: k, ...rest });
    if (!r.options.some(o => String(o.v) === String(st.sel[k]))) { gone.push(l); delete st.sel[k]; st.order = st.order.filter(x => x !== k); }
  }
  return [...new Set(gone)];
}
async function drop(k) {
  delete st.sel[k]; st.skip.delete(k); st.auto.delete(k); st.order = st.order.filter(x => x !== k); invalidate(); crumbs();
  try { const g = await prune(); if (g.length) { crumbs(); say('فیلتر ' + esc(g.join('، ')) + ' با این تغییر دیگر معتبر نبود و برداشته شد.'); } } catch { return fail(() => drop(k)); }
  flow();
}
function back() {
  if (!st.cat) return;
  if (!st.order.length) return start();
  while (st.order.length) { const k = st.order.pop(); delete st.sel[k]; st.skip.delete(k); if (!st.auto.has(k)) break; st.auto.delete(k); }
  invalidate(); crumbs(); flow();
}

/* ───────── شروع ───────── */
async function start() {
  const keep = st && { loc: st.loc, locSrc: st.locSrc };
  destroyPanel(); chat.innerHTML = ''; $('#crumbs').innerHTML = ''; cmp.clear(); inq = {}; st = newState(keep); advData = null;
  clearTimeout(waitT);
  try { meta = meta || await api('/api/meta'); } catch { return fail(start, 'اتصال به سرور برقرار نشد.'); }
  renderSource();
  if (!meta.ready) return waitingDataset();
  if (!meta.dataOk || !meta.counts.products || !Object.keys(meta.cats).length) {
    return bot('دیتاست بارگذاری شد اما داده‌ی معتبری برای نمایش نیست. <a href="/api/status" target="_blank" rel="noopener">گزارش اتصال و نگاشت ستون‌ها</a> را ببینید.');
  }
  refreshBadge();
  const hero = document.createElement('section'); hero.className = 'hero';
  hero.innerHTML = `<h1>چی لازم داری؟ نزدیک‌ترین و به‌صرفه‌ترین فروشگاه تهران رو پیدا می‌کنم</h1>
   <p>قیمت‌ها از فروشنده‌ها ثبت شده؛ موجودی تا وقتی از فروشنده نپرسی «تأییدنشده» است.</p>
   <ol class="steps"><li><b>محصول را مشخص کن</b>با چند سؤال کوتاه یا یک جمله</li><li><b>فروشگاه‌های نزدیک</b>روی نقشه و بر اساس موقعیتت</li><li><b>مقایسه کن</b>قیمت، فاصله و ساعت کاری</li><li><b>پرسش و تماس</b>اگر نبود، جایگزین یا پاساژ نزدیک پیشنهاد می‌شود</li></ol>`;
  chat.append(hero);
  const cats = document.createElement('div'); cats.className = 'cats'; cats.setAttribute('role', 'group'); cats.setAttribute('aria-label', 'دسته‌بندی محصول');
  Object.entries(meta.cats).forEach(([k, v]) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'cat'; b.innerHTML = `${icon('store')}<span><b>${esc(PD(v.name))}</b><small>${fa(v.count)} محصول</small></span>`;
    b.onclick = () => { hero.remove(); cats.remove(); ex.remove(); say(esc(PD(v.name)), 1); st.cat = k; crumbs(); flow(); }; cats.append(b);
  });
  chat.append(cats);
  const ex = document.createElement('div'); ex.className = 'examples'; chat.append(ex);
  try { // نمونه جمله‌ها از برندهای واقعی داده
    for (const [k, v] of Object.entries(meta.cats).slice(0, 4)) {
      if (!v.steps.some(s => s[0] === 'brand')) continue;
      const r = await api('/api/options', { cat: k, key: 'brand' }); const br = r.options[0] && r.options[0].v; if (!br) continue;
      const t = PD(v.name) + ' ' + PD(br), b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = '«' + t + '»'; b.onclick = () => { hero.remove(); cats.remove(); ex.remove(); txt(t); }; ex.append(b);
    }
  } catch { /* نمونه‌ها اختیاری‌اند */ }
}

// منبع داده و آمادگی سرور: هیچ داده‌ی نمونه‌ای به‌جای دیتاست واقعی نمایش داده نمی‌شود.
function renderSource() {
  const el = $('#src'); if (!el || !meta) return;
  const c = meta.counts || {};
  const src = meta.source === 'postgres' ? 'دیتاست ترب · PostgreSQL' : meta.source === 'files' ? 'دیتاست ترب · فایل محلی' : 'دیتاست وصل نشده';
  el.hidden = false;
  el.innerHTML = `<span class="tag ${meta.ready ? 'ok' : 'bad'}">${esc(src)}</span>` +
    (meta.ready ? ` <span class="hint">${fa(c.products)} محصول · ${fa(c.shops)} فروشگاه · ${fa(c.offers)} آفِر ثبت‌شده</span>` : ' <span class="hint">در حال خواندن داده از دیتابیس…</span>') +
    (meta.db === 'postgres' ? ' <span class="tag info">پیگیری‌ها در دیتابیس ذخیره می‌شوند</span>' : meta.ready ? ' <span class="tag warn">پیگیری‌ها موقت‌اند (بدون دیتابیس)</span>' : '');
}
function waitingDataset() {
  const d = say('<b>دیتاست ترب در حال بارگذاری است…</b><br><span class="hint">محصولات، آفِرها و فروشگاه‌ها از PostgreSQL خوانده و ایندکس می‌شوند. این صفحه خودش به‌روز می‌شود.</span><div class="dots" role="status" aria-label="در حال بارگذاری"><span></span><span></span><span></span></div>');
  let n = 0;
  const tick = async () => {
    n++;
    try { const m = await api('/api/meta'); if (m.ready) { d.remove(); return start(); } } catch { /* هنوز آماده نیست */ }
    if (n < 60) waitT = setTimeout(tick, 2500);
    else d.querySelector('.bub').innerHTML = 'بارگذاری بیشتر از حد معمول طول کشید. <a href="/api/status" target="_blank" rel="noopener">وضعیت اتصال و جدول‌ها</a> را ببینید، سپس دوباره تلاش کنید.';
  };
  waitT = setTimeout(tick, 2500);
}

/* ───────── سؤال‌ها و انتخاب محصول ───────── */
async function flow() {
  try {
    for (const [k, l] of meta.cats[st.cat].steps) {
      if (st.sel[k] !== undefined || st.skip.has(k)) continue;
      const r = await api('/api/options', { cat: st.cat, key: k, ...st.sel });
      if (!r.options.length) continue;
      if (r.options.length === 1 && !r.missing) { st.sel[k] = String(r.options[0].v); st.auto.add(k); st.order.push(k); crumbs(); continue; }
      await bot(`کدام <b>${esc(l)}</b>؟ <span class="hint">(فقط مقادیر ثبت‌شده در داده${r.missing ? '؛ ' + fa(r.missing) + ' محصول ' + esc(l) + ' ثبت‌نشده دارند و نمایش داده نمی‌شوند' : ''})</span>`);
      const items = r.options.map(o => ({ l: o.v, sub: fa(o.n) + ' فروشنده', color: k === 'color' ? sw(o.v) : 0, fn: () => { st.sel[k] = String(o.v); st.auto.delete(k); st.order.push(k); crumbs(); flow(); } }));
      items.push({ l: 'فرقی نمی‌کند', cls: 'skipc', fn: () => { st.skip.add(k); st.order.push(k); crumbs(); flow(); } });
      items.push({ l: 'نتایج را همین الان نشان بده', cls: 'skipc', fn: productStep });
      return choices(items);
    }
    return productStep();
  } catch { fail(flow); }
}
async function productStep() {
  try {
    const r = await api('/api/products', { cat: st.cat, ...st.sel });
    if (!r.items.length) return bot('محصولی با این ترکیب پیدا نشد. یکی از فیلترها را از نوار بالا حذف کنید.');
    if (r.items.length === 1) return results(r.items[0]);
    const items = r.items.sort((a, b) => (a.minPrice ?? 1e15) - (b.minPrice ?? 1e15));
    await bot(`${fa(items.length)} محصول مطابق است؛ یکی را انتخاب کنید <span class="hint">(مرتب‌شده از ارزان‌ترین قیمت ثبت‌شده)</span>`);
    const wrap = document.createElement('div'); wrap.className = 'plist';
    items.slice(0, 24).forEach((p, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'pcard'; b.style.animationDelay = Math.min(i, 10) * 35 + 'ms';
      const ph = document.createElement('span'); ph.className = 'ph'; ph.innerHTML = icon('store');
      let th = ph; if (p.image && /^https:\/\//.test(p.image)) { th = document.createElement('img'); th.src = p.image; th.alt = ''; th.loading = 'lazy'; th.referrerPolicy = 'no-referrer'; th.onerror = () => th.replaceWith(ph); }
      const body = document.createElement('span'); const spec = [p.color, p.ram && p.storage ? p.ram + '/' + p.storage : p.ram || p.storage].filter(Boolean).map(PD).join(' · ');
      body.innerHTML = `<b>${esc(PD(p.title_fa || p.model || p.id))}</b><span class="meta">${esc(spec)}</span><span class="from">${p.minPrice ? 'از ' + fa(p.minPrice) + ' تومان · ' + fa(p.shops) + ' فروشگاه' : ''}</span>`;
      b.append(th, body); b.onclick = () => { wrap.remove(); say(esc(PD(p.title_fa || p.model)), 1); results(p); }; wrap.append(b);
    });
    chat.append(wrap); wrap.querySelector('button').focus({ preventScroll: true }); scrollDown();
  } catch { fail(productStep); }
}

/* ───────── جملهٔ آزاد (هوش مصنوعی boxapi یا قاعده‌محور) ───────── */
function intentText(i) {
  const C = meta.cats[i.cat], parts = [`دسته: <b>${esc(PD(C.name))}</b>`];
  for (const [k, l] of C.steps) if (i.sel[k] !== undefined) parts.push(esc(l) + ': <b>' + esc(PD(i.sel[k])) + '</b>');
  const f = i.filters || {};
  if (f.max) parts.push('حداکثر <b>' + fa(f.max) + '</b> تومان'); if (f.min) parts.push('حداقل <b>' + fa(f.min) + '</b> تومان');
  if (f.inst) parts.push('فقط اقساطی'); if (f.open) parts.push('فقط بازها'); if (f.sort) parts.push('مرتب‌سازی: ' + SORT_FA[f.sort]);
  return parts.join(' · ');
}
async function txt(q) {
  say(esc(PD(q)), 1); invalidate();
  let i;
  try {
    try { i = meta.ai ? await post('/api/chat', { message: q }, 20000) : await api('/api/interpret', { q }); }
    catch { i = await api('/api/interpret', { q }); }
  } catch { return fail(() => txt(q)); }
  if (!i.cat) { if (i.reply) return bot((i.source === 'llm' ? `<span class="tag info">${icon('spark')} هوش مصنوعی</span> ` : '') + esc(i.reply)); return bot('محصولی با این عبارت پیدا نشد. یکی از دسته‌ها را انتخاب کنید یا دقیق‌تر بنویسید.').then(() => start()); }
  st.cat = i.cat; st.sel = { ...i.sel }; st.skip = new Set(); st.auto = new Set(); st.order = Object.keys(st.sel);
  const f = i.filters || {}; st.min = f.min || ''; st.max = f.max || ''; for (const [a, b] of [['inst', 'inst'], ['open', 'open'], ['tp', 'torobpay'], ['kb', 'kalabarg'], ['ex', 'express']]) st.f[a] = f[b] ? 1 : 0; if (f.sort) st.sort = f.sort;
  crumbs();
  await bot((i.source === 'llm' ? `<span class="tag info">${icon('spark')} هوش مصنوعی</span> ` : '🔎 ') + (i.reply ? esc(i.reply) + '<br>' : '') + '<span class="hint">' + intentText(i) + '</span>');
  flow();
}

/* ───────── مدل‌های نمایشی (کارت، نقشه، مقایسه) ───────── */
const hm = h => { const m = Math.round((h % 1) * 60); return fa(Math.floor(h)) + (m ? ':' + (m < 10 ? '۰' : '') + fa(m) : ''); };
function ageOf(iso) { const h = (Date.now() - Date.parse(iso)) / 36e5; return iso == null || isNaN(h) ? ['زمان ثبت قیمت نامشخص', 'wn'] : [(h < 1 ? 'کمتر از یک ساعت' : fa(Math.round(h)) + ' ساعت') + ' پیش' + (h > 168 ? ' (قدیمی)' : ''), h > 168 ? 'wn' : '']; }
function ago(iso) { const m = (Date.now() - Date.parse(iso)) / 6e4; if (!(m >= 0)) return ''; return m < 1 ? 'همین الان' : m < 60 ? fa(Math.round(m)) + ' دقیقه پیش' : m < 1440 ? fa(Math.round(m / 60)) + ' ساعت پیش' : fa(Math.round(m / 1440)) + ' روز پیش'; }
const tri = (v, y, n) => v === true ? y : v === false ? n : null;
function info(r, i) {
  const s = r.shop, o = r.offer, h = HS[r.hours.state], [a, ac] = ageOf(o.updated), pl = s.place;
  const closeIn = r.hours.state === 'open' && r.hours.closeInMin != null ? r.hours.closeInMin : null;
  const hTxt = r.hours.state === 'open'
    ? 'باز' + (closeIn != null ? ' · ' + fa(Math.floor(closeIn / 60)) + ':' + PD(String(Math.round(closeIn % 60)).padStart(2, '0')) + ' وقت داری' : (r.hours.close != null ? ' تا ' + hm(r.hours.close) : ''))
    : r.hours.state === 'closed'
      ? 'بسته' + (r.hours.next ? ' · ' + PD(r.hours.next.at) + ' باز می‌شود' : (r.hours.note ? ' · ' + r.hours.note : ''))
      : 'ساعت کاری نامشخص';
  return {
    i, id: s.id, name: PD(s.name), addr: s.addr || s.mall || '', place: pl ? [pl.mall, pl.floor, pl.unit].filter(Boolean).map(PD) : [], price: o.price, unit: o.unit || 'تومان', km: r.km,
    etaMin: r.etaMin != null ? r.etaMin : (r.km != null ? Math.max(3, Math.round(r.km * 1.35 / 18 * 60 + 6)) : null),
    kmTxt: r.km == null ? 'فاصله نامشخص' : fa1(r.km) + ' کیلومتر (خط مستقیم)',
    hs: r.hours.state, hoursTxt: hTxt, hc: h[1], closeIn,
    ageTxt: 'قیمت ثبت‌شده ' + a, ac, avail: 'موجودی تأییدنشده', warranty: o.warranty ? PD(o.warranty) : 'گارانتی: ثبت نشده', seller: o.seller ? PD(o.seller) : '', desc: o.description ? PD(o.description) : '', score: r.score,
    inst: s.installment, credit: r.credit === true, tp: s.torobpay, kb: s.kalabarg, ex: s.express, hasLoc: s.lat != null && s.lng != null, lat: s.lat, lng: s.lng,
    tel: s.tel, wa: s.wa, bale: s.bale, ig: s.ig, web: s.web, cats: s.cats || [], providers: s.providers || [], pay: s.pay || [], src: 'دیتاست ترب'
  };
}
const instTxt = x => x.inst === true ? 'اعلام‌شده توسط فروشنده' : x.inst === false ? 'ندارد' : 'نامشخص';
const line = x => [fa(x.i + 1) + '. ' + x.name, fa(x.price) + ' ' + x.unit, x.kmTxt, x.hoursTxt, x.ageTxt, x.avail].join(' · ');
const specOf = p => meta.cats[st.cat].steps.filter(([k]) => p[k] != null).map(([k, l]) => [l, PD(p[k])]);
const telHref = t => 'tel:' + String(t).replace(/[^\d+]/g, '');
const waHref = (w, text) => { let d = String(w).replace(/\D/g, ''); if (/^0\d{10}$/.test(d)) d = '98' + d.slice(1); return d ? 'https://wa.me/' + d + (text ? '?text=' + encodeURIComponent(text) : '') : null; };
const dirHref = x => `https://www.google.com/maps/dir/?api=1${st.loc ? '&origin=' + st.loc.lat + ',' + st.loc.lng : ''}&destination=${+x.lat},${+x.lng}`;

/* ───────── پنل نتایج ───────── */
async function results(p) {
  invalidate(); st.pid = p.id; st.product = p; st.aid = null; st.fitNext = true;
  await bot(`<b>${esc(PD(p.title_fa || p.model))}</b><br><span class="hint">قیمت‌ها ثبت‌شده توسط فروشنده‌اند؛ تا تأیید فروشنده، موجودی «تأییدنشده» است.</span>`);
  if (st.pid !== p.id) return;
  buildPanel(p); box.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); refresh();
}
const locLabel = () => ({ default: 'پیش‌فرض (مرکز تهران)', gps: 'موقعیت شما (GPS)', manual: 'انتخاب‌شده روی نقشه', preset: (PRESETS.find(x => x[1] === st.loc.lat && x[2] === st.loc.lng) || [])[0] || 'انتخاب‌شده' }[st.locSrc]);
function buildPanel(p) {
  box = document.createElement('section'); box.className = 'res'; box.setAttribute('aria-label', 'مقایسه فروشگاه‌ها');
  const spec = specOf(p).map(([l, v]) => `<span class="tag">${esc(l)}: ${esc(v)}</span>`).join('');
  box.innerHTML = `
  <div class="res-h"><h3>${esc(PD(p.title_fa || p.model))}</h3><div class="sub" id="r-sub">در حال دریافت قیمت فروشگاه‌ها…</div><div class="spec">${spec}</div></div>
  <div class="insight" id="r-ins" hidden></div>
  <div class="ctrl">
   <div class="row-s" id="r-sort" role="group" aria-label="مرتب‌سازی"><div class="seg">${Object.entries(SORT_FA).map(([k, t]) => `<button type="button" data-s="${k}" aria-pressed="false">${t}</button>`).join('')}</div></div>
   <div class="row-s" id="r-tog" role="group" aria-label="فیلترها">${TOGGLES.map(([k, t]) => `<button type="button" class="chip" data-t="${k}" aria-pressed="false">${t}</button>`).join('')}</div>
   <details class="more" id="r-more"><summary>${icon('sliders')} بودجه، موقعیت و شعاع</summary>
    <div class="fgrid">
     <div class="fld"><span>بودجه (تومان)</span><div class="pair"><input id="mn" type="number" inputmode="numeric" min="0" placeholder="حداقل" aria-label="حداقل بودجه"><input id="mx" type="number" inputmode="numeric" min="0" placeholder="حداکثر" aria-label="حداکثر بودجه"></div><div class="presets" id="r-bud"></div><div class="no hint" id="r-bud-err" role="alert"></div></div>
     <div class="fld"><label for="pl"><span>موقعیت شما</span></label><select id="pl"></select><div class="presets"><button type="button" class="chip" id="b-gps">${icon('target')} موقعیت من (GPS)</button></div><div class="hint" id="ll"></div></div>
     <div class="fld"><label for="rd"><span>شعاع جست‌وجو: <b id="rv"></b></span></label><input id="rd" type="range" min="1" max="40"></div>
    </div></details>
  </div>
  <div class="summary" id="r-sum"></div>
  <div class="advice" id="r-adv" hidden aria-live="polite"></div>
  <div class="tabs"><div class="seg" role="group" aria-label="نمای نتایج"><button type="button" data-v="list" aria-pressed="true">${icon('list')} فهرست</button><button type="button" data-v="map" aria-pressed="false">${icon('map')} نقشه</button></div></div>
  <div class="split" id="r-split">
   <div class="pane-list"><div class="shops" id="r-list" aria-live="polite"></div></div>
   <div class="pane-map">
    <div class="map-tools"><button type="button" class="btn sm" id="b-pick" aria-pressed="false">${icon('pin')} انتخاب موقعیت روی نقشه</button></div>
    <div class="map-box" id="r-map" role="application" aria-label="نقشه فروشگاه‌ها"></div>
    <div class="route-chip" id="r-chip" hidden></div>
    <div class="map-note" id="r-mapnote"></div>
   </div>
  </div>
  <div class="cmp-bar" id="r-cmp" hidden><span id="r-cmp-t"></span><button type="button" class="btn sm" id="b-cmp">مقایسه</button><button type="button" class="btn sm ghost" id="b-trip">${icon('route')} برنامه‌ی مراجعه</button></div>`;
  chat.append(box);
  wirePanel(); syncControls();
  // نقشه
  const cfg = meta.map;
  if (window.TorobMap && cfg && cfg.tiles) {
    mv = window.TorobMap.create($('#r-map'), cfg, {
      onSelect: id => select(id, { fromMap: true }),
      onMove: loc => { st.loc = loc; st.locSrc = 'manual'; st.fitNext = false; syncControls(); refresh(); },
      onPick: loc => { st.loc = loc; st.locSrc = 'manual'; setPick(false); st.fitNext = false; syncControls(); refresh(); },
      onTilesFail: () => { $('#r-mapnote').textContent = 'بارگذاری کاشی‌های نقشه ناموفق بود (اتصال اینترنت یا دسترسی به سرویس نقشه)؛ فهرست و فاصله‌ها همچنان کار می‌کنند.'; }
    });
  }
  if (!mv) { $('#r-map').innerHTML = '<div class="empty">نقشه در دسترس نیست؛ از فهرست استفاده کنید.</div>'; }
  $('#r-mapnote').textContent = meta.map && meta.map.routing ? 'فاصله‌ی نمایش‌داده‌شده روی کارت‌ها «خط مستقیم» است؛ برای فروشگاه انتخابی زمان مسیر خودرویی هم نشان داده می‌شود.' : 'فاصله‌ها «خط مستقیم» هستند، نه مسیر رانندگی. دایره آبی را بکشید یا «انتخاب موقعیت روی نقشه» را بزنید.';
}
function setPick(on) { st.pick = on; if (mv) mv.setPick(on); const b = $('#b-pick'); if (b) { b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.lastChild.textContent = on ? ' روی نقشه بزنید…' : ' انتخاب موقعیت روی نقشه'; } }
function syncControls() {
  if (!box) return;
  box.querySelectorAll('[data-s]').forEach(b => b.setAttribute('aria-pressed', st.sort === b.dataset.s ? 'true' : 'false'));
  box.querySelectorAll('[data-t]').forEach(b => b.setAttribute('aria-pressed', st.f[b.dataset.t] ? 'true' : 'false'));
  box.querySelectorAll('[data-v]').forEach(b => b.setAttribute('aria-pressed', st.view === b.dataset.v ? 'true' : 'false'));
  box.classList.toggle('show-map', st.view === 'map');
  const gpsOrManual = st.locSrc === 'gps' || st.locSrc === 'manual', sel = $('#pl');
  sel.innerHTML = PRESETS.map((x, i) => `<option value="${i}"${!gpsOrManual && x[1] === st.loc.lat && x[2] === st.loc.lng ? ' selected' : ''}>${esc(x[0])}</option>`).join('') + (st.locSrc === 'gps' ? '<option value="gps" selected>موقعیت شما (GPS)</option>' : st.locSrc === 'manual' ? '<option value="manual" selected>انتخاب‌شده روی نقشه</option>' : '');
  $('#ll').textContent = 'موقعیت فعلی: ' + locLabel();
  const rd = $('#rd'); rd.value = st.rad; $('#rv').textContent = fa(st.rad) + ' کیلومتر'; rd.setAttribute('aria-valuetext', fa(st.rad) + ' کیلومتر');
  if (document.activeElement !== $('#mn')) $('#mn').value = st.min; if (document.activeElement !== $('#mx')) $('#mx').value = st.max;
}
function wirePanel() {
  box.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { st.sort = b.dataset.s; st.fitNext = false; syncControls(); refresh(); });
  box.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { const k = b.dataset.t; st.f[k] = st.f[k] ? 0 : 1; st.fitNext = true; syncControls(); refresh(); });
  box.querySelectorAll('[data-v]').forEach(b => b.onclick = () => setView(b.dataset.v));
  $('#mn').onchange = e => { st.min = e.target.value; st.fitNext = true; refresh(); }; $('#mx').onchange = e => { st.max = e.target.value; st.fitNext = true; refresh(); };
  const rd = $('#rd'); rd.oninput = e => { $('#rv').textContent = fa(e.target.value) + ' کیلومتر'; }; rd.onchange = e => { st.rad = +e.target.value; st.fitNext = true; syncControls(); refresh(); };
  $('#pl').onchange = e => { const v = e.target.value; if (v === 'gps' || v === 'manual') return; const x = PRESETS[+v]; st.loc = { lat: x[1], lng: x[2] }; st.locSrc = 'preset'; st.fitNext = true; syncControls(); refresh(); };
  $('#b-gps').onclick = geo; $('#b-pick').onclick = () => { setView('map'); setPick(!st.pick); };
  $('#b-cmp').onclick = openCompare; $('#b-trip').onclick = openTrip;
  const list = $('#r-list');
  list.onclick = e => {
    const a = e.target.closest('[data-act]'), card = e.target.closest('.shop'); if (!card) return;
    if (e.target.closest('a')) return e.stopPropagation();
    const id = card.dataset.id;
    if (a) { e.stopPropagation(); const k = a.dataset.act; if (k === 'ask') return openAsk(id); if (k === 'map') { select(id); setView('map'); return; } if (k === 'watch') return openWatch(id); if (k === 'sel') return select(a.dataset.id); }
    select(id);
  };
  list.onkeydown = e => { const card = e.target.closest('.shop'); if (card && e.target === card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(card.dataset.id); } };
  list.onchange = e => { const c = e.target.closest('[data-c]'); if (!c) return; if (c.checked && cmp.size >= 3) { c.checked = false; return toast('حداکثر ۳ فروشگاه را می‌توان مقایسه کرد.'); } c.checked ? cmp.add(c.dataset.c) : cmp.delete(c.dataset.c); cmpBar(); };
}
function setView(v) { st.view = v; syncControls(); if (v === 'map' && mv) { mv.invalidate(); } if (v === 'list') setPick(false); }

async function refresh() {
  if (!box) return;
  const pid = st.pid, my = st.seq = st.seq + 1, list = $('#r-list');
  if (!list.firstChild) list.innerHTML = '<div class="sk"></div><div class="sk"></div><div class="sk"></div>'; else box.classList.add('loading');
  box.setAttribute('aria-busy', 'true');
  const mn = st.min === '' ? null : +st.min, mx = st.max === '' ? null : +st.max, badB = mn != null && mx != null && mn > mx;
  $('#r-bud-err').textContent = badB ? 'بازه‌ی بودجه نامعتبر است؛ اعمال نشد.' : '';
  let d;
  try { d = await api('/api/offers', { pid, lat: st.loc.lat, lng: st.loc.lng, rad: st.rad, inst: st.f.inst ? 1 : 0, credit: st.f.credit ? 1 : 0, open: st.f.open ? 1 : 0, tp: st.f.tp ? 1 : 0, kb: st.f.kb ? 1 : 0, ex: st.f.ex ? 1 : 0, sort: st.sort, min: badB ? '' : st.min, max: badB ? '' : st.max }); }
  catch { if (pid !== st.pid || my !== st.seq) return; box.classList.remove('loading'); box.setAttribute('aria-busy', 'false'); list.innerHTML = ''; return fail(refresh); }
  if (pid !== st.pid || my !== st.seq || !box) return;
  box.classList.remove('loading'); box.removeAttribute('aria-busy');
  rowsCache = d.rows; st.range = d.range;
  const X = rowsCache.map(info);
  if (!X.find(x => x.id === st.aid)) st.aid = X[0] && X[0].id || null;
  for (const id of [...cmp]) if (!X.find(x => x.id === id)) cmp.delete(id);
  renderHead(d, X); renderList(X, d); renderMap(X); cmpBar(); updateRoute(); loadAdvice();
}
function renderHead(d, X) {
  const rg = d.range, sub = $('#r-sub');
  sub.textContent = rg && rg.minPrice ? `قیمت ثبت‌شده از ${fa(rg.minPrice)} تا ${fa(rg.maxPrice)} تومان در ${fa(rg.shops)} فروشگاه` : 'قیمتی ثبت نشده';
  // پیش‌تنظیم بودجه بر پایهٔ قیمت واقعی
  const bud = $('#r-bud');
  if (rg && rg.minPrice && !bud.firstChild) {
    const nice = v => Math.ceil(v / 5e5) * 5e5, opts = [nice(rg.minPrice * 1.1), nice(rg.minPrice * 1.3), nice(rg.minPrice * 1.6)].filter((v, i, a) => a.indexOf(v) === i);
    opts.forEach(v => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = 'تا ' + mil(v); b.onclick = () => { st.min = ''; st.max = String(v); st.fitNext = true; syncControls(); refresh(); }; bud.append(b); });
    const c = document.createElement('button'); c.type = 'button'; c.className = 'chip'; c.textContent = 'هر قیمتی'; c.onclick = () => { st.min = ''; st.max = ''; syncControls(); refresh(); }; bud.append(c);
  }
  // تحلیل تصمیم‌یار
  const ins = $('#r-ins'), nameOf = id => { const x = X.find(y => y.id === id); return x; };
  if (!d.insight || !d.insight.picks.length) { ins.hidden = true; }
  else {
    const L = { cheapest: 'ارزان‌ترین', nearest: 'نزدیک‌ترین', balanced: 'بهترین ترکیب قیمت و فاصله' };
    const picks = d.insight.picks.map(pk => {
      const x = nameOf(pk.shop); if (!x) return '';
      let t = fa(pk.price) + ' تومان' + (pk.km != null ? ' · ' + fa1(pk.km) + ' کیلومتر' : '');
      if (pk.kind === 'nearest' && pk.extra > 0) t += ` — ${fa(pk.extra)} تومان گران‌تر از ارزان‌ترین` + (pk.kmSaved > 0 ? `، ${fa1(pk.kmSaved)} کیلومتر نزدیک‌تر` : '');
      return `<button type="button" class="pick" data-pk="${esc(x.id)}"><span class="k">${L[pk.kind]}</span><b>${esc(x.name)}</b><small>${esc(t)}</small></button>`;
    }).join('');
    const W = { closed: n => `${fa(n)} فروشگاه الان بسته‌اند`, unknown_hours: n => `ساعت کاری ${fa(n)} فروشگاه نامشخص است`, stale: n => `قیمت ${fa(n)} فروشگاه بیش از یک هفته پیش ثبت شده`, no_time: n => `زمان ثبت قیمت ${fa(n)} فروشگاه نامشخص است`, unconfirmed_stock: () => 'موجودی هیچ‌کدام تأیید نشده؛ قبل از رفتن از فروشنده بپرسید' };
    ins.innerHTML = `<h4>${icon('spark')} خلاصه برای تصمیم‌گیری</h4><div class="picks">${picks}</div><ul class="warns">${d.insight.warnings.map(w => `<li>${W[w.kind](w.n)}</li>`).join('')}</ul>`;
    ins.hidden = false; ins.querySelectorAll('[data-pk]').forEach(b => b.onclick = () => { select(b.dataset.pk); if (st.view === 'list') $('#r-list .shop.sel')?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' }); });
  }
  const f = Object.values(st.f).some(Boolean) || st.min !== '' || st.max !== '';
  $('#r-sum').innerHTML = `<span><b>${fa(X.length)}</b> فروشگاه · ${SORT_FA[st.sort]}</span><span class="ch-row"><button type="button" class="btn ghost sm" id="b-hubs">${icon('store')} پاساژهای نزدیک</button>${f ? '<button type="button" class="btn ghost sm" id="b-clr">پاک کردن فیلترها</button>' : ''}</span>`;
  $('#b-hubs').onclick = openHubs;
  const clr = $('#b-clr'); if (clr) clr.onclick = () => { st.f = { inst: 0, credit: 0, open: 0, tp: 0, kb: 0, ex: 0 }; st.min = ''; st.max = ''; st.fitNext = true; syncControls(); refresh(); };
}

/* ───────── تصمیم‌یار «الان کجا بروم؟» ───────── */
const mapDir = (lat, lng) => `https://www.google.com/maps/dir/?api=1${st && st.loc ? '&origin=' + st.loc.lat + ',' + st.loc.lng : ''}&destination=${lat},${lng}`;
const hoursShort = a => {
  const h = a.hours;
  if (h.state === 'open') return h.closeInMin != null ? 'باز · ' + fa(Math.round(h.closeInMin / 60 * 10) / 10) + ' ساعت وقت' : 'باز';
  if (h.state === 'closed') return h.next ? 'بسته · ' + PD(h.next.at) + ' باز می‌شود' : 'بسته';
  return 'ساعت نامشخص';
};
async function loadAdvice() {
  if (!box || !st.pid) return;
  const pid = st.pid, my = ++advSeq, el = $('#r-adv');
  if (!el) return;
  el.hidden = false;
  if (!el.firstChild) el.innerHTML = '<div class="sk sk-row"></div><div class="sk sk-row"></div>';
  clearTimeout(advTimer);
  advTimer = setTimeout(async () => {
    let d;
    try { d = await api('/api/advice', { pid, lat: st.loc.lat, lng: st.loc.lng, rad: Math.min(Math.max(st.rad, 1), 20), max: 30 }); }
    catch { if (my === advSeq) el.hidden = true; return; }
    if (my !== advSeq || !box || st.pid !== pid) return;
    advData = d; renderAdvice(d);
  }, 120);
}
function renderAdvice(d) {
  const el = $('#r-adv'); if (!el) return;
  const V = d.verdict, lvl = { go: 'ok', far: 'warn', closed: 'bad', none: 'bad' }[V.level] || '';
  const hub = d.hubs && d.hubs[0];
  el.innerHTML = `
   <div class="adv-h"><span class="tag ${lvl}">${V.level === 'go' ? 'همین حالا برو' : V.level === 'far' ? 'دورتر ولی باز' : V.level === 'closed' ? 'همه بسته‌اند' : 'چیزی ثبت نشده'}</span><h3>${esc(V.title)}</h3></div>
   <p class="adv-t">${esc(V.text)}</p>
   <div class="ch-row adv-acts">
     ${V.shop ? `<button type="button" class="btn sm" data-a="go">${icon('route')} مسیر و تماس</button>` : ''}
     ${hub ? `<button type="button" class="btn sm ghost" data-a="hub">${icon('pin')} ${esc(PD(hub.name))} · ${fa1(hub.km)} کیلومتر</button>` : ''}
     <button type="button" class="btn sm ghost" data-a="watch">${icon('bell')} زیر نظر بگیر</button>
     <button type="button" class="btn sm ghost" data-a="map">${icon('map')} نقشه</button>
   </div>
   ${d.openNow.length ? `<div class="adv-g"><b class="adv-lbl">باز و آماده‌ی مراجعه</b><div class="adv-grid">${d.openNow.slice(0, 3).map(a => advCard(a)).join('')}</div></div>` : ''}
   ${d.farther.length ? `<div class="adv-g"><b class="adv-lbl">دورتر، ولی همین حالا باز</b><div class="adv-grid">${d.farther.slice(0, 2).map(a => advCard(a)).join('')}</div></div>` : ''}
   ${d.closedNearby.length ? `<div class="adv-g"><b class="adv-lbl">در محدوده‌ات هست، ولی الان بسته است</b><div class="adv-chips">${d.closedNearby.slice(0, 4).map(a => `<button type="button" class="chip" data-shop="${esc(a.shop.id)}">${esc(PD(a.shop.name))} · ${PD(hoursShort(a))}</button>`).join('')}</div></div>` : ''}
   ${d.maybeShops && d.maybeShops.length ? `<div class="adv-g"><b class="adv-lbl">در ترب ثبت نکرده‌اند، ولی هم‌دسته‌اند</b><div class="adv-chips">${d.maybeShops.map(a => `<button type="button" class="chip" data-maybe="${esc(a.shop.id)}">${esc(PD(a.shop.name))} · ${fa1(a.km)} کیلومتر</button>`).join('')}</div><div class="hint">این‌ها بر اساس «دسته‌ی فعالیت» فروشگاه انتخاب شده‌اند، نه آفِر ثبت‌شده؛ ممکن است این محصول را نداشته باشند. برای همین «ممکن است» و نه «موجود».</div></div>` : ''}
   <details class="why"><summary>چه چیزی تأیید نشده است؟</summary><ul class="warns">${d.honesty.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>`;
  el.querySelectorAll('[data-shop]').forEach(b => b.onclick = () => {
    const id = b.dataset.shop;
    if (rowsCache.some(r => r.shop.id === id)) { select(id); setView('list'); box.querySelector(`.shop[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' }); }
    else toast('این فروشگاه آفِر ثبت‌شده‌ای برای این محصول ندارد.');
  });
  el.querySelectorAll('[data-maybe]').forEach(b => b.onclick = () => openMaybe(b.dataset.maybe));
  const on = (sel, fn) => { const n = el.querySelector(sel); if (n) n.onclick = fn; };
  on('[data-a=go]', () => openGo(V.shop));
  on('[data-a=watch]', () => openWatch());
  on('[data-a=hub]', () => showHubs(d.hubs));
  on('[data-a=map]', () => { setView('map'); if (mv) mv.fit([[st.loc.lat, st.loc.lng], ...d.openNow.concat(d.farther).map(a => [a.shop.lat, a.shop.lng])]); });
  el.querySelectorAll('[data-go]').forEach(b => b.onclick = () => openGo(b.dataset.go));
  el.querySelectorAll('[data-ask2]').forEach(b => b.onclick = () => openAsk(b.dataset.ask2));
}
function advCard(a) {
  const s = a.shop, o = a.offer, h = a.hours;
  const cls = h.state === 'open' ? 'ok' : h.state === 'closed' ? 'bad' : 'wn';
  return `<article class="advc">
   <div class="advc-h"><b>${esc(PD(s.name))}</b><span class="tag ${cls}">${h.state === 'open' ? 'باز' : h.state === 'closed' ? 'بسته' : 'نامشخص'}</span></div>
   <div class="advc-m">${esc(s.place ? [s.place.mall, s.place.floor, s.place.unit].filter(Boolean).map(PD).join(' · ') : (s.addr ? PD(s.addr) : 'آدرس ثبت نشده'))}</div>
   <div class="advc-f"><span class="pr">${fa(o.price)} <small>تومان</small></span><span>${fa1(a.km)} کیلومتر</span><span>~${fa(a.etaMin)} دقیقه</span></div>
   <div class="hint">${esc(a.hours.state === 'unknown' ? 'ساعت کاری نامشخص' : hoursShort(a))}</div>
   <div class="ch-row"><button type="button" class="btn sm" data-go="${esc(s.id)}">${icon('route')} برو</button><button type="button" class="btn sm ghost" data-ask2="${esc(s.id)}">${icon('chat')} بپرس</button></div>
  </article>`;
}
function openGo(id) {
  const d = advData; if (!d) return;
  const a = [...d.openNow, ...d.farther, ...d.closedNearby, ...d.unknownHours].find(x => x.shop.id === id);
  if (!a) return;
  const s = a.shop, o = a.offer;
  const w = document.createElement('div'); w.style.display = 'grid'; w.style.gap = '12px';
  w.innerHTML = `<div class="hint">${esc(PD(s.name))}${s.place && s.place.mall ? ' · ' + esc(PD(s.place.mall)) : ''}</div>
   <div class="go-grid">
     <div><b>${fa(o.price)} تومان</b><div class="hint">قیمت ثبت‌شده${o.updated ? ' · ' + ago(o.updated) : ''}</div></div>
     <div><b>${fa1(a.km)} کیلومتر</b><div class="hint">~${fa(a.etaMin)} دقیقه با خودرو</div></div>
     <div><b>${a.hours.state === 'open' ? 'باز' : a.hours.state === 'closed' ? 'بسته' : 'نامشخص'}</b><div class="hint">${esc(hoursShort(a))}</div></div>
   </div>
   ${s.place && (s.place.floor || s.place.unit) ? `<div class="hint">داخل پاساژ: ${esc([s.place.mall, s.place.floor, s.place.unit].filter(Boolean).map(PD).join(' · '))}</div>` : ''}
   <div class="ch-row">
     <a class="btn" target="_blank" rel="noopener noreferrer" href="${esc(mapDir(s.lat, s.lng))}">${icon('route')} مسیریابی</a>
     ${s.tel ? `<a class="btn ghost" href="tel:${esc(String(s.tel).replace(/[^\d+]/g, ''))}">${icon('phone')} تماس</a>` : ''}
     ${s.wa ? `<a class="btn ghost" target="_blank" rel="noopener noreferrer" href="${esc(waHref(s.wa, 'سلام، درباره‌ی «' + PD(st.product.title_fa || '') + '» می‌خواستم بپرسم موجود است؟'))}">واتساپ فروشگاه</a>` : ''}
     <button type="button" class="btn ghost" id="go-call">${icon('call')} بگذار ما تماس بگیریم</button>
     <button type="button" class="btn ghost" id="go-watch">${icon('bell')} زیر نظر بگیر</button>
   </div>
   <div class="hint">موجودی در دیتاست نیست؛ اگر همین حالا راه می‌افتی، بهتر است قبلش یک تماس/پیام کوتاه بگیری.</div>`;
  w.querySelector('#go-call').onclick = () => openCall(id);
  w.querySelector('#go-watch').onclick = () => openWatch(id);
  openDlg('رفتن به فروشگاه', w);
}
function openMaybe(id) {
  const d = advData; if (!d) return;
  const x = (d.maybeShops || []).find(m => m.shop.id === id); if (!x) return;
  const s = x.shop;
  const w = document.createElement('div'); w.style.display = 'grid'; w.style.gap = '12px';
  w.innerHTML = `<div class="hint">${esc(PD(s.name))} · ${fa1(x.km)} کیلومتر · ${x.hours.state === 'open' ? 'باز' : 'بسته/نامشخص'}</div>
   <div class="hint">دسته‌های فعالیت: ${s.cats && s.cats.length ? esc(s.cats.map(PD).join('، ')) : 'ثبت نشده'}</div>
   <div class="box-warn">این فروشگاه این محصول را در ترب ثبت نکرده است؛ «هم‌دسته بودن» یعنی ممکن است داشته باشد، نه اینکه دارد. برای همین قبل از رفتن بپرس.</div>
   <div class="ch-row">
     <a class="btn" target="_blank" rel="noopener noreferrer" href="${esc(mapDir(s.lat, s.lng))}">${icon('route')} مسیر</a>
     ${s.tel ? `<a class="btn ghost" href="tel:${esc(String(s.tel).replace(/[^\d+]/g, ''))}">${icon('phone')} تماس</a>` : ''}
     <button type="button" class="btn ghost" id="m-call">${icon('call')} بگذار ما بپرسیم</button>
   </div>`;
  w.querySelector('#m-call').onclick = () => openCall(id, 'availability', 'سلام، آیا «' + (st.product.title_fa || '') + '» را موجود دارید؟');
  openDlg('فروشگاه هم‌دسته‌ی نزدیک', w);
}

/* ───────── هشدار قیمت ───────── */
function openWatch(shopId) {
  if (!st.pid) return;
  const base = (advData && advData.cheapest && advData.cheapest.price) || (st.range && st.range.minPrice) || null;
  const guess = base ? Math.round(base * 0.95 / 1000) * 1000 : '';
  const w = document.createElement('div'); w.style.display = 'grid'; w.style.gap = '12px';
  w.innerHTML = `<div class="hint">${shopId ? 'فقط همین فروشگاه' : 'همه‌ی فروشگاه‌های این محصول در محدوده'} را زیر نظر می‌گیریم. اگر قیمت پایین بیاید یا فروشگاهی باز شود، در «پیگیری‌ها» می‌بینی.</div>
   <label class="fld"><span>سقف قیمت هدف (تومان) — اختیاری</span><input id="w-t" type="number" min="0" inputmode="numeric" value="${guess}" placeholder="مثلاً ${base || ''}"></label>
   <label class="fld"><span>شعاع (کیلومتر)</span><input id="w-r" type="number" min="1" max="100" value="${Math.min(Math.max(st.rad, 1), 40)}"></label>
   <div class="ch-row"><button type="button" class="btn" id="w-ok">${icon('bell')} ثبت هشدار</button></div>
   <div class="hint">هشدار «موجودی» نمی‌دهیم؛ موجودی در دیتاست نیست و ادعای الکی نمی‌کنیم.</div>`;
  w.querySelector('#w-ok').onclick = async () => {
    const target = +w.querySelector('#w-t').value || null, rad = +w.querySelector('#w-r').value || null;
    try {
      await post('/api/watch', { client: CLIENT, product: st.pid, shop: shopId || null, target, rad, lat: st.loc.lat, lng: st.loc.lng });
      toast('هشدار ثبت شد'); closeDlg(); refreshBadge(); openTracker('watch');
    } catch { toast('ثبت هشدار ناموفق بود.'); }
  };
  openDlg('زیر نظر گرفتن قیمت و فروشگاه', w);
}

/* ───────── «بگذار ما تماس بگیریم» ───────── */
function openCall(shopId, topic = 'availability', question = '') {
  const row = rowsCache.find(y => y.shop.id === shopId);
  const shop = row ? row.shop : (advData && [...advData.openNow, ...advData.farther, ...advData.closedNearby, ...(advData.maybeShops || [])].find(x => x.shop.id === shopId) || {}).shop;
  const name = (shop && shop.name) || 'فروشگاه';
  const w = document.createElement('div'); w.style.display = 'grid'; w.style.gap = '12px';
  w.innerHTML = `<div class="hint">${esc(PD(name))}${shop && shop.tel ? ' · ' + esc(PD(shop.tel)) : ''}</div>
   <label class="fld"><span>چه چیزی برایت بپرسیم؟</span><textarea id="c-q" maxlength="300">${esc(question || TOPIC_Q[topic] || TOPIC_Q.availability)}</textarea></label>
   <label class="fld"><span>شماره‌ی تماس شما (اختیاری)</span><input id="c-p" inputmode="tel" maxlength="20" placeholder="۰۹۱۲…"></label>
   <label class="row-chk"><input id="c-ok" type="checkbox"> <span>موافقم برای این پرسش با فروشگاه تماس گرفته شود؛ حداکثر یک‌بار در روز و فقط در ساعت کاری فروشگاه.</span></label>
   <div class="hint">${meta.features && meta.features.callWebhook ? 'درخواست به سرویس تماس سپرده می‌شود و نتیجه‌اش اینجا ثبت خواهد شد.' : 'در این نسخه تماس خودکار نداریم؛ درخواست در صف پیگیری می‌ماند و پاسخی از طرف فروشگاه ساخته نمی‌شود.'}</div>
   <div class="ch-row"><button type="button" class="btn" id="c-go">${icon('call')} ثبت درخواست تماس</button></div><div id="c-out"></div>`;
  const out = w.querySelector('#c-out');
  w.querySelector('#c-go').onclick = async () => {
    const q = w.querySelector('#c-q').value.trim(), consent = w.querySelector('#c-ok').checked;
    const phone = w.querySelector('#c-p').value.trim().replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/\s+/g, '');
    if (!consent) { out.innerHTML = '<div class="box-warn">برای تماس، رضایت لازم است. اگر نمی‌خواهی، از دکمه‌های واتساپ/تماس خودت استفاده کن.</div>'; return; }
    if (q.length < 8) { out.innerHTML = '<div class="box-warn">سؤال کوتاه است؛ کمی دقیق‌تر بنویس تا فروشگاه گیج نشود.</div>'; return; }
    try {
      const rec = await post('/api/call', { client: CLIENT, shop: shopId, product: st.pid, topic, question: q, phone: phone || null, consent: true });
      const at = rec.earliest ? new Date(rec.earliest) : null;
      out.innerHTML = `<div class="box-ok"><b>ثبت شد.</b> ${esc(rec.notice)}${at ? '<br>اولین زمان مجاز: ' + esc(at.toLocaleString('fa-IR', { timeZone: 'Asia/Tehran', dateStyle: 'short', timeStyle: 'short' })) : ''}</div>`;
      refreshBadge();
    } catch (e) {
      out.innerHTML = `<div class="box-warn">${e.status === 429 ? 'سقف درخواست‌ها پر شده؛ کمی بعد تلاش کن.' : 'ثبت درخواست ناموفق بود.'}</div>`;
    }
  };
  openDlg('بگذار ما تماس بگیریم', w);
}


/* ───────── پاساژها و بازارهای نزدیک ───────── */
async function openHubs() {
  const w = document.createElement('div'); w.style.display = 'grid'; w.style.gap = '12px';
  w.innerHTML = '<div class="hint">در حال یافتن پاساژهای نزدیک…</div>';
  openDlg('پاساژها و بازارهای نزدیک', w, true);
  try {
    const cat = st.cat && meta.cats[st.cat] ? meta.cats[st.cat].name : '';
    const d = await api('/api/hubs', { lat: st.loc.lat, lng: st.loc.lng, rad: Math.min(Math.max(st.rad, 3), 20), cat });
    const hs = d.hubs || [];
    if (!hs.length) {
      w.innerHTML = '<div class="empty"><b>در این محدوده پاساژ ثبت‌شده‌ای نیست.</b><div class="hint">«پاساژ» از آدرس ثبت‌شده‌ی فروشگاه‌ها استخراج می‌شود؛ اگر فروشگاه آن را در آدرس ننوشته باشد، اینجا نمی‌آید. شعاع را بزرگ‌تر کن یا موقعیت را روی نقشه جابه‌جا کن.</div></div>';
      return;
    }
    w.innerHTML = `<div class="hint">بر اساس «پاساژ/بازار» نوشته‌شده در آدرس فروشگاه‌ها. تعداد فروشگاه یعنی نزدیکی جغرافیایی، نه شعبه‌ی یک برند.</div>
     <div class="q-list">${hs.map((h, i) => `<div class="q-item">
      <div class="row"><b>${esc(PD(h.name))}</b><span class="tag ${h.openNow ? 'ok' : ''}">${h.openNow ? fa(h.openNow) + ' فروشگاه باز' : 'الان بسته'}</span></div>
      <div class="hint">${fa(h.shops)} فروشگاه${h.related ? ' · ' + fa(h.related) + ' هم‌دسته با این محصول' : ''} · ${fa1(h.km)} کیلومتر${h.etaMin ? ' · ~' + fa(h.etaMin) + ' دقیقه' : ''}</div>
      <div class="adv-chips">${(h.sample || []).map(s2 => `<button type="button" class="chip" data-hs="${esc(s2.id)}">${esc(PD(s2.name))} · ${esc(s2.open === 'open' ? 'باز' : s2.open === 'closed' ? 'بسته' : 'نامشخص')}</button>`).join('')}</div>
      <div class="ch-row"><button type="button" class="btn sm ghost" data-hm="${i}">${icon('map')} روی نقشه</button></div></div>`).join('')}</div>
     <div class="hint">اگر محصول در این پاساژها در ترب ثبت نشده باشد، «موجود بودن» را نمی‌توانیم بگوییم؛ فقط می‌توانی سر راه ببینی.</div>`;
    w.querySelectorAll('[data-hs]').forEach(b => b.onclick = () => {
      const id = b.dataset.hs;
      if (rowsCache.some(r => r.shop.id === id)) { closeDlg(); setView('list'); select(id); }
      else toast('این فروشگاه برای این محصول آفِر ثبت‌شده ندارد؛ برای پرسش، از دسته‌ی فعالیتش استفاده کن.');
    });
    w.querySelectorAll('[data-hm]').forEach(b => b.onclick = () => { closeDlg(); showHubs(hs); });
  } catch { w.innerHTML = '<div class="box-warn">دریافت فهرست پاساژها ناموفق بود.</div>'; }
}

/* ───────── برنامه‌ی مراجعه ───────── */
async function openTrip() {
  const ids = [...cmp]; if (ids.length < 2 || !st.pid) return;
  const w = document.createElement('div'); w.style.display = 'grid'; w.style.gap = '12px';
  w.innerHTML = '<div class="hint">در حال چیدن مسیر…</div>';
  openDlg('برنامه‌ی مراجعه', w, true);
  try {
    const d = await api('/api/trip', { pid: st.pid, shops: ids.join(','), lat: st.loc.lat, lng: st.loc.lng }, null, 15000);
    w.innerHTML = `<div class="hint">${fa(d.totalKm)} کیلومتر · ~${fa(d.totalMin)} دقیقه · ${fa(d.reachable)} ایستگاه قابل‌رسیدن</div>
     <ol class="trip">${d.steps.map((p, i) => `<li class="${p.willMakeIt ? 'ok' : 'bad'}"><span class="rank">${fa(i + 1)}</span><div><b>${esc(PD(p.name))}</b> <span class="tag ${p.willMakeIt ? 'ok' : 'bad'}">${p.willMakeIt ? 'می‌رسی' : 'می‌رسی بسته است'}</span>
      <div class="hint">${esc(p.place ? [p.place.mall, p.place.floor, p.place.unit].filter(Boolean).map(PD).join(' · ') : '')}</div>
      <div class="hint">${fa(p.price)} تومان · ${fa1(p.kmFromPrev)} کیلومتر از ایستگاه قبل · رسیدن ~${PD(p.arriveAt)} (${fa(p.travelMin)} دقیقه راه)</div>
      <div class="ch-row"><a class="btn sm ghost" target="_blank" rel="noopener noreferrer" href="${esc(mapDir(p.lat, p.lng))}">${icon('route')} مسیر</a>
      ${p.tel ? `<a class="btn sm ghost" href="tel:${esc(String(p.tel).replace(/[^\d+]/g, ''))}">${icon('phone')} تماس</a>` : ''}
      <button type="button" class="btn sm ghost" data-trip-ask="${esc(p.shop)}">${icon('chat')} بپرس</button></div></div></li>`).join('')}</ol>
     <div class="hint">${esc(d.note)}</div><div class="hint">زمان‌ها تخمینی و بر اساس خط مستقیم است؛ ساعت کاری از برنامه‌ی ثبت‌شده‌ی فروشگاه خوانده می‌شود.</div>`;
    w.querySelectorAll('[data-trip-ask]').forEach(b => b.onclick = () => openAsk(b.dataset.tripAsk));
  } catch { w.innerHTML = '<div class="box-warn">برنامه‌ریزی مسیر ناموفق بود.</div>'; }
}

function renderList(X, d) {
  const list = $('#r-list'), best = X.length ? Math.min(...X.map(x => x.price)) : 0, nearest = X.filter(x => x.km != null).sort((a, b) => a.km - b.km)[0];
  if (!X.length) {
    const alts = d.alternatives || [];
    list.innerHTML = `<div class="empty" role="status"><b>نتیجه‌ای با این شرایط پیدا نشد.</b><div class="hint" style="margin:4px 0 10px">محدوده، بودجه یا فیلترها را تغییر دهید.</div><div class="acts" style="justify-content:center">${st.rad < 40 ? '<button type="button" class="btn sm" id="e-rad">افزایش شعاع به ۴۰ کیلومتر</button>' : ''}<button type="button" class="btn ghost sm" id="e-clr">حذف فیلترها</button></div>${alts.length ? '<div class="bk" style="margin-top:12px;text-align:start"><b>جایگزین‌های نزدیک (تفاوت در یک مشخصه):</b>' + alts.map((a, i) => `<div class="bk-i"><span>${esc(PD(a.product.title_fa))}<br><span class="hint">تفاوت: ${a.diff.map(k => esc(({ color: 'رنگ', ram: 'رم', storage: 'حافظه', size: 'سایز' }[k] || k) + ' ' + PD(a.product[k]))).join('، ')} · از ${fa(a.best.offer.price)} تومان${a.best.km == null ? '' : ' · ' + fa1(a.best.km) + ' کیلومتر'}</span></span><button type="button" class="btn sm" data-alt="${i}">نمایش این محصول</button></div>`).join('') + '</div>' : ''}</div>`;
    const r = $('#e-rad'); if (r) r.onclick = () => { st.rad = 40; st.fitNext = true; syncControls(); refresh(); };
    $('#e-clr').onclick = () => { st.f = { inst: 0, credit: 0, open: 0, tp: 0, kb: 0, ex: 0 }; st.min = ''; st.max = ''; st.fitNext = true; syncControls(); refresh(); };
    list.querySelectorAll('[data-alt]').forEach(b => b.onclick = () => { const p = alts[+b.dataset.alt].product; say('نمایش ' + esc(PD(p.title_fa)), 1); results(p); });
    return;
  }
  const openAlt = x => X.find(y => y.id !== x.id && y.hs === 'open');
  list.innerHTML = X.map((x, i) => {
    const alt = x.hs !== 'open' ? openAlt(x) : null;
    const loc = x.place.length ? x.place.join(' · ') : (x.addr || 'آدرس ثبت نشده');
    const ex = [`<span class="tag ${x.inst === true ? 'ok' : ''}">اقساط: ${instTxt(x)}</span>`, `<span class="tag ${x.credit ? 'ok' : ''}" title="بر اساس سقف مبلغ و دسته‌ی همان ارائه‌دهنده">اقساط حضوری این آفر: ${x.credit ? 'بله' : 'خیر'}</span>`, tri(x.tp, '<span class="tag ok">ترب‌پی</span>', '<span class="tag">بدون ترب‌پی</span>'), tri(x.kb, '<span class="tag ok">کالابرگ</span>', ''), tri(x.ex, '<span class="tag ok">ارسال فوری</span>', ''), `<span class="tag">${esc(x.warranty)}</span>`, `<span class="tag">منبع: ${x.src}</span>`, x.ig ? `<a class="tag info" href="${esc(x.ig)}" target="_blank" rel="noopener noreferrer">اینستاگرام</a>` : '', x.web ? `<a class="tag info" href="${esc(x.web)}" target="_blank" rel="noopener noreferrer">وب‌سایت</a>` : ''].filter(Boolean).join('');
    const qd = inq[x.id + st.pid];
    return `<article class="shop${x.id === st.aid ? ' sel' : ''}" tabindex="0" role="group" aria-label="${esc(line(x))}"${x.id === st.aid ? ' aria-current="true"' : ''} style="animation-delay:${Math.min(i, 8) * 40}ms" data-id="${esc(x.id)}" data-price="${x.price}" data-km="${x.km == null ? '' : x.km}">
     <div class="shop-h"><span class="rank" aria-hidden="true">${fa(i + 1)}</span><div class="shop-t"><h4>${esc(x.name)}</h4><div class="badges">${x.price === best ? '<span class="tag ok">کمترین قیمت</span>' : ''}${nearest && nearest.id === x.id ? '<span class="tag info">نزدیک‌ترین</span>' : ''}<span class="tag ${x.hc}">${HS[x.hs][0]}</span></div></div><div class="pr"><b>${fa(x.price)}</b><small>${esc(x.unit)}</small></div></div>
     <div class="loc">${icon('pin')}<span>${esc(loc)}${x.place.length && x.addr ? `<span class="addr">${esc(x.addr)}</span>` : ''}</span></div>
     <ul class="facts"><li>${icon('route')}<span>${esc(x.kmTxt)}${x.etaMin ? ' · ~' + fa(x.etaMin) + ' دقیقه' : ''}<span class="rt" data-rt="${esc(x.id)}"></span></span></li><li>${icon('clock')}<span class="${x.hc}">${esc(x.hoursTxt)}</span></li><li>${icon('clock')}<span class="${x.ac}">${esc(x.ageTxt)}</span></li><li class="wn">؟ ${x.avail}</li></ul>
     <div class="extras">${ex}</div>
     ${alt ? `<div class="alt-hint"><span>${x.hs === 'closed' ? 'این فروشگاه الان بسته است.' : 'ساعت کاری این فروشگاه نامشخص است.'} جایگزین باز: <b>${esc(alt.name)}</b> · ${fa(alt.price)} تومان${alt.km != null ? ' · ' + fa1(alt.km) + ' کیلومتر' : ''}</span><button type="button" class="btn sm ghost" data-act="sel" data-id="${esc(alt.id)}">نمایش</button></div>` : ''}
     <details class="why"><summary>چرا این پیشنهاد؟</summary><p>${x.price === best ? 'کمترین قیمت ثبت‌شده؛ ' : ''}${nearest && nearest.id === x.id ? 'نزدیک‌ترین فروشگاه؛ ' : ''}امتیاز ترکیبی ${fa(x.score)} (قیمت نسبی + ۰٫۰۳×کیلومتر؛ کمتر بهتر است).${x.seller ? '<br>عنوان فروشنده: ' + esc(x.seller) : ''}${x.desc ? '<br>توضیح فروشنده: ' + esc(x.desc.slice(0, 200)) : ''}</p></details>
     <div class="acts"><button type="button" class="btn grow" data-act="ask">${icon('chat')} پرسش از فروشنده</button>${x.hasLoc ? `<a class="btn ghost" target="_blank" rel="noopener noreferrer" href="${esc(dirHref(x))}">${icon('route')} مسیریابی</a><button type="button" class="btn ghost" data-act="map">${icon('map')} نقشه</button>` : ''}${x.tel ? `<a class="btn ghost" href="${esc(telHref(x.tel))}">${icon('phone')} تماس</a>` : ''}<button type="button" class="btn ghost" data-act="watch">${icon('bell')} زیر نظر</button><label class="cmp-l"><input type="checkbox" data-c="${esc(x.id)}" ${cmp.has(x.id) ? 'checked' : ''}> مقایسه</label>${qd ? `<span class="tag ${ST_CLS[qd.status]}">${ST_FA[qd.status]}</span>` : ''}</div>
    </article>`;
  }).join('');
}
function renderMap(X) {
  if (!mv) return;
  mv.setUser(st.loc, st.rad);
  mv.setShops(X.filter(x => x.hasLoc).map(x => ({ id: x.id, lat: x.lat, lng: x.lng, label: fa(x.i + 1), title: line(x), tip: x.name + ' · ' + fa(x.price) + ' تومان · ' + x.hoursTxt, state: x.hs })), st.aid);
  if (mhubs.length) mv.setHubs(mhubs);
  if (st.fitNext) { st.fitNext = false; mv.fit([[st.loc.lat, st.loc.lng], ...X.filter(x => x.hasLoc).slice(0, 25).map(x => [x.lat, x.lng])]); }
  mv.invalidate();
}
let mhubs = [];
function showHubs(hubs) {
  mhubs = (hubs || []).slice(0, 6);
  if (mv) { mv.setHubs(mhubs); if (mhubs.length) mv.fit(mhubs.map(h => [h.lat, h.lng]).concat([[st.loc.lat, st.loc.lng]])); }
  setView('map');
  if (!mhubs.length) toast('پاساژ ثبت‌شده‌ای در این محدوده پیدا نشد.');
}
function select(id, o = {}) {
  if (!box) return; const x = rowsCache.map(info).find(y => y.id === id); if (!x) return;
  st.aid = id;
  box.querySelectorAll('.shop').forEach(c => { const on = c.dataset.id === id; c.classList.toggle('sel', on); on ? c.setAttribute('aria-current', 'true') : c.removeAttribute('aria-current'); });
  renderMap(rowsCache.map(info)); updateRoute();
  if (o.fromMap) { const c = box.querySelector(`.shop[data-id="${CSS.escape(id)}"]`); if (c && st.view === 'list') c.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' }); }
  else if (mv && x.hasLoc) mv.panTo(x.lat, x.lng);
}
async function updateRoute() {
  if (!box) return; const chip = $('#r-chip'), x = rowsCache.map(info).find(y => y.id === st.aid), tok = ++routeTok;
  if (!x || !x.hasLoc || !mv) { if (chip) chip.hidden = true; mv && mv.setRoute(null); return; }
  const from = st.loc, to = { lat: x.lat, lng: x.lng };
  const show = (txt, extra) => { chip.hidden = false; chip.innerHTML = `${esc(x.name)} · ${esc(txt)} <button type="button" class="btn sm ghost" id="b-det" style="margin-inline-start:6px;min-height:30px">جزئیات</button>`; $('#b-det').onclick = () => { setView('list'); box.querySelector(`.shop[data-id="${CSS.escape(x.id)}"]`)?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' }); }; if (extra) { const s = box.querySelector(`[data-rt="${CSS.escape(x.id)}"]`); if (s) s.textContent = extra; } };
  mv.setRoute({ from, to, kind: 'straight' }); show(x.km == null ? 'فاصله نامشخص' : fa1(x.km) + ' کیلومتر (خط مستقیم)');
  if (!meta.map || !meta.map.routing) return;
  const key = [from.lat, from.lng, to.lat, to.lng].map(v => v.toFixed(4)).join(','); let r = routeCache.get(key);
  if (!r) { try { r = await api('/api/route', { lat: from.lat, lng: from.lng, slat: to.lat, slng: to.lng }, null, 6000); routeCache.set(key, r); } catch { return; } }
  if (tok !== routeTok || !box || r.kind !== 'driving') return;
  mv.setRoute({ line: r.polyline, kind: 'driving' }); show(`${fa1(r.km)} کیلومتر · حدود ${fa(r.minutes)} دقیقه با خودرو`, ` · حدود ${fa(r.minutes)} دقیقه با خودرو`);
}
function cmpBar() { const b = $('#r-cmp'); if (!b) return; b.hidden = cmp.size < 2; $('#r-cmp-t').textContent = fa(cmp.size) + ' فروشگاه برای مقایسه انتخاب شده'; }

/* ───────── مقایسه ───────── */
function openCompare() {
  const R = rowsCache.map(info).filter(x => cmp.has(x.id)); if (R.length < 2) return;
  const minP = Math.min(...R.map(x => x.price)), kms = R.filter(x => x.km != null).map(x => x.km), minK = kms.length ? Math.min(...kms) : null;
  const rows = [['قیمت', x => fa(x.price) + ' ' + x.unit, x => x.price === minP], ['فاصله', x => x.kmTxt, x => minK != null && x.km === minK], ['وضعیت الان', x => x.hoursTxt, x => x.hs === 'open'], ['نشانی', x => x.place.length ? x.place.join(' · ') : x.addr || '—'], ['اقساط', instTxt], ['ترب‌پی', x => tri(x.tp, 'دارد', 'ندارد') || 'نامشخص'], ['کالابرگ', x => tri(x.kb, 'پشتیبانی می‌شود', 'پشتیبانی نمی‌شود') || 'نامشخص'], ['ارسال فوری', x => tri(x.ex, 'دارد', 'ندارد') || 'نامشخص'], ['گارانتی', x => x.warranty], ['زمان ثبت قیمت', x => x.ageTxt.replace('قیمت ثبت‌شده ', '')], ['موجودی', x => x.avail]];
  const w = document.createElement('div');
  w.innerHTML = `<div class="tbl-w"><table class="cmp"><caption class="hint" style="text-align:start;padding:6px 10px">سبز = بهترین در آن ردیف</caption><thead><tr><th></th>${R.map(x => `<th scope="col">${esc(x.name)}</th>`).join('')}</tr></thead><tbody>${rows.map(([l, f, best]) => `<tr><th scope="row">${l}</th>${R.map(x => `<td class="${best && best(x) ? 'best' : ''}">${esc(f(x))}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="ch-row">${R.map(x => `<button type="button" class="btn sm" data-ask="${esc(x.id)}">${icon('chat')} پرسش از ${esc(x.name)}</button>`).join('')}</div>`;
  w.querySelectorAll('[data-ask]').forEach(b => b.onclick = () => openAsk(b.dataset.ask));
  openDlg('مقایسه فروشگاه‌ها', w, true);
}

/* ───────── پرسش از فروشنده و پیگیری ───────── */
function draft(x, topic) {
  const p = st.product, spec = specOf(p).map(([l, v]) => l + ' ' + v).join('، ');
  return `سلام، وقت بخیر.\nمحصول «${PD(p.title_fa || p.model)}»${spec ? ' (' + spec + ')' : ''} را با قیمت ثبت‌شده ${fa(x.price)} تومان برای فروشگاه شما در ترب دیده‌ام.\n${TOPIC_Q[topic]}\nممنون.`;
}
function openAsk(id) {
  const r = rowsCache.find(y => y.shop.id === id); if (!r) return; const x = info(r, rowsCache.indexOf(r)), pid = st.pid;
  let topic = 'availability';
  const w = document.createElement('div'); w.style.display = 'grid'; w.style.gap = '12px';
  w.innerHTML = `<div class="hint">درباره‌ی «${esc(PD(st.product.title_fa || st.product.model))}» از «${esc(x.name)}»${x.place.length ? ' (' + esc(x.place.join(' · ')) + ')' : ''}</div>
   <div class="ch-row" role="group" aria-label="موضوع پرسش">${['availability', 'price', 'hours', 'installment'].map(t => `<button type="button" class="chip" data-tp="${t}" aria-pressed="${t === topic}">${TOPIC_FA[t]}</button>`).join('')}</div>
   <label class="fld"><span>متن پیام (قابل ویرایش)</span><textarea id="ask-msg" maxlength="500"></textarea></label>
   <div class="hint">پیام از دستگاه خودتان (واتساپ/تماس) ارسال می‌شود؛ ما آن را برای پیگیری ثبت می‌کنیم و پاسخی از طرف فروشنده نمی‌سازیم. اگر پاسخ ندادند، جایگزین‌ها را نشان می‌دهیم.</div>
   <div class="ch-row" id="ask-ch"></div><div id="ask-step2"></div>`;
  const ta = w.querySelector('#ask-msg'); ta.value = draft(x, topic);
  w.querySelectorAll('[data-tp]').forEach(b => b.onclick = () => { topic = b.dataset.tp; w.querySelectorAll('[data-tp]').forEach(c => c.setAttribute('aria-pressed', c === b ? 'true' : 'false')); ta.value = draft(x, topic); });
  const ch = w.querySelector('#ask-ch');
  const commit = async channel => {
    const msg = ta.value.trim().slice(0, 500);
    try {
      const rec = await post('/api/inquiry', { client: CLIENT, shop: id, product: pid, topic, channel, message: msg, lat: st.loc.lat, lng: st.loc.lng, rad: st.rad });
      inq[id + pid] = rec; refreshBadge(); if (box && st.pid === pid) renderList(rowsCache.map(info), { alternatives: [] }); step2(w, rec, x); toast(ST_FA[rec.status]);
    } catch { toast('ثبت پرسش ناموفق بود؛ دوباره تلاش کنید.'); }
  };
  const btn = (ic, t, fn, cls = '') => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + cls; b.innerHTML = icon(ic) + ' ' + t; b.onclick = fn; ch.append(b); };
  const wa = x.wa && waHref(x.wa, ''), tel = x.tel;
  if (wa) btn('chat', 'ارسال با واتساپ', () => { window.open(waHref(x.wa, ta.value.trim()), '_blank', 'noopener'); commit('whatsapp'); });
  if (tel) btn('phone', 'تماس تلفنی', () => { commit('phone'); location.href = telHref(tel); }, wa ? 'ghost' : '');
  btn('copy', 'کپی متن پیام', async () => { try { await navigator.clipboard.writeText(ta.value); toast('متن کپی شد'); } catch { ta.select(); toast('متن را دستی کپی کنید'); } commit('copy'); }, 'ghost');
  btn('call', 'بگذار ما تماس بگیریم', () => { closeDlg(); openCall(id, topic, ta.value.trim()); }, 'ghost');
  if (!wa && !tel) { const n = document.createElement('div'); n.className = 'hint'; n.textContent = 'راه ارتباطی منتشرشده‌ای برای این فروشگاه ثبت نشده است؛ متن را کپی کنید یا مستقیم مراجعه کنید.'; w.querySelector('#ask-ch').after(n); }
  openDlg('پرسش از فروشنده', w);
}
function backupsView(backs, fromId) {
  if (!backs || !backs.length) return '';
  const items = backs.map((r, i) => info(r, i));
  return `<div class="bk"><b>فروشگاه‌های جایگزین برای همین محصول</b>${items.map(y => `<div class="bk-i"><span><b>${esc(y.name)}</b> · ${fa(y.price)} تومان<br><span class="hint">${esc(y.kmTxt)} · <span class="${y.hc}">${esc(y.hoursTxt)}</span></span></span><span class="ch-row"><button type="button" class="btn sm ghost" data-bk-sel="${esc(y.id)}">نمایش</button><button type="button" class="btn sm" data-bk-ask="${esc(y.id)}">پرسش</button></span></div>`).join('')}</div>`;
}
function step2(w, rec, x) {
  const s = w.querySelector('#ask-step2');
  const note = rec.status === 'pending' ? 'پیام از دستگاه شما باز شد؛ پس از دریافت پاسخ، نتیجه را اینجا ثبت کنید.' : 'پیام ارسال نشد (فقط ثبت شد). هر زمان از فروشنده پاسخ گرفتید، نتیجه را ثبت کنید.';
  s.innerHTML = `<hr style="border:0;border-top:1px solid var(--line);width:100%"><div><span class="tag ${ST_CLS[rec.status]}" id="st-tag">${ST_FA[rec.status]}</span> <span class="hint">${note}</span></div>
   <div class="fld"><span>پاسخ فروشنده چه بود؟</span><div class="ch-row"><button type="button" class="btn sm" data-r="in_stock">${icon('check')} موجود است</button><button type="button" class="btn sm ghost" data-r="out_of_stock">ناموجود است</button><button type="button" class="btn sm ghost" data-r="none">پاسخ نداد / بسته بود</button></div></div>
   <div id="bk-box">${backupsView(rec.backups)}</div>`;
  const wire = () => { s.querySelectorAll('[data-bk-sel]').forEach(b => b.onclick = () => { closeDlg(); select(b.dataset.bkSel); setView('list'); box.querySelector(`.shop[data-id="${CSS.escape(b.dataset.bkSel)}"]`)?.scrollIntoView({ block: 'center' }); }); s.querySelectorAll('[data-bk-ask]').forEach(b => b.onclick = () => openAsk(b.dataset.bkAsk)); };
  wire();
  s.querySelectorAll('[data-r]').forEach(b => b.onclick = async () => {
    const v = b.dataset.r, body = { client: CLIENT, id: rec.id, status: v === 'none' ? 'failed' : 'answered', availability: v === 'none' ? 'unknown' : v };
    try {
      const u = await post('/api/inquiry/update', body); inq[rec.shop + rec.product] = { ...inq[rec.shop + rec.product], status: u.status }; refreshBadge();
      const t = s.querySelector('#st-tag'); t.className = 'tag ' + ST_CLS[u.status]; t.textContent = ST_FA[u.status] + (u.availability ? ' · ' + AV_FA[u.availability] : '');
      if (box && st.pid === rec.product) renderList(rowsCache.map(info), { alternatives: [] });
      if (v === 'in_stock') { toast('ثبت شد؛ موفق باشید!'); } else { toast('جایگزین‌ها را پایین ببینید'); s.querySelector('#bk-box').scrollIntoView({ block: 'nearest' }); }
    } catch { toast('ثبت پاسخ ناموفق بود.'); }
  });
}

const CALL_ST_FA = { queued: 'در صف تماس', sent: 'به سرویس تماس سپرده شد', answered: 'پاسخ ثبت شد', cancelled: 'لغو شد', failed: 'ناموفق' };
const CALL_ST_CLS = { queued: 'info', sent: 'info', answered: 'ok', cancelled: '', failed: 'bad' };
async function refreshBadge() {
  const b = $('#trk-n');
  try {
    const [q, w, c] = await Promise.all([
      api('/api/inquiries', { client: CLIENT }).catch(() => ({ items: [] })),
      api('/api/watches', { client: CLIENT }).catch(() => ({ items: [] })),
      api('/api/calls', { client: CLIENT }).catch(() => ({ items: [] }))
    ]);
    const n = q.items.filter(i => i.status === 'pending' || i.status === 'not_sent').length
      + w.items.filter(x => x.changed || x.targetHit).length
      + c.items.filter(x => x.status === 'queued' || x.status === 'sent').length;
    b.hidden = !n; b.textContent = n > 9 ? '۹+' : fa(n);
    return { inquiries: q.items, watches: w.items, calls: c.items };
  } catch { b.hidden = true; return { inquiries: [], watches: [], calls: [] }; }
}
async function openTracker(tab) {
  const body = openDlg('پیگیری‌ها', '<div class="hint">در حال دریافت…</div>', true);
  let cur = tab || 'inq';
  const render = async () => {
    const d = await refreshBadge();
    const T = [['inq', 'پرسش‌ها', d.inquiries.length], ['watch', 'هشدار قیمت', d.watches.length], ['call', 'درخواست تماس', d.calls.length]];
    let html = `<div class="tabs" style="padding:0"><div class="seg" role="tablist">${T.map(([k, t, n]) => `<button type="button" role="tab" data-tb="${k}" aria-selected="${cur === k}">${t}${n ? ' <span class="tag">' + fa(n) + '</span>' : ''}</button>`).join('')}</div></div>`;
    if (cur === 'inq') html += inqView(d.inquiries);
    else if (cur === 'watch') html += watchView2(d.watches);
    else html += callView2(d.calls);
    body.innerHTML = html;
    body.querySelectorAll('[data-tb]').forEach(b => b.onclick = () => { cur = b.dataset.tb; render(); });
    body.querySelectorAll('[data-u]').forEach(b => b.onclick = async () => {
      const id = +b.closest('.q-item').dataset.id, v = b.dataset.u;
      try { await post('/api/inquiry/update', { client: CLIENT, id, status: v === 'none' ? 'failed' : 'answered', availability: v === 'none' ? 'unknown' : v }); toast('ثبت شد'); render(); } catch { toast('ثبت ناموفق بود.'); }
    });
    body.querySelectorAll('[data-cu]').forEach(b => b.onclick = async () => {
      const id = +b.closest('.q-item').dataset.id, st2 = b.dataset.cu;
      try {
        await post('/api/call/update', { client: CLIENT, id, status: st2, ...(st2 === 'answered' ? { availability: b.dataset.av || 'unknown' } : {}) });
        toast('ثبت شد'); render();
      } catch { toast('ثبت ناموفق بود.'); }
    });
    body.querySelectorAll('[data-unwatch]').forEach(b => b.onclick = async () => {
      try { await api('/api/watch', { client: CLIENT, id: b.dataset.unwatch }, { method: 'DELETE' }); toast('هشدار حذف شد'); render(); } catch { toast('حذف ناموفق بود.'); }
    });
  };
  render();
}
function inqView(items) {
  if (!items.length) return '<div class="empty"><b>هنوز پرسشی ثبت نکرده‌اید.</b><div class="hint">از کارت هر فروشگاه «پرسش از فروشنده» را بزنید؛ اینجا می‌توانید وضعیت و پاسخ را پیگیری کنید.</div></div>';
  return `<div class="q-list">${items.map(i => `<div class="q-item" data-id="${i.id}"><div class="row"><b>${esc(PD(i.shopName || i.shop))}</b><span><span class="tag ${ST_CLS[i.status]}">${ST_FA[i.status]}</span>${i.availability ? ` <span class="tag">${AV_FA[i.availability]}</span>` : ''}</span></div><div class="hint">${esc(PD(i.productTitle || i.product))} · موضوع: ${TOPIC_FA[i.topic] || ''} · ${esc(ago(i.created))}</div>${i.message ? `<div class="hint" style="white-space:pre-line">${esc(i.message)}</div>` : ''}${i.status === 'answered' || i.status === 'failed' ? '' : `<div class="ch-row"><button type="button" class="btn sm" data-u="in_stock">موجود است</button><button type="button" class="btn sm ghost" data-u="out_of_stock">ناموجود است</button><button type="button" class="btn sm ghost" data-u="none">بی‌پاسخ ماند</button></div>`}</div>`).join('')}</div>`;
}
function watchView2(items) {
  if (!items.length) return '<div class="empty"><b>هشداری ثبت نشده.</b><div class="hint">در کارت نتایج «زیر نظر» را بزنید تا قیمت هدف یا باز شدن فروشگاه را رصد کنیم.</div></div>';
  return `<div class="q-list">${items.map(w => {
    const b = w.best;
    return `<div class="q-item"><div class="row"><b>${esc(PD(w.productTitle || w.product))}</b><span>${w.targetHit ? '<span class="tag ok">به قیمت هدف رسید</span>' : w.changed ? '<span class="tag warn">تغییر کرده</span>' : '<span class="tag">بدون تغییر</span>'}</span></div>
     <div class="hint">${w.shop ? 'فقط فروشگاه ' + esc(PD((b && b.name) || w.shop)) : 'همه‌ی فروشگاه‌ها'}${w.target ? ' · هدف: ' + fa(w.target) + ' تومان' : ''}${w.rad ? ' · شعاع ' + fa(w.rad) + ' کیلومتر' : ''}</div>
     ${b ? `<div class="hint">الان: ${fa(b.price)} تومان · ${esc(PD(b.name))}${b.km != null ? ' · ' + fa1(b.km) + ' کیلومتر' : ''}${b.open ? ' · ' + (b.open === 'open' ? 'باز' : b.open === 'closed' ? 'بسته' : 'ساعت نامشخص') : ''}</div>` : '<div class="hint">فعلاً آفِر فعالی برای این محصول نیست.</div>'}
     <div class="ch-row"><button type="button" class="btn sm ghost" data-unwatch="${w.id}">حذف هشدار</button></div></div>`;
  }).join('')}</div>`;
}
function callView2(items) {
  if (!items.length) return '<div class="empty"><b>درخواست تماسی ثبت نشده.</b><div class="hint">از کارت فروشگاه یا دیالوگ «رفتن به فروشگاه» می‌توانید بخواهید ما سؤالتان را بپرسیم. بدون رضایت شما هیچ تماسی گرفته نمی‌شود.</div></div>';
  return `<div class="q-list">${items.map(c => `<div class="q-item" data-id="${c.id}"><div class="row"><b>${esc(PD(c.shopName || c.shop))}</b><span class="tag ${CALL_ST_CLS[c.status] || ''}">${CALL_ST_FA[c.status] || c.status}</span></div>
   <div class="hint">${esc(PD(c.productTitle || c.product))} · موضوع: ${TOPIC_FA[c.topic] || ''} · ${esc(ago(c.created))}</div>
   <div class="hint" style="white-space:pre-line">${esc(c.question || '')}</div>
   ${c.earliest ? `<div class="hint">اولین زمان مجاز: ${esc(new Date(c.earliest).toLocaleString('fa-IR', { timeZone: 'Asia/Tehran', dateStyle: 'short', timeStyle: 'short' }))}</div>` : ''}
   ${c.answer ? `<div class="hint"><b>پاسخ ثبت‌شده:</b> ${esc(c.answer)}</div>` : ''}
   ${c.status === 'answered' || c.status === 'cancelled' || c.status === 'failed' ? '' : `<div class="ch-row"><button type="button" class="btn sm" data-cu="answered" data-av="in_stock">پاسخ: موجود است</button><button type="button" class="btn sm ghost" data-cu="answered" data-av="out_of_stock">پاسخ: ناموجود</button><button type="button" class="btn sm ghost" data-cu="cancelled">لغو درخواست</button></div>`}</div>`).join('')}</div>`;
}
$('#trk').onclick = () => openTracker();

/* ───────── موقعیت‌یابی ───────── */
function geo() {
  if (!navigator.geolocation) return toast('مرورگر از موقعیت‌یابی پشتیبانی نمی‌کند؛ موقعیت را از فهرست یا نقشه انتخاب کنید.');
  navigator.geolocation.getCurrentPosition(p => { st.loc = { lat: p.coords.latitude, lng: p.coords.longitude }; st.locSrc = 'gps'; st.fitNext = true; toast('موقعیت شما دریافت شد.'); if (st.pid && box) { syncControls(); refresh(); } },
    e => toast(e.code === 1 ? 'دسترسی به موقعیت رد شد؛ از فهرست «موقعیت» یا نقشه استفاده کنید.' : 'موقعیت‌یابی ناموفق بود؛ از موقعیت فعلی استفاده می‌شود.'), { timeout: 8000, enableHighAccuracy: false });
}
$('#gp').onclick = geo; $('#rs').onclick = start;
$('#composer').onsubmit = e => { e.preventDefault(); const i = $('#q'), v = i.value.trim().slice(0, 200); if (v.length > 1) { i.value = ''; i.blur(); txt(v); } };
start();
})();
