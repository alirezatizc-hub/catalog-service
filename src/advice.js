'use strict';
// «حالا کجا بروم؟» — تصمیم‌یار خرید حضوری بر اساس داده‌ی واقعی دیتاست.
// هیچ‌چیز حدس زده نمی‌شود: هر جمله به یک آفر یا یک فروشگاه ثبت‌شده وصل است و
// چیزهایی که تأیید نشده‌اند با برچسب «تأییدنشده / ممکن است» نمایش داده می‌شوند.
const { hav, valid, hoursStatus, openAtArrival, tehranNow, nm } = require('./engine');

const walk = km => Math.max(1, Math.round(km / 4.5 * 60 + 6));       // پیاده + چند دقیقه یافتن مغازه
const drive = km => Math.max(3, Math.round(km * 1.35 / 18 * 60 + 6)); // خط مستقیم × ضریب خیابان، ۱۸ کیلومتر/ساعت ترافیک شهری
const ETA_KIND = process.env.ETA_MODE === 'walk' ? 'walk' : 'drive';
const etaOf = km => km == null ? null : (ETA_KIND === 'walk' ? walk(km) : drive(km));

const fa = n => Number(n).toLocaleString('fa-IR');
const priceLabel = p => p == null ? 'قیمت نامشخص' : fa(p) + ' تومان';
const fmtKm = km => km == null ? 'فاصله نامشخص' : (Math.round(km * 10) / 10).toLocaleString('fa-IR', { maximumFractionDigits: 1 }) + ' کیلومتر';
const fmtMin = m => m == null ? '' : (m < 60 ? fa(Math.round(m)) + ' دقیقه' : fa(Math.floor(m / 60)) + ' ساعت' + (Math.round(m % 60) ? ' و ' + fa(Math.round(m % 60)) + ' دقیقه' : ''));

// گروه‌بندی فروشگاه‌ها بر اساس «پاساژ/بازار» ثبت‌شده در آدرس + نزدیکی جغرافیایی
function hubsOf(ix, loc, { radKm = 6, cat = null, openOnly = false, now } = {}) {
  if (!valid(loc)) return [];
  const groups = new Map();
  for (const s of ix.geoShops) {
    const km = hav(loc, s);
    if (km > radKm) continue;
    const name = s.place && s.place.mall ? String(s.place.mall).replace(/\s+/g, ' ').trim() : null;
    const related = cat ? (s.cats || []).some(c => nm(c) === nm(cat) || nm(c).includes(nm(cat)) || nm(cat).includes(nm(c))) : false;
    const key = name ? 'm:' + nm(name) : null;
    if (!key) continue;
    const g = groups.get(key) || { name, shops: [], km: Infinity, openNow: 0, related: 0, sellsProduct: false, lat: 0, lng: 0, n: 0 };
    g.shops.push(s); g.km = Math.min(g.km, km);
    const hs = hoursStatus(s, now);
    if (hs.state === 'open') g.openNow++;
    if (related) g.related++;
    if (s.hasProducts) g.sellsProduct = true;
    g.lat += s.lat; g.lng += s.lng; g.n++;
    groups.set(key, g);
  }
  const out = [];
  for (const g of groups.values()) {
    const shops = g.shops.slice(0, 40);
    const entry = {
      name: g.name, km: +g.km.toFixed(1), shops: g.n, openNow: g.openNow, related: g.related,
      lat: +(g.lat / g.n).toFixed(6), lng: +(g.lng / g.n).toFixed(6),
      etaMin: etaOf(g.km),
      sample: shops.sort((a, b) => hav(loc, a) - hav(loc, b)).slice(0, 4).map(s => ({ id: s.id, name: s.name, open: hoursStatus(s, now).state, km: +hav(loc, s).toFixed(1), cats: (s.cats || []).slice(0, 3), hasProducts: !!s.hasProducts }))
    };
    if (openOnly && !g.openNow) continue;
    out.push(entry);
  }
  return out.sort((a, b) => (b.related - a.related) || (b.openNow - a.openNow) || (a.km - b.km)).slice(0, 8);
}

