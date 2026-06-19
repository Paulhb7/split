---
name: compose-score
description: |
  Compose original music as NOTES, not audio — the model writes the score
  directly in ABC notation, then ships a single self-contained HTML page where
  the engraved partition renders cleanly (abcjs), plays with a cursor following
  the notes, and exports to MIDI + MusicXML (MuseScore/Finale). Clean by
  construction — no audio analysis, no "mush". Use when the boss wants a
  PARTITION / sheet music: "compose a piano piece", "write a melody", "harmonize
  this tune", "a Satie-like nocturne", "a waltz in D minor", "a lead sheet for
  this chord progression", "give me the notes", "something I can play / print /
  open in MuseScore". Piano-first (grand staff), extends to small ensembles
  (string quartet, lead sheet, piano+voice). NOT for: a finished produced
  AUDIO track / full mix (that's higgsfield-generate / Sonilo), transcribing an
  existing recording (that's audio-to-score), or a full symbolic orchestra
  (quality drops — keep it piano / small ensemble).
argument-hint: "[brief] [--key <e.g. D minor>] [--mood <e.g. tender>] [--style <tradition>]"
allowed-tools:
  - Bash
  - Read
  - Write
metadata: {"version": "1.0"}
---

# Compose-Score — write the notes, ship the partition

Wolfgang's **symbolic composition** layer. The opposite of `audio-to-score`:
there's no recording to analyze, so there's no mush. **You — the model — write
the music directly as notes** (ABC notation), and the skill renders a clean
engraved partition the boss can read, play, edit, and print. Music *is* text;
you already know harmony and melody from your training. This skill is the craft
discipline + the rendering pipeline around that.

> **Piano is the sweet spot.** One timbre, the standard grand staff, trivial
> playback (one GM patch). Default to piano unless the brief asks otherwise. You
> can extend to a string quartet, a lead sheet, or piano+voice — but a full
> symbolic orchestra is where quality falls off; don't promise it.

## The workflow

1. **Read the brief → fix the parameters.** State them in one line before
   writing a note: **key + mode** (D minor), **tempo + metre** (♩=72, 3/4),
   **form** (e.g. 16-bar A–A′ period, or ABA), **mood**, **texture** (melody +
   broken-chord left hand). The boss redirects here, not after.
2. **Compose in ABC.** Write the actual notes following the craft below (and
   `references/composition-craft.md` for depth). For piano use the grand-staff
   two-voice layout in `references/abc-for-piano.md`. Don't write random notes
   that merely "fit the key" — shape a *melody* (see The Rules).
3. **Build the page:**
   ```bash
   python scripts/build_score_page.py --abc ./out/piece.abc \
     --out ./out/index.html --title "Nocturne in D minor"
   ```
   Renders the engraving (abcjs), a play button with a synced cursor, and
   download buttons for **MIDI**, the **ABC source**, and **MusicXML** (if
   `music21` is installed — `uv pip install music21`).
4. **Verify — mechanically, then by ear.** First run
   `python scripts/check_abc.py ./out/piece.abc` — it flags bar-length errors,
   **flat rhythm** (one note-length used), and **homorhythmic hands** (LH in
   lockstep with RH). Fix anything it reports *before* building. Then open the
   page: does the staff engrave with no abcjs warnings? Press play — does it
   sound musical, or like notes in a key? If it's "correct but dull", it failed
   The Rules; revise, don't ship.
5. **Deliver.** Save to `~/Desktop/wolfgang-<piece>-<YYYYMMDD>/` (`piece.abc`,
   `index.html`, `score.musicxml`, `score.mid`). Hand back the path, one line on
   the musical idea (key/form/the gesture you used), and an offered variation
   ("same theme, major-mode reprise" / "add a B section" / "string-quartet
   voicing").

## The Rules — what makes a melody beautiful (one screen)

The deep version is `references/composition-craft.md`. The essence:

**Melody — shape, not scatter.**
- **One arc, one peak.** A phrase rises to a single high point (place it ~2/3 of
  the way through — the golden moment), then falls to rest. Many little peaks = no
  peak.
- **Steps with the occasional leap.** Mostly conjunct (stepwise) motion — that's
  what's singable. A leap is an event; **after a big leap, change direction and
  step back** (gap-fill). Leaps spend energy; steps are the breath between.
- **A motif, repeated then varied.** State a short idea (2–4 notes / one bar),
  repeat it (often a **sequence** — same shape, moved up/down a step), *then*
  vary it. Repetition = memory; variation = life. This is 80% of "catchy".
- **Question and answer.** Build phrases as a **period**: antecedent ends
  *open* (on the dominant, V — feels unfinished), consequent answers and ends
  *closed* (on the tonic, I). Breathe (a rest) between them.
- **Tension lives in the non-chord tones.** The beauty is often a **suspension**
  or **appoggiatura** — a note a step above the chord tone that *leans* and then
  resolves down. Plain chord tones are safe and bland; the lean-and-resolve is
  the sigh that moves people.

**Harmony — gravity.**
- Functional motion: **tonic → predominant (ii/IV) → dominant (V/V7) → tonic.**
  The **V→I cadence** is the gravity of tonal music; end phrases and the piece
  with it. Delay it (a deceptive V→vi) to ache, then finally land.
- **Voice-lead by the smallest move.** Keep common tones; move other voices by a
  step. Resolve the leading tone *up* to the tonic and the 7th of a V7 chord
  *down*. Avoid parallel 5ths/octaves (they collapse independence).
- A **bass line is a melody too** — use inversions so the bass walks by step,
  not by jumping roots.
- Color sparingly: a **secondary dominant** (V/V), a **borrowed minor iv** in
  major, a 7th/9th for warmth. One spice at a time.

**Texture & emotion (piano).**
- **The hands must be INDEPENDENT — never in lockstep.** The LH is an
  accompaniment *pattern* (Alberti bass, flowing broken chords, a waltz oom-pah,
  a counter-melody) moving on its *own* rhythm while the RH sings. If both hands
  change notes on the same beats throughout, it sounds like a beginner — the
  **#1 tell of amateur writing**.
- **Give the melody rhythmic life.** A rhythmic motif with real subdivision —
  eighths, sixteenths, a dotted figure, a tie/syncopation — **not a wall of
  equal quarter notes**. Flat rhythm is the **#2 tell**.
- Right hand sings; left hand accompanies — Alberti bass, broken chords, a
  waltz oom-pah, or quiet block chords. **Match the pattern to the mood.**
- Register: melody in a singing range (~an octave to a 10th); **keep the bass
  out of the mud** (avoid close thirds below ~C2 — they growl).
- Major = bright/open, minor = inward; tempo and register move the feeling as
  much as the mode. **Rests are music** — space is part of beauty.

**The meta-rule: unity + variety + arc.** Enough repetition to be coherent and
memorable, enough variation to stay alive, and a single emotional journey —
stability → rising tension → the peak → resolution home. If a piece has no place
that *needs* to resolve, it has no beauty to deliver.

## Honesty

- **Short forms are your strength.** A 16–32 bar piece, a theme, a harmonized
  melody, a section — strong. A 5-minute through-composed sonata — coherence
  frays; offer to build it section by section instead.
- **Piano / small ensemble only.** A full symbolic orchestra (transposing
  instruments, idiomatic pupitres, 20 staves) is where quality and engraving
  break down. If the boss wants a *lush orchestral sound*, that's the audio
  route — `higgsfield-generate` (Sonilo) — at the cost of having no score.
- **No pastiche of living artists.** Match a **tradition / era** (Baroque
  two-part invention, a Romantic nocturne, a Satie-flavoured Gymnopédie, lo-fi)
  — never imitate a named living composer.

## Reference docs (load on demand)
- `references/composition-craft.md` — melody, harmony, voice-leading, form, in depth.
- `references/abc-for-piano.md` — ABC syntax for the grand staff (keys, voices,
  chords, octaves, ornaments) — get the notation right.
- `references/style-recipes.md` — concrete recipes (era/tradition → key, tempo,
  texture, harmonic palette) you can dial in.
- `references/exemplars.md` — masters' melodies (Beethoven, Mozart…) in ABC, each
  annotated with the craft lesson it demonstrates + how to import more from real
  urtext sources (music21 corpus, KernScores, Mutopia).
