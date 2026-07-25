#!/usr/bin/env node
/**
 * Tennis Live Series Calculator PR-4 — closed server write-path suite.
 *
 * No network and no database are used here. PostgreSQL behavior is covered by
 * scripts/verify-migration-027.sh; this suite guards the application boundary.
 */

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import Module from 'node:module'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const repoRoot = path.resolve(__dirname, '..')
const buildDir = path.join(repoRoot, 'build', 'provider-smoke')

const OWNER = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeffff'
const OTHER = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffaaaa'
const SERIES = '10000000-0000-4000-8000-000000000001'
const STEP = '20000000-0000-4000-8000-000000000002'
const OPERATION = '30000000-0000-4000-8000-000000000003'

const routeFiles = {
  create: 'app/api/tennis/series/create/route.js',
  confirm: 'app/api/tennis/series/confirm/route.js',
  settle: 'app/api/tennis/series/settle/route.js',
  stop: 'app/api/tennis/series/stop/route.js',
}

const defaultResults = {
  create: { series_id: SERIES, status: 'draft', version: 0, replayed: false },
  confirm: {
    series_id: SERIES,
    step_id: STEP,
    step_number: 1,
    status: 'active',
    version: 1,
    recommended_stake: '20.00',
    loss_before: '0.00',
    target_profit_snapshot: '46.80',
    projected_series_result: '46.80',
    replayed: false,
  },
  settle: {
    series_id: SERIES,
    step_id: STEP,
    step_status: 'lost',
    status: 'active',
    version: 2,
    replayed: false,
  },
  stop: { series_id: SERIES, status: 'stopped', version: 3, replayed: false },
}

const validBodies = {
  create: {
    operation_id: OPERATION,
    target_profit: '46.8',
    initial_stake: '20',
    stake_increment: '0.01',
    currency_or_unit: 'USD',
    bankroll_limit: '5000',
    maximum_stake: '500',
    maximum_steps: 15,
    exposure_limit: '5000',
    formula_version: 'v1',
    match_label: 'Gate fixture',
  },
  confirm: {
    series_id: SERIES,
    operation_id: OPERATION,
    expected_version: 0,
    set_number: 1,
    game_number: 1,
    quoted_odds: '3.34',
    accepted_odds: '3.34',
    accepted_stake: '20',
  },
  settle: {
    series_id: SERIES,
    step_id: STEP,
    operation_id: OPERATION,
    expected_version: 1,
    result: 'lost',
  },
  stop: {
    series_id: SERIES,
    operation_id: OPERATION,
    expected_version: 2,
  },
}

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`  ✅  ${name}`)
    passed++
  } catch (error) {
    console.error(`  ❌  ${name}`)
    console.error(`      ${error.message}`)
    failed++
  }
}

