import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps, onMapsAuthFailure } from '../agents/googleMaps.js';
import { createMapController } from '../agents/mapController.js';
import { haversineKm } from '../agents/liveClinicSearch.js';
import { ZURICH } from '../agents/location.js';
import { mapEmbedUrl } from '../utils/mapEmbed.js';
import LocationStatus from './LocationStatus.jsx';

/**
 * One Google map with the owner's live position and the pins of the chosen tab (vets, taxis, insurer).
 * Interactive when the backend serves a browser key; otherwise a keyless embed that cannot show both.
 */
export default function LiveMap({ t, lang, loc, mode, onMode, markers, focus }) {
  const n = t.nearby;
  const box = useRef(null);
  const ctl = useRef(null);
  const [api, setApi] = useState(undefined); // undefined: loading, null: unavailable
  const pins = mode === 'me' ? [] : markers[mode] || [];

  useEffect(() => {
    let alive = true;
    loadGoogleMaps({ lang }).then((a) => alive && setApi(a));
    const off = onMapsAuthFailure(() => alive && setApi(null));
    return () => { alive = false; off(); };
  }, [lang]);

  // Create the map once the library and the container exist.
  useEffect(() => {
    if (!api || !box.current || ctl.current) return undefined;
    ctl.current = createMapController(api, box.current, { center: loc.location || ZURICH, labels: { me: n.you } });
    // Billing or quota problems do not call gm_authFailure: Google draws an error dialog in the map instead.
    const watch = new MutationObserver(() => {
      if (box.current?.querySelector('.dismissButton')) setApi(null);
    });
    watch.observe(box.current, { childList: true, subtree: true });
    return () => { watch.disconnect(); ctl.current?.destroy(); ctl.current = null; };
  }, [api]); // eslint-disable-line react-hooks/exhaustive-deps -- the controller follows later changes itself

  // Live position: move the dot, never reload the map.
  useEffect(() => {
    ctl.current?.setMe(loc.location, loc.accuracy);
  }, [api, loc.location, loc.accuracy]);

  const pinKey = pins.map((m) => `${m.id}@${m.position.lat},${m.position.lng}`).join('|');
  useEffect(() => {
    if (!ctl.current) return;
    ctl.current.setPins(pins);
    if (mode === 'me') ctl.current.recenter();
  }, [api, mode, pinKey]); // eslint-disable-line react-hooks/exhaustive-deps -- pinKey captures the pins

  useEffect(() => {
    if (focus && ctl.current) ctl.current.open(focus);
  }, [api, focus, pinKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const tabs = [
    ['me', n.mapMe],
    ['vets', `${n.mapVets}${markers.vets.length ? ` · ${markers.vets.length}` : ''}`],
    ['taxi', `${n.mapTaxi}${markers.taxi.length ? ` · ${markers.taxi.length}` : ''}`],
    ...(markers.insurer.length ? [['insurer', n.mapInsurer]] : []),
  ];

  return (
    <section className="live-map card" aria-label={n.mapTitle}>
      <div className="live-map-head">
        <h2>{n.mapTitle}</h2>
        <LocationStatus t={t} loc={loc} />
      </div>
      <div className="map-tabs" role="tablist">
        {tabs.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={mode === key} className={mode === key ? 'chip on' : 'chip'} onClick={() => onMode(key)}>
            {label}
          </button>
        ))}
      </div>
      {api === null ? (
        <EmbedFallback t={t} lang={lang} loc={loc} mode={mode} focus={focus} pins={pins} />
      ) : (
        <div className="map-frame interactive">
          {!api && <p className="map-loading muted small">{n.mapLoading}</p>}
          <div ref={box} className="map-canvas" />
          {api && loc.location && (
            <button type="button" className="map-recenter" onClick={() => ctl.current?.recenter()} aria-label={n.recenter}>
              ◎
            </button>
          )}
        </div>
      )}
      <p className="map-legend muted small">
        <span><i className="legend-me" /> {n.you}</span>
        <span>🏥 {n.mapVets}</span>
        <span>🚕 {n.mapTaxi}</span>
        {api === null && <span>· {n.mapKeyless}</span>}
      </p>
      <p className="muted small">
        <span translate="no">Google Maps</span> · {n.mapNote}
      </p>
    </section>
  );
}

/** Without a browser key: Google's keyless embed of one view (the owner, a search, or one place). */
function EmbedFallback({ t, lang, loc, mode, focus, pins }) {
  const n = t.nearby;
  const [drawn, setDrawn] = useState(loc.location);
  useEffect(() => {
    // Redraw only after a move of more than 50 m: each redraw reloads the embed.
    if (loc.location && (!drawn || haversineKm(drawn, loc.location) > 0.05)) setDrawn(loc.location);
  }, [loc.location]); // eslint-disable-line react-hooks/exhaustive-deps
  const place = focus ? pins.find((p) => p.id === focus) : null;
  const src = place
    ? mapEmbedUrl({ mode: 'place', place: { name: place.title, address: place.address, mapsUrl: place.mapsUrl }, lang })
    : mapEmbedUrl({ mode: mode === 'insurer' ? 'me' : mode, location: drawn, lang });
  return (
    <div className="map-frame">
      {src ? (
        <>
          <p className="map-loading muted small">{n.mapLoading}</p>
          <iframe key={src} title={n.mapTitle} src={src} referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
        </>
      ) : (
        <p className="muted small center">{loc.error ? n.errors[loc.error] || n.errors.failed : n.locating}</p>
      )}
    </div>
  );
}
