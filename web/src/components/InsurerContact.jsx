import PlaceRow from './PlaceRow.jsx';

/** The insurer the owner named, with public office listings. Never a statement about cover. */
export default function InsurerContact({ t, state, numbers, onFocus }) {
  const n = t.nearby;
  return (
    <section className="card nearby-card">
      <h2>🛡️ {n.insurerTitle}</h2>
      {!state.profile && <p className="muted small">{n.insurerAdd}</p>}
      {state.profile && (
        <p>
          <strong>{state.profile.company}</strong>
          {state.profile.plan ? ` · ${state.profile.plan}` : ''}
        </p>
      )}
      {state.status === 'loading' && <p className="muted small">{n.insurerLoading}</p>}
      {state.status === 'error' && <p className="muted small">{n.unavailable}</p>}
      {state.status === 'ok' && !state.places.length && <p className="muted small">{/fictional/.test(state.note) ? n.insurerDemo : n.insurerNone}</p>}
      {state.places.length > 0 && (
        <ul className="place-list">
          {state.places.map((p) => <PlaceRow key={p.id} t={t} place={p} n={numbers.get(p.id)} kind="insurer" onFocus={onFocus} />)}
        </ul>
      )}
      {state.status === 'ok' && state.places.length > 0 && <p className="muted small">{n.insurerNote}</p>}
    </section>
  );
}
