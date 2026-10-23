'use strict';
// تست آداپتور BoxAPI با سرور ساختگی: payload درست، سازگاری مدل‌های reasoning، تلاش دوباره و پیام‌های خطا
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

// سرور ساختگی: هر درخواست را ثبت می‌کند و پاسخ‌ها را از صف می‌دهد
async function mockServer(handler) {
  const seen = [];
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      let json = null; try { json = JSON.parse(body); } catch { /* ignore */ }
      seen.push({ url: req.url, auth: req.headers.authorization, body: json });
      handler({ n: seen.length, json, req }, res);
    });
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  return { base: 'http://127.0.0.1:' + srv.address().port + '/ai/v1', seen, close: () => new Promise(r => srv.close(r)) };
}
const reply = (res, content, extra = {}) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }], usage: { prompt_tokens: 10, completion_tokens: 5 }, ...extra }));
};
const fail = (res, status, message) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: { message, type: 'invalid_request_error' } }));
};

function withEnv(vars, fn) {
  const old = {};
  for (const [k, v] of Object.entries(vars)) { old[k] = process.env[k]; if (v == null) delete process.env[k]; else process.env[k] = v; }
  return Promise.resolve().then(fn).finally(() => { for (const [k, v] of Object.entries(old)) { if (v == null) delete process.env[k]; else process.env[k] = v; } });
}

test('پیش‌فرض‌ها مطابق مستندات BoxAPI: base و مدل gpt-5.4-mini', () => withEnv({ BOXAPI_BASE_URL: null, LLM_BASE_URL: null, LLM_API_URL: null, BOXAPI_MODEL: null, AI_MODEL: null, LLM_MODEL: null, BOXAPI_API_KEY: 'k' }, async () => {
  const llm = require('../src/llm');
  assert.equal(llm.DEFAULT_BASE, 'https://ai.boxapi.ir/ai/v1');
  assert.equal(llm.DEFAULT_MODEL, 'gpt-5.4-mini');
  assert.equal(llm.baseUrl(), 'https://ai.boxapi.ir/ai/v1');
  assert.equal(llm.modelName(), 'gpt-5.4-mini');
  assert.equal(llm.endpoint(), 'https://ai.boxapi.ir/ai/v1/chat/completions');
  assert.equal(llm.info().provider, 'boxapi');
  assert.equal(llm.isReasoning('gpt-5.4-mini'), true);
  assert.equal(llm.isReasoning('gpt-4o-mini'), false);
}));

test('برای مدل reasoning از max_completion_tokens استفاده می‌شود و temperature فرستاده نمی‌شود', async () => {
  const srv = await mockServer((_, res) => reply(res, '{"cat":null,"sel":{},"filters":{},"reply":"سلام"}'));
  try {
    await withEnv({ BOXAPI_API_KEY: 'test-key', BOXAPI_BASE_URL: srv.base, AI_MODEL: 'gpt-5.4-mini', BOXAPI_MODEL: null }, async () => {
      const llm = require('../src/llm');
      const out = await llm.understand(null, 'سلام');
      assert.equal(out.reply, 'سلام');
      assert.equal(srv.seen.length, 1);
      const s = srv.seen[0];
      assert.equal(s.url, '/ai/v1/chat/completions');
      assert.equal(s.auth, 'Bearer test-key');
      assert.equal(s.body.model, 'gpt-5.4-mini');
      assert.ok(s.body.max_completion_tokens > 0);
      assert.equal(s.body.max_tokens, undefined);
      assert.equal(s.body.temperature, undefined);
      assert.equal(s.body.messages[0].role, 'system');
      assert.match(s.body.messages[0].content, /JSON/);
      assert.equal(s.body.messages[1].content, 'سلام');
    });
  } finally { await srv.close(); }
});

test('برای مدل غیر reasoning از max_tokens و temperature=0 استفاده می‌شود', async () => {
  const srv = await mockServer((_, res) => reply(res, '{"reply":"باشه"}'));
  try {
    await withEnv({ BOXAPI_API_KEY: 'test-key', BOXAPI_BASE_URL: srv.base, AI_MODEL: 'gpt-4o-mini', BOXAPI_MODEL: null }, async () => {
      await require('../src/llm').understand(null, 'سلام');
      const b = srv.seen[0].body;
      assert.ok(b.max_tokens > 0);
      assert.equal(b.temperature, 0);
      assert.equal(b.max_completion_tokens, undefined);
    });
  } finally { await srv.close(); }
});

test('اگر سرور پارامتری را نپذیرد، یک‌بار با درخواست ساده دوباره تلاش می‌شود', async () => {
  const srv = await mockServer(({ n }, res) => n === 1
    ? fail(res, 400, "Unsupported parameter: 'max_completion_tokens' is not supported with this model.")
    : reply(res, '{"cat":"لوازم جانبی موبایل","sel":{},"filters":{},"reply":null}'));
  try {
    await withEnv({ BOXAPI_API_KEY: 'test-key', BOXAPI_BASE_URL: srv.base, AI_MODEL: 'gpt-5.4-mini', BOXAPI_MODEL: null, BOXAPI_EXTRA_HEADERS: null }, async () => {
      const out = await require('../src/llm').understand(null, 'شارژر');
      assert.equal(out.cat, 'لوازم جانبی موبایل');
      assert.equal(srv.seen.length, 2, 'باید دو بار تلاش کند');
      const b2 = srv.seen[1].body;
      assert.equal(b2.max_completion_tokens, undefined);
      assert.equal(b2.temperature, undefined);
      assert.equal(b2.response_format, undefined);
      assert.equal(b2.model, 'gpt-5.4-mini');
    });
  } finally { await srv.close(); }
});

