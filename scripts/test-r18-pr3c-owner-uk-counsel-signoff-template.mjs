#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relativePath => readFileSync(path.join(repoRoot, relativePath), 'utf8')

const sourcePacketText = read('docs/security/r18-pr3c-owner-legal-decision-packet.v1.json')
const sourcePacket = JSON.parse(sourcePacketText)
const template = JSON.parse(
  read('docs/security/r18-pr3c-owner-uk-counsel-signoff-template.v1.json'),
)
const doc = read('docs/r18-pr3c-owner-uk-counsel-signoff-template.md')
const normalizedDoc = doc.replace(/\s+/g, ' ')
const docsIndex = read('docs/README.md')
const implementationMap = read('docs/r18-implementation-map.md')
const packageJson = JSON.parse(read('package.json'))
const previewWorkflow = read('.github/workflows/preview-tests.yml')
const migrationNames = readdirSync(path.join(repoRoot, 'supabase/migrations'))
  .filter(name => name.endsWith('.sql'))

const sourcePacketSha256 = createHash('sha256')
  .update(sourcePacketText)
  .digest('hex')

assert.equal(
  sourcePacketSha256,
  '96e945181cd639057ff8806e61b64930a261abad6ad57ab64b7988fc07fc2a66',
  'source legal packet changed after review',
)
assert.equal(template.schemaVersion, 1)
assert.equal(template.artifactId, 'bettracker-r18-pr3c-owner-uk-counsel-signoff')
assert.equal(template.artifactType, 'dual-signoff-response-template')
assert.equal(
  template.status,
  'template-pending-owner-and-qualified-uk-counsel-completion',
)
assert.equal(template.preparedAt, '2026-08-14')
assert.equal(template.sourcePacket.packetId, sourcePacket.packetId)
assert.equal(template.sourcePacket.sha256, sourcePacketSha256)
assert.equal(
  template.sourcePacket.mergedCommit,
  '97992894020d2502869fce1922f2410e6466e81f',
)
assert.equal(
  template.templateRepositoryBase,
  'a199008f0a32a6c6fb5c6dd7b038211a83245029',
)

assert.deepEqual(template.templateRules, {
  sourcePacketMustNotBeEditedInPlace: true,
  templateMustNotBeEditedInPlaceToClaimApproval: true,
  completedArtifactPathPattern:
    'docs/security/r18-pr3c-owner-uk-counsel-signed-decision.v{n}.json',
  confidentialMemoCommittedToPublicRepository: false,
  signatureImageCommittedToPublicRepository: false,
  personalContactDetailsCommittedToPublicRepository: false,
  publicArtifactMayContain: [
    'approved-implementation-values',
    'professional-role-and-organisation-if-publication-approved',
    'regulator-and-registration-reference-if-publication-approved',
    'signed-at-date',
    'private-memo-stable-reference',
    'private-memo-sha256',
  ],
})

assert.deepEqual(template.signatories.owner, {
  status: 'pending-explicit-owner-confirmation',
  name: null,
  role: 'owner',
  organisation: null,
  signedAt: null,
  attestation: null,
  signatureReference: null,
})
assert.deepEqual(template.signatories.ukCounsel, {
  status: 'pending-qualified-uk-counsel-response',
  name: null,
  role: null,
  organisation: null,
  professionalRegulator: null,
  registrationReference: null,
  qualificationAndJurisdiction: null,
  scope: null,
  signedAt: null,
  attestation: null,
  signatureReference: null,
})
assert.deepEqual(template.privateMemoEvidence, {
  stableReference: null,
  sha256: null,
  memoDate: null,
  confidentialStorageOwner: null,
  publicationApprovedByCounsel: false,
})

assert.equal(template.decisions.length, 8)
assert.deepEqual(
  template.decisions.map(({ id, topic }) => [id, topic]),
  sourcePacket.legalGates.map(({ id, topic }) => [id, topic]),
)

