#!/usr/bin/env node
/**
 * Static repository contract for the accepted Supabase Advisor security
 * baseline. Runtime catalog behavior is covered by
 * scripts/verify-supabase-advisor-baseline.sh on disposable PostgreSQL 17.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = path.join(
  repoRoot,
  'docs/security/supabase-advisor-baseline.v1.json',
);
const docPath = path.join(repoRoot, 'docs/supabase-advisor-security-baseline-s1.md');
const verifierPath = path.join(repoRoot, 'scripts/verify-supabase-advisor-baseline.sh');
const migrationsDir = path.join(repoRoot, 'supabase/migrations');

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort();
const migrations = migrationFiles.map((name) => ({
  name,
  sql: readFileSync(path.join(migrationsDir, name), 'utf8'),
}));

const expectedRpcs = [
  {
    signature: 'public.adjust_bankroll(text,numeric,text,text)',
    identityArguments: 'p_type text, p_amount numeric, p_note text, p_idempotency_key text',
    searchPath: 'public, pg_temp',
  },
  {
    signature: 'public.cancel_pending_bet(uuid,text)',
    identityArguments: 'p_bet_id uuid, p_idempotency_key text',
    searchPath: '',
  },
  {
    signature: 'public.complete_onboarding()',
    identityArguments: '',
    searchPath: 'public, pg_temp',
  },
  {
    signature: 'public.create_tracked_bet(jsonb,numeric,numeric,text,text,text,text)',
    identityArguments: 'p_legs jsonb, p_total_odds numeric, p_stake numeric, p_bookmaker text, p_notes text, p_source text, p_idempotency_key text',
    searchPath: '',
  },
  {
    signature: 'public.save_user_settings(text,text,numeric,numeric,boolean,text)',
    identityArguments: 'p_display_name text, p_currency text, p_default_stake numeric, p_kelly_fraction numeric, p_web_search_enabled boolean, p_timezone text',
    searchPath: 'public, pg_temp',
  },
  {
    signature: 'public.settle_bet(uuid,text)',
    identityArguments: 'p_bet_id uuid, p_outcome text',
    searchPath: 'public, pg_temp',
  },
  {
    signature: 'public.update_decision_action(uuid,text)',
    identityArguments: 'p_decision_id uuid, p_final_action text',
    searchPath: 'public, pg_temp',
  },
  {
    signature: 'public.update_opportunity_status(uuid,text,uuid)',
    identityArguments: 'p_opportunity_id uuid, p_status text, p_linked_decision_id uuid',
    searchPath: 'public, pg_temp',
  },
];

const expectedLedger = {
  lintId: '0008_rls_enabled_no_policy',
  cacheKey: 'rls_enabled_no_policy_public_decision_056_execution_ledger',
  name: 'public.decision_056_execution_ledger',
};

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

function rpcName(signature) {
  return signature.slice('public.'.length, signature.indexOf('('));
}

function advisorCacheKey(rpc) {
  return [
    'authenticated_security_definer_function_executable',
    'public',
    rpcName(rpc.signature),
    rpc.identityArguments,
  ].join('_');
}

function normalizedSql(sql) {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function migrationEvents() {
  const events = [];
  const eventPattern = /(GRANT|REVOKE)\s+EXECUTE\s+ON\s+FUNCTION\s+([\s\S]*?)\s+(TO|FROM)\s+([^;]+);/gi;

  for (const migration of migrations) {
    const sql = normalizedSql(migration.sql);
    let match;
    while ((match = eventPattern.exec(sql)) !== null) {
      const target = match[2].trim();
      const nameMatch = target.match(/^(?:public\.)?([a-z_][a-z0-9_]*)\s*(?:\(|$)/i);
      assert.ok(nameMatch, `cannot parse function target in ${migration.name}: ${target}`);
      events.push({
        migration: migration.name,
        action: match[1].toUpperCase(),
        name: nameMatch[1],
        roles: match[4]
          .split(',')
          .map((role) => role.trim().toLowerCase()),
      });
    }
  }
  return events;
}

test('baseline schema, provenance and exact finding counts are fixed', () => {
  assert.equal(baseline.schemaVersion, 1);
  assert.equal(baseline.baselineId, 'bettracker-supabase-advisor-security-s1');
  assert.equal(baseline.status, 'accepted-intentional-findings');
  assert.equal(
    baseline.repository.baseCommit,
    '24c80c384df7a5a48f9e91d88db0a2810b67a65b',
  );
  assert.deepEqual(baseline.snapshot.securityFindingCounts, {
    '0029_authenticated_security_definer_function_executable': 8,
    '0008_rls_enabled_no_policy': 1,
  });
  assert.equal(baseline.acceptedFindings.length, 9);
});

test('eight exact RPC signatures and identity arguments are allowlisted once', () => {
  const rpcs = baseline.acceptedFindings
    .filter((finding) => finding.lintId.startsWith('0029_'))
    .map((finding) => ({
      signature: finding.object.signature,
      identityArguments: finding.object.identityArguments,
      searchPath: finding.object.searchPath,
    }));
  assert.deepEqual(rpcs, expectedRpcs);
  assert.equal(new Set(rpcs.map((rpc) => rpc.signature)).size, 8);
});

test('all nine Advisor cache keys are exact and unique', () => {
  const findings = baseline.acceptedFindings;
  const cacheKeys = findings.map((finding) => finding.cacheKey);
  assert.equal(new Set(cacheKeys).size, 9);

  const rpcKeys = findings
    .filter((finding) => finding.lintId.startsWith('0029_'))
    .map((finding) => finding.cacheKey);
  assert.deepEqual(rpcKeys, expectedRpcs.map(advisorCacheKey));

  const ledger = findings.find((finding) => finding.lintId === expectedLedger.lintId);
  assert.equal(ledger.cacheKey, expectedLedger.cacheKey);

  const verifier = readFileSync(verifierPath, 'utf8');
  for (const cacheKey of cacheKeys) {
    assert.ok(verifier.includes(cacheKey), `PostgreSQL verifier missing cache_key: ${cacheKey}`);
  }
});

test('RPC owner, SECURITY DEFINER, ACL and search_path expectations are exact', () => {
  const rpcs = baseline.acceptedFindings.filter((finding) => finding.object.kind === 'function');
  for (const finding of rpcs) {
    assert.equal(finding.level, 'WARN');
    assert.equal(finding.object.owner, 'postgres');
    assert.equal(finding.object.securityDefiner, true);
    assert.deepEqual(
      finding.object.explicitExecuteGrantees,
      ['postgres', 'authenticated', 'service_role'],
    );
    assert.deepEqual(finding.object.deniedExecuteRoles, ['PUBLIC', 'anon']);
    assert.ok(['', 'public, pg_temp'].includes(finding.object.searchPath));
  }
});

test('each accepted RPC has definition, grant and search_path migration evidence', () => {
  const migrationSql = normalizedSql(migrations.map(({ sql }) => sql).join('\n'));
  const migration031 = normalizedSql(
    readFileSync(path.join(migrationsDir, '031_public_api_privilege_hardening.sql'), 'utf8'),
  );

  for (const rpc of expectedRpcs) {
    const name = rpcName(rpc.signature);
    assert.match(
      migrationSql,
      new RegExp(`CREATE OR REPLACE FUNCTION (?:public\\.)?${name}\\s*\\(`, 'i'),
      `${rpc.signature} definition evidence missing`,
    );
    assert.match(
      migrationSql,
      new RegExp(`GRANT EXECUTE ON FUNCTION (?:public\\.)?${name}(?:\\s*\\(|\\s+TO)`, 'i'),
      `${rpc.signature} authenticated grant evidence missing`,
    );

    if (rpc.searchPath === '') {
      const definitionStart = migrationSql.indexOf(`FUNCTION public.${name}(`) !== -1
        ? migrationSql.indexOf(`FUNCTION public.${name}(`)
        : migrationSql.indexOf(`FUNCTION ${name}(`);
      const definitionWindow = migrationSql.slice(definitionStart, definitionStart + 700);
      assert.match(definitionWindow, /SET search_path = ''/i, `${rpc.signature} empty search_path missing`);
    } else {
      assert.match(
        migration031,
        new RegExp(
          `ALTER FUNCTION public\\.${name}\\s*\\([^)]*\\) SET search_path = public, pg_temp;`,
          'i',
        ),
        `${rpc.signature} hardened search_path evidence missing`,
      );
    }
  }
});

test('unknown authenticated function grants are rejected and accepted RPCs remain open', () => {
  const accepted = new Set(expectedRpcs.map((rpc) => rpcName(rpc.signature)));
  const retired = new Set([
    'create_decision_with_analysis',
    'create_quick_bet',
    'place_bet_from_decision',
    'set_user_currency',
  ]);
  const state = new Map();

  const allSql = normalizedSql(migrations.map(({ sql }) => sql).join('\n'));
  assert.doesNotMatch(
    allSql,
    /GRANT\s+EXECUTE\s+ON\s+ALL\s+FUNCTIONS[\s\S]*?TO[\s\S]*?authenticated/i,
  );

  for (const event of migrationEvents()) {
    if (!event.roles.includes('authenticated')) continue;
    if (event.action === 'GRANT') {
      assert.ok(
        accepted.has(event.name) || retired.has(event.name),
        `unknown authenticated RPC grant in ${event.migration}: ${event.name}`,
      );
    }
    if (accepted.has(event.name) || retired.has(event.name)) {
      state.set(event.name, event.action === 'GRANT');
    }
  }

  for (const name of accepted) {
    assert.equal(state.get(name), true, `${name} must remain authenticated-callable`);
  }
  for (const name of retired) {
    assert.equal(state.get(name), false, `${name} must remain closed to authenticated`);
  }
});

test('place_bet_from_decision remains a service-only negative control', () => {
  const serviceOnly = baseline.requiredServiceOnlyRpc;
  assert.equal(
    serviceOnly.signature,
    'public.place_bet_from_decision(uuid,uuid,numeric,text,text)',
  );
  assert.deepEqual(serviceOnly.explicitExecuteGrantees, ['postgres', 'service_role']);
  assert.deepEqual(serviceOnly.deniedExecuteRoles, ['PUBLIC', 'anon', 'authenticated']);
  assert.ok(
    !expectedRpcs.some((rpc) => rpc.signature === serviceOnly.signature),
    'quarantined RPC must not enter accepted allowlist',
  );

  const quarantine = normalizedSql(
    readFileSync(
      path.join(migrationsDir, '20260806154618_quarantine_place_bet_from_decision.sql'),
      'utf8',
    ),
  );
  assert.match(
    quarantine,
    /REVOKE EXECUTE ON FUNCTION public\.place_bet_from_decision\( uuid, uuid, numeric, text, text \) FROM PUBLIC, anon, authenticated;/i,
  );
  assert.match(
    quarantine,
    /GRANT EXECUTE ON FUNCTION public\.place_bet_from_decision\( uuid, uuid, numeric, text, text \) TO service_role;/i,
  );
});

test('ledger finding records the exact fail-closed table contract', () => {
  const ledger = baseline.acceptedFindings.find(
    (finding) => finding.lintId === expectedLedger.lintId,
  );
  assert.equal(ledger.level, 'INFO');
  assert.equal(ledger.object.name, expectedLedger.name);
  assert.equal(ledger.object.owner, 'postgres');
  assert.equal(ledger.object.rlsEnabled, true);
  assert.equal(ledger.object.policyCount, 0);
  assert.deepEqual(ledger.object.clientTablePrivileges, []);
  assert.deepEqual(ledger.object.serviceRoleTablePrivileges, ['INSERT']);

  const sql = normalizedSql(
    readFileSync(
      path.join(migrationsDir, '20260728162034_decision_056_execution_ledger.sql'),
      'utf8',
    ),
  );
  assert.match(sql, /ALTER TABLE public\.decision_056_execution_ledger ENABLE ROW LEVEL SECURITY;/i);
  assert.match(sql, /REVOKE ALL ON TABLE public\.decision_056_execution_ledger FROM PUBLIC, anon, authenticated, service_role;/i);
  assert.match(sql, /GRANT INSERT ON TABLE public\.decision_056_execution_ledger TO service_role;/i);
  assert.doesNotMatch(sql, /CREATE POLICY/i);
});

test('all manifest evidence files, documentation and PostgreSQL verifier exist', () => {
  assert.ok(existsSync(docPath));
  assert.ok(existsSync(verifierPath));
  for (const finding of baseline.acceptedFindings) {
    for (const evidence of finding.sourceEvidence) {
      assert.ok(existsSync(path.join(repoRoot, evidence)), `missing evidence: ${evidence}`);
    }
  }
  for (const evidence of baseline.requiredServiceOnlyRpc.sourceEvidence) {
    assert.ok(existsSync(path.join(repoRoot, evidence)), `missing evidence: ${evidence}`);
  }
});

console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
