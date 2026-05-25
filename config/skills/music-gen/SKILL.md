---
name: music-gen
description: Generate music or audio tracks from a text prompt (via fal.ai). Use when an expert needs an original song, a backing track, a score, or sound for a video/podcast.
---

# Music generation (via fal.ai)

Generate a track from a text description and get back a local audio file.

## Auth

Needs `FAL_KEY` in the environment (Split bar's **Keys** panel, or the project
`.env`). If missing, the script prints how to fix it (fal account at
https://fal.ai → copy a key). Never ask for the key in chat.

## Run

The script is stdlib-only — no install. Run it with `python3` from your
workspace; the skill is mounted under `.claude/skills/` (Claude) or
`.agents/skills/` (other harnesses):

```bash
python3 .claude/skills/music-gen/scripts/music.py --prompt "<style/mood>" [options]
# non-Claude harness: .agents/skills/music-gen/scripts/music.py
```

Options:
- `--prompt "<text>"` — required. Describe genre, mood, instruments, tempo.
- `--lyrics "<text>"` — optional lyrics (passed through when the model supports it).
- `--model <id>` — override the fal model (default `fal-ai/minimax-music/v2.6`;
  `fal-ai/stable-audio-25/text-to-audio` is a good instrumental alternative).
- `--out <path>` — output (default `outputs/music-<timestamp>.mp3`).

Prints `{"path": "...", "model": "..."}` and a one-line summary. Report the path.

## Notes

- One track per call; fal bills per generation, so generate deliberately.
- For a video score, generate the track, then mux it with `ffmpeg` via Bash.
