# R18 PR3C — Owner / UK Counsel Decision Packet

Status: **PREPARED — PENDING OWNER AND UK COUNSEL SIGN-OFF / NO MIGRATION AUTHORITY**

Date: 2026-08-13

Repository baseline: `main@44aa35edfd7b1c0a0f57c1cba48e3dd923e3d27f`

Machine-readable packet:
[`security/r18-pr3c-owner-legal-decision-packet.v1.json`](security/r18-pr3c-owner-legal-decision-packet.v1.json)

Related engineering preflight:
[`r18-pr3c-package-b-persistence-preflight.md`](r18-pr3c-package-b-persistence-preflight.md)

## 1. Outcome

This packet converts `LEGAL-01` through `LEGAL-08` from broad questions into a
decision-ready Owner and UK-counsel brief. It records:

- the narrowest product boundary already supported by R18;
- a conservative recommendation for each gate;
- the exact facts the Owner can adopt as product policy;
- the exact legal verdicts and implementation values counsel must return;
- the safe state while a value remains unresolved.

This is not legal advice and it does not declare any legal gate approved. Every
machine-readable `approvedDecision` remains `null`. The recommendations are
inputs for review, not schema authority, launch authority, or a conclusion that
BetTracker falls outside gambling regulation.

This slice authorizes repository documentation and tests only. It authorizes no
migration, SQL, database write, user-evidence collection, environment change,
provider call, deployment change, market activation, or legal-content launch.
`MARKET_PROFILE_GB_EW_SC_ENABLED` remains disabled.

## 2. Input Audit And Research Limit

The two submitted Markdown files named as Perplexity and Claude Design inputs
are byte-identical. Both have SHA-256
`d9eb12167b6a6fd7016b4fe703ef62d8df8b85e0153bbd4712b5e60471b90394`.
They therefore count as one research input, not two independent reviews. No
separate design opinion can be inferred from the second copy.

The useful parts of that research were checked against current primary material
from the ICO, Gambling Commission, legislation publisher, and ASA/CAP on
2026-08-13. Several ICO pages expressly say that guidance is being updated after
the Data (Use and Access) Act 2025. Counsel must therefore validate the law and
guidance in force on the actual sign-off date rather than treating this packet as
a static legal answer.

## 3. Recommended Product Boundary

The Owner can adopt the following factual product boundary without pretending
to decide its legal classification:

| Product fact | Recommended position |
|---|---|
| Purpose | Private decision-quality and risk-control journal |
| Audience | Adults only, minimum age 18, not directed at children |
| Access | Private and invite-only |
| First profile | `GB_EW_SC`: England, Wales, and Scotland only; Northern Ireland unsupported |
| User action | The user may record a factual external action after making it elsewhere |
| Transaction boundary | BetTracker does not accept, execute, transmit, prefill, or technically facilitate a bet |
| Recommendation boundary | No picks, ranked opportunities, copy betting, recommended/prefilled stake, or profit promise |
| Commercial boundary | No bookmaker link, deep link, logo, affiliate promotion, or bookmaker marketing |
| Provider boundary | Odds/provider feeds and provider branding remain a separate product, contract, IP, privacy, and legal gate |
| Optional processing | Optional analytics, AI history, and AI memory remain separate, off by default, and non-blocking for the core Journal |

The legal proposition remains deliberately narrower: this product boundary is a
working hypothesis for counsel to classify. The Gambling Commission says that
general performance-analytics and affiliate/CRM applications are not normally
gambling software, while software designed for use by an operator in providing
gambling facilities can be. The Commission also distinguishes a gambling
software licence from the separate operating licence required to provide
facilities for gambling. Context and actual implementation therefore matter;
the repository must not turn the working description into a legal conclusion.

## 4. Decision Summary

