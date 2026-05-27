---
slug: founders-agreement
title: Founders' Agreement / Pacte d'Associés (early-stage)
jurisdictions: [FR, US]
placeholders:
  - COMPANY_NAME           # the company being founded — even if not yet incorporated, name it
  - COMPANY_FORM           # FR: "SAS" / "SARL"; US: "Delaware corporation" / "LLC"
  - COMPANY_ADDRESS_OR_TBD # exact registered office or "to be determined upon incorporation"
  - FOUNDERS               # list of founders with: name, address, role, equity %
  - VESTING_YEARS          # default 4
  - VESTING_CLIFF_MONTHS   # default 12
  - VESTING_FREQ           # default "monthly"
  - GOVERNING_LAW
  - JURISDICTION_VENUE
  - EFFECTIVE_DATE
optional_clauses:
  - good_leaver_bad_leaver # different vesting outcomes by reason of departure
  - drag_along             # majority can force minority to sell on a qualifying exit
  - tag_along              # minority can join a majority sale on the same terms
  - rofr                   # right of first refusal on share transfers
  - non_compete            # founders cannot compete during and X months after departure
  - founder_ip_assignment  # cross-reference to IP-assignment doc
---

# Founders' Agreement

**Effective Date:** {EFFECTIVE_DATE}

**Between the persons listed below as Founders**, each acting in their personal capacity, and **{COMPANY_NAME}**, a {COMPANY_FORM} with registered office at {COMPANY_ADDRESS_OR_TBD} (the "**Company**", and once incorporated also a party to this Agreement).

The Founders, each a "**Founder**" and together the "**Founders**", agree as follows.

## 1. Founders and Equity

The Founders are:

{FOUNDERS}

(Format: name · address · role/title · equity percentage. Example:
- *Alice Martin, Paris, CEO, 45%*
- *Bob Chen, San Francisco, CTO, 45%*
- *Carla Diaz, Berlin, Head of Design, 10%*)

The equity percentages reflect the agreed allocation at the date hereof and shall be implemented in the Company's capitalisation table upon incorporation (or, if already incorporated, immediately following execution of this Agreement). Aggregate equity allocated to Founders shall equal 100% of the issued and outstanding shares, subject to subsequent dilution from option pools and external investment.

## 2. Vesting

Each Founder's shares vest over {VESTING_YEARS} years from the Effective Date (or from the Founder's start date with the Company, whichever is later — the "**Vesting Start Date**"), with a {VESTING_CLIFF_MONTHS}-month cliff and {VESTING_FREQ} vesting thereafter.

Specifically:
- **Cliff**: a Founder vests no shares during the first {VESTING_CLIFF_MONTHS} months following their Vesting Start Date. On the cliff date, {VESTING_CLIFF_MONTHS} months' worth of shares vest in one tranche.
- **Post-cliff**: the remainder vests in equal {VESTING_FREQ} instalments over the balance of the {VESTING_YEARS}-year period.
- **Full acceleration on a change of control**: 100% of unvested shares vest on the closing of a sale of all or substantially all the Company's shares or assets.
- **Double-trigger acceleration**: 100% of unvested shares additionally vest if, within twelve (12) months following a change of control, the Founder is terminated without cause or resigns for good reason.

If a Founder ceases to be actively involved with the Company before full vesting, the unvested portion of that Founder's shares is repurchased by the Company at par value (or, where the law requires, at fair market value as determined by the Company's board), subject to Section 3.

## 3. Good Leaver / Bad Leaver (optional)

[OPTIONAL — good_leaver_bad_leaver]
"**Good Leaver**" means a Founder who ceases involvement by reason of death, long-term incapacity, retirement at statutory age, termination without cause by the Company, or resignation for good reason (a material reduction in role or compensation, or a relocation imposed by the Company).

"**Bad Leaver**" means a Founder who ceases involvement by reason of voluntary resignation without good reason within the first {VESTING_YEARS} years, termination for cause (gross misconduct, fraud, material breach of confidentiality, conviction for a serious offence), or material breach of this Agreement.

For a **Good Leaver**, the Company may repurchase the Founder's unvested shares at fair market value.
For a **Bad Leaver**, the Company may repurchase **all** of the Founder's shares (vested and unvested) at the lower of (a) the price the Founder paid, and (b) par value.

## 4. Roles and Commitment

Each Founder undertakes to dedicate substantially all of their professional time and effort to the Company until full vesting, in their respective role as identified in Section 1. Material changes in role or commitment require the prior written consent of all Founders.

