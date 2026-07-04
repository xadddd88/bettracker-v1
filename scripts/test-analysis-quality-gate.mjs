#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const repoRoot = path.resolve(__dirname, '..');
const buildDir = path.join(repoRoot, 'build', 'provider-smoke');

const {
  evaluateAnalysisQuality,
  applyQualityGateToPricing,
  buildAnalystPricingPayload,
  buildAnalystTrustPayload,
  buildAnalystTrustView,
  renderAnalystTrustSummaryText,
  shouldShowPricingStats,
  renderPricingSummaryLine,
  renderQualityGateSummaryText,
} = require(path.join(buildDir, 'lib/ai/analysis-quality-gate.js'));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  fail ${name}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

function assertMissing(result, needle) {
  const allMissing = result.missingDataByLeg.flatMap(leg => leg.missing);
  assert.ok(
    allMissing.some(item => item.toLowerCase().includes(needle.toLowerCase())),
    `expected missing checklist to include ${needle}; got ${JSON.stringify(allMissing)}`
  );
}

function assertNoForbiddenPricingText(text) {
  const forbidden = [
    'Model probability',
    'Implied probability',
    'Edge',
    'EV',
    'expected value',
    'negative edge',
    'real probability',
    'model probability',
    '28.0%',
    '45.5%',
    '45.45%',
    '-17.4%',
    '21.6%',
    '25-30%',
    'реальна ймовірність',
    'імплікована ймовірність',
    'негативний край',
    'очікуване значення',
  ];
  for (const needle of forbidden) {
    assert.ok(!text.includes(needle), `expected blocked-mode text not to include ${needle}; got:\n${text}`);
  }
}

console.log('\nAnalysis Quality Gate checks\n');

test('blocks model probability and edge when live data and model inputs are missing', () => {
  const result = evaluateAnalysisQuality({
    sport: 'soccer',
    eventName: 'Germany vs Netherlands',
    marketType: 'Match Winner',
    selection: 'Germany',
    webSearchEnabled: false,
    modelProbability: 54,
  });

  assert.equal(result.status, 'insufficient_data');
  assert.equal(result.label, 'INSUFFICIENT DATA');
  assert.equal(result.pricingAllowed, false);
  assert.equal(result.analysisType, 'risk_warning');
  assert.ok(result.dataCoverageScore < 100);
  assertMissing(result, 'live injuries');
  assertMissing(result, 'team news');
  assertMissing(result, 'recent form');
  assertMissing(result, 'line movement');
  assertMissing(result, 'actual model inputs');

  const pricing = applyQualityGateToPricing(result, {
    model_probability: 28,
    implied_probability: 45.45,
    edge_percent: -17.45,
  });

  assert.equal(pricing.model_probability, null);
  assert.equal(pricing.implied_probability, null);
  assert.equal(pricing.edge_percent, null);
});

test('blocks unsupported mixed-sport parlay and reports every leg', () => {
  const result = evaluateAnalysisQuality({
    sport: 'soccer',
    eventName: 'Arsenal vs Chelsea + Tennis: Sinner vs Djokovic',
    marketType: 'Express (2 legs)',
    selection: 'Arsenal win + Sinner win',
    webSearchEnabled: false,
    modelProbability: 28,
  });

  assert.equal(result.status, 'unsupported');
  assert.equal(result.label, 'NO PRICE - unsupported mixed-sport parlay');
  assert.equal(result.pricingAllowed, false);
  assert.ok(result.reasons.includes('Mixed-sport parlay requires sport-specific support for every leg.'));
  assert.ok(result.missingDataByLeg.length >= 2);
  assertMissing(result, 'per-leg model probability');
  assertMissing(result, 'sport-specific support');
  assertMissing(result, 'tennis module');
});

test('PDF coupon exact mixed-sport express detects the tennis leg and blocks pricing', () => {
  const result = evaluateAnalysisQuality({
    sport: 'soccer',
    eventName: 'Сучжоу Донгву - Гуандун ДжейЗі-Пауер + Qingdao West Coast - Shanghai Port + Alex De Minaur - Zachary Svajda',
    marketType: 'Express / 3 legs',
    selection: 'Гуандун ДжейЗі-Пауер + Over 2.0 + Alex De Minaur -4.0',
    webSearchEnabled: false,
    modelProbability: 28,
  });

  assert.equal(result.status, 'unsupported');
  assert.equal(result.label, 'NO PRICE - unsupported mixed-sport parlay');
  assert.equal(result.pricingAllowed, false);
  assert.equal(result.missingDataByLeg.length, 3);
  assert.equal(result.missingDataByLeg[2].sport, 'tennis');
  assertMissing(result, 'tennis module unavailable or approximate');
  assert.ok(result.reasons.includes('Mixed-sport parlay requires sport-specific support for every leg.'));
});

