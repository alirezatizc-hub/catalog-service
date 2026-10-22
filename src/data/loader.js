'use strict';
const fs=require('fs'),path=require('path'),S=require('./schema'),{nm}=require('../engine');
function parseCSV(t){const rows=[];let r=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++}else q=false}else f+=c}else if(c==='"')q=true;else if(c===','){r.push(f);f=''}else if(c==='\n'||c==='\r'){if(c==='\r'&&t[i+1]==='\n')i++;r.push(f);f='';if(r.some(x=>x!==''))rows.push(r);r=[]}else f+=c}r.push(f);if(r.some(x=>x!==''))rows.push(r);return rows}
function csvRows(text){const[h,...b]=parseCSV(text.replace(/^\uFEFF/,''));if(!h)return{cols:[],rows:[]};const cols=h.map(x=>x.trim());return{cols,rows:b.map(v=>Object.fromEntries(cols.map((k,i)=>[k,v[i]===undefined||v[i]===''?null:v[i]])))}}
const lat=s=>String(s).replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d));
// val: متن خام (نام/عنوان/آدرس/گارانتی بدون تغییر ارقام)؛ sv: مقدار مشخصه با ارقام یکسان‌شده برای ادغام گزینه‌ها
const val=v=>{if(v==null)return null;const s=String(Array.isArray(v)?v.join('، '):v).replace(/\s+/g,' ').trim();return s?s:null},sv=v=>{const s=val(v);return s&&lat(s)};
const bool=v=>v==null?null:/^(1|true|yes|بله)$/i.test(String(v).trim())?true:/^(0|false|no|خیر)$/i.test(String(v).trim())?false:null;
function json(v){if(v==null)return{v:null};if(typeof v!=='string')return{v};try{return{v:JSON.parse(v)}}catch{return{err:1}}}
function hoursOf(v){const j=json(v);if(j.err||j.v==null)return undefined;const a=j.v;if(!Array.isArray(a)||a.length!==7)return undefined;
 return a.map(d=>{if(d===null)return null;if(Array.isArray(d)&&d.length===2&&d.every(Number.isFinite))return d;if(typeof d==='string'){const m=lat(d).match(/(\d{1,2})(?::(\d\d))?\s*[-–]\s*(\d{1,2})(?::(\d\d))?/);if(m)return[+m[1]+(+m[2]||0)/60,+m[3]+(+m[4]||0)/60]}return undefined})}
function imagesOf(v){const j=json(v);let a=j.v;if(typeof a==='string')a=a.split(/[\s,;]+/);return Array.isArray(a)?a.filter(x=>typeof x==='string'&&/^https?:/.test(x)):[]}
// نگاشت فیلتر منطقی → ستون واقعی. اگر override داده شده باشد «جایگزین» نامزدها می‌شود (نه اضافه)؛ تطبیق بدون حساسیت به حروف/فاصله‌ی ابتدا و انتها.
function resolveCols(cols,cand,over={}){const lc=new Map(cols.map(c=>[String(c).trim().toLowerCase(),c])),res={},missing=[],overrideMisses=[];
 for(const[f,names]of Object.entries(cand)){const has=Object.prototype.hasOwnProperty.call(over,f),list=[].concat(has?over[f]:names),hit=list.map(n=>lc.get(String(n).trim().toLowerCase())).find(Boolean);if(hit)res[f]=hit;else{missing.push(f);if(has)overrideMisses.push({field:f,tried:list})}}
 const by={};for(const[f,c]of Object.entries(res))(by[c]=by[c]||[]).push(f);const duplicates=Object.entries(by).filter(([,v])=>v.length>1).map(([column,fields])=>({column,fields}));
 const used=new Set(Object.values(res));return{resolved:res,missing,overrideMisses,duplicates,unknown:cols.filter(c=>!used.has(c))}}
const TOP=['CONFIRMED','SHOP_CANDIDATES','SHOPS','SPEC_ALIASES','EXTRA','CORE'];
function validateSchema(sc,SC){const w=[];if(!sc||typeof sc!=='object'||Array.isArray(sc))return['mapping باید یک آبجکت JSON باشد'];const ok=v=>typeof v==='string'||(Array.isArray(v)&&v.every(x=>typeof x==='string'));
 for(const k of Object.keys(sc))if(!TOP.includes(k))w.push('کلید ناشناخته در mapping: '+k);
 const fields=['id',...Object.keys(SC)];for(const[f,v]of Object.entries(sc.SHOPS||{})){if(!fields.includes(f))w.push('فیلد ناشناخته در SHOPS: '+f);if(!ok(v))w.push('مقدار SHOPS.'+f+' باید رشته یا آرایه‌ی رشته باشد')}
 for(const[t,o]of Object.entries(sc.CONFIRMED||{})){if(!S.CONFIRMED[t]){w.push('جدول ناشناخته در CONFIRMED: '+t);continue}for(const[f,v]of Object.entries(o||{})){if(!(f in S.CONFIRMED[t]))w.push('فیلد ناشناخته در CONFIRMED.'+t+': '+f);if(typeof v!=='string')w.push('مقدار CONFIRMED.'+t+'.'+f+' باید رشته باشد')}}
 for(const[f,v]of Object.entries(sc.SPEC_ALIASES||{}))if(!Array.isArray(v)||!v.every(x=>typeof x==='string'))w.push('SPEC_ALIASES.'+f+' باید آرایه‌ی رشته باشد');return w}
