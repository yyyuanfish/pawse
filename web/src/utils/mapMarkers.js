// Which places become numbered pins on the map. The same numbers appear in the lists below the map.
export function validLatLng(p) {
  const lat = Number(p && p.lat);
  const lng = Number(p && p.lng);
  return p && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)
    ? { lat, lng }
    : null;
}

/** Numbered pins for one kind ('vets' | 'taxi' | 'insurer'), in list order; places without coordinates get no pin. */
export function markersFor(kind, items = []) {
  const out = [];
  for (const item of items) {
    const position = validLatLng(item && item.location);
    if (!position) continue;
    out.push({
      id: item.id, n: out.length + 1, kind, position, title: item.name || '', address: item.address || '',
      phone: item.phone || '', callUrl: /^tel:\+[1-9]\d{6,14}$/.test(item.callUrl || '') ? item.callUrl : '',
      distanceKm: Number.isFinite(item.distanceKm) ? item.distanceKm : null, mapsUrl: item.mapsUrl || '',
    });
  }
  return out;
}

/** id -> pin number, for the badges in the lists. */
export function pinNumbers(markers) {
  return new Map(markers.map((m) => [m.id, m.n]));
}
