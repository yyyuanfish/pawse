# Vercel website deployment

The Vercel build hosts the English landing page at `/` (also `/landing`) and the React App at
`/app/`. It uses the existing Pawse sakura-pink tokens and includes owner-supplied cat photos
and labelled repository prototype screenshots. The hero should feel warm and calm; its main
moment is a familiar cat face beside a clear invitation to start care.

## Build and preview

```sh
npm ci --prefix web
node scripts/build_site.mjs
node scripts/check_site.mjs
node scripts/preview_site.mjs
```

Preview: `http://127.0.0.1:8895`. The preview proxies API requests to the existing hosted backend;
only submit test content after confirming the appropriate sharing consent in the app.

## Publish

Import this repository in Vercel with the repository root as Root Directory. `vercel.json` supplies
two services: `landing` (static `site/`) and `web` (React build plus the HTTP gateway).
Build commands and output settings live inside each service. Select the desired feature branch
for a preview, or deploy it through the authenticated CLI with `vercel --prod`.
No Gemini, Gradium or Places API key belongs in Vite variables or static assets.

`api/gateway.mjs` forwards same-origin HTTP API calls to the fixed Cloud Run origin:
`https://pawse-114215092948.europe-west6.run.app`. It checks browser origins before forwarding,
retains session cookies, streams responses and enforces bounded request bodies. Gemini and
Gradium native audio streams connect directly to their providers with short-lived backend-issued
tokens. The FastAPI backend, credentials and session state remain on Cloud Run. This is a frontend
and gateway deployment, not a migration of stateful backend services to Vercel.

The Cloud Run backend must separately receive the latest release for the new vision endpoint.
A successful frontend deploy does not prove photo analysis, own-voice persistence or telephony
is configured in that backend. Validate `/api/v1/health`, photo observation and voice status on the
actual published domain. No live call or provider purchase is part of the landing-page smoke test.

## Validation and limits

Gateway checks cover cross-origin rejection, fixed upstream routing, cookie forwarding, JSON body
forwarding and upload-size rejection. Images/keys/private recordings from development are excluded
except the two cat images explicitly supplied for publication and existing repository screenshots.
`.vercelignore` excludes local credentials, private state and unrelated legacy/data directories.
Physical phone permissions, actual Vercel routing and production features require post-deploy tests.

## Service routing and bindings

- `landing` is public at `/`, `/landing` and its static asset paths.
- `web` is public at `/app`, `/app/*` and `/api/*`. Its API gateway forwards to the existing Cloud Run service.
- The original request path is preserved. `/app/assets/*` exists in the generated `dist/app/assets/` folder.
- There are no internal Vercel service calls and therefore no `bindings`. Browser requests use relative `/api/v1/...` URLs. A runtime binding cannot be read by static Vite code.
- `backend/` is a legacy agent with separate data/worker dependencies, not the current Pawse API. It is not deployed. `pawse/legacy.py` already reads `LEGACY_AGENT_BASE_URL` when that optional integration is configured on Cloud Run.
- The current API stays on Cloud Run; do not copy its private local voice state into a public deployment.

Run `npx vercel dev -L` to validate service routing locally. The standalone preview is a UI/gateway smoke test, not a replacement for Vercel's service router.

References: [Services](https://vercel.com/docs/services), [routing](https://vercel.com/docs/services/routing), [configuration](https://vercel.com/docs/services/config-reference).
