# Quality rubric — Pass 2

Run this against the draft chapter **before the boss sees it**, and fix in
place. This is the Novel-Writer quality-metrics check (word count, dialogue
ratio, sensory density) made concrete and testable — minus the JSON
telemetry. A failed check you fix silently; a failed check you *can't* fix
without breaking a setup, you surface to the boss with the patch.

## The checklist

1. **Continuity — zero tolerance.** Every physical fact in the chapter
   (eyes, scars, ages, room count, distances, dates) matches
   `bible/canon.json`. Grep the canon, don't trust memory. One contradiction
   and the reader stops believing the book.

2. **Voice — held, not drifting.** Pull three sentences at random and check
   them against `voice.md`. Same register, same sentence rhythm, same lexical
   range. No slide into generic competent prose. If the voice is Victorian
   gothic, it stays that across paragraph 40, not just paragraph 1.

3. **POV / tense discipline.** Matches the locked voice. No head-hopping
   inside a scene unless the locked register is genuine omniscient. No tense
   slips.

4. **Dialogue scans as spoken.** Read it aloud in your head. Contractions,
   interruptions, subtext, people talking past each other. **No character
   delivers a paragraph of exposition as a speech** — if backstory has to
   land, it lands in friction, not a monologue.

5. **Sensory density — at least two senses beyond sight per scene.** Smell,
   sound, touch, temperature, the taste of the air. Named concrete detail
   over abstraction ("tallow-yellow light, cold ash" not "an atmospheric
   room"). Pull from `places.md`.

6. **Show, don't label.** Emotion is enacted, not named. "Her hands stilled
   on the letter" beats "she felt afraid." Hunt for and kill abstract
   emotion-labels.

7. **Beat advanced.** The chapter does what `outline.md` said it would —
   introduce / escalate / pivot / reveal / resolve. Something changes; the
   reader knows or fears something they didn't at the top.

8. **Word-count band.** A chapter lands roughly **1,800–4,000 words** unless
   the beat genuinely demands a sprint or a long movement. Outside the band
   isn't forbidden — but it's a flag: ask whether the chapter is thin or
   bloated, not just long or short.

9. **Threads touched honestly.** If the chapter plants a gun, it's a new row
   in `threads.md`. If it fires one, that row moves to `paid`. No gun planted
   and forgotten; no payoff that was never set up.

## The author's note (always)

Three lines, after the chapter, per Brontë's persona:
- **Function:** what this chapter does in the architecture
  (introduce / escalate / pivot / reveal / resolve).
- **Planted:** the threads/setups newly laid down.
- **Held back:** what you deliberately withheld for later.

## When a check can't pass

If fixing a continuity break, a thread debt, or a beat would require breaking
an earlier setup, **stop and tell the boss** — name the conflict, propose the
patch (move the reveal, re-thread the gun, amend a canon fact with their
sign-off). Brontë is honest about a chapter that doesn't work; the rubric is
where that honesty gets enforced before the boss has to catch it.
