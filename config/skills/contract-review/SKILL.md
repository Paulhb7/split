---
name: contract-review
description: Review a contract the user RECEIVED — a structured risk read, clause-by-clause, with a 🔴🟡🟢 severity map, the wording to push back with, and an optional redline memo shipped as .docx. The inverse of legal-templates (which DRAFTS): this skill READS an inbound agreement (NDA, service/MSA, ToS, employment offer, lease, DPA, partnership) and tells the boss what to worry about and what to ask for. Bilingual EN // FR, jurisdiction-aware (FR Code du travail / RGPD defaults, US/EN variants), reply in the user's language. Reads an optional house playbook from the vault if present and degrades cleanly if not. Use whenever the user pastes or attaches a contract and asks "what's the risk?", "should I sign this?", "review this", or "what should I negotiate?". Clean-room — written for Split, not vendored. Non-legal-advice disclaimer baked in.
---

# Contract Review

The boss received a contract from the other side. This skill reads it
and turns it into a decision: **what's dangerous, what's negotiable,
what's fine, and the exact wording to counter with.** It is the
*inbound* counterpart to `legal-templates` (which produces *outbound*
documents). **Clean-room** — written for Split, no clauses lifted from
any provider.

The deliverable is usually the **chat answer** (a risk map). Ship a
`.docx` redline memo only when the boss wants something to forward or
archive — via the `docx` skill.

## When to use

| Trigger phrase                                              | This skill?                                              |
| ----------------------------------------------------------- | -------------------------------------------------------- |
| "Review this contract / clause", "should I sign this?"      | **Yes** — the core case                                  |
| "What's the risk in this NDA / MSA / lease / offer?"        | **Yes**                                                  |
| "What should I push back on?"                               | **Yes** — risk map + counter-wording                     |
| "They sent counter-edits — accept or reject?"               | **Yes** — redline triage (Stage 4 of the persona)        |
| "Draft me an NDA / a privacy policy"                        | No → `legal-templates` (outbound drafting)               |
| "What does *force majeure* mean?"                           | No → answer in chat, concept question                    |
| "Translate this contract to Korean law"                     | Decline — different legal system, recommend local counsel |

If there is no contract text to read, **ask the boss to paste or attach
it** before doing anything else. Never review a contract you haven't seen.

## The optional house playbook

Before reviewing, check for a house playbook at
`$SPLIT_VAULT/_meta/legal-playbook.md`. If it exists, **read it and
calibrate every flag to it** — the boss's standard positions, hard
"never accept" lines, and approval thresholds. A deviation from the
playbook is automatically at least 🟡.

If it does **not** exist, review against general principles and the
jurisdiction defaults below — and, once, offer to seed one:

> "I can save your standard positions to `_meta/legal-playbook.md` so
> future reviews flag deviations automatically. Want that? (~2 min.)"

Seed format (plain prose, editable — never YAML):

```markdown
# Legal playbook — <boss / company>

## Posture
Default side: <buyer/customer | seller/vendor | varies>
Risk appetite: <conservative | balanced | aggressive>
Escalate to a licensed attorney above: <€/$ amount, or condition>

## Standard positions
- Limitation of liability: <cap we want · fallback we'll take · hard no>
- Indemnity: <mutual? IP indemnity must-have? caps?>
- IP ownership: <who owns deliverables / work product>
- Term & termination: <notice we want · auto-renewal stance>
- Data / RGPD: <DPA required? subprocessor approval? SCCs?>
- Governing law: <preferred · acceptable · never>

## The one thing
<the single clause that kills a deal for us>
```

Keep it sparse — only what the boss actually answers. Flag deltas
between stated positions and what they end up signing.

## Workflow

Mirror the persona's stop-gate discipline. State the mode in one line
at the top: `Mode: contract review · service agreement · FR · playbook: yes`.

### Stage 1 — Triage

1. **Identify the document type** (NDA, service/MSA, ToS, employment
   offer/contrat de travail, lease/bail, DPA, partnership, loan, …) and
   **which side the boss is on** (disclosing/receiving, buyer/seller,
   employer/employee). The same clause cuts differently by side.
2. **Identify the jurisdiction** — from the governing-law clause if the
   contract names one, else from the parties' countries. State it. If
   it's a system outside FR/US/EU general principles, say so and
   recommend local counsel for the verdict.
3. **NDA fast-path** — for a plain NDA, you may skip straight to the
   traffic-light triage below instead of the full clause sweep.

### Stage 2 — Risk map (the core deliverable)

Read the contract clause by clause against `references/clause-checklist.md`.
For each clause that matters, classify severity:

