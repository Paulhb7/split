#!/usr/bin/env python3
"""
Deterministic sanity checker for grand-staff ABC before you build the page.

Catches the two errors that make a score look wrong or sound amateurish:
  1. **Bar-length errors** — a bar whose note durations don't sum to the metre.
  2. **Homorhythmic hands** — RH and LH sharing the same note-onset rhythm
     (lockstep), which sounds like a beginner. A good piano texture gives the
     LH an INDEPENDENT pattern (Alberti / broken chords / waltz / counterpoint).

It also reports **rhythmic variety** per voice (distinct note durations) so you
can tell a flat all-quarter-notes melody from a living one.

Usage:
    python check_abc.py piece.abc
    python check_abc.py --strict piece.abc      # non-zero exit if any issue

Best-effort parser (notes, chords, rests, broken rhythm, common tuplets,
accidentals, octaves) — not a full ABC engine; abcjs is the final word.
"""

import argparse
import re
import sys
from fractions import Fraction
from pathlib import Path

_QUOTED = re.compile(r'"[^"]*"')              # "Dm7" chord symbols
_DECO = re.compile(r'![^!]*!')                # !p! !fermata! decorations
_INLINE = re.compile(r'\[[A-Za-z]:[^\]]*\]')  # inline [K:..] etc. (NOT [V:..], handled earlier)
_GRACE = re.compile(r'\{[^}]*\}')             # {ag} grace notes
_TUPLET = re.compile(r'\((\d+)(?::(\d+))?(?::(\d+))?')


def _dur(s: str) -> Fraction:
    """Parse an ABC duration suffix: '', '2', '/', '//', '/2', '3/2'."""
    m = re.match(r'(\d*)(/*)(\d*)', s)
    num = int(m.group(1)) if m.group(1) else 1
    slashes, den_digits = m.group(2), m.group(3)
    if slashes:
        den = int(den_digits) if den_digits else 2 ** len(slashes)
    else:
        den = 1
    return Fraction(num, den)


def _tuplet_ratio(p: int, q):
    if q is None:
        q = {2: 3, 3: 2, 4: 3, 6: 2, 8: 3}.get(p, 2)
    return Fraction(q, p)


def parse_bars(body: str, unit: Fraction):
    """Return a list of bars; each bar is a list of note durations (whole-note
    fractions). Handles broken rhythm and simple tuplets."""
    body = _QUOTED.sub("", body)
    body = _DECO.sub("", body)
    body = _INLINE.sub("", body)
    body = _GRACE.sub("", body)

    bars, cur = [], []
    i, n = 0, len(body)
    tuplet_left, tuplet_ratio = 0, Fraction(1)
    pending = None  # broken-rhythm factor for the NEXT note

    def add(d):
        nonlocal tuplet_left, pending
        if tuplet_left > 0:
            d *= tuplet_ratio
            tuplet_left -= 1
        if pending is not None:
            d *= pending
            pending = None
        cur.append(d)

    while i < n:
        c = body[i]
        two = body[i:i+2]
        if two in (":|", "|:", "|]", "[|", "||", "::"):
            bars.append(cur); cur = []; i += 2; continue
        if c == "|":
            bars.append(cur); cur = []; i += 1; continue
        mt = _TUPLET.match(body, i)
        if mt:
            p = int(mt.group(1)); q = mt.group(2)
            tuplet_ratio = _tuplet_ratio(p, int(q) if q else None)
            tuplet_left = int(mt.group(3)) if mt.group(3) else p
            i = mt.end(); continue
        if c == ">":   # prev note dotted, next halved
            if cur:
                cur[-1] *= Fraction(3, 2)
            pending = Fraction(1, 2); i += 1; continue
        if c == "<":   # prev note halved, next dotted
            if cur:
                cur[-1] *= Fraction(1, 2)
            pending = Fraction(3, 2); i += 1; continue
        if c == "[":   # chord [..]dur
            j = body.find("]", i)
            if j == -1:
                break
            k = j + 1; ds = ""
            while k < n and (body[k].isdigit() or body[k] == "/"):
                ds += body[k]; k += 1
            add(_dur(ds) * unit); i = k; continue
        if c in "^_=":  # accidental(s) before a note
            while i < n and body[i] in "^_=":
                i += 1
            continue
        if c in "ABCDEFGabcdefgxyzZ":
            i += 1
            while i < n and body[i] in ",'":
                i += 1
            ds = ""
            while i < n and (body[i].isdigit() or body[i] == "/"):
                ds += body[i]; i += 1
            add(_dur(ds) * unit); continue
        i += 1  # ties, slurs, spaces, misc

    if cur:
        bars.append(cur)
    return bars


