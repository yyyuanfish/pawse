import httpx
from fastapi.testclient import TestClient
from pawse.app import app
from pawse import vision

PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII='
def test_consent_and_photo_validation():
    with TestClient(app) as c:
        for payload in [{'photo':{'mime_type':'image/png','data':PNG},'share_with_ai':False}, {'photo':{'mime_type':'image/png','data':'secret-invalid'},'share_with_ai':True}]:
            r=c.post('/api/v1/vision/observations',json=payload)
            assert r.status_code==422 and 'secret-invalid' not in r.text

def test_abstention_and_reported_emergency(monkeypatch):
    monkeypatch.setenv('GEMINI_API_KEY','test')
    factory=httpx.AsyncClient
    observation={'injury':{},'cat_detected':False,'face_assessable':True,'image_quality':'unusable','visible_observations':{k:'invented' for k in vision.VisibleFeatures.model_fields},'limitations':['Too small'],'questions_for_owner':['Can you take a clearer photo?']}
    import json
    def reply(r):
        assert r.headers['x-goog-api-key']=='test'
        return httpx.Response(200,json={'candidates':[{'content':{'parts':[{'text':json.dumps(observation)}]}}]})
    monkeypatch.setattr(vision.httpx,'AsyncClient',lambda:factory(transport=httpx.MockTransport(reply)))
    with TestClient(app) as c:
        r=c.post('/api/v1/vision/observations',json={'photo':{'mime_type':'image/png','data':PNG},'share_with_ai':True,'red_flags':['collapse']})
    assert r.status_code==200
    assert r.json()['urgency']=='emergency' and not r.json()['face_assessable']
    assert set(r.json()['visible_observations'].values())=={'not_visible'}

def test_provider_failure_is_redacted(monkeypatch):
    monkeypatch.setenv('GEMINI_API_KEY','test')
    factory=httpx.AsyncClient
    monkeypatch.setattr(vision.httpx,'AsyncClient',lambda:factory(transport=httpx.MockTransport(lambda r:httpx.Response(500,text='private provider detail'))))
    with TestClient(app) as c:
        r=c.post('/api/v1/vision/observations',json={'photo':{'mime_type':'image/png','data':PNG},'share_with_ai':True})
        assert r.status_code==502 and 'private provider detail' not in r.text

def test_suspected_wound_routes_to_vet_without_claiming_active_bleeding(monkeypatch):
    import json
    monkeypatch.setenv('GEMINI_API_KEY','test')
    factory=httpx.AsyncClient
    observation={'cat_detected':True,'face_assessable':False,'image_quality':'limited','visible_observations':{k:'not_visible' for k in vision.VisibleFeatures.model_fields},'limitations':['Still photo'],'questions_for_owner':['Is bleeding ongoing?'], 'injury':{'wound':'suspected','blood_like_material':'suspected','location':'near ear','description':'Red skin with dark crust.', 'active_bleeding':'model incorrectly claims active bleeding'}}
    monkeypatch.setattr(vision.httpx,'AsyncClient',lambda:factory(transport=httpx.MockTransport(lambda r:httpx.Response(200,json={'candidates':[{'content':{'parts':[{'text':json.dumps(observation)}]}}]}))))
    with TestClient(app) as c:
        r=c.post('/api/v1/vision/observations',json={'photo':{'mime_type':'image/png','data':PNG},'share_with_ai':True})
    assert r.status_code==200
    assert r.json()['urgency']=='contact_vet'
    assert r.json()['injury']['active_bleeding']=='cannot_determine_from_photo'
    assert 'heavy' in r.json()['next_step']
