#!/usr/bin/env bash
#
# Deploy with a test gate.
#
# Runs the test suite automatically before every deploy, instead of
# relying on someone triggering it by hand — with several families as
# users, "I remember it in my head" isn't enough of a safeguard.
#
# Called from the Stundenplan folder:
#   ./deploy.sh          # tests, then proxy + website — the default, use this
#   ./deploy.sh proxy    # main proxy only
#   ./deploy.sh web      # website only
#
# On failing tests, nothing gets deployed.
#
# Terminal output below (the echo strings) is deliberately German — this
# script only runs for Björn himself, not for the app's own users; code
# comments and identifiers are English, this human-facing operator output
# is not.

set -euo pipefail

cd "$(dirname "$0")"

TARGET="${1:-alles}"

# Pinned, so the tool holding the Cloudflare credentials changes only on
# purpose — an unpinned "npx wrangler" pulls whatever is newest at deploy
# time, which is a silent change to the thing that talks to the account.
WRANGLER="npx --yes wrangler@4.144.0"

# Cloudflare access: an API token limited to Workers + Pages plus the account
# ID, both kept in the macOS keychain (README, section "Zugang"). Deliberately
# no account-wide `wrangler login`: that stores a long-lived OAuth token in
# plain text on disk, scoped to every product in the account.
CLOUDFLARE_API_TOKEN="$(security find-generic-password -s heute-schule-cloudflare-token -w 2>/dev/null | tr -d '[:space:]' || true)"
CLOUDFLARE_ACCOUNT_ID="$(security find-generic-password -s heute-schule-cloudflare-account -w 2>/dev/null | tr -d '[:space:]' || true)"
if [ -z "$CLOUDFLARE_API_TOKEN" ] || [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
  echo "✗ Cloudflare-Token oder Account-ID fehlt im Schlüsselbund — siehe README, Abschnitt „Zugang“."
  exit 1
fi
# Format checks turn a mis-pasted value into a clear message instead of a
# cryptic API error ("Authentication failed [9106]"); the values themselves
# are never printed, only their length.
if ! [[ "$CLOUDFLARE_API_TOKEN" =~ ^[A-Za-z0-9_-]{30,}$ ]]; then
  echo "✗ Der Token im Schlüsselbund hat ein unerwartetes Format (${#CLOUDFLARE_API_TOKEN} Zeichen)."
  echo "  Neu ablegen: security add-generic-password -U -a \"\$USER\" -s heute-schule-cloudflare-token -w"
  exit 1
fi
if ! [[ "$CLOUDFLARE_ACCOUNT_ID" =~ ^[0-9a-f]{32}$ ]]; then
  echo "✗ Die Account-ID im Schlüsselbund hat ein unerwartetes Format (${#CLOUDFLARE_ACCOUNT_ID} Zeichen)."
  exit 1
fi
export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID

# Über c8 gelaufen statt nacktem "node run-tests.mjs" — liefert die Coverage-
# Zusammenfassung als Nebenprodukt desselben Laufs, kein zweiter Testdurchgang
# nötig. Rein informativ: eine niedrige Zahl bricht den Deploy nicht ab, dafür
# gibt es keinen sinnvollen Schwellwert (c8 misst nur, was run-tests.mjs
# tatsächlich lädt — proxy/*, stundenplan.js; web/index.html läuft im
# Browser und taucht bewusst nicht auf, siehe .c8rc.json). Ausführliche
# Zahlen inkl. HTML-Report: npm run test:coverage.
echo "▶ Testsuite läuft (mit Code-Coverage)…"
if ! npx c8 --reporter=text-summary node run-tests.mjs; then
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

# web/source/ and web/docs/ are hand-maintained copies (see web/ueber.html,
# section "Technische Details") — no automatic sync with the original.
# Without this check, a stale dump wouldn't be noticed until someone
# outside the project spotted it.
echo "▶ Datei-Dump (web/source/, web/docs/) aktuell?"
DUMP_STALE=0
for PAIR in \
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
  SOURCE="${PAIR%%:*}"
  COPY="${PAIR##*:}"
  if ! diff -q "$SOURCE" "$COPY" >/dev/null 2>&1; then
    echo "  ✗ $COPY weicht von $SOURCE ab"
    DUMP_STALE=1
  fi
done
if [ "$DUMP_STALE" = "1" ]; then
  echo ""
  echo "✗ Datei-Dump veraltet — Original geändert, Kopie in web/ nicht."
  echo "  Kopie manuell nachziehen (z. B. cp proxy/worker.js web/source/proxy/),"
  echo "  danach erneut deployen."
  exit 1
fi
echo "  ✓ aktuell"
echo ""

if [ "$TARGET" = "alles" ] || [ "$TARGET" = "proxy" ]; then
  echo "▶ Proxy deployen…"
  ( cd proxy && $WRANGLER deploy )
  echo ""
fi

if [ "$TARGET" = "alles" ] || [ "$TARGET" = "web" ]; then
  echo "▶ Website deployen…"
  # deploy-commit.txt carries the current HEAD hash along (gitignored,
  # regenerated on every deploy) — the basis for the live-vs-HEAD check
  # right after. Closes the gap that the consistency gate above only
  # checks web/source resp. web/docs against the local originals, not
  # whether the actual deploy (proxy or website) has run at all since the
  # last code change. Deliberately NO leading dot in the filename:
  # Cloudflare Pages does not reliably serve files with a leading dot — an
  # initial attempt with ".deploy-commit" returned a live 404 and would
  # have made this check permanently blind.
  git rev-parse HEAD > web/deploy-commit.txt
  # Set --branch=production explicitly, do NOT omit it: wrangler pages
  # deploy otherwise auto-detects the local git branch (here "main") and
  # treats the deploy as a branch preview (ends up on
  # main.heute-schule.pages.dev instead of heute-schule.pages.dev). The
  # production branch configured on Cloudflare is named "production", not
  # "main" (checkable via `wrangler pages deployment list`).
  ( cd web && $WRANGLER pages deploy . --project-name=heute-schule --branch=production )
  echo ""

  # Cloudflare Pages braucht nach dem Upload einige Sekunden, bis die neue
  # Version wirklich ausgeliefert wird. Ein einzelner Versuch direkt danach
  # meldet deshalb regelmäßig eine Abweichung, die keine ist — und eine
  # Warnung, die meistens falsch ist, wird irgendwann weggelesen. Genau das
  # soll dieser Check verhindern, also wird er so lange wiederholt, bis die
  # Aussage belastbar ist.
  echo "▶ Live-Stand gegen HEAD prüfen…"
  HEAD_COMMIT="$(git rev-parse HEAD)"
  LIVE_COMMIT=""
  WAITED=0
  for _ in 1 2 3 4 5 6 7 8; do
    sleep 5
    WAITED=$((WAITED + 5))
    LIVE_COMMIT="$(curl -s https://heute-schule.pages.dev/deploy-commit.txt || true)"
    [ "$LIVE_COMMIT" = "$HEAD_COMMIT" ] && break
  done
  if [ "$LIVE_COMMIT" = "$HEAD_COMMIT" ]; then
    echo "  ✓ Live-Stand entspricht HEAD ($HEAD_COMMIT), nach ${WAITED}s"
  else
    echo "  ⚠ Live-Stand ($LIVE_COMMIT) weicht nach ${WAITED}s noch von"
    echo "    HEAD ($HEAD_COMMIT) ab. Erneut prüfen:"
    echo "    curl https://heute-schule.pages.dev/deploy-commit.txt"
    echo "    Bleibt es dabei, ist der Deploy nicht wie erwartet gelaufen."
  fi
  echo ""
fi

echo "✓ Fertig."
echo ""
echo "Nicht vergessen: Der Service Worker braucht auf dem Handy meist zwei"
echo "Reloads, bis die neue Version greift (einer zum Installieren, einer"
echo "zum Übernehmen)."
