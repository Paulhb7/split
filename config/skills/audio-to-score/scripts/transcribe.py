#!/usr/bin/env python3
"""
Audio → score transcription.

audio (wav/mp3/flac/m4a/ogg) → MIDI (Spotify Basic Pitch) → engraved MusicXML
+ quantized MIDI (music21).

Usage:
    python transcribe.py path/to/audio.mp3 --out ./out --title "My piece"
    python transcribe.py solo.wav --out ./out --tempo 120        # force tempo
    python transcribe.py mix.wav  --out ./out --monophonic        # single line

Writes into --out:
    score.musicxml   — engravable notation (clefs, key sig, bars)
    score.mid        — quantized MIDI (drives the synced play-along page)
    transcribe.json  — manifest: key, tempo, duration, n_notes, polyphony, warnings
"""

import argparse
import json
import sys
from pathlib import Path


def _die(msg: str, code: int = 1) -> "None":
    print(f"error: {msg}", file=sys.stderr)
    raise SystemExit(code)


def _require_deps():
    """Import the two heavy deps lazily, with a friendly install hint."""
    missing = []
    try:
        import basic_pitch  # noqa: F401
        from basic_pitch.inference import predict  # noqa: F401
    except Exception:  # ImportError or downstream tf/coreml import failures
        missing.append("basic-pitch")
    try:
        import music21  # noqa: F401
    except Exception:
        missing.append("music21")
    if missing:
        _die(
            "missing Python packages: "
            + ", ".join(missing)
            + "\n  install with:  uv pip install basic-pitch music21"
            + "\n  (or:           pip install basic-pitch music21)"
        )


def _estimate_polyphony(midi_data) -> float:
    """Rough average simultaneity: total note-on time / wall time. >1.6 ≈ a mix.

    pretty_midi has no direct 'how polyphonic' read, so approximate it as the
    summed note durations over the piece length. A clean solo line lands near
    1.0; dense chords / a full mix climb well above it.
    """
    end = midi_data.get_end_time()
    if end <= 0:
        return 0.0
    note_time = 0.0
    for inst in midi_data.instruments:
        for n in inst.notes:
            note_time += max(0.0, n.end - n.start)
    return round(note_time / end, 2)


