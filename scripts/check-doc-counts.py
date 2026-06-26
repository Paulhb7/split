#!/usr/bin/env python3
"""Single source of truth for the roster/harness/skill counts quoted in docs.

`config/` is authoritative. This script computes the real counts from it and
checks that the headline numbers in README.md and AGENTS.md still match, so the
"31 experts / 12 experts / 11 experts" drift the docs accumulated can't come
back silently. Run it in pre-commit and CI.

    python3 scripts/check-doc-counts.py        # check, exit 1 on mismatch
    python3 scripts/check-doc-counts.py --show  # just print the canonical counts

When a count is wrong the output tells you the file, the expected value (from
config/) and what the doc currently says — fix the doc, not this script.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config"


def canonical_counts() -> dict[str, int]:
    experts = {
        k: v for k, v in json.loads((CONFIG / "experts.json").read_text()).items() if k != "_comment"
    }
    harnesses = [k for k in json.loads((CONFIG / "harnesses.json").read_text()) if k != "_comment"]
    skills = [d for d in (CONFIG / "skills").iterdir() if (d / "SKILL.md").is_file()]
    active = [k for k, v in experts.items() if v.get("status", "active") != "next"]
    return {
        "experts": len(experts),
        "experts_active": len(active),
        "harnesses": len(harnesses),
        "skills": len(skills),
    }


# (file, regex with ONE numeric capture group, count-key, human label).
# Add a row here whenever a doc starts quoting a count that should stay honest.
CHECKS = [
    ("README.md", r"## Experts \((\d+) in the roster", "experts", "README roster header"),
    ("README.md", r"## Harnesses \(the agents [—-]+ (\d+) configured\)", "harnesses", "README harness header"),
    ("README.md", r"currently (\d+) vendored", "skills", "README skills caveat"),
    ("README.md", r"\((\d+), grouped\)", "skills", "README skills list header"),
    ("README.md", r"the (\d+) HARNESSES", "harnesses", "README repo-layout harnesses"),
    ("README.md", r"the (\d+) EXPERTS", "experts", "README repo-layout experts"),
    ("AGENTS.md", r"the (\d+) harnesses, the (\d+) experts", "harnesses", "AGENTS overview harnesses"),
    ("AGENTS.md", r"the \d+ harnesses, the (\d+) experts", "experts", "AGENTS overview experts"),
]


def main() -> int:
    counts = canonical_counts()
    if "--show" in sys.argv:
        for k, v in counts.items():
            print(f"{k:16} {v}")
        return 0

    failures: list[str] = []
    missing: list[str] = []
    for fname, pattern, key, label in CHECKS:
        text = (ROOT / fname).read_text()
        m = re.search(pattern, text)
        if not m:
            missing.append(f"  {fname}: pattern not found for {label!r} (/{pattern}/)")
            continue
        found = int(m.group(1))
        if found != counts[key]:
            failures.append(
                f"  {fname}: {label} says {found}, config has {counts[key]} ({key})"
            )

    if missing:
        print("doc-count check: patterns went stale (doc reworded?) — update CHECKS:")
        print("\n".join(missing))
    if failures:
        print("doc-count check FAILED — config/ is the source of truth:")
        print("\n".join(failures))
    if missing or failures:
        print("\ncanonical counts:", ", ".join(f"{k}={v}" for k, v in counts.items()))
        return 1

    print("doc-count check ok:", ", ".join(f"{k}={v}" for k, v in counts.items()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
