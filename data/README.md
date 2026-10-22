فایل‌های products / offers / shops (csv یا json) را اینجا بگذارید. اگر وجود نداشته باشند، دموی نمونه اجرا می‌شود.
نگاشت ستون‌ها: src/data/schema.js ؛ بازنویسی بدون تغییر کد با data/mapping.json، مثلاً:
{"SHOPS":{"name":["shop_title"],"lat":["lat"]},"SPEC_ALIASES":{"ram":["حافظه رم"]}}
بعد از اجرا: GET /api/report ← ستون‌های مفقود/ناشناخته shops ، پرتکرارترین کلیدهای specs ، aliasهای نگاشت‌نشده.
