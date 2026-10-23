const t=require('node:test'),a=require('node:assert');const{createServer}=require('../server'),{build}=require('../src/data/loader'),demo=build(require('./fixture-mini'));
let s,b;t.before(()=>new Promise(r=>{s=createServer(demo).listen(0,()=>{b='http://localhost:'+s.address().port;r()})}));t.after(()=>s.close());
const j=async(p,o)=>{const r=await fetch(b+p,o);return[r.status,await r.json().catch(()=>null)]};
t.test('meta و گزینه‌ها',async()=>{const[c,m]=await j('/api/meta');a.equal(c,200);a.ok(m.ready===true);const[,o]=await j('/api/options?cat='+encodeURIComponent('گوشی موبایل')+'&key=brand');a.ok(o.options.some(x=>x.v==='سامسونگ'))});
t.test('ورودی نامعتبر',async()=>{a.equal((await j('/api/options?cat=zzz&key=brand'))[0],400);a.equal((await j('/api/offers?pid=p0&lat=999'))[0],400);a.equal((await j('/api/offers?pid=nope'))[0],404)});
t.test('پاسخ ساختگی فروشنده وجود ندارد',async()=>{const[c,r]=await j('/api/inquiry',{method:'POST',body:JSON.stringify({shop:'s0',product:'p0',topic:'availability'})});a.equal(c,200);a.equal(r.status,'not_sent');a.equal(r.answer,null)});
t.test('AI بدون کلید و مسیر فایل ناامن',async()=>{delete process.env.LLM_API_KEY;a.equal((await j('/api/chat'))[0],503);const r=await fetch(b+'/..%2fserver.js');a.ok([403,404].includes(r.status))});
t.test('آفرها فاصله مستقیم برمی‌گردانند',async()=>{const[,d]=await j('/api/offers?pid=p0&lat=35.72&lng=51.41&rad=40');a.equal(d.distanceKind,'straight_line');a.ok(d.rows.every(r=>r.km==null||r.km>=0))});
