'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const { Index } = require('./src/engine'), { loadDir, fromRaw, build } = require('./src/data/loader'), { TOOLS, run } = require('./src/tools');
const db = require('./src/db'), llm = require('./src/llm'), geo = require('./src/geo'), nlu = require('./src/nlu'), { buildInsight } = require('./src/insight');

const PUB = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.css': 'text/css;charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg']);
const STATUSES = ['not_sent', 'pending', 'answered', 'failed'];
const TOPICS = ['price', 'availability', 'hours', 'terms', 'installment'];
const CHANNELS = ['whatsapp', 'phone', 'bale', 'copy', 'none'];
const AVAIL = ['in_stock', 'out_of_stock', 'unknown'];
const CSP = "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

const num = (v, lo, hi) => { if (v == null || v === '') return undefined; const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : NaN; };
const clientOk = c => typeof c === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(c);
const key = k => /^[a-z_0-9]{1,20}$/.test(k || '');

// محدودیت نرخ ساده (برای مسیرهای پرهزینه: مدل زبانی و مسیریابی)
const hits = new Map();
function limited(ip, bucket, max, windowMs = 60000) {
  const k = bucket + ip, now = Date.now(), a = (hits.get(k) || []).filter(t => now - t < windowMs);
  if (a.length >= max) { hits.set(k, a); return true; }
  a.push(now); hits.set(k, a);
  if (hits.size > 5000) hits.clear();
  return false;
}

function readJSON(q, limit = 1e4) {
  return new Promise((resolve, reject) => {
    let b = '', over = false;
    q.on('data', c => { b += c; if (b.length > limit) { over = true; q.destroy(); } });
    q.on('end', () => { if (over) return reject(new Error('too_large')); try { resolve(JSON.parse(b || 'null')); } catch { reject(new Error('bad_json')); } });
    q.on('error', () => reject(new Error('bad_json')));
  });
}

