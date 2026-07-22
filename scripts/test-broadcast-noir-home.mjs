#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolveAdaptiveAction } from '../lib/dashboard/adaptive-action.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = file => readFileSync(path.join(repoRoot, file), 'utf8')

assert.deepEqual(resolveAdaptiveAction({ draftAvailable: true, pendingCount: 4 }), {
  detail: 'Return to the saved form and verify every field before saving.',
  href: '/bets/new',
  kind: 'continue_draft',
  label: 'Continue draft',
  meta: 'Unsaved tracker draft',
})
assert.deepEqual(resolveAdaptiveAction({ draftAvailable: false, pendingCount: 2 }), {
  detail: 'Confirm only outcomes you know. Unresolved records remain untouched.',
  href: '/bets',
  kind: 'review_pending',
  label: 'Review 2 pending bets',
  meta: '2 records need attention',
})
assert.equal(resolveAdaptiveAction({ draftAvailable: false, pendingCount: 0 }).kind, 'scan_coupon')

const dashboard = read('app/(app)/dashboard/page.tsx')
for (const forbidden of [
  'EventPulseCard',
  'getPrimaryEvent',
  'editorial-ticker',
  'LIVE PORTFOLIO',
  'Scout for new value bets',
]) {
  assert.doesNotMatch(dashboard, new RegExp(forbidden), `dashboard retains ${forbidden}`)
}
assert.match(dashboard, /resolveAdaptiveAction/)
assert.match(dashboard, /orderedLegs/)
assert.match(dashboard, /var\(--signal\)/)
assert.match(dashboard, /var\(--data-value\)/)
assert.match(dashboard, /BroadcastStatus/)

const onboarding = read('components/onboarding/OnboardingCard.tsx')
assert.doesNotMatch(onboarding, /evaluates edge|structured recommendation|value bets|sharpen your edge/i)
assert.match(onboarding, /never saves .* automatically/i)

const mobileHome = read('apps/mobile/src/app/(app)/home.tsx')
for (const forbidden of ['EditorialBackdrop', 'KineticType', 'LIVE DATA', 'signalBand']) {
  assert.doesNotMatch(mobileHome, new RegExp(forbidden), `mobile Home retains ${forbidden}`)
}
assert.match(mobileHome, /resolveHomeAction/)
assert.match(mobileHome, /coupon\.legs\.map/)
assert.match(mobileHome, /semanticColors\.signal/)

const mobileFontSizes = [...mobileHome.matchAll(/fontSize:\s*(\d+)/g)].map(match => Number(match[1]))
assert.equal(mobileFontSizes.every(size => size >= 11), true, 'mobile Home contains functional text below 11 px')

console.log('Broadcast Noir PR C: Adaptive Action, ordered recent records and FP-001 Home gates passed')
