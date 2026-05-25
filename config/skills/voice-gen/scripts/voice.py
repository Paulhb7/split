#!/usr/bin/env python3
"""Text-to-speech with ElevenLabs.

API shape reused from OpenClaw's elevenlabs extension:
  tts     POST  https://api.elevenlabs.io/v1/text-to-speech/<voice_id>
          header xi-api-key: <ELEVENLABS_API_KEY>   -> audio/mpeg bytes
  voices  GET   https://api.elevenlabs.io/v1/voices

Self-contained: stdlib only, reads ELEVENLABS_API_KEY from env or sidecar .env.
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

BASE = "https://api.elevenlabs.io"
DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM"  # Rachel
DEFAULT_MODEL = "eleven_multilingual_v2"


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
        "ERROR: ELEVENLABS_API_KEY is not set. Tell the user to open the Split "
        "bar's Keys panel, create an ElevenLabs account at https://elevenlabs.io, "
        "copy the API key from Profile, and paste it there. Not in chat.",
        file=sys.stderr,
    )
    sys.exit(2)


def list_voices(key: str) -> None:
    req = urllib.request.Request(f"{BASE}/v1/voices", headers={"xi-api-key": key})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        raise SystemExit(f"elevenlabs HTTP {e.code}: {e.read().decode(errors='replace')[:300]}")
    for v in data.get("voices", []):
        print(f"{v.get('voice_id')}\t{v.get('name')}")


def synth(key: str, text: str, voice: str, model: str, out: Path) -> None:
    body = json.dumps({
        "text": text,
        "model_id": model,
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
    }).encode()
    req = urllib.request.Request(
        f"{BASE}/v1/text-to-speech/{voice}",
        data=body,
        method="POST",
        headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"},
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            audio = resp.read()
    except urllib.error.HTTPError as e:
        raise SystemExit(f"elevenlabs HTTP {e.code}: {e.read().decode(errors='replace')[:300]}")
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "wb") as f:
        f.write(audio)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--text")
    ap.add_argument("--voice", default=DEFAULT_VOICE)
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--out")
    ap.add_argument("--list-voices", action="store_true")
    args = ap.parse_args()

    key = load_key("ELEVENLABS_API_KEY")
    if not key:
        die_no_key()

    if args.list_voices:
        list_voices(key)
        return

    if not args.text:
        raise SystemExit("need --text (or --list-voices)")

    out = Path(args.out) if args.out else sidecar_root() / "outputs" / f"voice-{int(time.time())}.mp3"
    synth(key, args.text, args.voice, args.model, out)
    print(json.dumps({"path": str(out.resolve()), "voice": args.voice, "model": args.model}))
    print(f"Voice saved to {out.resolve()}", file=sys.stderr)


if __name__ == "__main__":
    main()
