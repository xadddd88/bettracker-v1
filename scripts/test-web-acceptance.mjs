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
const SYNTHETIC_EXTERNAL_WEBSOCKET = 'wss://web-acceptance.invalid/blocked-before-handshake'
const BLOCKED_WEBSOCKET_CODE = 1008
const BLOCKED_WEBSOCKET_REASON = 'External WebSocket blocked by Web acceptance'
const TEST_USER_ID = '00000000-0000-4000-8000-000000000001'
const TEST_BET_ID = '00000000-0000-4000-8000-000000000005'
const FOUNDER_FLOW_BET_ID = '00000000-0000-4000-8000-000000000007'
const TEST_SETTLED_AT = '2026-07-22T23:30:00.000Z'
const FOUNDER_FLOW_PLACED_AT = '2026-07-27T14:00:00.000Z'
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
const FOUNDER_FLOW_VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 375, height: 812 },
  { width: 1280, height: 900 },
]
const ROUTES = ['/dashboard', '/ai', '/bets/new', `/bets/${TEST_BET_ID}`, '/bankroll', '/coach']
const SETTLED_TEST_BET = {
  id: TEST_BET_ID,
  user_id: TEST_USER_ID,
  status: 'void',
  stake: 100,
  total_odds: 2.14,
  pnl: 0,
  bookmaker: 'Acceptance',
  source: 'acceptance',
  notes: null,
  placed_at: '2026-07-22T20:00:00.000Z',
  settled_at: TEST_SETTLED_AT,
  archived_at: null,
  legs: [{
    id: '00000000-0000-4000-8000-000000000006',
    bet_id: TEST_BET_ID,
    leg_index: 0,
    event_name: 'Acceptance fixture',
    market_type: 'Match winner',
    selection: 'Home',
    odds: 2.14,
    sport: 'football',
  }],
}

function normalizeHostname(urlValue) {
  try {
    const hostname = new URL(urlValue).hostname.toLowerCase()
    return hostname.startsWith('[') && hostname.endsWith(']')
      ? hostname.slice(1, -1)
      : hostname
  } catch {
    return null
  }
}

function isLoopback(urlValue) {
  const hostname = normalizeHostname(urlValue)
  return hostname != null && LOOPBACK_HOSTS.has(hostname)
}

assert.equal(isLoopback('http://127.0.0.1:3000'), true, 'IPv4 loopback must remain allowlisted')
assert.equal(isLoopback('http://localhost:3000'), true, 'localhost must remain allowlisted')
assert.equal(isLoopback('http://[::1]:3000'), true, 'bracketed IPv6 loopback must normalize before allowlist matching')
assert.equal(isLoopback('https://web-acceptance.invalid'), false, 'external hosts must remain blocked')

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

function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
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
    TZ: 'UTC',
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
    SUPABASE_SERVICE_ROLE_KEY: 'acceptance-service-role-key',
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

