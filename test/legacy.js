// پیاده‌سازی مرجع (روش قبلی: پیمایش کامل) فقط برای تست مقایسه‌ای و بنچمارک
const{nm,tok}=require('../src/engine');
exports.cands=(ix,{cat,sel={},q}={})=>{const t=q?tok(q):[],out=[];for(const p of ix.P.values()){if(!ix.byP.has(p.id)||(cat&&p.cat!==cat))continue;if(Object.entries(sel).some(([k,v])=>String(p[k])!==String(v)))continue;
 if(t.length){const hay=nm([p.title_fa,p.title_en,p.brand,p.model,p.color,p.cat].filter(Boolean).join(' '));if(!t.every(w=>hay.includes(w)))continue}out.push(p)}return out};
exports.options=(ix,f,key)=>{const m=new Map();let missing=0;const c=exports.cands(ix,f);for(const p of c){const v=p[key];if(v==null||v===''){missing++;continue}m.set(v,(m.get(v)||0)+ix.shopCount(p.id))}
 return{total:c.length,missing,options:[...m].map(([v,n])=>({v,n})).sort((a,b)=>b.n-a.n)}};
exports.alternatives=(ix,pid,o)=>{const p=ix.P.get(pid),r=[];if(!p)return r;for(const q of ix.P.values()){if(q.id===pid||q.cat!==p.cat||q.brand!==p.brand||q.model!==p.model)continue;const diff=['color','ram','storage','size'].filter(k=>q[k]!==p[k]);if(diff.length!==1)continue;const rows=ix.offers(q.id,o);if(rows.length)r.push({product:q,diff,best:rows[0]})}return r.slice(0,6)};
