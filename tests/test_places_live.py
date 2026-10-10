"""Real Google Places search quality (opt-in, spends Places quota).

    set -a; . ./.env; set +a     # GOOGLE_PLACES_API_KEY
    PAWSE_LIVE_PLACES=1 python -m pytest -q tests/test_places_live.py

Guards the 2026-10-10 regression: Nearby Search by type returned a psychologist, a pharmacy, a bird charity
and homeopaths around Zurich. The vet text search must keep returning real practices with distances.
"""
import os

import httpx
import pytest

from pawse.models import CareRequest
from pawse.providers import google_clinics

pytestmark = pytest.mark.skipif(not (os.getenv('PAWSE_LIVE_PLACES') == '1' and os.getenv('GOOGLE_PLACES_API_KEY')),
                                reason='set PAWSE_LIVE_PLACES=1 and GOOGLE_PLACES_API_KEY')

NOT_VETS = ('psycholog', 'apotheke', 'mauersegler', 'homöopath', 'homeopat', 'placeholder', 'circle clinic', 'esccap',
            'svgvm', 'pferd', 'nutztier')
PRACTICE = ('tierarzt', 'tierärzt', 'kleintier', 'tierklinik', 'tierspital', 'vet', 'med. vet', 'dr.')


@pytest.mark.asyncio
@pytest.mark.parametrize('lat,lng', [(47.3769, 8.5417), (47.3667, 8.55)])  # Zurich HB, Seefeld
async def test_places_returns_real_vet_practices(lat, lng):
    async with httpx.AsyncClient() as client:
        clinics = await google_clinics(CareRequest(query='limping', location={'lat': lat, 'lng': lng}, share_location=True), client)
    names = [c.name.lower() for c in clinics]
    assert len(clinics) >= 8, names
    assert not [n for n in names if any(bad in n for bad in NOT_VETS)], names
    assert sum(any(word in n for word in PRACTICE) for n in names) >= 0.8 * len(names), names
    assert all(c.distance_km is not None and c.distance_km <= 10 for c in clinics)
    assert min(c.distance_km for c in clinics) < 2
