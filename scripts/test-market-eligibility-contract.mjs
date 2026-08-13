#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const buildDir = path.join(repoRoot, 'build', 'provider-smoke')
const require = createRequire(import.meta.url)
const source = file => readFileSync(path.join(repoRoot, file), 'utf8')

const contract = require(path.join(buildDir, 'lib/market/contract.js'))
const policy = require(path.join(buildDir, 'lib/market/server-policy.js'))

assert.deepEqual([...contract.MARKET_PROFILE_STATUSES], [
  'configured',
  'enabled',
  'suspended',
  'retired',
])
assert.deepEqual([...contract.MARKET_ELIGIBILITY_STATUSES], [
  'eligible',
  'verification_required',
  'verification_pending',
  'travel_limited',
  'unsupported',
  'blocked',
  'signal_conflict',
  'legal_terms_update_required',
])
assert.deepEqual(contract.GB_EW_SC_MARKET_PROFILE, {
  id: 'GB_EW_SC',
  version: 'GB_EW_SC_PROFILE_V1',
  status: 'configured',
  storefrontCountry: 'GB',
  eligibleTerritories: ['england', 'wales', 'scotland'],
  minimumAge: 18,
})
assert.equal(Object.isFrozen(contract.GB_EW_SC_MARKET_PROFILE), true)
assert.equal(Object.isFrozen(contract.GB_EW_SC_MARKET_PROFILE.eligibleTerritories), true)
assert.equal(policy.GB_EW_SC_POLICY_VERSION, 'GB_EW_SC_POLICY_V1')
assert.equal(policy.MARKET_PROFILE_GB_EW_SC_ENABLED_ENV, 'MARKET_PROFILE_GB_EW_SC_ENABLED')

const previousFlag = process.env.MARKET_PROFILE_GB_EW_SC_ENABLED

const baselineEvidence = Object.freeze({
  marketProfileId: 'GB_EW_SC',
  residenceTerritory: 'england',
  currentTerritory: 'england',
  storefrontCountry: 'GB',
  verificationState: 'verified',
  signalAssessment: 'consistent',
  legalTermsState: 'current',
  policyBlocked: false,
})

function statusFor(overrides = {}) {
  return policy.evaluateMarketEligibility({ ...baselineEvidence, ...overrides })
}