// فروشگاه‌هایی که همین دسته را دارند ولی این محصول را در ترب ثبت نکرده‌اند
function maybeShops(ix, pid, loc, { radKm = 4, now, exclude = new Set() } = {}) {
  const p = ix.P.get(pid);
  if (!p || !valid(loc)) return [];
  const out = [];
  for (const s of ix.geoShops) {
    if (exclude.has(s.id)) continue;
    const km = hav(loc, s);
    if (km > radKm) continue;
    const related = (s.cats || []).some(c => nm(c) === nm(p.cat) || nm(c).includes(nm(p.cat)) || nm(p.cat).includes(nm(c)));
    if (!related) continue;
    out.push({ shop: s, km, hours: hoursStatus(s, now), etaMin: etaOf(km) });
  }
  return out.sort((a, b) => (a.hours.state === 'open' ? 0 : 1) - (b.hours.state === 'open' ? 0 : 1) || a.km - b.km).slice(0, 6);
}

function compact(row, now) {
  const s = row.shop;
  const hs = row.hours || hoursStatus(s, now);
  return {
    shop: {
      id: s.id, name: s.name, lat: s.lat, lng: s.lng, place: s.place, addr: s.addr, cats: (s.cats || []).slice(0, 4),
      tel: s.tel, wa: s.wa, bale: s.bale, ig: s.ig, web: s.web,
      installment: s.installment, torobpay: s.torobpay, kalabarg: s.kalabarg, express: s.express,
      providers: s.providers, pay: s.pay, hasProducts: !!s.hasProducts
    },
    offer: { price: row.offer.price, updated: row.offer.updated, warranty: row.offer.warranty, seller: row.offer.seller },
    km: row.km == null ? null : +row.km.toFixed(1),
    etaMin: etaOf(row.km),
    hours: { state: hs.state, open: hs.open, close: hs.close, closeInMin: hs.closeInMin ?? null, next: hs.next || null, shifts: hs.shifts || null, note: hs.note || null }
  };
}