const gz = new Map();
function serveStatic(r, p, q) {
  const f = path.resolve(PUB, '.' + (p === '/' ? '/index.html' : decodeURIComponent(p)));
  if (!f.startsWith(PUB + path.sep)) return jsonOut(r, 403, { error: 'forbidden' });
  fs.readFile(f, (e, d) => {
    if (e) return jsonOut(r, 404, { error: 'not_found' });
    const ext = path.extname(f), h = { 'content-type': TYPES[ext] || 'application/octet-stream', ...secHeaders() };
    h['cache-control'] = ext === '.html' ? 'no-cache' : (ext === '.woff2' || f.includes(path.sep + 'vendor' + path.sep)) ? 'public, max-age=31536000, immutable' : 'public, max-age=300';
    if (COMPRESSIBLE.has(ext) && /\bgzip\b/.test(q.headers['accept-encoding'] || '')) {
      let z = gz.get(f);
      if (!z || z.len !== d.length) { z = { len: d.length, buf: zlib.gzipSync(d) }; gz.set(f, z); }
      h['content-encoding'] = 'gzip'; h.vary = 'accept-encoding';
      r.writeHead(200, h); return r.end(z.buf);
    }
    r.writeHead(200, h); r.end(d);
  });
}
const secHeaders = () => ({ 'content-security-policy': CSP, 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin', 'permissions-policy': 'geolocation=(self)' });
function jsonOut(r, c, o) { r.writeHead(c, { 'content-type': 'application/json;charset=utf-8', 'cache-control': 'no-store', ...secHeaders() }); r.end(JSON.stringify(o)); }

function createServer(data, { demo, store, source } = {}) {
  const ix = new Index(data), CATS = data.registry.cats;
  ix.registry = data.registry;
  store = store || db.memoryStore();
  const send = jsonOut;

  async function handle(q, r) {
    const u = new URL(q.url, 'http://x'), g = k => u.searchParams.get(k), p = u.pathname, ip = q.socket.remoteAddress || '';
    if (p === '/api/meta') return send(r, 200, { demo: !!demo, cats: CATS, statuses: STATUSES, map: geo.mapConfig(), mapProvider: geo.mapConfig().provider, routing: geo.mapConfig().routing, ai: llm.enabled(), db: store.kind, source: source || (demo ? 'demo' : 'files'), dataOk: data.report.ok, counts: { products: ix.P.size, shops: ix.S.size } });
    if (p === '/api/options' || p === '/api/products') {
      const cat = g('cat'); if (!CATS[cat]) return send(r, 400, { error: 'bad_cat' });
      const sel = {}; for (const [k, v] of u.searchParams) if (!['cat', 'key', 'q'].includes(k) && key(k)) sel[k] = v;
      if (p === '/api/options') { const k = g('key'); if (!key(k)) return send(r, 400, { error: 'bad_key' }); return send(r, 200, ix.options({ cat, sel }, k)); }
      return send(r, 200, { items: ix.cands({ cat, sel }).slice(0, 50).map(x => ({ ...x, ...ix.priceRange(x.id) })) });
    }
    if (p === '/api/search') { const s = (g('q') || '').slice(0, 100); return send(r, 200, { items: ix.cands({ q: s }).slice(0, 20) }); }
    if (p === '/api/interpret') return send(r, 200, nlu.interpret(ix, (g('q') || '').slice(0, 200)));
    if (p === '/api/offers') {
      const pid = g('pid'); if (!ix.P.has(pid)) return send(r, 404, { error: 'unknown_product' });
      const lat = num(g('lat'), -90, 90), lng = num(g('lng'), -180, 180), rad = num(g('rad'), 0, 200), min = num(g('min'), 0, 1e12), max = num(g('max'), 0, 1e12);
      if ([lat, lng, rad, min, max].some(Number.isNaN)) return send(r, 400, { error: 'bad_param' });
      const o = { loc: lat != null && lng != null ? { lat, lng } : null, rad, min, max, inst: g('inst') === '1', open: g('open') === '1', torobpay: g('tp') === '1', kalabarg: g('kb') === '1', express: g('ex') === '1', sort: g('sort') || 'price' };
      const rows = ix.offers(pid, o);
      return send(r, 200, { product: ix.P.get(pid), rows, insight: buildInsight(rows), alternatives: rows.length ? [] : ix.alternatives(pid, { ...o, rad: o.rad ? o.rad * 1.5 : undefined }), distanceKind: 'straight_line', range: ix.priceRange(pid) });
    }
    if (p === '/api/route') {
      const a = { lat: num(g('lat'), -90, 90), lng: num(g('lng'), -180, 180) }, b = { lat: num(g('slat'), -90, 90), lng: num(g('slng'), -180, 180) };
      if (![a.lat, a.lng, b.lat, b.lng].every(Number.isFinite)) return send(r, 400, { error: 'bad_param' });
      if (limited(ip, 'route', 60)) return send(r, 429, { error: 'rate_limited' });
      const res = await geo.route(a, b);
      return send(r, 200, res || { kind: 'straight_line' });
    }
    if (p === '/api/inquiry' && q.method === 'POST') {
      let j; try { j = await readJSON(q); } catch (e) { return send(r, 400, { error: e.message }); }
      j = j || {};
      if (!ix.S.has(j.shop) || !ix.P.has(j.product) || !TOPICS.includes(j.topic)) return send(r, 400, { error: 'bad_input' });
      const client = j.client == null ? 'anon' : j.client;
      if (client !== 'anon' && !clientOk(client)) return send(r, 400, { error: 'bad_client' });
      const channel = j.channel == null ? 'none' : j.channel; if (!CHANNELS.includes(channel)) return send(r, 400, { error: 'bad_channel' });
      const message = typeof j.message === 'string' ? j.message.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, 500) : null;
      // کانال ارسال خودکار (واتساپ/بله/تلفن از سمت سرور) پیاده نشده؛ پاسخی جعل نمی‌شود.
      // اگر کاربر خودش پیام را از دستگاه خودش باز کرده، فقط «در انتظار پاسخ» ثبت می‌شود.
      const handedOff = ['whatsapp', 'phone', 'bale'].includes(channel);
      const rec = await store.add({ client, shop: j.shop, product: j.product, topic: j.topic, message, channel, status: handedOff ? 'pending' : 'not_sent', reason: handedOff ? 'sent_by_user' : 'channel_not_connected' });
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
      if (j.answer != null) { if (typeof j.answer !== 'string') return send(r, 400, { error: 'bad_input' }); patch.answer = j.answer.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, 300); }
      const rec = await store.update(j.id, j.client, patch);
      return rec ? send(r, 200, rec) : send(r, 404, { error: 'not_found' });
    }
    if (p === '/api/inquiries') {
      const c = g('client'); if (!clientOk(c)) return send(r, 400, { error: 'bad_client' });
      const rows = await store.list(c);
      return send(r, 200, { items: rows.map(x => ({ ...x, shopName: (ix.S.get(x.shop) || {}).name || null, productTitle: (ix.P.get(x.product) || {}).title_fa || null })) });
    }
    if (p === '/api/report') return send(r, 200, data.report);
    if (p === '/api/tools' && q.method === 'POST') {
      let j; try { j = await readJSON(q); } catch (e) { return send(r, 400, { error: e.message }); }
      const out = run(ix, j && j.name, j && j.args); return send(r, out.error ? 400 : 200, out);
    }
    if (p === '/api/tools') return send(r, 200, TOOLS);
    if (p === '/api/chat') {
      if (!llm.enabled()) return send(r, 503, { error: 'ai_not_configured' });
      if (q.method !== 'POST') return send(r, 200, { ai: true });
      let j; try { j = await readJSON(q); } catch (e) { return send(r, 400, { error: e.message }); }
      const msg = j && typeof j.message === 'string' ? j.message.trim().slice(0, 300) : '';
      if (msg.length < 2) return send(r, 400, { error: 'bad_input' });
      if (limited(ip, 'chat', 20)) return send(r, 429, { error: 'rate_limited' });
      const rules = nlu.interpret(ix, msg);
      try { return send(r, 200, nlu.merge(nlu.sanitize(ix, await llm.understand(ix, msg)), rules)); }
      catch (e) { return send(r, 200, { ...rules, aiError: e.code || 'ai_failed' }); } // خطای سرویس مدل → نتیجه‌ی قاعده‌محور، نه خطا برای کاربر
    }
    if (p === '/api/health') return send(r, 200, { ok: true, source: source || (demo ? 'demo' : 'files'), db: store.kind });
    if (p.startsWith('/api/')) return send(r, 404, { error: 'not_found' });
    return serveStatic(r, p, q);
  }
  return http.createServer((q, r) => { handle(q, r).catch(e => { console.error('[request]', q.url, e && e.message); if (!r.headersSent) send(r, 500, { error: 'server_error' }); else r.end(); }); });
}

