// Interactive map: pins only for real coordinates, numbers shared with the lists, the owner's dot moves
// without rebuilding pins, the key comes from the backend and server keys never load.
import assert from 'node:assert/strict';
import { markersFor, pinNumbers, validLatLng } from '../src/utils/mapMarkers.js';
import { createMapController } from '../src/agents/mapController.js';
import { loadGoogleMaps, resetGoogleMapsForTests, onMapsAuthFailure } from '../src/agents/googleMaps.js';

// markers
assert.equal(validLatLng({ lat: 0, lng: 0 }), null);
assert.equal(validLatLng({ lat: 91, lng: 8 }), null);
const vets = markersFor('vets', [
  { id: 'a', name: 'Tierspital', location: { lat: 47.39, lng: 8.55 }, phone: '+41 44', callUrl: 'tel:+41446358111', distanceKm: 2.8 },
  { id: 'b', name: 'No coords' },
  { id: 'c', name: 'Enge', location: { lat: 47.36, lng: 8.53 }, callUrl: 'javascript:alert(1)' },
]);
assert.deepEqual(vets.map((m) => [m.id, m.n]), [['a', 1], ['c', 2]]);
assert.equal(vets[1].callUrl, '');
assert.deepEqual([...pinNumbers(vets)], [['a', 1], ['c', 2]]);

// a minimal DOM + google.maps fake
const node = () => ({ children: [], className: '', textContent: '', href: '', append(...c) { this.children.push(...c); } });
const doc = { createElement: () => node() };
const log = [];
class FakeMarker { constructor(o) { Object.assign(this, o); this.listeners = {}; log.push(['marker', o.title]); } addListener(e, fn) { this.listeners[e] = fn; } }
const api = {
  mapId: 'DEMO_MAP_ID',
  Map: class { constructor(el, o) { this.opts = o; this.listeners = {}; } addListener(e, fn) { this.listeners[e] = fn; } setCenter(p) { log.push(['center', p]); }
    setZoom(z) { log.push(['zoom', z]); } panTo(p) { log.push(['pan', p]); } fitBounds(b, pad) { log.push(['fit', b.points.length, pad]); } },
  InfoWindow: class { setContent(c) { this.content = c; } open(o) { log.push(['info', o.anchor.title]); } close() {} },
  Circle: class { constructor(o) { this.o = o; } setCenter(c) { this.o.center = c; } setRadius(r) { this.o.radius = r; } setMap(m) { this.o.map = m; } },
  LatLngBounds: class { constructor() { this.points = []; } extend(p) { this.points.push(p); } },
  AdvancedMarkerElement: FakeMarker,
};
const picked = [];
const ctl = createMapController(api, {}, { center: { lat: 47.37, lng: 8.54 }, doc, labels: { me: '你在这里' }, onSelect: (m) => picked.push(m.id) });
assert.equal(ctl.map.opts.mapId, 'DEMO_MAP_ID');
ctl.setMe({ lat: 47.37, lng: 8.54 }, 45);
assert.equal(log.filter((x) => x[0] === 'marker' && x[1] === '你在这里').length, 1);
ctl.setPins(vets);
assert.deepEqual(log.find((x) => x[0] === 'fit'), ['fit', 3, 56]); // both pins and the owner in view
const markerCount = log.filter((x) => x[0] === 'marker').length;
ctl.setMe({ lat: 47.371, lng: 8.541 }, 20); // moving: no new markers
assert.equal(log.filter((x) => x[0] === 'marker').length, markerCount);
assert.equal(ctl.open('c'), true);
assert.deepEqual(picked, ['c']);
assert.equal(ctl.open('b'), false); // no coordinates, no pin
ctl.destroy();

// loader: no key configured -> null, and no script injected
resetGoogleMapsForTests();
const injected = [];
const fakeDoc = { createElement: () => ({}), head: { appendChild: (s) => injected.push(s) } };
const noKey = async () => ({ ok: true, json: async () => ({ browser_key: null, map_id: 'DEMO_MAP_ID' }) });
assert.equal(await loadGoogleMaps({ fetchImpl: noKey, win: {}, doc: fakeDoc }), null);
assert.equal(injected.length, 0);

// loader: key from the backend goes into the script URL; libraries resolve
resetGoogleMapsForTests();
const win = {};
const withKey = async (url) => { assert.match(url, /\/api\/v1\/places\/map-config$/); return { ok: true, json: async () => ({ browser_key: 'browser-only', map_id: 'abc' }) }; };
const loading = loadGoogleMaps({ fetchImpl: withKey, win, doc: { createElement: () => ({}), head: { appendChild: (s) => {
  const url = new URL(s.src);
  assert.equal(url.searchParams.get('key'), 'browser-only');
  assert.equal(url.searchParams.get('loading'), 'async');
  win.google = { maps: { importLibrary: async (name) => ({ maps: { Map: 1, Circle: 2, InfoWindow: 3 }, core: { LatLngBounds: 4 }, marker: { AdvancedMarkerElement: 5 } })[name] } };
  win[url.searchParams.get('callback')]();
} } }, lang: 'zh' });
const loaded = await loading;
assert.deepEqual([loaded.Map, loaded.LatLngBounds, loaded.AdvancedMarkerElement, loaded.mapId], [1, 4, 5, 'abc']);
let failed = false;
onMapsAuthFailure(() => { failed = true; });
win.gm_authFailure();
assert.equal(failed, true); // Google rejected the key: the page falls back to the embed
console.log('interactive map ok');
