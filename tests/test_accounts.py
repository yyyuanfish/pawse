import pytest
from fastapi.testclient import TestClient
from pawse.app import app
from pawse import store


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setenv('PAWSE_DB_PATH', str(tmp_path / 'test.db'))


def test_guest_history_register_login_elsewhere_and_logout():
    with TestClient(app) as phone:
        assert phone.get('/api/v1/me').json() == {'signed_in': False, 'username': None}
        assert phone.post('/api/v1/history', json={'kind': 'assessment', 'title': 'Contact a vet today', 'detail': {'level': 'yellow'}}).status_code == 201
        assert phone.post('/api/v1/history', json={'kind': 'other', 'title': 'x'}).status_code == 422
        assert phone.post('/api/v1/auth/register', json={'username': 'mimi_owner', 'password': 'whiskers1'}).status_code == 201
        assert phone.get('/api/v1/me').json()['username'] == 'mimi_owner'
        assert [h['title'] for h in phone.get('/api/v1/history').json()['items']] == ['Contact a vet today']
    with TestClient(app) as laptop:
        assert laptop.get('/api/v1/history').json()['items'] == []
        assert laptop.post('/api/v1/auth/login', json={'username': 'mimi_owner', 'password': 'wrong-pass'}).status_code == 401
        assert laptop.post('/api/v1/auth/register', json={'username': 'mimi_owner', 'password': 'another1'}).status_code == 409
        assert laptop.post('/api/v1/auth/login', json={'username': 'mimi_owner', 'password': 'whiskers1'}).status_code == 200
        items = laptop.get('/api/v1/history').json()['items']
        assert [h['title'] for h in items] == ['Contact a vet today'] and items[0]['detail'] == {'level': 'yellow'}
        assert laptop.post('/api/v1/auth/logout').json() == {'signed_in': False, 'username': None}
        assert laptop.get('/api/v1/me').json()['signed_in'] is False


def test_passwords_are_hashed():
    user, _ = store.new_guest()
    assert store.register(user, 'cat_person', 'secret123')
    stored = store.run('select password from users where id = ?', (user,))[0]['password']
    assert stored.startswith('scrypt$') and 'secret123' not in stored
    assert store.password_ok('secret123', stored) and not store.password_ok('nope', stored)
