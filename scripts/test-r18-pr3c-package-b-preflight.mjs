#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relativePath => readFileSync(path.join(repoRoot, relativePath), 'utf8')

const doc = read('docs/r18-pr3c-package-b-persistence-preflight.md')
const docsIndex = read('docs/README.md')
const implementationMap = read('docs/r18-implementation-map.md')
const baseline = JSON.parse(
  read('docs/security/r18-pr3c-package-b-production-baseline.v1.json'),
)
const migrationNames = readdirSync(path.join(repoRoot, 'supabase/migrations'))
  .filter(name => name.endsWith('.sql'))

const legalInputs = [
  ['LEGAL-01', 'children-access-classification'],
  ['LEGAL-02', 'age-assurance-method-and-strength'],
  ['LEGAL-03', 'residence-and-current-territory-methods'],
  ['LEGAL-04', 'lawful-basis-by-processing-purpose'],
  ['LEGAL-05', 'retention-deletion-and-user-erasure'],
  ['LEGAL-06', 'legal-document-master-translation-and-version-lifecycle'],
  ['LEGAL-07', 'optional-analytics-ai-history-and-ai-memory-basis'],
  ['LEGAL-08', 'product-classification-and-permitted-copy'],
]

assert.equal(baseline.schemaVersion, 1)
assert.equal(baseline.baselineId, 'bettracker-r18-pr3c-package-b-readiness')
assert.equal(baseline.status, 'read-only-reconnaissance-legal-blocked')
assert.equal(
  baseline.repository.baseCommit,
  'bdc1546083fc6096f527cf81085d505a457db8ff',
)
assert.equal(baseline.production.projectRef, 'ybbdkwjtytokrpbvgbmq')
assert.equal(baseline.production.postgresVersion, '17.6')
assert.deepEqual(baseline.production.latestMigration, {
  version: '20260812172400',
  name: 'active_membership_data_api_rpc_enforcement',
})
assert.equal(baseline.production.schemas.privateExists, true)
assert.deepEqual(baseline.production.candidateRelationCollisions, [])
assert.deepEqual(baseline.production.advisor.securityFindingCounts, {
  '0029_authenticated_security_definer_function_executable': 8,
  '0008_rls_enabled_no_policy': 1,
})
assert.equal(baseline.production.advisor.newPackageBFindingsAccepted, 0)

assert.deepEqual(
  baseline.legalInputs.map(({ id, topic }) => [id, topic]),
  legalInputs,
)
for (const input of baseline.legalInputs) {
  assert.equal(input.status, 'unresolved', `${input.id} must remain unresolved`)
  assert.equal(input.approvedValue, null, `${input.id} must not invent an approved value`)
  assert(doc.includes(`| \`${input.id}\``), `${input.id} matrix row missing`)
}

assert.deepEqual(baseline.authority, {
  repositoryDocumentation: true,
  repositoryTests: true,
  migrationFile: false,
  databaseDdl: false,
  databaseDml: false,
  environmentChange: false,
  marketActivation: false,
  providerOrExternalCall: false,
})

for (const heading of [
  'Outcome And Authority Boundary',
  'Read-Only Production Reconnaissance',
  'Current Supabase Constraints',
  'Blocking Legal Input Matrix',
  'Minimal Logical Persistence Boundary After Approval',
  'Exact Access-Control Shape',
  'Server-Only Decision Transaction',
  'Migration, Verification, And Apply Gate',
  'Rollback And Emergency Contract',
  'Real Owner Gate',
]) {
  assert.match(doc, new RegExp(`^## \\d+\\. ${heading}$`, 'm'), `missing heading: ${heading}`)
}

for (const invariant of [
  'BLOCKED — LEGAL INPUT REQUIRED / NO MIGRATION AUTHORITY',
  'no migration file, database DDL, database DML',
  'security_invoker = true',
  'SECURITY INVOKER',
  'Package B adds zero authenticated `SECURITY DEFINER` RPCs',
  'Own-user permissive SELECT plus restrictive live-membership policy',
  'routine-recheck elevation',
  'unique idempotency key',
  'exactly one `apply_migration`',
  'stop without',
  'keep `MARKET_PROFILE_GB_EW_SC_ENABLED` disabled',
  'no user row, evidence value, Auth identity, or application record was queried',
]) {
  assert(doc.includes(invariant), `missing invariant: ${invariant}`)
}
assert.match(doc, /destructive rollback\s+is forbidden/)

for (const officialSource of [
  'https://supabase.com/docs/guides/database/postgres/row-level-security',
  'https://supabase.com/docs/guides/database/functions',
  'https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically',
  'https://supabase.com/changelog/45827-deprecation-notice-support-for-postgres-14-ending-on-1st-july-2026',
  'https://supabase.com/changelog/46320-breaking-change-in-pg-graphql-1-6-0-graphql-introspection-disabled-by-default',
]) {
  assert(doc.includes(officialSource), `official Supabase source missing: ${officialSource}`)
}

for (const excludedData of [
  'Full passport/identity/proof-of-address images',
  'exact GPS history',
  'raw IP',
  'raw vendor risk payloads',
  'bookmaker credentials',
  'payment data',
  'user-editable JWT metadata',
]) {
  assert(doc.includes(excludedData), `excluded data class missing: ${excludedData}`)
}

const packageBMigrationNames = migrationNames.filter(name =>
  /(?:r18|pr3c|market).*(?:package[_-]?b|eligibility)|(?:package[_-]?b|eligibility).*(?:r18|pr3c|market)/i.test(name),
)
assert.deepEqual(
  packageBMigrationNames,
  [],
  `preflight must not include a Package B migration: ${packageBMigrationNames.join(', ')}`,
)

assert.doesNotMatch(doc, /```sql/i, 'preflight must not smuggle executable SQL')
assert.doesNotMatch(doc, /service_role[^\n]{0,80}(?:browser|client)[^\n]{0,80}(?:expose|send|share)/i)
assert.match(docsIndex, /r18-pr3c-package-b-persistence-preflight\.md/)
assert.match(implementationMap, /^### PR 3C Package B - Persistence Readiness Preflight$/m)
assert.match(implementationMap, /PREFLIGHT COMPLETE — migration remains blocked/)
assert.match(implementationMap, /Migrations: none/)

console.log('R18 PR3C Package B: production baseline, legal blockers, ACL/RLS design, and no migration authority — PASS')
