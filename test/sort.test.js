// مرتب‌سازی، فیلترها و اتصال آفر–فروشگاه با شناسه (داده‌ی آزمایشی)
const t=require('node:test'),a=require('node:assert');const{Index}=require('../src/engine');
const sh=(id,lat,lng,x={})=>({id,name:'همنام',lat,lng,hours:Array(7).fill([0,24]),installment:null,...x});
const mk=()=>new Index({products:[{id:'p',cat:'c',title_fa:'محصول'}],shops:[sh('A',35.70,51.40,{installment:true}),sh('B',35.75,51.40),sh('C',35.80,51.40,{hours:undefined}),sh('N',null,null)],
 offers:[{shop:'A',product:'p',price:1000},{shop:'B',product:'p',price:800},{shop:'C',product:'p',price:900},{shop:'N',product:'p',price:700}]});
const loc={lat:35.70,lng:51.40},ids=r=>r.map(x=>x.shop.id);
t.test('قیمت: صعودی',()=>a.deepEqual(ids(mk().offers('p',{loc,sort:'price'})),['N','B','C','A']));
t.test('فاصله: صعودی و فروشگاه بدون مختصات آخر',()=>a.deepEqual(ids(mk().offers('p',{loc,sort:'dist'})),['A','B','C','N']));
t.test('ترکیبی: price/minPrice + 0.03×km، شفاف و قابل بازتولید',()=>{const r=mk().offers('p',{loc,sort:'smart'});r.forEach(x=>{const e=+(x.offer.price/700+0.03*(x.km||0)).toFixed(3);a.equal(x.score,e)});a.deepEqual(r.map(x=>x.score),[...r.map(x=>x.score)].sort((x,y)=>x-y))});
t.test('مرتب‌سازی ناشناخته → قیمت',()=>a.deepEqual(ids(mk().offers('p',{loc,sort:'zzz'})),['N','B','C','A']));
t.test('فاصله مستقیم (خط صاف) درست است: ۰٫۰۵° عرض ≈ ۵٫۵۶ کیلومتر',()=>{const r=mk().offers('p',{loc}).find(x=>x.shop.id==='B');a.ok(Math.abs(r.km-5.56)<.05)});
t.test('شعاع، اقساط، فقط‌باز، بودجه — ترکیب AND',()=>{const ix=mk();a.deepEqual(ids(ix.offers('p',{loc,rad:6})).sort(),['A','B','N']);a.deepEqual(ids(ix.offers('p',{loc,inst:true})),['A']);a.deepEqual(ids(ix.offers('p',{loc,open:true})).sort(),['A','B','N']);a.deepEqual(ids(ix.offers('p',{loc,min:850,max:950})),['C'])});
t.test('بدون موقعیت: فاصله null و شعاع اعمال نمی‌شود',()=>{const r=mk().offers('p',{rad:1});a.equal(r.length,4);a.ok(r.every(x=>x.km===null))});
t.test('اتصال فقط با شناسه: فروشگاه‌های همنام با آفرهای جدا قاطی نمی‌شوند',()=>{const ix=mk();const r=ix.offers('p',{loc});a.equal(new Set(r.map(x=>x.shop.id)).size,4);a.equal(r.find(x=>x.shop.id==='B').offer.price,800)});
t.test('هیچ آفری موجودی «تأییدشده» ندارد',()=>{for(const r of mk().offers('p',{loc}))a.ok(!('conf'in r.offer)&&!('available'in r.offer)&&!('stock'in r.offer))});
