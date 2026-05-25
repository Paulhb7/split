#!/usr/bin/env python3
"""Generate music with fal.ai's queue API (same shape as the video skill).

  submit  POST  https://queue.fal.run/<model>   Authorization: Key <FAL_KEY>
  poll    GET   <status_url>                     -> {"status": ...}
  result  GET   <response_url>                   -> {"audio": {"url": ...}}

Self-contained: stdlib only, reads FAL_KEY from env or the sidecar .env.
"""
from __future__ import annotations  # lazy annotations → runs on any python3 (3.7+)

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

QUEUE_BASE = "https://queue.fal.run"
DEFAULT_MODEL = "fal-ai/minimax-music/v2.6"
PENDING = {"IN_QUEUE", "IN_PROGRESS", "PROCESSING", "QUEUED", "STARTED"}
POLL_S = 5
TIMEOUT_S = 10 * 60


def sidecar_root() -> Path:
    for parent in Path(__file__).resolve().parents:
        if (parent / "main.py").is_file():
            return parent
    return Path.cwd()


def load_key(name: str) -> str | None:
    v = os.environ.get(name)
    if v:
        return v.strip()
    env = sidecar_root() / ".env"
    if env.is_file():
        for line in env.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith(name + "="):
                return line.split("=", 1)[1].strip()
    return None


def die_no_key() -> None:
    print(
        "ERROR: FAL_KEY is not set. Tell the user to open the Split bar's Keys "
        "panel, create a fal account at https://fal.ai, copy an API key, and paste "
        "it there. Do not ask for the key in chat.",
        file=sys.stderr,
    )
    sys.exit(2)


def api(url: str, key: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        method="POST" if body is not None else "GET",
        headers={"Authorization": f"Key {key}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:500]
        raise SystemExit(f"fal HTTP {e.code} for {url}: {detail}")


def find_audio_url(payload: dict) -> str | None:
    for key in ("audio", "audio_file"):
        v = payload.get(key)
        if isinstance(v, dict) and v.get("url"):
            return v["url"]
        if isinstance(v, str) and v.startswith("http"):
            return v
    vs = payload.get("audios")
    if isinstance(vs, list) and vs and isinstance(vs[0], dict):
        return vs[0].get("url")
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--lyrics")
    ap.add_argument("--model")
    ap.add_argument("--out")
    args = ap.parse_args()

    key = load_key("FAL_KEY")
    if not key:
        die_no_key()

    model = args.model or DEFAULT_MODEL
    body: dict = {"prompt": args.prompt}
    if args.lyrics:
        body["lyrics"] = args.lyrics

    print(f"submitting to {model} …", file=sys.stderr)
    sub = api(f"{QUEUE_BASE}/{model}", key, body)
    status_url = sub.get("status_url")
    response_url = sub.get("response_url")
    if not status_url or not response_url:
        raise SystemExit(f"unexpected fal submit response: {json.dumps(sub)[:400]}")

    deadline = time.time() + TIMEOUT_S
    while True:
        st = api(status_url, key)
        status = (st.get("status") or "").upper()
        if status == "COMPLETED":
            break
        if status and status not in PENDING:
            raise SystemExit(f"fal job failed: {json.dumps(st)[:400]}")
        if time.time() > deadline:
            raise SystemExit("timed out waiting for fal music")
        print(f"  status={status or '?'} …", file=sys.stderr)
        time.sleep(POLL_S)

    result = api(response_url, key)
    url = find_audio_url(result)
    if not url:
        raise SystemExit(f"no audio url in result: {json.dumps(result)[:400]}")

    out = Path(args.out) if args.out else sidecar_root() / "outputs" / f"music-{int(time.time())}.mp3"
    out.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=120) as r, open(out, "wb") as f:
        f.write(r.read())

    print(json.dumps({"path": str(out.resolve()), "model": model}))
    print(f"Track saved to {out.resolve()}", file=sys.stderr)


if __name__ == "__main__":
    main()
