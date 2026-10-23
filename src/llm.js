'use strict';
// آداپتور BoxAPI (سازگار با OpenAI Chat Completions) — طبق مستندات:
//   Base URL: https://ai.boxapi.ir/ai/v1
//   Endpoint: POST /chat/completions   ·   Auth: Authorization: Bearer <API_KEY>
//   مدل پیش‌فرض: gpt-5.4-mini
// نکته: مدل‌های gpt-5/o-series پارامترهای reasoning دارند؛ temperature را نمی‌پذیرند
// و به‌جای max_tokens از max_completion_tokens استفاده می‌کنند. اینجا بر اساس نام مدل
// payload ساخته می‌شود و اگر سرور پارامتری را رد کرد، یک‌بار با payload ساده‌تر تلاش می‌شود.
// کلید فقط روی سرور می‌ماند و هرگز در پاسخ API یا لاگ چاپ نمی‌شود.

const DEFAULT_BASE = 'https://ai.boxapi.ir/ai/v1';
const DEFAULT_MODEL = 'gpt-5.4-mini';

const apiKey = () => process.env.BOXAPI_API_KEY || process.env.BOXAPI_KEY || process.env.LLM_API_KEY || null;
const baseUrl = () => String(process.env.BOXAPI_BASE_URL || process.env.LLM_BASE_URL || process.env.LLM_API_URL || DEFAULT_BASE).replace(/\/+$/, '');
const modelName = () => process.env.BOXAPI_MODEL || process.env.AI_MODEL || process.env.LLM_MODEL || DEFAULT_MODEL;
const isReasoning = (model = modelName()) => /^(gpt-5|gpt-6|o\d)/i.test(String(model));
const enabled = () => Boolean(apiKey());

function endpoint() {
  const base = baseUrl();
  return /\/chat\/completions$/.test(base) ? base : base + '/chat/completions';
}
// فقط میزبان و نام مدل برای نمایش وضعیت؛ هیچ بخشی از کلید
function info() {
  let host = null;
  try { host = new URL(baseUrl()).host; } catch { host = null; }
  return {
    enabled: enabled(), model: modelName(), host, endpoint: endpoint(),
    provider: host && /boxapi\.ir$/i.test(host) ? 'boxapi' : 'openai-compatible',
    reasoning: isReasoning(), timeoutMs: timeout()
  };
}
const timeout = () => Number(process.env.LLM_TIMEOUT_MS) || (isReasoning() ? 30000 : 15000);

const SYSTEM = 'دستیار فارسی خرید حضوری هستی. همیشه فقط JSON معتبر با کلیدهای cat, sel, filters, reply برگردان. ' +
  'اگر کاربر سلام یا احوال‌پرسی کرد یا پیام عمومی غیرمحصولی داد، با فارسی طبیعی و کوتاه پاسخ بده، cat را null و sel و filters را خالی بگذار و reply را پر کن. ' +
  'اگر درخواست جست‌وجوی محصول بود، فقط مقادیر موجود در متن را استخراج کن؛ اگر مطمئن نیستی مقدار را حذف کن. filters فقط min,max,inst,open,sort را شامل شود. ' + 
  'قیمت‌ها همیشه به تومان و عدد کامل باشند: «۵۰۰ هزار» → 500000، «دو میلیون» → 2000000، «۱٫۵ میلیون» → 1500000. ' +
  'cat باید یکی از نام دسته‌های موجود در داده باشد و sel فقط کلیدهای همان دسته را داشته باشد.';

function payloadFor(message, model = modelName()) {
  const p = {
    model,
    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: String(message).slice(0, 400) }]
  };
  if (isReasoning(model)) {
    // مدل‌های reasoning: بدون temperature و با max_completion_tokens
    p.max_completion_tokens = Number(process.env.AI_MAX_TOKENS) || 700;
    p.response_format = { type: 'json_object' };
  } else {
    p.temperature = 0;
    p.max_tokens = Number(process.env.AI_MAX_TOKENS) || 350;
    p.response_format = { type: 'json_object' };
  }
  return p;
}

// هدرهای اضافی اختیاری (مثلاً برای پراکسی سازمانی) — JSON خراب، درخواست را نمی‌شکند
function extraHeaders() {
  const raw = process.env.BOXAPI_EXTRA_HEADERS;
  if (!raw) return {};
  try { const j = JSON.parse(raw); return j && typeof j === 'object' && !Array.isArray(j) ? j : {}; }
  catch { console.error(JSON.stringify({ event: 'bad_extra_headers' })); return {}; }
}

class LLMError extends Error {
  constructor(code, message, status, body) { super(message); this.code = code; this.status = status; this.body = body; }
}

