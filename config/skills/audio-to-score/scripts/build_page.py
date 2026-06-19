#!/usr/bin/env python3
"""
Build the signature artifact: a single self-contained index.html where the
engraved score and the music play together.

  - engraving      → OpenSheetMusicDisplay renders the MusicXML (CDN)
  - synced playback → Magenta html-midi-player + staff visualizer (CDN)
  - original audio  → inlined for ear-to-page comparison (if small enough)

Usage:
    python build_page.py --manifest ./out/transcribe.json \
        --audio "<original-audio-path>" --out ./out/index.html --title "My piece"

The page is self-contained: score XML, MIDI and (small) original audio are baked
in as data; only the OSMD + html-midi-player libraries load from CDN.
"""

import argparse
import base64
import json
import string
import sys
from pathlib import Path

# Inlining the original recording is a nicety, not the point. Past this it bloats
# the page; we drop it and keep the synthesized play-along.
MAX_AUDIO_BYTES = 20 * 1024 * 1024

AUDIO_MIME = {
    "mp3": "audio/mpeg", "wav": "audio/wav", "flac": "audio/flac",
    "m4a": "audio/mp4", "mp4": "audio/mp4", "ogg": "audio/ogg",
    "oga": "audio/ogg", "aac": "audio/aac", "aiff": "audio/aiff", "aif": "audio/aiff",
}


def _die(msg: str, code: int = 1):
    print(f"error: {msg}", file=sys.stderr)
    raise SystemExit(code)


def _data_uri(path: Path, mime: str) -> str:
    b = path.read_bytes()
    return f"data:{mime};base64," + base64.b64encode(b).decode("ascii")


def _js_string(s: str) -> str:
    """JSON-encode for safe embedding in a <script>, neutralizing </script>."""
    return json.dumps(s).replace("</", "<\\/")


def _chip(label: str, value: str) -> str:
    if value is None or value == "":
        return ""
    return f'<span class="chip"><b>{label}</b>{value}</span>'


