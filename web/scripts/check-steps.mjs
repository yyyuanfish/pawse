import assert from 'node:assert/strict';
import { stepState, nextAction } from '../src/utils/steps.js';
import { buildSummary } from '../src/utils/summary.js';
import { preparedResult } from '../src/agents/handoff.js';

const triage = { level: 'yellow', steps: ['Keep Mimi calm'] };
const vet = { time: '16:30', estimate: 385 };
const ins = { outOfPocket: 120 };
const marks = (s) => s.map((x) => (x.done ? '✓' : x.current ? '●' : '·')).join('');

// talk → vet → insurance → decide → summary, one current step at a time
assert.deepEqual(stepState({ view: 'voice' }).map((x) => x.id), ['talk', 'vet', 'insurance', 'decide', 'summary']);
assert.equal(marks(stepState({ view: 'voice' })), '●····');
assert.equal(marks(stepState({ view: 'plan', triage })), '✓●···');
assert.equal(marks(stepState({ view: 'clinics', triage })), '✓●···');
assert.equal(marks(stepState({ view: 'phone', target: 'insurance', triage })), '✓·●··');
assert.equal(marks(stepState({ view: 'plan', triage, vet })), '✓✓●··');
assert.equal(marks(stepState({ view: 'plan', triage, insurance: ins })), '✓●✓··');
assert.equal(marks(stepState({ view: 'plan', triage, vet, insurance: ins })), '✓✓✓●·');
assert.equal(marks(stepState({ view: 'options', triage, vet, insurance: ins })), '✓✓✓●·');
assert.equal(marks(stepState({ view: 'phone', target: 'confirm', triage, vet, insurance: ins, choice: 'clinic' })), '✓✓✓●·');
assert.equal(marks(stepState({ view: 'phone', target: 'taxi', triage, vet, insurance: ins, choice: 'clinic', confirm: {} })), '✓✓✓●·');
assert.equal(marks(stepState({ view: 'plan', triage, vet, insurance: ins, choice: 'clinic', confirm: {} })), '✓✓✓●·', 'clinic: taxi still to do');
assert.equal(marks(stepState({ view: 'plan', triage, vet, insurance: ins, choice: 'clinic', confirm: {}, taxi: {} })), '✓✓✓✓●');
assert.equal(marks(stepState({ view: 'plan', triage, vet, insurance: ins, choice: 'home', confirm: {} })), '✓✓✓✓●', 'home: no taxi');
for (const s of [stepState({ view: 'plan', triage }), stepState({ view: 'plan', triage, vet, insurance: ins })]) {
  assert.equal(s.filter((x) => x.current).length, 1);
}

// The plan offers one obvious next action, in story order:
// vet call → insurer call → options → confirmation call → taxi (clinic only) → summary.
assert.equal(nextAction({ vet: null, insurance: null }), 'vet');
assert.equal(nextAction({ vet, insurance: null }), 'insurance');
assert.equal(nextAction({ vet: null, insurance: ins }), 'vet');
assert.equal(nextAction({ vet, insurance: ins }), 'options');
assert.equal(nextAction({ vet, insurance: ins, choice: 'clinic' }), 'confirm');
assert.equal(nextAction({ vet, insurance: ins, choice: 'clinic', confirm: {} }), 'taxi');
assert.equal(nextAction({ vet, insurance: ins, choice: 'clinic', confirm: {}, taxi: {} }), 'summary');
assert.equal(nextAction({ vet, insurance: ins, choice: 'home', confirm: {} }), 'summary', 'no taxi after a home visit');
// A prepared (live) conversation is summarised honestly: no invented time, cost or cover.
for (const lang of ['en', 'zh', 'de', 'hi']) {
  const text = buildSummary({ lang, triage: { summary: 'Limping' }, vet: preparedResult('vet', { lines: [1, 2] }, true), insurance: preparedResult('insurance', { lines: [1] }, false) });
  assert.ok(!/undefined|NaN/.test(text), text);
  assert.equal(text.split('\n').length, 3, text);
}
assert.match(buildSummary({ lang: 'en', vet: preparedResult('vet', { lines: [1] }, true) }), /no call placed/);
console.log('check-steps: five steps, one current, next action in story order OK');
