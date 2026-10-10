import PlaceRow from './PlaceRow.jsx';

/** Taxi services near the owner. Listing only: Pawse never books a ride. Numbers match the map pins. */
export default function NearbyTaxis({ t, hasLocation, state, numbers, onFocus }) {
  const n = t.nearby;
  return (
    <section className="card nearby-card">
      <h2>🚕 {n.taxisTitle}</h2>
      {!hasLocation && <p className="muted small">{n.needLocation}</p>}
      {state.status === 'loading' && <p className="muted small">{n.taxisLoading}</p>}
      {state.status === 'error' && <p className="muted small">{n.unavailable}</p>}
      {state.status === 'ok' && !state.places.length && <p className="muted small">{n.taxisNone}</p>}
      {state.places.length > 0 && (
        <ul className="place-list">
          {state.places.map((p) => <PlaceRow key={p.id} t={t} place={p} n={numbers.get(p.id)} kind="taxi" onFocus={onFocus} />)}
        </ul>
      )}
      {state.status === 'ok' && <p className="muted small">{n.taxiNote}</p>}
    </section>
  );
}
