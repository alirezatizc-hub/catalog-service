'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const { Index } = require('./src/engine');
const { loadDir, createBuilder, loadMapping } = require('./src/data/loader');
const db = require('./src/db'), llm = require('./src/llm'), geo = require('./src/geo'), nlu = require('./src/nlu');
const { buildInsight } = require('./src/insight');
const { advise, planTrip, hubsOf, etaOf } = require('./src/advice');
const { diagnose } = require('./src/diagnose');

const PUB = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.css': 'text/css;charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg']);
const STATUSES = ['not_sent', 'pending', 'answered', 'failed'];
const TOPICS = ['price', 'availability', 'hours', 'terms', 'installment'];
const CHANNELS = ['whatsapp', 'phone', 'bale', 'copy', 'none'];
const AVAIL = ['in_stock', 'out_of_stock', 'unknown'];
const CALL_STATUS = ['queued', 'sent', 'answered', 'cancelled', 'failed'];
const CSP = "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

const num = (v, lo, hi) => { if (v == null || v === '') return undefined; const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : NaN; };
const clientOk = c => typeof c === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(c);
const key = k => /^[a-z_0-9]{1,20}$/.test(k || '');
const text = (v, n) => typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f<>]/g, ' ').trim().slice(0, n) : null;

// محدودیت نرخ ساده در حافظه (برای مسیرهای پرهزینه: مدل زبانی، مسیریابی، درخواست تماس)
const hits = new Map();
function limited(ip, bucket, max, windowMs = 60000) {
  const k = bucket + ip, now = Date.now(), a = (hits.get(k) || []).filter(t => now - t < windowMs);
  if (a.length >= max) { hits.set(k, a); return true; }
  a.push(now); hits.set(k, a);
  if (hits.size > 5000) hits.clear();
  return false;
}
function readJSON(q, limit = 2e4) {
  return new Promise((resolve, reject) => {
    let b = '', over = false;
    q.on('data', c => { b += c; if (b.length > limit) { over = true; q.destroy(); } });
    q.on('end', () => { if (over) return reject(new Error('too_large')); try { resolve(JSON.parse(b || 'null')); } catch { reject(new Error('bad_json')); } });
    q.on('error', () => reject(new Error('bad_json')));
  });
}

