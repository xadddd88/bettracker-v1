#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relativePath => readFileSync(path.join(repoRoot, relativePath), 'utf8')

const doc = read('docs/r18-pr3c-owner-legal-decision-packet.md')
const normalizedDoc = doc.replace(/\s+/g, ' ')
const docsIndex = read('docs/README.md')
const implementationMap = read('docs/r18-implementation-map.md')
const previewWorkflow = read('.github/workflows/preview-tests.yml')
const packet = JSON.parse(
  read('docs/security/r18-pr3c-owner-legal-decision-packet.v1.json'),
)
const migrationNames = readdirSync(path.join(repoRoot, 'supabase/migrations'))
  .filter(name => name.endsWith('.sql'))

const expectedGates = [
  ['LEGAL-01', 'children-access-classification'],
  ['LEGAL-02', 'age-assurance-method-and-strength'],
  ['LEGAL-03', 'residence-and-current-territory-methods'],
  ['LEGAL-04', 'lawful-basis-by-processing-purpose'],
  ['LEGAL-05', 'retention-deletion-and-user-erasure'],
  ['LEGAL-06', 'legal-document-master-translation-and-version-lifecycle'],
  ['LEGAL-07', 'optional-analytics-ai-history-and-ai-memory-basis'],
  ['LEGAL-08', 'product-classification-and-permitted-copy'],
]

assert.equal(packet.schemaVersion, 1)
assert.equal(packet.packetId, 'bettracker-r18-pr3c-owner-legal-decision-packet')
assert.equal(packet.status, 'prepared-pending-owner-and-uk-counsel-signoff')
assert.equal(packet.asOfDate, '2026-08-13')
assert.equal(
  packet.repository.baseCommit,
  '44aa35edfd7b1c0a0f57c1cba48e3dd923e3d27f',
)
assert.equal(
  packet.repository.packageBPreflightCommit,
  '92fd7a3e3398d6218d3d8be922bdd0842a12c4ef',
)

assert.equal(packet.sourceInputs.length, 2)
assert.equal(
  packet.sourceInputs[0].sha256,
  'd9eb12167b6a6fd7016b4fe703ef62d8df8b85e0153bbd4712b5e60471b90394',
)
assert.equal(packet.sourceInputs[1].sha256, packet.sourceInputs[0].sha256)
assert.equal(packet.sourceInputs[1].byteIdenticalToSourceInput, 0)

assert.equal(packet.proposedProductBoundary.approvalState, 'recommendation-only')
assert.equal(packet.proposedProductBoundary.marketProfile, 'GB_EW_SC')
assert.equal(packet.proposedProductBoundary.minimumAge, 18)
assert.equal(packet.proposedProductBoundary.accessModel, 'private-invite-only')
assert.deepEqual(packet.proposedProductBoundary.unsupportedTerritories, [
  'Northern Ireland',
])
for (const prohibitedCapability of [
  'accept-or-execute-a-bet',
  'transmit-or-prefill-a-bet',
  'bookmaker-link-or-deep-link',
  'affiliate-or-bookmaker-promotion',
  'recommended-or-prefilled-stake',
  'ranked-picks-or-copy-betting',
  'profit-or-winning-promise',
]) {
  assert(
    packet.proposedProductBoundary.prohibitedCapabilities.includes(prohibitedCapability),
    `missing product boundary: ${prohibitedCapability}`,
  )
}

assert.deepEqual(packet.existingAnalyticsRepositoryObservation, {
  observationClass: 'static-repository-review-only',
  productionEnvironmentInspected: false,
  clientProvider: 'PostHog',
  initializationCondition:
    'NEXT_PUBLIC_POSTHOG_KEY-and-NEXT_PUBLIC_POSTHOG_HOST',
  codeLevelConsentGateObserved: false,
  configuredEvents: [
    'explicit-pageview',
    'automatic-pageleave',
    'other-explicit-capture-and-identify-calls',
  ],
  protectiveSettingsObserved: [
    'autocapture-disabled',
    'session-recording-disabled',
    'remote-capabilities-and-external-dependencies-disabled',
  ],
  requiredAction: 'separate-current-telemetry-privacy-and-pecr-review',
  authorityToChangeRuntime: false,
})

assert.deepEqual(
  packet.legalGates.map(({ id, topic }) => [id, topic]),
  expectedGates,
)
for (const gate of packet.legalGates) {
  assert.equal(
    gate.status,
    'pending-owner-and-uk-counsel-signoff',
    `${gate.id} must remain pending`,
  )
  assert.equal(gate.approvedDecision, null, `${gate.id} must not claim approval`)
  assert.deepEqual(
    gate.requiredSignoffs,
    ['owner', 'uk_counsel'],
    `${gate.id} requires both sign-offs`,
  )
  assert(gate.implementationInputs.length >= 6, `${gate.id} inputs are incomplete`)
  assert(gate.failClosed.length > 20, `${gate.id} fail-closed rule is missing`)
  assert(doc.includes(`\`${gate.id}\``), `${gate.id} is absent from the brief`)
}

