import { retryLocation } from '../agents/location.js';

/** One line: live position and accuracy, or what went wrong with a retry. */
export default function LocationStatus({ t, loc }) {
  const n = t.nearby;
  if (loc.location) {
    return (
      <p className="loc-status ok" role="status">
        <span className="loc-dot" aria-hidden="true" /> {n.live}
        {Number.isFinite(loc.accuracy) ? ` · ±${Math.round(loc.accuracy)} m` : ''}
      </p>
    );
  }
  if (loc.error) {
    return (
      <p className="loc-status err" role="status">
        {n.errors[loc.error] || n.errors.failed}{' '}
        <button type="button" className="btn soft small" onClick={() => retryLocation()}>{n.retry}</button>
      </p>
    );
  }
  return <p className="loc-status" role="status">{n.locating}</p>;
}