test('خطای کلید نامعتبر پیام و راهنمای فارسی می‌دهد و کلید را لو نمی‌دهد', async () => {
  const srv = await mockServer((_, res) => fail(res, 401, 'Invalid API key'));
  try {
    await withEnv({ BOXAPI_API_KEY: 'sk-secret-xyz', BOXAPI_BASE_URL: srv.base }, async () => {
      const llm = require('../src/llm');
      await assert.rejects(() => llm.understand(null, 'سلام'), e => {
        assert.equal(e.code, 'llm_http_401');
        assert.match(llm.hintFor(e), /BOXAPI_API_KEY/);
        assert.ok(!JSON.stringify({ code: e.code, message: e.message }).includes('sk-secret-xyz'));
        return true;
      });
      const pr = await llm.probe();
      assert.equal(pr.ok, false);
      assert.equal(pr.code, 'llm_http_401');
      assert.ok(!JSON.stringify(pr).includes('sk-secret-xyz'));
    });
  } finally { await srv.close(); }
});

test('خروجی مدل با متن اضافه یا آرایه‌ای هم خوانده می‌شود', async () => {
  const answers = ['```json\n{"cat":null,"reply":"سلام"}\n```', 'بفرمایید: {"cat":null,"reply":"درود"} امیدوارم خوب باشد'];
  const srv = await mockServer(({ n }, res) => reply(res, n === 3 ? [{ text: '{"cat":null,"reply":"آرایه"}' }] : answers[n - 1]));
  try {
    await withEnv({ BOXAPI_API_KEY: 'test-key', BOXAPI_BASE_URL: srv.base }, async () => {
      const llm = require('../src/llm');
      assert.equal((await llm.understand(null, 'a')).reply, 'سلام');
      assert.equal((await llm.understand(null, 'b')).reply, 'درود');
      assert.equal((await llm.understand(null, 'c')).reply, 'آرایه');
    });
  } finally { await srv.close(); }
});

test('/api/ai وضعیت را بدون کلید نشان می‌دهد و /api/ai/test بدون کلید 503 می‌دهد', async () => {
  const { createServer } = require('../server');
  await withEnv({ BOXAPI_API_KEY: null, BOXAPI_KEY: null, LLM_API_KEY: null }, async () => {
    const s = createServer(null, { loading: true });
    await new Promise(r => s.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + s.address().port;
    try {
      const info = await (await fetch(base + '/api/ai')).json();
      assert.equal(info.enabled, false);
      assert.equal(info.model, 'gpt-5.4-mini');
      assert.equal(info.host, 'ai.boxapi.ir');
      assert.match(info.hint, /BOXAPI_API_KEY/);
      const t = await fetch(base + '/api/ai/test');
      assert.equal(t.status, 503);
      assert.equal((await t.json()).error, 'ai_not_configured');
    } finally { s.close(); }
  });
});

test('/api/ai/test با سرور ساختگی موفق می‌شود و نمونه‌ی پاسخ می‌دهد', async () => {
  const srv = await mockServer((_, res) => reply(res, '{"ok":true}'));
  const { createServer } = require('../server');
  try {
    await withEnv({ BOXAPI_API_KEY: 'test-key', BOXAPI_BASE_URL: srv.base }, async () => {
      const s = createServer(null, { loading: true });
      await new Promise(r => s.listen(0, '127.0.0.1', r));
      const base = 'http://127.0.0.1:' + s.address().port;
      try {
        const r = await fetch(base + '/api/ai/test');
        assert.equal(r.status, 200);
        const j = await r.json();
        assert.equal(j.ok, true);
        assert.equal(j.model, 'gpt-5.4-mini');
        assert.match(j.sample, /ok/);
        assert.ok(j.ms >= 0);
      } finally { s.close(); }
    });
  } finally { await srv.close(); }
});

test('پاسخ متنی مدل (بدون دسته) هم منبع llm می‌گیرد و در رابط با نشان هوش مصنوعی می‌آید', async () => {
  const nlu = require('../src/nlu');
  const srv = await mockServer((_, res) => reply(res, '{"cat":null,"sel":{},"filters":{},"reply":"سلام! چه محصولی می‌خواهی؟"}'));
  try {
    await withEnv({ BOXAPI_API_KEY: 'k', BOXAPI_BASE_URL: srv.base }, async () => {
      const ai = await require('../src/llm').understand(null, 'سلام');
      const merged = nlu.merge({ ...nlu.sanitize({ registry: { cats: {} } }, ai) }, nlu.interpret({ registry: { cats: {} }, options: () => ({ options: [] }), cands: () => [] }, 'سلام'));
      assert.equal(merged.source, 'llm');
      assert.match(merged.reply, /سلام/);
    });
  } finally { await srv.close(); }
});