function build(raw,{schema=S,demo=false}={}){
 const CF=S.merge(S.CONFIRMED,schema.CONFIRMED),SC={...S.SHOP_CANDIDATES,...(schema.SHOP_CANDIDATES||{})},AL={...S.SPEC_ALIASES,...(schema.SPEC_ALIASES||{})},EX={...S.EXTRA,...(schema.EXTRA||{})},CORE=schema.CORE||S.CORE;
 const rep={ok:true,errors:[],warnings:validateSchema(schema,SC),tables:{},issues:{badShops:0,badProducts:0,badOffers:0,orphanOffers:0,badHours:0,badSpecs:0,badCoords:0,badPrice:0},specs:{}};
 const need=(t,cands,over)=>{const r=resolveCols(raw[t].cols,Object.fromEntries(Object.entries(cands).map(([k,v])=>[k,[v]])));const mc=r.missing.map(f=>cands[f]);rep.tables[t]={rows:raw[t].rows.length,missingColumns:mc,unknownColumns:r.unknown};if(mc.length){rep.ok=false;rep.errors.push(t+': ستون ضروری یافت نشد: '+mc.join(', '))}return r.resolved};
 const PC=need('products',CF.products),OC=need('offers',CF.offers);
 const shr=resolveCols(raw.shops.cols,{id:[CF.shops.id],...SC},schema.SHOPS||{});rep.tables.shops={rows:raw.shops.rows.length,resolved:shr.resolved,missingFields:shr.missing,unknownColumns:shr.unknown,overrideMisses:shr.overrideMisses,duplicateColumns:shr.duplicates,note:'نگاشت ستون‌های shops به‌جز id تأییدنشده است'};
 for(const d of shr.duplicates)rep.warnings.push('یک ستون به چند فیلد نگاشت شده: '+d.column+' ← '+d.fields.join(', '));for(const m of shr.overrideMisses)rep.warnings.push('ستون override یافت نشد برای '+m.field+': '+m.tried.join(' | '));
 if(!shr.resolved.id){rep.ok=false;rep.errors.push('shops: ستون '+CF.shops.id+' یافت نشد')}
 if(!rep.ok)return{products:[],shops:[],offers:[],registry:{cats:{}},report:rep};
 const shops=[],sid=new Set(),SR=shr.resolved,g=(r,k)=>SR[k]?r[SR[k]]:null;
 for(const r of raw.shops.rows){const id=val(r[SR.id]);if(!id||sid.has(id)){rep.issues.badShops++;continue}let la=null,ln=null;if(SR.lat&&SR.lng){la=parseFloat(lat(g(r,'lat')));ln=parseFloat(lat(g(r,'lng')));if(!(Math.abs(la)<=90)||!(Math.abs(ln)<=180)){la=ln=null;rep.issues.badCoords++}}
  const hrs=hoursOf(g(r,'hours'));if(g(r,'hours')!=null&&hrs===undefined)rep.issues.badHours++;sid.add(id);
  shops.push({id,name:val(g(r,'name'))||'نامشخص',mall:val(g(r,'address')),lat:la,lng:ln,hours:hrs,installment:bool(g(r,'installment')),torobpay:bool(g(r,'torobpay')),kalabarg:bool(g(r,'kalabarg')),express:bool(g(r,'express')),tel:val(g(r,'phone')),wa:val(g(r,'whatsapp')),bale:val(g(r,'bale')),demo})}
 // محصولات + استخراج specs
 const parsed=[],pid=new Set(),keyCount=new Map(),matched=new Set();
 for(const r of raw.products.rows){const id=val(r[PC.id]);if(!id||pid.has(id)||!(val(r[PC.title_fa])||val(r[PC.model]))){rep.issues.badProducts++;continue}pid.add(id);
  const j=json(r[PC.specs]);if(j.err)rep.issues.badSpecs++;const kv=new Map();
  if(Array.isArray(j.v))for(const e of j.v){const k=e&&val(e.key),v=e&&sv(e.value);if(k&&v&&!kv.has(k))kv.set(k,v)}
  const p={id,cat:val(r[PC.cat])||'نامشخص',title_fa:val(r[PC.title_fa]),brand:val(r[PC.brand])??undefined,model:val(r[PC.model])??undefined,image:imagesOf(r[PC.images])[0],demo};
  for(const[lk,names]of Object.entries(AL)){const hit=names.find(n=>kv.has(nm(n))||kv.has(n));if(hit){p[lk]=kv.get(kv.has(hit)?hit:nm(hit));kv.delete(kv.has(hit)?hit:nm(hit));matched.add(lk)}}
  for(const k of kv.keys()){const ck=p.cat+'\u0000'+k;keyCount.set(ck,(keyCount.get(ck)||0)+1)}parsed.push([p,kv])}
 // offers (join با شناسه)
 const offers=[],used=new Set(),OK=OC;
 for(const r of raw.offers.rows){const price=Number(lat(r[OK.price]||'').replace(/[,٬\s]/g,'')),pr=val(r[OK.product]),sh=val(r[OK.shop]);
  if(!(price>0)){rep.issues.badPrice++;rep.issues.badOffers++;continue}if(!pid.has(pr)||!sid.has(sh)){rep.issues.orphanOffers++;rep.issues.badOffers++;continue}
  const t=Date.parse(r[OK.updated]);used.add(pr);offers.push({shop:sh,product:pr,price,unit:'تومان',updated:isNaN(t)?null:new Date(t).toISOString(),warranty:val(r[OK.warranty])??undefined,seller:val(r[OK.seller])??undefined,description:val(r[OK.description])??undefined,demo})}
 // ثبت فیلترهای پویا برای هر دسته
 const products=parsed.filter(([p])=>used.has(p.id)),cats={},byCat={};products.forEach(([p])=>(byCat[p.cat]=byCat[p.cat]||[]).push(p));
 let xi=0;const xid=new Map();
 for(const[cat,list]of Object.entries(byCat)){const steps=[],cov=k=>list.filter(p=>p[k]!=null).length;for(const[k,l]of CORE)if(cov(k)>0)steps.push([k,l]);
  const cands=[...keyCount].filter(([ck])=>ck.startsWith(cat+'\u0000')).map(([ck,n])=>[ck.slice(cat.length+1),n]).filter(([,n])=>n/list.length>=EX.minCoverage).sort((a,b)=>b[1]-a[1]);
  const vals=k=>new Set(products.filter(([p])=>p.cat===cat).map(([,kv])=>kv.get(k)).filter(Boolean)).size;let n=0;
  for(const[k]of cands){if(n>=EX.maxFilters)break;const c=vals(k);if(c<2||c>EX.maxValues)continue;const id=xid.get(k)||(xid.set(k,'x'+(++xi)),'x'+xi);steps.push([id,k]);n++}
  cats[cat]={name:cat,count:list.length,steps}}
 const keyOf=new Map([...xid].map(([k,id])=>[id,k]));
 for(const[p,kv]of products)for(const[id,k]of keyOf)if(kv.has(k))p[id]=kv.get(k);
 const top={};for(const[ck,n]of keyCount){const k=ck.split('\u0000')[1];top[k]=(top[k]||0)+n}
 rep.specs={productsWithSpecs:parsed.filter(([,kv])=>kv.size).length,matchedCore:[...matched],unmatchedCore:Object.keys(AL).filter(k=>!matched.has(k)),topKeys:Object.entries(top).sort((a,b)=>b[1]-a[1]).slice(0,40)};
 rep.counts={products:products.length,shops:shops.length,offers:offers.length};
 return{products:products.map(([p])=>p),shops,offers,registry:{cats},report:rep}}
function readTable(dir,name){for(const ext of['csv','json']){const f=path.join(dir,name+'.'+ext);if(!fs.existsSync(f))continue;const t=fs.readFileSync(f,'utf8');if(ext==='csv')return csvRows(t);const a=JSON.parse(t);const cols=[...new Set(a.flatMap(Object.keys))];return{cols,rows:a.map(o=>Object.fromEntries(cols.map(c=>[c,o[c]==null||o[c]===''?null:typeof o[c]==='object'?JSON.stringify(o[c]):String(o[c])])))}}return null}
function loadDir(dir){const raw={products:readTable(dir,'products'),offers:readTable(dir,'offers'),shops:readTable(dir,'shops')};if(!raw.products||!raw.offers||!raw.shops)return null;
 let schema={};const mf=path.join(dir,'mapping.json');if(fs.existsSync(mf)){try{schema=JSON.parse(fs.readFileSync(mf,'utf8'))}catch(e){return{products:[],shops:[],offers:[],registry:{cats:{}},report:{ok:false,errors:['mapping.json نامعتبر است: '+e.message],warnings:[],tables:{},issues:{},specs:{}}}}}return build(raw,{schema})}
module.exports={parseCSV,csvRows,build,loadDir,resolveCols,validateSchema};
