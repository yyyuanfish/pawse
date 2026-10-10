// Coordinates stay in memory and expire; never infer location from a default city.
let current = null;
let captured = 0;
export function currentLocation() {
  return Date.now() - captured < 120000 ? current : null;
}
export function clearLocation() { current = null; captured = 0; }
export function locate(geo = globalThis.navigator?.geolocation) {
  clearLocation();
  return new Promise((resolve, reject) => {
    if (!geo) return reject(Error('Location is unavailable in this browser. Open Pawse in Safari or Chrome.'));
    geo.getCurrentPosition(({coords}) => {
      if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) return reject(Error('No valid location received. Please retry.'));
      current = {lat: coords.latitude, lng: coords.longitude}; captured = Date.now();
      resolve({...current, accuracy: coords.accuracy});
    }, error => reject(Error(error.code === 1 ? 'Location permission was denied. Enable location access for this site in browser settings, then retry.' : 'Could not locate you. Check device Location Services and retry.')),
    {enableHighAccuracy: true, timeout: 15000, maximumAge: 60000});
  });
}
