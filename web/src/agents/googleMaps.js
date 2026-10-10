// Loads the Google Maps JavaScript API with the browser key the backend serves at runtime
// (GET /api/v1/places/map-config). The key is never in this code. Resolves null when no key is
// configured or Google rejects it, so the page can fall back to the keyless embed.
import { CLINIC_SEARCH_URL } from '../config.js';

let pending = null;
const authListeners = new Set();
let authFailed = false;

/** Called when Google rejects the key after loading (not activated, wrong referrer). */
export function onMapsAuthFailure(fn) {
  if (authFailed) fn();
  authListeners.add(fn);
  return () => authListeners.delete(fn);
}

export async function fetchMapConfig(fetchImpl = globalThis.fetch) {
  try {
    const r = await fetchImpl((CLINIC_SEARCH_URL || '') + '/api/v1/places/map-config');
    if (!r.ok) return null;
    const d = await r.json();
    return d && typeof d.browser_key === 'string' && d.browser_key ? { key: d.browser_key, mapId: d.map_id || 'DEMO_MAP_ID' } : null;
  } catch {
    return null;
  }
}

function injectScript(win, doc, key, lang) {
  return new Promise((resolve, reject) => {
    const callback = '__pawseMapsReady';
    win[callback] = () => resolve();
    win.gm_authFailure = () => {
      authFailed = true;
      authListeners.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
    };
    const s = doc.createElement('script');
    s.src = 'https://maps.googleapis.com/maps/api/js?' + new URLSearchParams({ key, v: 'weekly', loading: 'async', callback, language: lang });
    s.async = true;
    s.onerror = () => reject(new Error('Google Maps could not load.'));
    doc.head.appendChild(s);
  });
}

/** { Map, Circle, InfoWindow, LatLngBounds, AdvancedMarkerElement, mapId } or null. Loads once per page. */
export function loadGoogleMaps({ lang = 'en', fetchImpl, win = globalThis.window, doc = globalThis.document } = {}) {
  if (pending) return pending;
  pending = (async () => {
    if (!win || !doc) return null;
    const config = await fetchMapConfig(fetchImpl);
    if (!config) return null;
    if (!(win.google && win.google.maps && win.google.maps.importLibrary)) await injectScript(win, doc, config.key, lang === 'zh' ? 'zh-CN' : lang);
    const g = win.google.maps;
    const [maps, core, marker] = await Promise.all([g.importLibrary('maps'), g.importLibrary('core'), g.importLibrary('marker')]);
    return { Map: maps.Map, Circle: maps.Circle, InfoWindow: maps.InfoWindow, LatLngBounds: core.LatLngBounds,
             AdvancedMarkerElement: marker.AdvancedMarkerElement, mapId: config.mapId };
  })().catch(() => null);
  return pending;
}

export function resetGoogleMapsForTests() {
  pending = null;
  authFailed = false;
  authListeners.clear();
}