async function testAsync(name, fn) {
  try {
    await fn()
    console.log(`  ✅  ${name}`)
    passed++
  } catch (error) {
    console.error(`  ❌  ${name}`)
    console.error(`      ${error.message}`)
    failed++
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function stripSqlComments(sql) {
  return sql.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')
}

console.log('\nPR-4 migration and rollback boundary')

const migrationPath = path.join(repoRoot, 'supabase/migrations/027_tennis_live_series_write_path.sql')
const rollbackPath = path.join(repoRoot, 'docs/tennis-pr4-rollback.sql')
const verifierPath = path.join(repoRoot, 'scripts/verify-migration-027.sh')
const migration = readFileSync(migrationPath, 'utf8')
const activeMigration = stripSqlComments(migration)
const rollback = readFileSync(rollbackPath, 'utf8')

test('exact PostgreSQL-17-gated migration 027 is present', () => {
  assert.equal(sha256(migration), 'b1d7515b829f556065c868a879651e9103d0f2f05c3b932d5a1f3b6902a39d25')
})

test('disposable verifier and guarded rollback are present outside migrations', () => {
  assert.ok(existsSync(verifierPath))
  assert.ok(existsSync(rollbackPath))
  assert.ok(!existsSync(path.join(repoRoot, 'supabase/migrations/tennis-pr4-rollback.sql')))
  assert.ok(rollback.includes('rollback_refused: tennis_series_commands is not empty'))
})

test('all four RPCs are SECURITY INVOKER with empty search_path', () => {
  assert.equal((activeMigration.match(/CREATE OR REPLACE FUNCTION public\.tennis_/g) ?? []).length, 4)
  assert.equal((activeMigration.match(/\nSECURITY INVOKER\n/g) ?? []).length, 4)
  assert.equal((activeMigration.match(/\nSET search_path = ''\n/g) ?? []).length, 4)
  assert.ok(!activeMigration.includes('SECURITY DEFINER'))
})

test('RPC execute is service-role-only', () => {
  assert.equal((activeMigration.match(/GRANT EXECUTE ON FUNCTION public\.tennis_/g) ?? []).length, 4)
  assert.equal((activeMigration.match(/REVOKE ALL ON FUNCTION public\.tennis_[^\n]+ FROM authenticated;/g) ?? []).length, 4)
  assert.equal((activeMigration.match(/REVOKE ALL ON FUNCTION public\.tennis_[^\n]+ FROM anon;/g) ?? []).length, 4)
})

test('minimum table ACL excludes DELETE, TRUNCATE and client writes', () => {
  for (const table of ['tennis_series', 'tennis_series_steps', 'tennis_series_commands']) {
    assert.ok(activeMigration.includes(`GRANT SELECT, INSERT, UPDATE ON public.${table} TO service_role;`))
  }
  assert.ok(!/GRANT[^;]*(DELETE|TRUNCATE)[^;]*TO service_role/.test(activeMigration))
  assert.ok(!/GRANT[^;]*(INSERT|UPDATE|DELETE)[^;]*TO authenticated/.test(activeMigration))
})

test('command ledger is RLS-enabled and payload-bound', () => {
  assert.ok(activeMigration.includes('CREATE TABLE public.tennis_series_commands'))
  assert.ok(activeMigration.includes('PRIMARY KEY (user_id, operation_id)'))
  assert.ok(activeMigration.includes('ALTER TABLE public.tennis_series_commands ENABLE ROW LEVEL SECURITY'))
  assert.ok(activeMigration.includes("RAISE EXCEPTION 'idempotency_conflict'"))
})

test('every state mutation takes a row lock and checks optimistic version', () => {
  assert.ok((activeMigration.match(/FOR UPDATE;/g) ?? []).length >= 7)
  assert.ok((activeMigration.match(/version <> p_expected_version/g) ?? []).length >= 3)
  assert.ok((activeMigration.match(/version = version \+ 1/g) ?? []).length >= 3)
})

console.log('\nPR-4 application boundary')

const helperPath = path.join(repoRoot, 'lib/tennis/server-write.ts')
const helper = readFileSync(helperPath, 'utf8')

test('one server helper owns auth, owner gate, rate limit and admin RPC', () => {
  for (const expected of [
    'checkTennisCalcAccess',
    'authenticateRequest',
    'enforceRateLimit',
    'RATE_LIMITS.tennisSeries()',
    'createAdminClient',
  ]) {
    assert.ok(helper.includes(expected), `${expected} missing`)
  }
  assert.ok(!helper.includes(".from('"))
  assert.ok(!helper.includes('.from("'))
})

test('the session user id is the only p_user_id source', () => {
  assert.ok(helper.includes("const args: Record<string, unknown> = { p_user_id: userId }"))
  assert.ok(!/p_user_id:\s*(body|input|parsed)/.test(helper))
  assert.ok(helper.includes('.strict()'))
})

test('all four API routes are thin POST-only bridges', () => {
  for (const [command, rel] of Object.entries(routeFiles)) {
    const sourcePath = path.join(repoRoot, rel.replace(/\.js$/, '.ts'))
    const source = readFileSync(sourcePath, 'utf8')
    assert.ok(source.includes("export const runtime = 'nodejs'"))
    assert.ok(source.includes(`runTennisWrite(req, '${command}')`))
    assert.ok(!source.includes('createAdminClient'))
    assert.ok(!source.includes('checkTennisCalcAccess'))
  }
})

test('no UI or client component imports the server write helper', () => {
  function sourceFiles(dir, acc = []) {
    if (!existsSync(dir)) return acc
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry)
      const stat = statSync(full)
      if (stat.isDirectory()) sourceFiles(full, acc)
      else if (/\.(ts|tsx|js|jsx)$/.test(entry)) acc.push(full)
    }
    return acc
  }

  const forbiddenRoots = ['app/(app)', 'components', 'apps/mobile']
  const importers = []
  for (const root of forbiddenRoots) {
    for (const file of sourceFiles(path.join(repoRoot, root))) {
      if (/tennis\/server-write/.test(readFileSync(file, 'utf8'))) {
        importers.push(path.relative(repoRoot, file))
      }
    }
  }
  assert.deepEqual(importers, [])
  assert.ok(!helper.includes("'use client'"))
})

