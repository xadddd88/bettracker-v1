#!/usr/bin/env node
/**
 * Unit tests for the extractJsonObject helper (lib/ai/extract-json.ts).
 *
 * No external dependencies — uses only Node.js built-in assert module.
 * No eval. Does not log raw user or LLM content.
 *
 * Run:  node scripts/test-extract-json.mjs
 * CI:   npm run test:extract-json
 *
 * SYNC NOTE: This script inlines the pure-JS equivalent of extractJsonObject
 * from lib/ai/extract-json.ts. If the TypeScript source logic changes,
 * update the inline implementation below to match.
 */

import assert from 'node:assert/strict';

// ── Inline equivalent of lib/ai/extract-json.ts ──────────────────────────────
function extractJsonObject(rawText) {
  const text = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  let i = text.indexOf('{');
  while (i !== -1) {
    const end = text.lastIndexOf('}');
    if (end > i) {
      try {
        JSON.parse(text.slice(i, end + 1));
        return text.slice(i, end + 1).trim();
      } catch {}
    }
    i = text.indexOf('{', i + 1);
  }
  throw new Error('no_json_found');
}
// ─────────────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌  ${name}`);
    console.error(`      ${err.message}`);
    failed++;
  }
}

console.log('\nextractJsonObject — unit tests\n');

// ── 1. Plain JSON object ──────────────────────────────────────────────────────
test('plain JSON object', () => {
  const result = JSON.parse(extractJsonObject('{"key": "value", "num": 42}'));
  assert.strictEqual(result.key, 'value');
  assert.strictEqual(result.num, 42);
});

// ── 2. ```json fenced ────────────────────────────────────────────────────────
test('```json fenced JSON', () => {
  const raw = '```json\n{"score": 75, "risk": "medium"}\n```';
  const result = JSON.parse(extractJsonObject(raw));
  assert.strictEqual(result.score, 75);
  assert.strictEqual(result.risk, 'medium');
});

// ── 3. Generic ``` fenced ────────────────────────────────────────────────────
test('generic ``` fenced JSON', () => {
  const raw = '```\n{"recommendation": "bet"}\n```';
  const result = JSON.parse(extractJsonObject(raw));
  assert.strictEqual(result.recommendation, 'bet');
});

// ── 4. Russian prose before JSON ─────────────────────────────────────────────
test('Russian prose before JSON', () => {
  const raw = 'Вот результат анализа:\n{"model_probability": 60, "edge_percent": 5.2}';
  const result = JSON.parse(extractJsonObject(raw));
  assert.strictEqual(result.model_probability, 60);
  assert.strictEqual(result.edge_percent, 5.2);
});

// ── 5. Ukrainian prose before JSON ───────────────────────────────────────────
test('Ukrainian prose before JSON', () => {
  const raw = 'Ось мій аналіз ставки:\n{"confidence_score": 70, "recommendation": "watch"}';
  const result = JSON.parse(extractJsonObject(raw));
  assert.strictEqual(result.confidence_score, 70);
  assert.strictEqual(result.recommendation, 'watch');
});

// ── 6. Prose before AND after JSON ───────────────────────────────────────────
test('prose before and after JSON', () => {
  const raw = 'Аналіз:\n{"summary": "Гарна гра.", "calibration_grade": null}\n\nДякую за увагу!';
  const result = JSON.parse(extractJsonObject(raw));
  assert.strictEqual(result.summary, 'Гарна гра.');
  assert.strictEqual(result.calibration_grade, null);
});

// ── 7. Nested object fields ───────────────────────────────────────────────────
test('nested object fields', () => {
  const raw = '{"recommendations": [{"priority": "high", "action": "Focus on singles", "detail": "ROI is better."}], "patterns": {"best_sport": "tennis"}}';
  const result = JSON.parse(extractJsonObject(raw));
  assert.strictEqual(result.recommendations[0].priority, 'high');
  assert.strictEqual(result.patterns.best_sport, 'tennis');
});

// ── 8. Braces inside string values ───────────────────────────────────────────
test('braces inside string values', () => {
  const raw = '{"template": "use {name} as a placeholder", "score": 5}';
  const result = JSON.parse(extractJsonObject(raw));
  assert.strictEqual(result.template, 'use {name} as a placeholder');
  assert.strictEqual(result.score, 5);
});

// ── 9. Multiple brace candidates: first invalid, later one is valid ───────────
test('multiple brace candidates: first invalid, second valid', () => {
  const raw = 'I tried {this: is not valid json} but here is the real one: {"key": "valid"}';
  const result = JSON.parse(extractJsonObject(raw));
  assert.strictEqual(result.key, 'valid');
});

// ── 10. Pure non-JSON text throws controlled no_json_found ───────────────────
test('pure non-JSON text throws no_json_found', () => {
  assert.throws(
    () => extractJsonObject('No JSON here at all.'),
    { message: 'no_json_found' }
  );
});

// ── 11. Empty string throws no_json_found ────────────────────────────────────
test('empty string throws no_json_found', () => {
  assert.throws(
    () => extractJsonObject(''),
    { message: 'no_json_found' }
  );
});

