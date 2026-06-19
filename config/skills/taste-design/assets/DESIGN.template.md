# DESIGN.md — <project name>

> **Brief.** This file is the design contract for **<project>**. It exists
> so every screen, slide, and component shares one taste. Audience:
> <who>. Use it by reading it before you generate anything, and by running
> `taste-design`'s auditor against the result. Assumed defaults: <one line
> — what you picked when the brief was silent>.
>
> Sources: <ui-ux-pro-max entries / reference brands / URLs that anchored
> this — or "none, authored from brief">.

## 1. Atmosphere — the three dials

| Dial | Value (1–10) | What it means here |
| --- | --- | --- |
| **Density** | _e.g. 4_ | <airy / balanced / cockpit — and why> |
| **Variance** | _e.g. 6_ | <symmetric → editorial; >4 means no centered hero> |
| **Motion** | _e.g. 3_ | <restrained → cinematic; the motion budget> |

One sentence on the overall feeling: _"<e.g. quiet editorial confidence,
not startup-loud>"_.

## 2. Color — roles, not swatches

Every color has a functional role and a hex. One accent max, sat < ~80%.
No `#000000`. No AI-purple/neon gradient.

| Role | Hex | Use |
| --- | --- | --- |
| `--c-ink` | `#0a0a0b` | primary text (near-black, not pure) |
| `--c-surface` | `#…` | page background |
| `--c-surface-2` | `#…` | raised panels / cards |
| `--c-line` | `#…` | borders / dividers |
| `--c-muted` | `#…` | secondary text |
| `--c-primary` | `#…` | the brand / one accent |
| `--c-accent` *(optional)* | `#…` | rare emphasis only |
| `--c-positive` / `--c-negative` | `#…` / `#…` | semantic states |

Dark/light: <which is canonical; how the other is derived>.

## 3. Typography — chosen voices

No Inter / Roboto / Arial / system fonts for premium contexts.

| Slot | Face | Source | Notes |
| --- | --- | --- | --- |
| Display | _e.g. Cabinet Grotesk_ | Fontshare | headings, hero |
| Body | _e.g. Geist_ | Google/Vercel | ≤ 65 ch/line, relaxed leading |
| Mono | _e.g. Geist Mono_ | — | numerals when density > 7, code |

**Type scale (px / weight):**

| Token | Size | Weight | Line-height |
| --- | --- | --- | --- |
| display | 64 | 600 | 1.05 |
| h1 | 40 | 600 | 1.1 |
| h2 | 28 | 600 | 1.2 |
| lead | 20 | 400 | 1.5 |
| body | 16 | 400 | 1.6 |
| caption | 13 | 500 | 1.4 |

## 4. Layout & spacing

- Spacing scale: `4 · 8 · 16 · 24 · 40 · 64 · 96 · 120`.
- Every element owns a clear zone — no overlap, no overflow, no scroll
  traps.
- Variance > 4 → break the symmetric grid; no three-equal-card row, no
  centered hero.
- Mobile: collapse below 768px, no horizontal scroll, hit targets ≥ 44px,
  full height via `100dvh` (never `h-screen`).

## 5. Motion budget

- Animate `transform` / `opacity` only. Spring ≈ stiffness 100 / damping
  20.
- Signature moment(s): <e.g. one staggered page-load cascade>.
- Always honor `prefers-reduced-motion`.

## 6. Anti-patterns — never, in this project

Start from `taste-design/references/checklist.md`, then add the
project-specific bans:

- No `#000000`, no AI-purple/blue-neon gradients, no Inter/Roboto/Arial.
- No fabricated metrics, no AI copy clichés (Elevate / Seamless /
  Unleash / Supercharge / Scroll to explore), no filler chevrons.
- No broken image links — use generated imagery, `picsum.photos`, or SVG.
- _<project-specific: e.g. "no stock-photo people", "no parent-brand
  blue", "no emoji outside the chat surface">._

## 7. Components (optional, fill as the system grows)

Button / input / card / nav / modal — states (default, hover, active,
focus, disabled), and the empty / loading / error states each surface
must design beyond the happy path.
