# Exemplars — masters' melodies in ABC, with the lesson

A study collection: famous **public-domain** themes transcribed to ABC so you can
*see the craft of `composition-craft.md` in real music*. Read the tune, then the
**What it teaches** — that mapping is the point. When you compose, you're aiming
for the same moves.

> **Provenance & honesty.** The tunes below are canonical themes transcribed by
> hand from knowledge — accurate for these very well-known melodies, but for
> performance/engraving you should verify against an urtext (IMSLP). They're
> **melody lines** (the clearest way to study melodic shape); the implied harmony
> is named in the notes. To grow this library from *verified source files*, use
> the workflow at the bottom — don't transcribe complex pieces from memory.
>
> **Why these composers and not others:** Bach, Beethoven, Mozart, Vivaldi,
> Paganini write **clear tonal lines** that ABC represents faithfully and that
> *teach melody*. **Debussy and Ravel** are deliberately **not** hand-transcribed
> here — their music is harmonically dense and non-functional, fits ABC poorly,
> and is the wrong model for a *singable line*. Study them for **color**
> (impressionist recipe in `style-recipes.md`), and import them as **MusicXML**,
> not ABC.

---

## 1. Beethoven — "Ode to Joy" (Symphony No. 9) · D major
```abc
X:1
T:Ode to Joy — theme
C:Beethoven (transcribed)
M:4/4
L:1/8
Q:1/4=120
K:D
F2 F2 G2 A2 | A2 G2 F2 E2 | D2 D2 E2 F2 | F3 E E4 |
F2 F2 G2 A2 | A2 G2 F2 E2 | D2 D2 E2 F2 | E3 D D4 |]
```
**What it teaches** — the purest **period** and the purest **stepwise melody**.
- Almost entirely **conjunct** (steps) → maximally singable. The only "leaps" are
  small. This is why a child can sing it.
- **Arch contour**: rises to the A (the 5th, bar 1–2), settles back to D.
- **Antecedent / consequent**: the two 4-bar phrases rhyme (identical bars 1–3),
  but the first ends *open* on E (half-cadence feel, 2̂), the second resolves
  *closed* on D (the tonic, 1̂). Question → answer.
- The **dotted-rhythm cadence** (`F3 E E4` / `E3 D D4`) gives each phrase a
  gentle agogic landing.

## 2. Beethoven — Symphony No. 5, opening motif · C minor
```abc
X:1
T:Symphony No.5 — motif
C:Beethoven (transcribed)
M:2/4
L:1/8
Q:1/4=108
K:Cm
z G G G | !fermata!E4 | z F F F | !fermata!D4 |]
```
**What it teaches** — **a motif is a rhythm, not just pitches**.
- Four notes, one rhythm (short-short-short-LONG). The whole movement is built by
  **repeating, sequencing, and fragmenting** this cell — the textbook case for
  "almost nothing is brand-new after the first idea".
- The second statement is the **same shape a step lower** (G→Eb becomes F→D): a
  **sequence**. Identity + transposition = coherence with motion.
- The **fermata** (held note) creates suspense before the music resumes — silence
  and length as tension.

## 3. Beethoven — "Für Elise", opening · A minor
```abc
X:1
T:Fur Elise — opening
C:Beethoven (transcribed)
M:3/8
L:1/16
Q:1/8=72
K:Am
E ^D | E ^D E B D C | A4 z2 |]
```
**What it teaches** — **tension from a semitone neighbor**, then a fall to rest.
- The hovering **E–D♯** is a chromatic **neighbor-tone** oscillation (D♯ leans up
  to E). That tiny half-step is the whole mood — wistful, unresolved.
- The line then **descends through an arpeggio** (E B D C A) outlining the
  dominant→tonic pull, landing on **A** (the tonic) = release.
- Tension (the neighbor) → resolution (the landing). A complete gesture in three
  bars.

## 4. Mozart — "Ah! vous dirai-je, Maman" (K.265 theme / "Twinkle") · C major
```abc
X:1
T:Ah vous dirai-je Maman — theme
C:Mozart (transcribed)
M:4/4
L:1/8
Q:1/4=100
K:C
C2 C2 G2 G2 | A2 A2 G4 | F2 F2 E2 E2 | D2 D2 C4 |
G2 G2 F2 F2 | E2 E2 D4 | G2 G2 F2 F2 | E2 E2 D4 |
C2 C2 G2 G2 | A2 A2 G4 | F2 F2 E2 E2 | D2 D2 C4 |]
```
**What it teaches** — **textbook functional harmony + ABA-ish form**.
- The opening **leap up a 5th** (C→G) then **stepwise descent** (gap-fill in
  action: the leap is "paid back" by steps).
- Implied harmony is pure **I – IV – V – I**; each phrase ends with a clear
  cadence. This is the harmonic skeleton under thousands of pieces.
- Form: **A** (bars 1–4) – **B** (the "twinkle little star" middle, bars 5–8,
  hovering on V/dominant material) – **A** (return). Contrast then home.

---

## How to grow this library from *verified* sources

Don't hand-transcribe complex scores — import real urtext files and convert.
All sources below are public-domain or free.

**music21 corpus (best — accurate, offline once installed).** Ships hundreds of
real scores (Bach chorales, Beethoven quartets, Mozart, Palestrina…):
```bash
uv pip install music21
python3 - <<'PY'
from music21 import corpus
s = corpus.parse('bach/bwv66.6')          # a real Bach chorale
s.write('musicxml', fp='bwv66_6.musicxml')  # → engrave with OSMD, or study in MuseScore
# music21 PARSES abc but doesn't reliably WRITE it; go via MusicXML/MIDI, or
# extract a single line and hand-build ABC from exact pitches:
soprano = s.parts[0].flatten().notes
print([(n.nameWithOctave, float(n.quarterLength)) for n in soprano[:16]])
PY
```
Browse the catalogue: `python3 -c "from music21 import corpus; print(corpus.getComposer('beethoven'))"`.

**KernScores** (`kern.ccarh.org`) — huge classical corpus in `**kern`; convert with
`humdrum`/`verovio`. **Mutopia Project** (`mutopiaproject.org`) — free LilyPond +
MIDI + PDF, all public domain. **abcnotation.com** — a large searchable ABC tune
database (lots of classical themes already in ABC; verify before trusting).
**IMSLP** (`imslp.org`) — scans (PDF) of nearly everything public-domain, but not
machine-readable (OMR needed).

**For Debussy / Ravel / Paganini / Vivaldi specifically**: fetch **MusicXML or
MIDI** from the above (not ABC), and — for the impressionists — study them for
*harmonic color and texture*, feeding that back into the **impressionist recipe**
in `style-recipes.md`, rather than trying to notate their textures as a clean
melodic line.
