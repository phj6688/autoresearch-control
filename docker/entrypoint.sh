#!/bin/sh
# Bootstrap Infisical universal-auth, then exec the app with secrets injected as env.
set -e

# Read bootstrap creds from docker-compose secrets: mounts if not already set.
if [ -z "$INFISICAL_UNIVERSAL_AUTH_CLIENT_ID" ] && [ -r /run/secrets/infisical_client_id ]; then
  INFISICAL_UNIVERSAL_AUTH_CLIENT_ID="$(cat /run/secrets/infisical_client_id)"
fi
if [ -z "$INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET" ] && [ -r /run/secrets/infisical_client_secret ]; then
  INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET="$(cat /run/secrets/infisical_client_secret)"
fi

: "${INFISICAL_DOMAIN:=http://infisical:8080}"
: "${INFISICAL_ENV:=prod}"

if [ -z "$INFISICAL_PROJECT_ID" ] || [ -z "$INFISICAL_UNIVERSAL_AUTH_CLIENT_ID" ] || [ -z "$INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET" ]; then
  echo "[entrypoint] missing Infisical bootstrap. need: INFISICAL_PROJECT_ID + INFISICAL_UNIVERSAL_AUTH_CLIENT_ID + INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET (env or /run/secrets/infisical_client_{id,secret})" >&2
  exit 1
fi

# Exchange client-id/secret for a short-lived access token. The client id/secret go in as
# command-scoped env (not --flags), so they never land in the container process list and never
# reach the app process. --plain emits just the token.
set +e
TOKEN="$(
  INFISICAL_UNIVERSAL_AUTH_CLIENT_ID="$INFISICAL_UNIVERSAL_AUTH_CLIENT_ID" \
  INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET="$INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET" \
  infisical login --method=universal-auth --domain="$INFISICAL_DOMAIN" --plain --silent
)"
login_rc=$?
set -e

if [ "$login_rc" -ne 0 ] || [ -z "$TOKEN" ]; then
  echo "[entrypoint] infisical login failed (rc=$login_rc)" >&2
  exit 1
fi

# Token goes in via INFISICAL_TOKEN env, not --token, so it stays out of the process list
# (where the unprivileged agent user could otherwise read it).
exec env INFISICAL_TOKEN="$TOKEN" infisical run \
  --domain="$INFISICAL_DOMAIN" \
  --projectId="$INFISICAL_PROJECT_ID" \
  --env="$INFISICAL_ENV" \
  --recursive \
  --silent \
  -- "$@"
