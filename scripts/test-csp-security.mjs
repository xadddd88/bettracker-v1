#!/usr/bin/env node
/**
 * CSP security suite (Decision #054 Phase A).
 *
 * Behavioral tests cover the pure CSP report parser/body reader. Source
 * assertions pin route status behavior, durable fail-closed rate limiting,
 * baseline headers, and the requirement that CSP remains Report-Only.
 */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const require = createRequire(import.meta.url)
const helper = require(path.join(repoRoot, 'build/provider-smoke/lib/security/csp-report.js'))

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

const legacy = (overrides = {}) => ({
  'csp-report': {
    'document-uri': 'https://btdk.app/login?token=secret#fragment',
    referrer: 'https://example.com/from?q=secret#hash',
    'blocked-uri': 'inline',
    'violated-directive': 'script-src-elem',
    'effective-directive': 'script-src-elem',
    disposition: 'report',
    'status-code': 200,
    'source-file': 'https://btdk.app/_next/app.js?auth=secret#x',
    'line-number': 12,
    'column-number': 7,
    'script-sample': 'SECRET_INLINE_CODE()',
    ...overrides,
  },
})

test('legacy report parses into a bounded allowlist', () => {
  const [report] = helper.parseCspReports(legacy())
  assert.equal(report.effectiveDirective, 'script-src-elem')
  assert.equal(report.statusCode, 200)
  assert.equal(report.lineNumber, 12)
  assert.equal(Object.hasOwn(report, 'scriptSample'), false)
})

test('Reporting API array parses csp-violation bodies', () => {
  const [report] = helper.parseCspReports([{ type: 'csp-violation', body: {
    documentURL: 'https://btdk.app/dashboard?x=1',
    blockedURL: 'https://cdn.example.test/a.js?token=secret#x',
    effectiveDirective: 'script-src-elem',
    disposition: 'report',
  } }])
  assert.equal(report.documentUri, 'https://btdk.app/dashboard')
  assert.equal(report.blockedUri, 'https://cdn.example.test/a.js')
})

test('URL query strings and fragments are removed', () => {
  const [report] = helper.parseCspReports(legacy())
  assert.equal(report.documentUri, 'https://btdk.app/login')
  assert.equal(report.referrer, 'https://example.com/from')
  assert.equal(report.sourceFile, 'https://btdk.app/_next/app.js')
})

test('malformed URLs are replaced, never logged verbatim', () => {
  const [report] = helper.parseCspReports(legacy({ 'document-uri': 'not a url?token=super-secret' }))
  assert.equal(report.documentUri, '[invalid-url]')
  assert.doesNotMatch(JSON.stringify(report), /super-secret/)
})

test('inline/eval/data/blob sources map to safe sentinels', () => {
  for (const [value, expected] of [
    ['inline', '[inline]'],
    ['eval', '[eval]'],
    ['data:text/plain,secret', '[data]'],
    ['blob:https://btdk.app/id', '[blob]'],
  ]) {
    const [report] = helper.parseCspReports(legacy({ 'blocked-uri': value }))
    assert.equal(report.blockedUri, expected)
  }
})

test('oversized strings are truncated', () => {
  const [report] = helper.parseCspReports(legacy({ 'violated-directive': 'x'.repeat(400) }))
  assert.equal(report.violatedDirective.length, helper.MAX_CSP_REPORT_FIELD_LENGTH)
})

test('script-sample is discarded by construction', () => {
  const [report] = helper.parseCspReports(legacy())
  assert.doesNotMatch(JSON.stringify(report), /SECRET_INLINE_CODE/)
})

test('malformed legacy shape is rejected', () => {
  assert.throws(() => helper.parseCspReports({ nope: true }), helper.CspReportParseError)
})

test('Reporting API without CSP entries is rejected', () => {
  assert.throws(() => helper.parseCspReports([{ type: 'deprecation', body: {} }]), helper.CspReportParseError)
})

await testAsync('capped body reader accepts a small payload', async () => {
  const request = new Request('https://btdk.app/api/csp-report', { method: 'POST', body: JSON.stringify(legacy()) })
  const text = await helper.readBodyCapped(request)
  assert.ok(text.includes('csp-report'))
})

await testAsync('capped body reader rejects a body over 32 KB', async () => {
  const request = new Request('https://btdk.app/api/csp-report', { method: 'POST', body: 'x'.repeat(helper.MAX_CSP_REPORT_BODY_BYTES + 1) })
  await assert.rejects(() => helper.readBodyCapped(request), helper.CspBodyTooLargeError)
})

const route = readFileSync(path.join(repoRoot, 'app/api/csp-report/route.ts'), 'utf8')
const config = readFileSync(path.join(repoRoot, 'next.config.ts'), 'utf8')
const rateLimit = readFileSync(path.join(repoRoot, 'lib/rate-limit.ts'), 'utf8')
const posthogProvider = readFileSync(path.join(repoRoot, 'components/PostHogProvider.tsx'), 'utf8')
const analyticsClient = readFileSync(path.join(repoRoot, 'lib/analytics/client.ts'), 'utf8')

test('route allows only reviewed CSP report media types', () => {
  for (const type of ['application/csp-report', 'application/reports+json', 'application/json']) {
    assert.ok(route.includes(type), `${type} missing`)
  }
  assert.ok(route.includes('415'))
})

test('route exposes the reviewed 204/400/413 contract', () => {
  assert.match(route, /status: 204/)
  assert.ok((route.match(/413/g) ?? []).length >= 2)
  assert.ok((route.match(/400/g) ?? []).length >= 3)
})

test('route fails closed on limiter unavailable and returns Retry-After on 429', () => {
  assert.match(route, /limit\.unavailable/)
  assert.match(route, /503/)
  assert.match(route, /!limit\.allowed/)
  assert.match(route, /429/)
  assert.match(route, /Retry-After/)
})

