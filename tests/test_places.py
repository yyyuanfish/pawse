"""Nearby taxis and insurer contact: grounded facts only, generic queries, nothing booked."""
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from pawse import places
from pawse.app import app

ZURICH = {'lat': 47.3769, 'lng': 8.5417}


def maps_chunk(pid, title, text):
    return {'maps': {'placeId': pid, 'title': title + ' - Google Maps', 'uri': f'https://maps.google.com/?cid={pid}', 'text': text}}


def grounded(*chunks):
    return httpx.Response(200, json={'candidates': [{'content': {'parts': [{'text': 'call +41 00 000 00 00'}]},
                                                     'groundingMetadata': {'groundingChunks': list(chunks)}}]})


@pytest.fixture
def upstream(monkeypatch):
    for key in ('GOOGLE_PLACES_API_KEY', 'MAPIFY_BASE_URL'):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv('GEMINI_API_KEY', 'test-only')
    seen, reply = [], {}
    def handler(r):
        seen.append(r)
        return reply['fn'](r)
    original = httpx.AsyncClient
    monkeypatch.setattr(places.httpx, 'AsyncClient', lambda **kw: original(transport=httpx.MockTransport(handler), **kw))
    return seen, reply


def test_taxis_come_from_grounding_sources_and_are_never_booked(upstream):
    seen, reply = upstream
    reply['fn'] = lambda r: grounded(maps_chunk('t1', 'Zurich Taxi 24', '* **Address:** Bahnhofplatz\n* **Phone:** +41 44 321 28 28'),
                                     maps_chunk('cafe', 'Café Sprüngli', '* **Phone:** +41 44 000 00 00'))
    with TestClient(app) as c:
        r = c.post('/api/v1/places/nearby', json={'kind': 'taxi', 'location': ZURICH, 'share_location': True})
    d = r.json()
    assert r.status_code == 200 and d['status'] == 'complete'
    assert [p['name'] for p in d['places']] == ['Zurich Taxi 24']
    assert d['places'][0]['call_url'] == 'tel:+41443212828' and d['places'][0]['source'] == 'gemini_maps'
    assert 'not booked' in d['note']
    body = json.loads(seen[0].content)
    assert body['toolConfig']['retrievalConfig']['latLng'] == {'latitude': 47.3769, 'longitude': 8.5417}


def test_taxi_lookup_requires_location_consent(upstream):
    with TestClient(app) as c:
        r = c.post('/api/v1/places/nearby', json={'kind': 'taxi', 'location': ZURICH})
    assert r.status_code == 422


def test_quota_or_outage_is_reported_not_hidden(upstream):
    _, reply = upstream
    reply['fn'] = lambda r: httpx.Response(429)
    with TestClient(app) as c:
        d = c.post('/api/v1/places/nearby', json={'kind': 'taxi', 'location': ZURICH, 'share_location': True}).json()
    assert d['status'] == 'unavailable' and d['places'] == [] and d['warnings'] == ['gemini_maps_unavailable']


def test_insurer_lookup_keeps_only_the_named_company_and_no_location_without_consent(upstream):
    seen, reply = upstream
    reply['fn'] = lambda r: grounded(maps_chunk('c1', 'Calingo Insurance AG', '* **Address:** Reinhardstrasse 19, 8008 Zürich'),
                                     maps_chunk('x1', 'Other Versicherung', '* **Address:** Elsewhere'))
    with TestClient(app) as c:
        d = c.post('/api/v1/places/insurer', json={'company': 'Calingo', 'location': ZURICH}).json()
    assert [p['address'] for p in d['places']] == ['Reinhardstrasse 19, 8008 Zürich']
    assert 'not your policy' in d['note']
    body = json.loads(seen[0].content)
    assert body['toolConfig'] == {} and 'Calingo' in body['contents'][0]['parts'][0]['text']


def test_demo_insurer_is_fictional_and_makes_no_request(upstream):
    seen, _ = upstream
    with TestClient(app) as c:
        d = c.post('/api/v1/places/insurer', json={'company': 'Pawse Demo Pet Insurance (fictional)'}).json()
    assert d['places'] == [] and 'fictional' in d['note'] and seen == []


@pytest.mark.asyncio
async def test_places_api_is_preferred_when_configured(upstream, monkeypatch):
    seen, reply = upstream
    monkeypatch.setenv('GOOGLE_PLACES_API_KEY', 'test-places')
    reply['fn'] = lambda r: httpx.Response(200, json={'places': [{'id': 'p1', 'displayName': {'text': 'Taxi 444'},
                                                                  'internationalPhoneNumber': '+41 44 444 44 44'}]})
    result, warnings = await places.lookup('taxi', 'prompt', places.Location(**ZURICH), 5, places.is_taxi)
    assert [p.source for p in result] == ['google_places'] and warnings == []
    assert seen[0].url.host == 'places.googleapis.com' and seen[0].headers['X-Goog-FieldMask'].startswith('places.id')
