#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const repoRoot = path.resolve(__dirname, '..');
const buildDir = path.join(repoRoot, 'build', 'provider-smoke');

const qualityGateModule = require(path.join(buildDir, 'lib/ai/analysis-quality-gate.js'));
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
} = qualityGateModule;
const renderAnalystTrustShareText = qualityGateModule.renderAnalystTrustShareText ?? (() => 'MISSING SHARE RENDERER');
const renderAnalystTrustPdfText = qualityGateModule.renderAnalystTrustPdfText ?? (() => 'MISSING PDF RENDERER');
const buildAnalystDecisionSurfaceView = qualityGateModule.buildAnalystDecisionSurfaceView ?? ((input) => ({
  isTrustBlocked: false,
  listRecommendationLabel: input.recommendation === 'no_value' ? 'NO VALUE' : String(input.recommendation ?? ''),
  detailRecommendationLabel: input.recommendation === 'no_value' ? 'NO VALUE' : String(input.recommendation ?? ''),
  sportLabel: input.sport === 'soccer' ? 'SOCC' : String(input.sport ?? ''),
  actionLabel: input.finalAction === 'pending' ? 'Pending' : String(input.finalAction ?? ''),
  trustView: input.trustView ?? null,
}));
const renderAnalystDecisionSurfaceShareText = qualityGateModule.renderAnalystDecisionSurfaceShareText ?? (() => 'MISSING DECISION SHARE RENDERER');
const renderAnalystDecisionSurfacePdfText = qualityGateModule.renderAnalystDecisionSurfacePdfText ?? (() => 'MISSING DECISION PDF RENDERER');
const scannerModule = require(path.join(buildDir, 'lib/ai/coupon-scanner.js'));
const {
  parseScannerVisionResult,
  normalizeLooseCouponExtraction,
  buildScannerFailureResponse,
} = scannerModule;
const researchModule = require(path.join(buildDir, 'lib/ai/analyst-research.js'));
const {
  alignAnalystResearchBriefToCoupon,
  buildAnalystResearchMessage,
  completePausedAnthropicTurn,
  containsAnalystPricingClaim,
  extractAnalystResearchSources,
  parseStoredAnalystResearchBrief,
  parseStoredAnalystResearchSources,
  usedSuccessfulWebSearch,
} = researchModule;

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

