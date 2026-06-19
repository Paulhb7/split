#!/usr/bin/env python3
"""taste-design auditor — mechanical anti-generic checks, zero dependencies.

Usage:
    python3 audit.py <file> [<file> ...]

Behavior depends on extension:
  .html .htm .css .svg .jsx .tsx .vue .astro  → scan for "AI slop" tells
                                                 (banned fonts, pure black,
                                                 AI-purple gradients, h-screen,
                                                 copy clichés, fake metrics)
  .md                                          → lint a DESIGN.md for the
                                                 required sections (a spec
                                                 legitimately *names* the
                                                 banned tokens, so it is not
                                                 scanned for them)

A line containing the marker `taste-ok` is exempt from scan rules — use it
to annotate a deliberate choice (e.g. a true-black OLED splash).

Exit code is non-zero if any violation fires, so it slots into a
pre-handoff check. It catches mechanical tells only; taste is still the
agent's judgment. A hit means "look here", not "auto-fail".
"""
import re
import sys

# (category, regex, message). Case-insensitive. Applied to code-like files.
SCAN_RULES = [
    ("color",
     re.compile(r"#0{6}\b|#0{3}\b|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)", re.I),
     "pure black — use a near-black (#0a0a0b, #111014)"),
    ("color",
     re.compile(r"#(7c3aed|8b5cf6|6366f1|a855f7|9333ea|7e22ce|6d28d9|818cf8|4f46e5)\b"
                r"|\bblueviolet\b", re.I),
     "AI-purple/indigo hue — the clearest 'generated UI' tell"),
    ("type",
     re.compile(r"font[^;{}\n]*\b(Inter|Roboto|Arial)\b"
                r"|family=(Inter|Roboto)\b", re.I),
     "banned font (Inter/Roboto/Arial) — use Geist/Outfit/Cabinet Grotesk/…"),
    ("type",
     re.compile(r"font-family\s*:[^;{}\n]*\bsystem-ui\b\s*[;,}]", re.I),
     "system-ui as the chosen face — pick a distinctive font for premium UI"),
    ("layout",
     re.compile(r"\b(min-)?h-screen\b", re.I),
     "h-screen fails iOS Safari — use 100dvh"),
    ("copy",
     re.compile(r"\b(elevate|seamless|unleash|supercharge|revolutioniz\w*"
                r"|empower)\b|scroll to explore|get started in seconds", re.I),
     "AI copy cliché — write something specific"),
    ("content",
     re.compile(r"\b99\.9+\s*%|\b100\s*%\s*uptime", re.I),
     "looks like a fabricated metric — use real data or drop it"),
]

# Section headers a DESIGN.md must contain (matched case-insensitively as a
# substring of a markdown heading line).
REQUIRED_SECTIONS = [
    "atmosphere", "color", "typograph", "layout", "motion", "anti-pattern",
]


def scan_code(path, lines):
    hits = []
    for n, line in enumerate(lines, 1):
        if "taste-ok" in line:
            continue
        for cat, rx, msg in SCAN_RULES:
            m = rx.search(line)
            if m:
                hits.append((n, cat, m.group(0).strip(), msg))
    return hits


def lint_design_md(path, lines):
    text = "".join(lines).lower()
    headings = [l.lower() for l in lines if l.lstrip().startswith("#")]
    problems = []
    for sec in REQUIRED_SECTIONS:
        if not any(sec in h for h in headings):
            problems.append(f"missing section: '{sec}'")
    if "> **brief.**" not in text and "exec" not in text:
        problems.append("missing exec-summary 'Brief' header (see _discipline.md)")
    # a spec with no concrete hex roles is probably still a stub
    if not re.search(r"#[0-9a-f]{6}\b", text):
        problems.append("no concrete hex colors — the color system is still a stub")
    return problems


def main(argv):
    if not argv:
        print(__doc__)
        return 2
    total = 0
    for path in argv:
        try:
            with open(path, encoding="utf-8", errors="replace") as f:
                lines = f.readlines()
        except OSError as e:
            print(f"  ✗ {path}: {e}")
            total += 1
            continue

        ext = path.rsplit(".", 1)[-1].lower() if "." in path else ""
        print(f"\n▸ {path}")
        if ext == "md":
            problems = lint_design_md(path, lines)
            if not problems:
                print("  ✓ DESIGN.md has all required sections")
            for p in problems:
                print(f"  ✗ {p}")
            total += len(problems)
        else:
            hits = scan_code(path, lines)
            if not hits:
                print("  ✓ no mechanical slop tells found")
            for n, cat, frag, msg in hits:
                print(f"  ✗ L{n} [{cat}] {frag!r} — {msg}")
            total += len(hits)

    print(f"\n{'─' * 40}")
    if total:
        print(f"{total} violation(s). Review each — annotate deliberate "
              f"choices with a 'taste-ok' comment.")
    else:
        print("Clean. (Mechanical only — taste is still your call.)")
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
