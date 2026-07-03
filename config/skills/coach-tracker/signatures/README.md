# Coach Tracker — Dashboard Signatures

The `coach-tracker` skill says **each coach's dashboard must have a
defining visual signature, not a generic SaaS card-grid**. This folder
holds the five signatures available to the four coaches. Each `<slug>.md`
is a self-contained design doc with typo / color / widgets / motion
rules and an ASCII preview.

## How this folder works

- **Each coach's persona names its default signature.** Read the
  persona; it tells you which one to render.
- **Read only the signature you're using.** Don't read the others — the
  files are written to stand alone, and reading them all dilutes the
  brief.
- **The boss can override.** If the boss asks for "a cockpit-style
  tracker for my GMAT prep", or "use the lab-report look for the
  marathon", that's a valid cross-coach pick. Read the named signature,
  render against it.
- **Mixing is allowed when the goal calls for it** — e.g., a wedding-
  prep block that's part Sport (Scoreboard) + part Diet (Lab Report)
  may render one signature on the Sport-owned tracker and another on
  the Diet-owned co-owned section. Don't blend two signatures inside
  one tracker — that loses both identities.

## The five signatures

| Slug | Name | Default for | One-line |
|---|---|---|---|
| [`scoreboard`](scoreboard.md) | Scoreboard / Race bib | training (race builds) | Condensed display, race-bib day-number, stadium accent. |
| [`cockpit`](cockpit.md) | Cockpit / Tech-watch | training (strength, HR/zone) | Mono numbers, SVG activity ring with Z1-Z5 arcs. |
| [`lab-report`](lab-report.md) | Lab Report / clinical panel | nutrition | Clinical serif + mono, vitals panel, hairline rules. |
| [`coursepack`](coursepack.md) | Syllabus / Coursepack | learning | Serif body, §-section numbering, ✓/◯ margin marks. |
| [`service-ticket`](service-ticket.md) | Mise-en-place / Service Ticket | cooking | Editorial serif + italic notes, numbered ticket. |

## When to add a new signature

A new signature earns its place when:

- A coach (existing or new) has a domain whose visual register isn't
  covered by the five above (e.g., a `coach_finance` might want a
  Bloomberg-terminal signature).
- A coach wants a second mode for a distinct sub-domain (Sport has two
  — Scoreboard for races, Cockpit for HR/zone work — because they're
  genuinely different vibes).

A new signature does NOT earn its place by being "another version of"
an existing one. If the difference is just palette or a font swap,
that's a variant, not a signature — keep it in the existing file.

## When you're rendering

1. Read the persona to learn the default signature slug.
2. Open `signatures/<slug>.md`.
3. Render the dashboard against its rules. The `coach-tracker/SKILL.md`
   still governs the rest (3-section layout, localStorage namespacing,
   exec-summary, stay-local).
4. Do NOT redeclare the signature's rules in the dashboard's CSS
   comments. If a future reader wants to know the rules, they read this
   folder.
