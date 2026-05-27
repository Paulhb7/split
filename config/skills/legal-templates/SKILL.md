---
name: legal-templates
description: A clean-room library of legal-document templates — NDAs (mutual + unilateral), service agreements, Terms of Service, GDPR-compliant Privacy Policies, IP assignments, Letters of Intent, founders' agreements — with placeholder fields, FR / US variants where relevant, and a baked-in non-legal-advice disclaimer. Use whenever the user asks to draft, generate, prepare, or review one of these documents. Output is rendered to .docx via the docx skill. The library is intentionally narrow — common contracts, not exotic ones — and biased toward French defaults (Code du travail, RGPD) when jurisdiction is unspecified, since Split's primary audience is French-speaking.
---

# Legal Templates

A bibliothèque of contract templates you fill from the brief and ship
as `.docx`. **Clean-room** — written for Split, not vendored from a paid
provider. **Use** the `docx` skill for the actual `.docx` output; this
skill provides the *content* (clauses, structure, placeholders).

## When to use

| Trigger phrase                                          | This skill?                          |
| ------------------------------------------------------- | ------------------------------------ |
| "Draft me an NDA / a service agreement / a privacy policy" | Yes                              |
| "I need a Terms of Service for my SaaS"                 | Yes                                  |
| "Review this contract I received"                       | No — answer in chat from the persona, or escalate to a `pdf` skill if available |
| "What does *force majeure* mean?"                       | No — answer in chat, this is a concept question, not a document |
| "Send me an NDA in Mandarin / Polish / etc."            | Decline politely — templates are FR / EN only; recommend a licensed attorney in that jurisdiction |

If the user wants written legal *advice* (an opinion, a comparison, a
risk flag), that's the Lawyer persona answering in chat. If they want a
*document* they can sign or hand to a counterparty, that's this skill.

## Template library

All templates live under `templates/`. Each is a markdown file with
front-matter declaring `jurisdictions`, required `placeholders`, and an
`optional_clauses` list. The agent reads the chosen template, fills the
placeholders from the brief, deletes optional clauses the user doesn't
need, and ships via the `docx` skill.

| Slug                       | What it is                                                                  | Default jurisdiction | Typical placeholders                                      |
| -------------------------- | --------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------- |
| `nda-mutual`               | Bilateral NDA between two parties pre-discussion                            | FR + US variants     | parties, purpose, term, governing law                     |
| `nda-unilateral`           | One-way NDA where one party discloses, the other receives                   | FR + US variants     | discloser, recipient, purpose, term                       |
| `service-agreement`        | Independent contractor / prestation de services / MSA + SOW shape           | FR (prestation) + US (MSA) | provider, client, scope, deliverables, fees, term, IP    |
| `privacy-policy-gdpr`      | GDPR-compliant privacy policy for a website / SaaS                          | EU (RGPD)            | company, DPO, data categories, legal bases, recipients, retention |
| `terms-of-service`         | ToS / CGU for a web app                                                     | FR + US variants     | service name, jurisdiction, liability cap, governing law  |
| `ip-assignment`            | Standalone IP assignment (e.g. work-for-hire, founder → company at incorp)  | FR + US variants     | assignor, assignee, IP definition, consideration          |
| `letter-of-intent`         | LOI / lettre d'intention pre-deal (M&A, partnership, employment)            | FR + US variants     | parties, deal contour, exclusivity, expiration            |
| `founders-agreement`       | Founders' agreement / pacte d'associés (vesting, IP, decisions)             | FR (SAS) + US (Delaware Inc.) | founders, equity split, vesting schedule, cliff      |

If the user asks for a template not in this list, **say it's
out-of-library** and offer to either:
- Adapt the closest template with caveats, OR
- Ship a memo (via `docx`) instead of a template, OR
- Recommend a specialised provider / licensed attorney for that doc.

Do not invent templates this skill doesn't ship.

## Workflow

### Step 1 — Pick the template

Read the user's request. Match to a slug in the library. If the
jurisdiction is ambiguous, **ask once**: "FR or US version?". Default
FR if the user is clearly French-speaking and doesn't specify.

### Step 2 — Gather the placeholders

Each template declares a list of required fields. Ask the user once,
in a numbered list, for the missing ones:

```
To draft the NDA I need:
1. The two parties' legal names + countries
2. The purpose of the discussion (one sentence)
3. The term — months of confidentiality (default: 24)
4. Governing law (default: French law if the receiver is in France)
```