let current = null

function clearCompiledModules() {
  const rels = [
    ...Object.values(routeFiles),
    'lib/tennis/server-write.js',
    'lib/flags/tennis-calc.js',
    'lib/tennis/contract.js',
    'lib/supabase/request-auth.js',
    'lib/supabase/admin.js',
    'lib/rate-limit.js',
  ]
  for (const rel of rels) {
    try {
      delete require.cache[require.resolve(path.join(buildDir, rel))]
    } catch {
      // The module may not have been loaded in this case.
    }
  }
}

function stubCompiledModules() {
  const authPath = path.join(buildDir, 'lib/supabase/request-auth.js')
  require.cache[require.resolve(authPath)] = {
    id: authPath,
    filename: authPath,
    loaded: true,
    exports: {
      authenticateRequest: async () => {
        current.calls.auth++
        return current.auth
      },
    },
  }

  const ratePath = path.join(buildDir, 'lib/rate-limit.js')
  require.cache[require.resolve(ratePath)] = {
    id: ratePath,
    filename: ratePath,
    loaded: true,
    exports: {
      RATE_LIMITS: { tennisSeries: () => [{ limit: 30, seconds: 60 }] },
      enforceRateLimit: async (key, windows) => {
        current.calls.rate.push({ key, windows })
        return current.rate
      },
    },
  }

  const adminPath = path.join(buildDir, 'lib/supabase/admin.js')
  require.cache[require.resolve(adminPath)] = {
    id: adminPath,
    filename: adminPath,
    loaded: true,
    exports: {
      createAdminClient: () => {
        current.calls.admin++
        if (current.adminThrows) throw new Error('missing configuration detail')
        return {
          rpc: async (name, args) => {
            current.calls.rpc.push({ name, args })
            return current.rpc
          },
        }
      },
    },
  }
}

function withCompiledAlias(fn) {
  const originalResolveFilename = Module._resolveFilename
  Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
    if (request.startsWith('@/')) {
      return originalResolveFilename.call(this, path.join(buildDir, request.slice(2)), parent, isMain, options)
    }
    return originalResolveFilename.call(this, request, parent, isMain, options)
  }
  return Promise.resolve().then(fn).finally(() => {
    Module._resolveFilename = originalResolveFilename
  })
}

