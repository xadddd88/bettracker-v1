#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Module, { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const buildDir = path.join(repoRoot, 'build', 'provider-smoke')
const require = createRequire(import.meta.url)
const source = file => readFileSync(path.join(repoRoot, file), 'utf8')

const localeContract = require(path.join(buildDir, 'lib/i18n/ui-locale.js'))

assert.deepEqual([...localeContract.SUPPORTED_UI_LOCALES], ['en', 'uk', 'ru'])
assert.equal(localeContract.DEFAULT_UI_LOCALE, 'en')
assert.deepEqual([...localeContract.LEGACY_UI_LOCALES], ['auto', 'es', 'fr', 'de', 'ar'])
assert.deepEqual(
  localeContract.UI_LOCALE_OPTIONS.map(option => [option.value, option.label]),
  [
    ['en', 'English'],
    ['uk', 'Українська'],
    ['ru', 'Русский'],
  ],
)
assert.deepEqual(localeContract.UI_LOCALE_PROMPT_NAMES, {
  en: 'English',
  uk: 'Ukrainian',
  ru: 'Russian',
})

for (const locale of localeContract.SUPPORTED_UI_LOCALES) {
  assert.equal(localeContract.isUiLocale(locale), true, locale)
  assert.equal(localeContract.isLegacyUiLocale(locale), false, locale)
  assert.equal(localeContract.resolveStoredUiLocale(locale), locale, locale)
}

for (const locale of localeContract.LEGACY_UI_LOCALES) {
  assert.equal(localeContract.isUiLocale(locale), false, locale)
  assert.equal(localeContract.isLegacyUiLocale(locale), true, locale)
  assert.equal(localeContract.resolveStoredUiLocale(locale), 'en', locale)
}

for (const value of [null, undefined, '', 'uk-UA', 'pt', 1, {}]) {
  assert.equal(localeContract.resolveStoredUiLocale(value), 'en')
}

const analystPage = source('app/(app)/ai/page.tsx')
const scoutForm = source('app/(app)/scout/ScoutForm.tsx')
const analystRoute = source('app/api/ai/analyst/route.ts')
const scoutRoute = source('app/api/scout/route.ts')
const trustGate = source('lib/ai/analysis-quality-gate.ts')
const sharedTypes = source('types/index.ts')

for (const [name, client] of [
  ['Analyst page', analystPage],
  ['Scout form', scoutForm],
]) {
  assert.match(client, /UI_LOCALE_OPTIONS/, `${name} must use the shared options`)
  assert.match(client, /isUiLocale/, `${name} must validate select values`)
  assert.doesNotMatch(client, /type Locale\s*=/, `${name} retains a local locale union`)
  assert.doesNotMatch(client, /const LOCALES\s*=/, `${name} retains local locale options`)
}

