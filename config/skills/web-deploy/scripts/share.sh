#!/usr/bin/env bash
# Ship <dir> to surge.sh — permanent free URL, email-only signup
# (no validation). First run prompts for email + password in the terminal;
# subsequent runs reuse the saved credentials from ~/.netrc.

set -eu

dir="${1:-}"
sub="${2:-}"

if [ -z "$dir" ] || [ ! -d "$dir" ]; then
  echo "usage: share.sh <dir> [subdomain]" >&2
  echo "  <dir>       a directory containing index.html" >&2
  echo "  [subdomain] optional — e.g. 'paul-todolist' → paul-todolist.surge.sh" >&2
  exit 2
fi

if [ ! -f "$dir/index.html" ]; then
  echo "no index.html in $dir — surge needs one to serve as the entry point" >&2
  exit 2
fi

if ! command -v surge >/dev/null 2>&1; then
  cat >&2 <<'EOF'
surge not found. Install with:
  npm install -g surge
Then re-run. First deploy will prompt for an email + a password (no
validation — invent any password). Subsequent deploys are silent.
EOF
  exit 127
fi

if [ -n "$sub" ]; then
  target="${sub}.surge.sh"
  surge "$dir" "$target"
  url="https://${target}"
else
  # Let surge pick a random domain; capture it from output.
  out="$(surge "$dir" 2>&1 | tee /dev/tty)"
  url="$(printf '%s\n' "$out" | grep -oE 'https://[a-z0-9-]+\.surge\.sh' | tail -n1)"
fi

printf '{"url": "%s"}\n' "$url"

# Open the URL in the user's default system browser (out-of-process). This is
# the only correct way to surface the deployed app — rendering it inside the
# Split Tauri webview crashes the app. Best-effort; silent if no GUI.
( command -v open >/dev/null 2>&1 && open "$url" ) 2>/dev/null \
  || ( command -v xdg-open >/dev/null 2>&1 && xdg-open "$url" ) 2>/dev/null \
  || true
