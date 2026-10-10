# Pawse 🐾

> Your cat is limping, it's 9 pm, and every vet in Zürich answers in German. Just talk to Pawse in your own language. A team of AI agents, driven by a real-time **Gemini Live** conversation with tool calling, triages the symptoms, finds and ranks nearby vets, checks what your insurance covers, books a slot that fits your calendar, and calls the clinic in fluent German, in **your own cloned voice** with **Gradium**. From worried owner to booked appointment in one conversation.

**[Website](https://pawse-delta.vercel.app/)** · [Vercel App](https://pawse-delta.vercel.app/app/?live=1) · **[Live Demo](https://pawse-114215092948.europe-west6.run.app/app/)** · [Mimi rehearsal](https://pawse-114215092948.europe-west6.run.app/?demo=1) · [Local Demo](http://127.0.0.1:8765) · [Engineering Docs](docs/README.md) · [API Docs](docs/API_CONTRACT.md) · [Architecture](docs/ARCHITECTURE.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Stage: Hackathon prototype](https://img.shields.io/badge/Stage-Hackathon_prototype-orange.svg)](docs/SPEC.md)
[![Built for: Tech Europe](https://img.shields.io/badge/Built_for-Tech_Europe_AI_Hackathon-purple.svg)](docs/HACKATHON.md)

---

## Overview

Pawse brings cat-care guidance, veterinary discovery, insurance information and multilingual communication into one app.

An owner can describe a concern in their own language, attach a photo, and prepare the details a veterinarian needs. The system retrieves nearby practices, explains available next steps, and drafts a German call script with subtitles. Gradium integration supports generating that script in an owner-consented voice.

The initial experience is centred on Zurich, Switzerland. Pawse is built specifically for the **Tech Europe AI Hackathon, sponsored by Google DeepMind**, as described by the project team. It is an independent participant project. The imported CatAgent backend predates the hackathon; the unified interface and new integrations are documented in the [source import review](docs/IMPORT_REVIEW.md).

---

## System

Pawse uses a bounded care workflow, with a multimodal design that separates voice, visual observations and document evidence:

**User Input → Intake & Safety → Care Guidance + Clinic Retrieval → Ranking → Case Coordination → Reviewed Script & Audio**

Care guidance and clinic retrieval run concurrently. The coordinator combines available results, preserves missing information, and reports each agent's execution state. Policy evidence is available through a separate retrieval interface, currently limited to a demo policy schedule and an English adaptation of real Swiss terms.

The next iteration assigns **Gemini 3.8 Live** to voice dialogue and tool routing, **Gemini 3.8 Flash** to photo/document understanding and grounded text, and **Gradium** to owner-consented German speech. Document extraction will feed a separate Policy Evidence Agent with page-linked sources. Uploads, private-document retrieval and video intake remain planned; the existing text routes retain their current model default. See the [multimodal design](docs/MULTIMODAL_ARCHITECTURE.md) and [model access checks](docs/MODEL_ALLOCATION.md).

Ranking, cost calculations and execution control use deterministic tools. The coordinator does not require another planner-model call, and provider failures can return useful partial results.

---

## Key Capabilities

- Gemini Live (`gemini-3.8-live`) session and server-run tool backend: care guidance, nearby vets, cited policy evidence, German scripts and a confirm-before-dialing gate. The browser client is done: `/app` uses Gemini Live (reasoning and tool calls) by default, with Gradium for speech-to-text and voice, and falls back to the simulated rehearsal with an on-screen notice if Live cannot start. See [Gemini Live](docs/GEMINI_LIVE.md).
- Text, photo and recorded-audio intake, with English, Mandarin Chinese, German and Hindi input options.
- Structured care guidance, warning-sign handling and questions to prepare for the vet.
- Nearby veterinary search through configurable clinic-data providers.
- Explainable clinic ranking using reported opening status, distance and rating.
- Policy-clause retrieval with source references and document hashes, scoped to the demo schedule and adapted terms.
- German scripts with paired subtitles, own-voice recording, and Gradium cloning/localization adapters.
- Agent execution traces, care-request SSE progress and partial-result handling.
- A bridge to existing CatAgent chat and analysis capabilities, subject to their runtime dependencies.
- **Gradium voice in the live conversation:** Gradium streaming STT hears the owner and Gradium speaks Pawse's replies (voice picker on the call screen; Emma/Annika by default, Gemini's native voice optional). The browser streams to Gradium with one-use server-minted tokens.
- **Real phone calls (Twilio):** "Pawse calls now" rings the demo line, Pawse discloses it is an AI, speaks with Gradium, hears the callee with Twilio speech recognition and lets Gemini drive the conversation to a booked slot, with a live transcript in the app.
- **Add to calendar:** a slot booked on a call becomes a prefilled Google Calendar event or an `.ics` file (Zurich time, 1-hour reminder).
- **Photo injury check:** take or upload a cat photo during the call; Gemini reports visible wounds or blood-like material (never a diagnosis) and a suspected wound leads straight to "Find a vet now".
- **Accounts and history:** sign in, create an account or continue as a guest on first open; assessments and calls (outcome, slot, transcript) are saved in SQLite and follow the account across devices.

---

## Demo

Open the [voice-first app](https://pawse-114215092948.europe-west6.run.app/app/) or the [Mimi rehearsal](https://pawse-114215092948.europe-west6.run.app/?demo=1) (or run the app locally) to try **Mimi's two-minute story**:

The [complete 120-second scenario](docs/DEMO_STORY.md) includes the timeline, model/agent handoffs, cost assumptions and acceptance checks. The target experience accepts English, Mandarin Chinese, German or Hindi and prepares German dialogue with selectable subtitles and Gradium own-voice audio; see the [language and delivery requirements](docs/VOICE_CONCIERGE.md#language-and-delivery-requirements).

1. Mimi is limping after jumping from a wardrobe.
2. Pawse prepares a German vet conversation with English subtitles.
3. The insurer explains the deductible and the services the policy does not cover.
4. The owner compares a clinic visit at an estimated **CHF 385** with a home visit at **CHF 510**.
5. The rehearsal ends with a taxi request and a case/claim checklist.

| Voice-first app | Start | German vet call | Insurance | Case summary |
| --- | --- | --- | --- | --- |
| ![Pawse voice-first app](docs/images/screenshot-app.png) | ![Pawse start screen](docs/images/screenshot-home.png) | ![German vet call with subtitles](docs/images/screenshot-vet-call.png) | ![Cited insurance clauses and cost comparison](docs/images/screenshot-insurance.png) | ![Taxi, plan and claim checklist](docs/images/screenshot-together.png) |

The public demo has an hourly usage limit on live Gemini and Gradium features; the rehearsal is unlimited. Calls, replies and bookings in the story are simulated.

Calls, replies, calendar slots, coverage and prices in this story are simulated. The estimates use a [demo policy](research/pet-insurance/README.md) on real Swiss pet-insurance terms (AVB, December 2025); the policyholder and schedule are synthetic. The live interface currently accepts photos and recorded audio; the story's video intake is not connected.

---

## Architecture

The system consists of:

- A responsive web interface with Pawse's pink and gray styling.
- A FastAPI backend with bounded asynchronous agent coordination.
- A Gemini Live session: the backend mints locked ephemeral tokens and runs the tools Gemini calls.
- Gemini adapters for care guidance, audio understanding and translation.
- Gradium adapters for voice cloning, German localization and speech generation.
- Clinic-provider adapters and a local, citation-bearing policy retrieval module.

The diagram shows the **target multimodal architecture**. Each card labels its current integration status; model access does not mean the complete feature is implemented.

![Pawse multimodal design: Voice, Vision and Document agents feed orchestration, care, clinic discovery and cited policy evidence; reviewed scripts and Gradium own-voice audio complete the handoff.](docs/images/pawse-multi-agent-architecture.png)

[View full-size diagram](docs/images/pawse-multi-agent-architecture.png) · [Editable SVG](docs/images/pawse-multi-agent-architecture.svg) · [Diagram legend](docs/images/README.md)

See [Multimodal Design](docs/MULTIMODAL_ARCHITECTURE.md) for the new agent handoffs, [Architecture](docs/ARCHITECTURE.md) for current execution boundaries, [Agent Development](docs/AGENT_DEVELOPMENT.md) for module contracts and feature branches, and [Model Allocation](docs/MODEL_ALLOCATION.md) for project-specific access checks.

Start with the [Multimodal Controller & Contract Map](docs/MULTIMODAL_CONTRACTS.md) to connect each diagram role to its interface and module. Contracts cover [Live](docs/controller-live-contract.md), [Vision](docs/controller-vision-contract.md), [Documents](docs/controller-document-contract.md), [Case Handoffs](docs/controller-case-contract.md) and [Communication & Actions](docs/controller-action-contract.md), alongside the existing care, voice and evidence APIs. Each document labels current behavior and proposed work; the [docs index](docs/README.md) lists all frontend and backend agreements.

---

## Quick Start

Python **3.11+**:

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# Create local configuration if it does not already exist.
cp -n .env.example .env
# Fill in the relevant server-side settings, then start the app.
uvicorn pawse.app:app --host 127.0.0.1 --port 8765
```

App: [localhost:8765](http://127.0.0.1:8765) · Swagger UI: [localhost:8765/docs](http://127.0.0.1:8765/docs)

### Docker (backend + React app)

```sh
cp -n .env.example .env   # fill in keys; they are read at runtime, never baked into an image
bash scripts/dev.sh       # frees ports 8765 and 5173, then runs docker compose up --build
```

React app: [localhost:5173/app/](http://localhost:5173/app/) (live; the scripted rehearsal is at `/app/?demo=1`) · API: [localhost:8765/docs](http://127.0.0.1:8765/docs). Backend and frontend code reload on save; run the script again after changing `requirements.txt` or `web/package-lock.json`. `scripts/dev.sh` stops whatever holds those ports first (an old Pawse stack, another container, a stray `uvicorn`); to keep something running, pick other ports: `WEB_PORT=5174 PAWSE_PORT=8766 bash scripts/dev.sh`. Stop with Ctrl+C, then `docker compose down`.

| Setting | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Care guidance, transcription, translation and Gemini Live tokens |
| `GEMINI_LIVE_MODEL` | Live voice model, default `gemini-3.8-live` |
| `GEMINI_MODEL` | Default model: `gemini-3-flash-preview`; optional care/voice overrides are documented in `.env.example` |
| `GRADIUM_API_KEY` | Voice cloning, localization and German audio |
| `GRADIUM_VOICE_ID_DE` | Optional approved German voice to reuse across restarts |
| `GOOGLE_PLACES_API_KEY` | Optional Google Places for clinics, nearby taxis and the owner's insurer office (Places API (New): Nearby and Text Search). Without it, `GEMINI_API_KEY` uses Gemini's Google Maps grounding, with an optional offline OpenStreetMap snapshot for clinics; see `.env.example`. The map view is a keyless Google Maps embed, so no key reaches the browser |
| `LEGACY_AGENT_BASE_URL`, `LEGACY_AGENT_USER_ID`, `LEGACY_AGENT_CAT_IDS` | Optional connection to the existing CatAgent backend |

The story rehearsal and local demo-policy evidence work without provider keys. See the [voice guide](docs/VOICE_CONCIERGE.md), [clinic data contract](docs/controller-knowledge-contract.md) and [API contract](docs/API_CONTRACT.md) for integration details.

Run the automated checks with `pip install -r requirements-dev.txt` followed by `pytest -q tests`. Tests use mocked providers; live model access checks are a separate opt-in script. See the [validation record](docs/VALIDATION.md).

### Phone calls (Twilio, optional)

Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` and `DEMO_PHONE_NUMBER` (a number verified on the Twilio account) in `.env`, expose the backend and point `PUBLIC_URL` at it, then restart:

```sh
cloudflared tunnel --url http://localhost:8765   # prints https://<name>.trycloudflare.com
# PUBLIC_URL=https://<name>.trycloudflare.com in .env, then: bash scripts/dev.sh
```

The vet/insurer page then shows **Pawse calls now**. Trial accounts allow neither Media Streams nor most call parameters, so calls run turn by turn on TwiML webhooks (`<Play>` Gradium audio, `<Gather>` speech); every call rings `DEMO_PHONE_NUMBER`, whatever clinic is chosen. Calls are capped at 5 minutes, one per session, and phone numbers are never logged or sent to the browser.

### Accounts and data

Accounts (scrypt-hashed passwords), sessions and history live in SQLite at `PAWSE_DB_PATH` (default `.pawse-private/pawse.db`, mounted into Docker). The Cloud Run demo is one always-on instance, so data lasts until the next deploy; a managed database only needs changes in `pawse/store.py`.

### Public demo (Cloud Run)

**Deploy latest `main`:** every push to `main` runs the `deploy` GitHub Action (Actions tab → *deploy* → *Run workflow* deploys on demand). It needs a one-time setup by the GCP project owner: repository variable `GCP_PROJECT_ID` and secret `GCP_SA_KEY` (a service-account JSON key with Cloud Run Admin, Cloud Build Editor, Artifact Registry Writer, Storage Admin and Service Account User). Without them the workflow skips with a warning. It keeps the service's existing secrets; use the script below for the first deploy or to change keys.

The `Dockerfile` builds the React app in `web/` and runs it with the API as one container. `scripts/deploy_cloudrun.sh <gcp-project>` deploys it to Cloud Run with one instance (the case cache is in memory), provider keys from Secret Manager and these public-demo settings. Each deploy syncs the keys set in `.env` (`GEMINI_API_KEY`, `GRADIUM_API_KEY`, `GOOGLE_PLACES_API_KEY`) to the secrets `pawse-gemini-key`, `pawse-gradium-key` and `pawse-places-key`, adding a version only when a value changed, and mounts them; a key missing from `.env` keeps the deployed secret. Add a new provider key to `KEYS` in the script:

| Setting | Purpose |
| --- | --- |
| `PAWSE_PUBLIC_DEMO=1` | Hourly quota on endpoints that spend Gemini, Gradium or Places credit; the Mimi rehearsal stays unlimited |
| `PAWSE_SESSION_CALLS_PER_HOUR`, `PAWSE_TOTAL_CALLS_PER_HOUR` | Quota per browser session (default 60) and per instance (default 600) |
| `PAWSE_ALLOWED_HOSTS` | Public hostnames added to the local host allowlist; the deploy script sets it |

---

## Limitations

This is a local hackathon prototype:

- The Gemini Live backend (tokens and tools) is verified against the real API; the browser client (`/app`, Gemini Live with Gradium speech) is built and covered by fake-socket browser tests. A human-microphone check in real Chrome is still pending (see [VALIDATION](docs/VALIDATION.md)).
- Live clinic results require a configured provider. Unknown opening hours, services and insurance coverage remain unknown.
- Gradium adapters are contract-tested; real cloning and voice quality still need a configured key and an owner sample. Chinese and Hindi input use Gemini; Gradium output in this app is German.
- Phone calls work on a Twilio trial and therefore only ring the verified demo line, turn by turn; taxi bookings, claim submission and calendar sync (beyond add-to-calendar links) are not connected.
- Policy evidence is the whole demo policy and an English adaptation of its terms, handed to Gemini to cite (no search). Real-policy ingestion is future work.
- Legacy device, report and knowledge services require their own configuration. Accounts are basic (no password reset or email verification) and the deployed SQLite file resets on redeploy.

Pawse provides care navigation, not a diagnosis or a guarantee of treatment, coverage or response time. AI, location and voice sharing are separate opt-ins. Photos and recordings are not written to disk; care summaries expire from the local cache after 15 minutes. Gradium-created voices remain in the provider account until deleted. See [voice lifecycle details](docs/VOICE_CONCIERGE.md).

---

## Future Work

- Bidirectional phone conversations with recipient transcripts and owner-approved actions.
- Calendar integration and confirmed appointment workflows.
- Private policy ingestion, cited answers and evaluated Gemini embedding retrieval.
- Verified Zurich clinic data and broader multilingual speech evaluation.
- Authenticated integration of existing CatAgent device and reporting services.

---

## Contributors

See [Contributing](CONTRIBUTING.md) for contribution guidance and [Agent Development](docs/AGENT_DEVELOPMENT.md) for module boundaries, development branches and integration checks.

**AI session checkpoints.** We build with coding agents (Claude Code, Gemini CLI, Cursor). The [Entire](https://entire.io) CLI captures each agent session as a checkpoint linked to the commit it produced: commits carry an `Entire-Checkpoint:` trailer and the checkpoints live under `refs/entire/checkpoints/` on this repo, so the reasoning behind a change sits next to the code. Setup: `curl -fsSL https://entire.io/install.sh | sh`, then `entire enable` in the repo (config in `.entire/settings.json`).

---

## License

[MIT](LICENSE). Built for the Tech Europe AI Hackathon. Third-party services, dependencies and excluded source materials are covered separately in [Third-party Notices](THIRD_PARTY_NOTICES.md).
