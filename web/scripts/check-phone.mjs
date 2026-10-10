// Plain-Node check of the live phone agent with stubbed fetch (no browser, no speech, no Audio).
import assert from 'node:assert/strict';
import { validateResult } from '../src/contracts.js';

const story = {
  costs: { currency: 'CHF', treatment: 600, remaining_deductible: 300, reimbursement_rate: 0.8, reimbursed: 240, clinic: 385, home: 510 },
  calendar: { appointment: '16:30' },
  steps: [{ lines: [] }, { lines: [] },
    { lines: [
      { speaker: 'Pawse', german: 'Meine Katze Mimi hinkt.', subtitle: 'My cat limps.' },
      { speaker: 'Vet · simulated', german: 'Termin um 16:30.', subtitle: 'Appointment at 16:30.' }] },
    { lines: [
      { speaker: 'Pawse', german: 'Ist das gedeckt?', subtitle: 'Is it covered?' },
      { speaker: 'Insurer · simulated', german: 'Ja, 80 Prozent.', subtitle: 'Yes, 80%.' }] }],
};
const calls = [];
const speech = []; // bodies sent to /voice/speech
let gradiumUp = false; // false: /voice/speech answers 503 (no key)
let calleeUp = true; // false: only voice 'callee' answers 503
globalThis.fetch = async (url, opts) => {
  calls.push(String(url));
  if (String(url).endsWith('/api/v1/demo/mimi')) return { ok: true, status: 200, json: async () => story };
  if (String(url).endsWith('/api/v1/voice/speech')) {
    const body = JSON.parse(opts.body);
    speech.push(body);
    if (!gradiumUp || (body.voice === 'callee' && !calleeUp)) return { ok: false, status: 503, headers: new Map(), blob: async () => null };
    // Server behaviour: no or unknown call id -> issue one; known id -> echo it.
    const id = body.call_id || `call-${speech.length}-abcdefghijklmnop`;
    return { ok: true, status: 200, headers: new Map([['x-pawse-call-id', id]]), blob: async () => ({ size: 1 }) };
  }
  return { ok: false, status: 404 };
};
// Minimal Audio stub: every clip "plays" and ends at once; count how many played.
let played = 0;
globalThis.Audio = class {
  play() {
    played += 1;
    setTimeout(() => this.onended && this.onended(), 0);
    return Promise.resolve();
  }
  pause() {}
};
URL.createObjectURL = () => 'blob:stub';
URL.revokeObjectURL = () => {};

const { createLivePhoneCall } = await import('../src/agents/livePhoneAgent.js');

async function runCall(target, context = {}) {
  const call = createLivePhoneCall({ target, lang: 'en', context, speed: 1000 });
  const ev = [];
  call.on((e) => ev.push(e));
  call.start();
  for (let i = 0; i < 400 && !ev.some((e) => e.type === 'status' && e.state === 'ended'); i++) await new Promise((r) => setTimeout(r, 10));
  return { call, ev };
}

for (const [target, ctx] of [['vet', { clinic: { name: 'Praxis X' } }], ['insurance', { gradiumConsent: true }]]) {
  const { call, ev } = await runCall(target, ctx);
  const states = ev.filter((e) => e.type === 'status').map((e) => e.state);
  assert.deepEqual(states, ['dialing', 'connected', 'ended'], `${target} status order`);
  const lines = ev.filter((e) => e.type === 'line');
  assert.ok(lines[0].who === 'ai' && lines[0].original.includes('KI-Assistent'), 'first line discloses KI-Assistent');
  assert.ok(lines.filter((l) => l.who === 'callee').length >= 1);
  assert.ok(lines.filter((l) => l.who === 'callee').every((l) => l.simulated === true), 'callee lines simulated');
  const r = ev.find((e) => e.type === 'result');
  assert.ok(r && r.simulated === true, 'result simulated');
  assert.deepEqual(validateResult(target, r), [], `${target} result valid`);
  if (target === 'vet') assert.equal(r.place, 'Praxis X');
  else { assert.equal(r.reimbursed, 240); assert.equal(r.outOfPocket, 360); assert.ok(r.points.some((p) => !p.ok)); }
  const n = ev.length;
  call.hangup(); call.hangup();
  assert.equal(ev.length, n, 'hangup after end is a no-op');
  assert.ok(!ev.some((e) => e.type === 'error'), 'no error event');
}

