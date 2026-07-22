import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { chromium } from '@playwright/test'
import axe from 'axe-core'

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url))
const NEXT_BIN = fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url))
const NETWORK_GUARD = fileURLToPath(new URL('./web-acceptance-network-guard.cjs', import.meta.url))
const FONT_MOCKS = fileURLToPath(new URL('./web-acceptance-font-mocks.cjs', import.meta.url))
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost'])
const TEST_USER_ID = '00000000-0000-4000-8000-000000000001'
const TEST_USER = {
  id: TEST_USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'acceptance@example.test',
  email_confirmed_at: '2026-07-22T00:00:00.000Z',
  phone: '',
  confirmed_at: '2026-07-22T00:00:00.000Z',
  last_sign_in_at: '2026-07-22T00:00:00.000Z',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  identities: [],
  created_at: '2026-07-22T00:00:00.000Z',
  updated_at: '2026-07-22T00:00:00.000Z',
  is_anonymous: false,
}
const VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 375, height: 812 },
  { width: 1024, height: 900 },
  { width: 1440, height: 1000 },
]
const ROUTES = ['/dashboard', '/ai', '/bets/new']

function isLoopback(urlValue) {
  try { return LOOPBACK_HOSTS.has(new URL(urlValue).hostname) } catch { return false }
}

function jsonResponse(response, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body)
  response.writeHead(status, {
    'access-control-allow-headers': 'authorization, apikey, content-type, prefer, x-client-info',
    'access-control-allow-methods': 'GET, HEAD, OPTIONS',
    'access-control-allow-origin': '*',
    'content-length': Buffer.byteLength(payload),
    'content-type': 'application/json',
    ...extraHeaders,
  })
  response.end(payload)
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  return server.address().port
}

async function reservePort() {
  const server = createServer()
  const port = await listen(server)
  await new Promise(resolve => server.close(resolve))
  return port
}

function sessionCookieValue() {
  const session = {
    access_token: 'acceptance-access-token',
    refresh_token: 'acceptance-refresh-token',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: TEST_USER,
  }
  return `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`
}

function safeChildEnvironment(supabaseOrigin) {
  const inherited = {}
  for (const key of ['CI', 'COMSPEC', 'HOME', 'LANG', 'PATH', 'PATHEXT', 'SYSTEMROOT', 'TEMP', 'TERM', 'TMP', 'USERPROFILE', 'WINDIR']) {
    if (process.env[key] != null) inherited[key] = process.env[key]
  }
  return {
    ...inherited,
    NODE_ENV: 'development',
    NODE_OPTIONS: `--require=${NETWORK_GUARD}`,
    NEXT_TELEMETRY_DISABLED: '1',
    NEXT_FONT_GOOGLE_MOCKED_RESPONSES: FONT_MOCKS,
    NEXT_PUBLIC_SUPABASE_URL: supabaseOrigin,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'acceptance-anon-key',
    NEXT_PUBLIC_POSTHOG_KEY: '',
    NEXT_PUBLIC_POSTHOG_HOST: '',
    NEXT_PUBLIC_SENTRY_DSN: '',
    SENTRY_AUTH_TOKEN: '',
    SENTRY_ORG: '',
    SENTRY_PROJECT: '',
    ANTHROPIC_API_KEY: '',
    THE_ODDS_API_KEY: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
  }
}

async function waitForNext(origin, child, logs) {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`Next exited early (${child.exitCode}).\n${logs()}`)
    try {
      const response = await fetch(`${origin}/login`, { redirect: 'manual' })
      if (response.status > 0) return
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for the hermetic Next server.\n${logs()}`)
}

async function stopChild(child) {
  if (child.exitCode != null) return
  child.kill()
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 5_000)),
  ])
  if (child.exitCode == null) child.kill('SIGKILL')
}

async function assertLabelFocus(page, id) {
  const control = page.locator(`#${id}`)
  const label = page.locator(`label[for="${id}"]`)
  assert.equal(await control.count(), 1, `${id} must identify exactly one control`)
  assert.equal(await label.count(), 1, `${id} must have exactly one visible label`)
  assert.equal(await label.isVisible(), true, `${id} label must be visible`)
  await label.click()
  assert.equal(await control.evaluate(element => element === document.activeElement), true, `${id} label must focus its control`)
}

