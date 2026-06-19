#!/usr/bin/env python3
"""
Build the signature artifact for compose-score: a single self-contained HTML
page that engraves an ABC score (abcjs), plays it with a cursor following the
notes, and offers MIDI / ABC / MusicXML downloads.

  - engraving + playback → abcjs (one CDN lib, includes a Web Audio synth)
  - MIDI export          → abcjs (in the browser)
  - MusicXML export      → music21 if available (for MuseScore/Finale)

Usage:
    python build_score_page.py --abc ./out/piece.abc \
        --out ./out/index.html --title "Nocturne in D minor"

Everything (the ABC source, the optional MusicXML) is baked into the page; only
the abcjs library loads from CDN.
"""

import argparse
import base64
import json
import string
import sys
from pathlib import Path


def _die(msg: str, code: int = 1):
    print(f"error: {msg}", file=sys.stderr)
    raise SystemExit(code)


def _js_string(s: str) -> str:
    """JSON-encode for safe embedding in a <script>, neutralizing </script>."""
    return json.dumps(s).replace("</", "<\\/")


def _maybe_musicxml(abc_text: str, out_dir: Path, slug: str):
    """Convert ABC → MusicXML with music21 if it's importable. Returns (path, data_uri) or (None, None)."""
    try:
        from music21 import converter
    except Exception:
        return None, None
    try:
        score = converter.parse(abc_text, format="abc")
        xml_path = out_dir / f"{slug}.musicxml"
        score.write("musicxml", fp=str(xml_path))
        b = xml_path.read_bytes()
        uri = "data:application/vnd.recordare.musicxml+xml;base64," + base64.b64encode(b).decode("ascii")
        return xml_path, uri
    except Exception as e:  # noqa: BLE001 — non-fatal, the page still ships without MusicXML
        print(f"  (music21 present but ABC→MusicXML failed: {e}; skipping MusicXML)", file=sys.stderr)
        return None, None


PAGE = string.Template("""<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — partition</title>
<script src="https://cdn.jsdelivr.net/npm/abcjs@6.4.4/dist/abcjs-basic-min.js"></script>
<style>
  :root{
    --bg:#0e0d0c; --bg2:#171513; --ink:#f3ece1; --dim:#a99e8e;
    --terra:#d97757; --amber:#d9b06a; --paper:#f7f2e8; --line:#2a2622;
  }
  *{box-sizing:border-box}
  html,body{margin:0;background:radial-gradient(1200px 700px at 50% -10%, #1c1814 0%, var(--bg) 60%);
    color:var(--ink);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif}
  .wrap{max-width:920px;margin:0 auto;padding:42px 22px 80px}
  .kicker{font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--terra);font-weight:700}
  h1{font-size:29px;line-height:1.1;margin:.18em 0 .1em;letter-spacing:-.01em}
  .sub{color:var(--dim);font-size:13px}
  .free{display:inline-block;margin-left:8px;font-size:11px;font-weight:700;letter-spacing:.04em;
    color:#1a120e;background:var(--amber);padding:2px 9px;border-radius:999px;vertical-align:middle}
  /* The score on paper, floated on the void — sheet music under a lamp. */
  .paper{background:var(--paper);color:#13110e;border-radius:14px;padding:14px 10px;margin-top:24px;
    box-shadow:0 24px 70px -28px rgba(0,0,0,.8), 0 0 0 1px rgba(255,255,255,.04);overflow-x:auto}
  /* abcjs highlight (the playback cursor on each note) */
  .abcjs-highlight{fill:var(--terra)!important}
  .abcjs-cursor{stroke:var(--terra)}
  #audio{margin-top:16px}
  .abcjs-inline-audio{background:var(--bg2)!important;border:1px solid var(--line);border-radius:10px}
  .abcjs-inline-audio .abcjs-btn{color:var(--ink)!important}
  .dl{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}
  .dl button,.dl a{font-size:12.5px;text-decoration:none;color:var(--ink);background:var(--bg2);
    border:1px solid var(--line);padding:8px 13px;border-radius:9px;cursor:pointer}
  .dl button:hover,.dl a:hover{border-color:var(--terra);color:#fff}
  footer{margin-top:42px;color:var(--dim);font-size:11.5px;line-height:1.7;border-top:1px solid var(--line);padding-top:16px}
  a.lnk{color:var(--amber);text-decoration:none}
  .err{color:#e2785c;font:13px/1.5 ui-monospace,monospace;margin-top:8px}
</style>
</head>
<body>
<div class="wrap">
  <div class="kicker">Wolfgang · composition</div>
  <h1>${title}<span class="free">composé · gratuit</span></h1>
  <div class="sub">Écrit comme des notes (pas de l'audio) — gravé, jouable, exportable. Appuie sur play : le curseur suit la partition.</div>

  <div class="paper"><div id="paper"></div></div>
  <div id="audio"></div>
  <div class="err" id="err"></div>

  <div class="dl">
    <button id="dl-midi">⤓ MIDI</button>
    <button id="dl-abc">⤓ Source ABC</button>
    ${musicxml_button}
  </div>

  <footer>
    Gravure + lecture : <a class="lnk" href="https://www.abcjs.net" target="_blank" rel="noopener">abcjs</a>.
    Composé symboliquement (le modèle écrit les notes) — aucun crédit, aucun compte.
    Pour un son riche et produit (au prix de ne pas avoir de partition), c'est l'autre voie : Sonilo / higgsfield-generate.
  </footer>
</div>

<script>
  const ABC = ${abc};

  // Highlight the notes as they play (the cursor following the score).
  function CursorControl() {
    this.onEvent = function(ev) {
      document.querySelectorAll(".abcjs-highlight").forEach(function(el){ el.classList.remove("abcjs-highlight"); });
      if (!ev || !ev.elements) return;
      ev.elements.forEach(function(set){ set.forEach(function(el){ el.classList.add("abcjs-highlight"); }); });
    };
    this.onFinished = function() {
      document.querySelectorAll(".abcjs-highlight").forEach(function(el){ el.classList.remove("abcjs-highlight"); });
    };
  }

  const visualObj = ABCJS.renderAbc("paper", ABC, { responsive: "resize", add_classes: true });

  if (ABCJS.synth.supportsAudio()) {
    const synthControl = new ABCJS.synth.SynthController();
    synthControl.load("#audio", new CursorControl(),
      { displayLoop: true, displayRestart: true, displayPlay: true, displayProgress: true, displayWarp: true });
    synthControl.setTune(visualObj[0], false, { chordsOff: false })
      .catch(function(e){ document.getElementById("err").textContent = "Synth: " + e; });
  } else {
    document.getElementById("audio").textContent = "Lecture audio non supportée par ce navigateur (la partition reste lisible).";
  }

  function download(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
  }
  document.getElementById("dl-midi").addEventListener("click", function(){
    try {
      const midi = ABCJS.synth.getMidiFile(ABC, { midiOutputType: "binary" });
      download(new Blob([midi], { type: "audio/midi" }), "${slug}.mid");
    } catch(e){ document.getElementById("err").textContent = "MIDI: " + e; }
  });
  document.getElementById("dl-abc").addEventListener("click", function(){
    download(new Blob([ABC], { type: "text/plain" }), "${slug}.abc");
  });
</script>
</body>
</html>
""")


