#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = file => readFileSync(path.join(root, file), 'utf8')

const page = read('app/(app)/tennis-calculator/page.tsx')
const calculator = read('app/(app)/tennis-calculator/SeriesCalculator.tsx')
const layout = read('app/(app)/layout.tsx')
const header = read('components/ui/AppHeader.tsx')
const mobileNav = read('components/ui/MobileNav.tsx')

let passed = 0
function test(name, fn) {
  fn()
  passed += 1
  console.log(`  ✅  ${name}`)
}

console.log('\nTennis PR-5 mobile UI gate')

test('route repeats authentication, owner and default-OFF flag checks server-side', () => {
  assert.ok(page.includes('await supabase.auth.getUser()'))
  assert.ok(page.includes('checkTennisCalcAccess(user.id)'))
  assert.ok(page.includes('notFound()'))
  assert.ok(!page.includes('createAdminClient'))
  assert.ok(!calculator.includes('OWNER_USER_ID'))
  assert.ok(!calculator.includes('TENNIS_CALC_ENABLED'))
})

test('authenticated RLS read restores open series and ordered steps on refresh', () => {
  assert.ok(page.includes(".from('tennis_series')"))
  assert.ok(page.includes(".in('status', ['draft', 'active'])"))
  assert.ok(page.includes(".from('tennis_series_steps')"))
  assert.ok(page.includes(".order('step_number', { ascending: true })"))
  assert.ok(page.includes('initialSeries={snapshot}'))
})

test('all database financial numerics cross the RSC boundary as decimal text', () => {
  for (const field of [
    'target_profit',
    'initial_stake',
    'stake_increment',
    'bankroll_limit',
    'maximum_stake',
    'exposure_limit',
    'quoted_odds',
    'recommended_stake',
    'accepted_odds',
    'accepted_stake',
    'actual_return',
    'loss_before',
    'target_profit_snapshot',
    'projected_series_result',
  ]) {
    assert.ok(page.includes(`${field}:${field}::text`), `${field} is not selected as text`)
  }
})