async function assertNoDuplicateIds(page, label) {
  const duplicates = await page.locator('[id]').evaluateAll(elements => {
    const counts = new Map()
    for (const element of elements) counts.set(element.id, (counts.get(element.id) ?? 0) + 1)
    return [...counts.entries()].filter(([, count]) => count > 1)
  })
  assert.deepEqual(duplicates, [], `${label} must not contain duplicate IDs`)
}

async function assertAxe(page, label) {
  const result = await page.evaluate(async () => window.axe.run(document))
  assert.deepEqual(
    result.violations.map(violation => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.map(node => node.target.join(' ')),
    })),
    [],
    `${label} must pass axe without rule exclusions`,
  )
}

async function assertBaseAcceptance(page, route, viewport) {
  assert.equal(new URL(page.url()).pathname, route, `${route} must render authenticated content`)
  assert.equal(await page.locator('main').count(), 1, `${route} must expose exactly one main landmark`)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${route} must not overflow at ${viewport.width}px`)
  await assertNoDuplicateIds(page, `${route} at ${viewport.width}px`)
  await assertAxe(page, `${route} at ${viewport.width}px`)
}

async function assertAiLabels(page) {
  for (const id of [
    'ai-event-name',
    'ai-market-type',
    'ai-selection',
    'ai-odds',
    'ai-line',
    'ai-bookmaker',
    'ai-output-language',
    'ai-coupon-date-time',
    'ai-context-notes',
  ]) await assertLabelFocus(page, id)

  const sportGroup = page.getByRole('group', { name: 'Sport' })
  assert.equal(await sportGroup.count(), 1, 'Sport must have a programmatic group name')
  const sportButtons = sportGroup.getByRole('button')
  assert.equal(await sportButtons.count(), 7, 'Sport choices must remain complete')
  assert.equal(await sportButtons.evaluateAll(buttons => buttons.every(button => button.hasAttribute('aria-pressed'))), true, 'Sport choices must expose selected state')
}

async function assertTrackerLabels(page, exerciseDynamicLegs) {
  for (const id of [
    'tracker-leg-0-event',
    'tracker-leg-0-market',
    'tracker-leg-0-selection',
    'tracker-leg-0-odds',
    'tracker-leg-0-sport',
    'tracker-stake',
    'tracker-bookmaker',
    'tracker-notes',
  ]) await assertLabelFocus(page, id)

  if (!exerciseDynamicLegs) return
  await page.getByRole('button', { name: 'Express', exact: true }).click()
  await page.getByRole('button', { name: /^\+ Add leg/ }).click()
  await page.locator('#tracker-leg-1-event').waitFor()
  for (const id of [
    'tracker-leg-1-event',
    'tracker-leg-1-market',
    'tracker-leg-1-selection',
    'tracker-leg-1-odds',
    'tracker-leg-1-sport',
    'tracker-total-odds',
  ]) await assertLabelFocus(page, id)
  await assertNoDuplicateIds(page, 'Tracker with two dynamic legs')
}

async function assertFeedbackFocus(page, feedbackStubs) {
  const trigger = page.getByRole('button', { name: 'Open feedback form' })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Beta feedback' })
  await dialog.waitFor()
  const headerClose = dialog.locator('button[aria-label="Close"]')
  assert.equal(await headerClose.evaluate(element => element === document.activeElement), true, 'Feedback must focus Close initially')

  await page.keyboard.press('Shift+Tab')
  assert.equal(await dialog.getByRole('button', { name: 'Send feedback' }).evaluate(element => element === document.activeElement), true, 'Shift+Tab must wrap to the final control')
  await page.keyboard.press('Tab')
  assert.equal(await headerClose.evaluate(element => element === document.activeElement), true, 'Tab must wrap to the first control')

  await page.locator('main a').first().evaluate(element => element.focus())
  assert.equal(await headerClose.evaluate(element => element === document.activeElement), true, 'Background focus must be contained by the dialog')

  await page.keyboard.press('Escape')
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Open feedback form')
  assert.equal(await trigger.evaluate(element => element === document.activeElement), true, 'Escape must restore the original trigger')

  await trigger.click()
  await dialog.locator('button[aria-label="Close"]').click()
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Open feedback form')
  assert.equal(await trigger.evaluate(element => element === document.activeElement), true, 'Close must restore the original trigger')

  await trigger.click()
  await assertLabelFocus(page, 'feedback-message')
  await dialog.getByRole('button', { name: '5 stars' }).click()
  await dialog.getByRole('button', { name: 'Send feedback' }).click()
  await dialog.getByText('Feedback sent').waitFor()
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.includes('Feedback sent') ?? false), true, 'Successful submit must move focus after Submit is removed')
  assert.equal(await dialog.getByRole('button', { name: 'Send feedback' }).count(), 0, 'Successful submit must remove Submit')
  await dialog.getByRole('button', { name: 'Close', exact: true }).last().click()
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Open feedback form')
  assert.equal(await trigger.evaluate(element => element === document.activeElement), true, 'Success Close must restore the original trigger')
  assert.equal(feedbackStubs.count, 1, 'Feedback acceptance must use exactly one local browser stub')
}

async function assertSourceOnlyControls() {
  const ai = await readFile(new URL('../app/(app)/ai/page.tsx', import.meta.url), 'utf8')
  const decisions = await readFile(new URL('../app/(app)/decisions/[id]/DecisionActions.tsx', import.meta.url), 'utf8')
  assert.match(ai, /<label className="label" htmlFor="ai-stake">Stake<\/label>[\s\S]*?<input[\s\S]*?id="ai-stake"/, 'Conditional Analyst stake must have a bound label')
  assert.match(decisions, /<label[^>]+htmlFor="decision-stake"[\s\S]*?<input[\s\S]*?id="decision-stake"/, 'Decision stake must have a bound label')
}

await assertSourceOnlyControls()

const forbiddenStubRequests = []
const unexpectedStubRequests = []
const stubRequests = []
const supabaseStub = createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1')
  stubRequests.push(`${request.method} ${url.pathname}`)

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'access-control-allow-headers': 'authorization, apikey, content-type, prefer, x-client-info',
      'access-control-allow-methods': 'GET, HEAD, OPTIONS',
      'access-control-allow-origin': '*',
    })
    response.end()
    return
  }
  if (!['GET', 'HEAD'].includes(request.method)) {
    forbiddenStubRequests.push(`${request.method} ${url.pathname}`)
    jsonResponse(response, 405, { error: 'Web acceptance forbids DB/auth writes' })
    return
  }
  if (url.pathname === '/auth/v1/user') {
    jsonResponse(response, 200, TEST_USER)
    return
  }
  if (url.pathname === '/rest/v1/bets') {
    jsonResponse(response, 200, [], { 'content-range': '*/0' })
    return
  }
  if (url.pathname === '/rest/v1/bankrolls') {
    jsonResponse(response, 200, { balance: 1000, currency: 'USD' }, { 'content-range': '0-0/1' })
    return
  }
  if (url.pathname === '/rest/v1/profiles') {
    jsonResponse(response, 200, { onboarding_completed: true }, { 'content-range': '0-0/1' })
    return
  }

  unexpectedStubRequests.push(`${request.method} ${url.pathname}`)
  jsonResponse(response, 500, { error: 'Unexpected local Supabase acceptance request' })
})

const supabasePort = await listen(supabaseStub)
const supabaseOrigin = `http://127.0.0.1:${supabasePort}`
const nextPort = await reservePort()
const nextOrigin = `http://127.0.0.1:${nextPort}`
let nextOutput = ''
const nextServer = spawn(process.execPath, [NEXT_BIN, 'dev', '--hostname', '127.0.0.1', '--port', String(nextPort)], {
  cwd: REPO_ROOT,
  env: safeChildEnvironment(supabaseOrigin),
  stdio: ['ignore', 'pipe', 'pipe'],
})
for (const stream of [nextServer.stdout, nextServer.stderr]) {
  stream.on('data', chunk => { nextOutput = `${nextOutput}${chunk}`.slice(-30_000) })
}

let browser
const externalRequests = []
const browserErrors = []
const feedbackStubs = { count: 0 }

try {
  await waitForNext(nextOrigin, nextServer, () => nextOutput)
  browser = await chromium.launch({ headless: true })

  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ serviceWorkers: 'block', viewport })
    await context.addCookies([{
      name: 'sb-127-auth-token',
      value: sessionCookieValue(),
      domain: '127.0.0.1',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    }])
    await context.route('**/*', async route => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.origin === nextOrigin && url.pathname === '/api/feedback' && request.method() === 'POST') {
        feedbackStubs.count += 1
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
        return
      }
      if (url.origin === nextOrigin && url.pathname === '/api/csp-report' && request.method() === 'POST') {
        await route.fulfill({ status: 204, body: '' })
        return
      }
      if (!isLoopback(request.url())) {
        externalRequests.push(`${request.method()} ${request.url()}`)
        await route.abort('blockedbyclient')
        return
      }
      await route.continue()
    })

    for (const route of ROUTES) {
      const page = await context.newPage()
      await page.addInitScript({ content: axe.source })
      page.on('pageerror', error => browserErrors.push(`${route} at ${viewport.width}px: ${error.message}`))
      page.on('websocket', socket => {
        if (!isLoopback(socket.url())) externalRequests.push(`WEBSOCKET ${socket.url()}`)
      })
      const response = await page.goto(`${nextOrigin}${route}`, { waitUntil: 'networkidle', timeout: 120_000 })
      assert.equal(response?.status(), 200, `${route} must return 200 from the local app`)
      await assertBaseAcceptance(page, route, viewport)
      if (route === '/ai') await assertAiLabels(page)
      if (route === '/bets/new') await assertTrackerLabels(page, viewport.width === 375)
      if (route === '/dashboard' && viewport.width === 375) await assertFeedbackFocus(page, feedbackStubs)
      await page.close()
    }
    await context.close()
  }

  assert.deepEqual(externalRequests, [], 'Browser must not attempt production/provider/AI/external requests')
  assert.deepEqual(forbiddenStubRequests, [], 'Hermetic Supabase stub must receive zero writes')
  assert.deepEqual(unexpectedStubRequests, [], 'Hermetic Supabase stub must receive only allowlisted auth/data reads')
  assert.deepEqual(browserErrors, [], 'Authenticated acceptance pages must have no uncaught browser errors')
  assert.ok(stubRequests.some(request => request === 'GET /auth/v1/user'), 'Acceptance must exercise the real auth contract through the local stub')
  assert.ok(stubRequests.some(request => request === 'GET /rest/v1/bets'), 'Dashboard acceptance must exercise local data reads')
  console.log(`Web acceptance passed: ${VIEWPORTS.length} viewports × ${ROUTES.length} authenticated routes; zero external requests and zero writes.`)
} catch (error) {
  console.error(error)
  console.error('\nHermetic Next log tail:\n', nextOutput)
  process.exitCode = 1
} finally {
  if (browser) await browser.close()
  await stopChild(nextServer)
  await new Promise(resolve => supabaseStub.close(resolve))
}
