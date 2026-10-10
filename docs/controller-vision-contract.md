# Pet observation controller

`POST /api/v1/vision/observations` accepts `VisionRequest` and returns `VisionResult`.
See generated [OpenAPI](openapi.json) and [TypeScript](../schemas/pawse.ts).

Request: `photo: {mime_type, data}` (base64 JPEG/PNG/WebP, max 3 MB),
`share_with_ai: true`, optional `red_flags` using the existing care warning-sign enum.
Consent is required server-side. Photos are forwarded inline to Gemini, not saved locally.
`GEMINI_VISION_MODEL` defaults to `gemini-3-flash-preview` with low thinking, matching the current main integration. Override it with a model available to your project.

Response: nullable `cat_detected`, `face_assessable`, `image_quality`, five named
`visible_observations`, `limitations`, `questions_for_owner`, `model`, `urgency`, `disclaimer`.
Unusable/non-cat images force all features to `not_visible`. Owner-reported red flags force
`urgency: emergency`; otherwise urgency remains `unknown`, never a photographic all-clear.
This endpoint does not establish identity, diagnose, calculate pain scores or place calls.

Errors: 422 invalid photo/consent; 503 missing key; 502 upstream/invalid model output;
429 shared voice/vision operation limit or public quota. Errors do not echo photographs or keys.

## Try it

1. Open `/app/?live=1`, start the Pawse conversation and confirm Gemini sharing.
2. Click the camera icon in the conversation input bar, then **Upload photo** or **Take photo**. With camera preview on, **Capture and analyze** submits the current frame.
3. The selected photo is analyzed under the conversation’s explicit Gemini-sharing consent.
4. Review **Photo observations** in the conversation. The LLM receives these observations as untrusted evidence and explains them in the conversation language.
5. Try a non-cat or blurred image: the app should abstain rather than invent features.

Structured observations are now handed to the existing conversation agent. They do not change the care tool schema or automatically trigger a clinic search. No real-cat clinical validation is claimed.

## Future case-bound design (not implemented)

## 2. Proposed observation controller

Proposed prefix: `/api/v1/cases/{case_id}/vision`. The orchestration module owns validated observations; media input must use the same case ownership and revision rules as [Case handoffs](controller-case-contract.md).

| Proposed route | Input | Success |
| --- | --- | --- |
| `POST /observations` | Multipart `file` and JSON `metadata`, case `If-Match` | 202 `VisionResult` with `status: queued` |
| `GET /observations/{observation_id}` | Same-owner case | 200 queued/running/complete/partial/failed/cancelled result |
| `DELETE /observations/{observation_id}` | Resource `If-Match` | 202 cancellation/deletion state; prevent late-result merge |
| `GET /observations/{observation_id}/deletion` | Same-owner case | 200 `pending`, `complete` or `retry_required` cleanup state |

Proposed metadata:

```json
{
  "media_kind": "photo",
  "owner_description": "Mimi seems to avoid putting weight on her left front paw.",
  "language": "en",
  "share_with_gemini": true
}
```

Metadata cannot supply the owner, source hash, case revision or a model diagnosis. The case ETag selects the input revision; the backend records `based_on_revision`. Language accepts `en`, `zh`, `de`, `hi`; preserve the original description. A later owner correction requires a new version/result.

Start with one JPEG/PNG/WebP photo per request, at most 3 MB decoded, and implement full decode, dimension bounds and metadata removal before this new route is exposed. For a subsequent video milestone, propose MP4/WebM, at most ten seconds and 3 MB, with server-validated duration and MIME. Sample at most ten timestamped frames, with bounded decoder resources; explicitly exclude video audio from this first visual-only path. These are application limits, not Gemini capacity claims. Longer video and audio/video fusion need a revised contract.

## 3. Vision-to-care result

`VisionResult` contains `observation_id`, `case_id`, `based_on_revision`, `media_kind`, `media_id`, `source_sha256`, `status`, `observations`, `not_assessable`, `questions`, `warnings`, `created_at` and `expires_at`.

Each observation has:

| Field | Meaning |
| --- | --- |
| `observation_id` | Stable ID within this result |
| `description` | Narrow visible description; no claimed diagnosis or accident classification |
| `evidence_ref` | Same-case photo/video `EvidenceRef` with hash and media/version locator |
| `time_start_ms`, `time_end_ms` | Null for a photo; actual source time range for video |
| `visibility` | `clear` or `limited`; not a calibrated medical probability |
| `review_state` | Initially `unreviewed`; owner correction must retain the original observation |

Use `not_assessable` for facts the input cannot show, such as pain severity or whether a fracture exists. Preserve the owner statement separately: “the owner reports a jump” and “limited view of the front paw” must not become “the video proves an accident.” Missing/occluded footage is a partial result, not reassurance.

The coordinator consumes source-linked observations as context for care questions. It must not replace reported red flags, infer unseen events or treat generated illustrations as clinical evidence. Merge only against a compatible case revision. Until the standalone controller exists, the existing photo assessment cannot be presented as this richer `VisionResult`.

## 4. Failure, retention and acceptance

Proposed synchronous failures follow the Case error contract, plus 413 for size/duration bounds and 415 for unsupported media. After 202, expose safe failure reasons such as `media_unreadable` or `vision_unavailable`. Impose a 45-second analysis deadline; preserve owner text when visual processing fails.

Keep source media, sampled frames and derived observations private with a proposed 24-hour expiry, at most ten retained visual assets and 30 MB of source media per case, and explicit deletion. Deletion must invalidate dependent evidence/drafts and clear provider copies if any were created. The deletion-status route tracks cleanup; ordinary reads return 404 once deleted. A deleted/cancelled result may not reappear when an old worker completes.

Acceptance covers a valid photo, poor visibility, spoofed formats, malformed image decoding, excessive dimensions, unsupported video, timestamps, provider timeout, deletion during work and a late result for an edited concern. Keep live media understanding verification separate from the existing successful synthetic-image model probe.

## Visible wounds and blood-like material

`injury` reports `wound` and `blood_like_material` as `suspected`, `not_seen`, or `uncertain`,
plus location and a visual description. `active_bleeding` is always
`cannot_determine_from_photo`: redness, dark crust and stains are not proof of ongoing bleeding.
Unusable/non-cat images reset injury findings to unknown. Suspected wounds or blood-like material
produce `urgency: contact_vet` and a fixed escalation message; reported red flags retain emergency
priority. The conversation shows an injury notice and asks whether bleeding is ongoing/heavy.
The observations are handed to the LLM, not converted to a diagnosis or pain score.

The chat camera menu's **Take photo** always invokes the `accept="image/*" capture="environment"`
file input, requesting native rear-camera capture on supported mobile browsers. **Capture and analyze**
is separate and captures the desktop/in-app preview. Native camera behavior is controlled by the
browser/OS; desktop may show a file picker. JPEG/PNG/WebP up to 3 MB remain accepted by the API.

Escalation reference: https://www.pdsa.org.uk/pet-help-and-advice/pet-health-hub/medications/first-aid-for-bleeding