async function asyncTest(name, fn) {
  try {
    await fn();
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

const exactPdfCoupon = {
  sport: 'soccer',
  eventName: 'Сучжоу Донгву - Гуандун ДжейЗі-Пауер + Qingdao West Coast - Shanghai Port + Alex De Minaur - Zachary Svajda',
  marketType: 'Експрес (3 ноги)',
  selection: 'Гуандун ДжейЗі-Пауер + Over (2.0) + Alex De Minaur -4.0',
  offeredOdds: 2.2,
};

const exactLiveCoupon = {
  sport: 'tennis',
  eventName: '3-й сет, Тейлор Фріц - Лоренцо Сонего + Перерва, Канада - Марокко + 1-й сет, Френсіс Тіафо - Олександр Бублик',
  marketType: 'Експрес (3 ноги)',
  selection: 'Тейлор Фріц + Марокко + Олександр Бублик',
  offeredOdds: 7.253,
};

function buildExactPdfCouponTrustView() {
  const qualityGate = evaluateAnalysisQuality({
    sport: exactPdfCoupon.sport,
    eventName: exactPdfCoupon.eventName,
    marketType: exactPdfCoupon.marketType,
    selection: exactPdfCoupon.selection,
    webSearchEnabled: false,
    modelProbability: 28,
  });

  return buildAnalystTrustView({
    qualityGate,
    locale: 'uk',
    eventName: exactPdfCoupon.eventName,
    marketType: exactPdfCoupon.marketType,
    selection: exactPdfCoupon.selection,
    rawReasoning: 'NO VALUE because Model probability is 28.0%, implied probability is 45.45%, Edge is -17.4%. This analysis is based only on the information provided and does not include live injuries, team news, recent form updates, or current line movement.',
    rawFactors: [
      { name: 'Factor Analysis', score: -3, detail: 'High Risk: 25-30% real probability creates negative expected value.' },
    ],
  });
}

function assertNoBlockedEnglishLeaks(text) {
  const forbidden = [
    'This analysis is based only',
    'live injuries',
    'team news',
    'recent form updates',
    'current line movement',
    'SOCCER',
    'TENNIS',
    'NO PRICE',
    'High Risk',
    'risk warning',
    'Data coverage',
    'Missing data checklist',
    'Leg 1',
    'Factor Analysis',
    'Confidence',
    'Watch',
    'Skip',
    'Generated',
    'Analysis is for informational purposes only',
  ];
  for (const needle of forbidden) {
    assert.ok(!text.includes(needle), `expected localized blocked-mode text not to include ${needle}; got:\n${text}`);
  }
}

function assertContainsUkrainianBlockedCopy(text) {
  const required = [
    'БЕЗ ОЦІНКИ',
    'футбол',
    'теніс',
    'статус не перевірено',
    'покриття даних',
    'перелік відсутніх даних',
    'нога',
    'впевненість',
    'спостерігати',
    'пропустити',
  ];
  const lowerText = text.toLocaleLowerCase('uk');
  for (const needle of required) {
    assert.ok(lowerText.includes(needle.toLocaleLowerCase('uk')), `expected localized blocked-mode text to include ${needle}; got:\n${text}`);
  }
}

function assertNoDecisionSurfaceLeaks(text) {
  const forbidden = [
    'SOCC',
    'SOCCER',
    'NO VALUE',
    'NO PRICE',
    'High Risk',
    'risk warning',
    'Data coverage',
    'Missing data checklist',
    'Leg',
    'Factor Analysis',
    'Confidence',
    'Watch',
    'Skip',
    'This analysis is based only',
    'live injuries',
    'team news',
    'recent form updates',
    'current line movement',
    'Model probability',
    'Implied probability',
    'Edge',
    '28.0%',
    '45.5%',
    '45.45%',
    '-17.4%',
    '21.6%',
    '25-30%',
  ];
  for (const needle of forbidden) {
    assert.ok(!text.includes(needle), `expected decision surface text not to include ${needle}; got:\n${text}`);
  }
}

function buildExactSavedDecisionFixture() {
  const qualityGate = evaluateAnalysisQuality({
    sport: exactPdfCoupon.sport,
    eventName: exactPdfCoupon.eventName,
    marketType: exactPdfCoupon.marketType,
    selection: exactPdfCoupon.selection,
    webSearchEnabled: false,
    modelProbability: 28,
  });
  const trustView = buildAnalystTrustView({
    qualityGate,
    locale: 'uk',
    eventName: exactPdfCoupon.eventName,
    marketType: exactPdfCoupon.marketType,
    selection: exactPdfCoupon.selection,
    rawReasoning: 'NO VALUE because Model probability is 28.0%, implied probability is 45.45%, Edge is -17.4%.',
    rawFactors: [
      { name: 'Factor Analysis', score: -3, detail: 'High Risk: 25-30% real probability creates negative expected value.' },
    ],
  });

  return {
    sport: exactPdfCoupon.sport,
    eventName: exactPdfCoupon.eventName,
    marketType: exactPdfCoupon.marketType,
    selection: exactPdfCoupon.selection,
    offeredOdds: exactPdfCoupon.offeredOdds,
    bookmaker: null,
    locale: 'uk',
    recommendation: 'no_value',
    riskLevel: 'high',
    finalAction: 'pending',
    confidenceScore: 22,
    modelProbability: null,
    impliedProbability: null,
    edgePercent: null,
    qualityGate,
    trustView,
  };
}

const exactLiveScannerText = [
  'Лайв',
  '3-й сет, Тейлор Фріц - Лоренцо Сонего',
  'Переможець',
  'Тейлор Фріц',
  '1.19',
  'Лайв',
  'Перерва, Канада - Марокко',
  'Результат матчу',
  'Марокко',
  '2.65',
  'Лайв',
  '1-й сет, Френсіс Тіафо - Олександр Бублик',
  'Переможець',
  'Олександр Бублик',
  '2.30',
  'Кількість результатів',
  '3',
  'Загальний коефіцієнт',
  '7.253',
].join('\n');

console.log('\nScanner Coupon Normalization checks\n');

test('scanner vision response wrapped in markdown code fence still parses', () => {
  const raw = `Here is the extracted coupon:\n\n\`\`\`json\n{"rawText":"${exactLiveScannerText.replace(/\n/g, '\\n')}","couponType":"express","totalOdds":7.253,"legs":[]}\n\`\`\``;
  const parsed = parseScannerVisionResult(raw);
  assert.strictEqual(parsed.couponType, 'express');
  assert.strictEqual(parsed.totalOdds, 7.253);
  assert.ok(parsed.rawText.includes('Тейлор Фріц'));
});

test('scanner vision response with prose and JSON still parses', () => {
  const raw = `I found a live coupon. Use this object:\n{"rawText":"${exactLiveScannerText.replace(/\n/g, '\\n')}","couponType":"express","totalOdds":7.253,"warnings":["low contrast"]}\nTrailing note.`;
  const parsed = parseScannerVisionResult(raw);
  assert.strictEqual(parsed.couponType, 'express');
  assert.deepEqual(parsed.warnings, ['low contrast']);
});

test('exact live coupon text normalizes to three live legs with coupon status source', () => {
  const normalized = normalizeLooseCouponExtraction({
    rawText: exactLiveScannerText,
    couponType: 'express',
    totalOdds: 7.253,
    warnings: [],
  });

  assert.strictEqual(normalized.market_type, 'Експрес (3 ноги)');
  assert.strictEqual(normalized.odds, 7.253);
  assert.strictEqual(normalized.selection, 'Тейлор Фріц + Марокко + Олександр Бублик');
  assert.strictEqual(normalized.legs.length, 3);

  assert.deepEqual(normalized.legs.map(leg => leg.sport), ['tennis', 'soccer', 'tennis']);
  assert.deepEqual(normalized.legs.map(leg => leg.isLive), [true, true, true]);
  assert.deepEqual(normalized.legs.map(leg => leg.periodOrPhase), ['3-й сет', 'Перерва', '1-й сет']);
  assert.deepEqual(normalized.legs.map(leg => leg.statusSource), ['coupon', 'coupon', 'coupon']);
  assert.deepEqual(normalized.legs.map(leg => leg.eventName), [
    'Тейлор Фріц - Лоренцо Сонего',
    'Канада - Марокко',
    'Френсіс Тіафо - Олександр Бублик',
  ]);
  assert.deepEqual(normalized.legs.map(leg => leg.selection), [
    'Тейлор Фріц',
    'Марокко',
    'Олександр Бублик',
  ]);
  assert.deepEqual(normalized.legs.map(leg => leg.odds), [1.19, 2.65, 2.3]);
});

test('legacy flattened scanner response reconstructs express legs without raw legs', () => {
  const normalized = normalizeLooseCouponExtraction({
    event_name: [
      '3-й сет, Тейлор Фріц - Лоренцо Сонего',
      'Перерва, Канада - Марокко',
      '1-й сет, Френсіс Тіафо - Олександр Бублик',
    ].join(' + '),
    market_type: 'Експрес (3 ноги)',
    selection: 'Тейлор Фріц + Марокко + Олександр Бублик',
    odds: 7.253,
    sport: 'soccer',
    legs: [],
  });

  assert.strictEqual(normalized.market_type, 'Експрес (3 ноги)');
  assert.strictEqual(normalized.odds, 7.253);
  assert.strictEqual(normalized.legs.length, 3);
  assert.deepEqual(normalized.legs.map(leg => leg.sport), ['tennis', 'soccer', 'tennis']);
  assert.deepEqual(normalized.legs.map(leg => leg.periodOrPhase), ['3-й сет', 'Перерва', '1-й сет']);
  assert.deepEqual(normalized.legs.map(leg => leg.statusSource), ['coupon', 'coupon', 'coupon']);
  assert.deepEqual(normalized.legs.map(leg => leg.statusText), ['Лайв', 'Лайв', 'Лайв']);
});

test('scanner preserves the exact coupon date and time for fixture research', () => {
  const explicit = normalizeLooseCouponExtraction({
    eventStartText: 'Сьогодні, 22:10',
    event_name: 'Іспанія - Аргентина',
    market_type: 'Bet Builder',
    selection: 'Більше 2.5 + Більше 6.5',
    totalOdds: 2.91,
    sport: 'soccer',
    legs: [
      { eventName: 'Іспанія - Аргентина', marketType: 'Тотал', selection: 'Більше 2.5', sport: 'soccer' },
      { eventName: 'Іспанія - Аргентина', marketType: 'Кутові. Тотал', selection: 'Більше 6.5', sport: 'soccer' },
    ],
  });
  assert.equal(explicit.event_start_text, 'Сьогодні, 22:10');

  const fromRawText = normalizeLooseCouponExtraction({
    rawText: 'Сьогодні, 22:10\nІспанія - Аргентина',
    event_name: 'Іспанія - Аргентина',
    market_type: 'Тотал',
    selection: 'Більше 2.5',
    odds: 1.8,
    sport: 'soccer',
    legs: [{ eventName: 'Іспанія - Аргентина', marketType: 'Тотал', selection: 'Більше 2.5', sport: 'soccer' }],
  });
  assert.equal(fromRawText.event_start_text, 'Сьогодні, 22:10');
});

test('invalid scanner response returns localized actionable error metadata', () => {
  const failure = buildScannerFailureResponse('schema_validation', ['legs', 'totalOdds']);
  assert.strictEqual(
    failure.error,
    'Не вдалося розпізнати купон. Спробуйте чіткіший скрин або введіть дані вручну.'
  );
  assert.strictEqual(failure.scannerParseStage, 'schema_validation');
  assert.deepEqual(failure.missingFields, ['legs', 'totalOdds']);
});

console.log('\nAnalysis Quality Gate checks\n');

test('exact live coupon is parsed per leg and blocked as unsupported live analysis', () => {
  const qualityGate = evaluateAnalysisQuality({
    sport: exactLiveCoupon.sport,
    eventName: exactLiveCoupon.eventName,
    marketType: exactLiveCoupon.marketType,
    selection: exactLiveCoupon.selection,
    webSearchEnabled: false,
    modelProbability: 41,
  });
  const view = buildAnalystTrustView({
    qualityGate,
    locale: 'uk',
    eventName: exactLiveCoupon.eventName,
    marketType: exactLiveCoupon.marketType,
    selection: exactLiveCoupon.selection,
    rawReasoning: 'Model probability 41.0%, implied probability 13.79%, Edge +27.2%. Status unverified.',
    rawFactors: [
      { name: 'Factor Analysis', score: 2, detail: 'Live coupon looks valuable.' },
    ],
  });
  const summaryText = renderAnalystTrustSummaryText(view);
  const shareText = renderAnalystTrustShareText(view, exactLiveCoupon);
  const pdfText = renderAnalystTrustPdfText(view, exactLiveCoupon);
  const combined = [summaryText, shareText, pdfText, view.displayReasoning, ...view.displayFactors.flatMap(f => [f.name, f.detail])].join('\n');

  assert.equal(qualityGate.pricingAllowed, false);
  assert.equal(qualityGate.actionability, 'live_not_supported');
  assert.equal(qualityGate.missingDataByLeg.length, 3);
  assert.equal(qualityGate.missingDataByLeg[0].sport, 'tennis');
  assert.equal(qualityGate.missingDataByLeg[0].fixtureStatus, 'live');
  assert.equal(qualityGate.missingDataByLeg[0].periodOrPhase, '3-й сет');
  assert.equal(qualityGate.missingDataByLeg[0].statusSource, 'coupon');
  assert.equal(qualityGate.missingDataByLeg[1].sport, 'soccer');
  assert.equal(qualityGate.missingDataByLeg[1].fixtureStatus, 'live');
  assert.equal(qualityGate.missingDataByLeg[1].periodOrPhase, 'Перерва');
  assert.equal(qualityGate.missingDataByLeg[1].statusSource, 'coupon');
  assert.equal(qualityGate.missingDataByLeg[2].sport, 'tennis');
  assert.equal(qualityGate.missingDataByLeg[2].fixtureStatus, 'live');
  assert.equal(qualityGate.missingDataByLeg[2].periodOrPhase, '1-й сет');
  assert.equal(qualityGate.missingDataByLeg[2].statusSource, 'coupon');

  assert.equal(view.label, 'ЛАЙВ-КУПОН — оцінка недоступна без live-даних');
  assert.equal(view.showRawAiAnalysis, false);
  assert.equal(view.showPlaceBet, false);
  assert.equal(view.showWatch, false);
  assert.equal(view.showSkip, true);
  assert.ok(combined.includes('Нога 1'), combined);
  assert.ok(combined.includes('теніс'), combined);
  assert.ok(combined.includes('Нога 2'), combined);
  assert.ok(combined.includes('футбол'), combined);
  assert.ok(combined.includes('Нога 3'), combined);
  assert.ok(combined.includes('статус визначено з купона'), combined);
  assert.ok(combined.includes('3-й сет'), combined);
  assert.ok(combined.includes('Перерва'), combined);
  assert.ok(combined.includes('1-й сет'), combined);
  assert.ok(combined.includes('live-аналіз не підтримується'), combined);
  assert.ok(combined.includes('поточний рахунок'), combined);
  assert.ok(!combined.includes('статус не перевірено'), combined);
  assertNoForbiddenPricingText(combined);
});

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

test('exact Ukrainian PDF coupon trust strings do not leak legacy English blocked-mode copy', () => {
  const view = buildExactPdfCouponTrustView();
  const text = [
    renderAnalystTrustSummaryText(view),
    view.uiDisclaimer,
    view.riskDisclaimer,
    view.footerDisclaimer,
    view.shareHeader,
    view.pdfHeader,
    view.pdfFooter,
    view.confidenceLabel,
    view.watchLabel,
    view.skipLabel,
  ].filter(Boolean).join('\n');

  assert.equal(view.showRawAiAnalysis, false);
  assert.equal(view.showPlaceBet, false);
  assert.equal(view.showWatch, true);
  assert.equal(view.legs[2].sportLabel, 'теніс');
  assert.ok(text.includes('Цей аналіз базується лише на наданій інформації'));
  assertNoForbiddenPricingText(text);
  assertNoBlockedEnglishLeaks(text);
  assertContainsUkrainianBlockedCopy(text);
});

test('exact Ukrainian PDF coupon share text uses localized sport header and no English disclaimer', () => {
  const view = buildExactPdfCouponTrustView();
  const shareText = renderAnalystTrustShareText(view, exactPdfCoupon);
  const shareHeader = shareText.split('\n').slice(0, 2).join('\n');

  assert.ok(shareHeader.includes('футбол'), `expected localized sport in share header; got:\n${shareHeader}`);
  assert.ok(!shareHeader.includes('SOCCER'), `expected share header not to include SOCCER; got:\n${shareHeader}`);
  assert.ok(!shareText.includes('This analysis is based only'), shareText);
  assertNoForbiddenPricingText(shareText);
  assertNoBlockedEnglishLeaks(shareText);
  assertContainsUkrainianBlockedCopy(shareText);
});

test('exact Ukrainian PDF coupon PDF string-builder uses localized blocked-mode labels only', () => {
  const view = buildExactPdfCouponTrustView();
  const pdfText = renderAnalystTrustPdfText(view, exactPdfCoupon);

  assert.ok(pdfText.includes('футбол'), pdfText);
  assert.ok(pdfText.includes('теніс'), pdfText);
  assert.ok(pdfText.includes('Цей аналіз базується лише на наданій інформації'), pdfText);
  assertNoForbiddenPricingText(pdfText);
  assertNoBlockedEnglishLeaks(pdfText);
  assertContainsUkrainianBlockedCopy(pdfText);
});

test('saved unpriced Analyst decision list surface uses trust label instead of legacy NO VALUE', () => {
  const decision = buildExactSavedDecisionFixture();
  const surface = buildAnalystDecisionSurfaceView(decision);
  const listText = [
    surface.sportLabel,
    surface.listRecommendationLabel,
    surface.actionLabel,
    `${decision.confidenceScore}%`,
  ].join('\n');

  assert.equal(surface.isTrustBlocked, true);
  assert.ok(listText.includes('БЕЗ ОЦІНКИ'), listText);
  assert.ok(listText.includes('футбол'), listText);
  assert.ok(!listText.includes('NO VALUE'), listText);
  assert.ok(!listText.includes('SOCC'), listText);
});

test('legacy saved unpriced decision without stored trust view still uses localized blocked labels', () => {
  const decision = {
    ...buildExactSavedDecisionFixture(),
    qualityGate: null,
    trustView: null,
    edgeBucket: 'unpriced',
  };
  const surface = buildAnalystDecisionSurfaceView(decision);
  const listText = [
    surface.sportLabel,
    surface.listRecommendationLabel,
    surface.actionLabel,
  ].join('\n');

  assert.equal(surface.isTrustBlocked, true);
  assert.ok(listText.includes('БЕЗ ОЦІНКИ'), listText);
  assert.ok(listText.includes('футбол'), listText);
  assert.ok(listText.includes('Очікує рішення'), listText);
  assert.ok(!listText.includes('NO VALUE'), listText);
  assert.ok(!listText.includes('NO PRICE'), listText);
  assert.ok(!listText.includes('SOCC'), listText);
  assert.ok(!listText.includes('Pending'), listText);
});

test('legacy saved Ukrainian coupon with stale English trust view is localized on decision surfaces', () => {
  const decision = buildExactSavedDecisionFixture();
  const staleEnglishTrustView = buildAnalystTrustView({
    qualityGate: decision.qualityGate,
    locale: 'en',
    eventName: decision.eventName,
    marketType: decision.marketType,
    selection: decision.selection,
    rawReasoning: 'NO PRICE because this is unsupported.',
    rawFactors: [],
  });
  const surface = buildAnalystDecisionSurfaceView({
    ...decision,
    locale: null,
    trustView: staleEnglishTrustView,
    edgeBucket: 'unpriced',
  });
  const listText = [
    surface.sportLabel,
    surface.listRecommendationLabel,
    surface.actionLabel,
  ].join('\n');

  assert.equal(surface.isTrustBlocked, true);
  assert.ok(listText.includes('БЕЗ ОЦІНКИ'), listText);
  assert.ok(listText.includes('футбол'), listText);
  assert.ok(listText.includes('Очікує рішення'), listText);
  assert.ok(!listText.includes('NO PRICE'), listText);
  assert.ok(!listText.includes('soccer'), listText);
  assert.ok(!listText.includes('Pending'), listText);
});

test('saved unpriced Analyst decision detail header uses localized sport and full trust label', () => {
  const decision = buildExactSavedDecisionFixture();
  const surface = buildAnalystDecisionSurfaceView(decision);
  const headerText = [
    surface.sportLabel,
    surface.detailRecommendationLabel,
    surface.actionLabel,
    surface.trustView?.supportLabel,
  ].filter(Boolean).join('\n');

  assert.equal(surface.isTrustBlocked, true);
  assert.ok(headerText.includes('футбол'), headerText);
  assert.ok(headerText.includes('БЕЗ ОЦІНКИ - непідтримуваний експрес із різних видів спорту'), headerText);
  assert.ok(!headerText.includes('SOCC'), headerText);
  assert.ok(!headerText.includes('NO VALUE'), headerText);
  assert.ok(!headerText.includes('Pending'), headerText);
});

test('saved unpriced Analyst decision detail share and PDF strings use trust view only', () => {
  const decision = buildExactSavedDecisionFixture();
  const surface = buildAnalystDecisionSurfaceView(decision);
  const shareText = renderAnalystDecisionSurfaceShareText(surface, decision);
  const pdfText = renderAnalystDecisionSurfacePdfText(surface, decision);
  const combined = `${shareText}\n${pdfText}`;

  assert.ok(combined.includes('БЕЗ ОЦІНКИ - непідтримуваний експрес із різних видів спорту'), combined);
  assert.ok(combined.includes('футбол'), combined);
  assert.ok(combined.includes('теніс'), combined);
  assert.ok(combined.includes('статус не перевірено'), combined);
  assert.ok(combined.includes('Покриття даних'), combined);
  assert.ok(combined.includes('Перелік відсутніх даних'), combined);
  assertNoDecisionSurfaceLeaks(combined);
});

test('Analyst research message preserves Bet Builder legs and coupon time context', () => {
  const message = buildAnalystResearchMessage({
    sport: 'soccer',
    eventName: 'Іспанія - Аргентина',
    marketType: 'Bet Builder',
    selection: 'Більше 2.5 + Більше 6.5',
    offeredOdds: 2.91,
    couponEventTime: 'Сьогодні, 22:10',
    clientTimezone: 'Europe/Kyiv',
    currentUtcIso: '2026-07-19T19:00:00.000Z',
    legs: [
      { eventName: 'Іспанія - Аргентина', marketType: 'Тотал', selection: 'Більше 2.5', sport: 'soccer' },
      { eventName: 'Іспанія - Аргентина', marketType: 'Кутові. Тотал', selection: 'Більше 6.5', sport: 'soccer' },
    ],
  });

  assert.ok(message.includes('Exact date/time text visible on coupon: Сьогодні, 22:10'), message);
  assert.ok(message.includes('User timezone: Europe/Kyiv'), message);
  assert.ok(message.includes('Offered total odds: 2.91'), message);
  assert.ok(message.includes('Leg 1: event=Іспанія - Аргентина | market=Тотал | selection=Більше 2.5'), message);
  assert.ok(message.includes('Leg 2: event=Іспанія - Аргентина | market=Кутові. Тотал | selection=Більше 6.5'), message);
  assert.ok(message.includes('correlation'), message);
});

function exactBuilderResearchBrief() {
  return {
    headline: 'Conditional Bet Builder review',
    summary: 'The two legs depend on the same match script and need separate verification.',
    builderRisk: 'An early goal can change both attacking pressure and corner volume.',
    verdict: 'Verify the fixture and current inputs before kickoff.',
    dataGaps: ['Exact competition'],
    sourcedClaims: [],
    legs: [
      {
        legNumber: 2,
        eventName: 'Іспанія - Аргентина',
        marketType: 'Кутові. Тотал',
        selection: 'Більше 6.5',
        assessment: 'Seven corners are required.',
        evidence: ['Conditional match logic only'],
        risks: ['Low attacking width'],
        fixtureStatus: 'scheduled',
        dataCoverage: { liveInjuries: true, teamNews: true, recentForm: true, lineMovement: true },
      },
      {
        legNumber: 1,
        eventName: 'Іспанія - Аргентина',
        marketType: 'Тотал',
        selection: 'Більше 2.5',
        assessment: 'Three goals are required.',
        evidence: ['Conditional scoring logic only'],
        risks: ['Low-tempo opening'],
        fixtureStatus: 'scheduled',
        dataCoverage: { liveInjuries: true, teamNews: true, recentForm: true, lineMovement: true },
      },
    ],
  };
}

test('Analyst aligns reordered model legs by leg number and discards unbound coverage', () => {
  const aligned = alignAnalystResearchBriefToCoupon(exactBuilderResearchBrief(), [
    { eventName: 'Іспанія - Аргентина', marketType: 'Тотал', selection: 'Більше 2.5' },
    { eventName: 'Іспанія - Аргентина', marketType: 'Кутові. Тотал', selection: 'Більше 6.5' },
  ]);

  assert.ok(aligned);
  assert.equal(aligned.legs[0].assessment, 'Three goals are required.');
  assert.equal(aligned.legs[1].assessment, 'Seven corners are required.');
  assert.deepEqual(aligned.legs.map(leg => leg.dataCoverage), [
    { liveInjuries: false, teamNews: false, recentForm: false, lineMovement: false },
    { liveInjuries: false, teamNews: false, recentForm: false, lineMovement: false },
  ]);
  assert.deepEqual(aligned.legs.map(leg => leg.fixtureStatus), ['unknown', 'unknown']);
});

test('Analyst rejects duplicate numbers and mismatched leg identity instead of swapping commentary', () => {
  const couponLegs = [
    { eventName: 'Іспанія - Аргентина', marketType: 'Тотал', selection: 'Більше 2.5' },
    { eventName: 'Іспанія - Аргентина', marketType: 'Кутові. Тотал', selection: 'Більше 6.5' },
  ];
  const duplicate = exactBuilderResearchBrief();
  duplicate.legs[0].legNumber = 1;
  assert.equal(alignAnalystResearchBriefToCoupon(duplicate, couponLegs), null);

  const mismatched = exactBuilderResearchBrief();
  mismatched.legs[0].selection = 'Більше 2.5';
  assert.equal(alignAnalystResearchBriefToCoupon(mismatched, couponLegs), null);
});

test('Analyst binds only verbatim claims to their exact citation URL', () => {
  const brief = exactBuilderResearchBrief();
  brief.sourcedClaims = [
    { text: 'Spain confirmed the squad on Friday.', sourceUrl: 'https://example.com/report' },
    { text: 'Paraphrased claim not present in the citation.', sourceUrl: 'https://example.com/report' },
    { text: 'Unrelated source.', sourceUrl: 'https://example.org/uncited' },
  ];
  const aligned = alignAnalystResearchBriefToCoupon(brief, [
    { eventName: 'Іспанія - Аргентина', marketType: 'Тотал', selection: 'Більше 2.5' },
    { eventName: 'Іспанія - Аргентина', marketType: 'Кутові. Тотал', selection: 'Більше 6.5' },
  ], [{
    title: 'Squad report',
    url: 'https://example.com/report',
    citedText: 'Spain confirmed the squad on Friday.',
  }]);

  assert.ok(aligned);
  assert.deepEqual(aligned.sourcedClaims, [{
    text: 'Spain confirmed the squad on Friday.',
    sourceUrl: 'https://example.com/report',
  }]);

  const prefix = 'x'.repeat(400);
  const longCitationSources = extractAnalystResearchSources([{
    type: 'text',
    text: '{}',
    citations: [{
      type: 'web_search_result_location',
      url: 'https://example.com/long-report',
      title: 'Long report',
      cited_text: `${prefix} MATERIAL QUALIFIER`,
    }],
  }]);
  assert.deepEqual(longCitationSources, [{
    title: 'Long report',
    url: 'https://example.com/long-report',
    citedText: null,
  }]);

  const prefixOnly = exactBuilderResearchBrief();
  prefixOnly.sourcedClaims = [{ text: prefix, sourceUrl: 'https://example.com/long-report' }];
  const rejectedPrefix = alignAnalystResearchBriefToCoupon(prefixOnly, [
    { eventName: 'Іспанія - Аргентина', marketType: 'Тотал', selection: 'Більше 2.5' },
    { eventName: 'Іспанія - Аргентина', marketType: 'Кутові. Тотал', selection: 'Більше 6.5' },
  ], longCitationSources);
  assert.ok(rejectedPrefix);
  assert.deepEqual(rejectedPrefix.sourcedClaims, []);
});

test('Analyst research source extraction keeps only cited public HTTPS sources', () => {
  const content = [
    {
      type: 'text',
      text: '{}',
      citations: [
        { type: 'web_search_result_location', url: 'https://example.com/report', title: ' Match report ', cited_text: '  Current team news. ' },
        { type: 'web_search_result_location', url: 'javascript:alert(1)', title: 'Unsafe', cited_text: 'nope' },
        { type: 'web_search_result_location', url: 'http://example.com/plain', title: 'Plain HTTP', cited_text: 'nope' },
        { type: 'web_search_result_location', url: 'https://user:pass@example.com/private', title: 'Credentials', cited_text: 'nope' },
        { type: 'web_search_result_location', url: 'https://127.0.0.1/internal', title: 'Loopback', cited_text: 'nope' },
        { type: 'web_search_result_location', url: 'https://192.168.1.5/internal', title: 'Private', cited_text: 'nope' },
        { type: 'web_search_result_location', url: 'https://192.0.2.1/test', title: 'TEST-NET-1', cited_text: 'nope' },
        { type: 'web_search_result_location', url: 'https://198.51.100.1/test', title: 'TEST-NET-2', cited_text: 'nope' },
        { type: 'web_search_result_location', url: 'https://203.0.113.1/test', title: 'TEST-NET-3', cited_text: 'nope' },
      ],
    },
    {
      type: 'web_search_tool_result',
      content: [
        { type: 'web_search_result', url: 'https://example.com/report', title: 'Duplicate title' },
        { type: 'web_search_result', url: 'https://example.org/schedule', title: 'Schedule' },
      ],
    },
  ];

  assert.equal(usedSuccessfulWebSearch(content), true);
  assert.deepEqual(extractAnalystResearchSources(content), [
    { title: 'Match report', url: 'https://example.com/report', citedText: 'Current team news.' },
  ]);
  assert.equal(usedSuccessfulWebSearch([{ type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: 'https://example.org/uncited' }] }]), false);
  assert.equal(usedSuccessfulWebSearch([{ type: 'web_search_tool_result', content: { type: 'web_search_tool_result_error' } }]), false);
});

