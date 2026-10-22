'use strict';
const http=require('http'),fs=require('fs'),path=require('path');
const{Index}=require('./src/engine'),{loadDir,build}=require('./src/data/loader'),{TOOLS,run}=require('./src/tools');
const PUB=path.join(__dirname,'public'),T={'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css'};
const num=(v,lo,hi)=>{if(v==null||v==='')return undefined;const n=Number(v);return Number.isFinite(n)&&n>=lo&&n<=hi?n:NaN};
const inquiries=[];const STATUSES=['not_sent','pending','answered','failed'];
function createServer(data,{demo}={}){const ix=new Index(data),CATS=data.registry.cats;ix.registry=data.registry;
 const send=(r,c,o)=>{r.writeHead(c,{'content-type':'application/json;charset=utf-8'});r.end(JSON.stringify(o))};
 return http.createServer((q,r)=>{const u=new URL(q.url,'http://x'),g=k=>u.searchParams.get(k),p=u.pathname;
  try{
  if(p==='/api/meta')return send(r,200,{demo:!!demo,cats:CATS,statuses:STATUSES,mapProvider:null,routing:null,ai:!!process.env.LLM_API_KEY,dataOk:data.report.ok,counts:{products:ix.P.size,shops:ix.S.size}});
  if(p==='/api/options'||p==='/api/products'){const cat=g('cat');if(!CATS[cat])return send(r,400,{error:'bad_cat'});const sel={};for(const[k,v]of u.searchParams)if(!['cat','key','q'].includes(k)&&/^[a-z_0-9]{1,20}$/.test(k))sel[k]=v;
   if(p==='/api/options'){const key=g('key');if(!/^[a-z_0-9]{1,20}$/.test(key||''))return send(r,400,{error:'bad_key'});return send(r,200,ix.options({cat,sel},key))}
   return send(r,200,{items:ix.cands({cat,sel}).slice(0,50)})}
  if(p==='/api/search'){const s=(g('q')||'').slice(0,100);return send(r,200,{items:ix.cands({q:s}).slice(0,20)})}
  if(p==='/api/offers'){const pid=g('pid');if(!ix.P.has(pid))return send(r,404,{error:'unknown_product'});const lat=num(g('lat'),-90,90),lng=num(g('lng'),-180,180),rad=num(g('rad'),0,200),min=num(g('min'),0,1e12),max=num(g('max'),0,1e12);
   if([lat,lng,rad,min,max].some(Number.isNaN))return send(r,400,{error:'bad_param'});
   const o={loc:lat!=null&&lng!=null?{lat,lng}:null,rad,min,max,inst:g('inst')==='1',open:g('open')==='1',sort:g('sort')||'price'};
   const rows=ix.offers(pid,o);return send(r,200,{product:ix.P.get(pid),rows,alternatives:rows.length?[]:ix.alternatives(pid,{...o,rad:o.rad?o.rad*1.5:undefined}),distanceKind:'straight_line'})}
  if(p==='/api/inquiry'&&q.method==='POST'){let b='';q.on('data',c=>{b+=c;if(b.length>1e4)q.destroy()});q.on('end',()=>{let j;try{j=JSON.parse(b)}catch{return send(r,400,{error:'bad_json'})}
   if(!ix.S.has(j.shop)||!ix.P.has(j.product)||!['price','availability','hours','terms'].includes(j.topic))return send(r,400,{error:'bad_input'});
   // کانال واقعی (واتساپ/بله/تلفن) پیاده نشده؛ پرسش ارسال نمی‌شود و پاسخی جعل نمی‌شود
   const rec={id:inquiries.length+1,shop:j.shop,product:j.product,topic:j.topic,status:'not_sent',reason:'channel_not_connected',answer:null};inquiries.push(rec);send(r,200,rec)});return}
  if(p==='/api/report')return send(r,200,data.report);
  if(p==='/api/tools'&&q.method==='POST'){let b='';q.on('data',c=>{b+=c;if(b.length>1e4)q.destroy()});q.on('end',()=>{let j;try{j=JSON.parse(b)}catch{return send(r,400,{error:'bad_json'})}const out=run(ix,j&&j.name,j&&j.args);send(r,out.error?400:200,out)});return}
  if(p==='/api/tools')return send(r,200,TOOLS);
  if(p==='/api/chat')return send(r,process.env.LLM_API_KEY?501:503,{error:process.env.LLM_API_KEY?'adapter_not_implemented':'ai_not_configured'});
  if(p==='/api/health')return send(r,200,{ok:true});
  if(p.startsWith('/api/'))return send(r,404,{error:'not_found'});
  const f=path.resolve(PUB,'.'+(p==='/'?'/index.html':p));if(!f.startsWith(PUB+path.sep))return send(r,403,{error:'forbidden'});
  fs.readFile(f,(e,d)=>{if(e)return send(r,404,{error:'not_found'});r.writeHead(200,{'content-type':T[path.extname(f)]||'application/octet-stream'});r.end(d)})
  }catch(e){send(r,500,{error:'server_error'})}})}
module.exports={createServer};
if(require.main===module){const real=loadDir(process.env.DATA_DIR||path.join(__dirname,'data'));const data=real||build(require('./src/demo'),{demo:true});if(real)console.log(JSON.stringify(real.report.issues),real.report.errors);else console.log('داده‌ی نمونه (Demo) بارگذاری شد');
 createServer(data,{demo:!real}).listen(process.env.PORT||3000,()=>console.log('http://localhost:'+(process.env.PORT||3000)))}
