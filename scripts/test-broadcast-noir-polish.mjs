#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = file => readFileSync(path.join(repoRoot, file), 'utf8')

const webSurfaces = [
  'app/(auth)/login/page.tsx',
  'app/auth/set-password/page.tsx',
  'app/global-error.tsx',
  'app/(app)/ai/page.tsx',
  'app/(app)/bets/new/page.tsx',
  'components/feedback/FeedbackWidget.tsx',
  'components/risk/RiskEvaluator.tsx',
  'components/ui/AppHeader.tsx',
  'components/ui/BetaNote.tsx',
  'components/ui/MobileNav.tsx',
].map(read)

const legacyPalette = /(?:text|bg|border)-(?:green|red|yellow|amber|orange|blue|purple|indigo|gray|slate|night)-[0-9]+|text-white|bg-white|border-black|#(?:050505|e8ff00|f5f5f0)/i
const microText = /text-\[(?:[0-9]|10)px\]/

for (const source of webSurfaces) {
  assert.doesNotMatch(source, legacyPalette)
  assert.doesNotMatch(source, microText)
}

const feedback = read('components/feedback/FeedbackWidget.tsx')
assert.match(feedback, /role="dialog"/)
assert.match(feedback, /aria-modal="true"/)
assert.match(feedback, /aria-labelledby=/)
assert.match(feedback, /Escape/)
assert.match(feedback, /querySelectorAll<HTMLElement>/)

const globalError = read('app/global-error.tsx')
assert.match(globalError, /Sentry\.captureException\(error\)/)
assert.match(globalError, /reset:\s*\(\)\s*=>\s*void/)
assert.match(globalError, /onClick=\{reset\}/)
assert.match(globalError, /aria-labelledby="global-error-title"/)
assert.match(globalError, /var\(--negative\)/)
assert.doesNotMatch(globalError, /saved data has not been changed/i)

const risk = read('components/risk/RiskEvaluator.tsx')
assert.match(risk, /BroadcastStatus/)
assert.match(risk, /stake_percent_of_bankroll\.toFixed\(1\)/)
assert.match(risk, /pending_exposure_percent\.toFixed\(1\)/)
assert.match(risk, /recommended_max_stake/)
assert.match(risk, /fetch\('\/api\/risk\/evaluate'/)

const mobileSurfaces = [
  'apps/mobile/src/app/sign-in.tsx',
  'apps/mobile/src/app/(app)/_layout.tsx',
  'apps/mobile/src/ui/motion.tsx',
  'apps/mobile/src/ui/product-shell.tsx',
].map(read)

for (const source of mobileSurfaces) {
  const fontSizes = [...source.matchAll(/fontSize:\s*(\d+)/g)].map(match => Number(match[1]))
  assert.equal(fontSizes.every(size => size >= 11), true, 'mobile surface contains functional text below 11 px')
  assert.doesNotMatch(source, /#(?:050505|FFFFFF|E8FF00)|withRepeat\(/)
}

const mobileSignIn = read('apps/mobile/src/app/sign-in.tsx')
assert.match(mobileSignIn, /SafeAreaView/)
assert.match(mobileSignIn, /semanticColors\.signal/)
assert.match(mobileSignIn, /Platform\.OS === 'android' \? 48 : 44/)

const mobileTabs = read('apps/mobile/src/app/(app)/_layout.tsx')
assert.match(mobileTabs, /fontSize:\s*11/)
assert.match(mobileTabs, /Platform\.OS === 'android' \? 48 : 44/)

const globals = read('app/globals.css')
assert.match(globals, /prefers-reduced-motion:\s*reduce/)
assert.doesNotMatch(globals, /animation-iteration-count:\s*infinite/)

console.log('Broadcast Noir PR G: route inventory, accessibility, motion and final polish gates passed')
