---
name: model-audit
description: Audit a financial model (.xlsx) before anyone relies on its outputs — the QC counterpart to market-data (which BUILDS models). Catches the things that silently make a model wrong: hardcoded numbers overriding drivers, formulas overwritten by typed values, broken/external links, circular references, a balance sheet that doesn't tie, 3-statement links that don't flow, sign/unit inconsistencies, and outputs that don't move when an assumption moves. Runs a keyless openpyxl scanner (scripts/scan.py) for the mechanical layer, then the agent adds the financial-logic layer, and reports a severity-sorted findings list (🔴 blocker / 🟡 warning / 🟢 pass) with an optional annotated workbook. Use whenever the user wants to check, QC, debug, sanity-check, or "stress-test" a spreadsheet model — one Split built, one they built, or one they received. Clean-room — written for Split, not vendored.
---

# Model Audit

A model nobody checked is a model nobody should trust. This skill reads
a `.xlsx` financial model and tells the boss **what's broken, what's
fragile, and what's fine** — before the numbers go into a deck, a board
pack, or a decision. It is the QC counterpart to `market-data` (which
*builds* models). **Clean-room** — written for Split, no formulas or
checklists lifted from any provider.

The audit runs in **two layers**:

1. **Mechanical layer** — `scripts/scan.py` (keyless, openpyxl) scans
   every cell for structural defects and emits JSON. Deterministic and
   cheap; you don't hand-scan cells.
2. **Financial-logic layer** — *you* read the model's structure and the
   scan output and apply the judgment a scanner can't: does the balance
   sheet tie, do the three statements link, are signs and units
   consistent, do the outputs actually move when a driver moves.

## When to use

| Trigger phrase                                                     | This skill? |
| ------------------------------------------------------------------ | ----------- |
| "Check / QC / audit / debug this model", "is this model right?"    | **Yes** — the core case |
| "Sanity-check this spreadsheet before I send it"                   | **Yes**     |
| "Why doesn't my balance sheet tie?", "the cash flow looks off"     | **Yes**     |
| "Build me a DCF / 3-statement / budget"                            | No → `market-data` (building) |
| "Pull NVDA's latest price"                                         | No → `market-data` |
| There is no `.xlsx` to look at                                     | Ask the boss to attach/point to the file first |

Audit a model Split just built too — shipping a model *and* its audit is
stronger than shipping the model alone.

## Workflow

State the mode in one line at the top: `Mode: model audit · 3-statement.xlsx · 2 sheets`.

### Stage 1 — Scope

Open the workbook structure (sheet names, what each sheet is). Identify
the **model type** (DCF, LBO, 3-statement, budget/FP&A, comps, returns)
and **where the outputs live** (the cells the boss actually relies on).
If the model has an Assumptions sheet (Split's convention), note it — a
hardcode *outside* it is more suspicious than one on it.

### Stage 2 — Mechanical scan

Run the scanner:

```bash
python <model-audit-skill>/scripts/scan.py "<path-to-model.xlsx>"
```

It returns JSON with per-sheet counts and `findings[]`:
`error_cell` (🔴 #REF!/#DIV0! etc.), `overwritten_formula` (🔴 a typed
number between formula cells — a dragged formula someone clobbered),
`circular_ref` (🔴 same-sheet cycle), `external_link` (🟡 references
another workbook), `hardcode_in_formula` (🟡 magic number embedded in a
calc). Each `severity` is a **hint** — you confirm it in context (a
literal `1.1` growth factor is a real hardcode; a `2` in `=B2/2` for an
average may be fine).

### Stage 3 — Financial-logic layer (the judgment the scanner can't do)

Read the model and apply `references/audit-checklist.md`. The checks a
scanner can't make:

- **Balance sheet ties** — Assets = Liabilities + Equity, every period,
  within rounding. A break here is always 🔴.
- **3-statement linkage** — net income flows to retained earnings;
  D&A is consistent across IS/CF/BS; ending cash on the CF equals cash
  on the BS. Trace the links, don't assume them.
- **Sign conventions** — costs/outflows handled consistently (all
  negative, or all positive-then-subtracted — not a mix that
  double-counts a sign).
- **Unit consistency** — no mixing of $, $000s, $M, or % vs decimals
  across cells/sheets that feed each other.
- **Sensitivity actually moves** — flex a key driver (growth, WACC,
  margin) and confirm the headline output changes. An output that
  *doesn't* move is a broken link masquerading as robustness (the
  Financier's "a single-point answer that doesn't move is wrong" rule).
- **Plausibility** — margins within −100%..100% where they must be,
  no negative revenue, growth rates inside a sane band, no `inf` from a
  divide-by-zero waiting to happen.

### Stage 4 — Report

Lead with the verdict, then the findings, **in the user's language**:

1. **One-line verdict** — "Sound — 0 blockers" / "Don't rely on the
   outputs yet: 2 blockers, 4 warnings" / "Fixable in ~10 min".
2. **Findings table**, severity-sorted (🔴 first). Each row: location
   (`Sheet!Cell` or range), what's wrong, **why it changes the answer**,
   and the fix. Quote the offending formula.
3. **What passed** — a short line on the checks that came back clean, so
   the boss knows the whole model was looked at.

| Severity      | Examples |
| ------------- | -------- |
| 🔴 **Blocker** | Balance doesn't tie · error cell in the calc path · circular ref feeding an output · overwritten formula · hardcode overriding a driver · 3-statement link broken. |
| 🟡 **Warning** | Hardcode/magic number on a non-driver cell · external link · sign/unit ambiguity · implausible-but-not-impossible value · output insensitive to a minor driver. |
| 🟢 **Pass**    | Checks that came back clean. |

### Optional — annotated workbook

If the boss wants a fixable artefact (not just the chat report), write a
copy with the findings made visible (don't mutate the original):
highlight each flagged cell, add a cell comment with the finding, and
add an **`Audit`** sheet listing every finding (severity · location ·
issue · fix). Save to `~/Desktop/<model>-audit-<YYYYMMDD>.xlsx` via
`openpyxl` (same engine as `market-data`). Report the path; offer to
`open` (only after confirmation).

## Cross rules

- **Confirm heuristics in context.** The scanner flags candidates; a
  `2` in a denominator or a `12` for months may be legitimate. Don't
  report a 🟡 you've decided is fine — say it passed.
- **Always check the outputs path first.** A defect in a cell nothing
  depends on is cosmetic; a defect feeding the headline number is a
  blocker. Trace from the outputs back.
- **An audit is a correctness check, not a view on the assumptions.**
  Whether 8% WACC is *right* is the Financier's call elsewhere; whether
  the model *uses* 8% everywhere it should is the audit's call.

## Limits

- The scanner is **same-sheet** for circular refs and best-effort on
  cached error values (openpyxl-generated files surface errors as text;
  Excel-saved files carry cached results). State these limits if they
  bite — they're in the scan's `limits[]`.
- The audit reads what's **in the file**. Linked source workbooks,
  external data feeds, and macros (`.xlsm`) it can't follow — flag them
  as out-of-scope when present.
- An audit does not make the model *correct*, only *internally
  consistent and free of mechanical breaks*. Above real-money stakes,
  the Financier's "not a regulated advisor" disclaimer still applies.