| Gate | Recommended interim position | Exact close condition | Current state |
|---|---|---|---|
| `LEGAL-01` | 18+, not directed at children; applicability remains unknown until documented screening | Owner facts plus counsel verdict on “likely to be accessed”, duties, DPIA, owner, evidence, and review date | `pending_owner_and_uk_counsel` |
| `LEGAL-02` | Self-declaration alone cannot create `verified`; persist derived result only and no raw ID/DOB/biometric/provider payload | Approved method codes, assurance level, result classes, vendor position, fields, expiry/recheck, and prohibitions | `pending_owner_and_uk_counsel` |
| `LEGAL-03` | Separate residence from current territory; coarse data only; locale/storefront/IP/GPS cannot elevate access | Approved evidence methods, precedence, conflicts, travel, TTL, and manual review | `pending_owner_and_uk_counsel` |
| `LEGAL-04` | Select a basis per purpose; do not call processing a legal obligation without naming the law | Purpose-by-purpose basis, necessity, LIA/statute, data classes, notice, rights, and withdrawal effect | `pending_owner_and_uk_counsel` |
| `LEGAL-05` | Persist no raw evidence; invent no durations; authorize no destructive rollback | Complete record-class retention/deletion/erasure/legal-hold/backup schedule | `pending_owner_and_uk_counsel` |
| `LEGAL-06` | English master; `en`/`uk`/`ru` share id/version; privacy presentation is not bundled consent | Exact documents, versions, dates, hashes, translation approvals, event types, and stale behavior | `pending_owner_and_uk_counsel` |
| `LEGAL-07` | Analytics, AI history, and AI memory are independent and off by default | Separate purpose/version, basis and PECR gateway, withdrawal, retention, degradation, processor/transfer terms | `pending_owner_and_uk_counsel` |
| `LEGAL-08` | Adopt the factual boundary in section 3; make no regulatory claim | Counsel classification, permitted/prohibited copy, boundaries, jurisdictions, owner, review date, and change triggers | `pending_owner_and_uk_counsel` |

## 5. `LEGAL-01` — Children-Access Classification

### Recommended Owner position

- The intended audience is adults aged 18 or older.
- The service is private, invite-only, and not marketed or designed for
  children.
- No child account, parental-consent route, or under-18 experience is offered.
- These facts do not by themselves prove that children are unlikely to access
  the service.

### Counsel must return

1. One verdict: `likely_to_be_accessed`, `not_likely_to_be_accessed`, or
   `insufficient_evidence`.
2. The evidence and legal test used, including whether invite-only distribution
   changes the result.
3. The applicable Children's Code duties and whether a DPIA is required.
4. The accountable owner and the next review date or material-change triggers.

### Interim engineering rule

Treat applicability as unknown, keep high-privacy defaults, and collect no
Package B evidence. A terms statement or age checkbox cannot close this gate.
The ICO says the Children's Code covers information-society services likely to
be accessed by children and is not limited to services aimed at them. Its
guidance also makes the assessment and proportionate age assurance risk-based.

## 6. `LEGAL-02` — Age Assurance

### Recommended Owner position

- Product minimum age: 18.
- A self-declaration may be an input but cannot by itself persist the state
  `verified`.
- Persist only an approved derived result such as age-band/result, method code,
  assurance level, verification time, expiry/recheck time, and a minimal
  non-reversible provider reference where necessary.
- Do not persist full date of birth, identity-document images, biometric
  templates, or raw provider payloads.
- The vendor/no-vendor decision remains open until privacy, procurement,
  security, and counsel review.

### Counsel must return

1. Allowed method codes and minimum assurance strength for this product risk.
2. Accepted result classes and the exact meaning of `verified`.
3. Expiry, recheck, exception, and failure behavior.
4. Approved derived fields and prohibited raw fields.
5. Whether any special-category or biometric processing is involved and, if so,
   its separate condition and safeguards.

### Interim engineering rule

No age result is stored as verified and no age-evidence schema is created. The
ICO identifies multiple age-assurance techniques, from self-declaration to
tokenised checks and hard identifiers; it does not make one technique universally
sufficient. Proportionality must be decided for the actual service and risk.

