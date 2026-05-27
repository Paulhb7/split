#!/usr/bin/env bash
# Serve <dir> locally and expose it via Cloudflare Quick Tunnel.
# Prints {"url": "...", "server_pid": ..., "tunnel_pid": ...} and exits;
# both background processes keep running until killed or the session ends.

set -eu

dir="${1:-}"
if [ -z "$dir" ] || [ ! -d "$dir" ]; then
  echo "usage: preview.sh <dir>" >&2
  echo "  <dir> must be a directory containing an index.html" >&2
  exit 2
fi

if ! command -v cloudflared >/dev/null 2>&1; then
  cat >&2 <<'EOF'
cloudflared not found. Install with:
  brew install cloudflared
Then re-run this script. No account / signup needed — Quick Tunnel is free.
EOF
  exit 127
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 not found (needed for the local HTTP server)" >&2
  exit 127
fi

# Pick a free localhost port.
port="$(python3 - <<'PY'
import socket
s = socket.socket()
s.bind(("127.0.0.1", 0))
print(s.getsockname()[1])
s.close()
PY
)"

logdir="$(mktemp -d)"
server_log="$logdir/server.log"
tunnel_log="$logdir/tunnel.log"

# 1) Local HTTP server, backgrounded, in the target dir.
(cd "$dir" && python3 -m http.server "$port" >"$server_log" 2>&1) &
server_pid=$!

# 2) Cloudflare Quick Tunnel, backgrounded.
cloudflared tunnel --url "http://localhost:$port" >"$tunnel_log" 2>&1 &
tunnel_pid=$!

# 3) Poll the tunnel log for the trycloudflare.com URL (usually within 2-5s).
url=""
for _ in $(seq 1 60); do
  url="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$tunnel_log" 2>/dev/null | head -n1 || true)"
  if [ -n "$url" ]; then break; fi
  sleep 0.5
done

if [ -z "$url" ]; then
  echo "Timed out waiting for the tunnel URL. Tail of tunnel log:" >&2
  tail -n 30 "$tunnel_log" >&2
  kill "$server_pid" "$tunnel_pid" 2>/dev/null || true
  exit 1
fi

printf '{"url": "%s", "server_pid": %s, "tunnel_pid": %s, "port": %s, "log_dir": "%s"}\n' \
  "$url" "$server_pid" "$tunnel_pid" "$port" "$logdir"

# Open the URL in the user's default system browser (out-of-process). This is
# the only correct way to surface the deployed app — rendering it inside the
# Split Tauri webview crashes the app. Best-effort; silent if no GUI.
( command -v open >/dev/null 2>&1 && open "$url" ) 2>/dev/null \
  || ( command -v xdg-open >/dev/null 2>&1 && xdg-open "$url" ) 2>/dev/null \
  || true
