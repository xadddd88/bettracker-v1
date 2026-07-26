#!/usr/bin/env node

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationPath = path.join(
  repoRoot,
  'supabase/migrations/028_tennis_series_authoritative_confirm.sql',
)
const rollbackPath = path.join(repoRoot, 'docs/tennis-pr4-authority-rollback.sql')
const helperPath = path.join(repoRoot, 'lib/tennis/server-write.ts')

let passed = 0

function test(name, fn) {
  fn()
  passed += 1
  console.log(`  ✅  ${name}`)
}

console.log('\nTennis authoritative confirmation corrective gate')

assert.ok(existsSync(migrationPath), 'migration 028 is missing')
assert.ok(existsSync(rollbackPath), 'migration 028 rollback is missing')

const migration = readFileSync(migrationPath, 'utf8')
const rollback = readFileSync(rollbackPath, 'utf8')
const helper = readFileSync(helperPath, 'utf8')

test('legacy client-derived confirm signature is dropped', () => {
  assert.ok(migration.includes('DROP FUNCTION public.tennis_confirm_step('))
  assert.ok(migration.includes('legacy client-derived confirm signature still exists'))
  assert.ok(!rollback.includes('CREATE OR REPLACE FUNCTION'))
})

test('replacement confirm RPC accepts only identity, version and operator inputs', () => {
  const signature = migration.slice(
    migration.indexOf('CREATE OR REPLACE FUNCTION public.tennis_confirm_step('),
    migration.indexOf('RETURNS jsonb'),
  )
  for (const allowed of [
    'p_user_id',
    'p_series_id',
    'p_operation_id',
    'p_expected_version',
    'p_set_number',
    'p_game_number',
    'p_quoted_odds',
    'p_accepted_odds',
    'p_accepted_stake',
  ]) {
    assert.ok(signature.includes(allowed), `${allowed} missing from replacement signature`)
  }
  for (const forbidden of [
    'p_recommended_stake',
    'p_loss_before',
    'p_target_profit_snapshot',
    'p_projected_series_result',
  ]) {
    assert.ok(!signature.includes(forbidden), `${forbidden} must not remain callable`)
  }
})

test('loss is derived from settled lost steps under the series lock', () => {
  assert.ok(migration.includes('FOR UPDATE;'))
  assert.ok(migration.includes("status = 'lost'"))
  assert.ok(migration.includes('SELECT COALESCE(sum(accepted_stake), 0)'))
  assert.ok(migration.includes("'confirmed', v_loss_before, v_series.target_profit"))
})

test('required stake uses exact integer ceil and configured stake increment', () => {
  assert.ok(migration.includes('(p_quoted_odds * 1000)::bigint'))
  assert.ok(migration.includes('(v_series.stake_increment * 100)::bigint'))
  assert.ok(migration.includes('v_next_step = 1 AND v_series.initial_stake IS NOT NULL'))
  assert.ok(migration.includes('(v_series.initial_stake * 100)::bigint'))
  assert.ok(migration.includes('v_recommended_raw_minor'))
  assert.ok(migration.includes('v_recommended_raw_minor + v_stake_increment_minor - 1'))
  assert.ok(!migration.includes('double precision'))
  assert.ok(!migration.includes('real '))
})

test('bankroll and exposure compare both required and accepted stake plus loss', () => {
  assert.ok(migration.includes('v_loss_before + v_recommended_stake > v_series.bankroll_limit'))
  assert.ok(migration.includes('v_loss_before + p_accepted_stake > v_series.bankroll_limit'))
  assert.ok(migration.includes('v_loss_before + v_recommended_stake > v_series.exposure_limit'))
  assert.ok(migration.includes('v_loss_before + p_accepted_stake > v_series.exposure_limit'))
})

test('RPC remains service-role-only SECURITY INVOKER with empty search path', () => {
  assert.ok(migration.includes('SECURITY INVOKER'))
  assert.ok(migration.includes("SET search_path = ''"))
  assert.ok(!migration.includes('SECURITY DEFINER'))
  assert.ok(migration.includes('TO service_role;'))
  assert.ok(migration.includes('FROM authenticated;'))
  assert.ok(migration.includes('FROM anon;'))
})

test('HTTP contract rejects all four client-derived financial fields', () => {
  const confirmStart = helper.indexOf('const confirmSchema')
  const confirmEnd = helper.indexOf('const settleSchema')
  const confirmSchema = helper.slice(confirmStart, confirmEnd)
  for (const forbidden of [
    'recommended_stake',
    'loss_before',
    'target_profit_snapshot',
    'projected_series_result',
  ]) {
    assert.ok(!confirmSchema.includes(forbidden), `${forbidden} remains in request schema`)
  }
  assert.ok(confirmSchema.includes('.strict()'))
})

test('authoritative derived values are validated in the RPC response', () => {
  const resultStart = helper.indexOf('const resultSchemas')
  const resultEnd = helper.indexOf('const requestSchemas')
  const resultSchemas = helper.slice(resultStart, resultEnd)
  for (const expected of [
    'recommended_stake',
    'loss_before',
    'target_profit_snapshot',
    'projected_series_result',
  ]) {
    assert.ok(resultSchemas.includes(expected), `${expected} missing from response contract`)
  }
})

test('migration and rollback refuse non-empty command history', () => {
  assert.ok(migration.includes('authoritative_upgrade_refused: tennis_series_commands is not empty'))
  assert.ok(rollback.includes('rollback_refused: tennis_series_commands is not empty'))
})

console.log(`\n${passed} tests — ${passed} passed, 0 failed\n`)