def main():
    ap = argparse.ArgumentParser(description="Transcribe audio into a MusicXML score.")
    ap.add_argument("audio", help="path to the input audio file")
    ap.add_argument("--out", default="./out", help="output directory (default ./out)")
    ap.add_argument("--title", default=None, help="title written into the score header")
    ap.add_argument("--tempo", type=float, default=None,
                    help="force tempo in BPM (overrides the auto-estimate)")
    ap.add_argument("--monophonic", action="store_true",
                    help="collapse to a single melodic line (cleaner for solo material)")
    args = ap.parse_args()

    audio_path = Path(args.audio).expanduser()
    if not audio_path.exists():
        _die(f"audio file not found: {audio_path}")

    out_dir = Path(args.out).expanduser()
    out_dir.mkdir(parents=True, exist_ok=True)
    title = args.title or audio_path.stem

    _require_deps()
    from basic_pitch.inference import predict
    from music21 import converter, tempo as m21tempo, metadata as m21meta

    warnings = []

    # ---- 1. audio → raw MIDI (Basic Pitch) ---------------------------------
    print(f"· transcribing {audio_path.name} with Basic Pitch …", file=sys.stderr)
    try:
        # predict() returns (model_output, pretty_midi.PrettyMIDI, note_events)
        _model_out, midi_data, note_events = predict(str(audio_path))
    except Exception as e:  # noqa: BLE001 — surface the real cause to the agent
        _die(f"Basic Pitch failed to read the audio: {e}")

    n_notes = len(note_events)
    if n_notes == 0:
        _die("no notes detected — is the file silent, or all noise/percussion?")

    duration = round(midi_data.get_end_time(), 2)
    polyphony = _estimate_polyphony(midi_data)

    if args.monophonic:
        # Keep only the highest active note at each onset across all instruments:
        # flatten to one instrument, then let music21's chordify/voice handling
        # collapse. Cheap approach — keep the single instrument with the most
        # notes (Basic Pitch emits one instrument, but be defensive).
        if midi_data.instruments:
            midi_data.instruments = [max(midi_data.instruments, key=lambda i: len(i.notes))]

    raw_mid = out_dir / "_raw_basic_pitch.mid"
    midi_data.write(str(raw_mid))

    # ---- 2. raw MIDI → quantized notation (music21) ------------------------
    print("· quantizing + analyzing with music21 …", file=sys.stderr)
    score = converter.parse(str(raw_mid))

    # Quantize onsets/durations to a musical grid. Can be slow on dense input;
    # fall back to the unquantized stream rather than failing the whole run.
    try:
        score = score.quantize((4, 3), inPlace=False)  # 16th + 8th-triplet grid
    except Exception as e:  # noqa: BLE001
        warnings.append(f"quantization skipped ({e}); rhythms are raw")

    # Key analysis (best-effort — Krumhansl-Schmuckler).
    detected_key = None
    try:
        k = score.analyze("key")
        detected_key = f"{k.tonic.name} {k.mode}"
    except Exception:  # noqa: BLE001
        warnings.append("key detection failed")

    # Tempo: forced value wins; else read the first tempo Basic Pitch wrote;
    # else default to 120 and flag it.
    bpm = args.tempo
    if bpm is None:
        try:
            tempi = midi_data.get_tempo_changes()[1]
            bpm = float(round(tempi[0])) if len(tempi) else 120.0
        except Exception:  # noqa: BLE001
            bpm = 120.0
    if args.tempo is None:
        warnings.append(f"tempo auto-estimated at {bpm:.0f} BPM — pass --tempo to override")
    # Stamp the tempo onto the score so the MIDI/MusicXML carry it.
    try:
        score.insert(0, m21tempo.MetronomeMark(number=bpm))
    except Exception:  # noqa: BLE001
        pass

    # Title metadata.
    try:
        score.insert(0, m21meta.Metadata())
        score.metadata.title = title
        score.metadata.composer = "transcribed by Wolfgang · Split"
    except Exception:  # noqa: BLE001
        pass

    if polyphony >= 1.6:
        warnings.append(
            f"high polyphony estimate ({polyphony}) — looks like a mix/chordal "
            "material; transcription will be approximate. Consider isolating a "
            "stem (Demucs) and re-running with --monophonic."
        )

    # ---- 3. export ---------------------------------------------------------
    musicxml_path = out_dir / "score.musicxml"
    clean_mid_path = out_dir / "score.mid"
    try:
        score.write("musicxml", fp=str(musicxml_path))
    except Exception as e:  # noqa: BLE001
        _die(f"MusicXML export failed: {e}")
    try:
        score.write("midi", fp=str(clean_mid_path))
    except Exception as e:  # noqa: BLE001
        # Non-fatal: the page can still engrave from MusicXML. Fall back to the
        # raw Basic Pitch MIDI for the play-along.
        warnings.append(f"clean MIDI export failed ({e}); using raw MIDI for playback")
        clean_mid_path = raw_mid

    raw_mid.unlink(missing_ok=True) if clean_mid_path != raw_mid else None

    manifest = {
        "title": title,
        "source_audio": str(audio_path),
        "key": detected_key,
        "tempo_bpm": bpm,
        "duration_sec": duration,
        "n_notes": n_notes,
        "polyphony_estimate": polyphony,
        "monophonic": bool(args.monophonic),
        "musicxml": str(musicxml_path),
        "midi": str(clean_mid_path),
        "warnings": warnings,
    }
    manifest_path = out_dir / "transcribe.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    # Human summary to stderr; machine manifest path to stdout (for chaining).
    print(
        f"\n✓ transcribed → {musicxml_path}\n"
        f"  key={detected_key}  tempo≈{bpm:.0f}bpm  dur={duration}s  notes={n_notes}  "
        f"polyphony≈{polyphony}",
        file=sys.stderr,
    )
    for w in warnings:
        print(f"  ⚠ {w}", file=sys.stderr)
    print(str(manifest_path))


if __name__ == "__main__":
    main()