for (const decision of template.decisions) {
  const sourceGate = sourcePacket.legalGates.find(({ id }) => id === decision.id)
  assert(sourceGate, `missing source gate: ${decision.id}`)
  assert.equal(decision.status, 'pending-complete-dual-signoff')
  assert.equal(
    decision.sourceRecommendationReference,
    `sourcePacket.legalGates[${decision.id}].recommendation`,
  )
  assert.equal(decision.ownerDecision, null, `${decision.id} owner decision must be null`)
  assert.equal(
    decision.ukCounselDecision,
    null,
    `${decision.id} counsel decision must be null`,
  )
  assert.equal(
    decision.approvedDecision,
    null,
    `${decision.id} must not claim approval`,
  )
  assert.deepEqual(
    Object.keys(decision.implementationInputs),
    sourceGate.implementationInputs,
    `${decision.id} implementation key set drifted`,
  )
  for (const [key, value] of Object.entries(decision.implementationInputs)) {
    assert.equal(value, null, `${decision.id}.${key} must remain null in the template`)
  }
  assert.deepEqual(decision.sourceOrMemoReferences, [])
  assert.deepEqual(decision.assumptions, [])
  assert.deepEqual(decision.conditions, [])
  assert.equal(decision.expiryOrReviewDate, null)
  assert.deepEqual(decision.materialChangeTriggers, [])
}

assert.deepEqual(template.completionGate, {
  ownerSigned: false,
  qualifiedUkCounselSigned: false,
  professionalQualificationVerified: false,
  allImplementationInputsComplete: false,
  privateMemoHashVerified: false,
  allLegalGatesApproved: false,
  unresolvedOrConditionalValuesRemainBlockers: true,
})
assert.deepEqual(template.activationGate, {
  marketProfileEnabled: false,
  schemaReady: false,
  migrationAuthorized: false,
  productionWriteAuthorized: false,
})
assert.deepEqual(template.authority, {
  repositoryDocumentation: true,
  repositoryTests: true,
  ownerApproval: false,
  ukLegalApproval: false,
  migrationFile: false,
  databaseDdl: false,
  databaseDml: false,
  environmentChange: false,
  marketActivation: false,
  providerOrExternalCall: false,
})

for (const invariant of [
  'TEMPLATE ONLY — UNEXECUTED / NO LEGAL APPROVAL / NO MIGRATION AUTHORITY',
  'Every `ownerDecision`, `ukCounselDecision`',
  'Do not edit the source packet or this template in place',
  'Qualified UK counsel must independently fill',
  'A generic researcher, design reviewer, LLM answer, or unqualified consultant',
  'Store the signed confidential memo outside this public repository',
  'Any unresolved, conditional, ambiguous, or null value remains a blocker',
  'The repository must not infer them from a chat instruction',
  'Do not commit:',
  '`MARKET_PROFILE_GB_EW_SC_ENABLED` remain blocked',
]) {
  assert(normalizedDoc.includes(invariant), `missing template invariant: ${invariant}`)
}

assert.match(
  docsIndex,
  /r18-pr3c-owner-uk-counsel-signoff-template\.md/,
)
assert.match(
  implementationMap,
  /^### PR 3C Package B - Dual-Signoff Response Template$/m,
)
assert.match(
  implementationMap,
  /TEMPLATE PREPARED — Owner confirmation and qualified UK-counsel advice remain external inputs/,
)
assert.equal(
  packageJson.scripts['test:r18-pr3c-owner-uk-counsel-signoff-template'],
  'node scripts/test-r18-pr3c-owner-uk-counsel-signoff-template.mjs',
)
assert.match(
  previewWorkflow,
  /R18 PR3C Owner and qualified UK counsel sign-off template[\s\S]*npm run test:r18-pr3c-owner-uk-counsel-signoff-template/,
)

const packageBMigrationNames = migrationNames.filter(name =>
  /(?:r18|pr3c|market).*(?:package[_-]?b|eligibility)|(?:package[_-]?b|eligibility).*(?:r18|pr3c|market)/i.test(name),
)
assert.deepEqual(
  packageBMigrationNames,
  [],
  `sign-off template must not include a Package B migration: ${packageBMigrationNames.join(', ')}`,
)
assert.doesNotMatch(doc, /```sql/i, 'template must not contain executable SQL')
assert.doesNotMatch(
  JSON.stringify(template),
  /(?:service_role|supabase_service_role)[^\n]{0,60}(?:key|secret|token)/i,
)

console.log(
  'R18 PR3C dual-signoff template: exact fields are present, approvals remain null, and private legal material stays out of the public repository — PASS',
)
