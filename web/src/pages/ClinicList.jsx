import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { searchClinics, IS_LIVE_CLINICS } from '../agents/index.js';
import ProviderChips from '../components/ProviderChips.jsx';
import { clinicProviders } from '../agents/providers.js';
import { validateClinics } from '../contracts.js';
import { waitForLocation, ZURICH } from '../agents/location.js';
import useLiveLocation from '../hooks/useLiveLocation.js';
import LiveMap from '../components/LiveMap.jsx';
import NearbyTaxis from '../components/NearbyTaxis.jsx';
import InsurerContact from '../components/InsurerContact.jsx';
import PinBadge from '../components/PinBadge.jsx';
import { useInsurer, useTaxis } from '../hooks/useNearby.js';
import { markersFor, pinNumbers } from '../utils/mapMarkers.js';

// Attribution for each clinic source; OSM data is ODbL and Google Maps content must be credited.
const SOURCE_LABELS = {
  google_places: 'Google Maps',
  gemini_maps: 'Google Maps',
  openstreetmap: '© OpenStreetMap contributors',
  mapify: 'Mapify',
};

// Live results only claim distance order when the provider shared distances (Google Maps grounding does not).
function liveSubtitle(t, state) {
  if (state.status !== 'ok') return t.clinicsSubLive;
  const sorted = state.clinics.some((c) => Number.isFinite(c.distanceKm)) ? t.clinicsSubDistance : t.clinicsSubMaps;
  return `${sorted} · ${t.clinicsSubLive}`;
}

const SHORT_LIST = 8; // the best-ranked clinics; taxis and insurer follow without a long scroll

function retrievedTime(iso) {
  const d = new Date(iso);
  return iso && !Number.isNaN(d.getTime()) ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
}

