#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = file => readFileSync(path.join(repoRoot, file), 'utf8')
const web = read('app/(app)/ai/page.tsx')
const mobile = read('apps/mobile/src/app/(app)/ai/index.tsx')

for (const [name, source] of [['Web Scanner', web], ['native Scanner', mobile]]) {
  assert.match(source, /Coupon/i, `${name} must expose Coupon mode`)
  assert.match(source, /Event/i, `${name} must expose Event mode`)
  assert.match(source, /Replace/i, `${name} must expose Replace`)
  assert.match(source, /Remove/i, `${name} must expose Remove`)
  assert.match(source, /Analyze/i, `${name} must expose Analyze`)
  assert.match(source, /offline|Network error|connection/i, `${name} must expose connection failure`)
  assert.match(source, /review/i, `${name} must require review`)
  assert.doesNotMatch(source, /#e8ff00|#E8FF00|EditorialBackdrop|KineticType|withRepeat/, `${name} retains a legacy or infinite presentation layer`)
}

assert.match(web, /bg-bn-signal text-bn-on-signal/)
assert.match(web, /bn-operation-sweep/)
assert.match(web, /Analyze never saves a bet automatically/)
assert.match(web, /body:\s*JSON\.stringify\(\{ image: data, media_type \}\)/)
assert.doesNotMatch(web, /create_tracked_bet_v2|migration 025/)

assert.match(mobile, /semanticColors\.signal/)
assert.match(mobile, /semanticColors\.onSignal/)
assert.match(mobile, /BroadcastStatus label="Needs review" status="review"/)
assert.match(mobile, /NO FINANCIAL RECORD IS SAVED AUTOMATICALLY/)
assert.match(mobile, /withTiming\(1, \{ duration: reduceMotion \? 0 : 320 \}\)/)

console.log('Broadcast Noir PR D: capture, scanner states, semantic status and no-auto-save gates passed')