async function assertNoHorizontalOverflow(page, label) {
  const metrics = await page.evaluate(() => {
    const main = document.querySelector('main')
    const shellScrollContainer = main?.parentElement
    return {
      document: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      },
      offenders: [...document.querySelectorAll('body *')]
        .map(element => {
          const bounds = element.getBoundingClientRect()
          return {
            element: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}`,
            className: typeof element.className === 'string' ? element.className.slice(0, 120) : '',
            text: element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80) ?? '',
            left: Math.round(bounds.left),
            right: Math.round(bounds.right),
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
          }
        })
        .filter(element => (
          element.left < 0
          || element.right > document.documentElement.clientWidth
          || element.scrollWidth > element.clientWidth
        ))
        .slice(0, 12),
      shell: shellScrollContainer instanceof HTMLElement
        ? {
            clientWidth: shellScrollContainer.clientWidth,
            scrollWidth: shellScrollContainer.scrollWidth,
          }
        : null,
    }
  })

  assert.ok(metrics.shell, `${label} must expose the authenticated shell scroll container`)
  assert.ok(
    metrics.document.scrollWidth <= metrics.document.clientWidth,
    `${label} document must not overflow horizontally (${metrics.document.scrollWidth}px > ${metrics.document.clientWidth}px); offenders=${JSON.stringify(metrics.offenders)}`,
  )
  assert.ok(
    metrics.shell.scrollWidth <= metrics.shell.clientWidth,
    `${label} shell scroll container must not overflow horizontally (${metrics.shell.scrollWidth}px > ${metrics.shell.clientWidth}px)`,
  )
}

async function assertInteractiveAcceptance(page, label) {
  await assertNoHorizontalOverflow(page, label)
  await assertNoDuplicateIds(page, label)
  await assertAxe(page, label)
}

async function assertBaseAcceptance(page, route, viewport) {
  assert.equal(new URL(page.url()).pathname, route, `${route} must render authenticated content`)
  assert.equal(await page.locator('main').count(), 1, `${route} must expose exactly one main landmark`)
  await assertNoHorizontalOverflow(page, `${route} at ${viewport.width}px`)
  await assertNoDuplicateIds(page, `${route} at ${viewport.width}px`)
  await assertAxe(page, `${route} at ${viewport.width}px`)
}

async function assertLoginAcceptance(page, viewport) {
  const label = `/login at ${viewport.width}px`
  assert.equal(new URL(page.url()).pathname, '/login', '/login must remain publicly reachable')
  assert.equal(await page.locator('main').count(), 1, '/login must expose exactly one main landmark')
  await assertNoHorizontalOverflow(page, label)
  await assertNoDuplicateIds(page, label)
  await assertAxe(page, label)

  const metrics = await page.locator('main').evaluate(root => {
    const heading = root.querySelector('h2')
    const visibleText = [...root.querySelectorAll('*')]
      .filter(element => element.children.length === 0 && element.textContent?.trim())
      .filter(element => element instanceof HTMLElement && element.offsetParent !== null)
    return {
      heading: heading
        ? { clientWidth: heading.clientWidth, scrollWidth: heading.scrollWidth }
        : null,
      undersizedText: visibleText
        .map(element => ({
          size: Number.parseFloat(getComputedStyle(element).fontSize),
          text: element.textContent?.trim().slice(0, 60),
        }))
        .filter(item => item.size < 11),
      buttonSizes: [...root.querySelectorAll('button')]
        .map(button => Number.parseFloat(getComputedStyle(button).fontSize)),
    }
  })

  assert.ok(metrics.heading, `${label} must expose the workspace heading`)
  assert.ok(
    metrics.heading.scrollWidth <= metrics.heading.clientWidth,
    `${label} workspace heading must fit its panel (${metrics.heading.scrollWidth}px > ${metrics.heading.clientWidth}px)`,
  )
  assert.deepEqual(metrics.undersizedText, [], `${label} must not render text below 11px`)
  assert.equal(
    metrics.buttonSizes.every(size => size >= 12),
    true,
    `${label} controls must render at 12px or larger`,
  )
}

async function assertBetDetailHydration(page) {
  const timestamps = await page.locator('main').evaluate(root => {
    const settledTerm = [...root.querySelectorAll('dt')]
      .find(element => element.textContent?.trim() === 'Рассчитана')
    const settlementKicker = [...root.querySelectorAll('.editorial-kicker')]
      .find(element => element.textContent?.trim() === 'Расчёт ставки')

    return {
      detail: settledTerm?.nextElementSibling?.textContent?.trim() ?? null,
      settlement: settlementKicker?.parentElement
        ?.querySelector('.text-bn-muted')
        ?.textContent
        ?.trim() ?? null,
    }
  })

  assert.equal(timestamps.detail, '22 июл. 2026 г., 23:30', 'Server-rendered settled timestamp must use the UTC release contract')
  assert.equal(timestamps.settlement, timestamps.detail, 'Client settlement timestamp must match the server-rendered value byte-for-byte')
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

  const sportGroup = page.getByRole('group', { name: /^(Sport|Спорт)$/ })
  assert.equal(await sportGroup.count(), 1, 'Sport must have a programmatic group name')
  const sportButtons = sportGroup.getByRole('button')
  assert.equal(await sportButtons.count(), 7, 'Sport choices must remain complete')
  assert.equal(await sportButtons.evaluateAll(buttons => buttons.every(button => button.hasAttribute('aria-pressed'))), true, 'Sport choices must expose selected state')
  await sportButtons.last().click()
  assert.equal(await sportButtons.last().getAttribute('aria-pressed'), 'true', 'Sport selection must expose its interactive selected state')
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
  await page.getByRole('button', { name: 'Экспресс', exact: true }).click()
  await page.getByRole('button', { name: /^\+ Добавить плечо/ }).click()
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
  const trigger = page.getByRole('button', { name: 'Открыть форму обратной связи' })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Отзыв по бете' })
  await dialog.waitFor()
  const headerClose = dialog.locator('button[aria-label="Закрыть"]')
  assert.equal(await headerClose.evaluate(element => element === document.activeElement), true, 'Feedback must focus close initially')
  await assertInteractiveAcceptance(page, 'Dashboard with feedback dialog open')

  await page.keyboard.press('Shift+Tab')
  assert.equal(await dialog.getByRole('button', { name: 'Отправить отзыв' }).evaluate(element => element === document.activeElement), true, 'Shift+Tab must wrap to the final control')
  await page.keyboard.press('Tab')
  assert.equal(await headerClose.evaluate(element => element === document.activeElement), true, 'Tab must wrap to the first control')

  await page.locator('main a').first().evaluate(element => element.focus())
  assert.equal(await headerClose.evaluate(element => element === document.activeElement), true, 'Background focus must be contained by the dialog')

  await page.keyboard.press('Escape')
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Открыть форму обратной связи')
  assert.equal(await trigger.evaluate(element => element === document.activeElement), true, 'Escape must restore the original trigger')

  await trigger.click()
  await dialog.locator('button[aria-label="Закрыть"]').click()
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Открыть форму обратной связи')
  assert.equal(await trigger.evaluate(element => element === document.activeElement), true, 'Close must restore the original trigger')

  await trigger.click()
  await assertLabelFocus(page, 'feedback-message')
  await dialog.getByRole('button', { name: '5 из 5' }).click()
  await dialog.getByRole('button', { name: 'Отправить отзыв' }).click()
  await dialog.getByText('Отзыв отправлен').waitFor()
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.includes('Отзыв отправлен') ?? false), true, 'Successful submit must move focus after submit is removed')
  assert.equal(await dialog.getByRole('button', { name: 'Отправить отзыв' }).count(), 0, 'Successful submit must remove submit')
  await assertInteractiveAcceptance(page, 'Dashboard with feedback success state')
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).last().click()
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Открыть форму обратной связи')
  assert.equal(await trigger.evaluate(element => element === document.activeElement), true, 'Success Close must restore the original trigger')
  assert.equal(feedbackStubs.count, 1, 'Feedback acceptance must use exactly one local browser stub')
}

async function assertSourceOnlyControls() {
  const ai = await readFile(new URL('../app/(app)/ai/page.tsx', import.meta.url), 'utf8')
  const decisions = await readFile(new URL('../app/(app)/decisions/[id]/DecisionActions.tsx', import.meta.url), 'utf8')
  assert.match(ai, /useState<UiLocale>\('ru'\)/, 'Analyst page must default to the current supported beta language')
  assert.match(ai, /<label className="label" htmlFor="ai-stake">[\s\S]*?<\/label>[\s\S]*?<input[\s\S]*?id="ai-stake"/, 'Conditional Analyst stake must have a bound label')
  assert.match(decisions, /<label[^>]+htmlFor="decision-stake"[\s\S]*?<input[\s\S]*?id="decision-stake"/, 'Decision stake must have a bound label')
}

async function assertExternalWebSocketPreblocked(context, forbiddenWebSocketAttempts) {
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  const networkEvents = {
    handshakeRequests: [],
    handshakeResponses: [],
    framesSent: [],
    framesReceived: [],
  }

  await cdp.send('Network.enable')
  cdp.on('Network.webSocketWillSendHandshakeRequest', event => networkEvents.handshakeRequests.push(event.requestId))
  cdp.on('Network.webSocketHandshakeResponseReceived', event => networkEvents.handshakeResponses.push(event.requestId))
  cdp.on('Network.webSocketFrameSent', event => networkEvents.framesSent.push(event.requestId))
  cdp.on('Network.webSocketFrameReceived', event => networkEvents.framesReceived.push(event.requestId))
  const closeResult = await page.evaluate(url => new Promise((resolve, reject) => {
    const socket = new WebSocket(url)
    const timeout = setTimeout(() => reject(new Error('Synthetic external WebSocket was not closed locally')), 5_000)
    let messages = 0
    socket.addEventListener('message', () => { messages += 1 })
    socket.addEventListener('close', event => {
      clearTimeout(timeout)
      resolve({ code: event.code, messages, reason: event.reason })
    }, { once: true })
  }), SYNTHETIC_EXTERNAL_WEBSOCKET)
  await page.waitForTimeout(100)

  assert.deepEqual(
    closeResult,
    { code: BLOCKED_WEBSOCKET_CODE, messages: 0, reason: BLOCKED_WEBSOCKET_REASON },
    'Synthetic external WebSocket must be closed locally without message exchange',
  )
  assert.deepEqual(
    forbiddenWebSocketAttempts,
    [SYNTHETIC_EXTERNAL_WEBSOCKET],
    'Synthetic external WebSocket must be intercepted by context.routeWebSocket',
  )
  assert.deepEqual(networkEvents, {
    handshakeRequests: [],
    handshakeResponses: [],
    framesSent: [],
    framesReceived: [],
  }, 'Synthetic external WebSocket must not perform a handshake or exchange frames with a server')

  await cdp.detach()
  await page.close()
}

async function installHermeticContextGuards(context, {
  externalRequests,
  feedbackStubs,
  forbiddenWebSocketAttempts,
  localApiHandler,
  nextOrigin,
}) {
  await context.routeWebSocket(/.*/, async webSocketRoute => {
    const url = webSocketRoute.url()
    if (isLoopback(url)) {
      webSocketRoute.connectToServer()
      return
    }
    forbiddenWebSocketAttempts.push(url)
    await webSocketRoute.close({ code: BLOCKED_WEBSOCKET_CODE, reason: BLOCKED_WEBSOCKET_REASON })
  })
  await context.route('**/*', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (localApiHandler && await localApiHandler(route, url)) return
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
}

function makeFounderFlowBet(payload) {
  return {
    id: FOUNDER_FLOW_BET_ID,
    user_id: TEST_USER_ID,
    bet_type: payload.legs.length === 1 ? 'single' : 'parlay',
    status: 'pending',
    stake: payload.stake,
    total_odds: payload.total_odds ?? payload.legs[0]?.odds ?? null,
    pnl: null,
    bookmaker: payload.bookmaker,
    source: payload.source,
    notes: payload.notes,
    placed_at: FOUNDER_FLOW_PLACED_AT,
    settled_at: null,
    archived_at: null,
    created_at: FOUNDER_FLOW_PLACED_AT,
    updated_at: FOUNDER_FLOW_PLACED_AT,
    legs: payload.legs.map((leg, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 8).padStart(12, '0')}`,
      bet_id: FOUNDER_FLOW_BET_ID,
      leg_index: index,
      leg_status: 'pending',
      created_at: FOUNDER_FLOW_PLACED_AT,
      updated_at: FOUNDER_FLOW_PLACED_AT,
      ...leg,
    })),
  }
}

