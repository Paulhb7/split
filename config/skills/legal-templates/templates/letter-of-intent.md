---
slug: letter-of-intent
title: Letter of Intent / Lettre d'Intention
jurisdictions: [FR, US]
placeholders:
  - SENDER_NAME            # the party signing the LOI (founder, acquirer, investor, employer)
  - SENDER_ADDRESS
  - RECIPIENT_NAME         # the counterparty
  - RECIPIENT_ADDRESS
  - DEAL_TYPE              # one of: acquisition / investment / partnership / employment / commercial supply
  - DEAL_OUTLINE           # the contour, 3-6 short bullets specific to DEAL_TYPE
  - KEY_TERMS              # numerical terms — price, equity %, salary, term length, etc.
  - EXCLUSIVITY_DAYS       # default 30 (or 0 / "no exclusivity")
  - EXPIRATION_DATE        # the LOI is null if not countersigned by this date
  - GOVERNING_LAW
  - JURISDICTION_VENUE
  - EFFECTIVE_DATE
optional_clauses:
  - confidentiality        # standalone confidentiality if no separate NDA
  - break_fee              # cost owed by a party that walks
  - announcement_lockup    # neither party can announce until definitive agreement
  - due_diligence          # right of access to records during exclusivity
---

# Letter of Intent

**Date:** {EFFECTIVE_DATE}

**From:** {SENDER_NAME}, {SENDER_ADDRESS}
**To:** {RECIPIENT_NAME}, {RECIPIENT_ADDRESS}

**Re:** {DEAL_TYPE}

Dear {RECIPIENT_NAME},

This letter sets out the principal terms on which {SENDER_NAME} ("**Sender**") and {RECIPIENT_NAME} ("**Recipient**") (each a "**Party**", together the "**Parties**") propose to proceed with the {DEAL_TYPE} described below (the "**Transaction**"). Except as expressly stated in Sections 6 to 10, this letter is **non-binding** and is intended to memorialise the Parties' current understanding pending negotiation of definitive agreements.

## 1. The Transaction

{DEAL_OUTLINE}

## 2. Principal Terms

The Parties' current understanding on the key terms is as follows:

{KEY_TERMS}

These terms are indicative and subject to (a) confirmatory due diligence, (b) board / investment-committee approval as applicable to each Party, and (c) execution of mutually acceptable definitive agreements.

## 3. Conditions

The Transaction is subject to the following conditions, each to be satisfied or waived by the Party for whose benefit it exists:
(a) satisfactory completion of legal, financial, technical, and other due diligence by Sender;
(b) approval by the governing bodies of each Party (board of directors, shareholders, partners) as required;
(c) absence of any material adverse change in the business, condition, or prospects of the other Party between the date of this letter and signing of the definitive agreements;
(d) execution and delivery of all definitive agreements, in form and substance reasonably satisfactory to the Parties.

## 4. Process and Timing

The Parties will use reasonable efforts to negotiate and execute definitive agreements on or before {EXPIRATION_DATE}. If definitive agreements have not been signed by that date, this letter expires automatically, unless extended in writing by mutual agreement.

## 5. Costs

Each Party bears its own costs (legal, accounting, advisory, due-diligence) in connection with the Transaction, regardless of whether it closes.

## 6. Exclusivity (binding)

For {EXCLUSIVITY_DAYS} days from the date of this letter (the "**Exclusivity Period**"), Recipient and its representatives shall not, directly or indirectly:
(a) solicit, encourage, or accept any offer or proposal from a third party in relation to a transaction substantially similar to or in competition with the Transaction;
(b) provide non-public information about Recipient (or, where relevant, the target) to any such third party;
(c) negotiate with any such third party in relation to a competing transaction.

Recipient shall notify Sender promptly of any unsolicited approach received during the Exclusivity Period regarding a competing transaction.

If {EXCLUSIVITY_DAYS} is zero or this Section is deleted, no exclusivity applies.

## 7. Confidentiality (binding) (optional)

[OPTIONAL — confidentiality]
The Parties shall keep confidential the existence and content of this letter and all non-public information exchanged in connection with the Transaction, and shall not disclose such information to any third party except (a) to their representatives on a need-to-know basis under equivalent confidentiality obligations, (b) as required by law, regulation, or competent authority (with prior notice where lawful), or (c) as may be agreed in writing. This obligation survives termination of this letter for two (2) years.

If the Parties have already signed a separate NDA covering the same subject matter, that NDA governs and this Section does not apply.

## 8. Break Fee (binding) (optional)

[OPTIONAL — break_fee]
If Recipient breaches Section 6 (Exclusivity) and enters into a competing transaction with a third party during the Exclusivity Period, Recipient shall pay Sender a break fee equal to {KEY_TERMS:break_fee_amount}, as liquidated damages and not as a penalty. The Parties acknowledge that this amount is a reasonable estimate of Sender's costs and lost opportunity.

## 9. Announcement Lockup (binding) (optional)

[OPTIONAL — announcement_lockup]
Neither Party shall make any public announcement regarding the Transaction or this letter without the other Party's prior written consent, except as required by law, regulation, or stock-exchange rule (with prior notice where lawful).

## 10. Governing Law and Disputes (binding)

This letter is governed by {GOVERNING_LAW}. Any dispute arising out of or in connection with the binding provisions of this letter (Sections 6 to 10) shall be submitted to the exclusive jurisdiction of the {JURISDICTION_VENUE}.

## 11. Non-Binding Nature

Except for Sections 6 to 10, which are binding, **this letter is not intended to create any legally binding obligation**, including any obligation to negotiate in good faith or to consummate the Transaction. A binding obligation arises only when the Parties execute definitive agreements containing all material terms.

---

*Disclaimer · This document was generated from Split's legal-templates library and is a starting point, not legal advice for a specific situation. LOIs are easy to get wrong — the line between "binding" and "non-binding" depends on the wording and the jurisdiction. Have this reviewed by a licensed attorney before signing.*

---

If the foregoing accurately reflects our understanding, please countersign in the space below and return one fully executed copy on or before {EXPIRATION_DATE}.

Yours sincerely,

For {SENDER_NAME}:                          Acknowledged and agreed, for {RECIPIENT_NAME}:

________________________________            ________________________________
Name:                                       Name:
Title:                                      Title:
Date:                                       Date:
