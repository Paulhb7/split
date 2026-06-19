#!/usr/bin/env python3
"""Mechanical first-pass scanner for a financial-model audit.

Emits a JSON of raw, structural findings. The agent reads this JSON and
adds the *financial-logic* layer on top (balance-sheet tie-out,
3-statement linkage, sign/unit conventions, plausibility) — things that
need semantic understanding of the model, not just cell mechanics.

Keyless, no network. Requires openpyxl (already used by `market-data`).

Usage:
    python scan.py <model.xlsx> [--max-cells N]

Output (stdout): JSON
    {
      "file": "...", "sheets": [{name, cells, formulas, constants, errors}],
      "findings": [{type, severity, sheet, cell, detail, formula?}],
      "limits": [...]
    }

Severity is a *hint* — the agent makes the final call against the audit
checklist and the model's purpose.
"""
import json
import re
import sys

try:
    import openpyxl
    from openpyxl.utils import get_column_letter, column_index_from_string
except ImportError:
    print(json.dumps({"error": "openpyxl not installed — run: pip install openpyxl"}))
    sys.exit(1)

ERRORS = {"#REF!", "#DIV/0!", "#VALUE!", "#NAME?", "#N/A", "#NULL!", "#NUM!", "#SPILL!"}

# A1-style cell reference, not part of a longer token or a function call.
CELL_REF = re.compile(r"(?<![A-Za-z0-9_$.!])(\$?[A-Z]{1,3}\$?[0-9]+)(?![A-Za-z0-9_(])")
# External-workbook reference: [Book.xlsx] or [1] (linked-source index).
EXTLINK = re.compile(r"\[[^\]]*\]")
# Numeric literal inside a formula (not glued to a letter/$/. so cell refs and
# decimals-in-refs are excluded as much as a regex can).
NUM_LIT = re.compile(r"(?<![A-Za-z0-9_$.])-?[0-9]+(?:\.[0-9]+)?(?![A-Za-z0-9_.])")
# Numbers that are almost always structural, not assumptions worth surfacing.
BENIGN_NUMS = {"0", "1", "-1", "2", "3", "4", "12", "100", "365", "360",
               "1000", "10000", "100000", "1000000", "0.5", "24", "52", "7", "30"}


def is_formula(cell):
    return isinstance(cell.value, str) and cell.value.startswith("=")


