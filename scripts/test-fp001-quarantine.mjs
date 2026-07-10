#!/usr/bin/env node
/**
 * FP-001 legacy quarantine suite (Decision #051).
 *
 * Static guards on migration 022, which backs up then scrubs the
 * fabricated pre-gate pricing from three surfaces (decisions,
 * market_opportunities, ai_analysis_runs.output_json). The live
 * before/after row counts are verified during execution against the
 * database (recorded in the execution record), the same way the #048/#049
 * bypass numbers are.
 *
 * Run:  node scripts/test-fp001-quarantine.mjs
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const MIG = 'supabase/migrations/022_fp001_legacy_quarantine.sql';

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✅  ${name}`); passed++; }
  catch (err) { console.error(`  ❌  ${name}`); console.error(`      ${err.message}`); failed++; }
}

const sql = readFileSync(path.join(repoRoot, MIG), 'utf8');

test('migration 022: creates a service-role-only quarantine audit table', () => {
  assert.ok(/CREATE TABLE IF NOT EXISTS fp001_pricing_quarantine/.test(sql), 'quarantine table missing');
  assert.ok(/ENABLE ROW LEVEL SECURITY/.test(sql), 'RLS must be enabled on the quarantine table');
  assert.ok(/REVOKE ALL ON fp001_pricing_quarantine FROM PUBLIC, anon, authenticated/.test(sql), 'quarantine table must be service-role-only');
});

test('migration 022: backs up BEFORE scrubbing, for every surface', () => {
  for (const surface of ['decisions', 'market_opportunities', 'ai_analysis_runs']) {
    const insertIdx = sql.indexOf(`SELECT '${surface}'`);
    assert.ok(insertIdx !== -1, `${surface}: backup INSERT missing`);
    // the scrubbing UPDATE for this surface must come after its backup
    const updateIdx = sql.indexOf(`UPDATE ${surface}`, insertIdx);
    assert.ok(updateIdx !== -1 && updateIdx > insertIdx, `${surface}: scrub must run after its backup`);
  }
});

test('migration 022: scrubs all three pricing columns on decisions + opportunities', () => {
  for (const tbl of ['decisions', 'market_opportunities']) {
    const start = sql.indexOf(`UPDATE ${tbl}\n  SET`);
    const body = sql.slice(start, start + 220);
    assert.ok(/model_probability = NULL/.test(body), `${tbl}: model_probability not nulled`);
    assert.ok(/implied_probability = NULL/.test(body), `${tbl}: implied_probability not nulled`);
    assert.ok(/edge_percent = NULL/.test(body), `${tbl}: edge_percent not nulled`);
  }
});

test('migration 022: strips the pricing keys from ai_analysis_runs.output_json', () => {
  assert.ok(
    /output_json = \(output_json - 'model_probability' - 'implied_probability' - 'edge_percent'\)/.test(sql),
    'output_json pricing keys must be stripped'
  );
});

test('migration 022: is cutoff-guarded so future verified rows are never scrubbed', () => {
  assert.ok(/v_cutoff timestamptz := '2026-07-07/.test(sql), 'cutoff must be pinned to the gate ship date');
  assert.ok((sql.match(/created_at < v_cutoff/g) ?? []).length >= 6, 'every backup + scrub must be cutoff-guarded');
});

console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
