// ساعت کاری: روز هفته، بازه، مرز، داده ناقص. زمان تهران = UTC+3:30 (بدون DST). ۲۰۲۶-۱۰-۲۵ یکشنبه است.
const t=require('node:test'),a=require('node:assert');const{hoursStatus}=require('../src/engine');
const at=(day,h,m=0)=>new Date(Date.UTC(2026,9,25+day,h-3,m-30));
const week=Array.from({length:7},(_,d)=>d===5?null:[9,20.5]);
t.test('هر روز هفته (۰=یکشنبه…۶=شنبه): جمعه تعطیل، بقیه باز',()=>{for(let d=0;d<7;d++){const s=hoursStatus({hours:week},at(d,12));a.equal(s.state,d===5?'closed':'open','روز '+d)}});
t.test('مرز بازه: لحظه‌ی باز‌شدن باز، لحظه‌ی بسته‌شدن بسته (بازه‌ی نیم‌باز)',()=>{const h={hours:week};a.equal(hoursStatus(h,at(1,8,59)).state,'closed');a.equal(hoursStatus(h,at(1,9,0)).state,'open');a.equal(hoursStatus(h,at(1,20,29)).state,'open');a.equal(hoursStatus(h,at(1,20,30)).state,'closed')});
t.test('ساعت اعشاری و ۲۴ ساعته',()=>{a.equal(hoursStatus({hours:Array(7).fill([0,24])},at(3,23,59)).state,'open');a.equal(hoursStatus({hours:Array(7).fill([9.5,10])},at(3,9,29)).state,'closed')});
t.test('داده ناقص هرگز باز/بسته حدس زده نمی‌شود → unknown',()=>{for(const h of[undefined,null,[],[1,2],'x',Array(7).fill('?'),Array(7).fill([9]),Array(7).fill([9,'x']),Array(7).fill([NaN,20])])a.equal(hoursStatus({hours:h},at(1,12)).state,'unknown',JSON.stringify(h));a.equal(hoursStatus(undefined).state,'unknown')});
t.test('فقط روز ناقص نامشخص است؛ روزهای دیگر معتبرند',()=>{const h=[...week];h[2]='?';a.equal(hoursStatus({hours:h},at(2,12)).state,'unknown');a.equal(hoursStatus({hours:h},at(3,12)).state,'open')});
t.test('عبور از نیمه‌شب UTC: ۰۱:۰۰ تهران همان روز تهران است',()=>{const d=new Date(Date.UTC(2026,9,25,21,40));/* 01:10 دوشنبه تهران */const h=Array(7).fill(null);h[1]=[0,2];a.equal(hoursStatus({hours:h},d).state,'open')});
