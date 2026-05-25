---
name: slide-deck
description: Turn researched content into a self-contained reveal.js HTML slide deck. Use when the user asks for slides, a deck, or a presentation.
---

# slide-deck

Produce a single self-contained HTML file using reveal.js from a CDN — no
installs, no build step.

## Structure

- **Title slide** — the topic plus a one-line subtitle.
- **One idea per slide** — a short title + 3-5 bullets, OR one big number, OR one
  quote. Vary the slide types; don't make every slide a bullet list.
- **Sources slide** (last) — every citation, numbered and linked.

## Rules

- Everything inline in one `.html` file; pull reveal.js `<link>`/`<script>` from
  `cdn.jsdelivr.net`. No external asset files.
- Save to `~/Desktop` using a slug of the topic
  (e.g. `~/Desktop/ev-market-2026.html`) unless the user names a path.
- After writing, report the absolute path and offer to open it (`open <path>`);
  only run `open` if the user agrees.
