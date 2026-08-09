#!/usr/bin/env node
/**
 * Static repository contract for Security S2.1 Active Membership Foundation.
 * Runtime locking, ACL and lifecycle behavior is covered by
 * scripts/verify-active-membership-foundation.sh on disposable PostgreSQL 17.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  repoRoot,
  'supabase/migrations/20260809083122_active_membership_foundation.sql',
);
const verifierPath = path.join(repoRoot, 'scripts/verify-active-membership-foundation.sh');
const docPath = path.join(repoRoot, 'docs/active-membership-revocation-s2.md');
const baselinePath = path.join(
  repoRoot,
  'docs/security/supabase-advisor-baseline.v1.json',
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

function normalizedSql(sql) {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

test('migration is review-only, transactional and bounded', () => {
  const sql = readFileSync(migrationPath, 'utf8');
  assert.match(sql, /REVIEW ONLY — do not apply automatically\./);
  assert.equal((sql.match(/^BEGIN;$/gm) ?? []).length, 1);
  assert.equal((sql.match(/^COMMIT;$/gm) ?? []).length, 1);
  assert.match(sql, /SET LOCAL lock_timeout = '5s';/);
  assert.match(sql, /SET LOCAL statement_timeout = '60s';/);
});

test('private membership helper is exact, live and fail-closed', () => {
  const sql = normalizedSql(readFileSync(migrationPath, 'utf8'));
  assert.match(sql, /CREATE SCHEMA IF NOT EXISTS private;/i);
  assert.match(
    sql,
    /REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated, service_role;/i,
  );
  assert.match(sql, /GRANT USAGE ON SCHEMA private TO authenticated, service_role;/i);
  assert.match(
    sql,
    /CREATE FUNCTION private\.is_active_member\(\) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''/i,
  );
  assert.match(sql, /SELECT auth\.uid\(\) AS user_id/i);
  assert.match(sql, /JOIN public\.beta_access AS membership/i);
  assert.match(sql, /caller\.user_id IS NOT NULL AND membership\.status = 'used'/i);
  assert.doesNotMatch(sql, /CREATE FUNCTION public\.is_active_member/i);
});

test('private helper ACL denies PUBLIC and anon and grants only intended roles', () => {
  const sql = normalizedSql(readFileSync(migrationPath, 'utf8'));
  assert.match(
    sql,
    /REVOKE EXECUTE ON FUNCTION private\.is_active_member\(\) FROM PUBLIC, anon, authenticated, service_role;/i,
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION private\.is_active_member\(\) TO authenticated, service_role;/i,
  );
});

test('consume RPC validates Auth identity and locks the invite row', () => {
  const sql = normalizedSql(readFileSync(migrationPath, 'utf8'));
  assert.match(
    sql,
    /CREATE FUNCTION public\.consume_beta_access_invite\( p_user_id uuid, p_email text \) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''/i,
  );
  assert.match(sql, /v_email := lower\(btrim\(p_email\)\)/i);
  assert.match(sql, /FROM auth\.users AS auth_user WHERE auth_user\.id = p_user_id FOR KEY SHARE;/i);
  assert.match(sql, /v_auth_email IS NULL OR v_auth_email <> v_email/i);
  assert.match(sql, /FROM public\.beta_access AS access WHERE access\.email_normalized = v_email FOR UPDATE;/i);
});

test('consume RPC has only fixed outcomes and preserves idempotency', () => {
  const sql = readFileSync(migrationPath, 'utf8');
  const outcomes = [...sql.matchAll(/RETURN '(consumed|already_used|not_eligible)';/g)]
    .map((match) => match[1]);
  assert.deepEqual(new Set(outcomes), new Set(['consumed', 'already_used', 'not_eligible']));
  assert.match(sql, /v_status = 'used'/);
  assert.match(sql, /v_used_by_user_id = p_user_id AND v_used_at IS NOT NULL/);
  assert.match(sql, /v_status NOT IN \('approved', 'invited'\)/);
  assert.match(sql, /WHEN unique_violation THEN\s+RETURN 'not_eligible';/);
});

test('consume RPC is service-only and never reopens a client boundary', () => {
  const sql = normalizedSql(readFileSync(migrationPath, 'utf8'));
  assert.match(
    sql,
    /REVOKE EXECUTE ON FUNCTION public\.consume_beta_access_invite\(uuid, text\) FROM PUBLIC, anon, authenticated, service_role;/i,
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.consume_beta_access_invite\(uuid, text\) TO service_role;/i,
  );
  assert.doesNotMatch(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.consume_beta_access_invite\(uuid, text\) TO[^;]*(?:PUBLIC|anon|authenticated)/i,
  );
});

test('one-user membership uniqueness is additive and existing indexes remain', () => {
  const sql = normalizedSql(readFileSync(migrationPath, 'utf8'));
  assert.match(
    sql,
    /CREATE UNIQUE INDEX beta_access_used_by_user_unique ON public\.beta_access \(used_by_user_id\) WHERE used_by_user_id IS NOT NULL;/i,
  );
  assert.doesNotMatch(sql, /DROP INDEX/i);
  assert.doesNotMatch(sql, /CREATE INDEX (?:IF NOT EXISTS )?idx_beta_access_used_by_user/i);
  assert.doesNotMatch(sql, /CREATE INDEX (?:IF NOT EXISTS )?idx_beta_access_used_by_user_id/i);
});

test('lifecycle CHECK enforces used and pending shapes while retaining revoked history', () => {
  const sql = normalizedSql(readFileSync(migrationPath, 'utf8'));
  assert.match(sql, /ADD CONSTRAINT beta_access_lifecycle_shape_check CHECK/i);
  assert.match(
    sql,
    /status = 'used' AND used_by_user_id IS NOT NULL AND used_at IS NOT NULL/i,
  );
  assert.match(
    sql,
    /status IN \('approved', 'invited'\) AND used_by_user_id IS NULL AND used_at IS NULL/i,
  );
  assert.match(sql, /OR status = 'revoked'/i);
  assert.match(sql, /VALIDATE CONSTRAINT beta_access_lifecycle_shape_check;/i);
  assert.doesNotMatch(sql, /DROP CONSTRAINT beta_access_status_check/i);
});

test('migration contains no beta_access backfill or destructive data operation', () => {
  const sql = normalizedSql(readFileSync(migrationPath, 'utf8'));
  const functionStart = sql.indexOf('CREATE FUNCTION public.consume_beta_access_invite');
  const update = sql.indexOf('UPDATE public.beta_access');
  assert.ok(functionStart !== -1 && update > functionStart, 'the only UPDATE must live inside consume RPC');
  assert.equal((sql.match(/UPDATE public\.beta_access/gi) ?? []).length, 1);
  assert.doesNotMatch(sql, /INSERT INTO public\.beta_access/i);
  assert.doesNotMatch(sql, /DELETE FROM public\.beta_access/i);
  assert.doesNotMatch(sql, /TRUNCATE(?: TABLE)? public\.beta_access/i);
});

test('accepted Advisor baseline remains exactly nine existing findings', () => {
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  assert.deepEqual(baseline.snapshot.securityFindingCounts, {
    '0029_authenticated_security_definer_function_executable': 8,
    '0008_rls_enabled_no_policy': 1,
  });
  assert.equal(baseline.acceptedFindings.length, 9);
  assert.ok(
    !baseline.acceptedFindings.some((finding) =>
      finding.object?.signature?.includes('is_active_member')
      || finding.object?.signature?.includes('consume_beta_access_invite')),
    'S2.1 functions must not be added to the accepted public finding baseline',
  );
});

test('PostgreSQL verifier covers ACL, behavior, uniqueness and both lock orders', () => {
  assert.ok(existsSync(verifierPath));
  const verifier = readFileSync(verifierPath, 'utf8');
  for (const evidence of [
    'PostgreSQL 17 required',
    'active, pending, revoked, missing and unauthenticated membership behavior',
    'service-only consume ACL and private non-API surface',
    'approved and invited consumption plus idempotent repeat',
    'foreign, missing, revoked and email-mismatch rejection',
    'unique membership and lifecycle shape guards',
    'revoke-first concurrency is not overwritten',
    'consume-first concurrency still permits later revoke',
    'Advisor baseline remains eight WARN plus one INFO',
  ]) {
    assert.ok(verifier.includes(evidence), `verifier evidence missing: ${evidence}`);
  }
});

test('execution document records rollout, rollback and enforcement blockers', () => {
  assert.ok(existsSync(docPath));
  const doc = readFileSync(docPath, 'utf8');
  assert.match(doc, /main@eaf14dac9960b3dcfd60929d25f41286f40019ff/);
  assert.match(doc, /S2\.2/);
  assert.match(doc, /S2\.3/);
  assert.match(doc, /two production Auth users require explicit reconciliation/i);
  assert.match(doc, /No production data backfill/i);
  assert.match(doc, /Rollback/i);
});

console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
