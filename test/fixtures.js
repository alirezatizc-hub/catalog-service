// ⚠ نمونه‌ی آزمایشی کوچک با «ساختار گزارش‌شده»ی دیتاست؛ داده‌ی واقعی ترب نیست.
const sp=a=>JSON.stringify(a.map(([key,value])=>({key,section:'t',value})));
exports.make=()=>({
 products:{cols:['product_id','persian_title','brand_name','category_name','image_urls','model','specs'],rows:[
  {product_id:'1',persian_title:'گوشی A',brand_name:'سامسونگ',category_name:'گوشی',image_urls:'["https://x/a.jpg"]',model:'S1',specs:sp([['رنگ','آبی'],['مقدار رم','۸ گیگابایت'],['حافظه داخلی','256 گیگابایت'],['نمایشگر','AMOLED']])},
  {product_id:'2',persian_title:'گوشی B',brand_name:'سامسونگ',category_name:'گوشی',image_urls:null,model:'S1',specs:sp([['رنگ','مشکی'],['مقدار رم','8 گیگابایت'],['حافظه داخلی','128 گیگابایت'],['نمایشگر','LCD']])},
  {product_id:'3',persian_title:'گوشی C',brand_name:'اپل',category_name:'گوشی',image_urls:null,model:null,specs:'{خراب'},
  {product_id:'1',persian_title:'تکراری',brand_name:'x',category_name:'گوشی',image_urls:null,model:null,specs:null},
  {product_id:null,persian_title:'بی‌شناسه',brand_name:'x',category_name:'گوشی',image_urls:null,model:null,specs:null}]},
 offers:{cols:['offer_id','product_id','shop_id','price_toman','last_price_changed_at','description','seller_title','warranty'],rows:[
  {offer_id:'a',product_id:'1',shop_id:'S1',price_toman:'1,200,000',last_price_changed_at:'2026-10-20T10:00:00Z',description:null,seller_title:null,warranty:null},
  {offer_id:'b',product_id:'1',shop_id:'S2',price_toman:'۱۳۰۰۰۰۰',last_price_changed_at:'نامعتبر',description:null,seller_title:null,warranty:'گارانتی'},
  {offer_id:'c',product_id:'2',shop_id:'S1',price_toman:'abc',last_price_changed_at:null,description:null,seller_title:null,warranty:null},
  {offer_id:'d',product_id:'2',shop_id:'S1',price_toman:'900000',last_price_changed_at:null,description:null,seller_title:null,warranty:null},
  {offer_id:'e',product_id:'3',shop_id:'S1',price_toman:'500',last_price_changed_at:null,description:null,seller_title:null,warranty:null},
  {offer_id:'f',product_id:'999',shop_id:'S1',price_toman:'100',last_price_changed_at:null,description:null,seller_title:null,warranty:null},
  {offer_id:'g',product_id:'1',shop_id:'NOPE',price_toman:'100',last_price_changed_at:null,description:null,seller_title:null,warranty:null}]},
 shops:{cols:['shop_id','shop_name','latitude','longitude','weird_col','opening_hours'],rows:[
  {shop_id:'S1',shop_name:'نمونه ۱',latitude:'35.7',longitude:'51.4',weird_col:'?',opening_hours:'not json'},
  {shop_id:'S2',shop_name:null,latitude:'abc',longitude:'51.4',weird_col:null,opening_hours:null},
  {shop_id:'S1',shop_name:'تکراری',latitude:'1',longitude:'1',weird_col:null,opening_hours:null}]}});
