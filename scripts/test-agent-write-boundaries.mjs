#!/usr/bin/env node
/**
 * Agent write boundaries suite (Decision #049).
 *
 * Extends the Decision #048 boundary pattern to the two agent-owned
 * tables the CPO recorded as OPEN:
 *   - market_opportunities (Scout) — its FOR ALL policy was granted to
 *     role PUBLIC; both anon and authenticated held full privileges
 *   - coaching_sessions (Coach) — user-callable INSERT policy
 *
 * Guards:
 *   - migration 019 (additive): server-only Scout/Coach persistence RPCs
 *     (service_role EXECUTE only), authenticated update_opportunity_status,
 *     FP-001 forced-NULL pricing in the Scout persist RPC
 *   - migration 020 (enforcement): both tables SELECT-only for
 *     authenticated (REVOKE ALL incl. PG17 MAINTAIN; anon/PUBLIC lose
 *     everything; FOR SELECT own-rows policies), fail-closed Phase-A
 *     preflight before any REVOKE, no FORCE RLS
 *   - routes: Scout persists via admin client + persist_market_opportunities;
 *     Scout status change via update_opportunity_status; Coach persists via
 *     admin client + persist_coaching_session; no direct writes to either
 *     agent table anywhere in app/
 *   - transactional rollback outside supabase/migrations
 *
 * Run:  npm run test:agent-write-boundaries
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

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

function stripSqlComments(sql) {
  return sql.split('\n').filter((line) => !line.trimStart().startsWith('--')).join('\n');
}

const AGENT_TABLES = ['market_opportunities', 'coaching_sessions'];
const MIG_019 = 'supabase/migrations/019_prepare_agent_write_boundaries.sql';
const MIG_020 = 'supabase/migrations/020_enforce_agent_write_boundaries.sql';

// ── Migration 019 (Phase A) ──────────────────────────────────────────

test('migration 019: Scout/Coach persistence RPCs are service_role only', () => {
  const sql = readFileSync(path.join(repoRoot, MIG_019), 'utf8');

  for (const fn of ['persist_market_opportunities', 'persist_coaching_session']) {
    assert.ok(sql.includes(`CREATE OR REPLACE FUNCTION ${fn}(`), `${fn} missing`);
    assert.ok(
      new RegExp(`REVOKE EXECUTE ON FUNCTION ${fn}\\([^)]*\\) FROM PUBLIC, anon, authenticated;`).test(sql),
      `${fn} must be revoked from PUBLIC/anon/authenticated`
    );
    assert.ok(
      new RegExp(`GRANT {2}EXECUTE ON FUNCTION ${fn}\\([^)]*\\) TO service_role;`).test(sql),
      `${fn} must be granted to service_role only`
    );
    assert.ok(
      !new RegExp(`GRANT {2}EXECUTE ON FUNCTION ${fn}\\([^)]*\\) TO[^;]*authenticated`).test(sql),
      `${fn} must NOT be granted to authenticated`
    );
  }

  assert.ok((sql.match(/SECURITY DEFINER/g) ?? []).length >= 3, 'all three RPCs must be SECURITY DEFINER');
  assert.ok((sql.match(/SET search_path = public/g) ?? []).length >= 3, 'search_path pinning missing');
});

test('migration 019: Scout persist forces FP-001 pricing NULL, structural status, bounded batch', () => {
  const sql = readFileSync(path.join(repoRoot, MIG_019), 'utf8');
  const fnStart = sql.indexOf('CREATE OR REPLACE FUNCTION persist_market_opportunities');
  const fnBody = sql.slice(fnStart, sql.indexOf('$$;', fnStart));

  // Pricing forced NULL, not read from input.
  assert.ok(/NULL, NULL, NULL,/.test(fnBody), 'pricing must be forced to NULL in the VALUES list');
  assert.ok(!/->>'model_probability'/.test(fnBody), 'model_probability must not be read from input');
  assert.ok(!/->>'edge_percent'/.test(fnBody), 'edge_percent must not be read from input');
  // Status structural, not from input (a caller cannot seed 'converted').
  assert.ok(!/COALESCE\(v_row->>'status'/.test(fnBody), 'status must not be read from input');
  assert.ok(/'discovered',\n\s+v_row->>'reasoning'/.test(fnBody), "status must be the literal 'discovered'");
  // NULL-safe + bounded 1..25 batch.
  assert.ok(/p_rows IS NULL OR jsonb_typeof\(p_rows\) <> 'array'/.test(fnBody), 'NULL/array guard missing');
  assert.ok(/jsonb_array_length\(p_rows\) < 1 OR jsonb_array_length\(p_rows\) > 25/.test(fnBody), 'batch must be bounded 1..25');
});

test('migration 019: update_opportunity_status is a locked, ownership-scoped state machine', () => {
  const sql = readFileSync(path.join(repoRoot, MIG_019), 'utf8');

  assert.ok(sql.includes('CREATE OR REPLACE FUNCTION update_opportunity_status('), 'update_opportunity_status missing');
  const fnStart = sql.indexOf('CREATE OR REPLACE FUNCTION update_opportunity_status');
  const fnBody = sql.slice(fnStart, sql.indexOf('$$;', fnStart));

  assert.ok(fnBody.includes('v_user_id       uuid := auth.uid()'), 'must derive user from auth.uid()');
  // Only genuine user actions accepted.
  assert.ok(fnBody.includes("p_status NOT IN ('watchlisted','dismissed','converted_to_decision')"), 'status must be narrowed to user actions');
  // Row lock before evaluating the transition.
  assert.ok(/FROM market_opportunities[\s\S]*?FOR UPDATE;/.test(fnBody), 'must lock the opportunity row FOR UPDATE');
  // Terminal states + idempotent conversion repeat.
  assert.ok(fnBody.includes("RAISE EXCEPTION 'invalid_transition'"), 'terminal-state guard missing');
  assert.ok(/p_linked_decision_id = v_current_link[\s\S]*?RETURN;/.test(fnBody), 'idempotent exact-repeat conversion missing');
  // Conversion requires an owned ai_analyst decision.
  assert.ok(fnBody.includes("RAISE EXCEPTION 'link_required'"), 'link_required guard missing');
  assert.ok(/AND source = 'ai_analyst'/.test(fnBody), 'conversion must require an ai_analyst decision');
  assert.ok(fnBody.includes("RAISE EXCEPTION 'invalid_link'"), 'invalid_link guard missing');
  // Non-conversion statuses forbid a link.
  assert.ok(fnBody.includes("RAISE EXCEPTION 'link_not_allowed'"), 'link_not_allowed guard missing');
  // Link is never carried over via COALESCE (the old bug).
  assert.ok(!/linked_decision_id = COALESCE\(p_linked_decision_id, linked_decision_id\)/.test(fnBody), 'link must not be carried over with COALESCE');
  assert.ok(
    /GRANT {2}EXECUTE ON FUNCTION update_opportunity_status\([^)]*\) TO authenticated, service_role;/.test(sql),
    'update_opportunity_status grant to authenticated missing'
  );
});

test('migration 019: partial unique index prevents two opportunities claiming one decision', () => {
  const sql = readFileSync(path.join(repoRoot, MIG_019), 'utf8');
  assert.ok(
    /CREATE UNIQUE INDEX IF NOT EXISTS uq_market_opp_linked_decision\s+ON market_opportunities \(linked_decision_id\)\s+WHERE linked_decision_id IS NOT NULL;/.test(sql),
    'partial unique index on linked_decision_id missing'
  );
});

// ── Migration 020 (Phase B) ──────────────────────────────────────────

test('migration 020: both agent tables become SELECT-only for authenticated (REVOKE ALL / MAINTAIN)', () => {
  const sql = readFileSync(path.join(repoRoot, MIG_020), 'utf8');

  for (const table of AGENT_TABLES) {
    assert.ok(sql.includes(`REVOKE ALL ON public.${table} FROM PUBLIC;`), `${table}: PUBLIC revoke missing`);
    assert.ok(sql.includes(`REVOKE ALL ON public.${table} FROM anon;`), `${table}: anon revoke missing`);
    assert.ok(sql.includes(`REVOKE ALL ON public.${table} FROM authenticated;`), `${table}: authenticated REVOKE ALL missing`);
    assert.ok(sql.includes(`GRANT SELECT ON public.${table} TO authenticated;`), `${table}: SELECT grant missing`);
    assert.ok(
      new RegExp(`CREATE POLICY "${table} select own" ON public\\.${table}\\s+FOR SELECT TO authenticated`).test(sql),
      `${table}: FOR SELECT policy missing`
    );
  }

  const active = stripSqlComments(sql);
  assert.ok(!/REVOKE INSERT, UPDATE, DELETE/.test(active), 'no enumerated authenticated revoke may remain');
  assert.ok(!active.includes('FORCE ROW LEVEL SECURITY'), 'FORCE RLS must NOT be enabled');
  assert.ok(!/CREATE POLICY[^;]*FOR ALL/.test(active), 'no FOR ALL policy may remain');
  // Every legacy policy name that could exist on these tables must be
  // dropped — in production AND in an environment rebuilt from tracked
  // migrations (004/005). Missing any one leaves a write-permitting
  // policy alive so the table never becomes SELECT-only.
  const requiredDrops = [
    // market_opportunities — tracked 004 name (FOR ALL, role public)
    'DROP POLICY IF EXISTS "Users see own opportunities" ON public.market_opportunities;',
    // coaching_sessions — tracked 005 name (FOR ALL) + production split names
    'DROP POLICY IF EXISTS "Users see own sessions" ON public.coaching_sessions;',
    'DROP POLICY IF EXISTS "coaching_sessions_insert" ON public.coaching_sessions;',
    'DROP POLICY IF EXISTS "coaching_sessions_select" ON public.coaching_sessions;',
  ];
  for (const drop of requiredDrops) {
    assert.ok(sql.includes(drop), `missing required policy drop: ${drop}`);
  }
});

test('migration 020: fail-closed Phase-A preflight checks the full grant matrix + RLS before any REVOKE', () => {
  const sql = readFileSync(path.join(repoRoot, MIG_020), 'utf8');
  const active = stripSqlComments(sql);

  const preflightIdx = active.indexOf('DO $$');
  const firstRevokeIdx = active.indexOf('REVOKE ALL ON public.');
  assert.ok(preflightIdx !== -1 && firstRevokeIdx !== -1, 'preflight and revokes must exist');
  assert.ok(preflightIdx < firstRevokeIdx, 'preflight must run BEFORE the first REVOKE');

  const preflight = active.slice(preflightIdx, firstRevokeIdx);

  // service_role must hold EXECUTE on both persist RPCs.
  assert.ok(/NOT has_function_privilege\('service_role', v_opps, 'EXECUTE'\)/.test(preflight), 'service_role→persist_opps check missing');
  assert.ok(/NOT has_function_privilege\('service_role', v_coach, 'EXECUTE'\)/.test(preflight), 'service_role→persist_coach check missing');
  // authenticated must NOT hold EXECUTE on either persist RPC.
  assert.ok(/has_function_privilege\('authenticated', v_opps, 'EXECUTE'\)/.test(preflight), 'authenticated!→persist_opps check missing');
  assert.ok(/has_function_privilege\('authenticated', v_coach, 'EXECUTE'\)/.test(preflight), 'authenticated!→persist_coach check missing');
  // anon must NOT hold EXECUTE on any of the three.
  assert.ok(/has_function_privilege\('anon', v_opps, 'EXECUTE'\)/.test(preflight), 'anon!→persist_opps check missing');
  assert.ok(/has_function_privilege\('anon', v_coach, 'EXECUTE'\)/.test(preflight), 'anon!→persist_coach check missing');
  assert.ok(/has_function_privilege\('anon', v_status, 'EXECUTE'\)/.test(preflight), 'anon!→update_status check missing');
  // authenticated must hold EXECUTE on the status RPC.
  assert.ok(/NOT has_function_privilege\('authenticated', v_status, 'EXECUTE'\)/.test(preflight), 'authenticated→update_status check missing');
  // RLS must be enabled on both tables before granting SELECT.
  assert.ok(/relrowsecurity FROM pg_class WHERE oid = 'public\.market_opportunities'::regclass/.test(preflight), 'market_opportunities RLS check missing');
  assert.ok(/relrowsecurity FROM pg_class WHERE oid = 'public\.coaching_sessions'::regclass/.test(preflight), 'coaching_sessions RLS check missing');

  assert.ok((preflight.match(/RAISE EXCEPTION/g) ?? []).length >= 11, 'preflight must raise on every mismatch (>=11 checks)');
});

test('rollback script exists outside migrations, is transactional, restores prior state', () => {
  const rollbackPath = path.join(repoRoot, 'docs/decision-049-rollback.sql');
  assert.ok(existsSync(rollbackPath), 'docs/decision-049-rollback.sql missing');
  assert.ok(!existsSync(path.join(repoRoot, 'supabase/migrations/decision-049-rollback.sql')), 'rollback must NOT live in migrations dir');

  const sql = readFileSync(rollbackPath, 'utf8');
  const active = stripSqlComments(sql);
  const beginIdx = active.indexOf('BEGIN;');
  const commitIdx = active.indexOf('COMMIT;');
  assert.ok(beginIdx !== -1 && commitIdx !== -1 && beginIdx < commitIdx, 'rollback must be wrapped in BEGIN/COMMIT');
  for (const table of AGENT_TABLES) {
    assert.ok(sql.includes(`GRANT ALL ON public.${table} TO anon, authenticated;`), `rollback: ${table} grant restore missing`);
  }
  assert.ok(/FOR ALL\s+USING/.test(sql), 'rollback: market_opportunities FOR ALL policy restore missing');
  assert.ok(/coaching_sessions_insert/.test(sql), 'rollback: coaching_sessions INSERT policy restore missing');
});

// ── Route source assertions ──────────────────────────────────────────

test('scout route: persists via admin client + persist_market_opportunities, session user id', () => {
  const src = readFileSync(path.join(repoRoot, 'app/api/scout/route.ts'), 'utf8');
  const compact = src.replace(/\s+/g, '');
  assert.ok(src.includes('createAdminClient'), 'scout route must use the admin client for persistence');
  assert.ok(/adminClient\.rpc\('persist_market_opportunities'/.test(src), 'scout route must call persist_market_opportunities');
  assert.ok(/p_user_id:\s+user\.id/.test(src), 'p_user_id must come from the authenticated session');
  assert.ok(!/\.from\(['"`]market_opportunities['"`]\)\.insert/.test(compact), 'must not insert market_opportunities directly');
});

test('scout [id] route: RPC-only, UUID-validated, sanitized errors, mapped status codes', () => {
  const src = readFileSync(path.join(repoRoot, 'app/api/scout/[id]/route.ts'), 'utf8');
  const compact = src.replace(/\s+/g, '');

  assert.ok(/rpc\('update_opportunity_status'/.test(src), 'must call update_opportunity_status');
  assert.ok(!/\.from\(['"`]market_opportunities['"`]\)\.update/.test(compact), 'must not update market_opportunities directly');
  // Narrowed schema — no system statuses.
  assert.ok(/z\.enum\(\['watchlisted', 'dismissed', 'converted_to_decision'\]\)/.test(src), 'schema must be narrowed to user actions');
  // Path id validated as UUID → 400.
  assert.ok(/z\.string\(\)\.uuid\(\)\.safeParse\(id\)/.test(src), 'path id must be UUID-validated');
  // Error-token mapping.
  assert.ok(/opportunity_not_found[\s\S]*?status: 404/.test(src), 'not-found must map to 404');
  assert.ok(/invalid_transition[\s\S]*?status: 409/.test(src), 'invalid transition must map to 409');
  assert.ok(/link_required\|invalid_link\|link_not_allowed[\s\S]*?status: 400/.test(src), 'bad request tokens must map to 400');
  // Generic catch must not leak err.message.
  assert.ok(!/error:\s*msg\b/.test(src), 'generic catch must not return raw err.message');
  assert.ok(/err instanceof Error \? err\.name/.test(src), 'generic catch must log err.name only');
});

test('coach route: generic catch does not leak raw error messages', () => {
  const src = readFileSync(path.join(repoRoot, 'app/api/coach/route.ts'), 'utf8');
  assert.ok(!/const msg = err instanceof Error \? err\.message/.test(src), 'coach catch must not build a raw error message');
  assert.ok(/\[coach\] unhandled error:'/.test(src) || /\[coach\] unhandled error:/.test(src), 'coach catch must log a sanitized line');
});

test('coach route: persists via admin client + persist_coaching_session, session user id', () => {
  const src = readFileSync(path.join(repoRoot, 'app/api/coach/route.ts'), 'utf8');
  assert.ok(src.includes('createAdminClient'), 'coach route must use the admin client for persistence');
  assert.ok(/adminClient\.rpc\('persist_coaching_session'/.test(src), 'coach route must call persist_coaching_session');
  assert.ok(/p_user_id:\s+user\.id/.test(src), 'p_user_id must come from the authenticated session');
});

test('recursive sweep: no app source writes an agent table directly', () => {
  const offenders = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) {
        const compact = readFileSync(full, 'utf8').replace(/\s+/g, '');
        for (const table of AGENT_TABLES) {
          if (new RegExp(`\\.from\\(['"\`]${table}['"\`]\\)\\.(insert|update|upsert|delete)\\(`).test(compact)) {
            offenders.push(`${path.relative(repoRoot, full)} → ${table}`);
          }
        }
      }
    }
  }
  walk(path.join(repoRoot, 'app'));
  assert.deepEqual(offenders, [], `direct agent-table writes found:\n      ${offenders.join('\n      ')}`);
});

console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
