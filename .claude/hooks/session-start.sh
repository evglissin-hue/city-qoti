#!/bin/bash
# Session start for City Qoti cloud sessions: refuse to let work start on a stale base, show what is
# already built, and install dependencies. Its output is read by the agent before the first message.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# 1. Freshness: is this checkout built on the latest main?
if timeout 60 git fetch --quiet origin main 2>/dev/null; then
  branch="$(git rev-parse --abbrev-ref HEAD)"
  [ "$branch" = "HEAD" ] && branch="<your-branch>"
  behind="$(git rev-list --count HEAD..origin/main)"
  if [ "$behind" -gt 0 ]; then
    echo "WARNING: STALE BASE. Branch '$branch' is $behind commits behind origin/main."
    echo "Do not design or build anything on this base. If the branch has no work of its own, run:"
    echo "  git checkout -B $branch origin/main"
    echo "otherwise rebase or merge origin/main first. Then re-read CLAUDE.md and the build board."
    echo "Latest on main:"
    git log --oneline -5 origin/main | sed 's/^/  /'
  else
    echo "Base check: '$branch' contains origin/main ($(git rev-parse --short origin/main))."
  fi
else
  echo "WARNING: could not fetch origin/main, so the base could not be checked. Run 'git fetch origin main'"
  echo "and compare with 'git log --oneline -3 origin/main' before designing anything."
fi

# 2. What is already built: the build board's latest rows and the code that exists.
board="$(git show origin/main:docs/build/README.md 2>/dev/null || cat docs/build/README.md 2>/dev/null || true)"
if [ -n "$board" ]; then
  echo "Build board on main (docs/build/README.md), latest rows:"
  printf '%s\n' "$board" | grep '^| C' | tail -8 | cut -c1-160 | sed 's/^/  /'
fi
echo "Before designing a feature, search the code for it (apps/, packages/, tools/), not only the docs."

# 3. Dependencies: install only when a manifest changed since the last successful install.
hashes=node_modules/.session-start.sha256
if [ -f package.json ] && ! sha256sum --check --status "$hashes" 2>/dev/null; then
  rm -f "$hashes"
  npm install --no-audit --no-fund >/dev/null
  sha256sum .claude/hooks/session-start.sh package.json package-lock.json \
    apps/*/package.json packages/*/package.json tools/*/package.json 2>/dev/null > "$hashes" || rm -f "$hashes"
fi
