import { useEffect, useState } from 'react';
import { findTaxis } from '../agents/nearby.js';
import PlaceRow from './PlaceRow.jsx';

/** Taxi services near the owner's live position. Listing only: Pawse never books a ride. */
export default function NearbyTaxis({ t, location, onFocus }) {
  const n = t.nearby;
  const [state, setState] = useState({ status: 'idle', places: [], note: '' });
  const hasLocation = !!location;
  useEffect(() => {
    if (!hasLocation || state.status !== 'idle') return;
    setState((s) => ({ ...s, status: 'loading' }));
    findTaxis(location)
      .then((r) => setState({ status: r.status === 'complete' ? 'ok' : 'error', places: r.places, note: r.note }))
      .catch(() => setState({ status: 'error', places: [], note: '' }));
  }, [hasLocation]); // eslint-disable-line react-hooks/exhaustive-deps -- search once, at the first position
  return (
    <section className="card nearby-card">
      <h2>🚕 {n.taxisTitle}</h2>
      {!hasLocation && <p className="muted small">{n.needLocation}</p>}
      {state.status === 'loading' && <p className="muted small">{n.taxisLoading}</p>}
      {state.status === 'error' && <p className="muted small">{n.unavailable}</p>}
      {state.status === 'ok' && !state.places.length && <p className="muted small">{n.taxisNone}</p>}
      {state.places.length > 0 && (
        <ul className="place-list">
          {state.places.map((p) => <PlaceRow key={p.id} t={t} place={p} onFocus={onFocus} />)}
        </ul>
      )}
      {state.status === 'ok' && <p className="muted small">{n.taxiNote}</p>}
    </section>
  );
}
