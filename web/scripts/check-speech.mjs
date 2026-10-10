// Plain-Node check for browser speech pacing. Run: node web/scripts/check-speech.mjs
// A device with no installed voice fires onerror (or onend) at once; a phone call must still take
// about as long as the line would to say, instead of rushing through every line in a few seconds.
import assert from 'node:assert/strict';

let n = 0;
const ok = (m) => console.log(`  ok  ${++n} ${m}`);
let behaviour = 'error';
globalThis.window = {
  speechSynthesis: {
    getVoices: () => [],
    cancel() {},
    speak(u) { setTimeout(() => (behaviour === 'error' ? u.onerror?.({ error: 'synthesis-failed' }) : u.onend?.()), 5); },
  },
};
globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
const { speak, estimateMs } = await import('../src/agents/speech.js');

const line = 'Guten Tag, hier ist Pawse, die KI-Assistenz.';
const est = estimateMs(line, 'de');
for (const b of ['error', 'end']) {
  behaviour = b;
  const t0 = Date.now();
  await speak(line, 'de');
  const took = Date.now() - t0;
  assert.ok(took >= est * 0.9, `speech that ${b}s at once resolved after ${took} ms, expected about ${est} ms`);
  ok(`no voice (instant ${b}) still paces the line (${took} ms of ~${est} ms)`);
}
console.log(`check-speech: ${n} ok`);
