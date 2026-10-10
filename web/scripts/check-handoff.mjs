import assert from 'node:assert/strict';
import { draftHandoff, searchDemoPolicy, generateSpeech, initialVoice, preparedResult } from '../src/agents/handoff.js';
const calls = [];
globalThis.fetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true, json: async () => ({ status: 'draft_not_sent' }), blob: async () => new Blob(['audio']) }; };
await assert.rejects(draftHandoff('cat limps', 'hi', 'vet', false), /Confirm/);
await assert.rejects(generateSpeech('Hallo', 'my_voice', false), /Confirm/);
assert.equal(calls.length, 0);
for (const lang of ['en','zh','de','hi']) {
 await draftHandoff('cat limps',lang,'insurance',true);
 assert.equal(calls.at(-1).body.subtitle_language,lang);
 assert.equal(calls.at(-1).body.recipient,'insurer');
 assert.equal(calls.at(-1).body.target_language,'de');
}
await searchDemoPolicy('accident');
assert.equal(calls.at(-1).body.scope,'synthetic_demo');
assert.ok(await generateSpeech('Hallo','my_voice',true) instanceof Blob);
assert.equal(calls.at(-1).body.voice,'my_voice');
globalThis.fetch = async () => ({ok:false,status:503,json:async()=>({detail:'Provider unavailable'})});
await assert.rejects(generateSpeech('Hallo','my_voice',true), /Provider unavailable/);
assert.ok(!calls.some(x=>x.url.includes('/demo/') || x.url.includes('/call')));
// The voice follows what the owner actually has: no own German voice yet means the standard voice.
assert.equal(initialVoice({ voice: 'standard' }), 'standard');
assert.equal(initialVoice({ voice: 'my_voice' }), 'my_voice');
assert.equal(initialVoice({}), 'standard');
// A prepared conversation never claims a call, booking or approval happened.
const prepared = preparedResult('vet', { lines: [{ german: 'Hallo' }] }, true);
assert.equal(prepared.prepared, true);
assert.equal(prepared.audio, true);
for (const k of ['time', 'estimate', 'outOfPocket', 'booked', 'confirmed', 'approved']) assert.ok(!(k in prepared), k);
console.log('check-handoff: consent, four languages, evidence, binary speech and errors OK');