def main():
    ap = argparse.ArgumentParser(description="Render an ABC score to a self-contained HTML page (engrave + play).")
    ap.add_argument("--abc", help="path to a .abc file")
    ap.add_argument("--abc-text", help="ABC source inline (alternative to --abc)")
    ap.add_argument("--out", default=None, help="output html path (default ./out/index.html)")
    ap.add_argument("--title", default=None, help="page title (default: T: field or filename)")
    ap.add_argument("--no-musicxml", action="store_true", help="skip the music21 MusicXML export")
    args = ap.parse_args()

    if args.abc:
        abc_path = Path(args.abc).expanduser()
        if not abc_path.exists():
            _die(f"ABC file not found: {abc_path}")
        abc_text = abc_path.read_text(encoding="utf-8")
        default_out = abc_path.parent / "index.html"
    elif args.abc_text:
        abc_text = args.abc_text
        default_out = Path("./out/index.html")
    else:
        _die("provide --abc <file> or --abc-text <source>")

    # Title: explicit, else the ABC T: field, else a default.
    title = args.title
    if not title:
        for line in abc_text.splitlines():
            if line.startswith("T:"):
                title = line[2:].strip()
                break
        title = title or "Score"

    out_path = Path(args.out).expanduser() if args.out else default_out
    out_path.parent.mkdir(parents=True, exist_ok=True)
    slug = "".join(c if c.isalnum() or c in "-_" else "-" for c in title).strip("-").lower() or "score"

    musicxml_button = ""
    if not args.no_musicxml:
        xml_path, xml_uri = _maybe_musicxml(abc_text, out_path.parent, slug)
        if xml_uri:
            musicxml_button = f'<a download="{slug}.musicxml" href="{xml_uri}">⤓ MusicXML (MuseScore)</a>'
            print(f"  + MusicXML → {xml_path}", file=sys.stderr)
        else:
            print("  (no MusicXML — install music21 for MuseScore export: uv pip install music21)", file=sys.stderr)

    html = PAGE.substitute(
        title=title, slug=slug, abc=_js_string(abc_text), musicxml_button=musicxml_button,
    )
    out_path.write_text(html, encoding="utf-8")
    print(f"✓ page → {out_path}", file=sys.stderr)
    print(str(out_path))


if __name__ == "__main__":
    main()
