// مقایسه‌ی ایندکس با روش قبلی (پیمایش کامل) روی داده‌ی مصنوعی/آزمایشی
const t=require('node:test'),a=require('node:assert');const{Index,intersect}=require('../src/engine'),L=require('./legacy'),{synth,rng}=require('./synth');
const d=synth(6000,{shops:300,seed:11}),ix=new Index(d),R=rng(99),pick=x=>x[Math.floor(R()*x.length)];
const KEYS=['brand','color','model','ram','storage','size'];
const ids=l=>l.map(p=>p.id);
function randQuery(){const p=pick(ix.items),f={};if(R()<.8)f.cat=p.cat;const sel={};const n=Math.floor(R()*4);for(let i=0;i<n;i++){const k=pick(KEYS);if(p[k]!=null)sel[k]=R()<.1?'مقدار-ناموجود':p[k]}f.sel=sel;
 if(R()<.4){const w=p.title_fa.split(' ');f.q=R()<.5?w[0]:p.title_fa;if(R()<.3)f.q=f.q.replace(/\d/g,x=>'۰۱۲۳۴۵۶۷۸۹'[x]).replace('ی','ي')}return f}
t.test('intersect: درستی روی لیست‌های مرتب (دوپوینتر و دودویی)',()=>{for(let k=0;k<200;k++){const mk=n=>[...new Set(Array.from({length:n},()=>Math.floor(R()*500)))].sort((x,y)=>x-y);const A=mk(Math.floor(R()*20)),B=mk(Math.floor(R()*400));a.deepEqual(intersect(A,B),A.filter(x=>B.includes(x)))}});
t.test('cands: ایندکس == پیمایش کامل (۴۰۰ پرسش تصادفی، ترتیب هم یکسان)',()=>{let nonEmpty=0;for(let i=0;i<400;i++){const f=randQuery(),x=ids(ix.cands(f)),y=ids(L.cands(ix,f));a.deepEqual(x,y,JSON.stringify(f));if(y.length)nonEmpty++}a.ok(nonEmpty>150,'پرسش‌های غیرخالی کافی نبود: '+nonEmpty)});
t.test('options: ایندکس == روش قبلی (شامل شمارش فروشنده‌ها، missing و ترتیب)',()=>{for(let i=0;i<150;i++){const f=randQuery(),k=pick(KEYS);a.deepEqual(ix.options(f,k),L.options(ix,f,k),JSON.stringify([f,k]))}});
t.test('options: نتیجه‌ی کش‌شده هم یکسان است',()=>{const f={cat:'گوشی موبایل',sel:{}};a.deepEqual(ix.options(f,'brand'),ix.options(f,'brand'));a.deepEqual(ix.options(f,'brand'),L.options(ix,f,'brand'))});
t.test('alternatives: ایندکس == روش قبلی',()=>{let n=0;for(let i=0;i<60;i++){const p=pick(ix.items),o={loc:{lat:35.7,lng:51.4},rad:50},x=ix.alternatives(p.id,o),y=L.alternatives(ix,p.id,o);a.deepEqual(x.map(r=>[r.product.id,r.diff]),y.map(r=>[r.product.id,r.diff]));if(y.length)n++}a.ok(n>0)});
t.test('بدون فیلتر و فقط متن، فقط محصولات دارای آفر',()=>{const f={q:'برند5'};a.deepEqual(ids(ix.cands(f)),ids(L.cands(ix,f)));a.ok(ix.cands({}).length===ix.items.length&&ix.items.every(p=>ix.byP.has(p.id)))});
t.test('ویژگی ثبت‌نشده با مقدار ناموجود مطابقت نمی‌خورد (رفتار جدید عمدی؛ روش قبلی literal «undefined» را تطبیق می‌داد)',()=>{a.equal(ix.cands({sel:{color:'undefined'}}).length,0)});
