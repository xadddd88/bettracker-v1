#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const buildDir = path.join(repoRoot, 'build', 'provider-smoke')
const require = createRequire(import.meta.url)
const source = relativePath => readFileSync(path.join(repoRoot, relativePath), 'utf8')

const contract = require(path.join(buildDir, 'lib/market/contract.js'))
const presentation = require(path.join(buildDir, 'lib/market/presentation.js'))

const expectedReasons = [
  'eligible',
  'unknown_market_profile',
  'market_not_enabled',
  'policy_blocked',
  'policy_state_unavailable',
  'residence_verification_required',
  'northern_ireland_not_in_profile',
  'unsupported_residence',
  'market_signal_conflict',
  'market_signals_unresolved',
  'current_location_required',
  'travel_outside_profile',
  'legal_terms_update_required',
  'legal_terms_status_required',
  'verification_pending',
  'verification_required',
]

const expectedPairs = [
  ['eligible', 'eligible'],
  ['blocked', 'market_not_enabled'],
  ['blocked', 'policy_blocked'],
  ['blocked', 'policy_state_unavailable'],
  ['unsupported', 'unknown_market_profile'],
  ['unsupported', 'northern_ireland_not_in_profile'],
  ['unsupported', 'unsupported_residence'],
  ['verification_required', 'residence_verification_required'],
  ['verification_required', 'market_signals_unresolved'],
  ['verification_required', 'current_location_required'],
  ['verification_required', 'legal_terms_status_required'],
  ['verification_required', 'verification_required'],
  ['verification_pending', 'verification_pending'],
  ['travel_limited', 'travel_outside_profile'],
  ['signal_conflict', 'market_signal_conflict'],
  ['legal_terms_update_required', 'legal_terms_update_required'],
]

assert.deepEqual([...contract.MARKET_ELIGIBILITY_REASONS], expectedReasons)
assert.equal(presentation.MARKET_ELIGIBILITY_PRESENTATION_VERSION, 'R18_PR3C_PACKAGE_A_V1')
assert.equal(Object.isFrozen(presentation.MARKET_ELIGIBILITY_PRESENTATION_COPY_KEYS), true)
assert.equal(Object.isFrozen(presentation.MARKET_ELIGIBILITY_PRESENTATION_DEFINITIONS), true)
assert.equal(presentation.MARKET_ELIGIBILITY_PRESENTATION_COPY_KEYS.length, expectedPairs.length)
assert.equal(presentation.MARKET_ELIGIBILITY_PRESENTATION_DEFINITIONS.length, expectedPairs.length)

const observedPairs = presentation.MARKET_ELIGIBILITY_PRESENTATION_DEFINITIONS.map(definition => [
  definition.status,
  definition.reason,
])
assert.deepEqual(observedPairs, expectedPairs)
assert.equal(new Set(observedPairs.map(pair => pair.join('/'))).size, expectedPairs.length)

for (const definition of presentation.MARKET_ELIGIBILITY_PRESENTATION_DEFINITIONS) {
  assert.equal(Object.isFrozen(definition), true)
  assert.equal(
    definition.copyKey,
    `market_access.v1.${definition.status}.${definition.reason}`,
  )
  assert.equal(Object.isFrozen(definition.safeDestinationKeys), true)
  assert(definition.safeDestinationKeys.length > 0)

  const localized = new Map()
  for (const locale of ['en', 'uk', 'ru']) {
    const model = presentation.resolveMarketEligibilityPresentation({
      locale,
      status: definition.status,
      reason: definition.reason,
    })

    assert.equal(model.contractVersion, 'R18_PR3C_PACKAGE_A_V1')
    assert.equal(model.copyKey, definition.copyKey)
    assert.equal(model.locale, locale)
    assert.equal(model.status, definition.status)
    assert.equal(model.reason, definition.reason)
    assert.equal(model.tone, definition.tone)
    assert.equal(model.primaryAction.key, definition.primaryActionKey)
    assert(model.heading.trim().length > 4)
    assert(model.description.trim().length > 12)
    assert(model.primaryAction.label.trim().length > 2)
    assert.deepEqual(
      model.safeDestinations.map(destination => destination.key),
      [...definition.safeDestinationKeys],
    )
    assert(model.safeDestinations.every(destination => destination.label.trim().length > 1))
    assert.equal(Object.isFrozen(model), true)
    assert.equal(Object.isFrozen(model.primaryAction), true)
    assert.equal(Object.isFrozen(model.safeDestinations), true)
    assert.equal(Object.hasOwn(model, 'grantsAccess'), false)
    assert.equal(Object.hasOwn(model.primaryAction, 'href'), false)
    assert.equal(Object.hasOwn(model.primaryAction, 'url'), false)
    localized.set(locale, `${model.heading}\n${model.description}\n${model.primaryAction.label}`)
  }

  assert.equal(new Set(localized.values()).size, 3, definition.copyKey)
}