// Gradium on, key present: every line goes through /voice/speech, in order, with one call id;
// Pawse in the owner's chosen voice, the simulated replies in the second ('callee') voice.
for (const target of ['vet', 'insurance']) {
  gradiumUp = true; speech.length = 0; played = 0;
  const { ev } = await runCall(target, { gradiumConsent: true, voice: 'my_voice' });
  const lines = ev.filter((e) => e.type === 'line');
  assert.ok(lines.filter((e) => e.who === 'ai').length >= 2 && lines.some((e) => e.who === 'callee'), 'test story has AI and callee lines');
  assert.deepEqual(speech.map((b) => b.text), lines.map((e) => e.original), `${target}: every line sent to Gradium, in order`);
  assert.deepEqual(speech.map((b) => b.voice), lines.map((e) => (e.who === 'ai' ? 'my_voice' : 'callee')), `${target}: callee lines use the callee voice`);
  assert.ok(speech.every((b) => b.share_with_gradium === true && b.language === 'de'));
  assert.equal(speech[0].call_id, undefined, 'first line asks the server for a call id');
  const ids = new Set(speech.slice(1).map((b) => b.call_id));
  assert.equal(ids.size, 1, `${target}: later lines reuse one call id`);
  assert.equal([...ids][0], 'call-1-abcdefghijklmnop', 'the id the server issued');
  assert.equal(played, lines.length, 'every line played as Gradium audio');
  assert.ok(lines.filter((e) => e.who === 'callee').every((e) => e.simulated === true), 'replies stay marked simulated');
  assert.ok(!ev.some((e) => e.type === 'error'));
}

// Only the callee voice fails: replies move to browser speech, Pawse keeps Gradium.
{
  gradiumUp = true; calleeUp = false; speech.length = 0; played = 0;
  const { ev } = await runCall('vet', { gradiumConsent: true, voice: 'standard' });
  const ai = ev.filter((e) => e.type === 'line' && e.who === 'ai').length;
  assert.equal(speech.filter((b) => b.voice === 'callee').length, 1, 'one failed callee request, then browser speech for replies');
  assert.equal(played, ai, 'every AI line still played as Gradium audio');
  assert.ok(!ev.some((e) => e.type === 'provider' && e.voice === 'browser'), 'Pawse voice never switches to browser');
  calleeUp = true;
}

// Gradium answers 503: the call still completes on browser speech and stops asking after the failure.
{
  gradiumUp = false; speech.length = 0; played = 0;
  const { ev } = await runCall('vet', { gradiumConsent: true });
  assert.equal(speech.length, 1, 'one failed request, then browser speech for the rest');
  assert.equal(played, 0);
  assert.ok(ev.some((e) => e.type === 'result') && !ev.some((e) => e.type === 'error'), '503 falls back cleanly');
}

// No consent: Gradium is never called.
{
  gradiumUp = true; speech.length = 0;
  await runCall('vet', {});
  assert.equal(speech.length, 0, 'no consent, no Gradium request');
  gradiumUp = false;
}

// hangup mid-call ends exactly once
{
  const call = createLivePhoneCall({ target: 'vet', lang: 'en', speed: 1 });
  const ev = [];
  call.on((e) => ev.push(e));
  call.start();
  await new Promise((r) => setTimeout(r, 20));
  call.hangup(); call.hangup();
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(ev.filter((e) => e.type === 'status' && e.state === 'ended').length, 1);
  assert.ok(!ev.some((e) => e.type === 'result'));
}
console.log('check-phone: OK');
