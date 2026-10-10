import { useEffect, useState } from 'react';
import { loadInsuranceProfile } from '../agents/insuranceProfile.js';
import { findInsurer } from '../agents/nearby.js';
import PlaceRow from './PlaceRow.jsx';

/** The insurer the owner named, with public office listings. Never a statement about cover. */
export default function InsurerContact({ t, location, onFocus }) {
  const n = t.nearby;
  const [profile] = useState(loadInsuranceProfile);
  const [state, setState] = useState({ status: 'idle', places: [], note: '' });
  useEffect(() => {
    if (!profile) return;
    setState((s) => ({ ...s, status: 'loading' }));
    findInsurer(profile.company, location)
      .then((r) => setState({ status: r.status === 'complete' ? 'ok' : 'error', places: r.places, note: r.note }))
      .catch(() => setState({ status: 'error', places: [], note: '' }));
  }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps -- look up once per page visit
  return (
    <section className="card nearby-card">
      <h2>🛡️ {n.insurerTitle}</h2>
      {!profile && <p className="muted small">{n.insurerAdd}</p>}
      {profile && (
        <p>
          <strong>{profile.company}</strong>
          {profile.plan ? ` · ${profile.plan}` : ''}
        </p>
      )}
      {state.status === 'loading' && <p className="muted small">{n.insurerLoading}</p>}
      {state.status === 'error' && <p className="muted small">{n.unavailable}</p>}
      {state.status === 'ok' && !state.places.length && <p className="muted small">{/fictional/.test(state.note) ? n.insurerDemo : n.insurerNone}</p>}
      {state.places.length > 0 && (
        <ul className="place-list">
          {state.places.map((p) => <PlaceRow key={p.id} t={t} place={p} onFocus={onFocus} />)}
        </ul>
      )}
      {state.status === 'ok' && state.places.length > 0 && <p className="muted small">{n.insurerNote}</p>}
    </section>
  );
}
