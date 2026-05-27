---
name: web-deploy
description: Take a folder of static web files (HTML/CSS/JS, single-file or multi-file) and turn it into a public URL the user can share. Three modes — preview (instant ephemeral tunnel, zero account), share (permanent URL via surge.sh, email only), pro (user's own Cloudflare / Vercel / Netlify account). Use whenever a builder/engineer expert ships a landing page, micro-app, prototype, or HTML demo and the user wants to look at it on their phone, send a link to a friend, or put it online.
---

# Web Deploy

Ship a folder to a public URL. **Three modes**, picked by how much friction
the user can take and how long the URL needs to live.

| Mode      | URL lives                | User account?              | Run as           |
| --------- | ------------------------ | -------------------------- | ---------------- |
| `preview` | While Split session is on | **None**                   | `scripts/preview.sh <dir>` |
| `share`   | Permanent                | Email only (no password validation) | `scripts/share.sh <dir> [subdomain]` |
| `pro`     | Permanent, custom domain | Full account (Cloudflare / Vercel / Netlify) | Native CLI       |

## Picking the mode

Listen to the user's intent — don't ask them which mode unless ambiguous:

- *"show me on my phone"*, *"let me see it on my tel"*, *"can I open this on
  mobile?"*, *"quick preview"* → **`preview`**
- *"send me a link"*, *"put it online"*, *"share with a friend"*, *"post on
  Twitter"* → **`share`**
- *"deploy to my domain"*, *"I have a Cloudflare/Vercel/Netlify account"*,
  *"production"* → **`pro`**

If genuinely ambiguous, propose `preview` first (it's free, instant, zero
account) — once the user sees it works they'll tell you if they want it
permanent.

---

## Mode 1 — `preview` (ephemeral, zero account)

Uses **Cloudflare Quick Tunnel** (`cloudflared tunnel --url ...`). Free,
no account, no signup, no credit card. URL lives as long as the local
server + tunnel process stay up — i.e. as long as the Split session is
alive. Perfect for *"open it on my phone"*.

### Prereqs

`cloudflared` must be installed:

```bash
brew install cloudflared    # macOS
```

If missing, the script prints exactly this hint and exits — do not try to
install it silently.

### Run

```bash
bash .claude/skills/web-deploy/scripts/preview.sh <dir>
# non-Claude harness: .agents/skills/web-deploy/scripts/preview.sh
```

The script:
1. Picks a free localhost port.
2. Starts `python3 -m http.server <port>` in `<dir>` (background).
3. Runs `cloudflared tunnel --url http://localhost:<port>` (background).
4. Waits for `cloudflared` to print its `https://*.trycloudflare.com` URL.
5. Prints `{"url": "...", "server_pid": ..., "tunnel_pid": ...}` and exits.

Both background processes keep running. Report the URL to the user as a
clickable line: *"Live here: https://magic-fox-9k2.trycloudflare.com — open
on your phone, share with anyone. Dies when you close Split."*

### Stopping

`kill <server_pid> <tunnel_pid>` — but most users don't bother, the
session-end cleanup catches them.

---

## Mode 2 — `share` (permanent URL, email only)

Uses **surge.sh**. First time, surge asks for an email + a password (no
validation, no email confirmation — you can invent both in 5 seconds).
After that the URL is **permanent and free**, with HTTPS, custom subdomains
under `*.surge.sh`, and unlimited deploys.

### Prereqs

```bash
npm install -g surge        # one-time
```

### Run

```bash
bash .claude/skills/web-deploy/scripts/share.sh <dir> [subdomain]
```

- `<dir>` — folder to ship (must contain an `index.html`).
- `[subdomain]` — optional. If omitted, surge picks a random one. Pass e.g.
  `paul-todolist` and the URL becomes `paul-todolist.surge.sh`.

The script:
1. Checks `index.html` exists in `<dir>` (surge requires it).
2. Runs `surge <dir> <subdomain>.surge.sh` (or random).
3. On first use, surge prompts for email + password **in the terminal** —
   warn the user upfront so they're not surprised.
4. Prints `{"url": "https://<sub>.surge.sh"}`.

### What "no account" really means here

Surge stores credentials in `~/.netrc` after the first run. The user types
an email + an invented password once and never sees the prompt again.
There is **no email verification step** — surge trusts whatever you type.
This is the lowest-friction permanent hosting that exists publicly.

---

## Mode 3 — `pro` (user's own account, production)

When the user has — or wants — a real account on a real provider. Pick
the right CLI for what they tell you:

### Cloudflare Pages (recommended default for `pro`)

```bash
npx wrangler pages deploy <dir> --project-name=<name>
```

- Free tier: 500 builds/month, unlimited bandwidth, unlimited requests.
- First run prompts a browser login to Cloudflare.
- Best for static sites + lightweight Functions (edge SSR).

### Vercel

```bash
npx vercel --prod <dir>
```

- Free hobby tier, ultra-fast for Next.js projects.
- Strict ToS on commercial use of the free tier — flag this to the user
  if their app looks revenue-generating.

### Netlify

```bash
npx netlify deploy --prod --dir=<dir>
```

- Free starter tier.
- Equivalent to Vercel in capability.

### GitHub Pages

If the user already has a GitHub repo for the project:

```bash
gh repo create <name> --public --source=<dir> --push
gh api -X POST repos/:owner/<name>/pages -f source[branch]=main
```

Static only, slower propagation, but zero hosting cost ever.

---

## What the script does NOT do

- It does not pick the mode for you — read the user's intent and pick.
- It does not push to git, version, or back up the folder. Use the shell
  for that if needed.
- It does not provide a Split-hosted `split-apps.dev` mode **yet**. That
  backend is on the roadmap (R2 + Worker + TTL) but not live; today
  `share` (surge) is the lowest-friction permanent option.

## After the deploy — opening the URL

**The script already opens the URL in the user's default system browser
(`open` on macOS, `xdg-open` on Linux).** This is the only safe way to
surface a deployed app — rendering it inside Split's Tauri webview
crashes the desktop app.

**What the agent must do:**

- Report the URL as **plain text or a plain markdown link**:
  `Live here: https://magic-fox-9k2.trycloudflare.com` — that's it.
- Trust the script to have opened the browser. Don't try to open it
  yourself, don't call any "preview" / "view URL" / "browser" tool the
  harness may expose for this purpose.

**What the agent must NOT do** (these all crash Split or break the UX):

- Do **not** embed the URL in an `<iframe>` in any message or output
  file.
- Do **not** wrap the URL in any HTML that the harness might intercept
  and render in-window (an `<a target="_blank">` is fine in a delivered
  file the user opens later, **not** as the immediate response).
- Do **not** call a harness "open URL" / "browser preview" / "webview"
  tool — those route through Split's Tauri webview and crash it.
- Do **not** screenshot, preview-render, or otherwise try to "show" the
  deployed page in chat. The whole point of deploying is the URL.

After printing the URL, tell the user once:

- For `preview`: how long it lives (Split session ends → URL dies), and
  that it works on any device on any network, *not* just LAN.
- For `share`: it's permanent and free, re-deploying with the same
  subdomain updates the site in place.
- For `pro`: the provider's dashboard URL so the user can manage it.

One line per item, then stop. The browser is already open on their
screen — the user wants the link, not a deployment manual.
