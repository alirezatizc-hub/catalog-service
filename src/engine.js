'use strict';
const DAYS={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
const valid=l=>!!l&&Number.isFinite(l.lat)&&Number.isFinite(l.lng)&&Math.abs(l.lat)<=90&&Math.abs(l.lng)<=180;
// فاصله مستقیم (خط صاف) — نه مسیر رانندگی
const hav=(a,b)=>{const r=x=>x*Math.PI/180,dl=r(b.lat-a.lat),dg=r(b.lng-a.lng),q=Math.sin(dl/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dg/2)**2;return 12742*Math.asin(Math.sqrt(q))};
const nm=x=>String(x??'').replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]).toLowerCase();
const tok=q=>nm(q).split(/\s+/).filter(w=>w.length>1);
const FMT=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tehran',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function tehranNow(now){const p={};for(const x of FMT.formatToParts(now))p[x.type]=x.value;return{day:DAYS[p.weekday],min:+p.hour*60+ +p.minute}}
// hours: آرایه ۷تایی (۰=یکشنبه) از [باز،بسته] ، null=تعطیل ، undefined/نامعتبر=نامشخص
function hoursStatus(shop,now=new Date(),tn){const h=shop&&shop.hours;if(!Array.isArray(h)||h.length!==7)return{state:'unknown'};const{day,min}=tn||tehranNow(now),d=h[day];if(d===null)return{state:'closed',note:'تعطیل'};if(!Array.isArray(d)||d.length!==2||!d.every(Number.isFinite))return{state:'unknown'};return{state:min>=d[0]*60&&min<d[1]*60?'open':'closed',open:d[0],close:d[1]}}
// اشتراک دو آرایه‌ی مرتب‌شده (دوپوینتر یا جست‌وجوی دودویی وقتی اندازه‌ها خیلی فرق دارند)
function intersect(a,b){if(a.length>b.length)[a,b]=[b,a];const r=[];if(a.length*16<b.length){for(const x of a){let lo=0,hi=b.length-1;while(lo<=hi){const m=(lo+hi)>>1;if(b[m]===x){r.push(x);break}b[m]<x?lo=m+1:hi=m-1}}return r}
 let i=0,j=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){r.push(a[i]);i++;j++}else a[i]<b[j]?i++:j++}return r}
