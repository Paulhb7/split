---
name: ui-ux-pro-max
description: A searchable design-intelligence database for any UI/UX work — 161 color palettes by product type, 67 UI styles (glassmorphism, brutalism, minimalism, neumorphism, bento, dark mode, etc.), 57 Google Fonts pairings, 99 UX guidelines with do/don't pairs, 25 chart types, and stack-specific guidance for 15+ frameworks (React, Next.js, Vue, Svelte, Astro, SwiftUI, React Native, Flutter, Jetpack Compose, Three.js, Laravel, html-tailwind, shadcn/ui). Use whenever you need to look up a palette, a style, a font pair, a UX best practice, or stack-specific patterns — for landing pages, dashboards, mobile apps, web apps, components, or design reviews. Queries via `python3 scripts/search.py "<query>" --domain <domain>`. Python 3 only, zero external dependencies, keyless.
---

<!--
Vendored from github.com/nextlevelbuilder/ui-ux-pro-max-skill (MIT,
© NextLevelBuilder). Only the runtime parts are copied: `data/` (CSV
databases) + `scripts/` (BM25 search engine). The upstream CLI and
template-generation are dropped — we wrote our own SKILL.md.

This SKILL.md is rewritten for Split to add one rule that doesn't exist
upstream: when working *inside* Split's own design system (slide decks
shipped by Consultant / Financier, dashboards, the Designer's default
brand kits), `split-default` and the `frontend-slides`/`dashboard`
preset rules **win** over recommendations from this skill. Treat this
skill as a queryable reference, not a prescriptive default.
-->

# UI/UX Pro Max — design intelligence

A queryable knowledge base of UI/UX recommendations. Hand it a query and
a domain, get back ranked, structured results from a curated CSV
database. No LLM hallucination — every result is a real entry an
designer authored, with do/don't pairs, code snippets, and source notes.

Use this skill when:
- Picking a **color palette** for a specific product type (fintech, SaaS,
  e-commerce, healthcare, portfolio, AI tool, etc.)
- Choosing a **UI style** (glassmorphism, brutalism, minimalism, bento,
  dark mode, …) and getting the AI prompts + CSS keywords to apply it
- Pairing **typography** from Google Fonts with import strings
- Looking up **UX best practices** with do/don't + code examples
- Picking a **chart type** for a specific data shape with a library
  recommendation
- Getting **stack-specific patterns** (React perf tips, SwiftUI
  navigation, Vue composition, …)
- **Reviewing existing UI** for accessibility, performance, or layout
  issues

## When this skill DOES NOT decide — Split discipline anchor

Split has its own house design system. When the user is working *inside*
that system, **do not let this skill override the house style.**

| Context | Authority |
| --- | --- |
| Slide decks shipped by Consultant / Financier / Designer | `frontend-slides` + `split-default` preset (or the user-named preset from the bold-template-pack). This skill is a side reference, not the source of truth. |
| Dashboards from Data Analyst / Financier | `dashboard` skill with `split-default` or `terminal` preset. This skill is a side reference for chart vocabulary only. |
| Static graphics (posters, social, banners) | `frontend-slides` rendered to a fixed-dimension frame. This skill suggests style ideas but the house preset rules win. |
| Brand identities (Designer's brand kit) | The Designer's moodboard workflow (Stage 1). This skill can populate the moodboard with palette options, but the final system is hand-built. |
| Brand-adapted Stock Pitch deck | The analyzed company's brand color comes from the company's brand guidelines (their live site), not from this skill. |
| **Anything else** (Q's landing pages, ad-hoc UI mockups, mobile apps, third-party brand work, design reviews) | This skill is fully in-scope. Use it freely. |

The rule of thumb: **inside Split-owned design systems**, this skill
informs but does not decide. **Outside** (client work, third-party
brands, ad-hoc requests), it's the primary design reference.

## Prerequisites

Python 3.x. **Zero external dependencies** — the search engine is pure
stdlib + the CSV files shipped in `data/`.

```bash
python3 --version    # 3.9+ recommended
```

## How to query

```bash
python3 scripts/search.py "<query>" --domain <domain> [-n <max_results>]
```

### Domains

| `--domain` | What it returns | Source CSV |
| --- | --- | --- |
| `product` | Product-type recommendations (SaaS / e-commerce / portfolio / healthcare / fintech / etc.) | `data/products.csv` |
| `style` | UI styles with AI prompts and CSS keywords (glassmorphism, brutalism, …) | `data/styles.csv` |
| `color` | Color palettes by product type, full token sets | `data/colors.csv` |
| `typography` | Font pairings with Google Fonts import strings | `data/typography.csv` |
| `ux` | UX best practices with do/don't + code examples | `data/ux-guidelines.csv` |
| `chart` | Chart types + library recommendations | `data/charts.csv` |
| `landing` | Landing-page structure + CTA strategies | `data/landing.csv` |
| `icons` | Icon libraries and usage patterns | `data/icons.csv` |
| `design` | General design rules (reasoning index) | `data/design.csv` |

Omit `--domain` to let the script auto-detect from the query.

### Stack search

```bash
python3 scripts/search.py "<query>" --stack <stack>
```

Available stacks: `html-tailwind` (default), `react`, `nextjs`, `vue`,
`nuxtjs`, `astro`, `svelte`, `swiftui`, `react-native`, `flutter`,
`jetpack-compose`, `threejs`, `laravel`. Stack files under
`data/stacks/<stack>.csv`.

### Quick recipes

```bash
# Color palette for a fintech app
python3 scripts/search.py "fintech professional" --domain color -n 3

# UX best practice for a pricing page
python3 scripts/search.py "pricing page conversion" --domain ux -n 5

# A UI style fitting a portfolio
python3 scripts/search.py "minimalism portfolio" --domain style

# React performance pattern
python3 scripts/search.py "list virtualization" --stack react

# Font pairing for a SaaS landing
python3 scripts/search.py "modern saas" --domain typography -n 2
```

## How to use the results

Each result is structured (key/value bullets in markdown). The agent
should:

1. **Read 2-3 results, not 1.** A single match might be wrong; the
   ranked list is meant to be compared.
2. **Cite the entry** when you use it: `"applied UI Pro Max color
   palette: Fintech/Crypto (gold + purple)"`. The boss should know
   where a choice came from.
3. **Don't blindly copy.** The palettes/styles are starting points;
   adapt to the specific brand + audience. Especially for color: a
   palette tagged "B2B SaaS" might still need warmer tones for a
   community-focused product.
4. **Combine across domains.** A landing page = `landing` (structure) +
   `color` (palette) + `typography` (pair) + `ux` (CTA best practices)
   + `style` (visual tone). Run multiple searches, then synthesize.

## When to NOT use this skill

- When `split-default` or another Split-owned preset is the right
  answer (see discipline anchor above).
- For brand-adapted decks where the brand color comes from the
  analyzed company's actual guidelines.
- When the user has given a specific design reference (a URL, a Figma,
  a brand kit) — read that, don't override it with a generic database
  match.
- When you only need one well-known thing (e.g. "what's a hover state"
  — you already know).

## Output discipline

- When you query this skill, **mention it in the deliverable's source
  trail** — same as you'd cite a primary source. e.g., in a slide
  footer or memo Sources section: `Design references: UI Pro Max color
  palettes (style: minimalism, palette: SaaS B2B)`.
- Treat the recommendations as **inspiration ranked by relevance**, not
  as binding rules. The agent's design judgment remains the final
  arbiter.