## 7. `LEGAL-03` — Residence And Current Territory

### Recommended Owner position

- `residence` and `current_territory` are separate facts.
- Store only the approved coarse territory class, not precise location.
- Locale, currency, timezone, app-store/storefront country, and client claims
  never grant or elevate eligibility.
- If an IP-derived or device-derived signal is ever approved, evaluate it
  transiently, do not retain raw IP/GPS history, and do not use it as sole proof.
- A conflict yields `verification_required`; travel never silently elevates
  access.

### Counsel must return

1. Which residence and current-territory evidence methods are permissible and
   sufficient for the actual legal purpose.
2. Signal precedence, conflicts, freshness/TTL, travel behavior, and manual
   review boundaries.
3. Which derived values may be stored and for how long.
4. Whether geo/online tracking triggers a DPIA or another notice/consent duty.

### Interim engineering rule

No inferred or coarse signal may grant access, and Package B collects none of
these values until the method matrix is approved.

## 8. `LEGAL-04` — Lawful Basis By Purpose

No single basis should cover the entire product. The following is a review
matrix, not an approved record of processing activities.

| Processing purpose | Candidate basis | Required proof before approval |
|---|---|---|
| Core account and requested Journal service | Contract | Show that every data class is objectively necessary to deliver the requested service |
| Eligibility decision and approved derived evidence | Legitimate interests | Complete purpose, necessity, and balancing test (`LIA`); counsel may replace the candidate |
| Security and abuse prevention | Legitimate interests | LIA, necessity, access limits, retention, and user expectations |
| Required Terms acknowledgement | Contract plus accountability record | Identify exact document/version and why the event is necessary |
| Privacy-notice presentation | Transparency/accountability record, not consent | Define presentation evidence separately from agreement |
| Support | Contract or legitimate interests by activity | Map the actual support purpose and data classes |
| Optional product analytics | Consent candidate | Complete PECR cookie/device-access analysis, withdrawal behavior, and processor review |
| Optional AI history | Consent candidate | Real choice, purpose/version, data classes, deletion, processors, and transfers |
| Optional AI memory | Separate consent candidate | Independent choice and withdrawal; no bundling with AI history |
| Electronic marketing | Out of scope and disabled | Separate PECR/marketing review before any future implementation |

Counsel must approve or replace every candidate. `Legal obligation` is not an
acceptable label unless the decision names the specific law, demonstrates
necessity, and records it in the privacy material. The ICO says the chosen basis
must match each specific purpose; contract requires objective necessity, and
legitimate interests requires a purpose, necessity, and balancing assessment.
Consent is inappropriate where the user has no genuine choice or processing
would continue after withdrawal.

### Interim engineering rule

Any field without an approved purpose and lawful basis is omitted entirely; it
is not stored with a basis of `unknown`.

## 9. `LEGAL-05` — Retention, Deletion, Erasure, And Hold

### Recommended Owner position

- Raw ID, date-of-birth, biometric, raw provider, raw IP, and GPS-history data
  are not persisted by default.
- No duration is invented from industry habit or a generic limitation period.
- No record is retained indefinitely “just in case”.
- Legal hold requires a documented ground, scope, owner, start, review, and
  release process; it is not a permanent boolean escape hatch.
- Destructive rollback stays forbidden once any Package B row exists until the
  schedule is approved.

### Counsel must complete one row for every class

| Required field | Required content |
|---|---|
| Record class | Current eligibility, check/evidence, required-document event, optional-purpose event, audit event, support record, provider reference, and backup copy |
| Purpose and basis | Link to the approved `LEGAL-04` purpose |
| Trigger | Creation, supersession, verification expiry, withdrawal, account closure, dispute closure, or another exact event |
| Duration | Exact duration or deterministic rule; no `indefinite` placeholder |
| End action | Delete, irreversibly anonymise, or retain a justified minimal subset |
| User erasure | Action and any lawful exception for this class |
| Legal hold | Legal ground, affected fields, approval authority, review cadence, and release |
| Backups | Deletion propagation and maximum residual window |
| Owner/review | Named accountable role and next review date |

