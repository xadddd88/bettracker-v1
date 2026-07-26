#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = file => readFileSync(path.join(root, file), 'utf8')

const page = read('app/(app)/tennis-calculator/page.tsx')
const calculator = read('app/(app)/tennis-calculator/SeriesCalculator.tsx')
const layout = read('app/(app)/layout.tsx')
const header = read('components/ui/AppHeader.tsx')
const mobileNav = read('components/ui/MobileNav.tsx')

let passed = 0
function test(name, fn) {
  fn()
  passed += 1
  console.log(`  ✅  ${name}`)
}

console.log('\nTennis PR-5 mobile UI gate')

test('route repeats authentication, owner and default-OFF flag checks server-side', () => {
  assert.ok(page.includes('await supabase.auth.getUser()'))
  assert.ok(page.includes('checkTennisCalcAccess(user.id)'))
  assert.ok(page.includes('notFound()'))
  assert.ok(!page.includes('createAdminClient'))
  assert.ok(!calculator.includes('OWNER_USER_ID'))
  assert.ok(!calculator.includes('TENNIS_CALC_ENABLED'))
})

test('authenticated RLS read restores open series and ordered steps on refresh', () => {
  assert.ok(page.includes(".from('tennis_series')"))
  assert.ok(page.includes(".in('status', ['draft', 'active'])"))
  assert.ok(page.includes(".from('tennis_series_steps')"))
  assert.ok(page.includes(".order('step_number', { ascending: true })"))
  assert.ok(page.includes('initialSeries={snapshot}'))
})

test('all database financial numerics cross the RSC boundary as decimal text', () => {
  for (const field of [
    'target_profit',
    'initial_stake',
    'stake_increment',
    'bankroll_limit',
    'maximum_stake',
    'exposure_limit',
    'quoted_odds',
    'recommended_stake',
    'accepted_odds',
    'accepted_stake',
    'actual_return',
    'loss_before',
    'target_profit_snapshot',
    'projected_series_result',
  ]) {
    assert.ok(page.includes(`${field}:${field}::text`), `${field} is not selected as text`)
  }
})

test('client preview uses the exact BigInt core and never float money math', () => {
  assert.ok(calculator.includes('requiredStakeMinor('))
  assert.ok(calculator.includes('actualProfitMinor('))
  assert.ok(calculator.includes('checkOpenBetLimits('))
  assert.doesNotMatch(calculator, /parseFloat|Math\.round|Math\.ceil/)
})

test('first-step seed and later dynamic recommendation are visibly distinct', () => {
  assert.ok(calculator.includes('series.steps.length === 0 && series.initial_stake'))
  assert.ok(calculator.includes(': requiredStakeMinor('))
  assert.ok(calculator.includes('Use recommendation'))
})

test('commands are double-tap guarded and retries keep payload-bound operation ids', () => {
  assert.ok(calculator.includes('if (inFlight.current) return'))
  assert.ok(calculator.includes('cache[key]?.payload !== serialized'))
  assert.ok(calculator.includes('crypto.randomUUID()'))
  assert.ok(calculator.includes('Retry will reuse the same operation id.'))
})

test('manual workflow exposes create, confirm, Win/Loss/Void, stop and journal states', () => {
  for (const copy of [
    'Create isolated series',
    'Confirm accepted step',
    'Save result',
    'Stop series',
    'Journal · server record',
    'BLOCK ·',
  ]) {
    assert.ok(calculator.includes(copy), `${copy} is missing`)
  }
  for (const result of ["'won'", "'lost'", "'void'"]) {
    assert.ok(calculator.includes(result), `${result} settlement is missing`)
  }
  assert.ok(calculator.includes('Stopping closes this series and cannot be undone.'))
  assert.ok(calculator.includes('Confirm stop'))
})

test('mobile interaction and risk copy stay accessible and outcome-neutral', () => {
  assert.ok(calculator.includes('inputMode="decimal"'))
  assert.ok(calculator.includes('min-h-12'))
  assert.ok(calculator.includes('role="alert"'))
  assert.ok(calculator.includes('aria-live="assertive"'))
  assert.ok(calculator.includes('does not guarantee an outcome'))
  assert.doesNotMatch(calculator, /guaranteed profit|guarantees? profit|risk[- ]free/i)
  assert.doesNotMatch(calculator, /bookmaker login|scrap(?:e|ing)|auto[- ]bet/i)
})

test('navigation is derived on the server and receives only an allowed boolean', () => {
  assert.ok(layout.includes('checkTennisCalcAccess(user.id).allowed'))
  assert.ok(layout.includes('tennisCalcEnabled={tennisCalcEnabled}'))
  assert.ok(header.includes("href: '/tennis-calculator'"))
  assert.ok(mobileNav.includes("href: '/tennis-calculator'"))
  assert.ok(header.includes('tennisCalcEnabled: boolean'))
  assert.ok(mobileNav.includes('tennisCalcEnabled: boolean'))
})

console.log(`\n${passed} tests — ${passed} passed, 0 failed\n`)