try {
  delete process.env.MARKET_PROFILE_GB_EW_SC_ENABLED
  assert.equal(policy.isGbEwScMarketProfileEnabled(), false)
  for (const raw of [undefined, null, '', false, true, 1, '1', 'TRUE', ' true ', 'yes']) {
    assert.equal(policy.isGbEwScMarketProfileEnabled(raw), false, String(raw))
  }
  assert.equal(policy.isGbEwScMarketProfileEnabled('true'), true)

  assert.deepEqual(statusFor(), {
    marketProfileId: 'GB_EW_SC',
    policyVersion: 'GB_EW_SC_POLICY_V1',
    status: 'blocked',
    reason: 'market_not_enabled',
    grantsAccess: false,
  })

  // This process-local value exercises the pure policy only; no deployment env changes.
  process.env.MARKET_PROFILE_GB_EW_SC_ENABLED = 'true'

  for (const territory of ['england', 'wales', 'scotland']) {
    const result = statusFor({
      residenceTerritory: territory,
      currentTerritory: territory,
    })
    assert.equal(result.status, 'eligible', territory)
    assert.equal(result.grantsAccess, true, territory)
  }

  // Locale-like extra fields are ignored: display language cannot change the decision.
  const localeIndependent = ['en', 'uk', 'ru', 'auto', 'ar'].map(locale =>
    policy.evaluateMarketEligibility({ ...baselineEvidence, locale }))
  assert.deepEqual(new Set(localeIndependent.map(result => JSON.stringify(result))).size, 1)
  assert.equal(localeIndependent[0].status, 'eligible')

  // GB storefront alone is evidence, never eligibility authority.
  assert.deepEqual(statusFor({
    residenceTerritory: null,
    currentTerritory: null,
    verificationState: 'required',
    signalAssessment: 'unresolved',
  }), {
    marketProfileId: 'GB_EW_SC',
    policyVersion: 'GB_EW_SC_POLICY_V1',
    status: 'verification_required',
    reason: 'residence_verification_required',
    grantsAccess: false,
  })

  const cases = [
    [{ marketProfileId: 'GB_NI' }, 'unsupported', 'unknown_market_profile'],
    [{ policyBlocked: true }, 'blocked', 'policy_blocked'],
    [{ policyBlocked: undefined }, 'blocked', 'policy_state_unavailable'],
    [{ residenceTerritory: 'northern_ireland' }, 'unsupported', 'northern_ireland_not_in_profile'],
    [{ residenceTerritory: 'france' }, 'unsupported', 'unsupported_residence'],
    [{ storefrontCountry: 'FR' }, 'signal_conflict', 'market_signal_conflict'],
    [{ signalAssessment: 'conflict' }, 'signal_conflict', 'market_signal_conflict'],
    [{ signalAssessment: 'unresolved' }, 'verification_required', 'market_signals_unresolved'],
    [{ currentTerritory: null }, 'verification_required', 'current_location_required'],
    [{ currentTerritory: 'northern_ireland' }, 'travel_limited', 'travel_outside_profile'],
    [{ currentTerritory: 'france' }, 'travel_limited', 'travel_outside_profile'],
    [{ legalTermsState: 'update_required' }, 'legal_terms_update_required', 'legal_terms_update_required'],
    [{ legalTermsState: 'unknown' }, 'verification_required', 'legal_terms_status_required'],
    [{ verificationState: 'pending' }, 'verification_pending', 'verification_pending'],
    [{ verificationState: 'required' }, 'verification_required', 'verification_required'],
  ]

  for (const [overrides, expectedStatus, expectedReason] of cases) {
    const result = statusFor(overrides)
    assert.equal(result.status, expectedStatus, JSON.stringify(overrides))
    assert.equal(result.reason, expectedReason, JSON.stringify(overrides))
    assert.equal(result.grantsAccess, false, JSON.stringify(overrides))
  }

  for (const malformed of [null, undefined, '', 1, []]) {
    const result = policy.evaluateMarketEligibility(malformed)
    assert.equal(result.status, 'unsupported', String(malformed))
    assert.equal(result.grantsAccess, false, String(malformed))
  }

  const currentDenied = statusFor({ verificationState: 'required' })
  const proposedEligible = statusFor()
  const routineElevation = policy.applyEligibilityRecheck(
    currentDenied,
    proposedEligible,
    'routine_recheck',
  )
  assert.equal(routineElevation.outcome, 'elevation_rejected')
  assert.strictEqual(routineElevation.decision, currentDenied)

  const serverElevation = policy.applyEligibilityRecheck(
    currentDenied,
    proposedEligible,
    'server_policy',
  )
  assert.equal(serverElevation.outcome, 'applied')
  assert.strictEqual(serverElevation.decision, proposedEligible)

  const proposedBlock = statusFor({ policyBlocked: true })
  const routineDowngrade = policy.applyEligibilityRecheck(
    proposedEligible,
    proposedBlock,
    'routine_recheck',
  )
  assert.equal(routineDowngrade.outcome, 'applied')
  assert.strictEqual(routineDowngrade.decision, proposedBlock)
  assert.equal(routineDowngrade.decision.grantsAccess, false)
} finally {
  if (previousFlag === undefined) delete process.env.MARKET_PROFILE_GB_EW_SC_ENABLED
  else process.env.MARKET_PROFILE_GB_EW_SC_ENABLED = previousFlag
}

const contractSource = source('lib/market/contract.ts')
const policySource = source('lib/market/server-policy.ts')
assert.match(policySource, /from 'node:process'/)
assert.doesNotMatch(policySource, /UiLocale|ui-locale|output_language/)
assert.doesNotMatch(contractSource + policySource, /supabase|createClient|\.from\(|\.rpc\(/i)

function sourceFilesUnder(relativeDir) {
  const root = path.join(repoRoot, relativeDir)
  const files = []
  const visit = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) visit(full)
      else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(full)
    }
  }
  visit(root)
  return files
}

for (const file of [...sourceFilesUnder('app'), ...sourceFilesUnder('components')]) {
  assert.doesNotMatch(
    readFileSync(file, 'utf8'),
    /lib\/market\/server-policy|@\/lib\/market\/server-policy/,
    `${path.relative(repoRoot, file)} must not activate PR3B at runtime`,
  )
}

const packageJson = JSON.parse(source('package.json'))
assert.match(packageJson.scripts['test:market-eligibility-contract'], /test-market-eligibility-contract\.mjs/)
assert.match(source('.github/workflows/preview-tests.yml'), /npm run test:market-eligibility-contract/)

const implementationRecord = source('docs/r18-pr3b-market-eligibility-contract.md')
for (const exclusion of [
  'no Supabase migration',
  'no production data write',
  'no market enablement',
  'no environment change',
]) {
  assert.match(implementationRecord, new RegExp(exclusion, 'i'), exclusion)
}

console.log('R18 PR3B market eligibility: disabled-by-default, territory-exact, locale-independent, and monotonic server policy — PASS')
