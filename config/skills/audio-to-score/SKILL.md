---
name: audio-to-score
description: |
  Transcribe an audio recording into readable sheet music — and ship it as a
  single self-contained HTML page where the score and the music play together,
  a synced playhead tracking the notes. Pipeline: audio → MIDI (Spotify Basic
  Pitch) → engraved MusicXML + quantized MIDI (music21) → a deployable
  index.html (OpenSheetMusicDisplay engraving + a Magenta play-along staff +
  the original recording). Use when the boss drops an audio file and wants the
  score, the notation, the transcription, the sheet music, "what notes is this",
  "turn this into a partition", "transcribe this melody", "here's me whistling /
  humming a tune", "transcribe my whistling", or "show me the music while it
  plays". Best on MONOPHONIC material (a whistled/hummed tune, solo voice, a
  single instrument,
  a melodic line). A full mix (band, produced track) transcribes roughly unless
  a stem is isolated first (Demucs) — say so up front. NOT for: composing /
  generating new music (that's higgsfield-generate / Sonilo), source separation
  on its own, or stem export.
argument-hint: "[audio-path] [--title <name>] [--tempo <bpm>] [--monophonic]"
allowed-tools:
  - Bash
  - Read
  - Write
metadata: {"version": "1.0"}
---

# Audio → Score

Wolfgang's **transcription** layer. Where `higgsfield-generate` *writes* music,
this *reads* it: an existing recording becomes a partition the boss can see,
print, and play along to. The signature output is **one self-contained
`index.html`** — exactly the doctrine of `sky-viz`/`nasa-eyes`: a deployable
page, not a static image. The score is rendered live (OpenSheetMusicDisplay),
a play-along staff highlights each note as it sounds (Magenta `html-midi-player`),
and the **original recording** sits right beside the synthesized transcription so
the boss can compare ear-to-page.

> The "music + partition at the same time" is the whole point. Don't hand back a
> bare `.musicxml` — ship the page. The score that doesn't play is half a
> deliverable.

## The honest truth about quality (read first, say it up front)

Automatic transcription is **good, not perfect**, and the input decides which:

- **Monophonic** — a whistled or hummed tune, solo voice, one flute/sax/violin
  line, a single-line piano riff → **reliable**. Pitches and rhythm land.
  **Whistling is the single cleanest input there is** — a near-pure tone, no
  consonants, no vibrato — so a whistled melody transcribes best of all. Tell the
  boss they can just whistle the idea into the mic.
- **Polyphonic, one instrument** — solo piano, solo guitar chords → decent;
  expect some smeared inner voices.
- **Full mix** — a produced track, a band → **rough**. Many instruments overlap
  into one pitch soup. Either accept a sketch, or isolate a stem first (see
  *Demucs*). **Tell the boss before you generate, not after.**

Always state your read in one line first — *"this is a solo cello line, the
transcription should be clean"* / *"this is a full mix; I'll transcribe the lead
melody but the harmony will be approximate"* — then run.

## Step 0 — Environment

The scripts need two Python packages. Install on first use:

```bash
uv pip install basic-pitch music21    # or: pip install basic-pitch music21
```

`basic-pitch` is Spotify's lightweight, open neural pitch model (runs on CPU,
offline once downloaded). `music21` does the notation: quantization, key/meter
analysis, MusicXML export. No account, no API, no credits — unlike the
generation engine.

## The pipeline (two commands)

### 1. Transcribe — audio → MusicXML + MIDI

```bash
python scripts/transcribe.py "<audio-path>" --out ./out --title "<piece name>"
```

Writes into `./out/`:
- `score.musicxml` — the engravable notation
- `score.mid` — the quantized MIDI that drives the synced play-along
- `transcribe.json` — manifest: detected key, tempo, duration, note count,
  polyphony estimate, and any warnings

Flags:
- `--tempo <bpm>` — force a tempo when the auto-estimate is off (common; trust
  the boss's ear over the estimator).
- `--monophonic` — collapse to a single melodic line (cleaner for solo material;
  drops accidental double-detections).
- `--title` — titles the score header.

### 2. Build the page — the signature artifact

```bash
python scripts/build_page.py --manifest ./out/transcribe.json \
  --audio "<original-audio-path>" --out ./out/index.html --title "<piece name>"
```

Produces a **single self-contained** `index.html`:
- **Engraved score** at the top (OpenSheetMusicDisplay renders the MusicXML —
  clefs, key signature, bars, the real thing) on a warm paper panel.
- **Play-along** — a Magenta `<midi-player>` + `<midi-visualizer type="staff">`:
  press play, a cursor walks the staff in perfect sync (same MIDI source = exact
  sync, no alignment guesswork).
- **Original recording** — the boss's actual file, inlined, to compare against
  the synth rendition. Honest: synth ≠ original.
- **Downloads** — the `.musicxml` (opens in MuseScore/Finale/Sibelius) and `.mid`
  baked in as data URIs.

The original audio is inlined as a data URI; if it's larger than ~20 MB the page
omits it (and says so) and keeps the synthesized play-along. CDN libs only — the
file stays single.

## Polyphonic material — isolate a stem first (optional)

For a full mix where the boss wants *one part* (the vocal, the bass line),
separate stems before transcribing:

```bash
uv pip install demucs
demucs --two-stems vocals "<mix.mp3>" -o ./stems   # → ./stems/htdemucs/<name>/vocals.wav
python scripts/transcribe.py ./stems/htdemucs/<name>/vocals.wav --out ./out --monophonic
```

Then build the page against the **original mix** as the "listen" track but the
isolated stem as the transcription — note the split in the page caption.

## Build / output discipline

1. **Single self-contained file.** Inline the score, MIDI, and (if small) the
   original audio. CDN for OSMD + html-midi-player is fine; nothing else fetched.
2. **Verify it renders before handing back.** Open the page (or drop it in the
   artifact viewer): confirm the score engraves *and* the play button highlights
   notes. A blank staff = OSMD failed to parse; re-run transcribe, often with
   `--monophonic` or a corrected `--tempo`.
3. **Save** to `~/Desktop/wolfgang-<piece>-<YYYYMMDD>/` with `score.musicxml`,
   `score.mid`, `transcribe.json`, the original audio, and `index.html`.
4. **Hand back**: the file path first, then one line — the detected key/tempo,
   how clean the transcription is for this material, and one concrete next step
   ("force `--tempo 92` if the bars look off", "isolate the vocal stem for a
   cleaner melody line").

## Signature moves

- *"Here's me whistling a tune"* → the **best-case input**: a whistle is a pure
  monophonic tone, so it transcribes cleanly. Drop the clip → a readable
  single-staff score + play-along + the original. (Whistle steadily and roughly
  in time; nudge `--tempo` if the rhythm reads off.) The signature win.
- *"What notes is this melody?"* (hummed/solo) → transcribe → page with a clean
  single-staff score + play-along. The fast win.
- *"Turn this song into sheet music"* (full mix) → state the honest read, isolate
  the lead stem with Demucs, transcribe that, page it against the original.
- *"I made a track with you — now give me the score"* → **only** transcribe a
  Sonilo track cleanly if it's essentially a **single line** (a solo, a bare
  melody). A full Sonilo *arrangement* is a mix → transcribing it is mush (see the
  quality truth above). For a clean, readable score of "what plays in your head",
  **compose it symbolically with `compose-score`** — born as notation, not
  extracted from audio. **Don't offer to MIDI-fy a rich/orchestral generation.**
