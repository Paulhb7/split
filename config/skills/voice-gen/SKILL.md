---
name: voice-gen
description: Turn text into natural speech with ElevenLabs (text-to-speech). Use when an expert needs a voiceover, narration, a podcast voice, or spoken dialogue. Supports multiple voices for multi-speaker audio.
---

# Voice / text-to-speech (ElevenLabs)

Synthesize speech from text and get back a local `.mp3`. For a multi-voice
podcast, call this once per speaker (different `--voice`) and stitch the clips
with `ffmpeg` via Bash.

## Auth

Needs `ELEVENLABS_API_KEY` in the environment (Split bar's **Keys** panel, or the
project `.env`). If missing, the script prints how to fix it (ElevenLabs account
at https://elevenlabs.io → Profile → API key). Never ask for the key in chat.

## Run

The script is stdlib-only — no install. Run it with `python3` from your
workspace; the skill is mounted under `.claude/skills/` (Claude) or
`.agents/skills/` (other harnesses):

```bash
# list available voices (id + name) to pick from
python3 .claude/skills/voice-gen/scripts/voice.py --list-voices

# synthesize
python3 .claude/skills/voice-gen/scripts/voice.py --text "<words>" [options]
# non-Claude harness: .agents/skills/voice-gen/scripts/voice.py
```

Options:
- `--text "<text>"` — required (the words to speak).
- `--voice <id>` — ElevenLabs voice id (default `21m00Tcm4TlvDq8ikWAM`, "Rachel").
  Use `--list-voices` to discover others.
- `--model <id>` — ElevenLabs model (default `eleven_multilingual_v2`).
- `--out <path>` — output (default `outputs/voice-<timestamp>.mp3`).

Prints `{"path": "...", "voice": "...", "model": "..."}` and a one-line summary.

## Podcast pattern

1. Write the script as alternating lines per speaker.
2. Synthesize each line/segment with that speaker's `--voice` into its own file.
3. Concatenate in order with `ffmpeg` (add music beds from the music-gen skill).
4. Report the final stitched file's path.
