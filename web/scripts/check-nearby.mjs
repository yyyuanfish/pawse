// Map URLs carry no key and no invented location; taxi and insurer lookups send only what they need.
import assert from 'node:assert/strict';
import { mapEmbedUrl } from '../src/utils/mapEmbed.js';
import { findTaxis, findInsurer, mapPlace } from '../src/agents/nearby.js';

const here = { lat: 47.376912, lng: 8.541694 };
const me = new URL(mapEmbedUrl({ mode: 'me', location: here, lang: 'zh' }));
assert.equal(me.origin, 'https://maps.google.com');
assert.equal(me.searchParams.get('q'), '47.3769,8.5417');
assert.equal(me.searchParams.get('output'), 'embed');
assert.equal(me.searchParams.get('hl'), 'zh');
assert.ok(!me.search.includes('key='));
const vets = new URL(mapEmbedUrl({ mode: 'vets', location: here }));
assert.deepEqual([vets.searchParams.get('q'), vets.searchParams.get('ll')], ['Tierarzt', '47.3769,8.5417']);
assert.equal(new URL(mapEmbedUrl({ mode: 'taxi', location: here })).searchParams.get('q'), 'Taxi');
assert.equal(mapEmbedUrl({ mode: 'me', location: null }), null);
assert.equal(mapEmbedUrl({ mode: 'vets', location: null }), null);
const cid = new URL(mapEmbedUrl({ mode: 'place', place: { name: 'X', mapsUrl: 'https://maps.google.com/maps?cid=3436817495314440966' } }));
assert.equal(cid.searchParams.get('cid'), '3436817495314440966');
const named = new URL(mapEmbedUrl({ mode: 'place', place: { name: 'Tierarzt Enge', address: 'Brunaustrasse 62', mapsUrl: 'javascript:alert(1)' } }));
assert.equal(named.searchParams.get('q'), 'Tierarzt Enge, Brunaustrasse 62');
assert.equal(mapEmbedUrl({ mode: 'me', location: here, lang: 'x"><' }).includes('hl=en'), true);

assert.equal(mapPlace({ id: '1', name: 'T', call_url: 'javascript:alert(1)', phone: '+41' }).callUrl, undefined);
assert.equal(mapPlace({ id: '1', name: 'T', call_url: 'tel:+41443212828' }).callUrl, 'tel:+41443212828');

const calls = [];
const fake = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true, json: async () => ({ status: 'complete', places: [{ id: 'a', name: 'Taxi', source: 'gemini_maps' }], note: 'n' }) }; };
const taxis = await findTaxis(here, fake);
assert.equal(taxis.places[0].name, 'Taxi');
assert.deepEqual(calls[0], { url: '/api/v1/places/nearby', body: { kind: 'taxi', location: { lat: here.lat, lng: here.lng }, share_location: true } });
await assert.rejects(findTaxis(null, fake), /Location is needed/);
await findInsurer('Calingo', null, fake);
assert.deepEqual(calls[1].body, { company: 'Calingo' });
await findInsurer('Calingo', here, fake);
assert.equal(calls[2].body.share_location, true);
console.log('map and nearby lookups ok');
