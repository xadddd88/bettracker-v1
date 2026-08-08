#!/usr/bin/env node
/**
 * CSP Phase B readiness inventory regression gate (Slice S2B).
 *
 * This is intentionally a repository-only test: it keeps the compatibility
 * inventory current while the runtime CSP remains Report-Only. It does not
 * enable enforcement or attempt browser/runtime policy changes.
 */

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const inventoryPath = path.join(repoRoot, 'docs/security/csp-phase-b-readiness-s2b.v1.json')
const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'))

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

function text(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

function walk(relativeRoot) {
  const root = path.join(repoRoot, relativeRoot)
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const relativePath = path.join(relativeRoot, entry.name)
    return entry.isDirectory() ? walk(relativePath) : [relativePath]
  })
}

function slash(relativePath) {
  return relativePath.split(path.sep).join('/')
}

function occurrences(source, expression) {
  return source.match(expression)?.length ?? 0
}

test('inventory is pinned to S2B and the exact merged S2A baseline', () => {
  assert.equal(inventory.schema_version, 'csp-phase-b-readiness-s2b.v1')
  assert.equal(inventory.slice, 'S2B')
  assert.equal(inventory.status, 'readiness-only')
  assert.equal(inventory.baseline.sha, 'e76901d913034f8bfeb2370e2ce318c41b30f13e')
  assert.equal(inventory.scope.runtime_source_changed, false)
  assert.equal(inventory.scope.runtime_diff, 'clean')
  assert.equal(inventory.constraints.active_header, 'Content-Security-Policy-Report-Only')
  assert.equal(inventory.constraints.unsafe_inline_retained, true)
  assert.equal(inventory.constraints.phase_b, 'not-approved')
})

test('S2A execution evidence is recorded without claiming Phase B approval', () => {
  const evidence = inventory.s2a_execution_evidence
  const document = text('docs/csp-posthog-capability-reduction-s2a.md')
  for (const value of [
    'PR #248',
    evidence.reviewed_head,
    evidence.preview_tests_run,
    evidence.merge_commit,
    evidence.production_deployment,
    evidence.deployment_state,
    evidence.production_alias,
  ]) {
    assert.ok(document.includes(value), `${value} missing from S2A execution evidence`)
  }
  assert.match(document, /Phase B.*NOT APPROVED/)
})

test('middleware inventory covers next responses, redirects, cookies, and getUser', () => {
  const source = text(inventory.middleware.file)
  assert.equal(occurrences(source, /NextResponse\.next\(/g), inventory.middleware.next_response_next_sites)
  assert.equal(occurrences(source, /NextResponse\.redirect\(/g), inventory.middleware.redirects.length)
  assert.equal(occurrences(source, /request\.cookies\.set\(/g), inventory.middleware.request_cookie_write_sites)
  assert.equal(occurrences(source, /supabaseResponse\.cookies\.set\(/g), inventory.middleware.response_cookie_write_sites)
  assert.equal(occurrences(source, /supabase\.auth\.getUser\(\)/g), inventory.middleware.supabase_get_user_sites)
  for (const redirect of inventory.middleware.redirects) {
    assert.ok(source.includes(`'${redirect.destination}'`), `${redirect.destination} redirect missing`)
  }
})

test('App Router inventory distinguishes direct, inherited, and static-candidate paths', () => {
  const entrypoints = walk('app')
    .filter(file => file.endsWith('/page.tsx') || file.endsWith('/layout.tsx'))
    .map(slash)
    .sort()
  assert.deepEqual(entrypoints, [...inventory.app_router.entrypoints].sort())

  const directConsumers = entrypoints
    .filter(file => text(file).includes('@/lib/supabase/server'))
    .sort()
  assert.deepEqual(directConsumers, [...inventory.app_router.direct_supabase_server_consumers].sort())

  assert.ok(directConsumers.includes('app/(app)/layout.tsx'))
  for (const file of inventory.app_router.inherited_request_bound_pages) {
    assert.ok(entrypoints.includes(file), `${file} missing`)
    assert.equal(text(file).includes('@/lib/supabase/server'), false, `${file} is no longer inherited-only`)
  }
  for (const candidate of inventory.app_router.static_candidates) {
    const source = text(candidate.file)
    assert.equal(source.includes('@/lib/supabase/server'), false, `${candidate.route} is no longer a static candidate`)
    assert.doesNotMatch(source, /\b(cookies|headers)\s*\(/, `${candidate.route} now reads request primitives`)
  }
})

test('inline-style and script inventory remains classified', () => {
  const tsxFiles = [...walk('app'), ...walk('components')]
    .filter(file => file.endsWith('.tsx'))
    .map(slash)
  const locations = tsxFiles
    .map(file => ({ path: file, count: occurrences(text(file), /style=\{\{/g) }))
    .filter(location => location.count > 0)
    .sort((left, right) => left.path.localeCompare(right.path))
  assert.deepEqual(locations, [...inventory.inline_style_inventory.files].sort((left, right) => left.path.localeCompare(right.path)))
  assert.equal(locations.reduce((total, location) => total + location.count, 0), inventory.inline_style_inventory.total)

  const combined = tsxFiles.map(text).join('\n')
  assert.equal(occurrences(combined, /dangerouslySetInnerHTML/g), inventory.inline_style_inventory.dangerously_set_inner_html)
  assert.equal(occurrences(combined, /from ['"]next\/script['"]|<Script\b/g), inventory.inline_style_inventory.next_script_or_script_component)
})

test('CSP remains Report-Only with unsafe-inline and no Phase B mechanism', () => {
  const config = text('next.config.ts')
  assert.match(config, /Content-Security-Policy-Report-Only/)
  assert.doesNotMatch(config, /key:\s*['"]Content-Security-Policy['"]/)
  assert.ok(config.includes("'unsafe-inline'"))
  assert.doesNotMatch(config, /\*\.posthog\.com/)
  assert.doesNotMatch(config, /['"]strict-dynamic['"]/)
  assert.doesNotMatch(config, /'nonce-[^']+'/)
})

test('the standard CSP security command includes this readiness gate', () => {
  const packageJson = JSON.parse(text('package.json'))
  assert.match(packageJson.scripts['test:csp-security'], /test-csp-phase-b-readiness\.mjs/)
})

console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