def main():
    ap = argparse.ArgumentParser(description="Sanity-check grand-staff ABC.")
    ap.add_argument("abc", help="path to .abc file")
    ap.add_argument("--strict", action="store_true", help="exit 1 on any issue")
    args = ap.parse_args()

    text = Path(args.abc).expanduser().read_text(encoding="utf-8")

    L, M = Fraction(1, 8), (4, 4)
    for line in text.splitlines():
        if line.startswith("L:"):
            try:
                a, b = line[2:].strip().split("/"); L = Fraction(int(a), int(b))
            except Exception:
                pass
        elif line.startswith("M:"):
            mm = line[2:].strip()
            if mm in ("C", "C|"):
                M = (4, 4)
            elif "/" in mm:
                try:
                    a, b = mm.split("/"); M = (int(a), int(b))
                except Exception:
                    pass
    expected = Fraction(M[0], M[1])

    # collect voice bodies
    voices, order = {}, []
    for raw in text.splitlines():
        s = raw.strip()
        if not s or s.startswith("%"):
            continue
        m = re.match(r'^\[V:([^\]]+)\]\s*(.*)$', s)
        if m:
            vid, body = m.group(1).strip(), m.group(2)
        elif re.match(r'^[A-Za-z]:', s):
            continue  # header field (X T M L K Q V: ...)
        else:
            vid, body = "_", s
        if vid not in voices:
            voices[vid] = []; order.append(vid)
        voices[vid].append(body)

    issues = 0
    onset_rhythm = {}
    print(f"metre M:{M[0]}/{M[1]}  unit L:{L}  → {expected} per bar\n")
    for vid in order:
        bars = parse_bars(" ".join(voices[vid]), L)
        all_durs = [d for bar in bars for d in bar]
        onset_rhythm[vid] = all_durs
        sums = [sum(bar, Fraction(0)) for bar in bars]
        bad = []
        for idx, ssum in enumerate(sums):
            is_edge = idx == 0 or idx == len(sums) - 1
            if ssum != expected and not (is_edge and ssum < expected):
                bad.append((idx + 1, ssum))
        variety = len(set(all_durs))
        verdict = "✗ bar errors" if bad else ("⚠ flat" if variety <= 1 else "✓")
        print(f" [{vid}] {len(bars)} bars · {len(all_durs)} notes · "
              f"{variety} distinct durations  {verdict}")
        for barno, val in bad:
            print(f"      bar {barno}: sums to {val}, expected {expected}")
            issues += 1
        if variety <= 1 and all_durs:
            print(f"      → only one note-length used: rhythm is flat. Vary it "
                  f"(mix eighths/quarters/dotted, give it a rhythmic motif).")
            issues += 1

    # homorhythm: identical note-onset rhythm between the two hands = lockstep
    vids = [v for v in order if v != "_"]
    if len(vids) >= 2:
        a, b = onset_rhythm[vids[0]], onset_rhythm[vids[1]]
        if a == b and len(a) > 6:
            print(f"\n ⚠ HANDS ARE HOMORHYTHMIC: [{vids[0]}] and [{vids[1]}] share the "
                  f"exact note-onset rhythm. Give the LH an independent pattern "
                  f"(Alberti / broken chords / waltz oom-pah / counterpoint).")
            issues += 1

    print(f"\n{'ISSUES: ' + str(issues) if issues else 'clean ✓'}")
    if issues and args.strict:
        sys.exit(1)


if __name__ == "__main__":
    main()
