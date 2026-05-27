---
name: web-deploy
description: Take a folder of static web files (HTML/CSS/JS, single-file or multi-file) and turn it into a permanent public URL the user can share. Uses surge.sh — free, email-only signup (no validation), permanent URLs at `<slug>.surge.sh`. Use whenever a builder/engineer expert ships a landing page, micro-app, prototype, or HTML demo and the user wants to send a link to a friend, post on Twitter, or open it on their phone.
---

# Web Deploy

Ship a folder to a permanent public URL via **surge.sh**.

## Why surge

- **Free, no credit card, no domain to buy.**
- **Email-only signup** (no validation, no email confirmation — invent any
  password the first time).
- **Permanent URLs** at `<slug>.surge.sh` with HTTPS.
- **Unlimited deploys, unlimited bandwidth.**
- **Re-deploy with the same slug updates the site in place.**

No other provider is supported by this skill. If the user explicitly wants
their own Cloudflare / Vercel / Netlify / GitHub Pages account, route them
out of this skill and into the relevant native CLI directly — that's a
"you own it" flow, not a Split flow.

## Prereqs

```bash
npm install -g surge        # one-time
```

If `surge` is not on PATH the script prints exactly this hint and exits.

## Run

```bash
bash .claude/skills/web-deploy/scripts/share.sh <dir> [subdomain]
# non-Claude harness: .agents/skills/web-deploy/scripts/share.sh
```

- `<dir>` — folder to ship. **Must contain an `index.html`.**
- `[subdomain]` — optional kebab-case slug. If omitted, surge picks a random
  one. Pass e.g. `paul-todolist` and the URL becomes `paul-todolist.surge.sh`.

The script:
1. Checks `index.html` exists in `<dir>` (surge requires it).
2. Runs `surge <dir> <subdomain>.surge.sh` (or random subdomain).
3. On first use, surge prompts for email + password **in the terminal** —
   warn the user upfront so they're not surprised.
4. Prints `{"url": "https://<sub>.surge.sh"}` and opens the URL in the
   user's default system browser.

## Picking a slug

The slug is the user-visible URL. Make it readable:

- For a deck → `<topic>-deck-<date>` (e.g. `fintech-pitch-26may`)
- For an app → `<verb>-<noun>` (e.g. `count-down-to-wedding`)
- For a brand kit → `<brand>-kit` (e.g. `acme-brand`)
- For a dashboard → `<topic>-dashboard` (e.g. `sales-q1-dashboard`)

Avoid: `test`, `demo`, `<your-name>1`, anything generic. The URL travels
with the artifact — make it look intentional.

## What about a single-file `index.html`?

surge needs a folder, not a single file. If the user's artifact is one HTML
file, copy it into a slug-named folder first:

```bash
mkdir -p /tmp/<slug>
cp <single.html> /tmp/<slug>/index.html
bash share.sh /tmp/<slug> <slug>
```

## First-time surge prompt

The very first deploy on a fresh Mac prompts in the terminal for:
- An email address (real or invented — no verification)
- A password (invented — no validation)

After that, surge stores credentials in `~/.netrc` and never prompts again.
**Warn the user upfront** so they don't think the agent is asking for *their*
account — they're inventing a fresh one in 5 seconds.

## After the deploy — opening the URL

**The script already opens the URL in the user's default system browser
(`open` on macOS, `xdg-open` on Linux).** This is the only safe way to
surface a deployed app — rendering it inside Split's Tauri webview crashes
the desktop app.

**What the agent must do:**

- Report the URL as **plain text or a plain markdown link**:
  `Live here: https://paul-todolist.surge.sh` — that's it.
- Trust the script to have opened the browser. Don't try to open it
  yourself, don't call any "preview" / "view URL" / "browser" tool the
  harness may expose for this purpose.

**What the agent must NOT do** (these all crash Split or break the UX):

- Do **not** embed the URL in an `<iframe>` in any message or output file.
- Do **not** wrap the URL in any HTML that the harness might intercept
  and render in-window (an `<a target="_blank">` is fine in a delivered
  file the user opens later, **not** as the immediate response).
- Do **not** call a harness "open URL" / "browser preview" / "webview"
  tool — those route through Split's Tauri webview and crash it.
- Do **not** screenshot, preview-render, or otherwise try to "show" the
  deployed page in chat. The whole point of deploying is the URL.

## After the URL is live — tell the user once

- The URL is **permanent** and **free**, with HTTPS.
- Re-deploying with the same slug **updates** the site in place — they can
  iterate without changing the link they shared.
- They can `surge teardown <slug>.surge.sh` to delete it if they want it
  gone.

One short line covering this, then stop. The user wants the link, not a
manual.
