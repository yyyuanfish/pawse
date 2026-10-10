// The owner's live position from browser geolocation. Coordinates stay in page memory, expire after two
// minutes without an update, and are never replaced by a default city.
const MAX_AGE_MS = 120000;
let current = null; // { lat, lng, accuracy }
let captured = 0;
let error = ''; // '' | 'denied' | 'timeout' | 'failed' | 'unsupported'; the page words it in the owner's language
let watchId = null;
let watchGeo = null;
const listeners = new Set();

const MESSAGES = {
  denied: 'Location permission was denied. Allow location for this site in your browser settings, then retry.',
  timeout: 'Locating took too long. Check Location Services and retry.',
  failed: 'Could not locate you. Check device Location Services and retry.',
  unsupported: 'Location is unavailable in this browser. Open Pawse in Safari or Chrome.',
};
const code = (e) => (e && e.code === 1 ? 'denied' : e && e.code === 3 ? 'timeout' : 'failed');
export const locationMessage = (c) => MESSAGES[c] || '';

export function currentLocation(now = Date.now()) {
  return current && now - captured < MAX_AGE_MS ? { lat: current.lat, lng: current.lng } : null;
}

export function locationState(now = Date.now()) {
  const location = currentLocation(now);
  return { location, accuracy: location ? current.accuracy : null, updatedAt: location ? captured : null, error, watching: watchId !== null };
}

function notify() {
  const state = locationState();
  for (const fn of listeners) {
    try { fn(state); } catch { /* a broken listener must not stop the others */ }
  }
}

function accept(coords, now = Date.now()) {
  if (!coords || !Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) return false;
  current = { lat: coords.latitude, lng: coords.longitude, accuracy: Number.isFinite(coords.accuracy) ? coords.accuracy : null };
  captured = now;
  error = '';
  notify();
  return true;
}

/** Calls fn now and on every change. Returns an unsubscribe function. */
export function subscribeLocation(fn) {
  listeners.add(fn);
  fn(locationState());
  return () => listeners.delete(fn);
}

/** Start following the owner's position (asks for permission the first time). Safe to call repeatedly. */
export function watchLocation(geo = globalThis.navigator?.geolocation) {
  if (watchId !== null) return;
  if (!geo || typeof geo.watchPosition !== 'function') {
    error = 'unsupported';
    notify();
    return;
  }
  watchGeo = geo;
  watchId = geo.watchPosition(
    ({ coords }) => accept(coords),
    (e) => { error = code(e); notify(); },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
  );
  notify();
}

export function stopWatching() {
  if (watchId !== null && watchGeo) watchGeo.clearWatch(watchId);
  watchId = null;
  watchGeo = null;
  notify();
}

/** Retry after a denial or timeout: restart the watch with the current geolocation object. */
export function retryLocation(geo = globalThis.navigator?.geolocation) {
  stopWatching();
  error = '';
  watchLocation(geo);
}

export function clearLocation() {
  current = null;
  captured = 0;
  notify();
}

/** One position now: the live one when fresh, otherwise a single lookup. */
export function locate(geo = globalThis.navigator?.geolocation) {
  const fresh = currentLocation();
  if (fresh) return Promise.resolve({ ...fresh, accuracy: current.accuracy });
  return new Promise((resolve, reject) => {
    if (!geo) return reject(Error(MESSAGES.unsupported));
    geo.getCurrentPosition(
      ({ coords }) => (accept(coords) ? resolve({ ...currentLocation(), accuracy: current.accuracy }) : reject(Error('No valid location received. Please retry.'))),
      (e) => { error = code(e); notify(); reject(Error(MESSAGES[error])); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}

/** Resolve with the first location, or null after an error or `ms` without one. */
export function waitForLocation(ms = 8000) {
  const now = currentLocation();
  if (now) return Promise.resolve(now);
  return new Promise((resolve) => {
    let done = false;
    let stop = () => {};
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      stop();
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), ms);
    const unsubscribe = subscribeLocation((s) => {
      if (s.location) finish(s.location);
      else if (s.error) finish(null);
    });
    if (done) unsubscribe(); // resolved during the first synchronous call
    else stop = unsubscribe;
  });
}

// Clinic search falls back to central Zurich when no position is available (#55). Only the search uses this:
// the map never shows it as the owner's position.
export const ZURICH = { lat: 47.3769, lng: 8.5417 };

/** Best-effort position for one request: the live one when fresh, else one lookup; null if refused or slow. */
export function getLocation({ timeout = 5000, geo = globalThis.navigator?.geolocation } = {}) {
  const fresh = currentLocation();
  if (fresh) return Promise.resolve(fresh);
  if (!geo) return Promise.resolve(null);
  return new Promise((resolve) => {
    geo.getCurrentPosition(
      ({ coords }) => resolve(accept(coords) ? currentLocation() : null),
      () => resolve(null),
      { timeout, maximumAge: 120000 },
    );
  });
}
