#!/usr/bin/env node
/**
 * Static regression contract for the place_bet_from_decision quarantine.
 *
 * Runtime ACL behavior is covered by
 * scripts/verify-place-bet-from-decision-quarantine.sh on a disposable
 * PostgreSQL 17 database.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  repoRoot,
  'supabase/migrations/20260806154618_quarantine_place_bet_from_decision.sql',
);
const rollbackPath = path.join(
  repoRoot,
  'docs/place-bet-from-decision-quarantine-rollback.sql',
);
const verifierPath = path.join(
  repoRoot,
  'scripts/verify-place-bet-from-decision-quarantine.sh',
);

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅  ${name}`);
    passed++;
  } catch (error) {
    console.error(`  ❌  ${name}`);
    console.error(`      ${error.message}`);
    failed++;
  }
}

function activeSql(sql) {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
}

test('migration is review-only, transactional, bounded and points to rollback', () => {
  const sql = readFileSync(migrationPath, 'utf8');
  assert.match(sql, /REVIEW ONLY — do not apply automatically\./);
  assert.equal((sql.match(/^BEGIN;$/gm) ?? []).length, 1);
  assert.equal((sql.match(/^COMMIT;$/gm) ?? []).length, 1);
  assert.match(sql, /SET LOCAL lock_timeout = '5s';/);
  assert.match(sql, /SET LOCAL statement_timeout = '60s';/);
  assert.match(sql, /docs\/place-bet-from-decision-quarantine-rollback\.sql/);
});

test('migration closes PUBLIC, anon and authenticated while preserving service_role', () => {
  const sql = readFileSync(migrationPath, 'utf8');
  assert.match(
    sql,
    /REVOKE EXECUTE ON FUNCTION public\.place_bet_from_decision\(\s*uuid, uuid, numeric, text, text\s*\)\s*FROM PUBLIC, anon, authenticated;/,
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.place_bet_from_decision\(\s*uuid, uuid, numeric, text, text\s*\)\s*TO service_role;/,
  );
  assert.doesNotMatch(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.place_bet_from_decision\([\s\S]*?TO[^;]*(?:PUBLIC|anon|authenticated)/,
  );
});

test('migration fails closed on signature/config drift and verifies the final ACL', () => {
  const sql = readFileSync(migrationPath, 'utf8');
  const firstRevoke = sql.indexOf('REVOKE EXECUTE ON FUNCTION');
  const preflight = sql.indexOf("to_regprocedure('public.place_bet_from_decision(uuid,uuid,numeric,text,text)')");
  const postcondition = sql.lastIndexOf("has_function_privilege('service_role', v_rpc, 'EXECUTE')");
  assert.ok(preflight !== -1 && preflight < firstRevoke, 'exact-signature preflight must precede REVOKE');
  assert.match(sql, /p\.prosecdef/);
  assert.match(sql, /p\.proconfig @> ARRAY\['search_path=public, pg_temp'\]/);
  assert.ok(postcondition > firstRevoke, 'ACL postcondition must follow the privilege change');
  assert.match(sql, /has_function_privilege\('anon', v_rpc, 'EXECUTE'\)/);
  assert.match(sql, /has_function_privilege\('authenticated', v_rpc, 'EXECUTE'\)/);
  assert.match(sql, /acl\.grantee = 0[\s\S]*acl\.privilege_type = 'EXECUTE'/);
});

test('quarantine changes only the RPC ACL, not function code or financial data', () => {
  const sql = activeSql(readFileSync(migrationPath, 'utf8'));
  assert.doesNotMatch(sql, /\bCREATE(?: OR REPLACE)? FUNCTION\b/i);
  assert.doesNotMatch(sql, /\bALTER FUNCTION\b/i);
  assert.doesNotMatch(sql, /\bDROP\b/i);
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
});

test('manual rollback restores only the prior authenticated boundary', () => {
  assert.ok(existsSync(rollbackPath), 'rollback must exist outside supabase/migrations');
  assert.ok(
    !existsSync(path.join(repoRoot, 'supabase/migrations/place-bet-from-decision-quarantine-rollback.sql')),
    'rollback must not be an auto-applied migration',
  );
  const sql = readFileSync(rollbackPath, 'utf8');
  assert.equal((sql.match(/^BEGIN;$/gm) ?? []).length, 1);
  assert.equal((sql.match(/^COMMIT;$/gm) ?? []).length, 1);
  assert.match(sql, /ROLLBACK REFUSED: quarantine is not active/);
  assert.match(
    sql,
    /REVOKE EXECUTE ON FUNCTION public\.place_bet_from_decision\(\s*uuid, uuid, numeric, text, text\s*\)\s*FROM PUBLIC, anon, authenticated;/,
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.place_bet_from_decision\(\s*uuid, uuid, numeric, text, text\s*\)\s*TO authenticated, service_role;/,
  );
  assert.doesNotMatch(sql, /\b(?:DROP|INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
  assert.doesNotMatch(sql, /\bGRANT\b[\s\S]*?\bTO\s+(?:PUBLIC|anon)\b/i);
});

test('PostgreSQL verifier proves three denied roles and the service_role control', () => {
  const verifier = readFileSync(verifierPath, 'utf8');
  assert.match(verifier, /PostgreSQL 17 required/);
  for (const role of ['quarantine_public_probe', 'anon', 'authenticated']) {
    assert.ok(verifier.includes(`expect_denied ${role}`), `${role} behavioral denial missing`);
  }
  assert.match(verifier, /SET ROLE service_role;[\s\S]*server-only-ok/);
  assert.match(verifier, /apply reviewed rollback to disposable database/);
  assert.match(verifier, /re-apply quarantine after rollback/);
});

test('Decision UI and Analyst UI still contain no direct RPC caller', () => {
  const decisionActions = readFileSync(
    path.join(repoRoot, 'app/(app)/decisions/[id]/DecisionActions.tsx'),
    'utf8',
  );
  const analyst = readFileSync(path.join(repoRoot, 'app/(app)/ai/page.tsx'), 'utf8');
  assert.doesNotMatch(decisionActions, /place_bet_from_decision/);
  assert.doesNotMatch(analyst, /place_bet_from_decision/);
});

console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
