// Keyless Google Maps embed URLs. No API key reaches the browser; the owner's coordinates go to Google
// only to draw the map they asked for.
const BASE = 'https://maps.google.com/maps?';
const SEARCH = { vets: 'Tierarzt', taxi: 'Taxi' };

const round = (n) => Number(n).toFixed(4); // about 11 m: fewer map reloads while the owner moves

function placeCid(mapsUrl) {
  try {
    const cid = new URL(mapsUrl).searchParams.get('cid');
    return /^\d{1,25}$/.test(cid || '') ? cid : null;
  } catch {
    return null;
  }
}

/**
 * mode: 'me' | 'vets' | 'taxi' | 'place'. Returns null when the map would need a location we do not have;
 * never substitutes a default city.
 */
export function mapEmbedUrl({ mode = 'me', location = null, place = null, lang = 'en' } = {}) {
  const p = new URLSearchParams();
  if (mode === 'place' && place) {
    const cid = placeCid(place.mapsUrl);
    if (cid) p.set('cid', cid);
    else if (place.name) p.set('q', [place.name, place.address].filter(Boolean).join(', '));
    else return null;
    p.set('z', '16');
  } else if (location && Number.isFinite(location.lat) && Number.isFinite(location.lng)) {
    const ll = `${round(location.lat)},${round(location.lng)}`;
    if (SEARCH[mode]) {
      p.set('q', SEARCH[mode]);
      p.set('ll', ll);
      p.set('z', '14');
    } else {
      p.set('q', ll);
      p.set('z', '16');
    }
  } else {
    return null;
  }
  p.set('hl', /^[a-z]{2}$/.test(lang) ? lang : 'en');
  p.set('output', 'embed');
  return BASE + p.toString();
}