async function callChat(payload) {
  if (!enabled()) throw new LLMError('ai_not_configured', 'LLM not configured', 503);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeout());
  const started = Date.now();
  try {
    const res = await fetch(endpoint(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + apiKey(),
        ...extraHeaders()
      },
      signal: ac.signal,
      body: JSON.stringify(payload)
    });
    const raw = await res.text();
    if (!res.ok) {
      let detail = raw.slice(0, 400);
      try { const j = JSON.parse(raw); detail = (j.error && (j.error.message || j.error)) || j.message || detail; } catch { /* متن خام */ }
      throw new LLMError('llm_http_' + res.status, String(detail).slice(0, 400), res.status, raw.slice(0, 800));
    }
    let j;
    try { j = JSON.parse(raw); } catch { throw new LLMError('llm_bad_json', 'پاسخ سرور JSON معتبر نبود', 502, raw.slice(0, 400)); }
    return { json: j, ms: Date.now() - started, usage: j.usage || null };
  } catch (e) {
    if (e.name === 'AbortError') throw new LLMError('llm_timeout', 'پاسخ مدل در زمان مجاز نرسید', 504);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

// اگر سرور پارامتری را نپذیرد (مثلاً max_tokens روی مدل‌های gpt-5)
const PARAM_HINTS = [/max_completion_tokens/i, /max_tokens/i, /temperature/i, /response_format/i, /unsupported/i, /not supported/i, /unrecognized/i, /invalid_request_error/i];
function shouldRetrySimple(err) {
  if (!err || err.status !== 400 && err.status !== 422) return false;
  const txt = String(err.message || '') + ' ' + String(err.body || '');
  return PARAM_HINTS.some(r => r.test(txt));
}
const simplePayload = (message, model = modelName()) => ({ model, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: String(message).slice(0, 400) }] });

function contentOf(j) {
  const c = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map(x => (typeof x === 'string' ? x : (x && x.text) || '')).join('');
  if (j && typeof j.output_text === 'string') return j.output_text; // اگر کسی به /responses وصلش کرد
  return null;
}

function parseJSONContent(content) {
  const clean = String(content).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(clean); } catch { /* گاهی متن اضافه قبل/بعد JSON هست */ }
  const a = clean.indexOf('{'), b = clean.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(clean.slice(a, b + 1));
  throw new LLMError('llm_bad_content', 'خروجی مدل JSON معتبر نبود', 502, clean.slice(0, 300));
}

async function understand(ix, message) {
  const model = modelName();
  let out;
  try { out = await callChat(payloadFor(message, model)); }
  catch (e) {
    if (!shouldRetrySimple(e)) throw e;
    console.error(JSON.stringify({ event: 'llm_param_retry', model, code: e.code, message: String(e.message).slice(0, 120) }));
    out = await callChat(simplePayload(message, model));
  }
  const content = contentOf(out.json);
  if (content == null) throw new LLMError('llm_empty', 'پاسخ مدل خالی بود', 502, JSON.stringify(out.json).slice(0, 300));
  return parseJSONContent(content);
}

// تست واقعی اتصال (برای /api/ai/test و صفحه‌ی /doctor). یک درخواست بسیار کوچک.
async function probe({ message = 'فقط JSON {"ok":true} برگردان.' } = {}) {
  const started = Date.now();
  try {
    const payload = { model: modelName(), messages: [{ role: 'user', content: message }], ...(isReasoning() ? { max_completion_tokens: 32 } : { max_tokens: 32, temperature: 0 }) };
    const out = await callChat(payload);
    const c = contentOf(out.json);
    return { ok: true, model: modelName(), ms: Date.now() - started, usage: out.usage, sample: c ? String(c).slice(0, 120) : null };
  } catch (e) {
    return { ok: false, model: modelName(), ms: Date.now() - started, code: e.code || 'ai_failed', error: String(e.message || '').slice(0, 300), hint: hintFor(e) };
  }
}

function hintFor(e) {
  const c = String((e && (e.code || e.status)) || '');
  if (c === 'ai_not_configured' || !enabled()) return 'متغیر BOXAPI_API_KEY در پنل لیارا تنظیم نشده یا اپ بعد از تنظیم دوباره دیپلوی نشده است.';
  if (/llm_http_401|llm_http_403/.test(c)) return 'کلید API پذیرفته نشد؛ مقدار BOXAPI_API_KEY را از پنل boxapi.ir دوباره کپی کنید (بدون فاصله/گیومه).';
  if (/llm_http_404/.test(c)) return 'مسیر یا نام مدل پیدا نشد؛ BOXAPI_BASE_URL باید https://ai.boxapi.ir/ai/v1 باشد و مدل مثل gpt-5.4-mini.';
  if (/llm_http_429/.test(c)) return 'سقف مصرف/نرخ BoxAPI پر شده؛ کمی بعد تلاش کنید یا اعتبار حساب را ببینید.';
  if (/llm_http_402|insufficient|quota|balance/i.test(c + ' ' + String(e && e.message))) return 'اعتبار حساب BoxAPI کافی نیست؛ از پنل شارژ کنید.';
  if (/llm_timeout/.test(c)) return 'پاسخ دیر رسید؛ LLM_TIMEOUT_MS را بالا ببرید (مدل‌های reasoning کندترند).';
  if (/llm_http_400|llm_http_422/.test(c)) return 'درخواست از نظر پارامترها پذیرفته نشد؛ AI_MODEL را بررسی کنید (مثلاً gpt-5.4-mini).';
  return null;
}

module.exports = { enabled, understand, probe, info, baseUrl, modelName, endpoint, isReasoning, hintFor, LLMError, DEFAULT_BASE, DEFAULT_MODEL };
