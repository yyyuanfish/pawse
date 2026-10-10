import Icon from './Icon.jsx';
import PinBadge from './PinBadge.jsx';

/** One taxi or insurer listing: pin number, name, address, distance, call and map links, Google Maps attribution. */
export default function PlaceRow({ t, place, n, kind, onFocus }) {
  return (
    <li className="place-row">
      <div>
        <strong>
          <PinBadge n={n} kind={kind} />
          {place.name}
        </strong>
        {place.address && <p className="muted small">{place.address}</p>}
        <p className="muted small">
          <span translate="no">{place.source === 'google_places' || place.source === 'gemini_maps' ? 'Google Maps' : place.source}</span>
          {typeof place.rating === 'number' ? ` · ★ ${place.rating.toFixed(1)}` : ''}
          {Number.isFinite(place.distanceKm) ? ` · ${place.distanceKm.toFixed(1)} km` : ''}
        </p>
      </div>
      <div className="place-actions">
        {place.callUrl && (
          <a className="btn primary small" href={place.callUrl}>
            <Icon name="phone" size={14} /> {place.phone}
          </a>
        )}
        {onFocus && n && (
          <button type="button" className="btn ghost small" onClick={() => onFocus(kind, place.id)}>
            <Icon name="pin" size={14} /> {t.nearby.showOnMap}
          </button>
        )}
      </div>
    </li>
  );
}
