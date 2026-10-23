'use strict';
// تصمیم‌یار فقط بر اساس پیشنهادهای واقعی موتور؛ بدون ساخت داده یا حدس.
const STALE_H = 168;
const hoursOld = r => { const t = Date.parse(r.offer && r.offer.updated); return Number.isNaN(t) ? null : (Date.now() - t) / 36e5; };
function buildInsight(rows) {
  if (!Array.isArray(rows) || !rows.length) return { picks: [], warnings: [] };
  const byPrice = [...rows].sort((a,b) => Number(a.offer.price)-Number(b.offer.price))[0];
  const withKm = rows.filter(r => Number.isFinite(r.km));
  const byDist = withKm.length ? [...withKm].sort((a,b) => a.km-b.km)[0] : null;
  const bySmart = [...rows].sort((a,b) => Number(a.score ?? Infinity)-Number(b.score ?? Infinity))[0];
  const picks = [];
  const pick = (kind,r,extra={}) => ({kind,shop:r.shop.id,price:r.offer.price,km:r.km,open:r.hours && r.hours.state,...extra});
  picks.push(pick('cheapest',byPrice));
  if (byDist && byDist.shop.id !== byPrice.shop.id) picks.push(pick('nearest',byDist,{extra:byDist.offer.price-byPrice.offer.price,kmSaved:byPrice.km!=null?+(byPrice.km-byDist.km).toFixed(1):null}));
  if (bySmart && bySmart.shop.id !== byPrice.shop.id && (!byDist || bySmart.shop.id !== byDist.shop.id)) picks.push(pick('balanced',bySmart));
  const warnings=[], hours=rows.filter(r=>r.hours);
  const closed=hours.filter(r=>r.hours.state==='closed').length, unknown=hours.filter(r=>r.hours.state==='unknown').length;
  const stale=rows.filter(r=>{const h=hoursOld(r);return h!=null&&h>STALE_H}).length, noTime=rows.filter(r=>hoursOld(r)==null).length;
  if(closed)warnings.push({kind:'closed',n:closed});
  if(unknown)warnings.push({kind:'unknown_hours',n:unknown});
  if(stale)warnings.push({kind:'stale',n:stale});
  if(noTime)warnings.push({kind:'no_time',n:noTime});
  warnings.push({kind:'unconfirmed_stock',n:rows.length});
  return {picks,warnings};
}
module.exports={buildInsight,STALE_H};
