import json
import httpx
import pytest
from fastapi.testclient import TestClient
from pawse.app import app
from pawse import telephony

ENV = {'TWILIO_ACCOUNT_SID': 'AC123', 'TWILIO_AUTH_TOKEN': 'private-twilio', 'TWILIO_FROM_NUMBER': '+15550001111',
       'DEMO_PHONE_NUMBER': '+41790000012', 'PUBLIC_URL': 'https://demo.example', 'GEMINI_API_KEY': 'g', 'GRADIUM_API_KEY': 'r'}
BODY = {'target': 'vet', 'place': 'Kleintierpraxis Test', 'summary': 'Mimi limps after a jump.', 'share_with_gemini': True,
        'share_with_gradium': True, 'confirm_demo_line': True}


@pytest.fixture(autouse=True)
def clean(monkeypatch):
    for k in ENV:
        monkeypatch.delenv(k, raising=False)
    telephony.calls.clear()


def twilio(monkeypatch, seen, status=201):
    factory = httpx.AsyncClient
    def handler(req):
        seen.append(req)
        return httpx.Response(status, json={'sid': 'CA1'})
    monkeypatch.setattr(telephony.httpx, 'AsyncClient', lambda *a, **kw: factory(transport=httpx.MockTransport(handler)))
    async def fake_synth(text, voice_id):
        return b'RIFF' + text.encode()
    monkeypatch.setattr(telephony, 'synth', fake_synth)


def test_not_configured_and_consent():
    with TestClient(app) as c:
        assert c.get('/api/v1/calls/status').json() == {'configured': False, 'demo_line': None}
        for k in ['share_with_gemini', 'share_with_gradium', 'confirm_demo_line']:
            assert c.post('/api/v1/calls', json=BODY | {k: False}).status_code == 422
        assert c.post('/api/v1/calls', json=BODY).status_code == 503


def test_call_dials_only_the_demo_line_and_streams_events(monkeypatch):
    for k, v in ENV.items():
        monkeypatch.setenv(k, v)
    seen = []
    twilio(monkeypatch, seen)
    with TestClient(app) as c:
        status = c.get('/api/v1/calls/status').json()
        assert status['configured'] and '12' in status['demo_line'] and '+41790000012' not in json.dumps(status)
        r = c.post('/api/v1/calls', json=BODY)
        assert r.status_code == 201
        call_id = r.json()['id']
        form = dict(httpx.QueryParams(seen[0].content.decode()))
        assert form['To'] == '+41790000012' and form['From'] == '+15550001111'
        assert form['Url'] == f'https://demo.example/api/v1/calls/{call_id}/twiml'
        assert set(form) == {'To', 'From', 'Url'}  # trial accounts reject other parameters

        assert 'private-twilio' not in r.text
        assert c.post('/api/v1/calls', json=BODY).status_code == 429  # one call at a time
        # The callee answers: Pawse discloses it is an AI, speaks with Gradium audio, then listens.
        replies = iter([('Mimi needs to be seen today.', False, {}), ('Perfect, 4:30 works. Goodbye!', True, {'status': 'booked', 'slot': 'today 16:30', 'note': 'Booked'})])
        async def fake_line(req, history):
            return next(replies)
        async def fake_synth(text, voice_id):
            return b'RIFF' + text.encode()
        monkeypatch.setattr(telephony, 'next_line', fake_line)
        monkeypatch.setattr(telephony, 'synth', fake_synth)
        answer = c.post(f'/api/v1/calls/{call_id}/twiml').text
        assert f'/api/v1/calls/{call_id}/audio/0</Play>' in answer and f'/api/v1/calls/{call_id}/opening</Redirect>' in answer
        assert c.get(f'/api/v1/calls/{call_id}/audio/0').content == b'RIFF' + telephony.DISCLOSURE.encode()
        opening = c.post(f'/api/v1/calls/{call_id}/opening').text
        assert f'/api/v1/calls/{call_id}/audio/1</Play>' in opening and '<Gather input="speech"' in opening
        assert c.get(f'/api/v1/calls/{call_id}/audio/1').content == b'RIFFMimi needs to be seen today.'
        assert '<Hangup/>' in c.post(f'/api/v1/calls/{call_id}/twiml').text  # answered only once
        done = c.post(f'/api/v1/calls/{call_id}/turn', content='SpeechResult=We+have+4%3A30+today', headers={'Content-Type': 'application/x-www-form-urlencoded'}).text
        assert '<Hangup/>' in done
        call = telephony.calls[call_id]
        assert call['history'][0] == ('ai', telephony.DISCLOSURE) and call['history'][2] == ('callee', 'We have 4:30 today')
        assert call['outcome']['slot'] == 'today 16:30'
        assert c.post(f'/api/v1/calls/{call_id}/twilio-status', content='CallStatus=no-answer',
                      headers={'Content-Type': 'application/x-www-form-urlencoded'}).status_code == 200
        lines = [l for l in c.get(f'/api/v1/calls/{call_id}/events').text.splitlines() if l.startswith('data: ')]
        events = [json.loads(l[6:]) for l in lines]
        assert events[0]['state'] == 'dialing' and events[-1]['state'] == 'ended'
        assert events[-1]['outcome']['status'] == 'not_reached'
    with TestClient(app) as other:
        assert other.get(f'/api/v1/calls/{call_id}/events').status_code == 404  # another session cannot watch it