For sensible defaults, **propose them** instead of asking blindly:
- Term of NDA: 24 months
- Term of ToS / Privacy Policy: continuous, with the right to update
- Governing law: French law if a party is French, otherwise ask
- Currency: EUR for FR, USD for US, otherwise ask
- Liability cap: 12 months of fees paid

### Step 3 — Fill and curate

Read the template file. Replace placeholders with the user's answers.
Decide which **optional clauses** to keep based on the brief:
- E-commerce SaaS → keep the auto-renewal and refund clauses
- Free tool → drop the payment, refund, and refund clauses
- B2B with EU customers → keep the GDPR controller / processor clauses

When you delete an optional clause, **don't leave numbered headings
that skip** (e.g. `5. … 7. …`). Renumber.

### Step 4 — Add the disclaimer (once)

At the **end** of the document, before signatures, insert:

> *This document was generated from a Split legal-templates library. It
> is a starting point, not legal advice for a specific situation. Before
> signing, have it reviewed by a licensed attorney in the relevant
> jurisdiction. Split and its operators decline any liability arising
> from use of this document as-is.*

In French:

> *Ce document a été généré à partir de la bibliothèque legal-templates
> de Split. Il constitue un point de départ et ne saurait remplacer
> l'avis d'un avocat compétent dans la juridiction concernée. Avant
> signature, faites-le relire par un professionnel du droit. Split et
> ses opérateurs déclinent toute responsabilité quant à son usage en
> l'état.*

**One disclaimer per document, not per section.** Insert it after the
last operative clause, before the signature block.

### Step 5 — Ship via docx

Use the `docx` skill to write the final `.docx`. Conventions:
- Margins 2.5cm
- Font: Calibri 11 for body, 13/bold for clause titles, 9/gray for the
  disclaimer paragraph
- Numbered clauses with `1.` `1.1` `1.1.1` (`python-docx` styles
  `Heading 2` / `Heading 3` / `Heading 4`)
- Signature block at the bottom: `_______ ___________ _______` lines for
  each party with their name and date typed below
- Save to `~/Desktop/<template-slug>-<short-purpose>-<YYYYMMDD>.docx`
  (e.g. `~/Desktop/nda-mutual-acme-talks-26may.docx`)

Report the absolute path. Offer to `open` it. Don't open without
confirmation.

## Jurisdiction conventions

When the user doesn't specify, default to:

| Concept                  | FR default                                | US default                                    |
| ------------------------ | ----------------------------------------- | --------------------------------------------- |
| Governing law            | "droit français" / "French law"           | Delaware (entity defaults) or NY (commercial) |
| Dispute resolution       | Tribunal de commerce du siège du demandeur | Courts of the State of [Delaware/NY], or AAA arbitration |
| Currency                 | EUR                                       | USD                                           |
| Confidentiality term     | 24 months post-disclosure                 | 3 years post-disclosure                       |
| Notice period (service)  | 30 days written notice                    | 30 days written notice                        |
| Limitation of liability  | 12 months of fees paid                    | 12 months of fees paid OR aggregate cap $X   |
| IP ownership default     | Client owns the deliverables; provider keeps generic tools / methodology | Same |
| Employment terms         | Code du travail (CDI / CDD / freelance — prestation de services) | At-will employment unless noted |
| Data protection          | RGPD (Règlement (UE) 2016/679)            | State laws (CCPA / CPRA / VCDPA / etc.) — name the relevant one |

State the chosen jurisdiction at the **top** of the document, not
buried in the boilerplate.

## Anti-patterns — refuse cleanly

| Request                                                          | Refuse because                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------- |
| "Make this template enforceable in [jurisdiction we don't cover]" | Outside the library scope — recommend an attorney in that jurisdiction |
| "Drop the disclaimer, it's annoying"                              | The disclaimer is non-negotiable — it's what makes shipping these templates ethical |
| "Make it more aggressive / harsh to one party"                    | Decline the framing; offer balanced clauses + flag where the user could ask for more in negotiation |
| "Generate something I'll use to defraud / hide assets / evade tax" | Hard no. Surface the concern, do not produce the document. |
| "Translate this French contract into a Korean one"                | Decline — language is not the issue, the legal system is. Recommend a local attorney. |

## Limits

- This library covers **common** contracts only. Anything specialised
  (regulatory filings, M&A, IP litigation, regulated industries) needs
  a licensed attorney.
- Templates are **starting points** — never tell the user "you can sign
  this as-is".
- **Real legal advice is not in scope.** If the user's situation has
  any complexity (multi-jurisdiction, employment dispute, ongoing
  litigation, M&A, regulated industry), point them to counsel.