test('Analyst research rejects probability and edge claims but permits ordinary match statistics', () => {
  const brief = {
    headline: 'Conditional Bet Builder review',
    summary: 'Spain recorded 58% possession in a sourced match, but the exact fixture still needs verification.',
    builderRisk: 'An early goal may reduce later attacking pressure and corner volume.',
    verdict: 'Verify the competition and squads before kickoff.',
    dataGaps: ['Exact competition'],
    sourcedClaims: [],
    legs: [{
      legNumber: 1,
      eventName: 'Spain - Argentina',
      marketType: 'Total',
      selection: 'Over 2.5',
      assessment: 'This leg needs three goals and is sensitive to game state.',
      evidence: [],
      risks: ['Low-tempo opening'],
      fixtureStatus: 'unknown',
      dataCoverage: {},
    }],
  };

  assert.equal(containsAnalystPricingClaim(brief), false);
  assert.equal(containsAnalystPricingClaim({ ...brief, verdict: 'Model probability is 42% and the edge is -5%.' }), true);
  assert.equal(containsAnalystPricingClaim({ ...brief, summary: 'Реальна ймовірність 41,5% дає негативну перевагу.' }), true);
  assert.equal(containsAnalystPricingClaim({ ...brief, verdict: 'probability 0.42' }), true);
  assert.equal(containsAnalystPricingClaim({ ...brief, verdict: 'EV +0.12 units' }), true);
  assert.equal(containsAnalystPricingClaim({ ...brief, verdict: 'edge -0.05' }), true);
  assert.equal(containsAnalystPricingClaim({ ...brief, verdict: 'probabilidad 42%' }), true);
  assert.equal(containsAnalystPricingClaim({ ...brief, verdict: 'вероятность 42%' }), true);
  assert.equal(containsAnalystPricingClaim({ ...brief, verdict: 'Wahrscheinlichkeit 0,42' }), true);
});

