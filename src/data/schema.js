'use strict';
// نگاشت ستون‌ها. بخش CONFIRMED طبق گزارش ساختاری دیتاست است (فایل اصلی مستقیماً بررسی نشده).
exports.CONFIRMED={
 products:{id:'product_id',title_fa:'persian_title',brand:'brand_name',cat:'category_name',images:'image_urls',model:'model',specs:'specs'},
 offers:{id:'offer_id',product:'product_id',shop:'shop_id',price:'price_toman',updated:'last_price_changed_at',description:'description',seller:'seller_title',warranty:'warranty'},
 shops:{id:'shop_id'}};
// ستون‌های جدول shops تأییدنشده‌اند: فقط «نامزدهای قابل تنظیم» (حدس، نه واقعیت). با data/mapping.json بازنویسی می‌شوند.
exports.SHOP_CANDIDATES={name:['name'],address:['address'],lat:['lat'],lng:['lon'],hours:['weekly_hours'],phone:['contacts'],whatsapp:['contacts'],bale:['contacts'],installment:['payment_options'],torobpay:['payment_options'],kalabarg:['payment_options'],express:['supports_fast_delivery'],place_desc:['location_label'],instagram:['instagram'],website:['website_url']};
// کلیدهای specs.key که به فیلترهای اصلی نگاشت می‌شوند (تطبیق دقیق؛ تأییدنشده — بعد از دیدن /api/report تنظیم شود)
exports.SPEC_ALIASES={color:['رنگ','رنگ بندی','color'],ram:['مقدار رم','رم','ram'],storage:['حافظه داخلی','ظرفیت حافظه داخلی','storage']};
exports.CORE=[['brand','برند'],['color','رنگ'],['model','مدل'],['ram','رم'],['storage','حافظه']];
exports.EXTRA={minCoverage:0.3,maxValues:30,maxFilters:5};
// mapping.json می‌تواند هر بخش را بازنویسی کند (ادغام سطحی در هر زیرشاخه)
exports.merge=(base,o={})=>{const r={};for(const k of Object.keys(base))r[k]=o[k]&&typeof base[k]==='object'&&!Array.isArray(base[k])?{...base[k],...o[k]}:(o[k]??base[k]);return r};
