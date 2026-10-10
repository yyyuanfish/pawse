// Nearby taxis and the owner's insurer contact from the Pawse backend (POST /api/v1/places/*).
// Only coordinates (with consent) and the insurer name are sent; never symptoms or policy details.
import { CLINIC_SEARCH_URL } from '../config.js';

async function post(path, body, fetchImpl = globalThis.fetch) {
  const res = await fetchImpl((CLINIC_SEARCH_URL || '') + '/api/v1/places/' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(typeof error.detail === 'string' ? error.detail : `Lookup failed (${res.status})`);
  }
  return res.json();
}

/** One backend Place to the frontend shape; phone links only for valid international numbers. */
export function mapPlace(p) {
  const out = { id: p.id, name: p.name, address: p.address || '', source: p.source, retrievedAt: p.retrieved_at };
  if (p.phone) out.phone = p.phone;
  if (/^tel:\+[1-9]\d{6,14}$/.test(p.call_url || '')) out.callUrl = p.call_url;
  if (p.maps_url) out.mapsUrl = p.maps_url;
  if (p.website) out.website = p.website;
  if (typeof p.rating === 'number') out.rating = p.rating;
  return out;
}

function result(data) {
  return { status: data.status, places: (data.places || []).map(mapPlace), warnings: data.warnings || [], note: data.note || '' };
}

export async function findTaxis(location, fetchImpl) {
  if (!location) throw new Error('Location is needed to find taxis nearby.');
  return result(await post('nearby', { kind: 'taxi', location: { lat: location.lat, lng: location.lng }, share_location: true }, fetchImpl));
}

export async function findInsurer(company, location, fetchImpl) {
  const body = { company };
  if (location) Object.assign(body, { location: { lat: location.lat, lng: location.lng }, share_location: true });
  return result(await post('insurer', body, fetchImpl));
}
