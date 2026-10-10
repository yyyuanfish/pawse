# Validation record

Date: 2026-10-10. Scope: the unified `pawse/` app and its new voice, agent and evidence interfaces. This is not a certification of the imported backend.

## Passed

- Interactive map (2026-10-10): one Google map (Maps JavaScript API, Advanced Markers) shows the owner's live position as a blue dot with an accuracy ring and, per tab, numbered vet, taxi or insurer pins whose numbers match the lists. Checked with a fake `google.maps` in `web/scripts/check-map.mjs` and in the browser pane with a stubbed Zurich-centre position: with a browser key whose project has the Maps JavaScript API but no billing, Google rendered the dot, the label and numbered pins under a `BillingNotEnabledMapError` dialog; the page detects that dialog (and `gm_authFailure`) and falls back to the keyless embed with an explanation. The Places key's project returned `ApiNotActivatedMapError`. A clean interactive render needs a billed project with the Maps JavaScript API and a referrer-restricted `GOOGLE_MAPS_BROWSER_KEY`; that has not been observed yet.

- Google Places clinic search (2026-10-10): with a Places key, real `discover()` calls at Zurich HB and Seefeld (10 km) returned 20 veterinary practices each (Kleintierklinik Oberstrass, Tierspital, VET Zentrum Letzigrund, ...), with straight-line distances (nearest 0.34 to 0.9 km) and provider open/closed state. The earlier Nearby Search by type returned non-vets (homeopaths, a psychologist, a bird charity), so the adapter now uses Text Search with strict type filtering.
- Clinic distance ranking (2026-10-10): one live Gemini Maps grounding probe at Zurich centre confirmed grounding chunks carry only `uri`, `title`, `text` and `placeId`, no coordinates. Mocked tests (`tests/test_maps_grounding.py`) cover: a known nearby clinic ranks above an unknown-distance Maps listing, which is labelled "distance unknown"; a Maps listing matched to an OSM snapshot row by phone takes its distance and is dropped beyond the radius; a chain name shared by several snapshot rows lends no coordinates. Not re-run live with a snapshot present. The React phone screen and the static cards show "distance unknown" instead of "NaN km" or nothing.
- Live location, map, taxis and insurer (2026-10-10): backend tests and all web checks pass with mocked providers. Real requests with a Places key: taxi Text Search returned Zurich taxi services with phone numbers; the insurer lookup found Calingo Insurance AG at Reinhardstrasse 19, Zürich. A second Gemini key returned HTTP 429 for Maps grounding (no quota), so grounding only works with the event-project key. Browser walkthrough at desktop and 390 px width with a stubbed Zurich-centre position (the browser pane denies geolocation): the home screen asks for location on entry and shows a localized retry; the clinic page shows a keyless Google Maps embed of the position, vets, taxis or a chosen clinic (about 10–15 s to paint in the pane), the top 8 clinics with a show-all button, then taxis and the saved insurer. A real phone's geolocation, and reaching the clinic page through a spoken Gemini Live call, were not tested.
- Clinic discovery and owner insurance profile (2026-10-10): 106 backend tests plus web checks pass. The project's Gemini key is blocked for Places API (HTTP 403), but Gemini Grounding with Google Maps (`gemini-3.5-flash-lite`) works with it. One real `POST /api/v1/care/requests` at Zurich's public centre (10 km, `share_with_ai: false`) returned HTTP 201 in 3.2 s with 32 clinics: 9 Google Maps listings (all with phone, address and Maps link; parsed from grounding sources, not model text) and 23 from the local OSM snapshot; 11 snapshot rows lack a phone. Google Maps listings carry no coordinates, so their distance is unknown and two listings likely beyond 10 km could not be filtered. Results vary between calls. Browser check: the static care form rendered the cards with call, map, website and Google Maps attribution; the React home screen saved an owner insurer and plan on the device. Gemini Live asking for the insurer was covered by mocked tool tests only, not a spoken session.