function oversizedScannerResponse() {
  return {
    success: true,
    data: {
      odds: 12.34,
      stake: 999,
      bookmaker: 'Must not import',
      legs: Array.from({ length: 21 }, (_, index) => ({
        eventName: `Oversized fixture ${index + 1}`,
        marketType: 'Match winner',
        selection: 'Home',
        odds: 1.1,
        sport: 'soccer',
      })),
    },
  }
}

async function assertFounderDailyFlow(page, viewport, flow) {
  const label = `Founder Daily Flow at ${viewport.width}px`
  const eventName = `Founder flow fixture ${viewport.width}`
  const notes = `Manual review after refused scan ${viewport.width}`

  await page.addInitScript(() => {
    const originalRandomUUID = window.crypto.randomUUID.bind(window.crypto)
    window.__founderRandomUUIDCalls = 0
    Object.defineProperty(window.crypto, 'randomUUID', {
      configurable: true,
      value: () => {
        window.__founderRandomUUIDCalls += 1
        return originalRandomUUID()
      },
    })
  })
  await page.addInitScript({ content: axe.source })

  const response = await page.goto(`${flow.nextOrigin}/bets/new`, { waitUntil: 'networkidle', timeout: 120_000 })
  assert.equal(response?.status(), 200, `${label} tracker must return 200`)
  await assertBaseAcceptance(page, '/bets/new', viewport)

  await page.locator('#tracker-leg-0-event').fill(eventName)
  await page.locator('#tracker-leg-0-market').fill('Победитель матча')
  await page.locator('#tracker-leg-0-selection').fill('Хозяева')
  await page.locator('#tracker-leg-0-odds').fill('2.15')
  await page.locator('#tracker-stake').fill('25')
  await page.locator('#tracker-bookmaker').selectOption('Pinnacle')
  await page.locator('#tracker-notes').fill('Previous valid draft')

  const scannerRequestPromise = page.waitForRequest(request => (
    new URL(request.url()).pathname === '/api/ai/scanner' && request.method() === 'POST'
  ))
  await page.locator('#coupon-image').setInputFiles({
    name: 'oversized-coupon.png',
    mimeType: 'image/png',
    buffer: Buffer.from('hermetic-founder-flow'),
  })
  await scannerRequestPromise

  const fieldset = page.locator('form fieldset')
  const saveButton = page.locator('form button[type="submit"]')
  const cancelButton = page.getByRole('button', { name: 'Отмена' })
  assert.equal(await saveButton.count(), 1, `${label} must expose exactly one stable Save control`)
  await page.waitForFunction(() => document.querySelector('form fieldset')?.disabled === true)
  assert.equal(await fieldset.evaluate(element => element.disabled), true, `${label} scan must lock the complete form`)
  assert.equal(await page.locator('#coupon-image').isDisabled(), true, `${label} scan must lock the scanner input`)
  assert.equal(await saveButton.isDisabled(), true, `${label} scan must lock Save`)
  assert.equal(await cancelButton.isDisabled(), true, `${label} scan must lock Cancel`)

  flow.scannerGate.resolve()
  await page.getByText('В купоне больше 20 плеч, поэтому он не импортирован.').waitFor()
  await page.waitForFunction(() => document.querySelector('#coupon-image')?.disabled === false)
  assert.equal(await page.locator('#tracker-leg-0-event').inputValue(), eventName, `${label} overflow must preserve the previous draft`)
  assert.equal(await page.locator('#tracker-stake').inputValue(), '25', `${label} overflow must not import scanner stake`)
  assert.equal(await page.locator('#tracker-bookmaker').inputValue(), 'Pinnacle', `${label} overflow must not import scanner bookmaker`)

  const overflowUuidBaseline = await page.evaluate(() => window.__founderRandomUUIDCalls)
  await saveButton.click()
  await page.waitForTimeout(150)
  assert.equal(flow.trackedRequests, 0, `${label} overflow Save must send zero tracked-bet requests`)
  assert.equal(
    await page.evaluate(() => window.__founderRandomUUIDCalls),
    overflowUuidBaseline,
    `${label} overflow Save must mint zero idempotency UUIDs`,
  )

  await page.locator('#tracker-notes').fill(notes)
  assert.equal(
    await page.getByText('В купоне больше 20 плеч, поэтому он не импортирован.').count(),
    0,
    `${label} a deliberate manual edit must clear the overflow refusal`,
  )

  const trackedRequestPromise = page.waitForRequest(request => (
    new URL(request.url()).pathname === '/api/bets/tracked' && request.method() === 'POST'
  ))
  const submitUuidBaseline = await page.evaluate(() => window.__founderRandomUUIDCalls)
  await saveButton.evaluate(button => button.click())
  const trackedRequest = await trackedRequestPromise
  const payload = trackedRequest.postDataJSON()

  await page.waitForFunction(() => document.querySelector('form fieldset')?.disabled === true)
  assert.equal(await fieldset.evaluate(element => element.disabled), true, `${label} submit must lock the complete form`)
  assert.equal(await page.locator('#coupon-image').isDisabled(), true, `${label} submit must lock the scanner input`)
  assert.equal(await saveButton.isDisabled(), true, `${label} submit must lock Save`)
  assert.equal(await cancelButton.isDisabled(), true, `${label} submit must lock Cancel`)
  await saveButton.evaluate(button => button.click())
  await page.waitForTimeout(100)
  assert.equal(flow.trackedRequests, 1, `${label} in-flight double click must not send a second request`)
  assert.equal(
    await page.evaluate(baseline => window.__founderRandomUUIDCalls - baseline, submitUuidBaseline),
    1,
    `${label} successful intent must mint exactly one idempotency UUID`,
  )
  assert.deepEqual(
    { ...payload, idempotency_key: '<uuid>' },
    {
      legs: [{
        sport: 'soccer',
        event_name: eventName,
        market_type: 'Победитель матча',
        selection: 'Хозяева',
        odds: 2.15,
      }],
      total_odds: null,
      stake: 25,
      bookmaker: 'Pinnacle',
      notes,
      source: 'manual',
      idempotency_key: '<uuid>',
    },
    `${label} manual ownership must submit the reviewed allowlisted payload`,
  )
  assert.match(
    payload.idempotency_key,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    `${label} must submit one UUIDv4 idempotency key`,
  )

  flow.trackedGate.resolve()
  await page.waitForURL(`${flow.nextOrigin}/bets/${FOUNDER_FLOW_BET_ID}`, { timeout: 120_000 })
  await page.waitForLoadState('networkidle')
  await page.locator('main').evaluate(async element => {
    await Promise.all(element.getAnimations().map(animation => animation.finished))
  })
  await assertBaseAcceptance(page, `/bets/${FOUNDER_FLOW_BET_ID}`, viewport)
  await page.getByRole('heading', { name: eventName }).waitFor()
  await page.getByText('Победитель матча · Хозяева').waitFor()
  await page.getByText('Pinnacle', { exact: true }).waitFor()
  assert.equal(
    await page.locator('dt', { hasText: 'Источник' }).locator('xpath=following-sibling::dd[1]').textContent(),
    'manual',
    `${label} detail must preserve manual ownership after overflow unlock`,
  )

  await page.goto(`${flow.nextOrigin}/bets`, { waitUntil: 'networkidle', timeout: 120_000 })
  await assertBaseAcceptance(page, '/bets', viewport)
  await page.getByText('Записей: 1 · открыто: 1 · рассчитано: 0').waitFor()
  await page.getByText(eventName, { exact: true }).waitFor()

  await page.goto(`${flow.nextOrigin}/dashboard`, { waitUntil: 'networkidle', timeout: 120_000 })
  await assertBaseAcceptance(page, '/dashboard', viewport)
  await page.getByText(eventName, { exact: true }).waitFor()
  await page.getByText('1 открыто', { exact: true }).first().waitFor()
  await assertInteractiveAcceptance(page, `${label} dashboard after saved-record navigation`)
}

