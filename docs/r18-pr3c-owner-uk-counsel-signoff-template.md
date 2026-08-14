# R18 PR3C — Owner / Qualified UK Counsel Sign-Off Response Template

Status: **TEMPLATE ONLY — UNEXECUTED / NO LEGAL APPROVAL / NO MIGRATION AUTHORITY**

Date: 2026-08-14

Source decision packet:
[`r18-pr3c-owner-legal-decision-packet.md`](r18-pr3c-owner-legal-decision-packet.md)

Machine-readable response template:
[`security/r18-pr3c-owner-uk-counsel-signoff-template.v1.json`](security/r18-pr3c-owner-uk-counsel-signoff-template.v1.json)

Source packet JSON SHA-256:
`96e945181cd639057ff8806e61b64930a261abad6ad57ab64b7988fc07fc2a66`

## 1. Purpose

This template is the handoff between the prepared recommendation packet and a
future immutable dual-sign-off artifact. It makes every required response field
explicit without claiming that the Owner has adopted a recommendation or that
qualified UK counsel has supplied legal advice.

The template is not legal advice, a signature, an approval, a schema decision,
or production authority. Every `ownerDecision`, `ukCounselDecision`,
implementation input, and `approvedDecision` remains null. Package B and
`MARKET_PROFILE_GB_EW_SC_ENABLED` remain blocked.

## 2. Completion Procedure

1. Do not edit the source packet or this template in place to claim approval.
2. Copy the JSON template to a new immutable path matching
   `docs/security/r18-pr3c-owner-uk-counsel-signed-decision.v{n}.json`.
3. The Owner must fill one explicit `ownerDecision` for every `LEGAL-01…08`
   gate and complete the Owner signatory block.
4. Qualified UK counsel must independently fill one `ukCounselDecision`, every
   exact implementation input, assumptions, conditions, sources, expiry/review
   date, and material-change triggers for every gate.
5. Counsel qualification and scope must be verifiable. A generic researcher,
   design reviewer, LLM answer, or unqualified consultant cannot fill the
   `ukCounsel` role.
6. Store the signed confidential memo outside this public repository. Record a
   stable private reference and SHA-256 in the public artifact only if counsel
   approves that metadata for publication.
7. Any unresolved, conditional, ambiguous, or null value remains a blocker. Do
   not convert a partial response into `approvedDecision`.
8. Validate the completed artifact in a new repository slice. Completion of the
   legal-input gate still does not authorize a migration or activation.

## 3. Owner Attestation To Complete

The Owner response must explicitly confirm, rather than merely imply:

> I confirm that each recorded Owner decision reflects the product facts and
> policy boundaries I adopt for BetTracker Private. I understand that this
> confirmation is not a legal conclusion, migration approval, production-write
> approval, or market-activation approval.

The attestation, signatory name, role, organisation, signed-at date, and stable
signature reference remain blank in the template. The repository must not infer
them from a chat instruction such as “continue” or “looks good”.

## 4. Qualified UK Counsel Attestation To Complete

Counsel must provide a verifiable professional role, regulator/registration
reference where applicable, qualification and jurisdiction, exact scope, and an
attestation equivalent to:

> I confirm that I am qualified and instructed to advise on the stated United
> Kingdom scope, that I reviewed the identified product boundary and source
> packet, and that the recorded decisions and implementation inputs accurately
> state my conclusions, assumptions, conditions, and review limits as of the
> signed date.

This wording is a response-format requirement, not a substitute for counsel's
own engagement terms or advice.

## 5. Required Gate Outputs

| Gate | Response that must be complete |
|---|---|
| `LEGAL-01` | Children-access verdict, duties, evidence, accountable owner, review date, and DPIA result |
| `LEGAL-02` | Allowed age methods, assurance strength, result classes, vendor position, derived/prohibited fields, and recheck rule |
| `LEGAL-03` | Residence/current-territory methods, precedence, conflict/travel behavior, freshness, and manual review boundary |
| `LEGAL-04` | Purpose-by-purpose basis, necessity/LIA or named statute, data classes, notice, rights, and withdrawal effect |
| `LEGAL-05` | Complete retention/deletion/erasure/hold/backup schedule for every affected record class |
| `LEGAL-06` | Exact document ids, kinds, versions, dates, hashes, locale approvals, event semantics, and stale behavior |
| `LEGAL-07` | Separate analytics, AI-history, and AI-memory purpose/basis/PECR/default/withdrawal/retention/processor decisions |
| `LEGAL-08` | Product classification, copy rules, provider/bookmaker/affiliate boundaries, jurisdictions, owner, review date, and triggers |

The machine-readable template contains the exact key set. A prose memo that
does not map every conclusion to those keys is incomplete.

## 6. Public Repository Safety

Do not commit:

- a scanned or cryptographic signature;
- private addresses, email addresses, phone numbers, or identity documents;
- privileged or confidential counsel analysis;
- engagement terms, invoices, or unrelated client information;
- raw age, territory, identity, biometric, IP, GPS, or provider evidence.

The public artifact should contain only approved implementation values and the
minimum publication-approved professional/memo metadata needed for audit. The
confidential signed source remains under the Owner's private document-control
process.

## 7. Gate State

This template completes only the response format. It leaves all eight legal
gates pending, authorizes no migration file, DDL, DML, environment change,
provider call, market activation, or external beta, and does not modify
Supabase or production.