class Index{
 constructor({products,shops,offers}){this.P=new Map(products.map(p=>[p.id,p]));this.S=new Map(shops.map(s=>[s.id,s]));this.byP=new Map();this.dropped=0;
  for(const o of offers){if(!this.P.has(o.product)||!this.S.has(o.shop)||!(o.price>0)){this.dropped++;continue}if(!this.byP.has(o.product))this.byP.set(o.product,[]);this.byP.get(o.product).push(o)}
  // ایندکس‌ها: items = محصولات دارای آفر به ترتیب درج؛ همه‌ی لیست‌ها بر حسب اندیس items مرتب‌اند
  this.items=[];this.nShops=[];this.catIdx=new Map();
  for(const p of this.P.values()){const os=this.byP.get(p.id);if(!os)continue;const i=this.items.length;this.items.push(p);this.nShops.push(new Set(os.map(o=>o.shop)).size);let l=this.catIdx.get(p.cat);if(!l)this.catIdx.set(p.cat,l=[]);l.push(i)}
  this._all=null;this._attr=new Map();this._hay=null;this._opt=new Map()}
 shopCount(pid){return new Set((this.byP.get(pid)||[]).map(o=>o.shop)).size}
 _allIdx(){return this._all||(this._all=this.items.map((_,i)=>i))}
 _attrIdx(key){let m=this._attr.get(key);if(m)return m;m=new Map();this.items.forEach((p,i)=>{const v=p[key];if(v==null)return;const k=String(v);let l=m.get(k);if(!l)m.set(k,l=[]);l.push(i)});this._attr.set(key,m);return m}
 _hayArr(){return this._hay||(this._hay=this.items.map(p=>nm([p.title_fa,p.title_en,p.brand,p.model,p.color,p.cat].filter(Boolean).join(' '))))}
 candIdx({cat,sel={},q}={}){const lists=[];if(cat)lists.push(this.catIdx.get(cat)||[]);for(const[k,v]of Object.entries(sel))lists.push(this._attrIdx(k).get(String(v))||[]);
  let r;if(!lists.length)r=this._allIdx();else{lists.sort((a,b)=>a.length-b.length);r=lists[0];for(let i=1;i<lists.length&&r.length;i++)r=intersect(r,lists[i])}
  const t=q?tok(q):[];if(t.length){const H=this._hayArr();r=r.filter(i=>{const h=H[i];return t.every(w=>h.includes(w))})}return r}
 cands(f={}){return this.candIdx(f).map(i=>this.items[i])}
 options(f,key){const ck=JSON.stringify([f.cat,f.sel,f.q,key]),hit=this._opt.get(ck);if(hit)return hit;const idx=this.candIdx(f),m=new Map();let missing=0;
  for(const i of idx){const v=this.items[i][key];if(v==null||v===''){missing++;continue}m.set(v,(m.get(v)||0)+this.nShops[i])}
  const r={total:idx.length,missing,options:[...m].map(([v,n])=>({v,n})).sort((a,b)=>b.n-a.n)};if(this._opt.size>500)this._opt.clear();this._opt.set(ck,r);return r}
 offers(pid,o={}){const tn=tehranNow(o.now||new Date());let out=[];for(const of of this.byP.get(pid)||[]){const s=this.S.get(of.shop),d=valid(o.loc)&&valid(s)?hav(o.loc,s):null,hs=hoursStatus(s,o.now,tn);
  if(o.rad&&d!=null&&d>o.rad)continue;if(o.inst&&s.installment!==true)continue;if(o.torobpay&&s.torobpay!==true)continue;if(o.kalabarg&&s.kalabarg!==true)continue;if(o.express&&s.express!==true)continue;if(o.min&&of.price<o.min)continue;if(o.max&&of.price>o.max)continue;if(o.open&&hs.state!=='open')continue;out.push({shop:s,offer:of,km:d,hours:hs})}
  const min=Math.min(...out.map(r=>r.offer.price));out.forEach(r=>{r.score=+(r.offer.price/min+0.03*(r.km||0)).toFixed(3)});
  const key={price:r=>r.offer.price,dist:r=>r.km??1e9,smart:r=>r.score}[o.sort]||(r=>r.offer.price);return out.sort((a,b)=>key(a)-key(b))}
 // فروشگاه‌های جایگزین برای همان محصول (وقتی فروشگاه انتخابی بسته/بی‌پاسخ است): اول بازها، بعد امتیاز ترکیبی
 backups(pid,shopId,o={}){const rows=this.offers(pid,{...o,rad:o.rad?o.rad*1.5:undefined,sort:'smart'}).filter(r=>r.shop.id!==shopId);return rows.filter(r=>r.hours.state==='open').concat(rows.filter(r=>r.hours.state!=='open')).slice(0,3)}
 priceRange(pid){const os=this.byP.get(pid)||[];if(!os.length)return{minPrice:null,maxPrice:null,shops:0};let lo=Infinity,hi=0;for(const o of os){if(o.price<lo)lo=o.price;if(o.price>hi)hi=o.price}return{minPrice:lo,maxPrice:hi,shops:this.shopCount(pid)}}
 alternatives(pid,o){const p=this.P.get(pid),r=[];if(!p)return r;const sel={};if(p.brand!=null)sel.brand=p.brand;if(p.model!=null)sel.model=p.model;
  for(const i of this.candIdx({cat:p.cat,sel})){const q=this.items[i];if(q.id===pid||q.brand!==p.brand||q.model!==p.model)continue;const diff=['color','ram','storage','size'].filter(k=>q[k]!==p[k]);if(diff.length!==1)continue;const rows=this.offers(q.id,o);if(rows.length)r.push({product:q,diff,best:rows[0]})}return r.slice(0,6)}
}
module.exports={Index,hav,valid,hoursStatus,nm,tok,intersect};
