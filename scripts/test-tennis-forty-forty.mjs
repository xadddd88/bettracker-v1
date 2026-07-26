#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const buildDir = path.join(root, 'build', 'provider-smoke')
const {
  analyzeFortyFortyFixtures,
  fetchLast24HoursFortyForty,
} = await import(path.join(buildDir, 'lib', 'tennis', 'forty-forty-analysis.js'))

let passed = 0
async function test(name, fn) {
  await fn()
  passed += 1
  console.log(`  ✅  ${name}`)
}

function regularGame(hit = false) {
  return {
    points: hit
      ? [
          { score: '15 - 0' },
          { score: '30 - 0' },
          { score: '40 - 0' },
          { score: '40 - 15' },
          { score: '40 - 30' },
          { score: '40 - 40' },
          { score: 'ADV - 40' },
        ]
      : [
          { score: '15 - 0' },
          { score: '30 - 0' },
          { score: '40 - 0' },
        ],
  }
}

function tiebreakGame() {
  return {
    points: [
      { score: '1 - 0' },
      { score: '1 - 1' },
      { score: '2 - 1' },
    ],
  }
}

function fixture({
  key,
  tour = 'Atp Singles',
  time = '10:00',
  qualification = 'False',
  status = 'Finished',
  scores = [{ score_first: '6', score_second: '0' }],
  pointbypoint = Array.from({ length: 6 }, () => regularGame()),
}) {
  return {
    event_key: key,
    event_date: '2026-07-26',
    event_time: time,
    event_first_player: `Player ${key} A`,
    event_second_player: `Player ${key} B`,
    event_status: status,
    event_type_type: tour,
    event_qualification: qualification,
    tournament_name: `Tournament ${key}`,
    scores,
    pointbypoint,
  }
}

console.log('\nTennis 40:40 last-24-hours gate')

await test('counts one 40:40 hit per regular game and excludes set tiebreaks', () => {
  const atpGames = Array.from({ length: 6 }, (_, index) => regularGame(index === 1))
  const wtaGames = [
    ...Array.from({ length: 12 }, (_, index) => regularGame(index < 3)),
    tiebreakGame(),
  ]
  const incompleteGames = Array.from({ length: 5 }, () => regularGame())

  const analysis = analyzeFortyFortyFixtures([
    fixture({ key: 'atp-complete', pointbypoint: atpGames }),
    fixture({ key: 'atp-incomplete', pointbypoint: incompleteGames }),
    fixture({
      key: 'wta-complete',
      tour: 'Wta Singles',
      scores: [{ score_first: '7', score_second: '6' }],
      pointbypoint: wtaGames,
    }),
  ], new Date('2026-07-26T12:00:00Z'))

  assert.equal(analysis.foundMatches, 3)
  assert.equal(analysis.analyzedMatches, 2)
  assert.equal(analysis.skippedMatches, 1)
  assert.deepEqual(
    {
      matches: analysis.men.matches,
      games: analysis.men.games,
      hits: analysis.men.hits,
      rate: analysis.men.gameRatePct,
    },
    { matches: 1, games: 6, hits: 1, rate: 16.67 },
  )
  assert.deepEqual(
    {
      matches: analysis.women.matches,
      games: analysis.women.games,
      hits: analysis.women.hits,
      rate: analysis.women.gameRatePct,
    },
    { matches: 1, games: 12, hits: 3, rate: 25 },
  )
  assert.equal(analysis.total.games, 18)
  assert.equal(analysis.total.hits, 4)
  assert.equal(analysis.comparison.leader, 'WTA')
  assert.equal(analysis.comparison.differencePercentagePoints, 8.33)
})