// توصیه‌ی اصلی: با شعاع دلخواه، بازها و بسته‌های نزدیک و دورتر را جدا می‌کند.
function advise(ix, pid, { loc, radKm = 2, maxKm = 15, now = new Date(), budget = null } = {}) {
  const product = ix.P.get(pid);
  if (!product) return null;
  const all = ix.offers(pid, { loc, now, sort: 'dist', ...(budget && budget.max ? { max: budget.max } : {}) });
  const rows = all.map(r => ({ ...r, hours: r.hours || hoursStatus(r.shop, now) }));
  const withKm = rows.filter(r => r.km != null);
  const near = withKm.filter(r => r.km <= radKm);
  const nearOpen = near.filter(r => r.hours.state === 'open');
  const nearClosed = near.filter(r => r.hours.state !== 'open');
  const farOpen = withKm.filter(r => r.km > radKm && r.hours.state === 'open').sort((a, b) => a.km - b.km);
  const unknown = near.filter(r => r.hours.state === 'unknown');
  const t = tehranNow(now);
  const lateNight = t.min >= 20 * 60 || t.min < 8 * 60;

  const cheapest = rows.length ? [...rows].sort((a, b) => a.offer.price - b.offer.price)[0] : null;
  const nearestOpen = [...nearOpen].sort((a, b) => (a.km - b.km))[0] || null;
  const nearestAny = [...near].sort((a, b) => a.km - b.km)[0] || null;

  // پیشنهاد پاساژ/بازار نزدیک: حتی وقتی محصول در ترب پیدا نشد، بدانیم کجا باید بگردیم
  const hubs = hubsOf(ix, loc, { radKm: Math.max(6, radKm * 2), cat: product.cat, now });
  const likelyHubs = hubs.filter(h => h.related > 0 || h.shops >= 3).slice(0, 4);
  const listings = new Set(rows.map(r => r.shop.id));
  const hopeful = maybeShops(ix, pid, loc, { radKm: Math.max(2, radKm), now, exclude: listings }).filter(x => x.hours.state === 'open');

  const honesty = [
    'قیمت‌ها همان چیزی است که فروشنده در ترب ثبت کرده؛ ممکن است قدیمی باشد.',
    'موجودی هیچ فروشگاهی در دیتاست نیامده؛ تا تماس/پرسش، «تأییدنشده» است.',
    'ساعت کاری فقط برای فروشگاه‌هایی که ثبت کرده‌اند نمایش داده می‌شود؛ بقیه «نامشخص» است.',
    'فاصله و زمان رسیدن تخمینی و بر پایه‌ی خط مستقیم است، نه مسیر واقعی رانندگی.'
  ];

  let verdict;
  if (nearOpen.length) {
    const r = nearestOpen;
    const cheaper = cheapest && cheapest.offer.price < r.offer.price ? cheapest.offer.price : null;
    verdict = {
      level: 'go', title: 'همین حالا می‌توانی بروی',
      text: `${r.shop.name} در ${fmtKm(r.km)} باز است (${s(now, r.shop)}). ${r.offer.price ? 'قیمت ثبت‌شده ' + priceLabel(r.offer.price) + ' است. ' : ''}${cheaper && r.offer.price - cheaper > 0 ? 'در ' + fmtKm(cheapest.km) + ' ارزان‌تر (' + priceLabel(cheaper) + ') هم هست، ولی آن فروشگاه الان باز نیست؛ اگر عجله داری همین گزینه مناسب‌تر است.' : ''}`,
      shop: r.shop.id, action: 'route'
    };
  } else if (farOpen.length) {
    const r = farOpen[0];
    verdict = {
      level: 'far', title: `نزدیک‌ترین فروشگاه باز، ${fmtKm(r.km)} دورتر است`,
      text: `در شعاع ${fmtKm(radKm)} هیچ فروشگاه بازی این محصول را ندارد. ${r.shop.name} در ${fmtKm(r.km)} باز است (${s(now, r.shop)}) و با تخمین ${fmtMin(etaOf(r.km))} می‌رسی.${likelyHubs[0] ? ` اگر این مسیر را نمی‌روی، ${likelyHubs[0].name} در ${fmtKm(likelyHubs[0].km)} هم ${likelyHubs[0].openNow ? fa(likelyHubs[0].openNow) + ' فروشگاه باز دارد' : 'نزدیک‌ترین خوشه‌ی فروشگاه هم‌دسته است'}؛ این محصول را در ترب ثبت نکرده‌اند ولی می‌توانی سر راه ببینی.` : ''} ${lateNight ? 'این ساعت انتخاب کم است؛ اگر تا فردا صبر کنی، گزینه‌های بیشتری در محدوده‌ات باز می‌شوند.' : ''}`,
      shop: r.shop.id, action: 'route'
    };
  } else if (near.length) {
    const nx = near.map(r => r.hours.next).filter(Boolean).sort((a, b) => a.inMin - b.inMin)[0];
    verdict = {
      level: 'closed', title: 'در محدوده‌ات الان چیزی باز نیست',
      text: `${fa(near.length)} فروشگاه این محصول را در ${fmtKm(radKm)} دارند ولی همه بسته‌اند${nx ? '؛ نزدیک‌ترین باز شدن ' + fmtMin(nx.inMin) + ' دیگر (' + nx.at + ')' : ''}. ${likelyHubs.length ? 'چون این ساعت است، '+likelyHubs[0].name+' را هم ببین؛ '+fa(likelyHubs[0].related || likelyHubs[0].shops)+' فروشگاه مرتبط در '+fmtKm(likelyHubs[0].km)+' آنجاست، هرچند این محصول را در ترب ثبت نکرده‌اند.' : ''}`,
      action: likelyHubs.length ? 'hub' : 'watch'
    };
  } else {
    verdict = {
      level: 'none', title: 'در این محدوده چیزی ثبت نشده',
      text: `برای «${product.title_fa || product.cat}» در ${fmtKm(radKm)} آفر ثبت‌شده‌ای در ترب نیست. محدوده را بزرگ‌تر کن یا به پاساژ/بازار نزدیک نگاه کن؛ ${hopeful.length ? fa(hopeful.length) + ' فروشگاه هم‌دسته نزدیک تو باز است.' : ''}`,
      action: 'widen'
    };
  }

  return {
    product: { id: product.id, title: product.title_fa || product.model, cat: product.cat, brand: product.brand || null },
    now: now.toISOString(), local: { day: t.day, minute: t.min }, lateNight, radiusKm: radKm, maxKm,
    verdict, honesty,
    openNow: [...nearOpen].sort((a, b) => a.km - b.km).slice(0, 6).map(r => compact(r, now)),
    closedNearby: nearClosed.filter(r => r.hours.state === 'closed').sort((a, b) => a.km - b.km).slice(0, 6).map(r => compact(r, now)),
    unknownHours: unknown.slice(0, 4).map(r => compact(r, now)),
    farther: farOpen.slice(0, 6).map(r => compact(r, now)),
    hubs: likelyHubs,
    maybeShops: hopeful.slice(0, 5).map(x => ({
      shop: { id: x.shop.id, name: x.shop.name, lat: x.shop.lat, lng: x.shop.lng, place: x.shop.place, cats: (x.shop.cats || []).slice(0, 4), tel: x.shop.tel, wa: x.shop.wa },
      km: +x.km.toFixed(1), etaMin: x.etaMin, hours: { state: x.hours.state, close: x.hours.close, closeInMin: x.hours.closeInMin ?? null },
      why: 'همین دسته فعالیت را دارد ولی این محصول را در ترب ثبت نکرده'
    })),
    cheapest: cheapest ? { shop: cheapest.shop.id, price: cheapest.offer.price, km: cheapest.km == null ? null : +cheapest.km.toFixed(1), open: cheapest.hours.state } : null,
    counts: { total: rows.length, near: near.length, nearOpen: nearOpen.length, farOpen: farOpen.length }
  };
}