test('saved research parser rejects partial nested JSON and unsafe stored sources', () => {
  const valid = exactBuilderResearchBrief();
  assert.ok(parseStoredAnalystResearchBrief(valid));
  assert.equal(parseStoredAnalystResearchBrief({ ...valid, legs: [{ legNumber: 1 }] }), null);
  assert.equal(parseStoredAnalystResearchBrief({ ...valid, legs: [{ ...valid.legs[0], risks: 'not-an-array' }] }), null);
  assert.equal(parseStoredAnalystResearchBrief({ ...valid, sourcedClaims: [{ text: 'Claim', sourceUrl: 'https://192.0.2.1/test' }] }), null);
  assert.deepEqual(parseStoredAnalystResearchSources([
    { title: 'Report', url: 'https://example.com/report', citedText: null },
    { title: 'Internal', url: 'https://127.0.0.1/admin', citedText: null },
    { title: 'Plain', url: 'http://example.com/report', citedText: null },
  ]), [{ title: 'Report', url: 'https://example.com/report', citedText: null }]);
});

await asyncTest('Anthropic pause_turn continuation preserves protocol state and is bounded', async () => {
  const seen = [];
  const completed = await completePausedAnthropicTurn(
    { stop_reason: 'pause_turn', content: ['first'] },
    async (content, continuation) => {
      seen.push({ content, continuation });
      return continuation === 1
        ? { stop_reason: 'pause_turn', content: ['second'] }
        : { stop_reason: 'end_turn', content: ['done'] };
    },
  );
  assert.deepEqual(seen, [
    { content: ['first'], continuation: 1 },
    { content: ['second'], continuation: 2 },
  ]);
  assert.deepEqual(completed, { stop_reason: 'end_turn', content: ['done'] });
  await assert.rejects(
    completePausedAnthropicTurn(
      { stop_reason: 'pause_turn', content: ['first'] },
      async content => ({ stop_reason: 'pause_turn', content }),
      1,
    ),
    /continuation limit/,
  );
});