await test('uses a strict rolling window and only finished ATP/WTA singles main draws', () => {
  const eligible = fixture({ key: 'eligible', time: '11:59' })
  const analysis = analyzeFortyFortyFixtures([
    eligible,
    { ...fixture({ key: 'duplicate', time: '11:59' }), ...eligible },
    fixture({ key: 'qualifying', qualification: 'True' }),
    fixture({ key: 'challenger', tour: 'Challenger Men Singles' }),
    fixture({ key: 'doubles', tour: 'Atp Doubles' }),
    fixture({ key: 'unfinished', status: 'Set 2' }),
    { ...fixture({ key: 'too-old' }), event_date: '2026-07-25', event_time: '11:59' },
    fixture({ key: 'future', time: '12:01' }),
  ], new Date('2026-07-26T12:00:00Z'))

  assert.equal(analysis.foundMatches, 1)
  assert.equal(analysis.analyzedMatches, 1)
  assert.equal(analysis.matches[0].players, 'Player eligible A — Player eligible B')
  assert.deepEqual(analysis.scope.excludes, [
    'qualification',
    'doubles',
    'challenger',
    'ITF',
    'exhibition',
    'tiebreaks',
  ])
})

await test('returns insufficient comparison instead of inventing a women or men percentage', () => {
  const analysis = analyzeFortyFortyFixtures(
    [fixture({ key: 'atp-only' })],
    new Date('2026-07-26T12:00:00Z'),
  )

  assert.equal(analysis.men.gameRatePct, 0)
  assert.equal(analysis.women.gameRatePct, null)
  assert.equal(analysis.comparison.leader, 'insufficient_data')
  assert.equal(analysis.comparison.differencePercentagePoints, null)
})

await test('provider requests are server-only, tour-filtered, UTC and cover both window dates', async () => {
  process.env.API_FOOTBALL_KEY = 'dummy-football'
  process.env.SPORTMONKS_TOKEN = 'dummy-sportmonks'
  process.env.API_TENNIS_KEY = 'dummy-tennis'

  const calls = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async input => {
    const url = new URL(String(input))
    calls.push(url)
    return new Response(JSON.stringify({ success: 1, result: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const analysis = await fetchLast24HoursFortyForty(new Date('2026-07-26T12:00:00Z'))
    assert.equal(analysis.analyzedMatches, 0)
  } finally {
    globalThis.fetch = originalFetch
  }

  assert.equal(calls.length, 2)
  assert.deepEqual(
    calls.map(url => url.searchParams.get('event_type_key')).sort(),
    ['265', '266'],
  )
  for (const url of calls) {
    assert.equal(url.searchParams.get('method'), 'get_fixtures')
    assert.equal(url.searchParams.get('date_start'), '2026-07-25')
    assert.equal(url.searchParams.get('date_stop'), '2026-07-26')
    assert.equal(url.searchParams.get('timezone'), 'UTC')
    assert.equal(url.searchParams.get('APIkey'), 'dummy-tennis')
  }
})

await test('route repeats owner auth, durable rate limit and never exposes the provider key', () => {
  const route = readFileSync(
    path.join(root, 'app/api/tennis/forty-forty/last-24-hours/route.ts'),
    'utf8',
  )
  const client = readFileSync(
    path.join(root, 'app/(app)/tennis-calculator/Last24HoursAnalysis.tsx'),
    'utf8',
  )

  assert.ok(route.includes('checkTennisCalcAccess(null)'))
  assert.ok(route.includes('authenticateRequest(req)'))
  assert.ok(route.includes('checkTennisCalcAccess(auth.user.id)'))
  assert.ok(route.includes('RATE_LIMITS.tennisFortyFortyAnalysis()'))
  assert.ok(route.includes("'Cache-Control': 'private, no-store, max-age=0'"))
  assert.ok(route.indexOf('authenticateRequest(req)') < route.indexOf('fetchLast24HoursFortyForty()'))
  assert.ok(client.includes('Анализ за последние 24 часа'))
  assert.ok(client.includes('ATP Singles и WTA Singles'))
  assert.ok(client.includes('Всего срабатываний 40:40'))
  assert.ok(client.includes('Статистика') || client.includes('не гарантия'))
  assert.ok(!client.includes('API_TENNIS_KEY'))
  assert.ok(!client.includes('APIkey'))
})

console.log(`\n${passed} tests — ${passed} passed, 0 failed\n`)
