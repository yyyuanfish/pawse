"""Evidence provenance and synthetic-scope checks; no provider calls."""

import hashlib
import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from pawse.knowledge import AVB_PATH, POLICY_PATH, ROOT, corpus, policy_evidence, router


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(router)
    with TestClient(app) as test_client:
        yield test_client


def test_full_policy_returns_every_corpus_section_with_exact_provenance():
    chunks, version = corpus()
    result = policy_evidence()
    assert [e.evidence_id for e in result.evidence] == [f"{c.source_id}:{c.section}" for c in chunks]
    assert result.method == "full_policy" and result.status == "evidence_found"
    assert result.corpus_version == version
    assert result.scope == "synthetic_demo" and result.synthetic is True
    assert result.insurance_approval == "not_obtained"
    assert "do not establish" in result.disclaimer
    texts = {AVB_PATH: (ROOT / AVB_PATH).read_bytes(), POLICY_PATH: (ROOT / POLICY_PATH).read_bytes()}
    for item in result.evidence:
        assert item.synthetic is True
        assert item.source_sha256 == hashlib.sha256(texts[item.source_path]).hexdigest()
        if item.source_id == "pawse-demo-avb":
            assert item.snippet in texts[AVB_PATH].decode()


def test_golden_path_clauses_are_in_the_evidence():
    by_id = {e.evidence_id: e for e in policy_evidence().evidence}
    assert "CHF 12'000" in by_id["pawse-demo-avb:1.2.5"].snippet  # house call
    assert by_id["pawse-demo-avb:1.2.6"].title.startswith("Complementary medicine")  # physio
    assert json.loads(by_id["pawse-demo-policy:/coverages/complementary_medicine"].snippet)["selected"] is False
    cost = json.loads(by_id["pawse-demo-policy:/cost_sharing"].snippet)
    assert cost == json.loads((ROOT / POLICY_PATH).read_text())["cost_sharing"]
    assert cost["annual_deductible_chf"] == 300 and cost["reimbursement_rate"] == .8
    assert "30 days" in by_id["pawse-demo-avb:2"].snippet


def test_evidence_route_serves_the_whole_policy_and_search_is_retired(client):
    response = client.get("/api/v1/knowledge/evidence")
    assert response.status_code == 200
    body = response.json()
    assert body["method"] == "full_policy" and body["status"] == "evidence_found"
    assert len(body["evidence"]) == len(corpus()[0])
    assert all("score" not in item for item in body["evidence"])
    assert client.post("/api/v1/knowledge/search", json={"query": "house call"}).status_code in (404, 405)


def test_corpus_is_a_fixed_document_allowlist_without_owner_details():
    chunks, version = corpus()
    assert len(version) == 16
    assert {chunk.path for chunk in chunks} == {POLICY_PATH, AVB_PATH}
    assert not any("user1@example.com" in chunk.snippet for chunk in chunks)
    assert not any(chunk.section.startswith("/policyholder") for chunk in chunks)
    assert len({chunk.section for chunk in chunks}) == len(chunks)  # evidence ids are unique


def test_corpus_failure_is_a_safe_503(client, monkeypatch):
    def missing():
        raise OSError("PRIVATE_PATH_SHOULD_NOT_LEAK")
    monkeypatch.setattr("pawse.knowledge.corpus", missing)
    response = client.get("/api/v1/knowledge/evidence")
    assert response.status_code == 503
    assert "PRIVATE_PATH_SHOULD_NOT_LEAK" not in response.text


def test_policy_view_shows_the_demo_schedule_without_policyholder_contact(client):
    response = client.get("/api/v1/knowledge/policy")
    assert response.status_code == 200
    body = response.json()
    assert body["policy_number"] == "PAWSE-DEMO-2026-000001" and body["synthetic"] is True
    assert body["cost_sharing"]["annual_deductible_chf"] == 300
    assert body["cost_sharing"]["reimbursement_rate"] == 0.8
    coverages = {c["key"]: c for c in body["coverages"]}
    assert coverages["accident_illness_base"]["selected"] is True
    assert coverages["complementary_medicine"]["selected"] is False
    assert "Mimi" in body["insured_animals"][0]["name"]
    assert any(c["section"] == "1.2.5" and "CHF 12'000" in c["text"] for c in body["clauses"])
    assert "user1@example.com" not in response.text and "Demo user 1" not in response.text