PAGE = string.Template("""<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — partition</title>
<script src="https://cdn.jsdelivr.net/npm/opensheetmusicdisplay@1.8.7/build/opensheetmusicdisplay.min.js"></script>
<script src="https://cdn.jsdelivr.net/combine/npm/tone@14.7.77,npm/@magenta/music@1.23.1/es6/core.js,npm/focus-visible@5,npm/html-midi-player@1.5.0"></script>
<style>
  :root{
    --bg:#0e0d0c; --bg2:#171513; --ink:#f3ece1; --dim:#a99e8e;
    --terra:#d97757; --amber:#d9b06a; --paper:#f7f2e8; --line:#2a2622;
  }
  *{box-sizing:border-box}
  html,body{margin:0;background:
     radial-gradient(1200px 700px at 50% -10%, #1c1814 0%, var(--bg) 60%);
     color:var(--ink);
     font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif}
  .mono{font-family:"JetBrains Mono","IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace}
  .wrap{max-width:960px;margin:0 auto;padding:42px 22px 80px}
  header{margin-bottom:26px}
  .kicker{font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--terra);font-weight:700}
  h1{font-size:30px;line-height:1.1;margin:.18em 0 .1em;letter-spacing:-.01em}
  .sub{color:var(--dim);font-size:13px}
  .chips{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 0}
  .chip{font-size:12px;padding:5px 11px;border-radius:999px;background:var(--bg2);
        border:1px solid var(--line);color:var(--ink)}
  .chip b{color:var(--amber);font-weight:600;margin-right:7px;font-size:11px;
          letter-spacing:.04em;text-transform:uppercase}
  .badge-approx{border-color:rgba(217,119,87,.5);background:rgba(217,119,87,.12)}
  .note{margin:20px 0 0;padding:13px 15px;border-radius:12px;font-size:13px;
        background:rgba(217,176,106,.08);border:1px solid rgba(217,176,106,.28);color:#e9dcc2}
  .note b{color:var(--amber)}
  .note ul{margin:7px 0 0;padding-left:20px}
  section{margin-top:38px}
  .sec-h{display:flex;align-items:baseline;gap:12px;margin-bottom:14px}
  .sec-h h2{font-size:15px;letter-spacing:.04em;margin:0;text-transform:uppercase;color:var(--ink)}
  .sec-h .hint{color:var(--dim);font-size:12px}
  /* The score reads best on paper, floated on the void like sheet music under a lamp. */
  .paper{background:var(--paper);color:#13110e;border-radius:14px;padding:20px 18px;
         box-shadow:0 24px 70px -28px rgba(0,0,0,.8), 0 0 0 1px rgba(255,255,255,.04);
         overflow-x:auto}
  #osmd{min-height:120px}
  .player-card{background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:16px 16px 6px}
  midi-player{width:100%;--midi-player-primary:var(--terra);--midi-player-secondary:#2a2622}
  midi-visualizer{display:block;margin-top:8px;background:var(--paper);border-radius:10px;
                  padding:8px 6px;overflow-x:auto}
  midi-visualizer .piano-roll-visualizer{background:transparent}
  midi-visualizer svg rect{fill:var(--terra)}
  midi-visualizer svg .active{fill:#b4472b}
  audio{width:100%;margin-top:6px;filter:saturate(.9)}
  .ab{color:var(--dim);font-size:12px;margin-top:8px}
  .dl{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
  .dl a{font-size:12.5px;text-decoration:none;color:var(--ink);background:var(--bg2);
        border:1px solid var(--line);padding:8px 13px;border-radius:9px}
  .dl a:hover{border-color:var(--terra);color:#fff}
  footer{margin-top:46px;color:var(--dim);font-size:11.5px;line-height:1.7;
         border-top:1px solid var(--line);padding-top:16px}
  a.lnk{color:var(--amber);text-decoration:none}
  .fallback{color:#c0392b;font:13px/1.5 ui-monospace,monospace;padding:8px}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="kicker">Wolfgang · transcription</div>
    <h1>${title}</h1>
    <div class="sub">De l'enregistrement à la partition — la musique et les notes, ensemble.</div>
    <div class="chips">${chips}</div>
  </header>

  ${note_block}

  <section>
    <div class="sec-h"><h2>Partition</h2><span class="hint">gravure · OpenSheetMusicDisplay</span></div>
    <div class="paper"><div id="osmd"></div></div>
  </section>

  <section>
    <div class="sec-h"><h2>Écouter en suivant la partition</h2>
      <span class="hint">synthé — synchro exacte (curseur sur la portée)</span></div>
    <div class="player-card">
      <midi-player id="player" sound-font visualizer="#viz" src="${midi_uri}"></midi-player>
      <midi-visualizer type="staff" id="viz"></midi-visualizer>
    </div>
  </section>

  ${audio_block}

  <div class="dl">
    <a download="${slug}.musicxml" href="${musicxml_uri}">⤓ MusicXML (MuseScore / Finale / Sibelius)</a>
    <a download="${slug}.mid" href="${midi_uri}">⤓ MIDI</a>
  </div>

  <footer>
    Transcription : <b>Basic Pitch</b> (Spotify) → <b>music21</b> · gravure
    <a class="lnk" href="https://opensheetmusicdisplay.org" target="_blank" rel="noopener">OpenSheetMusicDisplay</a> ·
    lecture <a class="lnk" href="https://github.com/cifkao/html-midi-player" target="_blank" rel="noopener">Magenta html-midi-player</a>.<br>
    La transcription automatique est fidèle sur du monophonique (voix/instrument
    solo) et approximative sur un mix complet. Le rendu joué est un synthé, pas
    l'enregistrement original.
  </footer>
</div>

<script>
  const SCORE_XML = ${score_xml};
  window.addEventListener("load", () => {
    try {
      const osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay("osmd", {
        autoResize: true, backend: "svg", drawTitle: false, drawComposer: false,
      });
      osmd.load(SCORE_XML).then(() => osmd.render()).catch((e) => {
        document.getElementById("osmd").innerHTML =
          '<div class="fallback">La partition n\\'a pas pu être gravée : ' + e +
          '<br>Réessaie la transcription (souvent avec --monophonic ou un --tempo corrigé).</div>';
      });
    } catch (e) {
      document.getElementById("osmd").innerHTML =
        '<div class="fallback">OpenSheetMusicDisplay indisponible : ' + e + '</div>';
    }
  });
</script>
</body>
</html>
""")


