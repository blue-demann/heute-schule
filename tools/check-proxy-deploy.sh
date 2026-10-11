#!/usr/bin/env bash
#
# Checks that the Worker version currently serving production is the one
# deployed from the given commit. deploy.sh passes the commit hash as the
# version message (`wrangler deploy --message`); this script asks Cloudflare
# which version is active and looks for that hash in the version's details.
# Counterpart to the website's deploy-commit.txt check — without it, a proxy
# deploy that silently did not happen would go unnoticed.
#
#   tools/check-proxy-deploy.sh <commit-hash>      (run from proxy/)
#
# Exit 0: an active version carries the commit. Exit 1: none does, or
# Cloudflare could not be asked. WRANGLER names the wrangler command
# (default: the pinned local one); needs the same API token as the deploy.
#
# Deliberately independent of the exact JSON layout: it takes every UUID in
# the deployment status as a candidate version id and searches each
# version's JSON for the hash.

set -euo pipefail

COMMIT="${1:-}"
if ! [[ "$COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
  echo "    Aufruf: check-proxy-deploy.sh <40-stelliger Commit-Hash>"
  exit 1
fi
WRANGLER="${WRANGLER:-npx --no-install wrangler}"

if ! STATUS="$($WRANGLER deployments status --json 2>/dev/null)"; then
  echo "    Aktiver Stand des Proxys nicht abrufbar (wrangler deployments status)."
  exit 1
fi

IDS="$(printf '%s\n' "$STATUS" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | sort -u || true)"
if [ -z "$IDS" ]; then
  echo "    Keine Versions-ID im aktiven Stand gefunden."
  exit 1
fi

for ID in $IDS; do
  if DETAILS="$($WRANGLER versions view "$ID" --json 2>/dev/null)" && printf '%s\n' "$DETAILS" | grep -qF "$COMMIT"; then
    exit 0
  fi
done
echo "    Keine aktive Version trägt den Commit $COMMIT."
exit 1