test('blocks final EV when a tennis leg is only approximate', () => {
  const result = evaluateAnalysisQuality({
    sport: 'soccer',
    eventName: 'Inter vs Milan + Wimbledon: Sinner vs Djokovic',
    marketType: 'Parlay',
    selection: 'Inter or draw + Sinner',
    webSearchEnabled: true,
    modelProbability: 58,
    dataCoverage: {
      liveInjuries: true,
      teamNews: true,
      recentForm: true,
      lineMovement: true,
    },
    legs: [
      {
        label: 'Leg 1',
        sport: 'soccer',
        eventName: 'Inter vs Milan',
        modelProbability: 72,
        sportModuleSupport: 'full',
      },
      {
        label: 'Leg 2',
        sport: 'tennis',
        eventName: 'Sinner vs Djokovic',
        modelProbability: 80,
        sportModuleSupport: 'approximate',
      },
    ],
  });

  assert.equal(result.status, 'unsupported');
  assert.equal(result.pricingAllowed, false);
  assertMissing(result, 'tennis module unavailable or approximate');
});

test('allows priced betting analysis only when required coverage and model inputs exist', () => {
  const result = evaluateAnalysisQuality({
    sport: 'soccer',
    eventName: 'Germany vs Netherlands',
    marketType: 'Match Winner',
    selection: 'Germany',
    webSearchEnabled: true,
    modelProbability: 54,
    modelInputsPresent: true,
    sportModuleSupport: 'full',
    fixtureStatus: 'scheduled',
    dataCoverage: {
      liveInjuries: true,
      teamNews: true,
      recentForm: true,
      lineMovement: true,
    },
  });

  assert.equal(result.status, 'priced');
  assert.equal(result.label, 'PRICED BETTING ANALYSIS');
  assert.equal(result.pricingAllowed, true);
  assert.equal(result.analysisType, 'priced_betting_analysis');
  assert.equal(result.dataCoverageScore, 100);
  assert.deepEqual(result.suppressedPricingFields, []);
});

test('summary text distinguishes risk warning from priced betting analysis', () => {
  const result = evaluateAnalysisQuality({
    sport: 'soccer',
    eventName: 'Arsenal vs Chelsea + Tennis: Sinner vs Djokovic',
    marketType: 'Express',
    selection: 'Arsenal win + Sinner win',
    webSearchEnabled: false,
    modelProbability: 28,
  });

  const text = renderQualityGateSummaryText(result);

  assert.ok(text.includes('Risk warning'));
  assert.ok(text.includes('NO PRICE - unsupported mixed-sport parlay'));
  assert.ok(text.includes('Data coverage score'));
  assert.ok(text.includes('Missing data checklist'));
  assert.ok(!text.includes('Model probability 28'));
  assert.ok(!text.includes('Edge -17.4'));
});

test('PDF coupon route payload suppresses 28 percent model probability and negative edge', () => {
  const qualityGate = evaluateAnalysisQuality({
    sport: 'soccer',
    eventName: 'Arsenal vs Chelsea + Tennis: Sinner vs Djokovic',
    marketType: 'Express (2 legs)',
    selection: 'Arsenal win + Sinner win',
    webSearchEnabled: false,
    modelProbability: 28,
  });

  const payload = buildAnalystPricingPayload({
    qualityGate,
    modelProbability: 28,
    offeredOdds: 2.2,
    recommendation: 'bet',
    riskLevel: 'medium',
  });

  assert.equal(payload.model_probability, null);
  assert.equal(payload.implied_probability, null);
  assert.equal(payload.edge_percent, null);
  assert.equal(payload.recommendation, 'no_value');
  assert.equal(payload.risk_level, 'high');
  assert.equal(payload.edge_bucket, 'unpriced');
  assert.equal(payload.quality_gate.label, 'NO PRICE - unsupported mixed-sport parlay');
  assert.ok(payload.quality_gate.missingDataByLeg.length >= 2);
});

