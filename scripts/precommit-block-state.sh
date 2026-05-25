#!/usr/bin/env bash
# Hard-block secret / session-state paths from a commit, even if force-added
# (defense beyond .gitignore). Wired as a local pre-commit hook.
set -euo pipefail

staged=$(git diff --cached --name-only | grep -E '(^|/)\.env$|^var/' || true)
if [ -n "$staged" ]; then
  echo "Commit blocked — these are secrets/session state, not for git:"
  echo "$staged" | sed 's/^/   /'
  echo "   (added with -f? unstage with: git rm --cached <file>)"
  exit 1
fi