test('editorial black action surfaces explicitly retain readable foreground text', () => {
  const css = readFileSync(path.join(repoRoot, 'app/globals.css'), 'utf8');
  assert.match(css, /\.web-editorial \.btn-primary[\s\S]*?color:\s*#ffffff\s*!important/);
  assert.match(css, /\.web-editorial \.bg-black[\s\S]*?color:\s*#ffffff\s*!important/);
  assert.match(css, /\.web-editorial \.bg-indigo-600\.text-white[\s\S]*?color:\s*#ffffff\s*!important/);
});

test('web Analyst transports coupon legs and time into the research pipeline', () => {
  const routeSource = readFileSync(path.join(repoRoot, 'app/api/ai/analyst/route.ts'), 'utf8');
  const pageSource = readFileSync(path.join(repoRoot, 'app/(app)/ai/page.tsx'), 'utf8');
  const decisionDetailSource = readFileSync(path.join(repoRoot, 'app/(app)/decisions/[id]/page.tsx'), 'utf8');

  assert.match(routeSource, /buildAnalystResearchMessage\(\{[\s\S]*?couponEventTime:\s*input\.coupon_event_time[\s\S]*?legs:\s*input\.legs/);
  assert.match(routeSource, /type:\s*'web_search_20250305'/);
  assert.match(routeSource, /research_brief:\s*researchBrief/);
  assert.match(routeSource, /research_sources:\s*researchSources/);
  assert.match(routeSource, /offered_odds:\s*input\.offered_odds/);
  assert.match(routeSource, /researchBrief\.sourcedClaims\.length\s*>\s*0/);
  assert.doesNotMatch(pageSource, /Current-source research/);
  assert.doesNotMatch(decisionDetailSource, /Current-source research/);
  assert.match(pageSource, /coupon_event_time:\s*form\.event_time/);
  assert.match(pageSource, /client_timezone:\s*Intl\.DateTimeFormat/);
  assert.match(pageSource, /a\.research_brief\.legs\.map/);
  assert.match(pageSource, /ЦІНУ НЕ ПІДТВЕРДЖЕНО/);
  assert.match(decisionDetailSource, /researchBrief\.legs\.map/);
  assert.match(decisionDetailSource, /parseStoredAnalystResearchBrief/);
  assert.match(decisionDetailSource, /parseStoredAnalystResearchSources/);
});

if (failed > 0) {
  console.error(`\n${passed + failed} tests - ${passed} passed, ${failed} failed\n`);
  process.exit(1);
}

console.log(`\n${passed} tests - ${passed} passed, 0 failed\n`);
