'use strict';
// OpenAI-compatible chat-completions adapter.
// OpenAI is the default provider; compatible gateways can override LLM_BASE_URL / LLM_API_URL.
const baseUrl = () => (process.env.LLM_BASE_URL || process.env.LLM_API_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
const enabled = () => Boolean(process.env.LLM_API_KEY);

async function understand(ix, message) {
  if (!enabled()) { const e = new Error('LLM not configured'); e.code = 'ai_not_configured'; throw e; }
  const base = baseUrl();
  const url = /\/chat\/completions$/.test(base) ? base : base + '/chat/completions';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.LLM_TIMEOUT_MS) || 12000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + process.env.LLM_API_KEY },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.LLM_MODEL || 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 350,
        messages: [
          { role: 'system', content: 'به‌عنوان تحلیلگر جست‌وجوی فروشگاه، فقط JSON معتبر با کلیدهای cat, sel, filters, reply بده. فقط مقادیر موجود در متن کاربر را استخراج کن؛ اگر مطمئن نیستی مقدار را حذف کن. filters فقط min,max,inst,open,sort را شامل شود.' },
          { role: 'user', content: String(message).slice(0, 300) }
        ]
      })
    });
    if (!res.ok) {
      const e = new Error('LLM HTTP ' + res.status);
      e.code = 'llm_http_' + res.status;
      throw e;
    }
    const j = await res.json();
    const content = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (typeof content !== 'string') throw new Error('Empty LLM response');
    const clean = content.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
    return JSON.parse(clean);
  } finally {
    clearTimeout(timeout);
  }
}
module.exports = { enabled, understand, baseUrl };