await assertSourceOnlyControls()

const forbiddenStubRequests = []
const unexpectedStubRequests = []
const stubRequests = []
let founderFlowBet = null
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
  if (url.pathname === '/rest/v1/beta_access') {
    assert.equal(request.headers.apikey, 'acceptance-service-role-key', 'membership lookup must use only the synthetic service client')
    assert.equal(url.searchParams.get('used_by_user_id'), `eq.${TEST_USER_ID}`, 'membership lookup must bind to the verified user id')
    jsonResponse(response, 200, [{ status: 'used', used_by_user_id: TEST_USER_ID }], { 'content-range': '0-0/1' })
    return
  }
  if (url.pathname === '/rest/v1/bets') {
    if (url.searchParams.get('id') === `eq.${TEST_BET_ID}`) {
      jsonResponse(response, 200, SETTLED_TEST_BET, { 'content-range': '0-0/1' })
      return
    }
    if (url.searchParams.get('id') === `eq.${FOUNDER_FLOW_BET_ID}` && founderFlowBet) {
      jsonResponse(response, 200, founderFlowBet, { 'content-range': '0-0/1' })
      return
    }
    const bets = founderFlowBet ? [founderFlowBet] : []
    jsonResponse(response, 200, bets, { 'content-range': bets.length ? '0-0/1' : '*/0' })
    return
  }
  if (url.pathname === '/rest/v1/bankrolls') {
    jsonResponse(response, 200, { balance: 1000, currency: 'USD' }, { 'content-range': '0-0/1' })
    return
  }
  if (url.pathname === '/rest/v1/bankroll_transactions') {
    jsonResponse(response, 200, [{
      id: '00000000-0000-4000-8000-000000000002',
      user_id: TEST_USER_ID,
      bankroll_id: '00000000-0000-4000-8000-000000000003',
      type: 'deposit',
      amount: 250.5,
      balance_after: 1000,
      created_at: '2026-07-22T23:30:00.000Z',
    }], { 'content-range': '0-0/1' })
    return
  }
  if (url.pathname === '/rest/v1/coaching_sessions') {
    jsonResponse(response, 200, [{
      id: '00000000-0000-4000-8000-000000000004',
      user_id: TEST_USER_ID,
      period_days: 30,
      bets_analysed: 5,
      decisions_analysed: 5,
      summary: 'Acceptance coaching summary.',
      strengths: [],
      weaknesses: [],
      recommendations: [],
      created_at: '2026-07-22T23:30:00.000Z',
    }], { 'content-range': '0-0/1' })
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
const forbiddenWebSocketAttempts = []
const observedExternalWebSockets = []
const browserErrors = []
const browserConsoleErrors = []
const feedbackStubs = { count: 0 }

try {
  await waitForNext(nextOrigin, nextServer, () => nextOutput)
  browser = await chromium.launch({ headless: true })

  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      locale: 'uk-UA',
      serviceWorkers: 'block',
      timezoneId: 'Europe/Kyiv',
      viewport,
    })
    await installHermeticContextGuards(context, {
      externalRequests,
      feedbackStubs,
      forbiddenWebSocketAttempts,
      nextOrigin,
    })

    const loginPage = await context.newPage()
    await loginPage.addInitScript({ content: axe.source })
    loginPage.on('pageerror', error => browserErrors.push(`/login at ${viewport.width}px: ${error.message}`))
    loginPage.on('console', message => {
      if (message.type() !== 'error') return
      const location = message.location()
      const source = location.url ? ` (${location.url}:${location.lineNumber ?? 0}:${location.columnNumber ?? 0})` : ''
      browserConsoleErrors.push(`/login at ${viewport.width}px: ${message.text()}${source}`)
    })
    const loginResponse = await loginPage.goto(`${nextOrigin}/login`, { waitUntil: 'networkidle', timeout: 120_000 })
    assert.equal(loginResponse?.status(), 200, '/login must return 200 from the local app')
    await assertLoginAcceptance(loginPage, viewport)
    await loginPage.close()

    await context.addCookies([{
      name: 'sb-127-auth-token',
      value: sessionCookieValue(),
      domain: '127.0.0.1',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    }])

    if (viewport === VIEWPORTS[0]) {
      await assertExternalWebSocketPreblocked(context, forbiddenWebSocketAttempts)
    }

    for (const route of ROUTES) {
      const page = await context.newPage()
      await page.addInitScript({ content: axe.source })
      page.on('pageerror', error => browserErrors.push(`${route} at ${viewport.width}px: ${error.message}`))
      page.on('console', message => {
        if (message.type() !== 'error') return
        const location = message.location()
        const source = location.url ? ` (${location.url}:${location.lineNumber ?? 0}:${location.columnNumber ?? 0})` : ''
        browserConsoleErrors.push(`${route} at ${viewport.width}px: ${message.text()}${source}`)
      })
      page.on('websocket', socket => {
        if (!isLoopback(socket.url())) observedExternalWebSockets.push(socket.url())
      })
      const response = await page.goto(`${nextOrigin}${route}`, { waitUntil: 'networkidle', timeout: 120_000 })
      assert.equal(response?.status(), 200, `${route} must return 200 from the local app`)
      await assertBaseAcceptance(page, route, viewport)
      if (route === '/ai') await assertAiLabels(page)
      if (route === '/bets/new') await assertTrackerLabels(page, viewport.width === 375)
      if (route === `/bets/${TEST_BET_ID}`) await assertBetDetailHydration(page)
      if (route === '/dashboard' && viewport.width === 375) await assertFeedbackFocus(page, feedbackStubs)
      await assertInteractiveAcceptance(page, `${route} after interactive checks at ${viewport.width}px`)
      await page.close()
    }
    await context.close()
  }

  for (const viewport of FOUNDER_FLOW_VIEWPORTS) {
    founderFlowBet = null
    const scannerGate = deferred()
    const trackedGate = deferred()
    const flow = {
      nextOrigin,
      scannerGate,
      scannerRequests: 0,
      trackedGate,
      trackedRequests: 0,
    }
    const context = await browser.newContext({
      locale: 'uk-UA',
      serviceWorkers: 'block',
      timezoneId: 'Europe/Kyiv',
      viewport,
    })
    await installHermeticContextGuards(context, {
      externalRequests,
      feedbackStubs,
      forbiddenWebSocketAttempts,
      nextOrigin,
      localApiHandler: async (route, url) => {
        const request = route.request()
        if (url.origin === nextOrigin && url.pathname === '/api/ai/scanner' && request.method() === 'POST') {
          flow.scannerRequests += 1
          await scannerGate.promise
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(oversizedScannerResponse()),
          })
          return true
        }
        if (url.origin === nextOrigin && url.pathname === '/api/bets/tracked' && request.method() === 'POST') {
          flow.trackedRequests += 1
          founderFlowBet = makeFounderFlowBet(request.postDataJSON())
          await trackedGate.promise
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              bet_id: FOUNDER_FLOW_BET_ID,
              balance: 975,
              replayed: false,
            }),
          })
          return true
        }
        return false
      },
    })
    await context.addCookies([{
      name: 'sb-127-auth-token',
      value: sessionCookieValue(),
      domain: '127.0.0.1',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    }])

    const page = await context.newPage()
    page.on('pageerror', error => browserErrors.push(`Founder Daily Flow at ${viewport.width}px: ${error.message}`))
    page.on('console', message => {
      if (message.type() !== 'error') return
      const location = message.location()
      const source = location.url ? ` (${location.url}:${location.lineNumber ?? 0}:${location.columnNumber ?? 0})` : ''
      browserConsoleErrors.push(`Founder Daily Flow at ${viewport.width}px: ${message.text()}${source}`)
    })
    page.on('websocket', socket => {
      if (!isLoopback(socket.url())) observedExternalWebSockets.push(socket.url())
    })

    try {
      await assertFounderDailyFlow(page, viewport, flow)
      assert.equal(flow.scannerRequests, 1, `Founder Daily Flow at ${viewport.width}px must use one local scanner stub`)
      assert.equal(flow.trackedRequests, 1, `Founder Daily Flow at ${viewport.width}px must use one local tracked-bet stub`)
    } finally {
      scannerGate.resolve()
      trackedGate.resolve()
      await page.close()
      await context.close()
      founderFlowBet = null
    }
  }

  assert.deepEqual(externalRequests, [], 'Browser must not attempt production/provider/AI/external requests')
  assert.deepEqual(
    forbiddenWebSocketAttempts,
    [SYNTHETIC_EXTERNAL_WEBSOCKET],
    'Every external WebSocket attempt must be preblocked; only the synthetic regression attempt is expected',
  )
  assert.deepEqual(
    observedExternalWebSockets,
    [],
    'WebSocket observation must see no unexpected external attempt after routeWebSocket preblocking',
  )
  assert.deepEqual(forbiddenStubRequests, [], 'Hermetic Supabase stub must receive zero writes')
  assert.deepEqual(unexpectedStubRequests, [], 'Hermetic Supabase stub must receive only allowlisted auth/data reads')
  assert.deepEqual(browserErrors, [], 'Authenticated acceptance pages must have no uncaught browser errors')
  assert.deepEqual(browserConsoleErrors, [], 'Authenticated acceptance pages must have no application console errors')
  assert.ok(stubRequests.some(request => request === 'GET /auth/v1/user'), 'Acceptance must exercise the real auth contract through the local stub')
  assert.ok(stubRequests.some(request => request === 'GET /rest/v1/beta_access'), 'Acceptance must exercise the live membership predicate through the local stub')
  assert.ok(stubRequests.some(request => request === 'GET /rest/v1/bets'), 'Dashboard acceptance must exercise local data reads')
  assert.ok(stubRequests.some(request => request === 'GET /rest/v1/coaching_sessions'), 'Coach acceptance must exercise local session reads')
  assert.ok(stubRequests.some(request => request === 'GET /rest/v1/bankroll_transactions'), 'Bankroll acceptance must exercise local transaction reads')
  console.log(`Web acceptance passed: ${VIEWPORTS.length} viewports × (1 public + ${ROUTES.length} authenticated routes) + ${FOUNDER_FLOW_VIEWPORTS.length} hermetic Founder Daily Flows; zero external requests and zero Supabase writes.`)
} catch (error) {
  console.error(error)
  console.error('\nHermetic Next log tail:\n', nextOutput)
  process.exitCode = 1
} finally {
  if (browser) await browser.close()
  await stopChild(nextServer)
  await new Promise(resolve => supabaseStub.close(resolve))
}