def test_twilio_failure_is_502_and_unknown_stream_is_refused(monkeypatch):
    for k, v in ENV.items():
        monkeypatch.setenv(k, v)
    twilio(monkeypatch, [], status=400)
    with TestClient(app) as c:
        assert c.post('/api/v1/calls', json=BODY).status_code == 502
        assert not telephony.calls
        assert '<Hangup/>' in c.post('/api/v1/calls/unknown/twiml').text
        assert '<Hangup/>' in c.post('/api/v1/calls/unknown/turn').text


def test_public_url_host_is_trusted(monkeypatch):
    from pawse import public
    monkeypatch.setenv('PUBLIC_URL', 'https://abc.trycloudflare.com')
    assert 'abc.trycloudflare.com' in public.allowed_hosts()


def test_ulaw_wav_header():
    wav = telephony.ulaw_wav(b'\xff' * 800)
    import io, struct
    assert wav[:4] == b'RIFF' and wav[8:12] == b'WAVE' and struct.unpack('<H', wav[20:22])[0] == 7  # mu-law
    assert struct.unpack('<I', wav[4:8])[0] == len(wav) - 8 and wav.endswith(b'\xff' * 800)


def test_synth_queues_and_retries_gradium(monkeypatch):
    import asyncio
    from fastapi import HTTPException
    active, peak, attempts = 0, 0, {}
    async def fake_gradium(client, method, path, **kw):
        nonlocal active, peak
        text = kw['json']['text']
        attempts[text] = attempts.get(text, 0) + 1
        active += 1; peak = max(peak, active)
        await asyncio.sleep(0.01); active -= 1
        if text == 'flaky' and attempts[text] < 2:
            raise HTTPException(502, 'busy')
        return httpx.Response(200, content=b'\xff' * 10)
    import pawse.voice
    monkeypatch.setattr(pawse.voice, 'gradium', fake_gradium)
    async def run():
        return await asyncio.gather(*[telephony.synth(t, 'v') for t in ['a', 'b', 'c', 'd', 'flaky']])
    out = asyncio.run(run())
    assert peak <= 2 and attempts['flaky'] == 2 and all(o.endswith(b'\xff' * 10) for o in out)


def test_slot_start_only_accepts_plausible_upcoming_times():
    from datetime import datetime, timedelta
    soon = (datetime.now(telephony.ZURICH) + timedelta(hours=2)).strftime('%Y-%m-%dT%H:%M')
    assert telephony.slot_start(soon) == soon
    assert telephony.slot_start(soon + ':00+02:00') == soon
    for bad in [None, '', 'today at 4:30', '2020-01-01T10:00', '2099-01-01T10:00']:
        assert telephony.slot_start(bad) is None


def test_event_stream_resumes_after_last_event_id(monkeypatch):
    for k, v in ENV.items():
        monkeypatch.setenv(k, v)
    twilio(monkeypatch, [])
    with TestClient(app) as c:
        call_id = c.post('/api/v1/calls', json=BODY).json()['id']
        call = telephony.calls[call_id]
        telephony.emit(call, {'type': 'line', 'who': 'ai', 'text': 'one'})
        telephony.finish(call)
        full = [l for l in c.get(f'/api/v1/calls/{call_id}/events').text.splitlines() if l.startswith('id: ')]
        resumed = [l for l in c.get(f'/api/v1/calls/{call_id}/events', headers={'Last-Event-ID': '1'}).text.splitlines() if l.startswith('id: ')]
        assert full[:2] == ['id: 0', 'id: 1'] and resumed and resumed[0] == 'id: 2'
