#!/usr/bin/env node
/**
 * Security S2.2 Active Membership Enforcement focused regression.
 *
 * Hermetic only: source contracts plus a stubbed membership query. No network,
 * database, Auth, production, provider, or AI calls are made.
 */

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import Module from 'node:module'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const repoRoot = path.resolve(__dirname, '..')
const buildDir = path.join(repoRoot, 'build', 'provider-smoke')

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

function source(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

function walk(relativeRoot) {
  const root = path.join(repoRoot, relativeRoot)
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const relativePath = path.join(relativeRoot, entry.name)
    return entry.isDirectory() ? walk(relativePath) : [relativePath]
  })
}

function slash(value) {
  return value.split(path.sep).join('/')
}

const protectedRoutes = [
  'app/api/ai/analyst/route.ts',
  'app/api/ai/scanner/route.ts',
  'app/api/bankroll/deposit/route.ts',
  'app/api/bets/[id]/cancel/route.ts',
  'app/api/bets/[id]/settle/route.ts',
  'app/api/bets/tracked/route.ts',
  'app/api/coach/route.ts',
  'app/api/feedback/route.ts',
  'app/api/onboarding/complete/route.ts',
  'app/api/risk/evaluate/route.ts',
  'app/api/scout/[id]/route.ts',
  'app/api/scout/route.ts',
  'app/api/settings/route.ts',
  'app/api/tennis/forty-forty/last-24-hours/route.ts',
  'app/api/tennis/series/confirm/route.ts',
  'app/api/tennis/series/create/route.ts',
  'app/api/tennis/series/settle/route.ts',
  'app/api/tennis/series/stop/route.ts',
].sort()

const adminRoutes = [
  'app/api/admin/sports/enrichment/sportmonks-dry-run/route.ts',
  'app/api/admin/sports/enrichment/sportmonks-structural-presence-dry-run/route.ts',
  'app/api/admin/sports/fixtures/sync/route.ts',
  'app/api/admin/sports/mapping/provider-link/route.ts',
  'app/api/admin/sports/mapping/sportmonks-discovery/route.ts',
  'app/api/admin/sports/odds/dry-run/route.ts',
  'app/api/admin/sports/odds/reference-discovery/route.ts',
].sort()

const authBootstrapRoutes = [
  'app/api/auth/complete-invite/route.ts',
  'app/api/auth/register/route.ts',
].sort()

const cspRoutes = ['app/api/csp-report/route.ts']
const delegatedTennisRoutes = protectedRoutes.filter(file => file.includes('/tennis/series/'))

