# Model audit checklist

Two columns of checks: what **`scripts/scan.py` detects mechanically**,
and what **you (the agent) must judge** by reading the model. Run the
scanner first, then work this list against the model's structure and
the scan JSON. Trace from the outputs the boss relies on backward — a
defect in a cell nothing depends on is cosmetic.

## Mechanical — the scanner flags these (confirm in context)

| Check | Scanner finding | Typical 🔴 trap |
| ----- | --------------- | --------------- |
| Error cells | `error_cell` | `#REF!` / `#DIV/0!` / `#VALUE!` in the calc path → outputs are garbage |
| Overwritten formula | `overwritten_formula` | A hard number typed over a dragged formula → that period silently stops calculating |
| Circular reference | `circular_ref` | Cycle feeding an output → Excel iterates or returns 0; the number is meaningless |
| External link | `external_link` | `[Book.xlsx]` reference → breaks the moment the file is shared or the source moves |
| Hardcode in formula | `hardcode_in_formula` | A magic `1.1` growth / `0.08` WACC embedded in a calc instead of referenced from Assumptions → can't be flexed, easy to miss |

A scanner hint is a *candidate*. A `2` in `=SUM/2` (an average) or `12`
(months) is usually fine — don't report it. A literal growth rate,
discount rate, tax rate, or multiple embedded in a formula is a real
finding.

## Financial-logic — only you can judge these

| Check | How to verify | Severity if it fails |
| ----- | ------------- | -------------------- |
| **Balance sheet ties** | Assets = Liabilities + Equity, **every period**, within rounding | 🔴 always |
| **NI → retained earnings** | This period's net income increases retained earnings by the same amount (less dividends) | 🔴 |
| **Cash ties** | Ending cash on the cash-flow statement equals cash on the balance sheet, every period | 🔴 |
| **D&A consistency** | Depreciation/amortization is the same figure where it appears on IS, CF, and the PP&E roll-forward | 🔴 |
| **Debt / interest linkage** | Interest expense matches the debt schedule's rate × balance; debt roll-forward ties to the BS | 🟡–🔴 |
| **Sign conventions** | Costs/outflows treated consistently (all negative, or all positive-then-subtracted) — no mixed signs double-counting | 🔴 if it flips an output |
| **Unit consistency** | No mixing $, $000s, $M, or % vs decimal across cells that feed each other | 🔴 if it scales an output |
| **Sensitivity moves** | Flex a key driver (growth, WACC, margin); the headline output **must** change. No change = broken link, not robustness | 🔴 |
| **Assumptions centralized** | Drivers live on an Assumptions sheet and are referenced — not scattered as magic numbers (cross-ref the scanner's `hardcode_in_formula`) | 🟡 |
| **Plausibility** | Margins within −100%..100% where required; no negative revenue/headcount; growth in a sane band; no latent divide-by-zero | 🟡–🔴 by severity |
| **Stale dates / hardcoded year** | "Current year" or "today" hardcoded rather than driven by a single date cell | 🟡 |
| **Double-counting** | A line summed into a total *and* also included via another subtotal | 🔴 |

## Severity quick rule

- **🔴 Blocker** — anything that makes the headline output **wrong**:
  balance doesn't tie, error/circular ref in the calc path, overwritten
  formula, broken statement linkage, a hardcode overriding a driver,
  sign/unit error that scales the answer, output that won't move.
- **🟡 Warning** — fragile or sloppy but not wrong today: magic number
  on a non-driver, external link, unit ambiguity, implausible-but-
  possible value, stale date.
- **🟢 Pass** — checks that came back clean. Name them so the boss knows
  the whole model was looked at, not just the broken parts.
