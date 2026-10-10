import assert from 'node:assert/strict';
import { stepState, nextAction } from '../src/utils/steps.js';
import { buildSummary } from '../src/utils/summary.js';
import { preparedResult } from '../src/agents/handoff.js';

const triage = { level: 'yellow', steps: ['Keep Mimi calm'] };
const vet = { time: '16:30', estimate: 385 };
const ins = { outOfPocket: 120 };
const marks = (s) => s.map((x) => (x.done ? '✓' : x.current ? '●' : '·')).join('');

// talk → vet → insurance → summary, one current step at a time
assert.deepEqual(stepState({ view: 'voice' }).map((x) => x.id), ['talk', 'vet', 'insurance', 'summary']);
assert.equal(marks(stepState({ view: 'voice' })), '●···');
assert.equal(marks(stepState({ view: 'plan', triage })), '✓●··');
assert.equal(marks(stepState({ view: 'clinics', triage })), '✓●··');
assert.equal(marks(stepState({ view: 'phone', target: 'insurance', triage })), '✓·●·');
assert.equal(marks(stepState({ view: 'plan', triage, vet })), '✓✓●·');
assert.equal(marks(stepState({ view: 'plan', triage, insurance: ins })), '✓●✓·');
assert.equal(marks(stepState({ view: 'plan', triage, vet, insurance: ins })), '✓✓✓●');
for (const s of [stepState({ view: 'plan', triage }), stepState({ view: 'plan', triage, vet, insurance: ins })]) {
  assert.equal(s.filter((x) => x.current).length, 1);
}

// The plan offers one obvious next action: the first unfinished conversation, then the summary.
assert.equal(nextAction({ vet: null, insurance: null }), 'vet');
assert.equal(nextAction({ vet, insurance: null }), 'insurance');
assert.equal(nextAction({ vet: null, insurance: ins }), 'vet');
assert.equal(nextAction({ vet, insurance: ins }), 'summary');
// A prepared (live) conversation is summarised honestly: no invented time, cost or cover.
for (const lang of ['en', 'zh', 'de', 'hi']) {
  const text = buildSummary({ lang, triage: { summary: 'Limping' }, vet: preparedResult('vet', { lines: [1, 2] }, true), insurance: preparedResult('insurance', { lines: [1] }, false) });
  assert.ok(!/undefined|NaN/.test(text), text);
  assert.equal(text.split('\n').length, 3, text);
}
assert.match(buildSummary({ lang: 'en', vet: preparedResult('vet', { lines: [1] }, true) }), /no call placed/);
console.log('check-steps: four steps, one current, next action OK');
