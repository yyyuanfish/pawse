import Icon from './Icon.jsx';

/** One taxi or insurer listing: name, address, call and map links, Google Maps attribution. */
export default function PlaceRow({ t, place, onFocus }) {
  return (
    <li className="place-row">
      <div>
        <strong>{place.name}</strong>
        {place.address && <p className="muted small">{place.address}</p>}
        <p className="muted small">
          <span translate="no">{place.source === 'google_places' || place.source === 'gemini_maps' ? 'Google Maps' : place.source}</span>
          {typeof place.rating === 'number' ? ` · ★ ${place.rating.toFixed(1)}` : ''}
        </p>
      </div>
      <div className="place-actions">
        {place.callUrl && (
          <a className="btn primary small" href={place.callUrl}>
            <Icon name="phone" size={14} /> {place.phone}
          </a>
        )}
        {onFocus && (
          <button type="button" className="btn ghost small" onClick={() => onFocus(place)}>
            <Icon name="pin" size={14} /> {t.nearby.showOnMap}
          </button>
        )}
      </div>
    </li>
  );
}
