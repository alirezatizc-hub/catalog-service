// نمونه‌ی آزمایشی با «شکل دقیق» دیتاست چالش (نه داده‌ی واقعی ترب)
// weekly_hours دیکشنری mon..sun با status/shifts و شیفت‌های 00:00:00 جای‌خالی
const H = (spec) => JSON.stringify(spec);
const open = (a, b = a) => ({ status: 'declared', shifts: [{ start_time: a, end_time: b }] });
const closed = { status: 'closed', shifts: [] };

// یکشنبه=0 … شنبه=6
const weekAll = (a = '09:00:00', b = '21:00:00') => H({ sat: open(a, b), sun: open(a, b), mon: open(a, b), tue: open(a, b), wed: open(a, b), thu: open(a, b), fri: open(a, b) });
const closedNight = H({ sat: open('09:00:00', '20:00:00'), sun: open('09:00:00', '20:00:00'), mon: open('09:00:00', '20:00:00'), tue: open('09:00:00', '20:00:00'), wed: open('09:00:00', '20:00:00'), thu: open('09:00:00', '20:00:00'), fri: closed });

function make() {
  const shops = { cols: ['shop_id', 'name', 'address', 'lat', 'lon', 'location_label', 'contacts', 'category_names', 'payment_options', 'supports_fast_delivery', 'weekly_hours', 'website_url', 'instagram'], rows: [] };
  const add = (o) => { shops.rows.push({ shop_id: o.id, name: o.name, address: o.addr, lat: String(o.lat), lon: String(o.lng), location_label: o.label || null, contacts: o.contacts || null, category_names: o.cats ? JSON.stringify(o.cats) : null, payment_options: o.pay === undefined ? null : JSON.stringify(o.pay), supports_fast_delivery: o.express == null ? null : String(o.express), weekly_hours: o.hours === undefined ? null : o.hours, website_url: o.web || null, instagram: o.ig || null }); };

  // محدوده‌ی ونک/میرداماد
  add({ id: 's1', name: 'دیجی‌کالا ونک', addr: 'تهران، خیابان ونک، پاساژ ونک، طبقه ۲، واحد ۱۲', lat: 35.7575, lng: 51.4105, label: 'میدان ونک', hours: closedNight, cats: ['لوازم جانبی موبایل'], contacts: [{ channel: 'phone', display_number: '۰۲۱۸۸۷۷۶۶۵۵' }, { channel: 'whatsapp', display_number: '۰۹۱۲۳۴۵۶۷۸۹' }], pay: [{ provider_name: 'ترب پی', channel: 'in_person', category_names: [], min_price_toman: 0, max_price_toman: 0 }], express: true, ig: '@shop_one' });
  add({ id: 's2', name: 'موبایل میرزایی', addr: 'تهران، میرداماد، پاساژ میرداماد، طبقه همکف، واحد ۴', lat: 35.7600, lng: 51.4230, label: 'میرداماد', hours: closedNight, cats: ['لوازم جانبی موبایل'], contacts: [{ channel: 'phone', display_number: '02122223333' }], pay: null, express: false });
  add({ id: 's3', name: 'شارژرسرای تهران', addr: 'تهران، خیابان ولیعصر، پاساژ علاءالدین، طبقه ۳، واحد ۸۸', lat: 35.7050, lng: 51.4020, label: 'علاءالدین', hours: weekAll('10:00:00', '23:30:00'), cats: ['لوازم جانبی موبایل'], contacts: null, pay: [{ provider_name: 'اسنپ پی', channel: 'in_person', category_names: ['لوازم جانبی موبایل'], min_price_toman: 1000000, max_price_toman: 50000000 }, { provider_name: 'دیجی پی', channel: 'unknown', category_names: [], min_price_toman: 0, max_price_toman: 0 }], express: true });
  add({ id: 's4', name: 'کالای برق صادقیه', addr: 'تهران، میدان صادقیه، پاساژ صادقیه، طبقه ۱، واحد ۲', lat: 35.7156, lng: 51.3436, label: 'صادقیه', hours: undefined, cats: ['لوازم جانبی موبایل', 'لوازم برقی'], pay: null, express: null });
  add({ id: 's5', name: 'بازار موبایل جمهوری', addr: 'تهران، خیابان جمهوری، پاساژ علاءالدین، طبقه منفی ۱، واحد ۲۱', lat: 35.7060, lng: 51.4035, label: 'جمهوری', hours: H({ sat: open('09:00:00', '19:00:00'), sun: closed, mon: open('09:00:00', '19:00:00'), tue: open('09:00:00', '19:00:00'), wed: open('09:00:00', '19:00:00'), thu: open('09:00:00', '19:00:00'), fri: closed }), cats: ['لوازم جانبی موبایل'], pay: [], express: false, web: 'example.com' });
  add({ id: 's6', name: 'فروشگاه شبانه‌روزی ونک', addr: 'تهران، ونک، خیابان گاندی', lat: 35.7590, lng: 51.4120, label: 'گاندی', hours: weekAll('00:00:00', '00:00:00'), cats: ['لوازم جانبی موبایل'], pay: [{ provider_name: 'تارا', channel: 'in_person', category_names: [], min_price_toman: 0, max_price_toman: 0 }], express: null });

  add({ id: 's7', name: 'لوازم جانبی آرژانتین', addr: 'تهران، خیابان آرژانتین، پاساژ آرژانتین، طبقه ۱، واحد ۵', lat: 35.7550, lng: 51.4150, label: 'آرژانتین', hours: closedNight, cats: ['لوازم جانبی موبایل'], pay: null, express: null });

  const products = { cols: ['product_id', 'persian_title', 'brand_name', 'category_name', 'model', 'specs', 'image_urls'], rows: [
    { product_id: 'p1', persian_title: 'شارژر دیواری ۲۰ وات', brand_name: 'انکر', category_name: 'لوازم جانبی موبایل', model: 'A2637', specs: JSON.stringify([{ key: 'رنگ', section: 'کلی', value: 'سفید' }, { key: 'توان', section: 'فنی', value: '۲۰ وات' }]), image_urls: '["https://example.com/a.jpg"]' },
    { product_id: 'p2', persian_title: 'شارژر دیواری ۳۳ وات', brand_name: 'انکر', category_name: 'لوازم جانبی موبایل', model: 'A2666', specs: JSON.stringify([{ key: 'رنگ', section: 'کلی', value: 'مشکی' }, { key: 'توان', section: 'فنی', value: '۳۳ وات' }]), image_urls: '[]' },
    { product_id: 'p3', persian_title: 'کابل تایپ‌سی', brand_name: 'انکر', category_name: 'لوازم جانبی موبایل', model: 'A8852', specs: null, image_urls: null }
  ] };

  const offers = { cols: ['offer_id', 'product_id', 'shop_id', 'price_toman', 'last_price_changed_at', 'seller_title', 'description', 'warranty'], rows: [
    { offer_id: 'o1', product_id: 'p1', shop_id: 's1', price_toman: '450000', last_price_changed_at: '2026-10-20T10:00:00+00:00', seller_title: 'شارژر ۲۰ وات', description: null, warranty: JSON.stringify({ provider: 'انکر', description: 'گارانتی شرکتی', period_months: 12 }) },
    { offer_id: 'o2', product_id: 'p1', shop_id: 's2', price_toman: '420000', last_price_changed_at: '2026-10-01T10:00:00+00:00', seller_title: null, description: null, warranty: 'null' },
    { offer_id: 'o3', product_id: 'p1', shop_id: 's3', price_toman: '399000', last_price_changed_at: '2026-10-22T20:00:00+00:00', seller_title: null, description: null, warranty: JSON.stringify({ provider: null, description: 'None', period_months: 18 }) },
    { offer_id: 'o4', product_id: 'p1', shop_id: 's4', price_toman: '1', last_price_changed_at: null, seller_title: null, description: null, warranty: null },
    { offer_id: 'o5', product_id: 'p1', shop_id: 's5', price_toman: '460000', last_price_changed_at: '2026-10-19T10:00:00+00:00', seller_title: null, description: null, warranty: null },
    { offer_id: 'o6', product_id: 'p1', shop_id: 's6', price_toman: '480000', last_price_changed_at: '2026-10-21T10:00:00+00:00', seller_title: null, description: null, warranty: null },
    { offer_id: 'o7', product_id: 'p2', shop_id: 's1', price_toman: '600000', last_price_changed_at: '2026-10-20T10:00:00+00:00', seller_title: null, description: null, warranty: null },
    { offer_id: 'o8', product_id: 'p2', shop_id: 's3', price_toman: '560000', last_price_changed_at: '2026-10-22T10:00:00+00:00', seller_title: null, description: null, warranty: null },
    { offer_id: 'o9', product_id: 'p3', shop_id: 's3', price_toman: '120000', last_price_changed_at: '2026-10-22T10:00:00+00:00', seller_title: null, description: null, warranty: null },
    { offer_id: 'o10', product_id: 'p3', shop_id: 's4', price_toman: '110000', last_price_changed_at: '2026-10-22T10:00:00+00:00', seller_title: null, description: null, warranty: null }
  ] };
  return { products, offers, shops };
}
module.exports = { make };
