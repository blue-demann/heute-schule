#!/usr/bin/env bash
#
# Deploy mit Test-Gate.
#
# Läuft die Testsuite vor jedem Deploy automatisch, statt sich darauf zu
# verlassen, dass sie jemand von Hand anstößt — bei mehreren Familien als
# Nutzerkreis reicht "ich hab's im Kopf" nicht als Absicherung.
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

echo "▶ Lint (Google JavaScript Style Guide, siehe eslint.config.mjs)…"
if ! npx eslint .; then
  echo ""
  echo "✗ Lint-Fehler — Deploy abgebrochen."
  exit 1
fi
echo "  ✓ sauber"
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
  "OFFEN-naechste-Fixes.md:web/docs/OFFEN-naechste-Fixes.md" \
  "QA-Bericht-2026-08-31.md:web/docs/QA-Bericht-2026-08-31.md" \
  "PEER-REVIEW-2026-09-01.md:web/docs/PEER-REVIEW-2026-09-01.md" \
  "prompts/README.md:web/docs/prompts/README.md" \
  "prompts/ct-stil-analyse.md:web/docs/prompts/ct-stil-analyse.md" \
  "prompts/peer-review-bester-freund.md:web/docs/prompts/peer-review-bester-freund.md"; do
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
  # deploy-commit.txt trägt den aktuellen HEAD-Hash mit hoch (gitignored,
  # bei jedem Deploy neu erzeugt) — Grundlage für den Live-vs-HEAD-
  # Abgleich direkt im Anschluss. Löst die Lücke, dass das Konsistenz-Gate
  # oben nur web/source bzw. web/docs gegen die lokalen Originale prüft,
  # nicht ob der tatsächliche Deploy (Proxy oder Website) seit der letzten
  # Code-Änderung überhaupt gelaufen ist. Bewusst KEIN führender Punkt im
  # Dateinamen: Cloudflare Pages liefert Dateien mit führendem Punkt nicht
  # zuverlässig aus, ein erster Versuch mit ".deploy-commit" lieferte live
  # 404 und hätte den Check dauerhaft blind gemacht.
  git rev-parse HEAD > web/deploy-commit.txt
  # --branch=production explizit setzen, NICHT weglassen: wrangler pages
  # deploy erkennt sonst automatisch den lokalen Git-Branch (hier "main")
  # und behandelt den Deploy als Branch-Preview (landet auf
  # main.heute-schule.pages.dev statt heute-schule.pages.dev). Der bei
  # Cloudflare hinterlegte Produktions-Branch heißt "production", nicht
  # "main" (per `wrangler pages deployment list` prüfbar).
  ( cd web && npx wrangler pages deploy . --project-name=heute-schule --branch=production )
  echo ""

  echo "▶ Live-Stand gegen HEAD prüfen…"
  sleep 3
  LIVE_COMMIT="$(curl -s https://heute-schule.pages.dev/deploy-commit.txt || true)"
  HEAD_COMMIT="$(git rev-parse HEAD)"
  if [ "$LIVE_COMMIT" = "$HEAD_COMMIT" ]; then
    echo "  ✓ Live-Stand entspricht HEAD ($HEAD_COMMIT)"
  else
    echo "  ⚠ Live-Stand ($LIVE_COMMIT) weicht von HEAD ($HEAD_COMMIT) ab —"
    echo "    entweder ist der Cache noch nicht durchgezogen (kurz warten,"
    echo "    erneut prüfen: curl https://heute-schule.pages.dev/deploy-commit.txt)"
    echo "    oder der Deploy ist nicht wie erwartet gelaufen."
  fi
  echo ""
fi

echo "✓ Fertig."
echo ""
echo "Nicht vergessen: Der Service Worker braucht auf dem Handy meist zwei"
echo "Reloads, bis die neue Version greift (einer zum Installieren, einer"
echo "zum Übernehmen)."