def main():
    ap = argparse.ArgumentParser(description="Build the synced score+music HTML page.")
    ap.add_argument("--manifest", required=True, help="transcribe.json from transcribe.py")
    ap.add_argument("--audio", default=None, help="original audio file to inline (optional)")
    ap.add_argument("--out", default=None, help="output html path (default: <manifest dir>/index.html)")
    ap.add_argument("--title", default=None, help="page title (default: manifest title)")
    args = ap.parse_args()

    manifest_path = Path(args.manifest).expanduser()
    if not manifest_path.exists():
        _die(f"manifest not found: {manifest_path}")
    m = json.loads(manifest_path.read_text(encoding="utf-8"))

    musicxml_path = Path(m["musicxml"]).expanduser()
    midi_path = Path(m["midi"]).expanduser()
    if not musicxml_path.exists():
        _die(f"MusicXML not found: {musicxml_path}")
    if not midi_path.exists():
        _die(f"MIDI not found: {midi_path}")

    title = args.title or m.get("title") or musicxml_path.stem
    slug = "".join(c if c.isalnum() or c in "-_" else "-" for c in title).strip("-").lower() or "score"
    out_path = Path(args.out).expanduser() if args.out else manifest_path.parent / "index.html"

    score_xml = _js_string(musicxml_path.read_text(encoding="utf-8"))
    midi_uri = _data_uri(midi_path, "audio/midi")

    # ---- meta chips --------------------------------------------------------
    poly = m.get("polyphony_estimate")
    approx = isinstance(poly, (int, float)) and poly >= 1.6
    chips = "".join([
        _chip("Tonalité", m.get("key") or "—"),
        _chip("Tempo", f"≈ {round(m['tempo_bpm'])} BPM" if m.get("tempo_bpm") else ""),
        _chip("Durée", f"{m['duration_sec']:.0f}s" if m.get("duration_sec") else ""),
        _chip("Notes", str(m.get("n_notes")) if m.get("n_notes") is not None else ""),
        (f'<span class="chip badge-approx mono"><b>Fidélité</b>approximative · mix</span>'
         if approx else
         '<span class="chip mono"><b>Fidélité</b>monophonique · fiable</span>'),
    ])

    # ---- honesty / warnings block -----------------------------------------
    warnings = m.get("warnings") or []
    if warnings:
        items = "".join(f"<li>{w}</li>" for w in warnings)
        note_block = f'<div class="note"><b>À savoir</b><ul>{items}</ul></div>'
    else:
        note_block = ""

    # ---- original audio (optional, size-capped) ----------------------------
    audio_block = ""
    if args.audio:
        ap_path = Path(args.audio).expanduser()
        if not ap_path.exists():
            audio_block = ('<section><div class="sec-h"><h2>Enregistrement original</h2></div>'
                           f'<div class="ab">Fichier introuvable : {ap_path}</div></section>')
        else:
            size = ap_path.stat().st_size
            ext = ap_path.suffix.lower().lstrip(".")
            if size > MAX_AUDIO_BYTES:
                audio_block = (
                    '<section><div class="sec-h"><h2>Enregistrement original</h2></div>'
                    f'<div class="ab">Original non intégré ({size // (1024*1024)} Mo > '
                    f'{MAX_AUDIO_BYTES // (1024*1024)} Mo) — page gardée légère. '
                    'Le rendu joué ci-dessus est le synthé de la transcription.</div></section>'
                )
            else:
                mime = AUDIO_MIME.get(ext, "audio/mpeg")
                uri = _data_uri(ap_path, mime)
                audio_block = (
                    '<section><div class="sec-h"><h2>Enregistrement original</h2>'
                    '<span class="hint">le vrai morceau — pour comparer à l\'oreille</span></div>'
                    f'<div class="player-card"><audio controls preload="metadata" src="{uri}"></audio>'
                    '<div class="ab">Compare : le lecteur du haut est le synthé de la '
                    'transcription, celui-ci est ton enregistrement.</div></div></section>'
                )

    html = PAGE.substitute(
        title=title, slug=slug, chips=chips, note_block=note_block,
        audio_block=audio_block, score_xml=score_xml, midi_uri=midi_uri,
        musicxml_uri=_data_uri(musicxml_path, "application/vnd.recordare.musicxml+xml"),
    )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html, encoding="utf-8")
    print(f"✓ page → {out_path}", file=sys.stderr)
    print(str(out_path))


if __name__ == "__main__":
    main()