test('server-only primitive has one exact live used + verified-user predicate', () => {
  const primitive = source('lib/supabase/active-membership.ts')
  assert.match(primitive, /^import 'server-only'/)
  assert.equal((primitive.match(/\.from\('beta_access'\)/g) ?? []).length, 1)
  assert.match(primitive, /\.select\('status, used_by_user_id'\)/)
  assert.match(primitive, /\.eq\('used_by_user_id', userId\)/)
  assert.match(primitive, /row\.status === 'used' && row\.used_by_user_id === userId/)
  assert.doesNotMatch(primitive, /user_metadata|app_metadata|\.schema\(['"]private|is_active_member/)
})

let adminBehavior = { data: [], error: null, throws: false }
const adminPath = path.join(buildDir, 'lib/supabase/admin.js')
const activeMembershipPath = path.join(buildDir, 'lib/supabase/active-membership.js')

function queryBuilder() {
  const builder = {
    from(table) { assert.equal(table, 'beta_access'); return builder },
    select(columns) { assert.equal(columns, 'status, used_by_user_id'); return builder },
    eq(column, value) {
      assert.equal(column, 'used_by_user_id')
      assert.equal(value, 'verified-user')
      return builder
    },
    limit(value) { assert.equal(value, 2); return builder },
    async abortSignal() {
      if (adminBehavior.throws) throw new Error('stubbed timeout')
      return { data: adminBehavior.data, error: adminBehavior.error }
    },
  }
  return builder
}

const originalResolve = Module._resolveFilename
const originalLoad = Module._load
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) {
    return originalResolve.call(this, path.join(buildDir, request.slice(2)), parent, isMain, options)
  }
  return originalResolve.call(this, request, parent, isMain, options)
}
Module._load = function (request, parent, isMain) {
  if (request === 'server-only') return {}
  return originalLoad.call(this, request, parent, isMain)
}
require.cache[require.resolve(adminPath)] = {
  id: adminPath,
  filename: adminPath,
  loaded: true,
  exports: {
    createAdminClient: () => {
      if (adminBehavior.throws) throw new Error('stubbed configuration failure')
      return queryBuilder()
    },
  },
}
const { checkActiveMembership } = require(activeMembershipPath)

await testAsync('membership matrix permits only one matching used row', async () => {
  const cases = [
    { data: [{ status: 'used', used_by_user_id: 'verified-user' }], expected: 'active' },
    { data: [], expected: 'inactive' },
    { data: [{ status: 'approved', used_by_user_id: 'verified-user' }], expected: 'inactive' },
    { data: [{ status: 'invited', used_by_user_id: 'verified-user' }], expected: 'inactive' },
    { data: [{ status: 'revoked', used_by_user_id: 'verified-user' }], expected: 'inactive' },
    { data: [{ status: 'used', used_by_user_id: 'foreign-user' }], expected: 'inactive' },
  ]
  for (const item of cases) {
    adminBehavior = { data: item.data, error: null, throws: false }
    assert.equal((await checkActiveMembership('verified-user')).status, item.expected)
  }
})

await testAsync('membership dependency and impossible responses fail closed as unavailable', async () => {
  const cases = [
    { data: null, error: null, throws: false },
    { data: [], error: { message: 'query failed' }, throws: false },
    { data: [{ status: 'used', used_by_user_id: 'verified-user' }, { status: 'used', used_by_user_id: 'verified-user' }], error: null, throws: false },
    { data: [{ status: null, used_by_user_id: null }], error: null, throws: false },
    { data: [], error: null, throws: true },
  ]
  for (const item of cases) {
    adminBehavior = item
    assert.equal((await checkActiveMembership('verified-user')).status, 'unavailable')
  }
})

Module._resolveFilename = originalResolve
Module._load = originalLoad
delete require.cache[require.resolve(adminPath)]
delete require.cache[require.resolve(activeMembershipPath)]

await testAsync('cookie/Bearer wrapper preserves parity and maps 401 / 403 / 503', async () => {
  const requestAuthSource = source('lib/supabase/request-auth.ts')
  assert.doesNotMatch(requestAuthSource, /user_metadata|app_metadata|membership.*email/i)

  const requestAuthPath = path.join(buildDir, 'lib/supabase/request-auth.js')
  const serverPath = path.join(buildDir, 'lib/supabase/server.js')
  const membershipPath = path.join(buildDir, 'lib/supabase/active-membership.js')
  const supabasePackagePath = require.resolve('@supabase/supabase-js')
  const previousSupabasePackage = require.cache[supabasePackagePath]
  const previousEnv = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    service: process.env.SUPABASE_SERVICE_ROLE_KEY,
  }
  let cookieUser = { id: 'cookie-user' }
  let bearerUser = { id: 'bearer-user' }
  let membershipStatus = 'active'
  let cookieCreates = 0
  let bearerCreates = 0
  const membershipIds = []

  const cookieClient = {
    auth: { getUser: async () => ({ data: { user: cookieUser }, error: null }) },
  }
  const bearerClient = {
    auth: { getUser: async () => ({ data: { user: bearerUser }, error: null }) },
  }

  Module._resolveFilename = function (request, parent, isMain, options) {
    if (request.startsWith('@/')) {
      return originalResolve.call(this, path.join(buildDir, request.slice(2)), parent, isMain, options)
    }
    return originalResolve.call(this, request, parent, isMain, options)
  }
  require.cache[serverPath] = {
    id: serverPath, filename: serverPath, loaded: true,
    exports: { createClient: async () => { cookieCreates++; return cookieClient } },
  }
  require.cache[membershipPath] = {
    id: membershipPath, filename: membershipPath, loaded: true,
    exports: {
      checkActiveMembership: async userId => {
        membershipIds.push(userId)
        return { status: membershipStatus }
      },
    },
  }
  require.cache[supabasePackagePath] = {
    id: supabasePackagePath, filename: supabasePackagePath, loaded: true,
    exports: { createClient: () => { bearerCreates++; return bearerClient } },
  }
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://local-auth.invalid'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'synthetic-anon-key'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-service-key'

  try {
    delete require.cache[requestAuthPath]
    const adapter = require(requestAuthPath)

    let result = await adapter.authenticateActiveMemberRequest(new Request('https://example.test/api/settings'))
    assert.equal(result.authorized, true)
    assert.equal(result.user.id, 'cookie-user')
    assert.deepEqual(membershipIds, ['cookie-user'])

    membershipStatus = 'inactive'
    result = await adapter.authenticateActiveMemberRequest(new Request('https://example.test/api/settings'))
    assert.deepEqual(result, { authorized: false, status: 403, reason: 'inactive_membership' })

    membershipStatus = 'unavailable'
    result = await adapter.authenticateActiveMemberRequest(new Request('https://example.test/api/settings'))
    assert.deepEqual(result, { authorized: false, status: 503, reason: 'membership_unavailable' })

    cookieUser = null
    const membershipCallsBeforeNoUser = membershipIds.length
    result = await adapter.authenticateActiveMemberRequest(new Request('https://example.test/api/settings'))
    assert.deepEqual(result, { authorized: false, status: 401, reason: 'unauthorized' })
    assert.equal(membershipIds.length, membershipCallsBeforeNoUser)

    cookieUser = { id: 'cookie-user' }
    membershipStatus = 'active'
    const token = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ role: 'authenticated' })).toString('base64url')}.signature`
    result = await adapter.authenticateActiveMemberRequest(new Request('https://example.test/api/settings', {
      headers: { Authorization: `Bearer ${token}` },
    }))
    assert.equal(result.authorized, true)
    assert.equal(result.user.id, 'bearer-user')
    assert.equal(membershipIds.at(-1), 'bearer-user')

    const cookieCreatesBeforeInvalidBearer = cookieCreates
    const membershipCallsBeforeInvalidBearer = membershipIds.length
    bearerUser = null
    result = await adapter.authenticateActiveMemberRequest(new Request('https://example.test/api/settings', {
      headers: { Authorization: 'Bearer invalid-token' },
    }))
    assert.equal(result.status, 401)
    assert.equal(cookieCreates, cookieCreatesBeforeInvalidBearer, 'invalid Bearer must not fall back to cookies')
    assert.equal(membershipIds.length, membershipCallsBeforeInvalidBearer)
    assert.equal(bearerCreates, 2, 'one valid and one invalid Bearer client expected')

    for (const status of [401, 403, 503]) {
      const response = adapter.activeMemberAuthErrorResponse({ authorized: false, status })
      assert.equal(response.status, status)
    }
  } finally {
    delete require.cache[requestAuthPath]
    delete require.cache[serverPath]
    delete require.cache[membershipPath]
    if (previousSupabasePackage) require.cache[supabasePackagePath] = previousSupabasePackage
    else delete require.cache[supabasePackagePath]
    Module._resolveFilename = originalResolve
    if (previousEnv.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousEnv.url
    if (previousEnv.anon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousEnv.anon
    if (previousEnv.service === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousEnv.service
  }
})

test('all 28 API routes are explicitly classified 18 / 7 / 2 / 1', () => {
  const actual = walk('app/api').filter(file => file.endsWith('/route.ts')).map(slash).sort()
  assert.equal(actual.length, 28)
  assert.equal(protectedRoutes.length, 18)
  assert.equal(adminRoutes.length, 7)
  assert.equal(authBootstrapRoutes.length, 2)
  assert.equal(cspRoutes.length, 1)
  assert.deepEqual(
    actual,
    [...protectedRoutes, ...adminRoutes, ...authBootstrapRoutes, ...cspRoutes].sort(),
  )
})

test('every user route is gated while admin, bootstrap, and CSP boundaries stay separate', () => {
  for (const file of protectedRoutes) {
    const route = source(file)
    if (delegatedTennisRoutes.includes(file)) {
      assert.match(route, /runTennisWrite\(/, `${file} must delegate to the shared tennis gate`)
    } else {
      assert.match(route, /authenticateActiveMemberRequest\(/, `${file} missing membership wrapper`)
    }
  }
  const tennis = source('lib/tennis/server-write.ts')
  assert.match(tennis, /authenticateActiveMemberRequest\(req\)/)
  for (const file of [...adminRoutes, ...authBootstrapRoutes, ...cspRoutes]) {
    assert.doesNotMatch(source(file), /authenticateActiveMemberRequest\(/, `${file} crossed its separate boundary`)
  }
})

test('Web gate is fail-closed, loop-safe, and copies refreshed cookies to redirects', () => {
  const middleware = source('middleware.ts')
  const layout = source('app/(app)/layout.tsx')
  for (const route of ['/login', '/auth/', '/access-denied', '/service-unavailable']) {
    assert.ok(middleware.includes(`'${route}'`), `${route} public/special path missing`)
  }
  assert.match(middleware, /membership\.status === 'inactive'/)
  assert.match(middleware, /membership\.status === 'unavailable'/)
  assert.match(middleware, /supabaseResponse\.cookies\.getAll\(\)/)
  assert.match(middleware, /response\.cookies\.set\(cookie\)/)
  assert.match(layout, /checkActiveMembership\(user\.id\)/)
  assert.match(layout, /redirect\('\/access-denied'\)/)
  assert.match(layout, /redirect\('\/service-unavailable'\)/)
})

test('invite completion is one atomic consume RPC with fail-closed outcomes', () => {
  const complete = source('app/api/auth/complete-invite/route.ts')
  assert.equal((complete.match(/consume_beta_access_invite/g) ?? []).length, 1)
  assert.doesNotMatch(complete, /\.from\(['"]beta_access['"]\)|\.update\(/)
  assert.match(complete, /outcome === 'not_eligible'/)
  assert.match(complete, /outcome !== 'consumed' && outcome !== 'already_used'/)
  assert.match(complete, /if \(outcome === 'consumed'\)[\s\S]*trackServerEvent/)
})

test('S2.2 evidence records residual S2.3 boundary, CSP delta, and unit rollback', () => {
  const evidence = source('docs/active-membership-enforcement-s2-2.md')
  assert.match(evidence, /S2\.3/)
  assert.match(evidence, /direct Data API/i)
  assert.match(evidence, /Content-Security-Policy-Report-Only/)
  assert.match(evidence, /revert.*S2\.2.*unit/is)
  assert.doesNotMatch(evidence, /full revocation enforcement.*complete/i)
})

test('candidate scope contains no SQL, migration, RLS/RPC definition, or lockfile change', () => {
  const status = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  const workingPaths = status.trim().split('\n').filter(Boolean).map(line => line.slice(3))
  const committedPaths = workingPaths.length > 0 ? [] : execFileSync(
    'git',
    ['diff', '--name-only', 'HEAD^1', 'HEAD'],
    { cwd: repoRoot, encoding: 'utf8' },
  ).trim().split('\n').filter(Boolean)
  const paths = workingPaths.length > 0 ? workingPaths : committedPaths
  assert.ok(paths.length > 0, 'S2.2 candidate diff must be present')
  for (const file of paths) {
    assert.doesNotMatch(file, /(^|\/)supabase\/migrations\/|\.sql$|(^|\/)package-lock\.json$/)
  }
  const changedSources = paths.filter(file => /\.tsx?$/.test(file)).map(source).join('\n')
  assert.doesNotMatch(changedSources, /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION|CREATE\s+POLICY|ALTER\s+POLICY/i)
})

console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