test('route uses durable limiter + canonical client IP and no in-memory Map', () => {
  assert.match(route, /canonicalClientIp/)
  assert.match(route, /RATE_LIMITS\.cspReport\(\)/)
  assert.match(route, /enforceRateLimit\(`csp-report:/)
  assert.doesNotMatch(route, /new Map/)
})

test('route never logs raw body or script-sample', () => {
  assert.doesNotMatch(route, /script-sample/)
  assert.doesNotMatch(route, /console\.(warn|log|error)\([^\n]*raw/)
  assert.match(route, /JSON\.stringify\(report\)/)
})

test('baseline headers exist while CSP remains Report-Only with unsafe-inline', () => {
  for (const value of [
    'Content-Security-Policy-Report-Only',
    'X-Content-Type-Options',
    'nosniff',
    'Referrer-Policy',
    'strict-origin-when-cross-origin',
    'X-Frame-Options',
    'DENY',
    'Permissions-Policy',
  ]) {
    assert.ok(config.includes(value), `${value} missing`)
  }
  assert.doesNotMatch(config, /key:\s*['"]Content-Security-Policy['"]/)
  assert.ok(config.includes("'unsafe-inline'"))
  assert.doesNotMatch(config, /\*\.posthog\.com/)
  assert.doesNotMatch(config, /['"]strict-dynamic['"]/)
})

test('PostHog browser initialization disables unused remote capabilities', () => {
  assert.equal((posthogProvider.match(/posthog\.init\(/g) ?? []).length, 1)
  for (const option of [
    'advanced_disable_flags',
    'disable_external_dependency_loading',
    'disable_surveys',
    'disable_product_tours',
    'disable_conversations',
  ]) {
    assert.match(posthogProvider, new RegExp(`${option}:\\s*true`), `${option} must be true`)
  }
})

test('locked PostHog SDK blocks external scripts and remote config under S2A controls', () => {
  const posthogRoot = path.dirname(require.resolve('posthog-js/package.json'))
  const probe = `
    global.window = {}
    let createdScripts = 0
    global.document = {
      body: { appendChild() { throw new Error('external script append reached') } },
      head: { appendChild() { throw new Error('external script append reached') } },
      querySelectorAll() { return [] },
      createElement() { createdScripts++; return {} },
      addEventListener() {},
    }

    require(${JSON.stringify(path.join(posthogRoot, 'lib/src/entrypoints/external-scripts-loader.js'))})
    const { PostHog } = require(${JSON.stringify(path.join(posthogRoot, 'lib/src/posthog-core.js'))})
    const { RemoteConfigLoader } = require(${JSON.stringify(path.join(posthogRoot, 'lib/src/remote-config.js'))})

    const scriptErrors = []
    const scriptInstance = {
      config: {
        disable_external_dependency_loading: true,
        strict_script_versioning: false,
        token: 'public-test-token',
      },
      requestRouter: { endpointFor(_kind, suffix) { return 'https://posthog.invalid' + suffix } },
      version: 'locked-test-version',
    }
    window.__PosthogExtensions__.loadExternalDependency(scriptInstance, 'remote-config', error => scriptErrors.push(error))
    window.__PosthogExtensions__.loadExternalDependency(scriptInstance, 'surveys', error => scriptErrors.push(error))
    window.__PosthogExtensions__.loadSiteApp(scriptInstance, '/site-app.js', error => scriptErrors.push(error))

    const core = new PostHog()
    core._originalUserConfig = { advanced_disable_flags: true }
    core.config.advanced_disable_flags = true
    let remoteRequests = 0
    let remoteApplications = 0
    const remoteInstance = {
      config: core.config,
      _shouldDisableFlags: core._shouldDisableFlags.bind(core),
      _send_request() { remoteRequests++ },
      _onRemoteConfig() { remoteApplications++ },
      requestRouter: { endpointFor(_kind, suffix) { return 'https://posthog.invalid' + suffix } },
    }
    new RemoteConfigLoader(remoteInstance).load()

    console.log(JSON.stringify({
      createdScripts,
      manualMethods: [typeof core.capture, typeof core.identify],
      remoteApplications,
      remoteRequests,
      scriptErrors,
    }))
  `
  const result = spawnSync(process.execPath, ['-e', probe], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const output = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1))
  assert.deepEqual(output, {
    createdScripts: 0,
    manualMethods: ['function', 'function'],
    remoteApplications: 0,
    remoteRequests: 0,
    scriptErrors: Array(3).fill('Loading of external scripts is disabled'),
  })
})

test('manual PostHog capture, identify, pageview, and pageleave remain enabled', () => {
  assert.match(posthogProvider, /capture_pageview:\s*false/)
  assert.match(posthogProvider, /capture_pageleave:\s*true/)
  assert.match(posthogProvider, /autocapture:\s*false/)
  assert.match(posthogProvider, /disable_session_recording:\s*true/)
  assert.match(posthogProvider, /ph\.capture\(['"]\$pageview['"],\s*\{\s*path:\s*pathname\s*\}\)/)
  assert.match(analyticsClient, /posthog\.capture\(event,\s*sanitize\(props\)\)/)
  assert.match(analyticsClient, /posthog\.identify\(userId,\s*sanitize\(traits\)\)/)
})

test('RATE_LIMITS exposes CSP report windows 60/min + 500/hour', () => {
  assert.match(rateLimit, /cspReport:\s*\(\): RateWindow\[\]/)
  assert.match(rateLimit, /RATE_LIMIT_CSP_REPORT_PER_MINUTE', 60/)
  assert.match(rateLimit, /RATE_LIMIT_CSP_REPORT_PER_HOUR', 500/)
})

console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
