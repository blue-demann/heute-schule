#!/usr/bin/env bash
#
# Deploy mit Test-Gate.
#
# Hintergrund: Die Testsuite lief bisher nur, wenn jemand daran dachte. Genau
# so ist eine Sicherheitslücke im Cache-Schlüssel monatelang unentdeckt
# geblieben (siehe proxy/cachekey.mjs). Seit fremde Familien mitnutzen, ist
# "ich hab's im Kopf" keine ausreichende Absicherung mehr.
#
# Aufruf aus dem Stundenplan-Ordner:
#   ./deploy.sh          # Tests, dann Proxy + Website
#   ./deploy.sh proxy    # nur Proxy
#   ./deploy.sh web      # nur Website
#
# Bei fehlschlagenden Tests wird NICHT deployed.

set -euo pipefail

cd "$(dirname "$0")"

ZIEL="${1:-alles}"

echo "▶ Testsuite läuft…"
if ! node run-tests.mjs; then
  echo ""
  echo "✗ Tests fehlgeschlagen — Deploy abgebrochen."
  exit 1
fi
echo ""

if [ "$ZIEL" = "alles" ] || [ "$ZIEL" = "proxy" ]; then
  echo "▶ Proxy deployen…"
  ( cd proxy && npx wrangler deploy )
  echo ""
fi

if [ "$ZIEL" = "alles" ] || [ "$ZIEL" = "web" ]; then
  echo "▶ Website deployen…"
  ( cd web && npx wrangler pages deploy . --project-name=heute-schule )
  echo ""
fi

echo "✓ Fertig."
echo ""
echo "Nicht vergessen: Der Service Worker braucht auf dem Handy meist zwei"
echo "Reloads, bis die neue Version greift (einer zum Installieren, einer"
echo "zum Übernehmen)."
