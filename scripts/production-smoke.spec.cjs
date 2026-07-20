const { test, expect } = require('@playwright/test')

const baseUrl = (process.env.QA_BASE_URL || 'https://btdk.app').replace(/\/$/, '')
const qaEmail = process.env.QA_SMOKE_EMAIL
const qaPassword = process.env.QA_SMOKE_PASSWORD

if (!qaEmail || !qaPassword) {
  throw new Error('QA_SMOKE_EMAIL and QA_SMOKE_PASSWORD must both be configured')
}

test.use({
  baseURL: baseUrl,
  locale: 'en-US',
  timezoneId: 'Europe/Kyiv',
})

test.setTimeout(150_000)

test('authenticated Analyst production smoke stays outside financial writes', async ({ page }) => {
  const analystRequests = []
  const forbiddenRequests = []

  page.on('request', request => {
    const url = new URL(request.url())
    const path = url.pathname.toLowerCase()

    if (request.method() === 'POST' && url.origin === baseUrl && path === '/api/ai/analyst') {
      analystRequests.push(url.toString())
    }

    if (
      path.includes('/api/bets/tracked') ||
      path.includes('/rpc/create_tracked_bet') ||
      path.includes('/rpc/place_bet_from_decision') ||
      path.includes('/rpc/settle') ||
      path.includes('/rpc/record_deposit') ||
      path.includes('/rpc/record_withdrawal')
    ) {
      forbiddenRequests.push(`${request.method()} ${url.origin}${url.pathname}`)
    }
  })

  await page.goto('/login', { waitUntil: 'networkidle' })
  await page.getByLabel('Email', { exact: true }).fill(qaEmail)
  await page.getByLabel('Password', { exact: true }).fill(qaPassword)

  const passwordAuthResponsePromise = page.waitForResponse(
    response => {
      const url = new URL(response.url())
      return (
        response.request().method() === 'POST' &&
        url.pathname.endsWith('/auth/v1/token') &&
        url.searchParams.get('grant_type') === 'password'
      )
    },
    { timeout: 30_000 },
  )

  await page.getByRole('button', { name: 'Enter workspace', exact: true }).click()
  const passwordAuthResponse = await passwordAuthResponsePromise

  expect(
    passwordAuthResponse.status(),
    `Supabase password sign-in returned HTTP ${passwordAuthResponse.status()}`,
  ).toBe(200)

  await page.goto('/dashboard', { waitUntil: 'networkidle' })
  await expect(page).toHaveURL(`${baseUrl}/dashboard`)

  await page.goto('/ai', { waitUntil: 'networkidle' })
  await expect(page).toHaveURL(`${baseUrl}/ai`)

  const runMarker = process.env.GITHUB_RUN_ID || String(Date.now())
  const eventName = `QA SMOKE ${runMarker} — Germany vs Netherlands`

  await page.getByPlaceholder('Germany vs Netherlands').fill(eventName)
  await page.getByPlaceholder('Match Winner / Total / Handicap').fill('Match Winner')
  await page.getByPlaceholder('Germany / Over / -1').fill('Germany')
  await page.locator('input[type="number"][step="0.01"]').fill('1.85')
  await page.locator('select').selectOption('en')
  await page.getByPlaceholder('Injuries, lineups, motivation, recent form, anything relevant…').fill(
    'Automated production smoke. Schema and persistence verification only; never place a bet.',
  )

  const analystResponsePromise = page.waitForResponse(
    response =>
      response.request().method() === 'POST' &&
      response.url() === `${baseUrl}/api/ai/analyst`,
    { timeout: 120_000 },
  )

  await page.getByRole('button', { name: 'Analyze', exact: true }).click()
  const analystResponse = await analystResponsePromise

  expect(analystResponse.status()).toBe(200)
  await expect(page.getByRole('button', { name: 'Skip', exact: true })).toBeVisible({ timeout: 30_000 })
  expect(analystRequests).toHaveLength(1)
  expect(forbiddenRequests).toEqual([])

  await Promise.all([
    page.waitForURL(url => url.origin === baseUrl && /^\/decisions\/[0-9a-f-]+$/i.test(url.pathname), {
      timeout: 30_000,
    }),
    page.getByRole('button', { name: 'Skip', exact: true }).click(),
  ])

  await expect(page.getByRole('heading', { name: eventName, exact: true })).toBeVisible()
  expect(forbiddenRequests).toEqual([])
})
