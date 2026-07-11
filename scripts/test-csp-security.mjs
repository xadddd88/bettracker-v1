#!/usr/bin/env node
/**
 * CSP security suite (Decision #054 Phase A).
 *
 * Behavioral tests cover the pure CSP report parser/body reader. Source
 * assertions pin route status behavior, durable fail-closed rate limiting,
 * baseline headers, and the requirement that CSP remains Report-Only.
 */

import assert from 'node:assert/strict'
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
})

test('RATE_LIMITS exposes CSP report windows 60/min + 500/hour', () => {
  assert.match(rateLimit, /cspReport:\s*\(\): RateWindow\[\]/)
  assert.match(rateLimit, /RATE_LIMIT_CSP_REPORT_PER_MINUTE', 60/)
  assert.match(rateLimit, /RATE_LIMIT_CSP_REPORT_PER_HOUR', 500/)
})

console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
