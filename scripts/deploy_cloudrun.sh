#!/usr/bin/env bash
# Deploy the public demo to Cloud Run: bash scripts/deploy_cloudrun.sh <gcp-project> [region]
# One instance (min=max=1): the case cache in pawse/state.py is in memory.
# Provider keys come from .env (PAWSE_ENV_FILE overrides; a worktree without .env uses the root checkout's):
# each one set there is synced to its Secret Manager secret (a new version only when the value changed) and
# mounted. A key missing from .env keeps the secret already deployed. Values are never printed.
set -euo pipefail
PROJECT="${1:?usage: deploy_cloudrun.sh <gcp-project> [region]}"
REGION="${2:-europe-west6}"
cd "$(dirname "$0")/.."
# ENV_VAR=secret-name for every key the app reads. Add new provider keys here.
KEYS="GEMINI_API_KEY=pawse-gemini-key GRADIUM_API_KEY=pawse-gradium-key GOOGLE_PLACES_API_KEY=pawse-places-key"
ENV_FILE="${PAWSE_ENV_FILE:-.env}"
[ -f "$ENV_FILE" ] || ENV_FILE="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")/.env"
env_value() {  # last NAME=value line, surrounding quotes removed
  [ -f "$ENV_FILE" ] || return 0
  sed -n "s/^[[:space:]]*\(export[[:space:]]\+\)\?$1[[:space:]]*=[[:space:]]*//p" "$ENV_FILE" | tail -n 1 | sed -e 's/[[:space:]]*$//' -e "s/^[\"']\(.*\)[\"']$/\1/"
}
RUNTIME_SA="$(gcloud projects describe "$PROJECT" --format 'value(projectNumber)')-compute@developer.gserviceaccount.com"
SECRETS=""
for pair in $KEYS; do
  var="${pair%%=*}" secret="${pair#*=}" value="$(env_value "${pair%%=*}")"
  if [ -n "$value" ]; then
    if ! gcloud secrets describe "$secret" --project "$PROJECT" >/dev/null 2>&1; then
      printf %s "$value" | gcloud secrets create "$secret" --project "$PROJECT" --replication-policy automatic --data-file=- --quiet
      echo "$var: created secret $secret"
    elif [ "$(gcloud secrets versions access latest --secret "$secret" --project "$PROJECT")" != "$value" ]; then
      printf %s "$value" | gcloud secrets versions add "$secret" --project "$PROJECT" --data-file=- --quiet
      echo "$var: new version of $secret"
    else
      echo "$var: $secret is up to date"
    fi
    gcloud secrets add-iam-policy-binding "$secret" --project "$PROJECT" --member "serviceAccount:$RUNTIME_SA" \
      --role roles/secretmanager.secretAccessor --quiet >/dev/null
  elif gcloud secrets describe "$secret" --project "$PROJECT" >/dev/null 2>&1; then
    echo "$var: not in $ENV_FILE, keeping the deployed secret $secret"
  else
    echo "$var: not set, skipped"
    continue
  fi
  SECRETS="${SECRETS:+$SECRETS,}$var=$secret:latest"
done
case ",$SECRETS" in *,GEMINI_API_KEY=*) ;; *) echo "GEMINI_API_KEY is required: set it in $ENV_FILE" >&2; exit 1 ;; esac
deploy() {
  gcloud run deploy pawse --project "$PROJECT" --region "$REGION" --source . \
    --allow-unauthenticated --min-instances 1 --max-instances 1 --timeout 3600 \
    --set-secrets "$SECRETS" --set-env-vars "^@^PAWSE_PUBLIC_DEMO=1@PAWSE_ALLOWED_HOSTS=$1" "${@:2}"
}
# The host allowlist needs the service URL, which only exists after the first deploy.
URL=$(gcloud run services describe pawse --project "$PROJECT" --region "$REGION" --format 'value(status.url)' 2>/dev/null || true)
deploy "${URL#https://}" --quiet
URL=$(gcloud run services describe pawse --project "$PROJECT" --region "$REGION" --format 'value(status.url)')
# Cloud Run serves two URLs (hash and project-number form); allow both.
HOSTS=$(gcloud run services describe pawse --project "$PROJECT" --region "$REGION" --format json | python3 -c '
import json, sys
d = json.load(sys.stdin)
urls = [d["status"]["url"], *json.loads(d["metadata"].get("annotations", {}).get("run.googleapis.com/urls", "[]"))]
print(",".join(sorted({u.removeprefix("https://") for u in urls})))')
gcloud run services update pawse --project "$PROJECT" --region "$REGION" --update-env-vars "^@^PAWSE_ALLOWED_HOSTS=$HOSTS" --quiet
curl -fsS "$URL/api/v1/health" && echo && echo "Live: $URL"
