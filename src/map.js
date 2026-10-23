'use strict';
// پوشش نازک روی Leaflet: نقشه‌ی واقعی، پین فروشگاه‌ها، موقعیت کاربر (قابل کشیدن)، شعاع و مسیر.
// کاشی‌ها از /api/meta (map.tiles) می‌آیند؛ این فایل به هیچ سرویس خاصی وابسته نیست.
(function () {
  const TEHRAN = [35.72, 51.41];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function create(el, cfg, cb = {}) {
    if (!window.L) return null;
    const L = window.L;
    const map = L.map(el, { zoomControl: true, attributionControl: true, minZoom: 9, maxZoom: cfg.maxZoom || 19, tap: true }).setView(TEHRAN, 12);
    let ok = 0, bad = 0, warned = false;
    const tiles = L.tileLayer(cfg.tiles, { maxZoom: cfg.maxZoom || 19, attribution: cfg.attribution || '', crossOrigin: false });
    tiles.on('tileload', () => { ok++; });
    tiles.on('tileerror', () => { bad++; if (!warned && ok === 0 && bad >= 4) { warned = true; cb.onTilesFail && cb.onTilesFail(); } });
    tiles.addTo(map);

    const shopLayer = L.layerGroup().addTo(map), routeLayer = L.layerGroup().addTo(map);
    let me = null, circle = null, pickMode = false, markers = new Map();

    map.on('click', e => { if (pickMode && cb.onPick) { cb.onPick({ lat: e.latlng.lat, lng: e.latlng.lng }); } });

    const api = {
      raw: map,
      setPick(on) { pickMode = !!on; el.closest('.pane-map') && el.closest('.pane-map').classList.toggle('pick-mode', pickMode); },
      setUser(loc, radiusKm) {
        const ll = [loc.lat, loc.lng];
        if (!me) {
          me = L.marker(ll, { draggable: true, keyboard: true, title: 'موقعیت شما (بکشید)', zIndexOffset: 1000, icon: L.divIcon({ className: 'me-pin', html: '<span></span>', iconSize: [22, 22], iconAnchor: [11, 11] }) }).addTo(map);
          me.on('dragend', () => { const p = me.getLatLng(); cb.onMove && cb.onMove({ lat: p.lat, lng: p.lng }); });
        } else me.setLatLng(ll);
        if (radiusKm) {
          if (!circle) circle = L.circle(ll, { radius: radiusKm * 1000, color: '#e11d2e', weight: 1.5, opacity: .6, fillOpacity: .05, interactive: false }).addTo(map);
          else { circle.setLatLng(ll); circle.setRadius(radiusKm * 1000); }
        } else if (circle) { circle.remove(); circle = null; }
      },
      setShops(list, selId) {
        shopLayer.clearLayers(); markers = new Map();
        for (const s of list.slice(0, 150)) {
          const icon = L.divIcon({ className: 'pin' + (s.id === selId ? ' sel' : '') + (s.closed ? ' closed' : ''), html: '<span>' + esc(s.label) + '</span>', iconSize: [30, 30], iconAnchor: [15, 15] });
          const m = L.marker([s.lat, s.lng], { icon, title: s.title, keyboard: true, zIndexOffset: s.id === selId ? 900 : 0, riseOnHover: true });
          m.bindTooltip(esc(s.tip), { direction: 'top', offset: [0, -14], permanent: s.id === selId });
          m.on('click', () => cb.onSelect && cb.onSelect(s.id));
          m.addTo(shopLayer); markers.set(s.id, m);
        }
      },
      setRoute(r) {
        routeLayer.clearLayers();
        if (!r) return;
        const line = r.line && r.line.length > 1 ? r.line : r.from && r.to ? [[r.from.lat, r.from.lng], [r.to.lat, r.to.lng]] : null;
        if (!line) return;
        L.polyline(line, { color: '#e11d2e', weight: r.kind === 'driving' ? 5 : 3, opacity: .85, dashArray: r.kind === 'driving' ? null : '8 8', interactive: false }).addTo(routeLayer);
      },
      fit(points) {
        const pts = points.filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
        if (!pts.length) return;
        if (pts.length === 1) return map.setView(pts[0], 14);
        map.fitBounds(L.latLngBounds(pts), { padding: [34, 34], maxZoom: 15 });
      },
      panTo(lat, lng) { map.panTo([lat, lng]); },
      invalidate() { setTimeout(() => map.invalidateSize(), 60); },
      destroy() { map.remove(); }
    };
    return api;
  }
  window.TorobMap = { create };
})();
