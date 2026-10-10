// A plain build (no VITE_* settings, as in the Dockerfile) must run the real agents; scripts only on request.
// Run with: npm run check

import assert from 'node:assert/strict';
import { VOICE_AGENT, CLINIC_SEARCH, PHONE_AGENT } from '../src/config.js';

assert.equal(VOICE_AGENT, 'live', 'voice agent defaults to the backend');
assert.equal(CLINIC_SEARCH, 'live', 'clinic search defaults to the backend');
assert.equal(PHONE_AGENT, 'live', 'phone agent defaults to the backend');
console.log('  ok  1 a build without VITE_* settings runs the live agents');
