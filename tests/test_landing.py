from fastapi.testclient import TestClient
from pawse.app import app


def test_cloud_landing_and_assets():
    with TestClient(app) as client:
        page = client.get('/')
        assert page.status_code == 200
        assert 'A little less panic.' in page.text
        assert 'href="/app/?live=1"' in page.text
        for path in ['/landing', '/landing.css', '/landing.js', '/assets/cat-closeup.png']:
            assert client.get(path).status_code == 200
        assert client.get('/api/v1/health').json()['status'] == 'ok'
        assert client.get('/.env').status_code == 404
        assert client.get('/?demo=1').status_code == 200
        assert client.get('/static/app.js').status_code == 200
