#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relativePath => readFileSync(path.join(repoRoot, relativePath), 'utf8')

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`  ✅  ${name}`)
    passed += 1
  } catch (error) {
    console.error(`  ❌  ${name}`)
    console.error(`      ${error.message}`)
    failed += 1
  }
}

const runtime = read('lib/market/runtime-presentation.ts')
const component = read('components/market/MarketAccessCard.tsx')
const dashboard = read('app/(app)/dashboard/page.tsx')
const settings = read('app/(app)/settings/page.tsx')
const settingsForm = read('app/(app)/settings/SettingsForm.tsx')
const middleware = read('middleware.ts')
const webAcceptance = read('scripts/test-web-acceptance.mjs')

test('runtime presentation is server-only and cannot grant access', () => {
  assert.match(runtime, /^import 'server-only'/)
  assert.match(runtime, /isGbEwScMarketProfileEnabled\(\)/)
  assert.match(runtime, /status: 'blocked'/)
  assert.match(runtime, /\? 'policy_state_unavailable'\s*: 'market_not_enabled'/)
  assert.doesNotMatch(runtime, /status:\s*'eligible'/)
  assert.doesNotMatch(runtime, /evaluateMarketEligibility/)
  assert.doesNotMatch(runtime, /fetch\(|createClient|supabase|localStorage|sessionStorage/)
})

test('Home and Settings consume one server-produced presentation boundary', () => {
  for (const [name, source] of [['Home', dashboard], ['Settings', settings]]) {
    assert.match(source, /resolveCurrentMarketAccessPresentation\('ru'\)/, `${name} must resolve the server status`)
    assert.match(source, /<MarketAccessCard model=\{marketAccess\}/, `${name} must render the shared card`)
    assert.doesNotMatch(source, /market\/server-policy/, `${name} must not import the policy evaluator directly`)
  }
  assert.match(dashboard, /surface="home"/)
  assert.match(settings, /surface="settings"/)
})

test('Settings owns the status and Home exposes only a safe deeplink', () => {
  assert.match(component, /id=\{isSettings \? 'market-access' : undefined\}/)
  assert.match(component, /href="\/settings#market-access"/)
  assert.match(component, />\s*Посмотреть текущий статус\s*</)
  assert.doesNotMatch(component, /model\.primaryAction/)
  assert.match(component, /Сейчас этот экран ничего не собирает и не меняет/)
  assert.match(component, /Язык, валюта и часовой пояс[\s\S]*не открывают доступ/)
  assert.doesNotMatch(component, /^['"]use client['"]/)
  assert.doesNotMatch(component, /<input|<select|<textarea|<form|fetch\(|navigator\.|localStorage|sessionStorage/)
})

test('Package C does not add a market route gate or client activation flag', () => {
  const middlewareWithoutPreview = middleware.replace(/^.*design-preview\/market-access.*$/m, '')
  assert.doesNotMatch(middlewareWithoutPreview, /market[-_/ ]?(access|eligibility|profile)/i)
  assert.doesNotMatch(middleware, /server-policy|resolveCurrentMarketAccessPresentation|MARKET_PROFILE_GB_EW_SC_ENABLED/)
  assert.doesNotMatch(component + dashboard + settings, /NEXT_PUBLIC_MARKET_PROFILE|MARKET_PROFILE_GB_EW_SC_ENABLED/)
  assert.doesNotMatch(component + runtime, /redirect\(|notFound\(/)
})

test('Settings controls retain explicit accessible labels', () => {
  for (const id of [
    'settings-display-name',
    'settings-default-stake',
    'settings-kelly-fraction',
    'settings-email',
    'settings-timezone',
  ]) {
    assert.match(settingsForm, new RegExp(`htmlFor="${id}"`), `${id} label missing`)
    assert.match(settingsForm, new RegExp(`id="${id}"`), `${id} control id missing`)
  }
})

test('Hermetic Web acceptance covers both surfaces across the standard viewports', () => {
  assert.match(webAcceptance, /route === '\/settings' \|\| route === '\/dashboard'/)
  assert.match(webAcceptance, /data-market-access-status/)
  assert.match(webAcceptance, /market_not_enabled/)
  assert.match(webAcceptance, /input, select, textarea, button/)
  assert.match(webAcceptance, /\/settings#market-access/)
})

console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