The ICO's storage-limitation guidance does not prescribe one universal period.
It requires the controller to justify periods by purpose, document a schedule,
review data, and erase or anonymise it when no longer needed.

### Interim engineering rule

No affected persistence is created. That is the only honest fail-closed result
while the schedule contains blanks.

## 10. `LEGAL-06` — Legal Documents And Locales

### Recommended Owner position

- English is the legal master.
- `en`, `uk`, and `ru` variants share one stable document id and exact version.
- A translation is usable only after approval for that same master hash and
  version.
- Terms acknowledgement, privacy-notice presentation, and optional-purpose
  consent are different events and cannot be bundled into one checkbox.
- Missing or stale translation cannot silently grant access by falling back to
  another legal version.
- A re-acknowledgement block must not remove history, export, deletion, billing,
  support, or other data-rights access.

### Counsel and Owner must supply

For every document: id, kind, exact version, effective date, master content hash,
locale approval status and approver, acknowledgement-versus-presentation rule,
and stale-version behavior. At minimum, review Terms, Privacy Notice, AI/processor
notice, market-availability notice, and responsible-use material; counsel must
decide which are legal documents rather than product/help copy.

### Interim engineering rule

There is no unversioned acceptance boolean, bundled privacy consent, or silent
translation fallback. Exact content and versions remain outside this packet.

## 11. `LEGAL-07` — Optional Analytics And AI

### Recommended Owner position

Treat these as three independent purposes:

| Purpose | Default | Core-service effect of refusal | Candidate review position |
|---|---|---|---|
| Optional product analytics | Off | None | Consent candidate; first decide whether cookies/device access require PECR consent |
| Optional AI history | Off | Journal remains available; AI history is absent | Separate purpose/version and consent candidate |
| Optional AI memory | Off | AI may operate without cross-session memory if separately enabled | Separate consent from AI history |

Withdrawal stops future optional processing and initiates the approved
retention/deletion behavior. A refusal cannot block the core Journal or data
rights. Existing telemetry is not grandfathered by this recommendation and
needs its own inventory of cookies, SDK storage/access, events, processors,
transfers, and retention.

### Existing repository observation

The current Web source initializes PostHog whenever both public PostHog
environment values are present. It then explicitly captures page views,
configures automatic page-leave capture, and exposes other explicit capture and
identify helpers. The source disables general autocapture, session recording,
and remote executable capabilities, but no user-consent check appears in the
initialization or capture boundary. This is a static repository observation
only: production environment values and live browser storage/network behavior
were not inspected in this slice.

Therefore `LEGAL-07` includes a separate current-telemetry privacy and PECR
review. The future recommendation “optional analytics off by default” must not
be presented as the current runtime state. This packet does not authorize a
PostHog runtime, environment, or consent-flow change.

The ICO says non-essential cookies or similar device access normally require a
clear positive consent action, while the strictly necessary exception is narrow
and does not cover technology merely useful for the controller's own purposes.

### Counsel must return

For each purpose: exact purpose id/version, UK GDPR basis, PECR gateway,
default, capture method, withdrawal effect, retention, feature degradation,
processor/subprocessor list, transfer mechanism, and notice text reference.

### Interim engineering rule

All three purposes stay off. No consent row is created until the underlying
purpose and lifecycle are approved.

## 12. `LEGAL-08` — Product Classification And Copy

### Recommended Owner position

Adopt the factual boundary in section 3 and the following copy discipline:

- permitted themes: private journal, decision quality, evidence, risk control,
  review, and responsible use;
- prohibited themes: best bets/picks, winning/profit/growth promises, “bet now”,
  stake recommendations, bookmaker comparison/promotion, copy betting, and loss
  recovery;
- a factual Journal record may describe an external action entered by the user
  after it occurred; it may not execute, transmit, prefill, or deep-link that
  action;
