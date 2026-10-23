'use strict';
// تست واقعی اتصال به BoxAPI — بدون نیاز به بالا آوردن اپ.
//   BOXAPI_API_KEY='…' npm run ai:check
//   BOXAPI_API_KEY='…' AI_MODEL=gpt-5.4-mini npm run ai:check -- "یک شارژر ۲۰ وات زیر ۵۰۰ هزار"
// کلید هرگز چاپ نمی‌شود؛ فقط میزبان، مدل و نتیجه.
const llm = require('../src/llm');

(async () => {
  const info = llm.info();
  console.log('BoxAPI — تست هوش مصنوعی');
  console.log('='.repeat(48));
  console.log('  • مسیر اتصال: ' + info.endpoint);
  console.log('  • مدل: ' + info.model + (info.reasoning ? ' (reasoning → max_completion_tokens)' : ''));
  console.log('  • کلید: ' + (info.enabled ? 'تنظیم شده' : 'تنظیم نشده ❌'));
  if (!info.enabled) {
    console.log('\n❌ کلید نیست. یکی از این‌ها را ست کنید: BOXAPI_API_KEY (یا BOXAPI_KEY / LLM_API_KEY)');
    console.log('   روی لیارا: پنل اپ → تنظیمات → متغیرهای محیطی → BOXAPI_API_KEY، بعد اپ را دوباره دیپلوی کنید.');
    process.exit(1);
  }
  if (info.provider !== 'boxapi') console.log('  ⚠️ میزبان BoxAPI نیست؛ اگر عمدی است (سرویس دیگر سازگار با OpenAI) ادامه می‌دهیم.');

  const msg = process.argv.slice(2).filter(a => !a.startsWith('--')).join(' ').trim() || 'یک هدفون بی‌سیم زیر دو میلیون تومان می‌خواهم';
  const t = Date.now();
  const pr = await llm.probe();
  if (!pr.ok) {
    console.log('\n❌ اتصال برقرار نشد: ' + pr.code + ' — ' + pr.error);
    if (pr.hint) console.log('   راهنما: ' + pr.hint);
    process.exit(1);
  }
  console.log('\n✅ اتصال برقرار شد · ' + pr.ms + 'ms · مدل ' + pr.model);
  if (pr.usage) console.log('   مصرف: ' + JSON.stringify(pr.usage));

  // یک درخواست واقعی شبیه همان چیزی که اپ می‌فرستد
  try {
    const parsed = await llm.understand(null, msg);
    console.log('\n✅ خروجی ساختاریافته در ' + (Date.now() - t) + 'ms:');
    console.log('   ' + JSON.stringify(parsed).slice(0, 400));
    const okShape = parsed && typeof parsed === 'object' && ('cat' in parsed || 'reply' in parsed);
    if (!okShape) console.log('   ⚠️ کلیدهای cat/sel/filters/reply دیده نشد؛ پرامپت را بررسی کنید.');
  } catch (e) {
    console.log('\n⚠️ درخواست دوم ناموفق بود: ' + (e.code || '') + ' ' + String(e.message).slice(0, 200));
    const hint = llm.hintFor(e);
    if (hint) console.log('   راهنما: ' + hint);
    process.exit(1);
  }
})().catch(e => { console.error('[ai:check]', String(e && e.message).slice(0, 200)); process.exit(1); });
