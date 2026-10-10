# RAG evidence contract

For controller ownership, endpoint integration and the separate clinic-data boundary, see the [knowledge controller contract](controller-knowledge-contract.md). This document defines evidence semantics and retrieval acceptance cases.

The evidence module is implemented in `pawse/knowledge.py`. It loads the existing **fictional demo insurance corpus** locally and returns all of it, with citations, making no model or network calls. There is no ranking: the corpus is about 30 sections (12 KB), small enough to hand to Gemini whole, and Gemini reads the question in any language and picks the clauses. An earlier English lexical search returned nothing for German, Chinese or Hindi questions and was removed.

## Request

`GET /api/v1/knowledge/evidence` (no parameters). Inside Python, call `policy_evidence()`.

## Response

The response contains `scope`, `synthetic: true`, `method: "full_policy"`, `insurance_approval: "not_obtained"`, `corpus_version`, `status: "evidence_found"`, `evidence` (every section) and a demo disclaimer. No response is a binding insurance decision.

Each evidence item has:

| Field | Meaning |
| --- | --- |
| `evidence_id` | Stable source ID plus section, such as `pawse-demo-avb:1.2.5` |
| `source_id` | `pawse-demo-policy` or `pawse-demo-avb` |
| `source_path` | Repository-relative path from a fixed allowlist |
| `source_sha256` | Full content hash of that source file |
| `section` | AVB heading number or JSON pointer such as `/cost_sharing` |
| `title` | Source heading or policy section label |
| `snippet` | Exact Markdown section text or serialized JSON section, at most 4,000 characters |
| `synthetic` | Always `true` |

The corpus version is a short hash of both documents. Restart the process after changing reviewed documents, because the corpus is cached in process. Missing or invalid demo documents return a safe `503`.

## Orchestrator handoff

The Gemini Live `search_policy` tool calls `policy_evidence()` and returns every section (`evidence_id`, `section`, `title`, full `text`) under a data-only `content_notice`. The Live system prompt and tool description tell the model to answer only from these sections and cite the `evidence_id` of each one it uses. The tool response is about 16 KB of JSON (roughly 4 to 5k tokens) per call; `tests/test_live.py` keeps it under 32 KB.

The reasoning agent receives evidence as data. It must preserve the source IDs and the synthetic scope in its answer, attach the relevant section to each claim, and leave actual owner coverage unconfirmed. Terms text is not an instruction to perform actions. Retrieval does not approve treatment, submit claims, reserve appointments, or call anyone. `evidence_found` means the policy was supplied, not that it answers the question.

Keep arithmetic in deterministic code using the policy schedule and remaining deductible/limits. For the Mimi demo, the schedule and AVB must both be consulted: a general clause about complementary treatment does not imply that the optional coverage was selected.

## Acceptance cases and next owner tasks

`tests/test_knowledge.py` checks exact clause provenance, policy JSON values, that every section is returned with a unique ID, scope isolation and safe source failures. `tests/test_live.py` checks that German and Chinese questions through the Live tool get the house-call clause and that every returned ID resolves to a corpus section. Run:

```bash
.venv/bin/python -m pytest -q tests/test_knowledge.py
```

The evidence module includes this contract and the reviewed corpus. Next, add a user-owned policy ingestion flow with tenant isolation, document consent, edition/date metadata, deletion, and citations to the uploaded page or section. That corpus must use a separate authenticated scope; never replace the synthetic files with private owner documents. A larger private corpus may need retrieval again; evaluate it, multilingual questions included, before adding embeddings. An embedding change requires re-indexing the corpus and recording the model and vector dimensions; the imported legacy Chroma collections cannot be assumed compatible.

The project's live access check returned HTTP 200 for `gemini-embedding-001` through `embedContent`; see [model access results](model-access-check.json). This makes a Gemini embedding prototype feasible with the current credentials. It is not wired into this endpoint, and one successful request does not validate retrieval quality or future quota. Rebuild both document and query vectors with the same selected model rather than mixing them with legacy OpenAI vectors.

See [data sources](DATA_SOURCES.md) for the distinction between open geographic data, licensed API data, and private insurance documents.