export default function ClinicList({ t, lang, triage, rail, onPick, onBack }) {
  const [state, setState] = useState({ status: 'loading', clinics: [], located: true });
  const loc = useLiveLocation();
  const [mode, setMode] = useState('vets'); // map tab: me | vets | taxi | insurer
  const [focus, setFocus] = useState(null); // id of the pin whose card is open
  const [showAll, setShowAll] = useState(false);
  const taxis = useTaxis(loc.location, IS_LIVE_CLINICS);
  const insurer = useInsurer(loc.location, IS_LIVE_CLINICS);
  const visible = showAll ? state.clinics : state.clinics.slice(0, SHORT_LIST);
  const markers = useMemo(() => ({
    vets: markersFor('vets', visible), taxi: markersFor('taxi', taxis.places), insurer: markersFor('insurer', insurer.places),
  }), [visible, taxis.places, insurer.places]);
  const numbers = useMemo(() => ({ vets: pinNumbers(markers.vets), taxi: pinNumbers(markers.taxi), insurer: pinNumbers(markers.insurer) }), [markers]);
  const chooseMode = (m) => { setMode(m); setFocus(null); };
  const showOnMap = (kind, id) => {
    setMode(kind);
    setFocus(id);
    globalThis.scrollTo?.({ top: 0, behavior: 'smooth' });
  };

  const load = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading' }));
    const location = await waitForLocation(8000); // the live position started when the app opened
    try {
      const res = await searchClinics({ lang, location: location || ZURICH, triage });
      const problems = validateClinics(res);
      if (problems.length) console.warn('[Pawse] clinic list violates the contract:', problems, res);
      setState({ status: 'ok', clinics: (res && res.clinics) || [], located: !!location });
    } catch (e) {
      console.warn('[Pawse] clinic search failed:', e);
      setState({ status: 'error', clinics: [], located: !!location, error: e.message });
    }
  }, [lang, triage]);

  useEffect(() => {
    load();
  }, [load]);

  // The first search ran without a position (permission still pending): search again once it arrives.
  const lateLocation = state.status === 'ok' && !state.located && !!loc.location;
  useEffect(() => {
    if (lateLocation) load();
  }, [lateLocation, load]);

  const firstOpen = state.clinics.find((c) => c.openNow);

  return (
    <main className="clinics">
      {rail}
      <header className="clinics-head">
        <button type="button" className="round-btn light" onClick={onBack} aria-label={t.back}>
          <Icon name="arrowLeft" size={20} />
        </button>
        <div>
          <h1>{t.clinicsTitle}</h1>
          <p className="muted small">{IS_LIVE_CLINICS ? liveSubtitle(t, state) : t.clinicsSub}</p>
        </div>
      </header>
      <LiveMap t={t} lang={lang} loc={loc} mode={mode} onMode={chooseMode} markers={markers} focus={focus} />

      {state.status !== 'loading' && (
        <ProviderChips t={t} items={clinicProviders({ live: IS_LIVE_CLINICS, clinics: state.clinics, failed: state.status === 'error' })} />
      )}

      {state.status === 'loading' && (
        <div className="clinic-list" aria-busy="true">
          <p className="muted center">{t.clinicsLoading}</p>
          {[0, 1, 2].map((i) => (
            <div key={i} className="clinic skeleton" aria-hidden="true">
              <span className="sk sk-title" />
              <span className="sk sk-line" />
              <span className="sk sk-line short" />
            </div>
          ))}
        </div>
      )}

      {state.status === 'error' && (
        <div className="clinic-empty">
          <p>{state.error || t.clinicsError}</p>
          <button type="button" className="btn primary" onClick={load}>
            {t.retry}
          </button>
        </div>
      )}

      {state.status === 'ok' && (
        <div className="clinic-list">
          {!state.located && <p className="note">{t.noLocation}</p>}
          {state.clinics.length === 0 && (
            <div className="clinic-empty">
              <p>{state.error || t.clinicsError}</p>
              <button type="button" className="btn primary" onClick={load}>
                {t.retry}
              </button>
            </div>
          )}
          {visible.map((c) => (
            <article key={c.id} className={c.openNow || c.openUnknown ? 'clinic' : 'clinic closed'}>
              <div className="clinic-top">
                <h2>
                  <PinBadge n={numbers.vets.get(c.id)} kind="vets" />
                  {c.name}
                </h2>
                <span className="clinic-dist">{Number.isFinite(c.distanceKm) ? `${c.distanceKm.toFixed(1)} km` : t.distanceUnknown}</span>
              </div>
              <div className="clinic-tags">
                {c.openUnknown ? (
                  <span className="tag plain">{c.hoursText}</span>
                ) : (
                  <span className={c.openNow ? 'tag open' : 'tag shut'}>{c.openNow ? t.openNow : t.closed}</span>
                )}
                {c.emergency && <span className="tag emer">{IS_LIVE_CLINICS ? 'Emergency service reported — confirm hours' : t.emergency24}</span>}
                {!IS_LIVE_CLINICS && firstOpen && firstOpen.id === c.id && <span className="tag near">{t.nearest}</span>}
                {typeof c.rating === 'number' && <span className="tag plain">★ {c.rating.toFixed(1)}</span>}
              </div>
              {c.hoursText && !c.openUnknown && <p className="muted small">{c.hoursText}</p>}
              {c.callUrl && <p className="small"><a href={c.callUrl}>{c.phone}</a></p>}
              {c.hoursList && (
                <details className="muted small">
                  <summary>Listed opening hours (call to confirm)</summary>
                  {c.hoursList.map((h) => <div key={h}>{h}</div>)}
                </details>
              )}
              <p className="muted small"><span translate="no">{SOURCE_LABELS[c.source] || c.source}</span>{retrievedTime(c.retrievedAt) && ` · ${t.retrievedAt} ${retrievedTime(c.retrievedAt)}`}</p>
              <p className="clinic-addr small">{c.address}</p>
              <div className="clinic-actions">
                {numbers.vets.has(c.id) && (
                  <button type="button" className="btn ghost small" onClick={() => showOnMap('vets', c.id)}>
                    <Icon name="pin" size={16} /> {t.nearby.showOnMap}
                  </button>
                )}
                {c.mapsUrl && (
                  <a className="btn ghost small" href={c.mapsUrl} target="_blank" rel="noreferrer">
                    {t.map} ↗
                  </a>
                )}
                <button type="button" className="btn primary small" disabled={!c.openNow && !c.openUnknown} onClick={() => onPick(c)}>
                  <Icon name="phone" size={16} /> {IS_LIVE_CLINICS ? 'Prepare conversation' : t.callThis}
                </button>
              </div>
            </article>
          ))}
          {!showAll && state.clinics.length > SHORT_LIST && (
            <button type="button" className="btn soft wide" onClick={() => setShowAll(true)}>
              {t.nearby.showAll.replace('{n}', state.clinics.length)}
            </button>
          )}
          <p className="ai-note center">{t.aiNote}</p>
        </div>
      )}

      {IS_LIVE_CLINICS && <NearbyTaxis t={t} hasLocation={!!loc.location} state={taxis} numbers={numbers.taxi} onFocus={showOnMap} />}
      {IS_LIVE_CLINICS && <InsurerContact t={t} state={insurer} numbers={numbers.insurer} onFocus={showOnMap} />}
    </main>
  );
}