async function invoke(command, options = {}) {
  return withCompiledAlias(async () => {
    clearCompiledModules()
    current = {
      auth: options.auth ?? { authorized: true, user: { id: OWNER }, supabase: {} },
      rate: options.rate ?? { allowed: true, retryAfter: 0, unavailable: false },
      rpc: options.rpc ?? { data: defaultResults[command], error: null },
      adminThrows: options.adminThrows ?? false,
      calls: { auth: 0, rate: [], admin: 0, rpc: [] },
    }
    stubCompiledModules()

    const previousFlag = process.env.TENNIS_CALC_ENABLED
    const previousOwner = process.env.OWNER_USER_ID
    if (options.flag === undefined) process.env.TENNIS_CALC_ENABLED = 'true'
    else if (options.flag === null) delete process.env.TENNIS_CALC_ENABLED
    else process.env.TENNIS_CALC_ENABLED = options.flag
    if (options.owner === undefined) process.env.OWNER_USER_ID = OWNER
    else if (options.owner === null) delete process.env.OWNER_USER_ID
    else process.env.OWNER_USER_ID = options.owner

    try {
      const route = require(path.join(buildDir, routeFiles[command]))
      const body = options.rawBody !== undefined
        ? options.rawBody
        : JSON.stringify(options.body ?? validBodies[command])
      const response = await route.POST(new Request(`https://example.test/api/tennis/series/${command}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      }))
      return {
        status: response.status,
        headers: response.headers,
        body: await response.json(),
        calls: current.calls,
      }
    } finally {
      if (previousFlag === undefined) delete process.env.TENNIS_CALC_ENABLED
      else process.env.TENNIS_CALC_ENABLED = previousFlag
      if (previousOwner === undefined) delete process.env.OWNER_USER_ID
      else process.env.OWNER_USER_ID = previousOwner
      clearCompiledModules()
      current = null
    }
  })
}

console.log('\nFail-closed access and abuse controls')

await testAsync('disabled flag returns 404 before auth, rate limit or RPC', async () => {
  const result = await invoke('create', { flag: 'false' })
  assert.equal(result.status, 404)
  assert.equal(result.calls.auth, 0)
  assert.equal(result.calls.rate.length, 0)
  assert.equal(result.calls.rpc.length, 0)
})

await testAsync('missing owner configuration returns 503 before authentication', async () => {
  const result = await invoke('create', { owner: null })
  assert.equal(result.status, 503)
  assert.equal(result.calls.auth, 0)
})

await testAsync('unauthenticated request returns 401 with zero RPC calls', async () => {
  const result = await invoke('create', { auth: { authorized: false } })
  assert.equal(result.status, 401)
  assert.equal(result.calls.rpc.length, 0)
})

await testAsync('authenticated non-owner returns 403 with zero admin calls', async () => {
  const result = await invoke('create', {
    auth: { authorized: true, user: { id: OTHER }, supabase: {} },
  })
  assert.equal(result.status, 403)
  assert.equal(result.calls.admin, 0)
})

await testAsync('unavailable limiter fails closed with 503', async () => {
  const result = await invoke('create', {
    rate: { allowed: false, retryAfter: 60, unavailable: true },
  })
  assert.equal(result.status, 503)
  assert.equal(result.calls.rpc.length, 0)
})

await testAsync('rate denial returns 429 and Retry-After', async () => {
  const result = await invoke('create', {
    rate: { allowed: false, retryAfter: 37, unavailable: false },
  })
  assert.equal(result.status, 429)
  assert.equal(result.headers.get('retry-after'), '37')
  assert.equal(result.calls.rpc.length, 0)
})

console.log('\nStrict command validation and sanitized errors')

await testAsync('invalid JSON is rejected before the admin client', async () => {
  const result = await invoke('create', { rawBody: '{' })
  assert.equal(result.status, 400)
  assert.equal(result.calls.admin, 0)
})

await testAsync('body-supplied user_id is rejected', async () => {
  const result = await invoke('create', { body: { ...validBodies.create, user_id: OTHER } })
  assert.equal(result.status, 400)
  assert.equal(result.calls.rpc.length, 0)
})

await testAsync('extra money precision is rejected, never rounded', async () => {
  const result = await invoke('create', {
    body: { ...validBodies.create, target_profit: '46.801' },
  })
  assert.equal(result.status, 400)
  assert.equal(result.calls.rpc.length, 0)
})

await testAsync('extra odds precision is rejected, never rounded', async () => {
  const result = await invoke('confirm', {
    body: { ...validBodies.confirm, quoted_odds: '3.3400' },
  })
  assert.equal(result.status, 400)
  assert.equal(result.calls.rpc.length, 0)
})

await testAsync('client-derived financial fields are rejected', async () => {
  for (const field of [
    'recommended_stake',
    'loss_before',
    'target_profit_snapshot',
    'projected_series_result',
  ]) {
    const result = await invoke('confirm', {
      body: { ...validBodies.confirm, [field]: '0.01' },
    })
    assert.equal(result.status, 400)
    assert.equal(result.calls.rpc.length, 0)
  }
})

await testAsync('idempotency conflict maps to a sanitized 409', async () => {
  const result = await invoke('create', {
    rpc: { data: null, error: { message: 'idempotency_conflict' } },
  })
  assert.equal(result.status, 409)
  assert.deepEqual(result.body, { error: 'Request conflict' })
})

await testAsync('foreign or unknown series maps to sanitized 404', async () => {
  const result = await invoke('confirm', {
    rpc: { data: null, error: { message: 'series_not_found' } },
  })
  assert.equal(result.status, 404)
  assert.deepEqual(result.body, { error: 'Not found' })
})

await testAsync('unexpected database detail is never returned to the client', async () => {
  const detail = 'duplicate key violates secret_constraint_name'
  const result = await invoke('create', { rpc: { data: null, error: { message: detail } } })
  assert.equal(result.status, 500)
  assert.ok(!JSON.stringify(result.body).includes(detail))
})

await testAsync('malformed RPC success result fails closed', async () => {
  const result = await invoke('create', { rpc: { data: { series_id: 'bad' }, error: null } })
  assert.equal(result.status, 500)
  assert.deepEqual(result.body, { error: 'Transaction failed' })
})

await testAsync('missing admin configuration fails closed without leaking detail', async () => {
  const result = await invoke('create', { adminThrows: true })
  assert.equal(result.status, 503)
  assert.deepEqual(result.body, { error: 'Service unavailable' })
})

console.log('\nAtomic RPC delegation')

await testAsync('create uses session-derived owner and canonical decimal strings', async () => {
  const result = await invoke('create')
  assert.equal(result.status, 200)
  assert.equal(result.body.success, true)
  assert.equal(result.calls.rpc.length, 1)
  assert.deepEqual(result.calls.rpc[0], {
    name: 'tennis_create_series',
    args: {
      p_user_id: OWNER,
      p_operation_id: OPERATION,
      p_target_profit: '46.80',
      p_initial_stake: '20.00',
      p_stake_increment: '0.01',
      p_currency_or_unit: 'USD',
      p_bankroll_limit: '5000.00',
      p_maximum_stake: '500.00',
      p_maximum_steps: 15,
      p_exposure_limit: '5000.00',
      p_formula_version: 'v1',
      p_match_label: 'Gate fixture',
    },
  })
})

await testAsync('confirm delegates only operator-entered values', async () => {
  const result = await invoke('confirm')
  assert.equal(result.status, 200)
  assert.equal(result.body.recommended_stake, '20.00')
  assert.equal(result.body.loss_before, '0.00')
  assert.equal(result.body.projected_series_result, '46.80')
  assert.deepEqual(result.calls.rpc[0], {
    name: 'tennis_confirm_step',
    args: {
      p_user_id: OWNER,
      p_series_id: SERIES,
      p_operation_id: OPERATION,
      p_expected_version: 0,
      p_set_number: 1,
      p_game_number: 1,
      p_quoted_odds: '3.340',
      p_accepted_odds: '3.340',
      p_accepted_stake: '20.00',
    },
  })
})

await testAsync('settle requires actual_return for a win', async () => {
  const result = await invoke('settle', {
    body: { ...validBodies.settle, result: 'won' },
  })
  assert.equal(result.status, 400)
  assert.equal(result.calls.rpc.length, 0)
})

await testAsync('settle rejects actual_return for lost or void outcomes', async () => {
  for (const settlement of ['lost', 'void']) {
    const result = await invoke('settle', {
      body: { ...validBodies.settle, result: settlement, actual_return: '1' },
    })
    assert.equal(result.status, 400)
    assert.equal(result.calls.rpc.length, 0)
  }
})

await testAsync('settle delegates a win with canonical actual_return', async () => {
  const rpcResult = {
    ...defaultResults.settle,
    step_status: 'won',
    status: 'completed_win',
  }
  const result = await invoke('settle', {
    body: { ...validBodies.settle, result: 'won', actual_return: '66.8' },
    rpc: { data: rpcResult, error: null },
  })
  assert.equal(result.status, 200)
  assert.deepEqual(result.calls.rpc[0], {
    name: 'tennis_settle_step',
    args: {
      p_user_id: OWNER,
      p_series_id: SERIES,
      p_step_id: STEP,
      p_operation_id: OPERATION,
      p_expected_version: 1,
      p_result: 'won',
      p_actual_return: '66.80',
    },
  })
})

await testAsync('stop delegates exactly once and returns versioned state', async () => {
  const result = await invoke('stop')
  assert.equal(result.status, 200)
  assert.equal(result.body.status, 'stopped')
  assert.deepEqual(result.calls.rpc[0], {
    name: 'tennis_stop_series',
    args: {
      p_user_id: OWNER,
      p_series_id: SERIES,
      p_operation_id: OPERATION,
      p_expected_version: 2,
    },
  })
})

console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