// ── 12. Russian-language Coach fixture ───────────────────────────────────────
test('Coach RU fixture — full Coach JSON with Russian prose surrounding it', () => {
  const fixture = `Хорошо, вот мой анализ вашей игры за последние 30 дней:

{"summary": "Стабильные результаты с умеренным ROI.", "calibration_grade": null, "strengths": ["Высокий ROI на одиночных ставках"], "weaknesses": ["Слишком много ставок на аутсайдеров"], "recommendations": [{"priority": "high", "action": "Сократить количество ставок на аутсайдеров", "detail": "Анализ показывает лучший ROI на фаворитах."}], "patterns": {"best_sport": "теннис"}, "disclaimer": "Прошлые результаты не гарантируют будущих результатов."}

Надеюсь, это поможет улучшить вашу игру!`;

  const result = JSON.parse(extractJsonObject(fixture));
  assert.strictEqual(typeof result.summary, 'string');
  assert.ok(Array.isArray(result.strengths) && result.strengths.length > 0);
  assert.ok(Array.isArray(result.recommendations) && result.recommendations.length > 0);
  assert.strictEqual(result.recommendations[0].priority, 'high');
  assert.strictEqual(typeof result.disclaimer, 'string');
});

// ── 13. Ukrainian-language AI Analyst fixture ─────────────────────────────────
test('Analyst UK fixture — full Analyst JSON with Ukrainian prose surrounding it', () => {
  const fixture = `Ось мій детальний аналіз цієї ставки:

{"model_probability": 58, "implied_probability": 52.6, "edge_percent": 5.4, "confidence_score": 65, "risk_level": "medium", "recommendation": "watch", "reasoning": "Є помірна перевага, але рекомендую зачекати на підтвердження.", "factors": [{"name": "Форма", "score": 1, "detail": "Команда у гарній формі."}, {"name": "H2H", "score": 0, "detail": "Рівний рахунок в H2H."}, {"name": "Мотивація", "score": 1, "detail": "Висока мотивація."}, {"name": "Коефіцієнт", "score": 1, "detail": "Прийнятний коефіцієнт."}, {"name": "Травми", "score": 0, "detail": "Нема відомих травм."}, {"name": "Погода", "score": 0, "detail": "Нормальні умови."}], "disclaimer": "Аналіз базується лише на наданих даних."}

Дякую за увагу до деталей!`;

  const result = JSON.parse(extractJsonObject(fixture));
  assert.strictEqual(result.risk_level, 'medium');
  assert.strictEqual(result.recommendation, 'watch');
  assert.ok(Array.isArray(result.factors) && result.factors.length >= 6);
});

// ── 14. Analyst multi-block: valid JSON is in the LAST text block ─────────────
test('Analyst multi-block — last-block selection matches updated route logic (.at(-1))', () => {
  // Simulates the Anthropic SDK content array when the model produces
  // multiple text blocks (e.g. reasoning prose followed by the JSON block).
  // The updated analyst route takes .filter(text).at(-1) — this test confirms
  // that approach extracts the JSON from the right block.
  const contentBlocks = [
    { type: 'text', text: 'Дозвольте проаналізувати цю ставку детально...' },
    {
      type: 'text',
      text: '{"model_probability": 62, "implied_probability": 55.6, "edge_percent": 6.4, "confidence_score": 68, "risk_level": "medium", "recommendation": "watch", "reasoning": "Є перевага.", "factors": [{"name": "Форма", "score": 1, "detail": "Добра."},{"name": "H2H", "score": 0, "detail": "Рівно."},{"name": "Мотивація", "score": 1, "detail": "Висока."},{"name": "Коефіцієнт", "score": 1, "detail": "ОК."},{"name": "Травми", "score": 0, "detail": "Нема."},{"name": "Погода", "score": 0, "detail": "Норма."}], "disclaimer": "Тільки надані дані."}',
    },
  ];

  // Mirrors exactly what app/api/ai/analyst/route.ts now does
  const rawText = contentBlocks
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .at(-1) ?? '';

  const result = JSON.parse(extractJsonObject(rawText));
  assert.strictEqual(result.recommendation, 'watch');
  assert.ok(Array.isArray(result.factors) && result.factors.length >= 6);
});

// ── 15. Scout regression guard ────────────────────────────────────────────────
// Scout code is untouched in PR #35 — this fixture confirms the PR #35
// extraction class does not regress Scout RU output parsing.
test('Scout RU fixture — PR #35 extraction class does not regress Scout', () => {
  const fixture = `Вот кандидаты для исследования:

{"candidates": [{"event_name": "Уимблдон: Джокович vs Синнер", "market_type": "Победитель матча", "selection": "Синнер", "match_date": "2026-07-01", "offered_odds": 2.1, "opportunity_type": "value", "scout_score": 72, "model_probability": 52, "implied_probability": 47.6, "edge_percent": 4.4, "confidence_score": 55, "risk_level": "medium", "reasoning": "Хорошая форма Синнера на траве.", "required_checks": ["Проверить текущую форму Синнера"]}], "disclaimer": "Анализ без актуальных данных."}`;

  const result = JSON.parse(extractJsonObject(fixture));
  assert.ok(Array.isArray(result.candidates));
  assert.strictEqual(result.candidates[0].opportunity_type, 'value');
  assert.strictEqual(result.candidates[0].risk_level, 'medium');
  assert.strictEqual(typeof result.disclaimer, 'string');
});

// ─────────────────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