const fallback = presentation.resolveMarketEligibilityPresentation({
  locale: 'ru',
  status: 'eligible',
  reason: 'market_not_enabled',
})
assert.equal(fallback.status, 'blocked')
assert.equal(fallback.reason, 'policy_state_unavailable')
assert.equal(fallback.copyKey, 'market_access.v1.blocked.policy_state_unavailable')
assert.equal(fallback.locale, 'ru')

const legacyLocaleFallback = presentation.resolveMarketEligibilityPresentation({
  locale: 'auto',
  status: 'blocked',
  reason: 'market_not_enabled',
})
const english = presentation.resolveMarketEligibilityPresentation({
  locale: 'en',
  status: 'blocked',
  reason: 'market_not_enabled',
})
assert.equal(legacyLocaleFallback.locale, 'en')
assert.equal(legacyLocaleFallback.heading, english.heading)
assert.equal(legacyLocaleFallback.description, english.description)

const presentationSource = source('lib/market/presentation.ts')
for (const forbidden of [
  /server-policy/,
  /node:process/,
  /process\.env/,
  /createClient/,
  /supabase/i,
  /\.from\(/,
  /\.rpc\(/,
  /fetch\(/,
  /localStorage/,
  /sessionStorage/,
  /window\./,
]) {
  assert.doesNotMatch(presentationSource, forbidden)
}

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

const presentationConsumers = [...sourceFilesUnder('app'), ...sourceFilesUnder('components')]
  .filter(file => /lib\/market\/presentation|@\/lib\/market\/presentation/.test(readFileSync(file, 'utf8')))
  .map(file => path.relative(repoRoot, file).split(path.sep).join('/'))
  .sort()
assert.deepEqual(
  presentationConsumers,
  ['components/market/MarketAccessCard.tsx'],
  'Package A presentation must remain limited to the reviewed Package C adapter',
)

const onboarding = source('components/onboarding/OnboardingCard.tsx')
assert.doesNotMatch(onboarding, /сохраняй ставку из AI-рекомендации/)
assert.match(onboarding, /записывай собственное решение после проверки/)
assert.doesNotMatch(onboarding, /best bet|лучш(?:ая|ую) ставк|гарантированн(?:ая|ый) прибыл/i)

const serverPolicy = source('lib/market/server-policy.ts')
assert.match(serverPolicy, /type MarketEligibilityReason/)
assert.doesNotMatch(serverPolicy, /export type MarketEligibilityReason\s*=/)

const packageJson = JSON.parse(source('package.json'))
assert.match(packageJson.scripts['test:r18-pr3c-package-a'], /test-r18-pr3c-package-a\.mjs/)
assert.match(
  source('.github/workflows/preview-tests.yml'),
  /R18 PR3C Package A copy and presentation contract[\s\S]*npm run test:r18-pr3c-package-a/,
)

console.log('R18 PR3C Package A: neutral onboarding copy and complete en/uk/ru presentation contract — PASS')