## 5. Decisions

Decisions are taken collectively by the Founders, with one vote per Founder, unless this Agreement, the Company's bylaws, or applicable law provides otherwise. The following decisions require unanimous Founder consent:
(a) changing the Company's business or geography of operation;
(b) issuing new equity at a per-share price below the most recent priced round;
(c) selling all or substantially all assets;
(d) winding up or dissolving the Company;
(e) entering into a related-party transaction with any Founder for an amount exceeding €/$ 10,000 per year.

For all other matters, decisions are taken by majority of the Founders (with deadlock resolution by the CEO or, if the CEO is a party to the deadlock, by an independent mediator agreed in good faith).

## 6. Intellectual Property (optional)

[OPTIONAL — founder_ip_assignment]
Each Founder shall, contemporaneously with this Agreement, execute a standalone IP Assignment Agreement in favour of the Company covering all intellectual property created by such Founder in connection with the Company, whether before or after incorporation, on the terms set out in that separate document.

In any event, all intellectual property created by a Founder in the course of their work for the Company is and shall be the exclusive property of the Company, to the maximum extent permitted by applicable law.

## 7. Right of First Refusal (optional)

[OPTIONAL — rofr]
A Founder wishing to transfer any of their shares to a third party (other than to a permitted transferee — spouse, descendants, or a wholly-owned holding entity, subject to certain conditions) shall first offer the shares to the Company and, secondarily, to the other Founders, in proportion to their respective shareholdings. The offer shall match the bona fide terms offered by the third party. If the Company and the other Founders do not exercise within thirty (30) days, the Founder may transfer the shares on the same terms to that third party within sixty (60) days.

## 8. Tag-Along Right (optional)

[OPTIONAL — tag_along]
If one or more Founders (the "**Selling Founders**") propose to transfer shares representing more than 25% of the Company's share capital to a third party in a single transaction or series of related transactions, each remaining Founder has the right to require the third party to also purchase a proportional number of the remaining Founder's shares on the same terms and at the same price.

## 9. Drag-Along Right (optional)

[OPTIONAL — drag_along]
If Founders holding at least seventy-five percent (75%) of the share capital agree to a bona fide sale of one hundred percent (100%) of the Company to a third party (a "**Qualifying Exit**"), they may require the other Founders to sell their shares to that third party on the same terms and at the same price, provided the consideration is paid pro rata in cash or freely tradable securities and no Founder bears a disproportionate share of representations, warranties, or indemnities.

## 10. Non-Compete (optional)

[OPTIONAL — non_compete]
For the duration of their involvement with the Company and for twelve (12) months after departure, each Founder shall not directly or indirectly engage in any business that competes materially with the Company's business in the geographies where the Company operates, except with the prior written consent of the other Founders.

This restriction is limited to what is reasonably necessary to protect the Company's legitimate interests and may be reduced or set aside by a court if found excessive under applicable law.

## 11. Confidentiality

Each Founder shall keep confidential all non-public information of the Company received in their capacity as Founder, and shall not use it except for the benefit of the Company. This obligation survives departure for three (3) years.

## 12. Term

This Agreement enters into force on the Effective Date and continues until the earliest of:
(a) the sale of the Company;
(b) the listing of the Company's shares on a regulated market;
(c) the unanimous written agreement of the Founders to terminate;
(d) the moment when only one Founder remains a shareholder of the Company.

## 13. Governing Law and Disputes

This Agreement is governed by {GOVERNING_LAW}. Any dispute arising out of or in connection with this Agreement shall first be the subject of an attempt at amicable resolution between the Founders. Failing that within thirty (30) days, the dispute shall be submitted to the exclusive jurisdiction of the {JURISDICTION_VENUE}.

## 14. Miscellaneous

This Agreement, together with the Company's bylaws and any subsequent shareholders' agreement, is the entire understanding of the Founders on its subject matter. Amendments require the written consent of all then-current Founders. If any provision is unenforceable, the remainder remains in effect.

In the event of a conflict between this Agreement and the Company's bylaws, the Agreement governs as between the Founders, and the Founders shall use reasonable efforts to amend the bylaws to align them.

---

*Disclaimer · This document was generated from Split's legal-templates library and is a starting point, not legal advice for a specific situation. Founders' agreements interact with corporate law, tax, and any future shareholders' agreement with investors — have this reviewed by a licensed attorney before signing.*

---

**Signatures**

For each Founder (one signature block per Founder):

________________________________
Name:
Address:
Date:
