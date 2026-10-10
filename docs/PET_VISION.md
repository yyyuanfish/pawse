# Pet vision model assessment

Checked 10 October 2026 using the server-side Gemini key. No private photographs or credentials were published.

## Model choice

Use `gemini-3.8-flash` as the candidate for a dedicated pet observation endpoint, with the currently integrated `gemini-3-flash-preview` as a tested compatibility fallback. Both were listed for this key and returned HTTP 200 for a synthetic one-pixel image; both correctly said no cat face was assessable. Single-request elapsed times were 1.58 s and 1.51 s respectively. This verifies access and image-input transport, not clinical accuracy, real-photo performance or a speed ranking. Existing model defaults have not been changed.

Official reference: https://ai.google.dev/gemini-api/docs/image-understanding

## Existing code to reuse

- The local legacy agent's `CatDetectionNode` distinguishes cat / no cat before vision analysis.
- Its `VisionAnalysisNode` describes ears, eye narrowing, muzzle and posture. It also uploads media to object storage and returns unvalidated pain scores: do not copy those dependencies or scoring defaults into the demo.
- `pawse/providers.py:assess` already sends `CareRequest.photo` to Gemini as inline image content and returns care preparation guidance.
- `web/src/agents/geminiLiveAgent.js:sendImage` already sends selected JPEG/PNG/WebP images to the Live conversation. Camera preview alone is not streamed video.

## Implemented observation contract

See [controller contract](controller-vision-contract.md). `POST /api/v1/vision/observations`, with `photo` using the existing bounded image schema and `share_with_ai: true`.

Return `cat_detected: true | false | null`, `face_assessable: boolean`, `image_quality: adequate | limited | unusable`, `visible_observations` (ears, eyes, muzzle, whiskers, head/body posture), `limitations`, and `questions_for_owner`. Each observation can be `not_visible`; a face crop must not imply that gait or breathing was assessed. No numeric pain score, diagnosis, identity match, or reassurance from a photograph alone.

Target care handoff (not automatically connected yet): selected photo → cat/quality check → visible observations → existing care guidance → nearby vets → reviewed German handoff using the saved voice. Owner-reported emergency signs must retain priority if the photo is normal-looking or unassessable. For limping, ask what happened and obtain appropriate video evidence later rather than inventing movement from a still.

Pet identity matching (“is this Mimi?”) is a separate, unvalidated capability requiring enrolled reference photos, an unknown result, and owner confirmation. Do not market the observation feature as reliable face identification.

## Before calling it validated

Use owner-authorized cat images plus non-cat, blurred, occluded and multiple-cat cases. Measure abstention and observation errors; keep provider mocks for CI. Veterinary assessment is needed before using any automated feline pain scoring in a clinical workflow. No real-cat evaluation was performed in this access check.
