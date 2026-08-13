#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = relativePath => readFileSync(path.join(repoRoot, relativePath), 'utf8')

const handoff = source('docs/r18-pr3c-market-eligibility-design-handoff.md')
const marketContract = source('lib/market/contract.ts')
const marketPolicy = source('lib/market/server-policy.ts')
const onboarding = source('components/onboarding/OnboardingCard.tsx')

for (const heading of [
  'Outcome And Authority Boundary',
  'Onboarding Flow Contract',
  'Terms, Privacy, And Consent Separation',
  'Minimal Future Evidence Contract',
  'Exact Status And Reason Presentation',
  'Accessibility And Responsive Contract',
  'Acceptance Matrix',
  'Dependency-Safe Implementation Packages',
]) {
  assert.match(handoff, new RegExp(`^## \\d+\\. ${heading}$`, 'm'), `missing heading: ${heading}`)
}

const statuses = [
  'eligible',
  'verification_required',
  'verification_pending',
  'travel_limited',
  'unsupported',
  'blocked',
  'signal_conflict',
  'legal_terms_update_required',
]

for (const status of statuses) {
  assert(marketContract.includes(`'${status}'`), `PR3B contract missing status: ${status}`)
  assert(handoff.includes(`\`${status}`), `PR3C handoff missing status: ${status}`)
}

const statusReasonPairs = [
  ['eligible', 'eligible'],
  ['unsupported', 'unknown_market_profile'],
  ['blocked', 'market_not_enabled'],
  ['blocked', 'policy_blocked'],
  ['blocked', 'policy_state_unavailable'],
  ['verification_required', 'residence_verification_required'],
  ['unsupported', 'northern_ireland_not_in_profile'],
  ['unsupported', 'unsupported_residence'],
  ['signal_conflict', 'market_signal_conflict'],
  ['verification_required', 'market_signals_unresolved'],
  ['verification_required', 'current_location_required'],
  ['travel_limited', 'travel_outside_profile'],
  ['legal_terms_update_required', 'legal_terms_update_required'],
  ['verification_required', 'legal_terms_status_required'],
  ['verification_pending', 'verification_pending'],
  ['verification_required', 'verification_required'],
]

for (const [status, reason] of statusReasonPairs) {
  assert(marketPolicy.includes(`'${reason}'`), `PR3B policy missing reason: ${reason}`)
  assert(
    handoff.includes(`\`${status} / ${reason}\``),
    `PR3C handoff missing status/reason pair: ${status} / ${reason}`,
  )
}

for (const invariant of [
  'LEGAL INPUT REQUIRED',
  'Terms acknowledgement',
  'Privacy-notice presentation',
  'Optional analytics consent',
  'Optional AI history consent',
  'Optional AI memory consent',
  'off by default',
  'no Supabase migration',
  'no market activation',
  'service-only decision',
  'explicit grants plus RLS',
  'PostgreSQL 17',
  'active membership',
  '320px',
  'reduced-motion',
  'en`, `uk`, and `ru',
]) {
  assert(handoff.includes(invariant), `PR3C handoff missing invariant: ${invariant}`)
}

assert.match(handoff, /`GB_EW_SC_PROFILE_V1` remains `configured`, not `enabled`/)
assert.match(handoff, /`MARKET_PROFILE_GB_EW_SC_ENABLED` remains unset\/disabled/)
assert.match(handoff, /client cannot grant access/i)
assert.match(handoff, /Routine rechecks.*cannot elevate/is)
assert.match(handoff, /Storefront.*locale.*currency.*timezone.*not proof/is)
assert.match(handoff, /user_metadata.*authorization evidence/i)
assert.match(handoff, /Until such frames exist.*not visual\s+design acceptance/is)

assert.doesNotMatch(onboarding, /сохраняй ставку из AI-рекомендации/)
assert.match(handoff, /сохраняй ставку из AI-рекомендации/)
assert.match(handoff, /documented by this handoff but not\s+changed here/i)

assert.doesNotMatch(handoff, /optional consent (?:is|must be) required for core access/i)
assert.doesNotMatch(handoff, /locale (?:grants|enables|elevates) (?:market )?access/i)

const packageJson = JSON.parse(source('package.json'))
assert.equal(
  packageJson.scripts['test:r18-pr3c-handoff'],
  'node scripts/test-r18-pr3c-handoff.mjs',
)
assert.match(
  source('.github/workflows/preview-tests.yml'),
  /R18 PR3C design and engineering handoff[\s\S]*npm run test:r18-pr3c-handoff/,
)

console.log('R18 PR3C handoff: exact policy states, consent separation, fail-closed UX, and no runtime authority — PASS')
