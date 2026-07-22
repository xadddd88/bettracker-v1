import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const source = (file) => readFileSync(path.join(root, file), 'utf8')

const webList = source('app/(app)/bets/page.tsx')
const webDetail = source('app/(app)/bets/[id]/page.tsx')
const webEditor = source('app/(app)/bets/new/page.tsx')
const quickSettle = source('components/bets/QuickSettle.tsx')
const settleActions = source('app/(app)/bets/[id]/SettleActions.tsx')
const mobileList = source('apps/mobile/src/app/(app)/bets/index.tsx')
const mobileDetail = source('apps/mobile/src/app/(app)/bets/[id].tsx')
const mobileEditor = source('apps/mobile/src/app/(app)/bets/new.tsx')
const mobileStatus = source('apps/mobile/src/bets/presentation.ts')
const saveClient = source('apps/mobile/src/bets/save.ts')
const submitIntent = source('apps/mobile/src/bets/submit-intent.ts')

for (const [name, file] of [
  ['Web list', webList],
  ['Web detail', webDetail],
  ['Web editor', webEditor],
  ['Web quick settlement', quickSettle],
  ['Web settlement detail', settleActions],
  ['Mobile list', mobileList],
  ['Mobile detail', mobileDetail],
  ['Mobile editor', mobileEditor],
]) {
  assert.match(file, /Broadcast(?:Button|DataValue|Panel|Status)/, `${name} must use Broadcast Noir primitives`)
  assert.doesNotMatch(file, /(?:TimeWarpBackdrop|EditorialBackdrop|WarpRail|#E8FF00|#e8ff00|text-(?:green|red|yellow|purple|blue)-|bg-(?:green|red|yellow|purple|blue)-)/, `${name} retains a legacy theme/status surface`)
}

assert.match(webList, /legs\.map\(\(leg, index\)/, 'Web Tracker must render every ordered leg')
assert.match(webDetail, /legs\.map\(\(leg, index\)/, 'Web detail must render every ordered leg')
assert.match(webEditor, /Save Bet/)
assert.match(webEditor, /idempotency_key: begin\.key/)
assert.match(mobileList, /BetTicket/, 'Mobile Tracker must use the ordered-leg ticket')
assert.match(mobileDetail, /coupon\.legs\.map\(\(leg, index\)/, 'Mobile detail must render every ordered leg')
assert.doesNotMatch(mobileStatus, /#[0-9A-Fa-f]{3,8}|\bcolor\b/, 'Mobile statuses must use semantic tones, not raw colors')
assert.doesNotMatch(`${webList}\n${webDetail}`, /line-clamp/, 'Tracker cannot hide long saved leg content')

assert.match(mobileEditor, /Review bet/)
assert.match(mobileEditor, /Save bet/)
assert.match(mobileEditor, /saveTrackedBet\(reviewedPayload, begin\.key\)/)
assert.match(mobileEditor, /router\.replace\(\{ pathname: '\/\(app\)\/bets\/\[id\]'/)
assert.doesNotMatch(mobileEditor, /\bfetch\s*\(|\bsupabase\b|\.rpc\s*\(|service[_-]?role/i)

assert.match(saveClient, /path: '\/api\/bets\/tracked'/)
assert.match(saveClient, /operation: 'tracked_bet'/)
assert.match(saveClient, /idempotency_key: idempotencyKey/)
assert.doesNotMatch(saveClient, /\.rpc\s*\(|service[_-]?role/i)
assert.match(submitIntent, /status: 'in_flight'/)
assert.match(submitIntent, /conflict_unchanged/)
assert.match(submitIntent, /intent\.key !== null/)

console.log('Broadcast Noir Tracker gate: PASS')
