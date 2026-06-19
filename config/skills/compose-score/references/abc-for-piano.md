# ABC notation for piano (the grand staff)

ABC is a compact text music format. This is the practical subset you need to
write a clean piano score that `abcjs` will engrave correctly. Get the notation
right and the partition renders beautifully; get it sloppy and abcjs throws
warnings or mis-engraves.

## Header (always, in this order)
```
X:1                 % tune number (one per tune)
T:Nocturne in D minor   % title
C:Wolfgang · Split  % composer
M:3/4               % metre (time signature)
L:1/8               % default note length (unit). 1/8 = an eighth note.
Q:1/4=66            % tempo: quarter note = 66 bpm
K:Dm                % key (Dm = D minor; D = D major; C, G, F, Bb, Eb, A, Am…)
```

## The grand staff — two voices, braced
A piano score is a **right-hand (treble)** voice and a **left-hand (bass)** voice,
joined by a brace. Declare the voices, then group them with `%%score { ... }`
(curly braces = the piano brace):
```
%%score { RH | LH }
V:RH clef=treble
V:LH clef=bass
```
Then write each voice's bars, prefixing lines with `[V:RH]` / `[V:LH]`. Keep the
two voices **bar-aligned** (same number of beats per bar in both).

## Pitches and octaves
- Letters `C D E F G A B` = the octave from middle C up to the B above.
- **Lowercase** `c d e f g a b` = the octave **above** that.
- Commas drop an octave: `C,` `C,,` (bass register). Apostrophes raise: `c'` `c''`.
- Middle C = `C`. The C an octave below (good LH register) = `C,`. Treble staff
  melody usually lives in `c`–`a` / `c'`.

## Duration (relative to L:)
With `L:1/8`: `A` = eighth, `A2` = quarter, `A4` = half, `A6` = dotted half,
`A8` = whole. Halve with `/`: `A/` or `A/2` = sixteenth, `A//` = thirty-second.
Dotted pairs with `>`: `A>B` = dotted-eighth + sixteenth.

## Accidentals
`^` sharp, `_` flat, `=` natural, before the note: `^F` `_B` `=C`. (They persist
through the bar, like real notation.)

## Chords (simultaneous notes) — the heart of a piano LH
Square brackets = notes sounding together: `[CEG]` = a C-major triad. In the bass
register: `[C,E,G,]`. A held LH chord under a moving RH line:
```
[V:LH] [D,A,F]4 [C,G,E]4 |
```

## Rests, bars, repeats, ties, slurs
- Rest: `z` (with length: `z2`). A whole-bar rest: `Z`.
- Bar line `|`, final `|]`, repeat `|: ... :|`, first/second endings `|1 ... :|2 ...`.
- **Tie** (same pitch, joined): `A2-A2`. **Slur** (phrase): `(ABcd)`.
- **Beaming**: notes written **together** (no space) beam; a **space** breaks the
  beam. `abcd efga` = two beamed groups of four.

## Triplets and tuplets
`(3abc` = three notes in the time of two. `(3:2:3` for explicit ratios.

## Expression (abcjs renders these)
- Dynamics: `!p! !mf! !f! !crescendo(! ... !crescendo)!`
- Articulation: `.A` staccato, `HA` fermata, `uA`/`vA` up/down bow (or accents).
- Chord symbols above the staff (great for lead sheets): `"Dm7" A2 "G7" B2`.

## A complete minimal piano example (renders + plays in abcjs)
```abc
X:1
T:Tiny Piano Study
C:Wolfgang · Split
M:3/4
L:1/8
Q:1/4=72
K:Dm
%%score { RH | LH }
V:RH clef=treble
V:LH clef=bass
[V:RH] A2 d2 f2 | (g2 f4) | e2 c2 e2 | d6 |
[V:LH] [D,A,]4 F,2 | [C,G,]4 A,2 | [A,,E,]4 C,2 | [D,A,D]6 |]
```
Read it back before building: 3 beats per bar in both voices, every bar aligned,
the RH ends on the tonic D, the LH cadences `i – ? – ? – i`. That's a valid,
engraving-clean piano grand staff.

## Common abcjs gotchas
- **Mismatched bar lengths** between RH and LH → abcjs warns and the bar looks
  wrong. Count beats in both voices.
- **Forgot `%%score`** → the two voices print as two separate staves with no
  brace (not a piano).
- **Octave too low without commas** → melody sounds an octave high / bass not in
  the bass. Use `C,`/`C,,` for the LH.
- **Default length confusion** → remember everything is relative to `L:`. If your
  rhythms look twice/half as long as intended, your `L:` is wrong.