- odds/provider data, bookmaker names/logos, affiliate/commercial mechanics, or
  any transaction integration trigger a new review before design or code.

### Counsel must return

1. The approved Great Britain classification for the exact implemented service,
   including whether it provides facilities for gambling or constitutes
   gambling software.
2. Permitted and prohibited wording for product and public marketing.
3. The provider/bookmaker/affiliate/IP boundaries and any advertising rules.
4. Approved jurisdictions, accountable owner, review date, and material-change
   triggers.

ASA/CAP's gambling rules directly govern gambling marketing and say third-party
affiliate marketing can be in scope. They also note that general social-
responsibility rules may be applied to non-operator products, such as tipsters,
that are likely to encourage gambling. Avoiding operator status therefore does
not make promotional design automatically low-risk.

### Interim engineering rule

The profile remains `configured`, disabled, and non-commercial. The application
does not state that it is exempt, licensed, approved, or legally available.

## 13. Sign-Off Artifact Required To Close The Gate

Counsel and the Owner should return one immutable versioned artifact containing:

1. Packet id and reviewed commit/hash.
2. Signatory role, organisation, date, jurisdiction, and scope.
3. One complete decision for every `LEGAL-01` through `LEGAL-08` implementation
   input listed in the machine-readable packet.
4. Source or memo references and explicit assumptions.
5. Expiry/review dates and material-change triggers.
6. A statement that unresolved or conditional values remain blockers.

Email approval, “looks good”, or an approval that does not fill every required
implementation input is not enough. The signed result should be committed as a
new immutable version; this recommendation packet must not be edited in place to
simulate approval.

## 14. Engineering Sequence After Valid Sign-Off

Sign-off closes only the legal-input gate. It does not authorize production.
The next engineering slice must still:

1. validate the signed artifact and compute its SHA-256;
2. derive the smallest schema without collecting prohibited fields;
3. create a separate expand-only migration, verifier, rollback, and revoke-only
   emergency-stop script;
4. pass PostgreSQL 17, RLS/ACL, hostile-role, idempotency, concurrency, and all
   repository safety checks;
5. run a fresh read-only production preflight immediately before apply;
6. obtain a separate one-time approval naming project, migration, and exact
   migration SHA-256;
7. perform exactly one apply and stop without retry on mismatch or error;
8. keep the market flag disabled until a separate activation decision.

## 15. Primary Sources Reviewed

- ICO — [Services covered by the Children's Code](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/services-covered-by-this-code/)
- ICO — [Age assurance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/how-to-use-our-guidance-for-standard-one-best-interests-of-the-child/best-interests-framework/age-assurance/)
- ICO — [When a DPIA is required](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/data-protection-impact-assessments-dpias/when-do-we-need-to-do-a-dpia/)
- ICO — [Guide to lawful basis](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/a-guide-to-lawful-basis/)
- ICO — [Legitimate interests](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/legitimate-interests/what-is-the-legitimate-interests-basis/)
- ICO — [When consent is appropriate](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/consent/when-is-consent-appropriate/)
- ICO — [Data minimisation](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/data-minimisation/)
- ICO — [Storage limitation](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/storage-limitation/)
- ICO — [Cookies and similar technologies](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/cookies-and-similar-technologies/)
- Gambling Commission — [Definition of gambling software](https://www.gamblingcommission.gov.uk/licensees-and-businesses/guide/page/definition-of-gambling-software)
- Gambling Commission — [What is gambling software?](https://www.gamblingcommission.gov.uk/licensees-and-businesses/guide/what-is-gambling-software)
- UK legislation — [Gambling Act 2005](https://www.legislation.gov.uk/ukpga/2005/19/contents)
- ASA/CAP — [Section 16: Gambling](https://www.asa.org.uk/type/non_broadcast/code_section/16.html)

## 16. Current Gate

The immediate next external action is review and completion of the eight
decisions by the Owner and qualified UK counsel. Until the resulting artifact is
complete and versioned, Package B remains correctly blocked with no migration
and no production change.
