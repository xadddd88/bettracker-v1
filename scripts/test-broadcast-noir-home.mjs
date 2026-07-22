#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = file => readFileSync(path.join(repoRoot, file), 'utf8')

const webHome = read('app/(app)/dashboard/page.tsx')
const webAction = read('components/dashboard/NextBestAction.tsx')
const mobileHome = read('apps/mobile/src/app/(app)/home.tsx')
const mobileSummary = read('apps/mobile/src/bets/summary.ts')
const mobileTicket = read('apps/mobile/src/ui/bet-ticket.tsx')

for (const [name, source] of [['Web Home', webHome], ['native Home', mobileHome]]) {
  assert.doesNotMatch(source, /EventPulse|primaryEvent|LIVE DATA|LIVE PORTFOLIO|editorial-ticker/i, `${name} must not claim live/event state`)
  assert.doesNotMatch(source, /watchlist|scout for new value|model_probability|edge_percent/i, `${name} must not invent an Adaptive Action`)
  assert.match(source, /Scan coupon/i, `${name} must expose the safe empty-account action`)
  assert.match(source, /(?:review_pending|Review pending bets)/i, `${name} must expose the persisted pending-state action`)
}

assert.match(webHome, /calcSettlementMetrics\(bets\)/)
assert.match(webHome, /ordered legs/)
assert.match(webHome, /BroadcastStatus/)
assert.match(webAction, /bg-bn-signal[^"\n]*text-bn-on-signal/)

assert.match(mobileHome, /semanticColors\.signal/)
assert.match(mobileHome, /ReduceMotion\.System/)
assert.match(mobileSummary, /bet\.status === 'won' \|\| bet\.status === 'lost' \|\| bet\.status === 'void'/)
assert.match(mobileSummary, /bet\.pnl \?\? 0/)
assert.match(mobileTicket, /coupon\.legs\.map/)
assert.match(mobileTicket, /leg\.odds === null \? '—'/)
assert.match(mobileTicket, /BroadcastStatus/)

console.log('Broadcast Noir PR C: Adaptive Action, trusted metrics and ordered recent legs gates passed')
