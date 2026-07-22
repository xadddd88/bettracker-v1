#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = file => readFileSync(path.join(repoRoot, file), 'utf8')

const webList = read('app/(app)/bets/page.tsx')
const webDetail = read('app/(app)/bets/[id]/page.tsx')
const webEditor = read('app/(app)/bets/new/page.tsx')
const quickSettle = read('components/bets/QuickSettle.tsx')
const settleActions = read('app/(app)/bets/[id]/SettleActions.tsx')

for (const source of [webList, webDetail, webEditor, quickSettle, settleActions]) {
  assert.doesNotMatch(source, /border-black|bg-white|rounded-full|text-\[(?:[0-9]|10)px\]/)
}
assert.match(webList, /legs\.map\(\(item, legIndex\)/)
assert.match(webList, /isSupportedSettlementStatus\(bet\.status\)/)
assert.match(webList, /bankroll\?\.currency/)
assert.match(webDetail, /!isParlay && leg\?\.market_type/)
assert.match(webDetail, /!isParlay && leg\?\.selection/)
assert.match(webDetail, /bet\.legs!\.map\(\(l, i\)/)
assert.match(webEditor, /fetch\('\/api\/bets\/tracked'/)
assert.match(webEditor, /idempotency_key:\s*begin\.key/)
assert.match(quickSettle, /\/settle`/)
assert.match(settleActions, /\/cancel`/)

const mobileList = read('apps/mobile/src/app/(app)/bets/index.tsx')
const mobileDetail = read('apps/mobile/src/app/(app)/bets/[id].tsx')
const mobileEditor = read('apps/mobile/src/app/(app)/bets/new.tsx')
const mobileLayout = read('apps/mobile/src/app/(app)/bets/_layout.tsx')
const mobileTicket = read('apps/mobile/src/ui/bet-ticket.tsx')

for (const source of [mobileList, mobileDetail, mobileEditor, mobileLayout, mobileTicket]) {
  assert.doesNotMatch(source, /EditorialBackdrop|EditorialRule|TimeWarpBackdrop|WarpRail|#E8FF00/)
  assert.doesNotMatch(source, /#050505|#FFFFFF/)
  const fontSizes = [...source.matchAll(/fontSize:\s*(\d+)/g)].map(match => Number(match[1]))
  assert.equal(fontSizes.every(size => size >= 11), true, 'mobile Tracker contains functional text below 11 px')
}
assert.match(mobileLayout, /semanticColors\.night/)
assert.match(mobileLayout, /semanticColors\.textPrimary/)
assert.match(mobileTicket, /coupon\.legs\.map/)
assert.match(mobileTicket, /semanticColors\.dataValue/)
assert.match(mobileTicket, /betFinancialSummary\(bet, currency\)/)
assert.match(mobileDetail, /couponPresentation\(bet\)/)
assert.match(mobileDetail, /betFinancialSummary\(bet, currency\)/)
assert.match(mobileList, /fetchCurrency\(userId\)/)
assert.doesNotMatch(mobileEditor, /fetch\(|supabase|create_tracked_bet/)

console.log('Broadcast Noir PR E: ordered Tracker, financial display and mobile readability gates passed')
