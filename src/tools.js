'use strict';
// قرارداد ابزارهای ایجنت (آماده اتصال؛ هنوز به هیچ مدلی وصل نیست). مدل فقط نام ابزار + آرگومان‌ها را می‌فرستد؛ اجرا و اعتبارسنجی سمت سرور است.
const{hoursStatus}=require('./engine');
const T=(name,description,parameters)=>({name,description,parameters});
exports.TOOLS=[
 T('search_products','جست‌وجوی محصول با عنوان/برند/مدل؛ اگر چند دسته یا نتیجه‌ی مبهم برگشت، از next_question یا ask_clarification استفاده کن',{q:'string',cat:'string?'}),
 T('next_question','بعدی‌ترین مشخصه‌ی نامعلوم (برند/رنگ/مدل/...) و گزینه‌های واقعاً موجود؛ done=true یعنی اطلاعات کافی است',{cat:'string?',sel:'object?'}),
 T('ask_clarification','وقتی اطلاعات ضروری نامشخص است سؤال تکمیلی بپرس (حدس نزن). فقط سؤال را برمی‌گرداند',{question:'string',options:'string[]?'}),
 T('extract_filters','گزینه‌های موجود یک مشخصه با فیلترهای فعلی',{cat:'string',key:'string',sel:'object?'}),
 T('compare_shops','مقایسه آفر فروشگاه‌ها برای یک محصول (فاصله خط مستقیم؛ موجودی همیشه تأییدنشده)',{product:'string',lat:'number?',lng:'number?',rad:'number?',min:'number?',max:'number?',inst:'boolean?',open:'boolean?',sort:'price|dist|smart?'}),
 T('check_hours','وضعیت ساعات کاری فروشگاه (open/closed/unknown)',{shop:'string'}),
 T('suggest_alternatives','جایگزین با تفاوت در یک مشخصه',{product:'string',lat:'number?',lng:'number?',rad:'number?'})];
function bad(spec,v){const opt=spec.endsWith('?'),s=opt?spec.slice(0,-1):spec;if(v===undefined||v===null)return opt?null:'الزامی است';
 if(s==='string')return typeof v==='string'&&v.length<=200?null:'باید رشته (حداکثر ۲۰۰) باشد';if(s==='number')return Number.isFinite(v)?null:'باید عدد باشد';if(s==='boolean')return typeof v==='boolean'?null:'باید boolean باشد';
 if(s==='object')return v&&typeof v==='object'&&!Array.isArray(v)?null:'باید آبجکت باشد';if(s==='string[]')return Array.isArray(v)&&v.length<=12&&v.every(x=>typeof x==='string'&&x.length<=100)?null:'باید آرایه‌ی رشته باشد';
 if(s.includes('|'))return s.split('|').includes(v)?null:'باید یکی از '+s+' باشد';return'نوع ناشناخته'}
exports.validate=(name,args)=>{const t=exports.TOOLS.find(x=>x.name===name);if(!t)return{error:'unknown_tool'};if(args==null||typeof args!=='object'||Array.isArray(args))return{error:'invalid_args',details:['args باید آبجکت باشد']};
 const d=[];for(const[k,s]of Object.entries(t.parameters)){const e=bad(s,args[k]);if(e)d.push(k+': '+e)}for(const k of Object.keys(args))if(!(k in t.parameters))d.push(k+': پارامتر ناشناخته');return d.length?{error:'invalid_args',details:d}:null};
exports.run=(ix,name,a={})=>{const v=exports.validate(name,a);if(v)return v;const cats=(ix.registry&&ix.registry.cats)||{},loc=Number.isFinite(a.lat)&&Number.isFinite(a.lng)?{lat:a.lat,lng:a.lng}:null;
 switch(name){
 case'search_products':return{items:ix.cands({q:a.q,cat:a.cat}).slice(0,20)};
 case'ask_clarification':return{type:'clarification',question:a.question,options:a.options||[]};
 case'next_question':{if(!a.cat||!cats[a.cat])return{type:'clarification',done:false,key:'cat',question:'چه دسته‌ای از محصول را می‌خواهید؟',options:Object.keys(cats)};
  const sel={...(a.sel||{})};for(const[key,label]of cats[a.cat].steps){if(sel[key]!==undefined)continue;const r=ix.options({cat:a.cat,sel},key);if(!r.options.length)continue;if(r.options.length===1&&!r.missing){sel[key]=String(r.options[0].v);continue}
   return{type:'clarification',done:false,key,label,question:'کدام '+label+'؟',options:r.options.map(o=>({v:o.v,shops:o.n})),missing:r.missing,sel}}
  return{done:true,sel,candidates:ix.cands({cat:a.cat,sel}).slice(0,20)}}
 case'extract_filters':return ix.options({cat:a.cat,sel:a.sel||{}},a.key);
 case'compare_shops':{if(!ix.P.has(a.product))return{error:'unknown_product'};return{distanceKind:'straight_line',availability:'unconfirmed',rows:ix.offers(a.product,{loc,rad:a.rad,min:a.min,max:a.max,inst:a.inst,open:a.open,sort:a.sort})}}
 case'check_hours':return ix.S.has(a.shop)?hoursStatus(ix.S.get(a.shop)):{error:'unknown_shop'};
 case'suggest_alternatives':return ix.P.has(a.product)?{items:ix.alternatives(a.product,{loc,rad:a.rad})}:{error:'unknown_product'}}};
