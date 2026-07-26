#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = file => readFileSync(path.join(root, file), 'utf8')

const events = read('lib/analytics/events.ts')
const helper = read('lib/tennis/server-write.ts')
const page = read('app/(app)/tennis-calculator/page.tsx')
const sanitizer = read('lib/analytics/sanitize.ts')
const docs = read('docs/product/tennis-live-series.md')

let passed = 0
function test(name, fn) {
  fn()
  passed += 1
  console.log(`  ✅  ${name}`)
}

console.log('\nTennis PR-6 analytics and operations gate')

test('event vocabulary covers view and four successful commands', () => {
  for (const event of [
    'tennis_calculator_viewed',
    'tennis_series_created',
    'tennis_step_confirmed',
    'tennis_step_settled',
    'tennis_series_stopped',
  ]) {
    assert.ok(events.includes(`'${event}'`), `${event} is missing`)
  }
})

test('page view is emitted only after the server access gate succeeds', () => {
  assert.ok(page.indexOf('checkTennisCalcAccess(user.id)') < page.indexOf('<PageView'))
  assert.ok(page.includes('EVENTS.TENNIS_CALCULATOR_VIEWED'))
})

test('server telemetry happens only after authoritative RPC response validation', () => {
  assert.ok(helper.indexOf('if (!validated.success)') < helper.indexOf('await trackServerEvent'))
  assert.ok(helper.includes('successEvents[command]'))
})

test('telemetry properties are allowlisted and contain no raw financial or match data', () => {
  const telemetry = helper.slice(
    helper.indexOf('await trackServerEvent'),
    helper.indexOf('return NextResponse.json({ success: true'),
  )
  for (const allowed of ['replayed', 'resulting_status', 'outcome']) {
    assert.ok(telemetry.includes(allowed), `${allowed} is missing`)
  }
  for (const forbidden of [
    'series_id',
    'step_id',
    'operation_id',
    'match_label',
    'target_profit',
    'stake',
    'odds',
    'bankroll',
    'exposure',
    'actual_return',
  ]) {
    assert.ok(!telemetry.includes(forbidden), `${forbidden} must not enter telemetry`)
  }
})

test('global sanitizer continues blocking raw financial properties', () => {
  for (const key of ['stake', 'pnl', 'profit', 'balance', 'bankroll_balance']) {
    assert.ok(sanitizer.includes(`'${key}'`), `${key} is not blocked`)
  }
})

test('operations guide preserves default-OFF and separate-approval rollout', () => {
  assert.ok(docs.includes('TENNIS_CALC_ENABLED=true'))
  assert.ok(docs.includes('default OFF'))
  assert.ok(docs.includes('migration 028'))
  assert.ok(docs.includes('separate approval'))
  assert.ok(docs.includes('No raw money, odds, match labels, IDs, or free text'))
})

console.log(`\n${passed} tests — ${passed} passed, 0 failed\n`)