test('render helpers refuse pricing text when gate blocks analysis', () => {
  const qualityGate = evaluateAnalysisQuality({
    sport: 'soccer',
    eventName: 'Arsenal vs Chelsea + Tennis: Sinner vs Djokovic',
    marketType: 'Express (2 legs)',
    selection: 'Arsenal win + Sinner win',
    webSearchEnabled: false,
    modelProbability: 28,
  });

  const canShow = shouldShowPricingStats({
    qualityGate,
    modelProbability: 28,
    impliedProbability: 45.5,
    edgePercent: -17.4,
  });
  const line = renderPricingSummaryLine({
    qualityGate,
    modelProbability: 28,
    impliedProbability: 45.5,
    edgePercent: -17.4,
  });

  assert.equal(canShow, false);
  assert.ok(line.includes('Risk warning'));
  assert.ok(line.includes('NO PRICE - unsupported mixed-sport parlay'));
  assert.ok(!line.includes('Model probability'));
  assert.ok(!line.includes('28.0%'));
  assert.ok(!line.includes('Edge'));
  assert.ok(!line.includes('-17.4%'));
});

test('render helpers show pricing only for valid priced analysis', () => {
  const qualityGate = evaluateAnalysisQuality({
    sport: 'soccer',
    eventName: 'Germany vs Netherlands',
    marketType: 'Match Winner',
    selection: 'Germany',
    webSearchEnabled: true,
    modelProbability: 54,
    modelInputsPresent: true,
    sportModuleSupport: 'full',
    fixtureStatus: 'scheduled',
    dataCoverage: {
      liveInjuries: true,
      teamNews: true,
      recentForm: true,
      lineMovement: true,
    },
  });

  const canShow = shouldShowPricingStats({
    qualityGate,
    modelProbability: 54,
    impliedProbability: 50,
    edgePercent: 4,
  });
  const line = renderPricingSummaryLine({
    qualityGate,
    modelProbability: 54,
    impliedProbability: 50,
    edgePercent: 4,
  });

  assert.equal(canShow, true);
  assert.ok(line.includes('Priced betting analysis'));
  assert.ok(line.includes('Model probability: 54.0%'));
  assert.ok(line.includes('Implied probability: 50.0%'));
  assert.ok(line.includes('Edge: +4.0%'));
});

test('Ukrainian trust view localizes exact mixed-sport coupon and structurally hides raw pricing analysis', () => {
  const qualityGate = evaluateAnalysisQuality({
    sport: 'soccer',
    eventName: 'Сучжоу Донгву - Гуандун ДжейЗі-Пауер + Qingdao West Coast - Shanghai Port + Alex De Minaur - Zachary Svajda',
    marketType: 'Експрес (3 ноги)',
    selection: 'Гуандун ДжейЗі-Пауер + Over (2.0) + Alex De Minaur -4.0',
    webSearchEnabled: false,
    modelProbability: 28,
  });

  const view = buildAnalystTrustView({
    qualityGate,
    locale: 'uk',
    eventName: 'Сучжоу Донгву - Гуандун ДжейЗі-Пауер + Qingdao West Coast - Shanghai Port + Alex De Minaur - Zachary Svajda',
    marketType: 'Експрес (3 ноги)',
    selection: 'Гуандун ДжейЗі-Пауер + Over (2.0) + Alex De Minaur -4.0',
    rawReasoning: 'NO VALUE: implied probability 45.45% vs real probability 25-30%, negative edge -17.4%.',
    rawFactors: [
      { name: 'bookmaker coefficient vs real probability', score: -3, detail: 'Model probability 28.0% creates negative EV.' },
    ],
  });
  const text = renderAnalystTrustSummaryText(view);

  assert.equal(view.locale, 'uk');
  assert.equal(view.showRawAiAnalysis, false);
  assert.equal(view.showPlaceBet, false);
  assert.equal(view.showWatch, true);
  assert.equal(view.showSkip, true);
  assert.ok(text.includes('БЕЗ ОЦІНКИ'));
  assert.ok(text.includes('непідтримуваний експрес із різних видів спорту'));
  assert.ok(text.includes('Попередження про ризик'));
  assert.ok(text.includes('Покриття даних'));
  assert.ok(text.includes('Перелік відсутніх даних'));
  assert.ok(text.includes('Нога 3'));
  assert.ok(text.includes('теніс'));
  assert.ok(text.includes('статус не перевірено'));
  assert.ok(text.includes('Гуандун ДжейЗі-Пауер'));
  assert.ok(text.includes('Alex De Minaur'));
  assert.equal(view.downloadPdfLabel, 'Завантажити PDF');
  assert.equal(view.copyToShareLabel, 'Скопіювати для поширення');
  assert.equal(view.watchLabel, 'Спостерігати');
  assert.equal(view.skipLabel, 'Пропустити');
  assert.equal(view.placeBetLabel, 'Зробити ставку');
  assertNoForbiddenPricingText(text);
});

