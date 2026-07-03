---
slug: service-ticket
name: Mise-en-place / Service Ticket
tagline: Chef's service ticket — editorial serif + italic notes, numbered ticket header, mise-en-place checklist, cream paper.
mood: warm, editorial, hospitable, hands-on
references: Bon Appétit, Le Creuset booklets, Diana Henry cookbooks, brigade prep cards, brasserie menus
default_for: cooking (any multi-week cooking journey or menu)
also_consider_for: a hospitality / event-prep tracker
palette: cream paper + ink + one warm accent (paprika, saffron, or bordeaux)
---

# Mise-en-place / Service Ticket

The chef's dashboard. Reads as a service ticket pinned at the pass +
the chef's personal carnet. Numbered tickets, italic tasting notes,
mise-en-place as a real prep checklist.

## Preview

```
┌── 03  DASHBOARD ────────────────────────────┐
│                                              │
│    No 042 — service du mardi 09 juin         │
│    ──────────────────────────────────────    │
│                                              │
│    AU MENU CE SOIR                           │
│       Poireaux vinaigrette · œuf mollet      │
│       Risotto champignons · parmesan         │
│                                              │
│    Mise en place                             │
│       □  3 poireaux, blanchis 8'             │
│       □  1 échalote ciselée                  │
│       □  Arborio 200g, bouillon 800ml        │
│       □  Champignons paris, sautés           │
│       □  Parmigiano râpé 60g                 │
│                                              │
│    Service · 19h30  ·  ~45 min               │
│       [  J'ai cuisiné ✓  ]                   │
│                                              │
│    ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌    │
│                                              │
│    CARNET — recettes faites                  │
│       Risotto                      ★★★★☆     │
│         "trop liquide, baisser fond"         │
│       Tarte tatin                  ★★★★★     │
│       Pâte feuilletée maison       ★★★☆☆     │
│                                              │
│    TECHNIQUES TRAVAILLÉES        7 / 24      │
│       ■ Émulsion       ■ Bouillon            │
│       ■ Braisage       □ Pâte feuilletée…    │
│                                              │
│    CETTE SEMAINE  ●●●●○○○  4 services        │
└──────────────────────────────────────────────┘
```

## Type

- **Headlines** (recipe names, ticket number): editorial serif —
  `Fraunces`, `Tiempos Headline`, `GT Sectra`, `Domaine Display`.
  Heavy weight, sometimes italic.
- **Body** (mise-en-place lines, menu items): a precise neutral sans —
  `Inter Tight`, `Geist`. Tight tracking.
- **Italic** (tasting notes in the carnet): the serif in italic, like
  a chef's handwritten remark. NEVER use a "handwriting" display font
  — that reads cheap.
- **Section labels** (`AU MENU`, `CARNET`, `TECHNIQUES TRAVAILLÉES`):
  small-caps sans with loose tracking.

## Today (the hero)

- **Ticket header**: serif italic title — `No 042 — service du mardi
  09 juin` — followed by a hairline rule. The number sets the ticket
  identity.
- **Menu block** (`AU MENU CE SOIR`): 2-3 dishes as menu lines, dot-
  separated entrée components (`Poireaux vinaigrette · œuf mollet`).
  Indented from the section label.
- **Mise en place**: a real prep checklist — `□` square checkbox, then
  quantity + ingredient + prep note (`3 poireaux, blanchis 8'`).
  Indented, monospace-quantity-aligned if possible.
- **Service**: time + estimated duration on one line, then a single
  CTA below — `[ J'ai cuisiné ✓ ]`.

## Color

- **Background**: cream paper (`#f4ede0`, `#efe5d2`). Real ink-on-paper
  feel.
- **Ink**: warm near-black (`#2a1f15`, `#1a1612`). Never pure black.
- **Accent**: ONE warm color — paprika (`#c84a1a`), saffron (`#d4a017`),
  or bordeaux (`#7a2a2a`). Used sparingly: the ticket number, the CTA,
  filled-square techniques, star ratings.
- **Muted**: warm taupe (`#8a7a65`) for secondary text and notes.
- **NEVER**: beige-on-beige (no contrast); pure white (kills the
  warmth); cool grays (kills the warmth).

## Widgets

- **Mise-en-place**: real square checkboxes (`□` → `■`), not radio
  buttons or `✓/◯` margin marks. The chef ticks ingredients as they're
  prepped.
- **Carnet (made-log)**: dated entries — recipe name in serif (left),
  star rating right-aligned in the accent. Below each entry, the
  boss's note in **italic serif**, indented, in muted ink. Hairline
  rule between entries.
- **Techniques travaillées**: a filled-square checklist (`■ Émulsion
  ■ Bouillon □ Pâte feuilletée`), two-column. Small `n / total` at
  the section header. NOT a percentage bar, NOT a grid heatmap.
- **Streak / weekly**: a quiet inline counter at the bottom (`CETTE
  SEMAINE ●●●●○○○ 4 services`). Not its own card, just a line.

## Layout

- **Section dividers**: dotted hairlines (`╌╌╌╌╌╌╌`) between the
  ticket and the carnet — like the perforated tear-line on a real
  service slip.
- **Indentation**: section labels flush-left, content indented ~24px.
  Makes the artifact feel like a typed-up menu, not a form.

## Motion

- Checkbox: `□` → `■` with a brief ink-fill animation (200ms).
- Star rating reveal: a one-shot stagger when an entry is added (4
  stars, 60ms apart).
- No ambient motion. The kitchen is busy enough.

## Things to avoid

- Emoji for ingredients (🥕, 🧅, 🍅). The typography carries the
  warmth — emoji breaks the register.
- A "handwritten" display font for the notes. Use serif italic.
- Cards with shadows. The artifact is a printed ticket, not a UI.
- A grid of recipe cards with photos. Cooking-coach is text-first; if
  the boss wants photos, they can hand off to @Engineer.
- Star ratings filled in yellow. Use the warm accent.
