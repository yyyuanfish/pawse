// One Google map: the owner's live position (blue dot + accuracy ring) and one set of numbered pins.
// Framework-free so it can be checked with a fake `api` in plain Node. Text is set with textContent only:
// place names come from providers and must never be parsed as HTML.
const ICONS = { vets: '🏥', taxi: '🚕', insurer: '🛡️' };

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function createMapController(api, container, { center, labels = {}, doc = globalThis.document, onSelect } = {}) {
  const map = new api.Map(container, {
    center, zoom: 15, mapId: api.mapId, clickableIcons: false, gestureHandling: 'greedy',
    streetViewControl: false, mapTypeControl: false, fullscreenControl: true,
  });
  const info = new api.InfoWindow();
  let me = null;
  let ring = null;
  let mePosition = null;
  let pins = [];
  let follow = true; // keep the owner in view until they pan the map themselves
  map.addListener('dragstart', () => { follow = false; });

  function meDot() {
    const dot = el(doc, 'div', 'map-me');
    dot.append(el(doc, 'span', 'map-me-pulse'), el(doc, 'span', 'map-me-dot'), el(doc, 'span', 'map-me-label', labels.me || 'You'));
    return dot;
  }

  function pinElement(m) {
    const pin = el(doc, 'div', `map-pin ${m.kind}`);
    pin.append(el(doc, 'span', 'map-pin-n', String(m.n)), el(doc, 'span', 'map-pin-icon', ICONS[m.kind] || '📍'));
    return pin;
  }

  function card(m) {
    const box = el(doc, 'div', 'map-card');
    box.append(el(doc, 'strong', null, `${m.n}. ${m.title}`));
    if (m.address) box.append(el(doc, 'div', 'map-card-line', m.address));
    if (m.distanceKm != null) box.append(el(doc, 'div', 'map-card-line', `${m.distanceKm.toFixed(1)} km`));
    if (m.callUrl) {
      const a = el(doc, 'a', 'map-card-call', `📞 ${m.phone}`);
      a.href = m.callUrl;
      box.append(a);
    }
    return box;
  }

  function fit() {
    const points = pins.map((p) => p.m.position).concat(mePosition ? [mePosition] : []);
    if (!points.length) return;
    if (points.length === 1) {
      map.setCenter(points[0]);
      map.setZoom(16);
      return;
    }
    const bounds = new api.LatLngBounds();
    points.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 56);
  }

  /** Move the owner's dot without reloading anything. */
  function setMe(position, accuracy) {
    mePosition = position || null;
    if (!position) {
      if (me) me.map = null;
      if (ring) ring.setMap(null);
      me = ring = null;
      return;
    }
    if (!me) {
      ring = new api.Circle({ map, center: position, radius: 0, clickable: false, strokeColor: '#1a73e8', strokeOpacity: 0.3,
                              strokeWeight: 1, fillColor: '#1a73e8', fillOpacity: 0.12 });
      me = new api.AdvancedMarkerElement({ map, position, content: meDot(), title: labels.me || 'You', zIndex: 1000 });
      if (follow && !pins.length) map.setCenter(position);
    } else {
      me.position = position;
      ring.setCenter(position);
      if (follow && !pins.length) map.panTo(position);
    }
    ring.setRadius(Number.isFinite(accuracy) ? Math.min(accuracy, 2000) : 0);
  }

  /** Replace the pins (one kind at a time) and show them together with the owner. */
  function setPins(markers) {
    info.close();
    pins.forEach((p) => { p.marker.map = null; });
    pins = markers.map((m) => {
      const marker = new api.AdvancedMarkerElement({ map, position: m.position, content: pinElement(m), title: `${m.n}. ${m.title}`, zIndex: 100 - m.n });
      marker.addListener('click', () => open(m.id));
      return { m, marker };
    });
    follow = true;
    fit();
  }

  /** Highlight one pin and show its card. False when that place has no pin. */
  function open(id) {
    const p = pins.find((x) => x.m.id === id);
    if (!p) return false;
    info.setContent(card(p.m));
    info.open({ map, anchor: p.marker });
    map.panTo(p.m.position);
    if (onSelect) onSelect(p.m);
    return true;
  }

  function recenter() {
    follow = true;
    if (mePosition) {
      map.panTo(mePosition);
      map.setZoom(16);
    }
  }

  function destroy() {
    info.close();
    pins.forEach((p) => { p.marker.map = null; });
    if (me) me.map = null;
    if (ring) ring.setMap(null);
    pins = [];
    me = ring = null;
  }

  return { map, setMe, setPins, open, recenter, fit, destroy };
}