// ---- راه‌اندازی: PostgreSQL (لیارا) → فایل‌های data/ → Demo ----
async function loadData() {
  const dir = process.env.DATA_DIR || path.join(__dirname, 'data');
  let pool = null, store = null;
  try { pool = db.createPool(); } catch (e) { console.error('[db]', e.message); }
  if (pool) {
    try {
      await db.migrate(pool); store = db.pgStore(pool);
      const raw = await db.loadRaw(pool);
      if (raw) { const d = fromRaw(raw, dir); console.log('[data] PostgreSQL', JSON.stringify(d.report.counts || {})); if (d.report.ok) return { data: d, store, source: 'postgres' }; console.error('[data] PostgreSQL errors:', d.report.errors); }
      else console.log('[data] جدول‌های دیتاست در PostgreSQL نیست (npm run import:pg)؛ فایل‌ها/Demo');
    } catch (e) { console.error('[db] اتصال/خواندن ناموفق؛ حافظه و فایل‌ها استفاده می‌شود:', e.message); store = null; }
  }
  const real = loadDir(dir);
  if (real) { console.log(JSON.stringify(real.report.issues), real.report.errors); return { data: real, store, source: 'files' }; }
  console.log('داده‌ی نمونه (Demo) بارگذاری شد');
  return { data: build(require('./src/demo'), { demo: true }), store, source: 'demo', demo: true };
}

module.exports = { createServer, loadData };
if (require.main === module) {
  loadData().then(({ data, store, source, demo }) => {
    const port = Number(process.env.PORT) || 3000;
    const server = createServer(data, { demo: !!demo, store, source });
    server.on('error', e => { console.error('[startup] HTTP server failed:', e); process.exitCode = 1; });
    server.listen(port, '0.0.0.0', () => console.log(JSON.stringify({ event: 'server_ready', host: '0.0.0.0', port, source, db: store ? store.kind : 'memory', ai: llm.enabled(), routing: geo.mapConfig().routing, products: data.products.length, shops: data.shops.length, offers: data.offers.length })));
  }).catch(e => { console.error('[startup]', e); process.exitCode = 1; });
}
