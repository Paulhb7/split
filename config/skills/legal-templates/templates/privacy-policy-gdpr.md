---
slug: privacy-policy-gdpr
title: Privacy Policy (GDPR-compliant) / Politique de Confidentialité (RGPD)
jurisdictions: [EU]
placeholders:
  - COMPANY_NAME
  - COMPANY_ADDRESS
  - COMPANY_REGISTRATION   # e.g. "RCS Paris 123 456 789"
  - SERVICE_NAME           # e.g. "ACME app" or "acme.com"
  - SERVICE_URL
  - DPO_NAME               # leave blank if no DPO required; replace with the contact email otherwise
  - DPO_EMAIL              # e.g. dpo@acme.com — falls back to a generic privacy@ email if no DPO
  - DATA_CATEGORIES        # bullet list, see Section 3
  - LEGAL_BASES            # see Section 4 — pick from: consent, contract, legal_obligation, vital_interests, public_task, legitimate_interests
  - RECIPIENTS             # bullet list of categories (hosting, payment, analytics, support…)
  - RETENTION_PERIODS      # bullet list, see Section 6
  - INTERNATIONAL_TRANSFERS # "None" or a list of jurisdictions + safeguards
  - SUPERVISORY_AUTHORITY  # FR: CNIL ; otherwise the lead authority of the user's EU country
  - EFFECTIVE_DATE
optional_clauses:
  - cookies_section        # short cookie disclosure (link to a separate cookie policy if more detail needed)
  - children_section       # service available to minors under 16
  - automated_decisions    # profiling / automated decision-making
---

# Privacy Policy

**Last updated:** {EFFECTIVE_DATE}

This policy describes how {COMPANY_NAME} ("we", "us", "our") collects and uses personal data of users ("you") of {SERVICE_NAME} (the "Service"), accessible at {SERVICE_URL}. It is drafted to comply with Regulation (EU) 2016/679 ("**GDPR**") and applicable national implementing laws.

## 1. Data Controller

The data controller for the Service is:

{COMPANY_NAME}
{COMPANY_REGISTRATION}
{COMPANY_ADDRESS}

You can contact us regarding your personal data at {DPO_EMAIL}. {DPO_NAME} acts as our Data Protection Officer.

## 2. Scope

This policy covers personal data processed in connection with your use of the Service. "Personal data" means any information relating to an identified or identifiable natural person, as defined in Article 4 GDPR.

## 3. Personal Data We Collect

We collect the following categories of personal data:

{DATA_CATEGORIES}

(Typical categories — keep what applies, delete the rest:
- **Identification & account data**: name, email, password (hashed), account ID, profile picture if provided.
- **Communication data**: messages you send through our support channels.
- **Usage data**: pages visited, features used, IP address, device type, browser, timestamps, session identifiers.
- **Payment data**: billing address and the last four digits of the card; full card data is handled directly by our payment processor and not stored by us.
- **Cookies and similar technologies**: see Section 9.
- **Data from third parties**: e.g. authentication via Google / GitHub provides email and basic profile.)

## 4. Legal Bases and Purposes

We process personal data only when we have a legal basis under Article 6 GDPR:

{LEGAL_BASES}

(Typical pairings:
- **Performance of a contract** (Art. 6(1)(b)): to provide the Service, create and manage your account, deliver paid features.
- **Legitimate interests** (Art. 6(1)(f)): to secure the Service, prevent fraud, improve features, conduct aggregated analytics. We balance our interests against your rights and freedoms; you may object — see Section 7.
- **Consent** (Art. 6(1)(a)): for non-essential cookies, marketing emails, and any processing the law requires consent for. You may withdraw consent at any time without affecting prior lawful processing.
- **Legal obligation** (Art. 6(1)(c)): to comply with accounting, tax, and law-enforcement obligations.)

## 5. Recipients

Personal data is accessed by:

{RECIPIENTS}

(Typical recipients — name each provider explicitly in the final version:
- Our employees on a need-to-know basis, bound by confidentiality.
- Our hosting provider: [name + country].
- Our payment processor: [name + country].
- Our analytics provider, if any: [name + country].
- Our customer-support tooling: [name + country].
- Law-enforcement and regulators when legally required.)

We do not sell personal data.

## 6. Retention

We retain personal data only as long as necessary for the purposes described above, then delete or anonymise it:

{RETENTION_PERIODS}

(Typical retention — customise:
- Account data: duration of the account + 3 years after closure for civil-liability evidence.
- Transactional invoices and accounting records: 10 years (statutory).
- Server logs: 12 months.
- Marketing data: 3 years from last interaction.
- Backups: rolling 30-day window.)

## 7. Your Rights

Under GDPR you have the right to:
(a) **access** the personal data we hold about you (Art. 15);
(b) **rectify** inaccurate or incomplete data (Art. 16);
(c) **erase** your data ("right to be forgotten") where one of the grounds in Art. 17 applies;
(d) **restrict** processing in the situations of Art. 18;
(e) **data portability** — receive your data in a structured, commonly used, machine-readable format and transmit it to another controller (Art. 20);
(f) **object** to processing based on legitimate interests, including profiling (Art. 21);
(g) **withdraw consent** at any time where processing is based on consent;
(h) lodge a complaint with the {SUPERVISORY_AUTHORITY} or another competent supervisory authority.

To exercise these rights, contact us at {DPO_EMAIL}. We respond within one month (Art. 12 GDPR), extendable by two months for complex requests.

## 8. International Transfers

{INTERNATIONAL_TRANSFERS}

(If "None": *"Personal data is stored and processed within the European Economic Area."* If transfers happen: list the destinations, the safeguards used — Standard Contractual Clauses, adequacy decisions — and where to obtain a copy.)

## 9. Cookies and Similar Technologies (optional)

[OPTIONAL — cookies_section]
The Service uses cookies and similar technologies. Strictly necessary cookies operate without consent. Other categories (analytics, preferences, marketing) are deposited only after your consent obtained via the cookie banner. You can withdraw consent at any time by clicking the cookie-settings link in the footer. Cookies are retained for a maximum of 13 months from their first deposit.

## 10. Children (optional)

[OPTIONAL — children_section]
The Service is not directed to children under 16. We do not knowingly collect personal data from children under 16 without verifiable parental consent. If you believe we have collected such data, contact us at {DPO_EMAIL} and we will delete it.

## 11. Automated Decision-Making (optional)

[OPTIONAL — automated_decisions]
We do not subject you to decisions based solely on automated processing — including profiling — that produce legal effects concerning you or similarly significantly affect you, except where required by law or based on your explicit consent.

## 12. Security

We implement appropriate technical and organisational measures to protect personal data against accidental or unlawful destruction, loss, alteration, unauthorised disclosure, or access, including encryption in transit, access controls, regular backups, and audit logging.

## 13. Changes to This Policy

We may update this policy. The "Last updated" date at the top reflects the latest revision. Material changes will be notified by email or a prominent notice in the Service.

## 14. Contact

For any privacy-related question, request, or complaint, contact:

{COMPANY_NAME}
{COMPANY_ADDRESS}
{DPO_EMAIL}

You may also contact the {SUPERVISORY_AUTHORITY}.

---

*Disclaimer · This document was generated from Split's legal-templates library and is a starting point, not legal advice for a specific situation. GDPR compliance depends on the actual data flows; have this policy reviewed against a Record of Processing Activities (RoPA) by a licensed privacy professional before publication.*