assert.equal(
  packet.legalGates.find(({ id }) => id === 'LEGAL-02')
    .recommendation.selfDeclarationAloneCanProduceVerified,
  false,
)
assert.equal(
  packet.legalGates.find(({ id }) => id === 'LEGAL-03')
    .recommendation.localeCurrencyTimezoneOrStorefrontCanElevate,
  false,
)
assert.equal(
  packet.legalGates.find(({ id }) => id === 'LEGAL-04')
    .recommendation.oneSizeFitsAllBasis,
  false,
)
assert.equal(
  packet.legalGates.find(({ id }) => id === 'LEGAL-05')
    .recommendation.inventedDurationsAllowed,
  false,
)
assert.equal(
  packet.legalGates.find(({ id }) => id === 'LEGAL-06')
    .recommendation.bundledPrivacyConsentAllowed,
  false,
)
assert.equal(
  packet.legalGates.find(({ id }) => id === 'LEGAL-07')
    .recommendation.refusalBlocksCoreJournal,
  false,
)
assert.equal(
  packet.legalGates.find(({ id }) => id === 'LEGAL-08')
    .recommendation.gamblingRegulatoryConclusion,
  'not-asserted-pending-uk-counsel',
)

assert.deepEqual(packet.activationGate, {
  marketProfileEnabled: false,
  allLegalGatesApproved: false,
  schemaReady: false,
  migrationAuthorized: false,
  productionWriteAuthorized: false,
  nextArtifact: 'immutable-owner-and-uk-counsel-signed-decision-version',
})
assert.deepEqual(packet.authority, {
  repositoryDocumentation: true,
  repositoryTests: true,
  legalApproval: false,
  migrationFile: false,
  databaseDdl: false,
  databaseDml: false,
  environmentChange: false,
  marketActivation: false,
  providerOrExternalCall: false,
})

for (const heading of [
  'Outcome',
  'Input Audit And Research Limit',
  'Recommended Product Boundary',
  'Decision Summary',
  '`LEGAL-01` — Children-Access Classification',
  '`LEGAL-02` — Age Assurance',
  '`LEGAL-03` — Residence And Current Territory',
  '`LEGAL-04` — Lawful Basis By Purpose',
  '`LEGAL-05` — Retention, Deletion, Erasure, And Hold',
  '`LEGAL-06` — Legal Documents And Locales',
  '`LEGAL-07` — Optional Analytics And AI',
  '`LEGAL-08` — Product Classification And Copy',
  'Sign-Off Artifact Required To Close The Gate',
  'Engineering Sequence After Valid Sign-Off',
  'Primary Sources Reviewed',
  'Current Gate',
]) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  assert.match(doc, new RegExp(`^## \\d+\\. ${escapedHeading}$`, 'm'), `missing heading: ${heading}`)
}

for (const invariant of [
  'PENDING OWNER AND UK COUNSEL SIGN-OFF / NO MIGRATION AUTHORITY',
  'Every machine-readable `approvedDecision` remains `null`',
  'byte-identical',
  'not legal advice',
  'Self-declaration alone cannot create `verified`',
  'No single basis should cover the entire product',
  'invent no durations',
  'privacy presentation is not bundled consent',
  'All three purposes stay off',
  'no user-consent check appears in the initialization or capture boundary',
  'must not be presented as the current runtime state',
  'make no regulatory claim',
  'must not be edited in place to simulate approval',
  'perform exactly one apply and stop without retry',
  '`MARKET_PROFILE_GB_EW_SC_ENABLED` remains disabled',
]) {
  assert(normalizedDoc.includes(invariant), `missing invariant: ${invariant}`)
}

for (const source of [
  'https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/services-covered-by-this-code/',
  'https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/a-guide-to-lawful-basis/',
  'https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/storage-limitation/',
  'https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/cookies-and-similar-technologies/',
  'https://www.gamblingcommission.gov.uk/licensees-and-businesses/guide/page/definition-of-gambling-software',
  'https://www.gamblingcommission.gov.uk/licensees-and-businesses/guide/what-is-gambling-software',
  'https://www.legislation.gov.uk/ukpga/2005/19/contents',
  'https://www.asa.org.uk/type/non_broadcast/code_section/16.html',
]) {
  assert(doc.includes(source), `primary source missing: ${source}`)
}

const packageBMigrationNames = migrationNames.filter(name =>
  /(?:r18|pr3c|market).*(?:package[_-]?b|eligibility)|(?:package[_-]?b|eligibility).*(?:r18|pr3c|market)/i.test(name),
)
assert.deepEqual(
  packageBMigrationNames,
  [],
  `decision packet must not include a Package B migration: ${packageBMigrationNames.join(', ')}`,
)

assert.doesNotMatch(doc, /```sql/i, 'decision packet must not smuggle executable SQL')
assert.doesNotMatch(doc, /(?:service_role|supabase_service_role)[^\n]{0,60}(?:key|secret|token)/i)
assert.match(docsIndex, /r18-pr3c-owner-legal-decision-packet\.md/)
assert.match(implementationMap, /^### PR 3C Package B - Owner And UK Counsel Decision Packet$/m)
assert.match(implementationMap, /PREPARED — eight gates remain pending both sign-offs/)
assert.match(implementationMap, /Migrations: none/)
assert.match(
  previewWorkflow,
  /R18 PR3C Owner and UK counsel decision packet[\s\S]*npm run test:r18-pr3c-owner-legal-decision-packet/,
)

console.log('R18 PR3C Owner/UK counsel packet: recommendations are explicit, approvals remain null, and production authority remains absent — PASS')
