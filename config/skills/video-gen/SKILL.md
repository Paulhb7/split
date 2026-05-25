---
name: video-gen
description: Generate short videos with Kling (via fal.ai) from a text prompt, or animate a still image (image-to-video). Use when an expert needs to produce a video clip, an animation, a teaser, or a shot for a film.
---

# Video generation — Kling (via fal.ai)

Generate a video clip with Kling and get back a local `.mp4`. The model and
endpoint are fal's; this skill calls fal's queue API directly.

## Auth

Needs the `FAL_KEY` environment variable (Split bar's **Keys** panel, or the
project `.env`). If missing, the script prints exactly how to fix it (create a
fal account at https://fal.ai, copy a key from the dashboard). Do not ask the
user to paste it in chat.

## Run

The script is stdlib-only — no install. Run it with `python3` from your
workspace; the skill is mounted under `.claude/skills/` (Claude) or
`.agents/skills/` (other harnesses):

```bash
python3 .claude/skills/video-gen/scripts/video.py --prompt "<scene>" [options]
# non-Claude harness: .agents/skills/video-gen/scripts/video.py
```

Options:
- `--prompt "<text>"` — required for text-to-video.
- `--image <url>` — animate a still image instead (image-to-video). The URL must
  be publicly reachable (Kling-on-fal fetches it).
- `--duration <5|10>` — clip length in seconds (default 5).
- `--model <id>` — override the fal model id (default a Kling text-to-video
  model; image mode auto-switches to the Kling image-to-video model).
- `--out <path>` — output file (default `outputs/video-<timestamp>.mp4`).

The script submits the job, polls until it is ready (video can take minutes),
downloads the result, and prints a JSON line `{"path": "...", "model": "...",
"seconds": N}` plus a one-line summary. Report the absolute path to the user;
tool-capable experts can then open or attach it.

## Notes

- One clip per call. For a multi-shot film, generate shots separately and stitch
  them (e.g. with `ffmpeg` via Bash) — keep prompts consistent for continuity.
- Cost is real (fal bills per generation). Generate deliberately; don't loop.
