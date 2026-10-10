"""The fictional demo policy as citable evidence, never live coverage.

Only the two reviewed repository documents below are loaded. The corpus is small (about 12 KB),
so there is no search: every caller gets the whole policy as numbered sections, and Gemini, which
reads any language, picks and cites the clauses by evidence_id. A reasoning agent may cite this
evidence but must retain scope: it is a demo policy and never an insurer approval.
"""

import hashlib
import json
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import Field

from .models import Model


ROOT = Path(__file__).resolve().parent.parent
POLICY_PATH = "research/pet-insurance/policy/policy.json"
AVB_PATH = "research/pet-insurance/avb/avb-en.md"
DISCLAIMER = (
    "Demo policy schedule and an English adaptation of real Swiss terms only. These excerpts do not "
    "establish an owner's real insurance coverage or constitute insurer approval."
)
router = APIRouter(prefix="/api/v1/knowledge", tags=["Knowledge evidence"])


class Evidence(Model):
    evidence_id: str
    source_id: Literal["pawse-demo-policy", "pawse-demo-avb"]
    source_path: str
    source_sha256: str
    section: str
    title: str
    snippet: str = Field(max_length=4000)
    synthetic: Literal[True] = True


class KnowledgeResult(Model):
    scope: Literal["synthetic_demo"] = "synthetic_demo"
    synthetic: Literal[True] = True
    method: Literal["full_policy"] = "full_policy"
    insurance_approval: Literal["not_obtained"] = "not_obtained"
    corpus_version: str
    status: Literal["evidence_found"] = "evidence_found"
    evidence: list[Evidence] = Field(min_length=1, max_length=64)
    disclaimer: str = DISCLAIMER


@dataclass(frozen=True)
class Chunk:
    source_id: str
    path: str
    digest: str
    section: str
    title: str
    snippet: str


@lru_cache(maxsize=1)
def corpus() -> tuple[tuple[Chunk, ...], str]:
    """Load a fixed allowlist; no request can select a file or a collection."""
    raw_policy = (ROOT / POLICY_PATH).read_bytes()
    raw_avb = (ROOT / AVB_PATH).read_bytes()
    policy = json.loads(raw_policy)
    # Refuse to silently treat replacement owner data as the demo corpus.
    if policy.get("policy_number") != "PAWSE-DEMO-2026-000001" or "FICTIONAL" not in policy.get("_comment", ""):
        raise ValueError("The configured corpus is not the synthetic demo policy")
    avb = raw_avb.decode("utf-8")
    if "FICTIONAL demo terms" not in avb:
        raise ValueError("The configured corpus is not the synthetic demo terms")
    policy_digest = hashlib.sha256(raw_policy).hexdigest()
    avb_digest = hashlib.sha256(raw_avb).hexdigest()
    chunks = []
    selected = {key: policy[key] for key in ("term", "cost_sharing", "claims_process")}
    selected.update({f"coverages/{key}": value for key, value in policy["coverages"].items()})
    for section, value in selected.items():
        # JSON snippets preserve exact key/value evidence and avoid owner details.
        chunks.append(Chunk(
            "pawse-demo-policy", POLICY_PATH, policy_digest, "/" + section,
            "Demo policy: " + section.replace("/", " / ").replace("_", " "),
            json.dumps(value, ensure_ascii=False, indent=2),
        ))
    headings = list(re.finditer(r"^#{2,4} (\d+(?:\.\d+)*) (.+)$", avb, re.MULTILINE))
    for i, heading in enumerate(headings):
        end = headings[i + 1].start() if i + 1 < len(headings) else len(avb)
        snippet = avb[heading.end():end].strip()
        if snippet:
            if len(snippet) > 4000:
                raise ValueError("A demo clause exceeds the reviewed chunk size")
            chunks.append(Chunk(
                "pawse-demo-avb", AVB_PATH, avb_digest, heading[1],
                heading[2], snippet,
            ))
    version = hashlib.sha256(raw_policy + b"\0" + raw_avb).hexdigest()[:16]
    return tuple(chunks), version


def policy_evidence() -> KnowledgeResult:
    """Every section of the demo policy, in corpus order, each with exact provenance."""
    chunks, version = corpus()
    return KnowledgeResult(corpus_version=version, evidence=[Evidence(
        evidence_id=f"{chunk.source_id}:{chunk.section}",
        source_id=chunk.source_id,
        source_path=chunk.path,
        source_sha256=chunk.digest,
        section=chunk.section,
        title=chunk.title,
        snippet=chunk.snippet,
    ) for chunk in chunks])


class Coverage(Model):
    key: str
    label: str
    selected: bool
    details: dict[str, str | int | float | bool | list[str]]


class InsuredCat(Model):
    name: str
    breed: str
    age_years_at_start: int
    declared_lifestyle: str
    known_conditions_at_start: list[str]


class Clause(Model):
    section: str
    title: str
    text: str


class PolicyView(Model):
    """The demo policy schedule and its terms, without policyholder contact details."""
    scope: Literal["synthetic_demo"] = "synthetic_demo"
    synthetic: Literal[True] = True
    policy_number: str
    insurer: str
    avb_edition: str
    avb_modeled_on: str
    term: dict[str, str | int]
    cost_sharing: dict[str, str | int | float | list[str]]
    coverages: list[Coverage]
    insured_animals: list[InsuredCat]
    claims_process: dict[str, str | int | list[str]]
    clauses: list[Clause]
    source_paths: list[str] = [POLICY_PATH, AVB_PATH]
    corpus_version: str
    disclaimer: str = DISCLAIMER


def policy_view() -> PolicyView:
    chunks, version = corpus()
    policy = json.loads((ROOT / POLICY_PATH).read_bytes())
    return PolicyView(
        policy_number=policy["policy_number"],
        insurer=policy["insurer"],
        avb_edition=policy["avb"]["edition"],
        avb_modeled_on=policy["avb"]["modeled_on"],
        term=policy["term"],
        cost_sharing=policy["cost_sharing"],
        coverages=[Coverage(
            key=key, label=key.replace("_", " ").capitalize(), selected=value["selected"],
            details={k: v for k, v in value.items() if k != "selected"},
        ) for key, value in policy["coverages"].items()],
        insured_animals=[InsuredCat(**{k: cat[k] for k in InsuredCat.model_fields}) for cat in policy["insured_animals"]],
        claims_process=policy["claims_process"],
        clauses=[Clause(section=c.section, title=c.title, text=c.snippet) for c in chunks if c.source_id == "pawse-demo-avb"],
        corpus_version=version,
    )


@router.get("/policy", response_model=PolicyView)
def policy() -> PolicyView:
    try:
        return policy_view()
    except (OSError, ValueError, KeyError) as exc:
        raise HTTPException(503, "The synthetic demo policy is unavailable") from exc


@router.get("/evidence", response_model=KnowledgeResult)
def evidence() -> KnowledgeResult:
    try:
        return policy_evidence()
    except (OSError, ValueError, KeyError) as exc:
        raise HTTPException(503, "The synthetic evidence corpus is unavailable") from exc
