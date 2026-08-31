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

# web/source/ und web/docs/ sind von Hand gepflegte Kopien (siehe
# web/ueber.html, Abschnitt "Technische Details") — kein automatischer
# Abgleich mit dem Original. Ohne diese Prüfung würde ein veralteter Dump
# niemandem auffallen, bis ihn jemand von außen bemerkt.
echo "▶ Datei-Dump (web/source/, web/docs/) aktuell?"
DUMP_VERALTET=0
for PAAR in \
  "proxy/worker.js:web/source/proxy/worker.js" \
  "proxy/hostcheck.mjs:web/source/proxy/hostcheck.mjs" \
  "proxy/cachekey.mjs:web/source/proxy/cachekey.mjs" \
  "PROJEKT.md:web/docs/PROJEKT.md" \
  "OFFEN-naechste-Fixes.md:web/docs/OFFEN-naechste-Fixes.md"; do
  ORIGINAL="${PAAR%%:*}"
  KOPIE="${PAAR##*:}"
  if ! diff -q "$ORIGINAL" "$KOPIE" >/dev/null 2>&1; then
    echo "  ✗ $KOPIE weicht von $ORIGINAL ab"
    DUMP_VERALTET=1
  fi
done
if [ "$DUMP_VERALTET" = "1" ]; then
  echo ""
  echo "✗ Datei-Dump veraltet — Original geändert, Kopie in web/ nicht."
  echo "  Kopie manuell nachziehen (z. B. cp proxy/worker.js web/source/proxy/),"
  echo "  danach erneut deployen."
  exit 1
fi
echo "  ✓ aktuell"
echo ""

if [ "$ZIEL" = "alles" ] || [ "$ZIEL" = "proxy" ]; then
  echo "▶ Proxy deployen…"
  ( cd proxy && npx wrangler deploy )
  echo ""
fi

if [ "$ZIEL" = "alles" ] || [ "$ZIEL" = "web" ]; then
  echo "▶ Website deployen…"
  # --branch=production explizit setzen, NICHT weglassen: wrangler pages
  # deploy erkennt sonst automatisch den lokalen Git-Branch und behandelt
  # den Deploy als Branch-Preview (landet auf main.heute-schule.pages.dev
  # statt heute-schule.pages.dev). Passiert seit es hier ein Git-Repo gibt —
  # ohne Git griff wrangler mangels Branch-Info auf den in Cloudflare
  # hinterlegten Produktions-Branch zurück, der "production" heißt (per
  # `wrangler pages deployment list` bestätigt, nicht "main").
  ( cd web && npx wrangler pages deploy . --project-name=heute-schule --branch=production )
  echo ""
fi

echo "✓ Fertig."
echo ""
echo "Nicht vergessen: Der Service Worker braucht auf dem Handy meist zwei"
echo "Reloads, bis die neue Version greift (einer zum Installieren, einer"
echo "zum Übernehmen)."
