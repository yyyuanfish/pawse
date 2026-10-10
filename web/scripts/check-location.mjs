import assert from 'node:assert/strict';
import {locate,currentLocation,clearLocation} from '../src/agents/location.js';
await locate({getCurrentPosition(ok){ok({coords:{latitude:47,longitude:8,accuracy:20}});}});
assert.deepEqual(currentLocation(),{lat:47,lng:8});
await assert.rejects(locate({getCurrentPosition(ok,fail){fail({code:1});}}),/permission was denied/);
assert.equal(currentLocation(),null);
await assert.rejects(locate(null),/unavailable/);
clearLocation();
console.log('Location acquisition, rejection and clearing checked.');
