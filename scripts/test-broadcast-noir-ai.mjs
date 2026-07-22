#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = file => readFileSync(path.join(repoRoot, file), 'utf8')

const web = read('app/(app)/ai/page.tsx')
assert.match(web, /type CaptureMode = 'coupon' \| 'event'/)
assert.match(web, /capturePreview/)
assert.match(web, />Replace</)
assert.match(web, />Remove</)
assert.match(web, /signal-sweep-active/)
assert.match(web, /scanning \|\| analyzing/)
assert.match(web, /JSON\.stringify\(\{ image: data, media_type \}\)/)
assert.match(web, /fetch\('\/api\/ai\/analyst'/)
assert.doesNotMatch(web, /EventPulse|EditorialBackdrop|KineticType|editorial-ticker/)
assert.doesNotMatch(web, /text-\[(?:[0-9]|10)px\]/)

const globalStyles = read('app/globals.css')
assert.match(globalStyles, /\.signal-sweep-active\s*\{[^}]*animation:\s*signal-sweep/s)

const mobile = read('apps/mobile/src/app/(app)/ai/index.tsx')
for (const required of [
  'Coupon',
  'Event',
  'Replace',
  'Remove',
  'Analyze',
  'semanticColors.signal',
  'signalSweep',
]) {
  assert.match(mobile, new RegExp(required), `mobile AI is missing ${required}`)
}
assert.match(mobile, /busy \? <Animated\.View[^>]+styles\.signalSweep/)
assert.doesNotMatch(mobile, /EditorialBackdrop|KineticType|EditorialRule/)
const mobileFontSizes = [...mobile.matchAll(/fontSize:\s*(\d+)/g)].map(match => Number(match[1]))
assert.equal(mobileFontSizes.every(size => size >= 11), true, 'mobile AI contains functional text below 11 px')

const scannerDraft = read('apps/mobile/src/ai/scanner-draft.ts')
assert.match(scannerDraft, /scannerAnalysisToTrackerDraft/)
assert.match(scannerDraft, /MAX_DRAFT_LEGS/)
assert.match(scannerDraft, /stageScannerDraft/)
assert.match(scannerDraft, /consumeScannerDraft/)
assert.doesNotMatch(scannerDraft, /fetch\(|supabase|create_tracked_bet/)

const mobileNewBet = read('apps/mobile/src/app/(app)/bets/new.tsx')
assert.match(mobileNewBet, /consumeScannerDraft/)
assert.match(mobile, /stageScannerDraft/)
assert.match(mobile, /router\.push\('\/(?:\(app\)\/)?bets\/new'\)/)

const mobileScanner = read('apps/mobile/src/ai/scanner-client.ts')
assert.match(mobileScanner, /scannerRequestBody/)
assert.match(mobileScanner, /authenticatedJsonRequest/)
assert.match(mobileScanner, /path: '\/api\/ai\/scanner'/)

const mobileScannerModel = read('apps/mobile/src/ai/scanner-model.ts')
assert.match(mobileScannerModel, /MAX_SCANNER_REQUEST_BYTES = 4_400_000/)
const mobileApiClient = read('apps/mobile/src/lib/api-client.ts')
assert.match(mobileApiClient, /status === 401/)

console.log('Broadcast Noir PR D: capture modes, trust states, operation motion and API boundaries passed')