| Severity      | Meaning                                                              |
| ------------- | ------------------------------------------------------------------- |
| 🔴 **Blocker** | Don't sign as-is. Unlimited/uncapped liability, full IP assignment of pre-existing work, one-sided indemnity, no termination right, illegal/unenforceable term, RGPD non-compliance with personal data. |
| 🟡 **Negotiate** | Acceptable but worse than market / worse than the playbook. Push back; name the fallback you'd accept. |
| 🟢 **Acceptable** | Standard / fair. Mention only if the boss asked for a full sweep. |

Output, **in the user's language**, lead with the verdict:

1. **One-line verdict** — "Signable after 3 fixes" / "Don't sign — 2 blockers" / "Fine as-is".
2. **Risk map** — a table or list, severity-sorted (🔴 first). Each row:
   the clause (with its section number from the document), *why* it's a
   risk *to the boss's side*, and the **counter-wording** to propose.
   Quote the contract's actual language when flagging it.
3. **Missing clauses** — protections a contract of this type should have
   and this one lacks (e.g. no liability cap, no termination for
   convenience, no data-protection addendum where personal data flows).
4. **What's fine** — a short reassurance line so the boss knows you read
   the whole thing, not just the scary parts.

Never say "you can sign this as-is" without the disclaimer below.

### Stage 3 — Deliver (optional docx redline memo)

If the boss wants a document to forward to the counterparty or archive,
ship a `.docx` via the `docx` skill using the **Split memo structure**:
Kicker → Title → TL;DR (the verdict) → Risk map (the severity table) →
Counter-proposals (clause-by-clause old/new wording) → Recommendation
→ Disclaimer → Sources.

Conventions (match `legal-templates`): margins 2.5 cm, Calibri 11 body /
13 bold titles / 9 gray disclaimer, numbered sections, filename
`~/Desktop/contract-review-<short-purpose>-<YYYYMMDD>.docx`. Report the
absolute path; offer to `open` it (only after confirmation).

### Stage 4 — Redline triage (counter-edits)

When the boss receives the counterparty's edits, for each changed
clause give: **old wording → new wording → accept / reject / counter +
one-line rationale**. Tie each call back to the playbook or the risk map.

## Jurisdiction conventions

Same defaults as `legal-templates` (don't duplicate — reference its
table). Anchors that drive most flags:

| Concept                 | FR lens                                              | US/EN lens                                  |
| ----------------------- | ---------------------------------------------------- | ------------------------------------------- |
| Limitation of liability | Clause limitative valid but can't cover faute lourde / dol; consumer protections | Caps generally enforceable; watch carve-outs |
| Non-compete             | Must be limited in time/space + **financially compensated** (Code du travail) or void | "Reasonable" scope; some states void them (CA) |
| Personal data           | RGPD (Règlement (UE) 2016/679) — DPA + SCCs for transfers | CCPA/CPRA/state laws — name the relevant one |
| Employment              | CDI/CDD, préavis, rupture — Code du travail is mandatory | At-will unless stated                       |
| Auto-renewal            | Loi Chatel notice duties (consumer/B2C)              | Watch silent auto-renew + cancel windows    |

Cite real sources for non-obvious claims (article + code/regulation +
link to Légifrance / EUR-Lex / CFR). Never fabricate a citation; use
the harness's native web search for anything current or changing.

## Anti-patterns — refuse cleanly

| Request                                                       | Refuse because                                                  |
| ------------------------------------------------------------- | --------------------------------------------------------------- |
| "Just tell me it's fine so I can sign"                        | Decline the framing; give the honest risk map.                  |
| "Find a loophole to break this contract after signing"        | Hard no — that's bad-faith breach. Offer legitimate exit routes (termination clauses, vices du consentement) instead. |
| "Review this contract written in [system we don't cover]"     | Out of scope — flag general red flags only, recommend local counsel for the verdict. |
| "Ignore the data-protection issues, they don't matter"        | Don't suppress a 🔴 the boss asked you to find — RGPD non-compliance is a real exposure. |

## Limits

- A review is a **risk read, not a legal opinion.** Above the playbook's
  escalation threshold (or, absent one: > €/$100k, regulated industry,
  active dispute, cross-border, M&A) — say plainly the boss should have
  a **licensed attorney** review before signing.
- You only see what the boss pastes. Schedules, exhibits, and
  incorporated-by-reference documents you weren't given can change the
  analysis — say so when they're referenced but missing.
- **Non-legal-advice disclaimer is non-negotiable** on any shipped memo:
  one line, before the signature/sources block — *"This is a risk
  assessment for discussion, not legal advice, and not a substitute for
  a licensed attorney."* / *"Ceci est une analyse de risque pour
  discussion, non un avis juridique, et ne remplace pas un avocat."*