const gz = new Map();
const secHeaders = () => ({ 'content-security-policy': CSP, 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin', 'permissions-policy': 'geolocation=(self)' });
function jsonOut(r, c, o) {
  let body = Buffer.from(JSON.stringify(o));
  const h = { 'content-type': 'application/json;charset=utf-8', 'cache-control': 'no-store', ...secHeaders() };
  if (body.length > 1024 && /\bgzip\b/.test(r.req && r.req.headers['accept-encoding'] || '')) {
    body = zlib.gzipSync(body); h['content-encoding'] = 'gzip'; h.vary = 'accept-encoding';
  }
  r.writeHead(c, h); r.end(body);
}
function htmlOut(r, c, html) {
  r.writeHead(c, { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'no-store', ...secHeaders() });
  r.end(html);
}
// صفحه‌ی /doctor: همان گزارش JSON، به‌صورت خوانا و بدون هیچ رمزی
function doctorPage(d) {
  const E = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = { pass: ['✅', 'ok'], fail: ['❌', 'bad'], warn: ['⚠️', 'warn'] };
  const rows = (d.checks || []).map(c => {
    const [ic, cls] = T[c.status] || ['•', ''];
    return `<li class="chk"><div class="row"><span class="tag ${cls}">${ic} ${E(c.label)}</span></div>
     ${c.detail ? `<div class="hint">${E(c.detail)}</div>` : ''}
     ${c.hint ? `<div class="box-warn">${E(c.hint)}</div>` : ''}</li>`;
  }).join('');
  const steps = (d.nextSteps || []).map(x => `<li>${E(x)}</li>`).join('');
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>عیب‌یابی اتصال و دیتاست — ترب‌یار</title>
  <link rel="stylesheet" href="/app.css"></head><body class="doctor">
  <main class="wrap">
    <h1>${d.ok ? '✅ همه‌چیز آماده است' : '❌ هنوز آماده نیست'}</h1>
    <p class="hint">زمان بررسی: ${E(new Date(d.at || Date.now()).toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' }))} · منبع: ${E(d.source || '—')} · آماده: ${d.ready ? 'بله' : 'خیر'}</p>
    <ol class="chks">${rows || '<li class="chk">بررسی‌ای اجرا نشد.</li>'}</ol>
    ${steps ? `<h2>قدم بعدی</h2><ul class="warns">${steps}</ul>` : ''}
    <div class="ch-row"><a class="btn" href="/">بازگشت به اپ</a><a class="btn ghost" href="/doctor?ai=1">تست اتصال هوش مصنوعی</a><a class="btn ghost" href="/api/diagnose">همین گزارش به‌صورت JSON</a><a class="btn ghost" href="/api/status">/api/status</a></div>
    <p class="hint">هیچ رمز یا رشته‌ی اتصالی در این صفحه نمایش داده نمی‌شود؛ فقط نام متغیرها و نتیجه‌ی بررسی‌ها.</p>
  </main></body></html>`;
}
function serveStatic(req, r, p) {
  const f = path.resolve(PUB, '.' + (p === '/' ? '/index.html' : decodeURIComponent(p)));
  if (!f.startsWith(PUB + path.sep)) return jsonOut(r, 403, { error: 'forbidden' });
  fs.readFile(f, (e, d) => {
    if (e) return jsonOut(r, 404, { error: 'not_found' });
    const ext = path.extname(f), h = { 'content-type': TYPES[ext] || 'application/octet-stream', ...secHeaders() };
    h['cache-control'] = ext === '.html' ? 'no-cache' : (ext === '.woff2' || f.includes(path.sep + 'vendor' + path.sep)) ? 'public, max-age=31536000, immutable' : 'public, max-age=300';
    if (COMPRESSIBLE.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      let z = gz.get(f);
      if (!z || z.len !== d.length) { z = { len: d.length, buf: zlib.gzipSync(d) }; gz.set(f, z); }
      h['content-encoding'] = 'gzip'; h.vary = 'accept-encoding';
      r.writeHead(200, h); return r.end(z.buf);
    }
    r.writeHead(200, h); r.end(d);
  });
}

/* ───────── تقویم و ساعت کاری برای صف تماس ───────── */
const TEHRAN_OFFSET = 3.5 * 3600e3;
const dayStartTehran = d => Math.floor((d.getTime() + TEHRAN_OFFSET) / 864e5) * 864e5 - TEHRAN_OFFSET;
const atTehran = (dayStart, m) => new Date((dayStart instanceof Date ? dayStart.getTime() : Number(dayStart)) + m * 60000);
const CALL_WINDOW = [9 * 60, 21 * 60]; // تماس فقط ۹ صبح تا ۹ شب تهران
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
function nextOpening(shop, from) {
  const base = new Date(dayStartTehran(from));
  for (let d = 0; d < 8; d++) {
    const day = new Date(base.getTime() + d * 864e5);
    const wd = new Date(day.getTime() + TEHRAN_OFFSET).getUTCDay();
    const h = shop && Array.isArray(shop.hours) ? shop.hours[wd] : undefined;
    const shifts = Array.isArray(h) && h.length && Array.isArray(h[0]) ? h : (Array.isArray(h) ? [h] : []);
    for (const sh of shifts) {
      if (!Array.isArray(sh) || sh.length !== 2) continue;
      const start = Math.round(sh[0] * 60), end = Math.round(sh[1] * 60);
      if (start === end) continue;
      const at = atTehran(day, start);
      if (at.getTime() <= from.getTime() + 60000) continue;
      const windowStart = Math.max(start, CALL_WINDOW[0]);
      if (windowStart >= Math.min(end > start ? end : 1440, CALL_WINDOW[1])) continue;
      return atTehran(day, windowStart);
    }
  }
  return atTehran(new Date(base.getTime() + 864e5), CALL_WINDOW[0]);
}

/* ───────── ساخت سرور ───────── */
function createServer(initialData, opts = {}) {
  const state = {
    data: initialData || null,
    ix: initialData ? new Index(initialData) : null,
    ready: !!initialData,
    loading: !!opts.loading,
    error: opts.error || null,
    source: opts.source || (initialData ? 'files' : 'none'),
    store: opts.store || db.memoryStore(),
    dbInfo: opts.dbInfo || null,
    loadedAt: initialData ? Date.now() : null,
    startedAt: Date.now()
  };
  if (state.ix && state.data) state.ix.registry = state.data.registry;
  const send = jsonOut;
  const notReady = r => send(r, 503, { error: 'loading_dataset', ready: false, detail: state.error || 'دیتاست در حال بارگذاری است' });

  function ixOrNull() { return state.ix; }
  function catsOf() { return (state.ix && state.ix.registry && state.ix.registry.cats) || {}; }

  function clientLoc(g) {
    const lat = num(g('lat'), -90, 90), lng = num(g('lng'), -180, 180);
    return { loc: Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null, bad: Number.isNaN(lat) || Number.isNaN(lng) };
  }

  function meta() {
    const m = geo.mapConfig(), cats = catsOf();
    return {
      ready: state.ready, loading: !!state.loading, source: state.source, cats,
      catCount: Object.keys(cats).length,
      counts: state.data ? { products: state.ix.P.size, shops: state.ix.S.size, offers: state.data.offers.length } : { products: 0, shops: 0, offers: 0 },
      statuses: STATUSES, topics: TOPICS, channels: CHANNELS,
      map: m, mapProvider: m.provider, routing: m.routing,
      ai: llm.enabled(), aiInfo: llm.info(), db: state.store.kind,
      dataOk: !!(state.data && state.data.report && state.data.report.ok),
      report: state.data ? state.data.report : null,
      dataset: state.dbInfo || null,
      eta: { mode: require('./src/advice').ETA_KIND, source: 'straight_line' },
      features: { advice: true, hubs: true, trip: true, watches: true, callRequests: true, callWebhook: !!process.env.CALL_WEBHOOK_URL, inquiries: true, routing: m.routing }
    };
  }

  async function handle(q, r) {
    const u = new URL(q.url, 'http://x'), g = k => u.searchParams.get(k), p = u.pathname, ip = q.socket.remoteAddress || '';
    r.req = q;
    if (q.method === 'HEAD' && !p.startsWith('/api/')) return send(r, 200, { ok: true });

    if (p === '/api/health' || p === '/healthz') {
      return send(r, 200, {
        ok: state.ready && !state.error, ready: state.ready, loading: state.loading, source: state.source,
        db: state.store.kind, counts: state.data ? { products: state.ix.P.size, shops: state.ix.S.size, offers: state.data.offers.length } : null,
        dbConnected: state.dbInfo ? !!state.dbInfo.connected : null, error: state.error, uptimeSec: Math.round((Date.now() - state.startedAt) / 1000),
        memoryMb: Math.round(process.memoryUsage().rss / 1048576)
      });
    }
    if (p === '/api/status') {
      return send(r, 200, {
        ready: state.ready, loading: state.loading, source: state.source, error: state.error,
        startedAt: new Date(state.startedAt).toISOString(), loadedAt: state.loadedAt ? new Date(state.loadedAt).toISOString() : null,
        loadMs: state.loadedAt ? state.loadedAt - state.startedAt : null,
        memoryMb: Math.round(process.memoryUsage().rss / 1048576),
        env: db.envReport(), db: state.dbInfo, counts: state.data ? state.data.report.counts : null,
        storeFallback: !!state.storeFallbackReason, hint: state.dbInfo ? state.dbInfo.hint || null : null,
        mapping: state.data ? state.data.report.tables : null, issues: state.data ? state.data.report.issues : null,
        node: process.version
      });
    }
    if (p === '/api/meta') return send(r, 200, meta());

    if (p === '/api/diagnose' || p === '/doctor') {
      const want = process.env.DIAG_TOKEN;
      const got = g('token') || (q.headers['x-diag-token'] || '');
      const allowed = !want || got === want;
      if (!allowed) return send(r, 403, { error: 'forbidden', hint: 'برای دیدن این گزارش ?token=… لازم است (DIAG_TOKEN).' });
      let out;
      try { out = await diagnose({ pool: state.pool || null, state, env: process.env, probeAi: g('ai') === '1' || g('probe') === '1' }); }
      catch (e) { out = { ok: false, checks: [], error: db.scrub(e.message), nextSteps: ['خطای غیرمنتظره در عیب‌یابی؛ لاگ اپ را ببینید.'] }; }
      if (p === '/doctor') return htmlOut(r, 200, doctorPage(out));
      return send(r, 200, out);
    }
    if (p === '/api/ai') {
      const info = llm.info();
      return send(r, 200, { ...info, hint: info.enabled ? null : llm.hintFor({ code: 'ai_not_configured' }) });
    }
    if (p === '/api/ai/test') {
      if (limited(ip, 'aitest', 6)) return send(r, 429, { error: 'rate_limited' });
      if (!llm.enabled()) return send(r, 503, { ok: false, error: 'ai_not_configured', hint: llm.hintFor({ code: 'ai_not_configured' }), ...llm.info() });
      const out = await llm.probe();
      return send(r, out.ok ? 200 : 502, { ...llm.info(), ...out });
    }
    if (p.startsWith('/api/') && !state.ix) {
      if (['/api/health', '/api/status', '/api/meta'].includes(p)) return;
      return notReady(r);
    }
    const ix = state.ix;

    if (p === '/api/options' || p === '/api/products') {
      const cat = g('cat');
      if (!catsOf()[cat]) return send(r, 400, { error: 'bad_cat' });
      const sel = {};
      for (const [k, v] of u.searchParams) if (!['cat', 'key', 'q'].includes(k) && key(k)) sel[k] = v;
      if (p === '/api/options') {
        const k = g('key'); if (!key(k)) return send(r, 400, { error: 'bad_key' });
        return send(r, 200, ix.options({ cat, sel }, k));
      }
      return send(r, 200, { items: ix.cands({ cat, sel }).slice(0, 60).map(x => ({ ...x, ...ix.priceRange(x.id) })) });
    }
    if (p === '/api/search') {
      const s = text(g('q'), 100) || '';
      return send(r, 200, { items: ix.cands({ q: s }).slice(0, 24).map(x => ({ ...x, ...ix.priceRange(x.id) })) });
    }
    if (p === '/api/interpret') return send(r, 200, nlu.interpret(ix, text(g('q'), 200) || ''));

    if (p === '/api/offers') {
      const pid = g('pid');
      if (!ix.P.has(pid)) return send(r, 404, { error: 'unknown_product' });
      const { loc, bad } = clientLoc(g);
      const rad = num(g('rad'), 0, 200), min = num(g('min'), 0, 1e12), max = num(g('max'), 0, 1e12);
      if (bad || [rad, min, max].some(Number.isNaN)) return send(r, 400, { error: 'bad_param' });
      const o = { loc, rad, min, max, inst: g('inst') === '1', credit: g('credit') === '1', open: g('open') === '1', torobpay: g('tp') === '1', kalabarg: g('kb') === '1', express: g('ex') === '1', sort: ['price', 'dist', 'smart', 'closing'].includes(g('sort')) ? g('sort') : 'price' };
      const rows = ix.offers(pid, o).map(x => ({ ...x, etaMin: etaOf(x.km) }));
      return send(r, 200, {
        product: ix.P.get(pid), rows, insight: buildInsight(rows), range: ix.priceRange(pid),
        alternatives: rows.length ? [] : ix.alternatives(pid, { ...o, rad: o.rad ? o.rad * 1.5 : undefined }),
        distanceKind: 'straight_line', eta: { mode: require('./src/advice').ETA_KIND }
      });
    }
    if (p === '/api/advice') {
      const pid = g('pid'); if (!ix.P.has(pid)) return send(r, 404, { error: 'unknown_product' });
      const { loc, bad } = clientLoc(g); if (bad) return send(r, 400, { error: 'bad_param' });
      if (!loc) return send(r, 400, { error: 'location_required' });
      const rad = num(g('rad'), 0, 50), max = num(g('max'), 1, 200);
      if (Number.isNaN(rad) || Number.isNaN(max)) return send(r, 400, { error: 'bad_param' });
      const out = advise(ix, pid, { loc, radKm: rad == null ? 2 : rad, maxKm: max == null ? 15 : max });
      return send(r, 200, out);
    }
    if (p === '/api/hubs') {
      const { loc, bad } = clientLoc(g); if (bad) return send(r, 400, { error: 'bad_param' });
      if (!loc) return send(r, 400, { error: 'location_required' });
      const rad = num(g('rad'), 0, 50) ?? 6, cat = text(g('cat'), 120);
      return send(r, 200, { hubs: hubsOf(ix, loc, { radKm: rad, cat: cat && catsOf()[cat] ? cat : null }) });
    }
    if (p === '/api/trip') {
      const pid = g('pid'), ids = String(g('shops') || '').split(',').filter(Boolean).slice(0, 5);
      if (!ix.P.has(pid)) return send(r, 404, { error: 'unknown_product' });
      const { loc, bad } = clientLoc(g); if (bad) return send(r, 400, { error: 'bad_param' });
      if (!loc) return send(r, 400, { error: 'location_required' });
      const out = planTrip(ix, pid, ids, { loc });
      return out ? send(r, 200, out) : send(r, 400, { error: 'bad_input' });
    }
    if (p === '/api/route') {
      const a = { lat: num(g('lat'), -90, 90), lng: num(g('lng'), -180, 180) }, b = { lat: num(g('slat'), -90, 90), lng: num(g('slng'), -180, 180) };
      if (![a.lat, a.lng, b.lat, b.lng].every(Number.isFinite)) return send(r, 400, { error: 'bad_param' });
      if (limited(ip, 'route', 60)) return send(r, 429, { error: 'rate_limited' });
      const res = await geo.route(a, b);
      return send(r, 200, res || { kind: 'straight_line' });
    }

    /* ───── پرسش و پیگیری ───── */
    if (p === '/api/inquiry' && q.method === 'POST') {
      let j; try { j = await readJSON(q); } catch (e) { return send(r, 400, { error: e.message }); }
      j = j || {};
      if (!ix.S.has(j.shop) || !ix.P.has(j.product) || !TOPICS.includes(j.topic)) return send(r, 400, { error: 'bad_input' });
      const client = j.client == null ? 'anon' : j.client;
      if (client !== 'anon' && !clientOk(client)) return send(r, 400, { error: 'bad_client' });
      const channel = j.channel == null ? 'none' : j.channel; if (!CHANNELS.includes(channel)) return send(r, 400, { error: 'bad_channel' });
      const message = text(j.message, 500);
      // کانال ارسال خودکار (واتساپ/بله/تلفن از سمت سرور) پیاده نشده؛ پاسخی جعل نمی‌شود.
      const handedOff = ['whatsapp', 'phone', 'bale'].includes(channel);
      const rec = await state.store.inquiries.add({ client, shop: j.shop, product: j.product, topic: j.topic, message, channel, status: handedOff ? 'pending' : 'not_sent', reason: handedOff ? 'sent_by_user' : 'channel_not_connected' });
      const lat = num(j.lat, -90, 90), lng = num(j.lng, -180, 180);
      const loc = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
      return send(r, 200, { ...rec, answer: null, backups: ix.backups(j.product, j.shop, { loc, rad: num(j.rad, 0, 200) || undefined }) });
    }
    if (p === '/api/inquiry/update' && q.method === 'POST') {
      let j; try { j = await readJSON(q); } catch (e) { return send(r, 400, { error: e.message }); }
      j = j || {};
      if (!clientOk(j.client) || !Number.isInteger(j.id) || !STATUSES.includes(j.status) || j.status === 'not_sent') return send(r, 400, { error: 'bad_input' });
      const patch = { status: j.status };
      if (j.availability != null) { if (!AVAIL.includes(j.availability)) return send(r, 400, { error: 'bad_input' }); patch.availability = j.availability; }
      if (j.answer != null) { const a = text(j.answer, 300); if (a == null) return send(r, 400, { error: 'bad_input' }); patch.answer = a; }
      const rec = await state.store.inquiries.update(j.id, j.client, patch);
      return rec ? send(r, 200, rec) : send(r, 404, { error: 'not_found' });
    }
    if (p === '/api/inquiries') {
      const c = g('client'); if (!clientOk(c)) return send(r, 400, { error: 'bad_client' });
      const rows = await state.store.inquiries.list(c);
      return send(r, 200, { items: rows.map(x => ({ ...x, shopName: (ix.S.get(x.shop) || {}).name || null, productTitle: (ix.P.get(x.product) || {}).title_fa || null })) });
    }

    /* ───── «بگذار ما تماس بگیریم»: صف تماس با ساعت اداری و رضایت ───── */
    if (p === '/api/call' && q.method === 'POST') {
      let j; try { j = await readJSON(q); } catch (e) { return send(r, 400, { error: e.message }); }
      j = j || {};
      if (!clientOk(j.client) || !ix.S.has(j.shop) || !ix.P.has(j.product) || !TOPICS.includes(j.topic)) return send(r, 400, { error: 'bad_input' });
      if (j.consent !== true) return send(r, 400, { error: 'consent_required' });
      const question = text(j.question, 300);
      if (!question || question.length < 8) return send(r, 400, { error: 'question_required' });
      const phone = text(j.phone, 20);
      if (phone && !/^[+0-9][0-9 ()-]{6,19}$/.test(phone)) return send(r, 400, { error: 'bad_phone' });
      if (limited(ip, 'call', 10)) return send(r, 429, { error: 'rate_limited' });
      if (limited('c:' + j.client, 'call', 6, 864e5)) return send(r, 429, { error: 'daily_limit' });
      const shop = ix.S.get(j.shop), now = new Date();
      const earliest = nextOpening(shop, now);
      let reason = 'within_hours';
      if (earliest.getTime() > now.getTime() + 10 * 60000) reason = 'outside_shop_hours';
      let rec;
      try {
        rec = await state.store.calls.add({ client: j.client, shop: j.shop, product: j.product, topic: j.topic, question, phone, earliest: earliest.toISOString() });
      } catch (e) { return send(r, 503, { error: 'store_unavailable', detail: e.message }); }
      // اگر سرویس تماس پیکربندی شده باشد، همان لحظه به آن سپرده می‌شود؛ وگرنه در صف می‌ماند.
      let forwarded = null;
      if (process.env.CALL_WEBHOOK_URL) {
        try {
          const ac = new AbortController(), to = setTimeout(() => ac.abort(), 5000);
          const res = await fetch(process.env.CALL_WEBHOOK_URL, {
            method: 'POST', signal: ac.signal,
            headers: { 'content-type': 'application/json', ...(process.env.CALL_WEBHOOK_TOKEN ? { authorization: 'Bearer ' + process.env.CALL_WEBHOOK_TOKEN } : {}) },
            body: JSON.stringify({ ...rec, shop: { id: shop.id, name: shop.name, phone: shop.tel }, product: ix.P.get(j.product) })
          });
          clearTimeout(to);
          forwarded = res.ok;
          if (res.ok) rec = await state.store.calls.update(rec.id, j.client, { status: 'sent' }) || rec;
        } catch { forwarded = false; }
      }
      return send(r, 200, {
        ...rec, forwarded, reason,
        notice: forwarded
          ? 'درخواست به سرویس تماس سپرده شد. بدون مزاحمت برای فروشگاه، فقط در ساعت کاری و یک‌بار در روز.'
          : 'درخواست ثبت شد. این نسخه تماس خودکار ندارد؛ درخواست برای پیگیری انسانی در صف می‌ماند و هیچ پیامی بدون ساعت کاری مناسب برای فروشگاه فرستاده نمی‌شود.',
        earliestReason: reason === 'outside_shop_hours' ? 'فروشگاه الان بسته است؛ تماس به اولین ساعت کاری‌اش موکول شد.' : 'در ساعت کاری فروشگاه است.'
      });
    }
    if (p === '/api/calls') {
      const c = g('client'); if (!clientOk(c)) return send(r, 400, { error: 'bad_client' });
      const rows = await state.store.calls.list(c);
      return send(r, 200, { items: rows.map(x => ({ ...x, shopName: (ix.S.get(x.shop) || {}).name || null, productTitle: (ix.P.get(x.product) || {}).title_fa || null, shopPhone: (ix.S.get(x.shop) || {}).tel || null })) });
    }
    if (p === '/api/call/update' && q.method === 'POST') {
      let j; try { j = await readJSON(q); } catch (e) { return send(r, 400, { error: e.message }); }
      j = j || {};
      if (!clientOk(j.client) || !Number.isInteger(j.id) || !CALL_STATUS.includes(j.status)) return send(r, 400, { error: 'bad_input' });
      const patch = { status: j.status };
      if (j.availability != null) { if (!AVAIL.includes(j.availability)) return send(r, 400, { error: 'bad_input' }); patch.availability = j.availability; }
      if (j.answer != null) patch.answer = text(j.answer, 300);
      const rec = await state.store.calls.update(j.id, j.client, patch);
      return rec ? send(r, 200, rec) : send(r, 404, { error: 'not_found' });
    }

    /* ───── هشدار قیمت/باز شدن فروشگاه ───── */
    if (p === '/api/watch' && q.method === 'POST') {
      let j; try { j = await readJSON(q); } catch (e) { return send(r, 400, { error: e.message }); }
      j = j || {};
      if (!clientOk(j.client) || !ix.P.has(j.product)) return send(r, 400, { error: 'bad_input' });
      if (j.shop != null && !ix.S.has(j.shop)) return send(r, 400, { error: 'bad_shop' });
      const target = num(j.target, 0, 1e12), rad = num(j.rad, 0, 100), lat = num(j.lat, -90, 90), lng = num(j.lng, -180, 180);
      if ([target, rad, lat, lng].some(Number.isNaN)) return send(r, 400, { error: 'bad_param' });
      const rec = await state.store.watches.add({ client: j.client, product: j.product, shop: j.shop || null, target, lat, lng, rad });
      return send(r, 200, await watchView(rec, ix));
    }
    if (p === '/api/watches') {
      const c = g('client'); if (!clientOk(c)) return send(r, 400, { error: 'bad_client' });
      const list = await state.store.watches.list(c);
      return send(r, 200, { items: await Promise.all(list.map(w => watchView(w, ix))) });
    }
    if (p === '/api/watch' && q.method === 'DELETE') {
      const c = g('client'), id = Number(g('id'));
      if (!clientOk(c) || !Number.isInteger(id)) return send(r, 400, { error: 'bad_input' });
      return send(r, 200, { removed: await state.store.watches.remove(id, c) });
    }

    if (p === '/api/report') return send(r, 200, state.data.report);
    if (p === '/api/tools' && q.method === 'POST') {
      let j; try { j = await readJSON(q); } catch (e) { return send(r, 400, { error: e.message }); }
      const out = require('./src/tools').run(ix, j && j.name, j && j.args);
      return send(r, out.error ? 400 : 200, out);
    }
    if (p === '/api/tools') return send(r, 200, require('./src/tools').TOOLS);
    if (p === '/api/chat') {
      if (!llm.enabled()) return send(r, 503, { error: 'ai_not_configured' });
      if (q.method !== 'POST') return send(r, 200, { ai: true });
      let j; try { j = await readJSON(q); } catch (e) { return send(r, 400, { error: e.message }); }
      const msg = text(j && j.message, 300) || '';
      if (msg.length < 2) return send(r, 400, { error: 'bad_input' });
      if (limited(ip, 'chat', 20)) return send(r, 429, { error: 'rate_limited' });
      const rules = nlu.interpret(ix, msg);
      try { return send(r, 200, nlu.merge(nlu.sanitize(ix, await llm.understand(ix, msg)), rules)); }
      catch (e) { return send(r, 200, { ...rules, aiError: e.code || 'ai_failed' }); }
    }
    if (p === '/api/health') return send(r, 200, { ok: true });
    if (p.startsWith('/api/')) return send(r, 404, { error: 'not_found' });
    return serveStatic(q, r, p);
  }

  const server = http.createServer((q, r) => { handle(q, r).catch(e => { console.error('[request]', q.url, e && e.message); if (!r.headersSent) send(r, 500, { error: 'server_error' }); else r.end(); }); });
  server.state = state;
  return server;
}

// نمای یک هشدار همراه با وضعیت فعلی بازار (بدون ذخیره‌ی جعلی)
async function watchView(w, ix) {
  const p = ix.P.get(w.product);
  const loc = w.lat != null && w.lng != null ? { lat: w.lat, lng: w.lng } : null;
  const rows = ix.offers(w.product, { loc, rad: w.rad || undefined, sort: 'smart' });
  const best = rows[0] || null;
  const targetHit = !!(w.target != null && best && best.offer.price <= w.target);
  const stateStr = best ? `${best.offer.price}|${best.shop.id}|${best.hours.state}` : 'none';
  return {
    ...w, productTitle: p ? p.title_fa : null, targetHit,
    changed: w.last != null && w.last !== stateStr,
    best: best ? { shop: best.shop.id, name: best.shop.name, price: best.offer.price, km: best.km == null ? null : +best.km.toFixed(1), open: best.hours.state, updated: best.offer.updated, etaMin: etaOf(best.km) } : null,
    alive: !!p, stateStr
  };
}

/* ───────── بارگذاری دیتاست ───────── */
async function loadDataset({ onState } = {}) {
  const dir = process.env.DATA_DIR || path.join(__dirname, 'data');
  const m = loadMapping(dir);
  if (m.error) throw new Error('mapping.json نامعتبر است: ' + m.error);
  const schema = m.schema || {};
  const t0 = Date.now();
  let pool = null, dbInfo = null;
  try { pool = db.createPool(); } catch (e) { dbInfo = { configured: true, connected: false, error: e.message, env: db.envReport() }; }

  if (pool) {
    dbInfo = { ...(await db.health(pool)), env: db.envReport() };
    if (dbInfo.connected) {
      try {
        await db.migrate(pool);
        const cols = await db.tableColumns(pool);
        const det = db.detectDatasetTables(cols, db.PREFIX());
        dbInfo.tables = det.tables;
        dbInfo.candidates = det.candidates;
        dbInfo.allTables = det.all.map(x => x.table).slice(0, 60);
        const missing = db.TABLES.filter(t => !det.tables[t]);
        if (!missing.length) {
          const builder = createBuilder({ schema });
          for (const role of ['shops', 'products', 'offers']) {
            const table = det.tables[role], columns = cols.get(table) || [];
            const idCol = ['shop_id', 'product_id', 'offer_id', 'source_id', 'id'].find(c => columns.includes(c));
            if (!idCol) throw new Error('ستون شناسه در ' + table + ' پیدا نشد');
            const t = Date.now();
            builder['add' + role[0].toUpperCase() + role.slice(1)](db.pageRows(pool, table, columns, idCol), columns);
            console.log(JSON.stringify({ event: 'table_loaded', role, table, rows: builder.report.tables[role].rows, ms: Date.now() - t }));
            onState && onState({ stage: 'table', role, rows: builder.report.tables[role].rows });
          }
          const data = builder.finish();
          data.report.ok = data.report.ok && data.report.counts.offers > 0;
          if (!data.report.ok) throw new Error('دیتاست خوانده شد ولی معتبر نیست: ' + (data.report.errors[0] || 'بدون آفِر'));
          return { data, pool, dbInfo, source: 'postgres', ms: Date.now() - t0 };
        }
        dbInfo.error = 'dataset_tables_not_found';
        dbInfo.detail = 'جدول‌های products/offers/shops (یا هم‌معنای آن‌ها) در دیتابیس پیدا نشد.';
        console.error('[data] dataset tables not found; candidates:', JSON.stringify(det.candidates));
      } catch (e) {
        dbInfo.error = e.code || 'db_read_failed';
        dbInfo.detail = e.message;
        console.error('[data] PostgreSQL read failed:', e.message);
      }
    }
  }

  // فایل محلی (اگر داده وجود داشته باشد) — Demo هرگز به‌صورت خودکار بارگذاری نمی‌شود
  const real = loadDir(dir);
  if (real && real.report.ok && real.report.counts.offers > 0) return { data: real, pool, dbInfo, source: 'files', ms: Date.now() - t0 };
  return { data: null, pool, dbInfo, source: 'none', error: 'dataset_not_available', ms: Date.now() - t0 };
}

module.exports = { createServer, loadDataset, watchView };
if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const server = createServer(null, { loading: true });
  server.listen(port, '0.0.0.0', () => console.log(JSON.stringify({ event: 'server_listening', host: '0.0.0.0', port, node: process.version })));
  server.on('error', e => { console.error('[startup] HTTP server failed:', e); process.exitCode = 1; });
  loadDataset().then(({ data, pool, dbInfo, source, ms, error }) => {
    const st = server.state;
    st.dbInfo = dbInfo;
    st.loading = false;
    if (!data) {
      st.ready = false; st.error = error || 'dataset_not_available'; st.source = 'none';
      console.error(JSON.stringify({ event: 'dataset_unavailable', db: dbInfo, hint: 'متغیرهای اتصال و جدول‌های دیتاست را در لیارا بررسی کنید: /api/status' }));
      return;
    }
    st.data = data; st.ix = new Index(data); st.ix.registry = data.registry; st.store = db.createStore(pool);
    st.source = source; st.ready = true; st.loadedAt = Date.now();
    console.log(JSON.stringify({ event: 'dataset_ready', source, ms, counts: data.report.counts, db: pool ? 'postgres' : 'memory', memoryMb: Math.round(process.memoryUsage().rss / 1048576) }));
  }).catch(e => {
    server.state.loading = false; server.state.ready = false; server.state.error = e.message;
    console.error('[startup]', e);
  });
  const shutdown = sig => { console.log('[shutdown]', sig); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', e => console.error('[unhandledRejection]', e && e.message));
}
