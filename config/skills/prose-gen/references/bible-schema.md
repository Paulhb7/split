# Bible schema

The bible is the book's memory. Two registers: **hard facts in JSON**
(grep-able, never drift) and **soft character in markdown** (voice, desire,
arc — the stuff that's prose, not data). Keep them separate; that split is
the whole point.

## `bible/canon.json` — the facts ledger

The single source of truth for anything a later chapter could contradict.
Read it in Pass 0, append to it in Pass 3, **never silently rewrite an
existing value** — a changed canon fact is a conversation with the boss.

```json
{
  "title": "The Moor Between",
  "characters": {
    "elias": {
      "full_name": "Elias Varga",
      "immutable": {
        "eyes": "grey",
        "hair": "black, greying at the temples",
        "build": "tall, narrow-shouldered",
        "marks": "burn scar, left forearm, wrist to elbow",
        "age_at_open": 47,
        "accent": "clipped Yorkshire, softened by twenty years in London"
      },
      "face_ref": "bible/faces/elias.png",
      "face_prompt": "portrait, grey eyes, black hair greying at the temples, tall narrow build, burn scar left forearm, mid-forties, 1840s dress, overcast north-England light",
      "soul_ref": "soul_8f3c… (higgsfield-soul-id; reuse via --soul-id for drift-free re-generation)"
    }
  },
  "places": {
    "the_parsonage": {
      "immutable": {
        "where": "edge of the Yorkshire moor, two miles from the village",
        "rooms": 7,
        "era": "1843",
        "fixed_detail": "a cracked sundial in the kitchen garden, north-facing"
      }
    }
  },
  "world_rules": [
    "no one crosses the moor after dark — a village rule, not a law of nature",
    "letters take four days to London"
  ],
  "timeline": [
    { "event": "the fire that scarred Elias", "story_time": "1819", "revealed_in": "ch. 6" },
    { "event": "Margaret arrives at the parsonage", "story_time": "1843, March", "revealed_in": "ch. 1" }
  ]
}
```

Rules:
- **`immutable` holds only facts a reader could catch you contradicting** —
  appearance, age, fixed physical detail, hard world-rules. Not mood, not
  opinion, not anything that legitimately changes.
- **`timeline` separates `story_time` from `revealed_in`.** When something
  *happened* vs when the *reader learns it* are different axes — track both
  so a flashback doesn't accidentally spoil a later reveal.
- For a fantasy/SF world, `world_rules` is load-bearing: the cost of magic,
  what the technology can't do. Break one and the book loses the reader.

## `bible/characters.md` — the soft sheets

One section per character. The facts live in `canon.json`; this is
everything that's prose:

```markdown
## Elias Varga
- **Desire (spoken):** to sell the parsonage and be gone by autumn.
- **Desire (real):** to be forgiven by a brother who is already dead.
- **Contradiction:** preaches forbearance; cannot forgive himself.
- **Voice:** short declaratives, biblical cadence under stress, never
  swears, deflects feeling into weather talk.
- **Arc:** closed fist → open hand. Pivots in ch. 14 when Margaret reads
  the letter aloud.
- **Status:** see `spine.md` for where he stands *now*.
```

Keep `Status` out of here — running state lives in `spine.md` so there's
exactly one place to read "where are we".

## `bible/places.md` — location dossiers

Sensory, not factual (facts are in `canon.json`):

```markdown
## The parsonage kitchen
- **Light:** north window, never direct sun; tallow-yellow by evening.
- **Smell:** cold ash, lavender from the press, wet wool drying.
- **Sound:** the sundial's shadow is silent; the moor wind is not.
- **What it means:** the only warm room; where confessions happen.
```

## `bible/threads.md` — the setups ↔ payoffs table

The Chekhov's-gun ledger. Every gun on the wall, and whether it's fired.

```markdown
| Thread                        | Planted | Status | Owed payoff                    |
|-------------------------------|---------|--------|--------------------------------|
| The locked third bedroom      | ch. 2   | open   | what's inside — by ch. 18      |
| Margaret's unsent letter      | ch. 3   | open   | Elias reads it — ch. 14        |
| The cracked sundial           | ch. 1   | open   | time-skip marker — recurring   |
| The brother's name never said | ch. 1   | paid   | said aloud, ch. 14             |
```

In Pass 3, move rows from `open` to `paid` as you fire them, and add new
rows for anything you plant. An `open` thread with no chapter left to pay it
is a debt — flag it to the boss before the final chapter.

## `bible/faces/` — character portraits

PNGs from `higgsfield-generate` (Nano Banana 2/Pro). Filename matches the
`canon.json` key: `bible/faces/elias.png`. The generating prompt is stored
in `canon.json` → `characters.<key>.face_prompt`, derived from the
`immutable` block so the face *is* the canon. For consistency across several
images of one character, train a `higgsfield-soul-id` Soul Character once and
reuse the id.
