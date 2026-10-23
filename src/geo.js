'use strict';
// سرویس نقشه و مسیریابی.
// • نقشه: Leaflet در مرورگر + کاشی‌های رستری. پیش‌فرض OpenStreetMap (بدون کلید)؛ با MAP_TILE_URL می‌توان هر سرویس کاشی دیگر را گذاشت.
// • مسیریابی (اختیاری): API مسیریابی «نشان» (Neshan Direction). کلید فقط روی سرور می‌ماند و مرورگر از /api/route می‌گیرد.
//   ⚠ مستندات پلتفرم نشان برای ربات‌ها بسته بود و آدرس/ساختار زیر از حافظه نوشته شده و تأیید نشده؛ اگر فرق داشت فقط همین فایل را اصلاح کنید.
//   تا کلید تنظیم نشود یا وقتی سرویس خطا بدهد، همه‌چیز با «فاصله‌ی خط مستقیم» و برچسب صادقانه کار می‌کند.
const KEYS = ['NESHAN_SERVICE_KEY', 'NESHAN_API_KEY', 'NESHAN_KEY'];
const key = (env = process.env) => { for (const k of KEYS) if (env[k]) return env[k]; return null; };

function mapConfig(env = process.env) {
  const tiles = env.MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const custom = !!env.MAP_TILE_URL;
  return {
    provider: custom ? 'custom' : 'osm',
    tiles,
    attribution: env.MAP_TILE_ATTRIBUTION || (custom ? '' : '© OpenStreetMap contributors'),
    maxZoom: Number(env.MAP_MAX_ZOOM) || 19,
    routing: !!key(env)
  };
}

// رمزگشایی polyline گوگل/نشان (دقت ۵ رقم)
function decodePolyline(str) {
  const out = []; let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    for (const axis of [0, 1]) {
      let shift = 0, result = 0, b;
      do { b = str.charCodeAt(i++) - 63; result |= (b & 31) << shift; shift += 5; } while (b >= 32 && i <= str.length);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      axis ? (lng += d) : (lat += d);
    }
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}

const cache = new Map();
async function route(from, to, { env = process.env, fetchImpl = fetch } = {}) {
  const k = key(env);
  if (!k) return null;
  const ck = [from.lat, from.lng, to.lat, to.lng].map(x => x.toFixed(4)).join(',');
  if (cache.has(ck)) return cache.get(ck);
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 4000);
  try {
    const url = (env.NESHAN_DIRECTION_URL || 'https://api.neshan.org/v4/direction') + '?type=car&origin=' + from.lat + ',' + from.lng + '&destination=' + to.lat + ',' + to.lng;
    const r = await fetchImpl(url, { headers: { 'Api-Key': k }, signal: ac.signal });
    if (!r.ok) return null;
    const j = await r.json(), rt = j && j.routes && j.routes[0], leg = rt && rt.legs && rt.legs[0];
    if (!leg || !leg.distance || !leg.duration) return null;
    let line = [];
    if (rt.overview_polyline && rt.overview_polyline.points) line = decodePolyline(rt.overview_polyline.points);
    else if (Array.isArray(leg.steps)) for (const s of leg.steps) if (s.polyline) line = line.concat(decodePolyline(s.polyline));
    const res = { kind: 'driving', km: +(leg.distance.value / 1000).toFixed(1), minutes: Math.max(1, Math.round(leg.duration.value / 60)), polyline: line };
    if (cache.size > 500) cache.clear();
    cache.set(ck, res);
    return res;
  } catch { return null; } finally { clearTimeout(t); }
}

module.exports = { mapConfig, route, decodePolyline, key, KEYS };
