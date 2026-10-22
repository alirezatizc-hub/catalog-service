// بنچمارک آزمایشی روی داده‌ی مصنوعی هم‌اندازه (۲۲۵٬۹۰۳ محصول، ≈۳۳۱٬۵۰۶ آفر، ۶٬۴۷۶ فروشگاه) — داده‌ی واقعی ترب نیست.
const{performance:P}=require('perf_hooks'),{Index}=require('../src/engine'),L=require('../test/legacy'),{synth}=require('../test/synth');
const med=a=>a.sort((x,y)=>x-y)[a.length>>1],time=(f,n=15)=>{const r=[];for(let i=0;i<n;i++){const t=P.now();f();r.push(P.now()-t)}return med(r)};
let t=P.now();const d=synth(225903);console.log('تولید داده‌ی مصنوعی',Math.round(P.now()-t),'ms | محصول',d.products.length,'آفر',d.offers.length,'فروشگاه',d.shops.length);
global.gc&&gc();const m0=process.memoryUsage().heapUsed;t=P.now();const ix=new Index(d);const tb=P.now()-t;global.gc&&gc();console.log('ساخت Index:',Math.round(tb),'ms | محصول دارای آفر',ix.items.length,'| heap تقریبی (با gc)',Math.round((process.memoryUsage().heapUsed-m0)/1e6),'MB (شامل داده)');
const phone={cat:'گوشی موبایل',sel:{}},b=d.brands[3],cases=[
 ['options برند در یک دسته',()=>ix.options(phone,'brand'),()=>L.options(ix,phone,'brand'),1],
 ['options رنگ | دسته+برند',()=>ix.options({cat:'گوشی موبایل',sel:{brand:b}},'color'),()=>L.options(ix,{cat:'گوشی موبایل',sel:{brand:b}},'color'),1],
 ['options مدل | دسته+برند+رنگ',()=>ix.options({cat:'گوشی موبایل',sel:{brand:b,color:'آبی'}},'model'),()=>L.options(ix,{cat:'گوشی موبایل',sel:{brand:b,color:'آبی'}},'model'),1],
 ['cands | دسته+برند+رنگ+رم+حافظه',()=>ix.cands({cat:'گوشی موبایل',sel:{brand:b,color:'آبی',ram:'8',storage:'256'}}),()=>L.cands(ix,{cat:'گوشی موبایل',sel:{brand:b,color:'آبی',ram:'8',storage:'256'}}),1],
 ['متن یک‌کلمه‌ای (برند)',()=>ix.cands({q:b}),()=>L.cands(ix,{q:b}),1],
 ['متن دوکلمه‌ای + دسته',()=>ix.cands({cat:'گوشی موبایل',q:b+' آبی'}),()=>L.cands(ix,{cat:'گوشی موبایل',q:b+' آبی'}),1]];
// سرد: اولین فراخوانی هر ایندکس (ساخت lazy)
t=P.now();ix.options(phone,'brand');ix.cands({sel:{brand:b,color:'آبی',ram:'8',storage:'256',model:'x'}});const cold=P.now()-t;t=P.now();ix.cands({q:'برند1'});const coldText=P.now()-t;
console.log('اولین فراخوانی (ساخت lazy ایندکس ویژگی‌ها):',cold.toFixed(1),'ms | اولین جست‌وجوی متنی (ساخت hay):',coldText.toFixed(1),'ms');
console.log('\nمیانه‌ی ۱۵ اجرا (ms) — گرم');console.log('سناریو'.padEnd(36),'ایندکس'.padStart(9),'قبلی'.padStart(9),'نسبت'.padStart(7));
for(const[n,f,g]of cases){ix._opt.clear();const a=time(()=>{ix._opt.clear();f()}),c=time(g,5);console.log(n.padEnd(36),a.toFixed(2).padStart(9),c.toFixed(2).padStart(9),(c/a).toFixed(0).padStart(6)+'×')}