test('trust view marks finished or live legs as not actionable and hides Watch', () => {
  const qualityGate = evaluateAnalysisQuality({
    sport: 'soccer',
    eventName: 'Finished FC - Closed Town',
    marketType: 'Match Winner',
    selection: 'Finished FC',
    webSearchEnabled: true,
    modelProbability: 62,
    modelInputsPresent: true,
    sportModuleSupport: 'full',
    fixtureStatus: 'finished',
    dataCoverage: {
      liveInjuries: true,
      teamNews: true,
      recentForm: true,
      lineMovement: true,
    },
  });

  const view = buildAnalystTrustView({
    qualityGate,
    locale: 'uk',
    eventName: 'Finished FC - Closed Town',
    marketType: 'Match Winner',
    selection: 'Finished FC',
  });
  const text = renderAnalystTrustSummaryText(view);

  assert.equal(qualityGate.pricingAllowed, false);
  assert.equal(view.actionability, 'not_actionable');
  assert.equal(view.showPlaceBet, false);
  assert.equal(view.showWatch, false);
  assert.equal(view.showSkip, true);
  assert.ok(text.includes('неактуально'));
  assert.ok(text.includes('подія вже почалась або завершилась'));
});

test('blocked Analyst payload replaces raw pricing-like reasoning and factors with safe trust view content', () => {
  const qualityGate = evaluateAnalysisQuality({
    sport: 'soccer',
    eventName: 'Сучжоу Донгву - Гуандун ДжейЗі-Пауер + Qingdao West Coast - Shanghai Port + Alex De Minaur - Zachary Svajda',
    marketType: 'Експрес (3 ноги)',
    selection: 'Гуандун ДжейЗі-Пауер + Over (2.0) + Alex De Minaur -4.0',
    webSearchEnabled: false,
    modelProbability: 28,
  });

  const payload = buildAnalystTrustPayload({
    qualityGate,
    locale: 'uk',
    eventName: 'Сучжоу Донгву - Гуандун ДжейЗі-Пауер + Qingdao West Coast - Shanghai Port + Alex De Minaur - Zachary Svajda',
    marketType: 'Експрес (3 ноги)',
    selection: 'Гуандун ДжейЗі-Пауер + Over (2.0) + Alex De Minaur -4.0',
    rawReasoning: 'NO VALUE because Model probability is 28.0%, implied probability is 45.45%, Edge is -17.4%.',
    rawFactors: [
      { name: 'bookmaker coefficient vs real probability', score: -3, detail: '25-30% real probability creates negative expected value.' },
    ],
  });

  const combined = [
    payload.reasoning,
    payload.trust_view.safeExplanation,
    ...payload.factors.flatMap(factor => [factor.name, factor.detail]),
    renderAnalystTrustSummaryText(payload.trust_view),
  ].join('\n');

  assert.equal(payload.trust_view.showRawAiAnalysis, false);
  assert.equal(payload.trust_view.showPlaceBet, false);
  assert.ok(payload.trust_view.displayFactors.length >= 3);
  assert.ok(combined.includes('Оцінка недоступна'));
  assert.ok(combined.includes('Покриття даних'));
  assertNoForbiddenPricingText(combined);
});

if (failed > 0) {
  console.error(`\n${passed + failed} tests - ${passed} passed, ${failed} failed\n`);
  process.exit(1);
}

console.log(`\n${passed} tests - ${passed} passed, 0 failed\n`);
