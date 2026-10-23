'use strict';
// خلاصه‌ی تصمیم‌یار: فقط از اعداد همین نتایج ساخته می‌شود (بدون مدل زبانی، بدون حدس).
const STALE_H = 168; // یک هفته

const hoursOld = r => { const t = Date.parse(r.offer.updated); return Number.isNaN(t) ? null : (Date.now() - t) / 36e5; };

function buildInsight(rows) {
  if (!rows || !rows.length) return { picks: [], warnings: [] };
  const byPrice = [...rows].sort((a, b) => a.offer.price - b.offer.price)[0];
  const withKm = rows.filter(r => r.km != null);
  const byDist = withKm.length ? [...withKm].sort((a, b) => a.km - b.km)[0] : null;
  const bySmart = [...rows].sort((a, b) => a.score - b.score)[0];
  const picks = [];
  picks.push({ kind: 'cheapest', shop: byPrice.shop.id, price: byPrice.offer.price, km: byPrice.km, open: byPrice.hours.state });
  if (byDist && byDist.shop.id !== byPrice.shop.id) {
    picks.push({ kind: 'nearest', shop: byDist.shop.id, price: byDist.offer.price, km: byDist.km, open: byDist.hours.state, extra: byDist.offer.price - byPrice.offer.price, kmSaved: byPrice.km != null ? +(byPrice.km - byDist.km).toFixed(1) : null });
  }
  if (bySmart.shop.id !== byPrice.shop.id && (!byDist || bySmart.shop.id !== byDist.shop.id)) {
    picks.push({ kind: 'balanced', shop: bySmart.shop.id, price: bySmart.offer.price, km: bySmart.km, open: bySmart.hours.state });
  }
  const warnings = [];
  const unknownHours = rows.filter(r => r.hours.state === 'unknown').length;
  const closed = rows.filter(r => r.hours.state === 'closed').length;
  const stale = rows.filter(r => { const h = hoursOld(r); return h != null && h > STALE_H; }).length;
  const noTime = rows.filter(r => hoursOld(r) == null).length;
  if (closed) warnings.push({ kind: 'closed', n: closed });
  if (unknownHours) warnings.push({ kind: 'unknown_hours', n: unknownHours });
  if (stale) warnings.push({ kind: 'stale', n: stale });
  if (noTime) warnings.push({ kind: 'no_time', n: noTime });
  warnings.push({ kind: 'unconfirmed_stock', n: rows.length });
  return { picks, warnings };
}

module.exports = { buildInsight, STALE_H };