for (const [name, route] of [
  ['Analyst route', analystRoute],
  ['Scout route', scoutRoute],
]) {
  assert.match(route, /z\.enum\(SUPPORTED_UI_LOCALES\)\.default\(DEFAULT_UI_LOCALE\)/, `${name} must use the shared write contract`)
  assert.match(route, /UI_LOCALE_PROMPT_NAMES\[outputLanguage\]/, `${name} must use an explicit supported prompt language`)
  assert.doesNotMatch(route, /const LOCALES\s*=/, `${name} retains a local locale schema`)
  assert.doesNotMatch(route, /outputLanguage\s*===\s*['"]auto['"]/, `${name} retains automatic-language behavior`)
}

assert.match(analystRoute, /p_output_language:\s+input\.output_language/)
assert.match(trustGate, /resolveStoredUiLocale\(locale\)/)
assert.match(sharedTypes, /output_language\?: UiLocale/)

async function assertScoutRejectsLegacyLocales() {
  const routePath = path.join(buildDir, 'app/api/scout/route.js')
  const requestAuthPath = path.join(buildDir, 'lib/supabase/request-auth.js')
  const adminPath = path.join(buildDir, 'lib/supabase/admin.js')
  const analyticsPath = path.join(buildDir, 'lib/analytics/server.js')
  const rateLimitPath = path.join(buildDir, 'lib/rate-limit.js')
  const originalResolveFilename = Module._resolveFilename
  const originalLoad = Module._load
  const previousApiKey = process.env.ANTHROPIC_API_KEY
  const calls = { profile: 0, provider: 0, admin: 0, analytics: 0, rateLimit: 0 }

  class FakeAnthropicError extends Error {
    constructor(message = 'fake', status = 500) {
      super(message)
      this.status = status
    }
  }

  class FakeAnthropic {
    static BadRequestError = FakeAnthropicError
    static RateLimitError = FakeAnthropicError
    static InternalServerError = FakeAnthropicError
    static APIConnectionTimeoutError = FakeAnthropicError
    static APIConnectionError = FakeAnthropicError
    static AuthenticationError = FakeAnthropicError
    static APIError = FakeAnthropicError

    constructor() {
      calls.provider += 1
    }
  }

  const userClient = {
    from() {
      calls.profile += 1
      const builder = {
        select() { return builder },
        eq() { return builder },
        async single() { return { data: { web_search_enabled: false }, error: null } },
      }
      return builder
    },
  }

  const clear = () => {
    for (const compiledPath of [routePath, requestAuthPath, adminPath, analyticsPath, rateLimitPath]) {
      try { delete require.cache[require.resolve(compiledPath)] } catch { /* not loaded */ }
    }
  }

  Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
    if (request.startsWith('@/')) {
      return originalResolveFilename.call(this, path.join(buildDir, request.slice(2)), parent, isMain, options)
    }
    return originalResolveFilename.call(this, request, parent, isMain, options)
  }
  Module._load = function loadWithAnthropicStub(request, parent, isMain) {
    if (request === '@anthropic-ai/sdk') return FakeAnthropic
    return originalLoad.call(this, request, parent, isMain)
  }

  clear()
  require.cache[requestAuthPath] = {
    id: requestAuthPath,
    filename: requestAuthPath,
    loaded: true,
    exports: {
      authenticateActiveMemberRequest: async () => ({
        authorized: true,
        supabase: userClient,
        user: { id: 'locale-contract-user' },
      }),
      activeMemberAuthErrorResponse: auth => Response.json(
        { error: 'Unauthorized' },
        { status: auth.status ?? 401 },
      ),
    },
  }
  require.cache[adminPath] = {
    id: adminPath,
    filename: adminPath,
    loaded: true,
    exports: {
      createAdminClient: () => {
        calls.admin += 1
        return { rpc: async () => ({ data: [], error: null }) }
      },
    },
  }
  require.cache[analyticsPath] = {
    id: analyticsPath,
    filename: analyticsPath,
    loaded: true,
    exports: {
      trackServerEvent: async () => { calls.analytics += 1 },
    },
  }
  require.cache[rateLimitPath] = {
    id: rateLimitPath,
    filename: rateLimitPath,
    loaded: true,
    exports: {
      RATE_LIMITS: { scout: () => [{ limit: 1, seconds: 60 }] },
      enforceRateLimit: async () => {
        calls.rateLimit += 1
        return { allowed: true, unavailable: false, retryAfter: 0 }
      },
    },
  }

  process.env.ANTHROPIC_API_KEY = 'locale-contract-test-key'
  try {
    const { POST } = require(routePath)
    for (const output_language of localeContract.LEGACY_UI_LOCALES) {
      const response = await POST(new Request('https://example.test/api/scout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sport: 'soccer',
          context: 'Synthetic locale contract probe',
          timeframe: 'today',
          output_language,
        }),
      }))
      const body = await response.json()

      assert.equal(response.status, 400, output_language)
      assert.equal(body.error, 'Invalid input', output_language)
      assert.ok(body.details?.fieldErrors?.output_language?.length > 0, output_language)
    }

    assert.deepEqual(calls, {
      profile: 0,
      provider: 0,
      admin: 0,
      analytics: 0,
      rateLimit: 0,
    })
  } finally {
    clear()
    Module._resolveFilename = originalResolveFilename
    Module._load = originalLoad
    if (previousApiKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = previousApiKey
  }
}

await assertScoutRejectsLegacyLocales()

const packageJson = JSON.parse(source('package.json'))
assert.match(packageJson.scripts['test:locale-contract'], /test-locale-contract\.mjs/)
assert.match(source('.github/workflows/preview-tests.yml'), /npm run test:locale-contract/)

console.log('R18 PR3A locale contract: en/uk/ru only, legacy read quarantine, and fail-closed API boundaries — PASS')
