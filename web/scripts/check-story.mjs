// Plain-Node check of the second half of the Mimi story: option costs, the confirmation and taxi
// calls (mock and live mapping of /api/v1/demo/mimi steps[4] / steps[5]), the taxi only after the
// clinic option, the claim checklist, and the brisker call voice. No browser, no speech, no network.
import assert from 'node:assert/strict';
import { validateResult } from '../src/contracts.js';
import { VOICE_PACE } from '../src/config.js';
import {
  demoCosts, mockStory, storyFacts, optionCards, taxiOffered, claimChecklist, buildConfirmResult, buildTaxiResult, loadStory,
} from '../src/agents/story.js';
import { nextAction } from '../src/utils/steps.js';
import { buildSummary } from '../src/utils/summary.js';

// ------------------------------------------------ costs: same formulas as pawse/demo.py costs()
const c = demoCosts();
assert.deepEqual(
  { reimbursed: c.reimbursed, clinic: c.clinic, home: c.home, taxi: c.taxi, extra: c.home_visit_extra, days: c.claim_days },
  { reimbursed: 240, clinic: 385, home: 510, taxi: 25, extra: 150, days: 30 },
  'mock costs match the video script: clinic ~385 incl. taxi, home 510'
);
const facts = storyFacts(mockStory());
const [a, b] = optionCards(facts);
assert.equal(a.id, 'clinic'); assert.equal(a.letter, 'A'); assert.equal(a.time, '16:30');
assert.equal(a.total, 625); assert.equal(a.insurerPays, 240); assert.equal(a.youPay, 385);
assert.equal(b.id, 'home'); assert.equal(b.letter, 'B');
assert.equal(b.total, 750); assert.equal(b.insurerPays, 240); assert.equal(b.youPay, 510);
// Live numbers win over the mock formulas (one source of truth: the backend story).
const liveFacts = storyFacts({ costs: { currency: 'CHF', clinic: 400, home: 520, reimbursed: 230, treatment: 600, taxi: 30, home_visit_extra: 150, claim_days: 20 }, calendar: { free_from: '15:00', appointment: '15:30', taxi: '15:05' } });
assert.deepEqual(optionCards(liveFacts).map((o) => o.youPay), [400, 520]);
assert.equal(liveFacts.taxiAt, '15:05');
assert.equal(storyFacts({}).clinic, 385, 'missing fields fall back to the mock formulas');

// ------------------------------------------------ taxi only after the clinic option
assert.equal(taxiOffered('clinic'), true);
assert.equal(taxiOffered('home'), false);
assert.equal(taxiOffered(null), false);
const v = { time: '16:30', place: 'Praxis X', estimate: 600, currency: 'CHF' }; const i = { outOfPocket: 360 };
assert.equal(nextAction({ rehearsal: true, vet: v, insurance: i, choice: 'home', confirm: {} }), 'summary');
assert.equal(nextAction({ rehearsal: true, vet: v, insurance: i, choice: 'clinic', confirm: {} }), 'taxi');