def scan_workbook(path, max_cells=200000):
    wb_f = openpyxl.load_workbook(path, data_only=False, read_only=True)
    # Second pass with cached values to catch evaluated error results.
    try:
        wb_v = openpyxl.load_workbook(path, data_only=True, read_only=True)
    except Exception:
        wb_v = None

    findings = []
    sheets_meta = []
    limits = [
        "Circular-reference detection is same-sheet only (cross-sheet cycles not traced).",
        "Error detection on openpyxl-generated files only sees errors written as text, "
        "not cached evaluation results — open once in Excel for full error coverage.",
        "Hardcode and overwritten-formula flags are heuristics — the agent confirms each.",
    ]
    seen = 0

    for ws in wb_f.worksheets:
        n_cells = n_form = n_const = n_err = 0
        # Map of (row, col) -> "formula" | "const" for the overwrite heuristic.
        kind = {}
        formula_cells = []  # (row, col, formula_str)

        vsheet = wb_v[ws.title] if (wb_v and ws.title in wb_v.sheetnames) else None

        for row in ws.iter_rows():
            for cell in row:
                if cell.value is None:
                    continue
                seen += 1
                if seen > max_cells:
                    limits.append(f"Stopped at {max_cells} cells — model larger than scan cap.")
                    break
                n_cells += 1
                r, c = cell.row, cell.column
                ref = f"{get_column_letter(c)}{r}"

                if is_formula(cell):
                    n_form += 1
                    kind[(r, c)] = "formula"
                    f = cell.value
                    formula_cells.append((r, c, f))

                    # Error literal written into the formula text.
                    for e in ERRORS:
                        if e in f:
                            n_err += 1
                            findings.append({"type": "error_cell", "severity": "blocker",
                                             "sheet": ws.title, "cell": ref,
                                             "detail": f"Formula contains error token {e}.",
                                             "formula": f})
                            break

                    # External-workbook link.
                    if EXTLINK.search(f):
                        findings.append({"type": "external_link", "severity": "warning",
                                         "sheet": ws.title, "cell": ref,
                                         "detail": "Formula references another workbook — breaks when shared/moved.",
                                         "formula": f})

                    # Hardcoded magic number embedded in a calc.
                    refs_blanked = CELL_REF.sub(" ", f)
                    nums = [m for m in NUM_LIT.findall(refs_blanked) if m not in BENIGN_NUMS]
                    if nums:
                        findings.append({"type": "hardcode_in_formula", "severity": "warning",
                                         "sheet": ws.title, "cell": ref,
                                         "detail": f"Magic number(s) {sorted(set(nums))} inside a formula — "
                                                   f"should usually live on the Assumptions sheet and be referenced.",
                                         "formula": f})
                else:
                    # Cached error value (Excel-saved files).
                    val = None
                    if vsheet is not None:
                        try:
                            val = vsheet.cell(row=r, column=c).value
                        except Exception:
                            val = None
                    if isinstance(val, str) and val in ERRORS:
                        n_err += 1
                        findings.append({"type": "error_cell", "severity": "blocker",
                                         "sheet": ws.title, "cell": ref,
                                         "detail": f"Evaluated to {val}."})
                    if isinstance(cell.value, (int, float)):
                        n_const += 1
                        kind[(r, c)] = "const"
            else:
                continue
            break  # hit max_cells

        # Overwritten-formula heuristic: a numeric constant whose neighbours on
        # an axis are both formulas (someone typed over a dragged formula).
        for (r, c), k in kind.items():
            if k != "const":
                continue
            horiz = kind.get((r, c - 1)) == "formula" and kind.get((r, c + 1)) == "formula"
            vert = kind.get((r - 1, c)) == "formula" and kind.get((r + 1, c)) == "formula"
            if horiz or vert:
                axis = "row" if horiz else "column"
                findings.append({"type": "overwritten_formula", "severity": "blocker",
                                 "sheet": ws.title, "cell": f"{get_column_letter(c)}{r}",
                                 "detail": f"Hard number sitting between formula cells along its {axis} — "
                                           f"likely a formula overwritten by a typed value."})

        # Same-sheet circular references.
        for cyc in _find_cycles(formula_cells):
            findings.append({"type": "circular_ref", "severity": "blocker",
                             "sheet": ws.title, "cell": cyc[0],
                             "detail": "Same-sheet circular reference: " + " → ".join(cyc + [cyc[0]])})

        sheets_meta.append({"name": ws.title, "cells": n_cells, "formulas": n_form,
                            "constants": n_const, "errors": n_err})

    return {"file": path, "sheets": sheets_meta, "findings": findings, "limits": limits}


def _find_cycles(formula_cells):
    """Tiny same-sheet cycle finder over direct A1 references."""
    graph = {}
    for r, c, f in formula_cells:
        node = f"{get_column_letter(c)}{r}"
        deps = set()
        for m in CELL_REF.findall(f):
            deps.add(m.replace("$", ""))
        graph[node] = deps
    cycles = []
    WHITE, GRAY, BLACK = 0, 1, 2
    color = {n: WHITE for n in graph}

    def dfs(n, stack):
        color[n] = GRAY
        stack.append(n)
        for d in graph.get(n, ()):  # dep may be a constant cell (not in graph)
            if d not in graph:
                continue
            if color[d] == GRAY:
                if d in stack:
                    cycles.append(stack[stack.index(d):])
                return True
            if color[d] == WHITE and dfs(d, stack):
                return True
        stack.pop()
        color[n] = BLACK
        return False

    for n in list(graph):
        if color[n] == WHITE:
            if dfs(n, []):
                if len(cycles) >= 20:
                    break
    # De-dupe by frozenset of members.
    uniq, seen = [], set()
    for cyc in cycles:
        key = frozenset(cyc)
        if key not in seen:
            seen.add(key)
            uniq.append(cyc)
    return uniq


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print(json.dumps({"error": "usage: python scan.py <model.xlsx> [--max-cells N]"}))
        sys.exit(1)
    max_cells = 200000
    if "--max-cells" in sys.argv:
        try:
            max_cells = int(sys.argv[sys.argv.index("--max-cells") + 1])
        except (ValueError, IndexError):
            pass
    try:
        result = scan_workbook(args[0], max_cells=max_cells)
    except FileNotFoundError:
        print(json.dumps({"error": f"file not found: {args[0]}"}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": f"could not read workbook: {e}"}))
        sys.exit(1)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
