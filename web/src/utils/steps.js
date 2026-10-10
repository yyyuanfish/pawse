// Where the owner is in the story: talk → vet → insurance → summary. Derived from App state, never stored.
export const STEPS = ['talk', 'vet', 'insurance', 'summary'];

/** The plan's one obvious next action: the vet first, then the summary. The insurer is optional. */
export function nextAction({ vet }) {
  return vet ? 'summary' : 'vet';
}

/** [{ id, done, current }] for the progress rail; exactly one step is current. */
export function stepState({ view, target, triage, vet, insurance }) {
  let current;
  if (view === 'voice' || !triage) current = 'talk';
  else if (view === 'clinics') current = 'vet';
  else if (view === 'phone') current = target === 'insurance' ? 'insurance' : 'vet';
  else current = nextAction({ vet, insurance });
  const done = { talk: !!triage && current !== 'talk', vet: !!vet, insurance: !!insurance, summary: false };
  return STEPS.map((id) => ({ id, done: done[id] && id !== current, current: id === current }));
}
