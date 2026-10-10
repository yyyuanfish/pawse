// Live location: follows updates, reports errors, retries, expires, never invents a city.
import assert from 'node:assert/strict';
import { watchLocation, stopWatching, retryLocation, currentLocation, locationState, subscribeLocation, clearLocation, locate, waitForLocation } from '../src/agents/location.js';

function fakeGeo() {
  const geo = { ok: null, fail: null, cleared: [], watchPosition(ok, fail) { geo.ok = ok; geo.fail = fail; return 7; }, clearWatch(id) { geo.cleared.push(id); } };
  return geo;
}
const seen = [];
const off = subscribeLocation((s) => seen.push(s));
assert.equal(seen.at(-1).location, null);

const geo = fakeGeo();
watchLocation(geo);
const waiting = waitForLocation(1000);
geo.ok({ coords: { latitude: 47.37, longitude: 8.54, accuracy: 12 } });
assert.deepEqual(await waiting, { lat: 47.37, lng: 8.54 });
assert.deepEqual(currentLocation(), { lat: 47.37, lng: 8.54 }); // never leaks accuracy into the API shape
assert.equal(locationState().accuracy, 12);
geo.ok({ coords: { latitude: 47.38, longitude: 8.55, accuracy: 8 } });
assert.deepEqual(seen.at(-1).location, { lat: 47.38, lng: 8.55 });
assert.equal(currentLocation(Date.now() + 121000), null); // stale after two minutes

geo.fail({ code: 1 });
assert.equal(locationState().error, 'denied');
assert.equal(await waitForLocation(1000).then((v) => v && 'kept'), 'kept'); // a fresh position still counts
clearLocation();
assert.equal(await waitForLocation(1000), null); // error and no position: give up at once
retryLocation(geo);
assert.deepEqual(geo.cleared, [7]);
assert.equal(locationState().error, '');
stopWatching();

watchLocation(null);
assert.equal(locationState().error, 'unsupported');
await assert.rejects(locate({ getCurrentPosition(ok, fail) { fail({ code: 1 }); } }), /permission was denied/);
assert.deepEqual(await locate({ getCurrentPosition(ok) { ok({ coords: { latitude: 1, longitude: 2, accuracy: 3 } }); } }), { lat: 1, lng: 2, accuracy: 3 });
off();
console.log('live location ok');