// ساعت کاری قابل خواندن برای متن توصیه
function s(now, shop) {
  const hs = hoursStatus(shop, now);
  if (hs.state === 'open' && hs.closeInMin != null) {
    const close = hs.close != null ? Math.floor(hs.close) + ':' + String(Math.round((hs.close % 1) * 60)).padStart(2, '0') : null;
    return 'تا ساعت ' + (close || '؟') + ' باز است؛ ' + fmtMin(hs.closeInMin) + ' وقت داری';
  }
  if (hs.state === 'closed' && hs.next) return 'الان بسته است و ' + hs.next.at + ' باز می‌شود';
  return 'وضعیت ساعت کاری: ' + (hs.state === 'open' ? 'باز' : hs.state === 'closed' ? 'بسته' : 'نامشخص');
}

// برنامه‌ی مراجعه به چند فروشگاه: ترتیب نزدیک‌ترین همسایه + بررسی باز بودن در لحظه‌ی رسیدن
function planTrip(ix, pid, shopIds, { loc, now = new Date() } = {}) {
  const product = ix.P.get(pid);
  if (!product || !valid(loc) || !Array.isArray(shopIds) || !shopIds.length) return null;
  const rows = ix.offerList(pid).map(o => ({ offer: o, shop: ix.S.get(o.shop) })).filter(r => r.shop && shopIds.includes(r.shop.id));
  if (!rows.length) return null;
  const left = rows.slice();
  const plan = [];
  let cur = loc, tMin = 0;
  while (left.length) {
    let best = 0, bestKm = Infinity;
    left.forEach((r, i) => { const d = hav(cur, r.shop); if (d < bestKm) { bestKm = d; best = i; } });
    const r = left.splice(best, 1)[0];
    const eta = etaOf(bestKm) || 0;
    tMin += eta;
    const at = new Date(now.getTime() + tMin * 60000);
    const hs = hoursStatus(r.shop, at);
    plan.push({
      shop: r.shop.id, name: r.shop.name, place: r.shop.place, price: r.offer.price, lat: r.shop.lat, lng: r.shop.lng,
      kmFromPrev: +bestKm.toFixed(1), travelMin: eta, arriveInMin: tMin,
      arriveAt: at.toTimeString().slice(0, 5),
      state: hs.state, closeInMin: hs.closeInMin ?? null,
      willMakeIt: hs.state === 'open' && (hs.closeInMin == null || hs.closeInMin > 8),
      next: hs.next || null,
      tel: r.shop.tel, wa: r.shop.wa
    });
    cur = r.shop;
  }
  const reachable = plan.filter(p => p.willMakeIt);
  return {
    product: { id: product.id, title: product.title_fa },
    steps: plan, totalKm: +plan.reduce((a, p) => a + p.kmFromPrev, 0).toFixed(1),
    totalMin: tMin, reachable: reachable.length,
    note: plan.some(p => !p.willMakeIt) ? 'بعضی فروشگاه‌ها در لحظه‌ی رسیدن بسته‌اند؛ ترتیب را عوض کن یا آن‌ها را حذف کن.' : 'با این ترتیب، در لحظه‌ی رسیدن همه‌ی فروشگاه‌ها بازند (بر اساس ساعت ثبت‌شده).',
    distanceKind: 'straight_line'
  };
}

module.exports = { advise, planTrip, hubsOf, maybeShops, etaOf, fmtKm, fmtMin, ETA_KIND };
