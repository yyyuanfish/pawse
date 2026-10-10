// Where the owner is in the story: talk → vet → insurance → decide → summary. Derived from App state, never stored.
// "decide" covers the second half: pick an option card, confirm with the vet, then (clinic only) the taxi.
import { taxiOffered } from '../agents/story.js';

export const STEPS = ['talk', 'vet', 'insurance', 'decide', 'summary'];

/**
 * The one obvious next action, in story order:
 * vet call → insurer call → option cards → confirmation call → taxi call (clinic only) → summary.
 */
export function nextAction({ vet, insurance, choice, confirm, taxi } = {}) {
  if (!vet) return 'vet';
  if (!insurance) return 'insurance';
  if (!choice) return 'options';
  if (!confirm) return 'confirm';
  if (taxiOffered(choice) && !taxi) return 'taxi';
  return 'summary';
}

const DECIDE = new Set(['options', 'confirm', 'taxi']);

/** [{ id, done, current }] for the progress rail; exactly one step is current. */
export function stepState({ view, target, triage, vet, insurance, choice, confirm, taxi }) {
  let current;
  if (view === 'voice' || !triage) current = 'talk';
  else if (view === 'clinics') current = 'vet';
  else if (view === 'options') current = 'decide';
  else if (view === 'phone') current = target === 'insurance' ? 'insurance' : DECIDE.has(target) ? 'decide' : 'vet';
  else {
    const next = nextAction({ vet, insurance, choice, confirm, taxi });
    current = DECIDE.has(next) ? 'decide' : next;
  }
  const decided = !!choice && !!confirm && (!taxiOffered(choice) || !!taxi);
  const done = { talk: !!triage && current !== 'talk', vet: !!vet, insurance: !!insurance, decide: decided, summary: false };
  return STEPS.map((id) => ({ id, done: done[id] && id !== current, current: id === current }));
}