// ------------------------------------------------ results and checklist
assert.deepEqual(validateResult('confirm', buildConfirmResult({ facts, choice: 'clinic' })), []);
assert.deepEqual(validateResult('confirm', buildConfirmResult({ facts, choice: 'home' })), []);
assert.equal(buildConfirmResult({ facts, choice: 'home' }).youPay, 510);
const ride = buildTaxiResult({ facts });
assert.deepEqual(validateResult('taxi', ride), []);
assert.equal(ride.pickup, '16:05'); assert.equal(ride.fare, 25); assert.equal(ride.insured, false);
assert.match(ride.note, /isn't covered by insurance/);
assert.ok(validateResult('taxi', { ...ride, insured: true }).length, 'an insured taxi violates the contract');
for (const r of [buildConfirmResult({ facts }), ride]) assert.equal(r.simulated, true);
const list = claimChecklist({ lang: 'en', claimDays: facts.claimDays });
assert.ok(list.some((x) => /video/.test(x)) && list.some((x) => /itemised invoice/.test(x)) && list.some((x) => /within 30 days/.test(x)), list.join(' | '));
assert.match(claimChecklist({ lang: 'en', claimDays: 20 }).join(' '), /within 20 days/, 'claim days come from the story');
for (const lang of ['en', 'zh']) {
  const text = buildSummary({ lang, triage: { summary: 'Mimi' }, vet: v, insurance: { reimbursed: 240, outOfPocket: 360 }, choice: 'clinic', confirm: buildConfirmResult({ facts, lang }), taxi: buildTaxiResult({ facts, lang }), facts });
  assert.ok(!/undefined|NaN|booked/i.test(text), text);
  assert.match(text, /385/); assert.match(text, /16:05/);
}

// ------------------------------------------------ mock calls: confirm (clinic / home) and taxi
const { createMockPhoneCall, mockCallLines } = await import('../src/agents/mockPhoneAgent.js');
async function run(create, target, context) {
  const call = create({ target, lang: 'en', context, speed: 1000 });
  const ev = [];
  call.on((e) => ev.push(e));
  call.start();
  for (let n = 0; n < 400 && !ev.some((e) => e.type === 'status' && e.state === 'ended'); n++) await new Promise((r) => setTimeout(r, 10));
  return ev;
}
assert.match(mockCallLines('confirm', { choice: 'clinic' }).map((l) => l.de).join(' '), /16:30/);
assert.match(mockCallLines('confirm', { choice: 'home' }).map((l) => l.de).join(' '), /Hausbesuch/);
for (const [target, context] of [['confirm', { choice: 'clinic' }], ['confirm', { choice: 'home' }], ['taxi', { choice: 'clinic' }]]) {
  const ev = await run(createMockPhoneCall, target, context);
  const lines = ev.filter((e) => e.type === 'line');
  assert.ok(lines.length >= 2 && lines[0].who === 'ai' && /KI-Assistent/.test(lines[0].original), `${target}: discloses AI first`);
  assert.ok(lines.filter((l) => l.who === 'callee').every((l) => l.simulated === true), `${target}: replies simulated`);
  assert.ok(ev.filter((e) => e.type === 'progress' && e.simulated).length >= 1, `${target}: reply progress labelled simulated`);
  const r = ev.find((e) => e.type === 'result');
  assert.deepEqual(validateResult(target, r), [], `${target} (${context.choice}) result valid`);
  assert.equal(r.simulated, true);
  if (target === 'confirm') assert.equal(r.choice, context.choice);
}

// ------------------------------------------------ live calls: steps[4] (home_lines for B) and steps[5]
const L = (speaker, german, subtitle) => ({ speaker, german, subtitle });
const story = {
  costs: demoCosts(),
  calendar: { source: 'synthetic', free_from: '16:00', appointment: '16:30', taxi: '16:05' },
  steps: [{ lines: [] }, { lines: [] }, { lines: [L('Pawse', 'Vet?', 'Vet?')] }, { lines: [L('Pawse', 'Ins?', 'Ins?')] },
    { lines: [L('Pawse', 'Bestätigen 16:30.', 'Confirm 16:30.'), L('Vet · simulated', 'Alles klar.', 'All right.')],
      home_lines: [L('Pawse', 'Hausbesuch heute Abend.', 'Home visit tonight.'), L('Vet · simulated', 'In Ordnung.', 'All right.')] },
    { lines: [L('Pawse', 'Taxi um 16:05.', 'Taxi at 16:05.'), L('Taxi · simulated', 'Ja, 25 Franken.', 'Yes, CHF 25.')] }],
};
let audioRates = [];
globalThis.fetch = async (url) => {
  if (String(url).endsWith('/api/v1/demo/mimi')) return { ok: true, status: 200, json: async () => story };
  if (String(url).endsWith('/api/v1/voice/speech')) {
    return { ok: true, status: 200, headers: new Map([['x-pawse-call-id', 'call-1-abcdefghijklmnop']]), blob: async () => ({ size: 1 }) };
  }
  return { ok: false, status: 404 };
};
globalThis.Audio = class {
  play() {
    audioRates.push({ rate: this.playbackRate, pitch: this.preservesPitch });
    setTimeout(() => this.onended && this.onended(), 0);
    return Promise.resolve();
  }
  pause() {}
};
URL.createObjectURL = () => 'blob:stub';
URL.revokeObjectURL = () => {};
const { createLivePhoneCall, storyLines } = await import('../src/agents/livePhoneAgent.js');
assert.equal(storyLines(story, 'confirm', { choice: 'home' })[0].german, 'Hausbesuch heute Abend.');
assert.equal(storyLines(story, 'confirm', { choice: 'clinic' })[0].german, 'Bestätigen 16:30.');
assert.equal(storyLines(story, 'taxi', {})[0].german, 'Taxi um 16:05.');
for (const [target, context, said] of [
  ['confirm', { choice: 'clinic', clinic: { name: 'Praxis X' } }, 'Bestätigen 16:30.'],
  ['confirm', { choice: 'home' }, 'Hausbesuch heute Abend.'],
  ['taxi', { choice: 'clinic', gradiumConsent: true }, 'Taxi um 16:05.'],
]) {
  audioRates = [];
  const ev = await run(createLivePhoneCall, target, context);
  const lines = ev.filter((e) => e.type === 'line');
  assert.ok(/KI-Assistent/.test(lines[0].original), `${target}: disclosure first`);
  assert.ok(lines.some((l) => l.original === said), `${target}: speaks the story line ${said}`);
  assert.ok(lines.filter((l) => l.who === 'callee').length === 1 && lines.filter((l) => l.who === 'callee').every((l) => l.simulated), `${target}: one simulated reply`);
  assert.ok(ev.some((e) => e.type === 'progress' && e.text === 'Confirm 16:30.') || target !== 'confirm' || context.choice !== 'clinic', 'subtitles as progress');
  const r = ev.find((e) => e.type === 'result');
  assert.deepEqual(validateResult(target, r), [], `${target} live result valid`);
  if (target === 'confirm') { assert.equal(r.choice, context.choice); assert.equal(r.youPay, context.choice === 'home' ? 510 : 385); }
  if (target === 'confirm' && context.clinic) assert.equal(r.place, 'Praxis X');
  if (target === 'taxi') {
    assert.equal(r.pickup, '16:05'); assert.equal(r.fare, 25); assert.equal(r.insured, false);
    // Gradium lines play a little brisker without changing the pitch.
    assert.ok(audioRates.length >= 2, 'Gradium audio played');
    assert.ok(audioRates.every((x) => x.rate === VOICE_PACE.audio && x.pitch === true), JSON.stringify(audioRates));
  }
}
assert.ok(VOICE_PACE.audio > 1 && VOICE_PACE.audio <= 1.2 && VOICE_PACE.speech > 1 && VOICE_PACE.speech <= 1.15, 'a bit faster, not rushed');

// loadStory: live reads the backend, falls back to the mock formulas when it is down.
assert.equal((await loadStory({ live: true })).steps.length, 6);
globalThis.fetch = async () => ({ ok: false, status: 503 });
assert.equal(storyFacts(await loadStory({ live: true })).clinic, 385);
assert.equal(storyFacts(await loadStory({ live: false })).home, 510);
console.log('check-story: options, confirm, taxi, checklist and voice pace OK');