- Crawling slice: 83 automated tests pass, including ten new normalization, source/unknown-state, query bound, malformed-content, provenance, duplicate-ID and mocked HTTP cases. An initial live Zurich Overpass query retained 27 of 29 candidate elements. Final-schema refresh was unavailable; the first exploratory snapshot is retained separately and does not contain the later-added raw `source_elements`. See the [crawling result and limits](controller-crawling-contract.md#7-initial-collection-result). No live API adapter or official-site enrichment is claimed.

- Team integration alignment: 73 tests pass, including a regression first reproduced against the new public quota guard. HTTP 429 now provides the frontend-readable `detail`, no-store/nosniff headers and a session cookie. On a separate local server with public quota set to zero and provider keys blank, the browser care form displayed the specific quota message; all six Mimi clinic-path scenes remained usable through the CHF 385 handoff. The completed walkthrough reported no browser console errors. This did not exercise real providers, own-voice cloning, telephone transport or PR #29's unmerged opt-in suite.

- 68 automated tests with synthetic HTTP responses. Coverage includes warning signs, provider failure/deadlines, consent, image/audio validation, bounded streaming, session ownership, shared care/run cache, safe phone links, clinic normalization/ranking, legacy authorization, the seven-role workflow, exact policy citations, Gradium clone/localize/preview/save/delete contracts and synthetic scenario arithmetic.
- JavaScript syntax checks for both `app.js` and `voice.js`, formatting, HTML identifier binding checks and generated OpenAPI export.
- Gemini Live end to end against the real API (`gemini-3.8-live`): REST-minted single-use token locked to model, prompt and tools; constrained v1alpha session; a text turn triggered `assess_and_find_vets`, `/live/tool-calls` ran the workflow, and Gemini answered in audio with transcripts using the result. Browser capture and playback are now implemented; human microphone testing remains pending. See [Gemini Live](GEMINI_LIVE.md).
- Real API access checks: `gemini-3-flash-preview` text, synthetic PNG and silent WAV; `gemini-3.1-pro-preview` text; `gemini-embedding-001` embeddings. Each returned HTTP 200 with the expected response kind. See [sanitized results](model-access-check.json).
- The later multimodal architecture check used `gemini-3.8-flash` for three synthetic requests: structured text, a tiny PNG and a one-page invoice PDF. All returned HTTP 200 with the expected JSON; PDF ID, currency, total and page matched. See [multimodal results](multimodal-model-access-check.json). This verifies access, not a document-upload feature or model quality.
- Browser walkthrough at the existing narrow in-app viewport: all six Mimi clinic-path scenes; slot review and explicit demo approval gates; CHF 385 clinic / CHF 510 home estimates; taxi script and claim checklist.
- Browser multilingual integration: a fictional Chinese message produced a German script with English subtitles through live Gemini. The translated script preserved the instruction to ask the price without making a booking, and included the AI-assistant disclosure.
- Browser agent integration: a no-consent run visibly skipped external providers; an opt-in synthetic routine-checkup request returned real Gemini guidance and a completed care-agent trace in approximately 4.7 seconds, with clinic search skipped because location consent was off.
- Missing Gradium configuration visibly disables paid voice operations while retaining the recording setup interface. Frontend review fixed replacement-recording races and overlap with voice operations.

Browser timings are isolated observations, not latency guarantees. Model smoke checks establish access, not clinical accuracy or multilingual speech quality. One Starlette/httpx test-client deprecation warning remains; the tests pass.

## Story documentation alignment

The [120-second scenario](DEMO_STORY.md), [four-language delivery requirements](VOICE_CONCIERGE.md#language-and-delivery-requirements) and [frontend palette/layout](controller-frontend-contract.md#8-journey-layout-and-visual-requirements) were aligned on 2026-10-10 with the existing models, scripts and demo arithmetic. This update changes documentation only.

The existing localhost rehearsal was also walked through all six clinic-path scenes at a 1280 × 720 viewport. The 16:30 preference gate, CHF 385 / CHF 510 cards, final approval gate, 16:05 taxi → 16:30 vet summary and claim checklist were visible, with simulation labels retained. No browser console errors were observed. The language menus showed EN/ZH/DE/HI input and subtitle choices; own-voice setup remained visible with paid Gradium operations disabled for missing configuration. No microphone, cloning, provider audio or actual call was exercised in this walkthrough. The new acceptance checklist remains a delivery plan, not a claim that its live-language and calling tests passed.

## Not verified or not connected

- Gradium live cloning, German localization and speaker similarity: unverified, no owner sample has been uploaded. Live German TTS with the standard voice was verified on 2026-10-10 with a real key through `POST /api/v1/voice/speech` (200, 9 s WAV). That test exposed and fixed a bug: Gradium streams WAV with placeholder header sizes, which the app had rejected as incomplete.
- A real iPhone or Mac running Safari: never tested on a device. iOS Safari only starts Web Audio inside the tap that asked for it, so the Live call now creates and resumes its mic and playback audio in the Agree and start and mic taps (`primeAudio` in `web/src/agents/nativeAudio.js`). `tests/e2e/test_browser_webkit_audio.py` checks this in Playwright's WebKit engine on Linux (both contexts created in a tap, running, mic frames reach Live) and failed on the old code. Desktop WebKit is less strict than iOS, so this is engine evidence, not a device test.
- A physical microphone and real speakers. The browser suite (below) uses Chromium's fake capture device and a synthetic signal; it proves the capture, encoding and upload path, not a particular device or room.
- Chinese, English, German and Hindi recognition quality with representative human recordings in the Pawse domain. Synthetic `espeak-ng` speech and a FLEURS read-speech API baseline have been run (below); no demo-phrase or browser-mic recording has been collected.
- Mapify clinic discovery: no Mapify backend URL was supplied, so only that adapter and its normalization are tested. Google Places is verified live (see the Cloud Run entry).
- Telephone transport, audio injection into a mobile call, actual calendar checks, appointment/taxi booking and claim submission are not connected. Mimi's calls and policy decisions are explicitly synthetic.
- Real owner-policy ingestion and vector RAG: the current evidence is the whole demo schedule and adapted terms under `synthetic_demo`, handed to Gemini to cite; there is no search. Legacy book collections and OpenAI/Chroma indexes remain excluded.
- Imported device/report services, live video ingestion and public multi-user deployment have not been validated in this iteration.

`gemini-2.5-flash` appeared in the model listing but returned HTTP 404 for generation in this project. Credentials and recordings are not included in test fixtures or publication artifacts.

## React backend handoff (10 October 2026)

The merged teammate React frontend was integrated on top of `dd99088`. After rebasing onto the teammate’s Gradium whole-call update (#42), the local check passed 86 backend tests plus all six frontend check scripts; production compilation passed. New checks cover handoff consent, four language codes, binary audio/error propagation, backend ranking preservation and service-worker exclusion of private API responses. Real local HTTP checks exercised workflow traces, demo policy citations and missing-provider/voice-profile errors without paid provider calls. Browser verification at `/app/?live=1` covered the consent gate, typed concern, care result, insurer preparation and rendered policy excerpts with source IDs/hashes and `insurance_approval: not_obtained`; console error list was empty.

This is not a claim that PR #29's unmerged browser suite passes. No real microphone recording, EN/ZH/DE/HI speech accuracy benchmark, Gradium cloning or telephone transport was verified. This was the REST baseline; the native Live update below supersedes it. OSM remains an offline staging dataset. See [integration and evaluation boundaries](WEB_AGENT_INTEGRATION.md).

## Native Live and voice enrollment update

The React client now uses Gemini Live native audio by default in live mode. All 86 backend tests and seven frontend checks pass; production compilation passes. New offline tests cover consent, 16 kHz PCM conversion/resampling, all output audio parts, transcription, interruption, tool deduplication/round trip, mute/end cleanup and token errors.

A real browser Live connection produced a greeting transcript. A fictional Mimi text request invoked the care workflow and rendered “Contact a vet today” with backend results; browser console errors were empty. This proves connection and tool integration, not subjective audio quality or human speech recognition. No owner recording was collected. The Gradium key is still missing, so clone/localization/speaker similarity and the final own-voice rehearsal are unverified.

## Gradium credential and live TTS verification

On 10 October 2026, an owner-authorized Studio API key was configured only in the ignored local `.env`. The restarted backend reports Gradium configured. A real standard-German TTS request through `/api/v1/voice/speech` returned HTTP 200 and a 10.96-second, 48 kHz WAV. No telephone call was placed and no owner recording was uploaded.

The initial request exposed Gradium's streaming WAV headers with unknown RIFF/data lengths (`0xffffffff`). The backend now uses the teammate’s merged streaming-WAV normalization after the bounded HTTP response completes, with an additional guard rejecting incomplete PCM frames. Regression tests cover this layout, empty/partial frames, and continued rejection of truncated finite-length audio. Own-voice clone/localization and subjective speaker similarity remain unverified; earlier missing-key notes describe the previous environment.

## Own-voice clone and German preview

A real owner-authorized sample reached Gradium and returned a source ID with a pending-readiness notice. The app previously rejected that successful-but-preparing result. A regression now preserves the ID for that exact notice, while other errors are still rejected. Through the local browser session, cloning then returned 201, German localization produced a candidate, readiness succeeded, and a German own-voice preview appeared as playable audio. Speaker similarity and permanent save still require the owner's listening approval. No real call was made. Neither the recording, voice IDs nor the preview are committed.

The React enrollment now sequences clone → German localization → bounded readiness polling → preview with visible progress, top-of-page errors, a refresh action and a resume action. Recording directly in German skips localization. No cross-provider speed benchmark was performed. Provider voice storage is permanent only after save; current local browser-to-voice associations remain in server memory.

## Browser suite and real-speech checks (#25)

`PAWSE_E2E=1 python -m pytest tests/e2e` ([tests/e2e](../tests/e2e/README.md)) runs 84 Playwright tests in headless Chromium (and one file in WebKit) against the built React app and the original page, with provider keys blanked (10 more, the opt-in real-speech tests, skip): 84 passed in two consecutive runs on 10 October 2026 at commit 98a284f plus the welcome-screen test fixes (PR #75 and its follow-up, #25); tests start as a remembered guest and one test covers the welcome screen itself. A nightly GitHub Actions run (`.github/workflows/e2e-nightly.yml`, not a PR gate) repeats it and keeps one `e2e-red` issue open while it fails. They cover microphone capture through Chromium's fake device (audible 16 kHz PCM to Gemini Live at real-time pace; one audible mono 16 kHz WAV per turn on the REST fallback, accepted by the server validator), mic release after hang-up, drops and recording, denied-microphone messages, the own-voice recorder behind Home's "Demo & voice settings" (local playback, nothing uploaded, under 10 s rejected), the step-by-step rail and handoff, audio upload on the original page (stereo/44.1 kHz/8 kHz in, mono 16-bit out; short, long and non-audio files rejected before upload), the Live client against a fake socket in the real wire format (consent, ephemeral token, transcripts as text, interruption, tool round trip, dialer-only clinic calls, failures), and layout at 1280, 1440, 1920 and 390 px (no sideways scroll, no overlapping controls, WCAG 2.2 target size, centred column).

Real Gemini with synthetic speech (`espeak-ng`, 3 sentences per language, stored off git):

- `/voice/transcriptions` (`gemini-3-flash-preview`): English and German transcribed exactly (WER 0); Hindi WER 0 to 0.2 in Devanagari. Two seconds of silence produced invented text in all four languages ("Hello", "你好，请问有什么可以帮您的吗？", "नमस्ते, आप कैसे हैं?", a German sentence). Several requests ran past the 40-second upstream timeout and returned 502.
- `espeak-ng` Mandarin is not usable input: Gemini heard tone codes ("T1 F5 H4 …"). Chinese needs human recordings.
- FLEURS API baseline (10 October 2026, `/voice/transcriptions`): 20 clips from Google FLEURS (CC-BY-4.0, test split, 5 per language) at `/mnt/pawse-recordings/fleurs`, off git. Mean WER en 0.05 (4/5 under 0.15; en-03 0.17), CER zh 0.03 (5/5), WER de 0.02 (5/5), WER hi 0.10 (4/5; hi-04 returns 502 on every run). This is read Wikipedia speech, not demo phrases or the browser mic.
- Gemini Live in the React call: the browser streamed 3.9 s of audible 16 kHz PCM, but with digital silence afterwards Live returned no transcription. With a faint noise floor it transcribed one word of the English sentence and then "heard" Vietnamese in the noise and answered in Vietnamese. This is inconclusive for human speech, but shows Live can invent input from noise.

Only FLEURS is human speech, and it is read Wikipedia text; accuracy for owners describing their cat still needs consented domain recordings run through the same tests.

## Public demo deployment (10 October 2026)

- Deployed to Cloud Run (https://pawse-114215092948.europe-west6.run.app), one instance, `PAWSE_PUBLIC_DEMO=1`, Gemini and Gradium keys from Secret Manager.
- Verified on the public URL: health reports `public_demo`; the Mimi rehearsal plays all six scenes in Chromium at desktop and 390px width with no horizontal overflow; a live care request ("jumped off the wardrobe and is limping") returned urgency `contact_vet` from Gemini.
- Not verified on the public URL: Gradium voice cloning, Gemini Live voice.
- The React app (`/app/`) loads at desktop and 390px width with no console errors or horizontal overflow; its live flows were not walked on the public URL.
- Google Places on the public URL (https://pawse-ewt2scevfq-oa.a.run.app, verified 2026-10-10): `/api/v1/capabilities` lists `clinic_providers` `["google_places","gemini_maps"]`. `POST /api/v1/clinics/search` for Zurich (47.3769, 8.5417, 3 km) returned 200 in 0.6 s with 9 clinics, all `source=google_places`, all with a phone number and `distance_km`; non-vet places are filtered (PR #70). Gemini Maps grounding remains the fallback and carries no distances.
- Clinic order (backend `rank_clinics`): clinics with a known distance first, whatever their source; within that, provider-reported open first, then unknown hours, then reported closed, nearest first. Clinics without a distance (unmatched Gemini Maps listings) come last, labelled "distance unknown". The web list subtitle says "Open now first, then nearest", since a closed clinic at 0.9 km can sit below an open one at 2.75 km.

## Gemini Live as the /app default (feat/live-default)

Change: the Docker web build sets `VITE_VOICE_AGENT=live`, so `/app` runs the Gemini Live conversation by default (Gradium stays the speech-to-text and voice; clinic search and phone agent are unchanged). `?demo=1` forces the scripted rehearsal. If Live fails before the session connects (token 503/502/429/422 or a socket error), the call switches to the scripted rehearsal and shows "Live voice is unavailable right now, so this is the simulated rehearsal." Failures after connecting keep the existing error-and-end behaviour.

Verified by tests, no live Gemini traffic:
- `web/scripts/check-live-fallback.mjs` (part of `npm run check`): fallback on 503, 429, 502, 422 and a connect error; no fallback after a successful connect or a later socket error; the Live agent is unchanged without the callback.
- `tests/e2e/test_browser_live_voice.py::test_token_failure_is_explained`: with the token route returning 503 the browser shows the notice and the rehearsal starts.
- `tests/test_live.py`: the token response never contains the `GEMINI_API_KEY` value.

NOT yet verified: a real human speaking into the microphone in real Chrome against the deployed build with live keys (Gradium STT and voice, tool chip for "my cat is limping"). Needs a person at a browser; do not treat the Live default as field-verified until that is done.

### Structured cat-photo observations — 2026-10-10

Added `/api/v1/vision/observations` and the home-screen **Check a cat photo** view.
Mocked regression checks cover consent, malformed images, abstention, preserved reported emergency
signs and redacted provider failures. A live Gemini 3.8 Flash request through this endpoint returned
HTTP 200 for a synthetic blank image, correctly reporting no cat and unassessable features.
Real cat-photo accuracy and mobile camera capture have not been validated. Desktop UI exposes
upload, camera-capable file selection, explicit photo sharing, and structured results.

### Wound observation extension — 2026-10-10

An owner-supplied example image was tested through the real Gemini 3.8 Flash endpoint.
The final HTTP 200 response reported suspected wound and blood-like material near the eye/ear,
with exposed pink skin and dark crusting, and routed to `contact_vet`. Active bleeding remains
server-fixed as indeterminable from a still. Earlier attempts exposed a missing injury field and
noncanonical limitation text; injury is now required and the limitation is enforced server-side.
This is one example, not a sensitivity/specificity evaluation. The image and raw response stay
outside Git. Mobile native-camera launch is requested via capture=environment but has not been
verified on physical iOS/Android hardware.

### Inline injury care handoff — 2026-10-10

The conversation now connects suspected injury results to device-location clinic search, clinic
selection, reviewed German scripts and playback/download using the saved German own voice.
Mocked integration checks cover the request chain, consent gates, unknown hours, location required,
saved-voice selection and missing-provider errors. The frontend production build passes.

The local Google Places key is now configured. A real search at an explicitly labelled Zurich-centre
test coordinate returned 20 provider-listed results. Primary veterinary-care filtering is enforced;
provider categorisation does not verify that a practice treats cats or has an appointment. The browser
returned location unavailable, so the owner-location end-to-end path is not verified. Physical phone
location and camera permissions still require device testing. Calls and bookings remain unconnected.

A bounded live rehearsal subsequently searched Google Places at that Zurich test coordinate,
selected a returned small-animal practice, generated four German script lines with Gemini and
received 1,989,164 bytes of WAV audio from Gradium using `voice=my_voice`. The audio stays in ignored
`tmp/`. This validates the provider chain independently of the unavailable device location; it did
not telephone a clinic. Browser inspection with the owner-supplied injury photo confirmed that the
care card and location retry remain in the same conversation.

### Experimental facial cues — 2026-10-10

The upload/camera observation response now includes five facial cue estimates and a deterministic,
explicitly experimental total when all assessment conditions are met. Automated tests cover
missing features, non-cats, low-quality photos, unsuitable activity, printed answer overlays,
out-of-range model values, threshold handling, and emergency priority. These are software contract
tests, not sensitivity/specificity measurements. No guaranteed pain recognition, clinical severity
classification, automatic diagnosis, or medication advice is provided.

The supplied three screenshots contain printed FGS answers. They are exploratory API fixtures,
not a blinded accuracy test; the server suppresses scores when such overlays are detected.
Images are not committed or used as a training dataset. A blinded, independently vet-labelled
set and physical-phone camera tests are still required before any reliability claim.

Live Gemini checks on all three supplied screenshots returned HTTP 200 with cat detection and
individual visual descriptions (including narrowed eyes and outward/flattened ears). Each overlay
was detected and its numerical total suppressed. These observations do not demonstrate accuracy
on unlabelled photos. The original images and raw responses remain outside Git.

Verification for this change: 115 backend tests passed, frontend contract checks and production
build passed (existing bundle-size warning). Browser smoke check confirmed the built app,
simulated conversation and Upload photo / Take photo menu load without console errors.
The new result card has not yet been exercised end-to-end on a physical phone.

### Local main + vision integration — 2026-10-10

Integrated main at `98a284f` with vision branch at `41a389d` in an isolated worktree.
Preserved the main branch's Places Text Search guard, standalone clinic-search endpoint,
account/history UI, iOS audio-unlock path and default Live mode, alongside photo observations
and experimental facial cues. Injury-handoff checks now exercise `/clinics/search` without
sending symptoms. The main Live flow retains an explicitly labelled central-Zurich fallback;
inline injury search still requires device location.

Validation: 203 tests passed, 8 skipped; frontend checks, generated OpenAPI and production
build passed. Browser smoke check covered guest entry, home at 390 px and Live consent screen.
This is not physical iPhone/Android camera or microphone verification. LAN HTTP can test the
file-input capture/upload path; real-time camera, mic and location require a secure origin.
### Separate camera and upload actions — 2026-10-10

Reproduction: the former Take photo button triggered a capture-hinted file input, which could open
an ordinary picker on desktop. It now requests a local getUserMedia preview. Browser rehearsal
confirmed camera readiness, Capture photo, and the unsent-photo review with Send/Retake/Cancel;
the captured image was cancelled without provider submission. Upload photo separately produced
a filechooser event. Capture closes the preview and media tracks; camera layout does not collapse
when conversation content grows. Physical mobile hardware remains untested.
