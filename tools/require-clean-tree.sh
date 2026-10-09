#!/usr/bin/env bash
#
# Fails unless the Git working tree is clean: no uncommitted changes and no
# untracked files that aren't gitignored. deploy.sh runs this before
# anything else, because the live-vs-HEAD check after the deploy names HEAD
# as the live state — that is only true if exactly HEAD was deployed.
# Gitignored files (e.g. the real web/impressum.html) don't count.
#
# Run from the directory to check (deploy.sh: the project root).

set -euo pipefail

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "✗ Kein Git-Arbeitsbaum — Deploy abgebrochen."
  exit 1
fi

STATUS="$(git status --porcelain --untracked-files=all)"
if [ -n "$STATUS" ]; then
  echo "✗ Arbeitsbaum nicht sauber — erst committen, dann deployen:"
  printf '%s\n' "$STATUS" | sed 's/^/    /'
  exit 1
fi
