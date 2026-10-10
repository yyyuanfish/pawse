// Plain-Node check: Gemini Live falls back to the simulated rehearsal only when it fails before connecting.
import assert from 'node:assert/strict';
import { createGeminiLiveAgent } from '../src/agents/geminiLiveAgent.js';
import { createMockVoiceAgent } from '../src/agents/mockVoiceAgent.js';
import { createFallbackVoiceAgent, FALLBACK_NOTICE } from '../src/agents/fallbackVoiceAgent.js';

const fakeAudio = { setMuted() {}, attach: async () => {}, flush() {}, close: async () => {}, play: async () => {} };
const session = { sendRealtimeInput() {}, sendToolResponse() {}, close() {} };
const base = { lang: 'en', shareWithGemini: true, audioFactory: () => fakeAudio, locate: async () => null };
const ok = { ok: true, json: async () => ({ token: 't', model: 'm', api_version: 'v1alpha' }) };
const build = (opts, mockOpts = {}) => {
  let mock;
  const agent = createFallbackVoiceAgent({
    makeLive: onStartFailed => createGeminiLiveAgent({ ...base, ...opts, onStartFailed }),
    makeMock: () => (mock = createMockVoiceAgent({ lang: 'en', speed: 400, ...mockOpts })),
  });
  const events = []; agent.on(e => events.push(e));
  return { agent, events, mock: () => mock };
};

// 1. Token endpoint refuses (503, 429, 502, 422): notice + the mock rehearsal plays, no 'ended'.
for (const status of [503, 429, 502, 422]) {
  globalThis.fetch = async () => ({ ok: false, status, json: async () => ({ detail: 'nope' }) });
  const { agent, events, mock } = build({});
  agent.setMicMuted(false); agent.setOutputMuted(false);
  await agent.start();
  assert.ok(mock(), `status ${status}: mock took over`);
  assert.ok(events.some(e => e.type === 'error' && e.message === FALLBACK_NOTICE), 'visible simulated notice');
  assert.ok(!events.some(e => e.type === 'ended'), 'no ended event on fallback');
  assert.equal(agent.wantsAudio, false); assert.equal(agent.simulated, true);
  await new Promise(r => setTimeout(r, 50));
  assert.ok(events.some(e => e.type === 'transcript' && e.role === 'ai'), 'rehearsal speaks');
  agent.end(); assert.equal(events.filter(e => e.type === 'ended').length, 1);
}

// 2. ai.live.connect throws: same fallback.
globalThis.fetch = async () => ok;
{
  const { agent, events, mock } = build({ clientFactory: () => ({ live: { connect: async () => { throw new Error('socket'); } } }) });
  await agent.start();
  assert.ok(mock()); assert.ok(events.some(e => e.type === 'error' && e.message === FALLBACK_NOTICE));
  agent.end();
}

// 3. Healthy connect: stays on Live, no notice, wantsAudio stays true.
{
  const { agent, events, mock } = build({ clientFactory: () => ({ live: { connect: async () => session } }) });
  await agent.start();
  assert.equal(mock(), undefined); assert.equal(agent.wantsAudio, true); assert.equal(agent.simulated, false);
  assert.ok(!events.some(e => e.type === 'error'));
  agent.end(); assert.ok(events.some(e => e.type === 'ended'));
}

// 4. Failure after connecting keeps Live's error-and-end behaviour (no fallback).
{
  let cb;
  const { agent, events, mock } = build({ clientFactory: () => ({ live: { connect: async o => { cb = o.callbacks; return session; } } }) });
  await agent.start(); cb.onerror();
  assert.equal(mock(), undefined);
  assert.ok(events.some(e => e.type === 'error' && /connection failed/.test(e.message)) && events.some(e => e.type === 'ended'));
}

// 5. Without onStartFailed the Live agent keeps its old behaviour (error + ended).
globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({ detail: 'x' }) });
{
  const a = createGeminiLiveAgent(base), ev = []; a.on(e => ev.push(e)); await a.start();
  assert.ok(ev.some(e => e.type === 'error') && ev.some(e => e.type === 'ended'));
}
console.log('live fallback checks passed');
