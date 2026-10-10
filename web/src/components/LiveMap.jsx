import { useEffect, useState } from 'react';
import { mapEmbedUrl } from '../utils/mapEmbed.js';
import { haversineKm } from '../agents/liveClinicSearch.js';
import LocationStatus from './LocationStatus.jsx';

/** Google Maps view that follows the owner's live position and can switch to vets, taxis or one place. */
export default function LiveMap({ t, lang, loc, focus }) {
  const n = t.nearby;
  const [mode, setMode] = useState('me');
  const [drawn, setDrawn] = useState(loc.location);
  useEffect(() => {
    if (focus) setMode('place');
  }, [focus]);
  // Follow the owner, but redraw only after a move of more than 50 m: each redraw reloads the map.
  useEffect(() => {
    if (loc.location && (!drawn || haversineKm(drawn, loc.location) > 0.05)) setDrawn(loc.location);
  }, [loc.location]); // eslint-disable-line react-hooks/exhaustive-deps -- compare against the last drawn point only
  const src = mapEmbedUrl({ mode, location: drawn, place: focus, lang });
  const modes = [['me', n.mapMe], ['vets', n.mapVets], ['taxi', n.mapTaxi], ...(focus ? [['place', focus.name]] : [])];
  return (
    <section className="live-map card" aria-label={n.mapTitle}>
      <div className="live-map-head">
        <h2>{n.mapTitle}</h2>
        <LocationStatus t={t} loc={loc} />
      </div>
      <div className="map-tabs" role="tablist">
        {modes.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={mode === key} className={mode === key ? 'chip on' : 'chip'} onClick={() => setMode(key)}>
            {label}
          </button>
        ))}
      </div>
      <div className="map-frame">
        {src ? (
          <>
            {/* Under the map: visible until Google paints over it. The iframe load event fires long before that. */}
            <p className="map-loading muted small">{n.mapLoading}</p>
            <iframe key={src} title={n.mapTitle} src={src} referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
          </>
        ) : (
          <p className="muted small center">{loc.error ? n.errors[loc.error] || n.errors.failed : n.locating}</p>
        )}
      </div>
      <p className="muted small">
        <span translate="no">Google Maps</span> · {n.mapNote}
      </p>
    </section>
  );
}
