import { useEffect, useState } from 'react';
import { findInsurer, findTaxis } from '../agents/nearby.js';
import { loadInsuranceProfile } from '../agents/insuranceProfile.js';

const IDLE = { status: 'idle', places: [], note: '' };
const done = (r) => ({ status: r.status === 'complete' ? 'ok' : 'error', places: r.places, note: r.note });

/** Taxi services around the first known position (searched once). */
export function useTaxis(location, enabled = true) {
  const [state, setState] = useState(IDLE);
  const ready = enabled && !!location;
  useEffect(() => {
    if (!ready || state.status !== 'idle') return;
    setState((s) => ({ ...s, status: 'loading' }));
    findTaxis(location).then((r) => setState(done(r))).catch(() => setState({ ...IDLE, status: 'error' }));
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps -- search once, at the first position
  return state;
}

/** The insurer the owner named on this device, with its public office listings. */
export function useInsurer(location, enabled = true) {
  const [profile] = useState(loadInsuranceProfile);
  const [state, setState] = useState(IDLE);
  useEffect(() => {
    if (!enabled || !profile) return;
    setState((s) => ({ ...s, status: 'loading' }));
    findInsurer(profile.company, location).then((r) => setState(done(r))).catch(() => setState({ ...IDLE, status: 'error' }));
  }, [enabled, profile]); // eslint-disable-line react-hooks/exhaustive-deps -- look up once per page visit
  return { profile, ...state };
}
