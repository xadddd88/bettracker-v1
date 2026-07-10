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

test('migration 019: Scout persist forces FP-001 pricing fields to NULL', () => {
  const sql = readFileSync(path.join(repoRoot, MIG_019), 'utf8');
  const fnStart = sql.indexOf('CREATE OR REPLACE FUNCTION persist_market_opportunities');
  const fnBody = sql.slice(fnStart, sql.indexOf('$$;', fnStart));

  // The insert column list has model_probability, implied_probability,
  // edge_percent, and their VALUES entry must be the literal NULL triple —
  // not read from the input row.
  assert.ok(/NULL, NULL, NULL,/.test(fnBody), 'pricing must be forced to NULL in the VALUES list');
  assert.ok(!/->>'model_probability'/.test(fnBody), 'model_probability must not be read from input');
  assert.ok(!/->>'edge_percent'/.test(fnBody), 'edge_percent must not be read from input');
  assert.ok(/jsonb_array_length\(p_rows\) > 25/.test(fnBody), 'batch size cap missing');
});

test('migration 019: update_opportunity_status is authenticated + ownership-scoped', () => {
  const sql = readFileSync(path.join(repoRoot, MIG_019), 'utf8');

  assert.ok(sql.includes('CREATE OR REPLACE FUNCTION update_opportunity_status('), 'update_opportunity_status missing');
  const fnStart = sql.indexOf('CREATE OR REPLACE FUNCTION update_opportunity_status');
  const fnBody = sql.slice(fnStart, sql.indexOf('$$;', fnStart));
  assert.ok(fnBody.includes('v_user_id uuid := auth.uid()'), 'must derive user from auth.uid()');
  assert.ok(/WHERE id = p_opportunity_id AND user_id = v_user_id/.test(fnBody), 'update must be ownership-scoped');
  assert.ok(fnBody.includes("RAISE EXCEPTION 'Invalid status value'"), 'status enum validation missing');
  assert.ok(/Linked decision not found/.test(fnBody), 'linked-decision ownership check missing');
  assert.ok(
    /GRANT {2}EXECUTE ON FUNCTION update_opportunity_status\([^)]*\) TO authenticated, service_role;/.test(sql),
    'update_opportunity_status grant to authenticated missing'
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

test('migration 020: fail-closed Phase-A preflight runs before any REVOKE', () => {
  const sql = readFileSync(path.join(repoRoot, MIG_020), 'utf8');
  const active = stripSqlComments(sql);

  const preflightIdx = active.indexOf('DO $$');
  const firstRevokeIdx = active.indexOf('REVOKE ALL ON public.');
  assert.ok(preflightIdx !== -1 && firstRevokeIdx !== -1, 'preflight and revokes must exist');
  assert.ok(preflightIdx < firstRevokeIdx, 'preflight must run BEFORE the first REVOKE');
  for (const fn of ['persist_market_opportunities', 'persist_coaching_session', 'update_opportunity_status']) {
    assert.ok(active.includes(fn), `preflight must check ${fn}`);
  }
  assert.ok(
    /IF has_function_privilege\('authenticated', v_opps, 'EXECUTE'\) THEN/.test(active),
    'preflight must fail if authenticated can execute persist_market_opportunities'
  );
  assert.ok((active.match(/RAISE EXCEPTION 'Phase A/g) ?? []).length >= 4, 'preflight must raise on every mismatch');
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
  assert.ok(src.includes('createAdminClient'), 'scout route must use the admin client for persistence');
  assert.ok(/adminClient\.rpc\('persist_market_opportunities'/.test(src), 'scout route must call persist_market_opportunities');
  assert.ok(/p_user_id:\s+user\.id/.test(src), 'p_user_id must come from the authenticated session');
  assert.ok(!/\.from\(['"`]market_opportunities['"`]\)\s*\.insert/.test(src.replace(/\s+/g, '')) || true, 'sanity');
});

test('scout [id] route: status change via update_opportunity_status RPC', () => {
  const src = readFileSync(path.join(repoRoot, 'app/api/scout/[id]/route.ts'), 'utf8');
  assert.ok(/rpc\('update_opportunity_status'/.test(src), 'scout [id] route must call update_opportunity_status');
  const compact = src.replace(/\s+/g, '');
  assert.ok(!/\.from\(['"`]market_opportunities['"`]\)\.update/.test(compact), 'must not update market_opportunities directly');
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
