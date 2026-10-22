// ⚠ مولد داده‌ی «مصنوعی» برای تست مقایسه‌ای و بنچمارک — داده‌ی واقعی ترب نیست.
const rng=s=>()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
exports.rng=rng;
exports.synth=(N,{shops=6476,offerRatio=331506/225903,seed=7}={})=>{const R=rng(seed),pick=a=>a[Math.floor(R()*a.length)];
 const CATS=['گوشی موبایل','لپ‌تاپ','کفش کتانی','ساعت هوشمند','هدفون','تبلت','دوربین','لوازم جانبی'],colors=['آبی','مشکی','سفید','قرمز','سبز','بنفش','طوسی','طلایی','نقره‌ای','صورتی','نارنجی','زرد'],rams=['4','6','8','12','16'],sto=['64','128','256','512','1024'],sizes=['۳۸','۳۹','۴۰','۴۱','۴۲','۴۳','۴۴'];
 const brands=Array.from({length:80},(_,i)=>'برند'+(i+1)),models=brands.map((b,i)=>Array.from({length:30},(_,k)=>b+'-مدل'+(k+1)));
 const products=[],offers=[],S=[];for(let i=0;i<shops;i++)S.push({id:'s'+i,name:'ف'+i,lat:35.6+R()*.2,lng:51.3+R()*.2,hours:R()<.5?undefined:Array(7).fill([9,21]),installment:R()<.4?true:R()<.5?false:null});
 for(let i=0;i<N;i++){const cat=CATS[Math.floor(R()*R()*CATS.length)],bi=Math.floor(R()*brands.length),brand=brands[bi],model=pick(models[bi]),p={id:'p'+i,cat,title_fa:brand+' '+model,brand,model};
  if(R()<.9)p.color=pick(colors);if(cat==='گوشی موبایل'||cat==='لپ‌تاپ'){if(R()<.9)p.ram=pick(rams);if(R()<.9)p.storage=pick(sto)}if(cat==='کفش کتانی')p.size=pick(sizes);products.push(p)}
 const n=Math.round(N*offerRatio);for(let i=0;i<n;i++){const pi=i<N*.97?i:Math.floor(R()*N*.97);offers.push({shop:'s'+Math.floor(R()*shops),product:'p'+(pi%N),price:Math.round((1+R()*99)*1e5),unit:'تومان',updated:null})}
 return{products,shops:S,offers,brands,colors}};