test('page explains the 40:40 series and labels the historical sample precisely', () => {
  for (const copy of [
    'Серия на 40:40',
    'будет ли в выбранном гейме счёт 40:40 — да',
    'Как работает серия',
    'Ставка на один гейм',
    'Откуда берётся прибыль',
    'Мужские матчи · ATP',
    'Женские матчи · WTA',
    '22,65%',
    '32,07%',
    'До 15-го гейма',
    'Статистика, а не гарантия',
  ]) {
    assert.ok(page.includes(copy), `missing 40:40 guide copy: ${copy}`)
  }

  assert.match(page, /men:\s*\{[\s\S]*?games: 234,[\s\S]*?hits: 53,/)
  assert.match(page, /women:\s*\{[\s\S]*?games: 290,[\s\S]*?hits: 93,/)
  assert.ok(page.includes('завершённые одиночные ATP/WTA-матчи'))
  assert.ok(page.includes('тай-брейки не считались обычными геймами'))
  assert.ok(page.includes('не делает исход более вероятным'))
})

test('client preview uses the exact BigInt core and never float money math', () => {
  assert.ok(calculator.includes('requiredStakeMinor('))
  assert.ok(calculator.includes('actualProfitMinor('))
  assert.ok(calculator.includes('checkOpenBetLimits('))
  assert.ok(calculator.includes('fixedOddsPlan('))
  assert.ok(calculator.includes('fixedOddsPlanForBankroll('))
  assert.doesNotMatch(calculator, /parseFloat|Math\.round|Math\.ceil/)
})

test('five-field setup has two explicit calculation modes and no legacy technical inputs', () => {
  for (const copy of [
    'Название матча · необязательно',
    'Коэффициент для расчёта',
    'Количество геймов',
    'Начальная ставка',
    'Максимальный банк',
    'Выберите, что вводите вручную',
    'Ввожу начальную ставку',
    'Ввожу максимальный банк',
  ]) {
    assert.ok(calculator.includes(copy), `${copy} is missing`)
  }
  for (const removedCopy of [
    'Target series profit',
    'Total exposure limit',
    'Per-step maximum',
    'Stake increment',
    'Currency or unit',
  ]) {
    assert.ok(!calculator.includes(removedCopy), `${removedCopy} must stay hidden`)
  }
  assert.ok(calculator.includes("stake_increment: '0.01'"))
  assert.ok(calculator.includes("currency_or_unit: 'USD'"))
  assert.ok(calculator.includes('exposure_limit: formatMoneyMinor(preview.configuredBankMinor)'))
  assert.ok(calculator.includes('maximum_stake: null'))
  assert.ok(calculator.includes("tabIndex={create.calculationMode === 'maximum_bank' ? -1 : 0}"))
  assert.ok(calculator.includes("tabIndex={create.calculationMode === 'initial_stake' ? -1 : 0}"))
})

test('setup preview itemizes every game, cumulative spend and net profit on a win', () => {
  for (const copy of [
    'Расчёт по каждому гейму',
    'Гейм',
    'Ставка',
    'Накопительно поставлено',
    'Прибыль при победе',
    'все предыдущие проигранные ставки и ставку текущего гейма',
    'чистый результат всей серии',
  ]) {
    assert.ok(calculator.includes(copy), `${copy} is missing from the game table`)
  }
  assert.ok(calculator.includes('createPreview.plan.stakesMinor.map'))
  assert.ok(calculator.includes('checkedAdd(accumulatedBeforeMinor, stakeMinor)'))
  assert.ok(calculator.includes('actualProfitMinor(stakeMinor, odds, accumulatedBeforeMinor)'))
  assert.ok(calculator.includes('signedMoney(row.profitOnWinMinor)'))
})

test('fixed coefficient survives refresh and drives every server-authoritative step', () => {
  assert.ok(calculator.includes("const FIXED_ODDS_FORMULA = 'v2-fixed-odds:'"))
  assert.ok(calculator.includes('fixedOddsFromFormula(initialSeries?.formula_version)'))
  assert.ok(calculator.includes('series.steps.length === 0 && series.initial_stake'))
  assert.ok(calculator.includes(': requiredStakeMinor('))
  assert.ok(calculator.includes('accepted_odds: quotedOdds'))
  assert.ok(calculator.includes('accepted_stake: recommendation'))
  assert.ok(!calculator.includes('Use recommendation'))
})

test('commands are double-tap guarded and retries keep payload-bound operation ids', () => {
  assert.ok(calculator.includes('if (inFlight.current) return'))
  assert.ok(calculator.includes('cache[key]?.payload !== serialized'))
  assert.ok(calculator.includes('crypto.randomUUID()'))
  assert.ok(calculator.includes('Retry will reuse the same operation id.'))
})

test('manual workflow exposes create, confirm, Win/Loss/Void, stop and journal states', () => {
  for (const copy of [
    'Начать серию',
    'Подтвердить ставку',
    'Сохранить результат',
    'Остановить серию',
    'История серии',
    'Лимит ·',
  ]) {
    assert.ok(calculator.includes(copy), `${copy} is missing`)
  }
  for (const result of ["'won'", "'lost'", "'void'"]) {
    assert.ok(calculator.includes(result), `${result} settlement is missing`)
  }
  assert.ok(calculator.includes('После остановки продолжить эту серию будет нельзя.'))
  assert.ok(calculator.includes('Остановить'))
})

test('mobile interaction and risk copy stay accessible and outcome-neutral', () => {
  assert.ok(calculator.includes('inputMode="decimal"'))
  assert.ok(calculator.includes('min-h-12'))
  assert.ok(calculator.includes('role="alert"'))
  assert.ok(calculator.includes('aria-live="assertive"'))
  assert.ok(calculator.includes('не повышает вероятность выигрыша'))
  assert.doesNotMatch(calculator, /guaranteed profit|guarantees? profit|risk[- ]free/i)
  assert.doesNotMatch(calculator, /bookmaker login|scrap(?:e|ing)|auto[- ]bet/i)
})

test('navigation is derived on the server and receives only an allowed boolean', () => {
  assert.ok(layout.includes('checkTennisCalcAccess(user.id).allowed'))
  assert.ok(layout.includes('tennisCalcEnabled={tennisCalcEnabled}'))
  assert.ok(header.includes("href: '/tennis-calculator'"))
  assert.ok(mobileNav.includes("href: '/tennis-calculator'"))
  assert.ok(header.includes('tennisCalcEnabled: boolean'))
  assert.ok(mobileNav.includes('tennisCalcEnabled: boolean'))
})

console.log(`\n${passed} tests — ${passed} passed, 0 failed\n`)
