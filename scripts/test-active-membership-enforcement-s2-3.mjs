#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationPath = path.join(
  repoRoot,
  'supabase/migrations/20260811160255_active_membership_data_api_rpc_enforcement.sql',
)
const verifierPath = path.join(
  repoRoot,
  'scripts/verify-active-membership-enforcement-s2-3.sh',
)
const disposableDatabaseName = 'bettracker_s23_disposable'
const disposableDatabaseMarkerPrefix = 'bettracker-s2-3-disposable:v1'
const rpcContracts = [
  {
    name: 'adjust_bankroll',
    signature: 'public.adjust_bankroll(text,numeric,text,text)',
    source: 'supabase/migrations/016_atomic_financial_writes.sql',
    bodyMd5: '241736144ffcfed10e2be65b9a787fe0',
    nextStatement: "IF p_type NOT IN ('deposit', 'withdrawal') THEN",
    searchPath: 'public, pg_temp',
  },
  {
    name: 'cancel_pending_bet',
    signature: 'public.cancel_pending_bet(uuid,text)',
    source: 'supabase/migrations/20260721152711_cancel_pending_bet.sql',
    bodyMd5: '7907069229ddcb9d5f9aa12bcc04099f',
    nextStatement: 'IF p_bet_id IS NULL THEN',
    searchPath: "''",
  },
  {
    name: 'complete_onboarding',
    signature: 'public.complete_onboarding()',
    source: 'supabase/migrations/017_prepare_domain_write_boundaries.sql',
    bodyMd5: '2973674ff4aca301166f3df002c5d5e6',
    nextStatement: 'UPDATE profiles SET',
    searchPath: 'public, pg_temp',
  },
  {
    name: 'create_tracked_bet',
    signature: 'public.create_tracked_bet(jsonb,numeric,numeric,text,text,text,text)',
    source: 'supabase/migrations/024_create_tracked_bet.sql',
    bodyMd5: '597bd6196d68e95d5594a674922f7855',
    nextStatement: "IF p_source IS NULL OR p_source NOT IN ('manual', 'scanner') THEN",
    searchPath: "''",
  },
  {
    name: 'save_user_settings',
    signature: 'public.save_user_settings(text,text,numeric,numeric,boolean,text)',
    source: 'supabase/migrations/017_prepare_domain_write_boundaries.sql',
    bodyMd5: '61eddc989fbe721acfa29db7424bbc13',
    rebuildBodyMd5: '4ed804b4e81dbbcc54aa11d8d2b37676',
    nextStatement: 'IF p_display_name IS NULL AND p_currency IS NULL',
    searchPath: 'public, pg_temp',
  },
  {
    name: 'settle_bet',
    signature: 'public.settle_bet(uuid,text)',
    source: 'supabase/migrations/012_settle_bet_fixes.sql',
    bodyMd5: 'ff38892c82edf86a2d73dce445d3e18f',
    rebuildBodyMd5: '003060e1c451a25e044a8dd0403f4b4e',
    nextStatement: "IF p_outcome NOT IN ('won','lost','void') THEN",
    searchPath: 'public, pg_temp',
  },
  {
    name: 'update_decision_action',
    signature: 'public.update_decision_action(uuid,text)',
    source: 'supabase/migrations/017_prepare_domain_write_boundaries.sql',
    bodyMd5: 'e4865f80b8eb638947f9346fea581b56',
    rebuildBodyMd5: '69652473b21b737aa009c43d1de49f21',
    nextStatement: "IF p_final_action NOT IN ('skipped', 'watchlisted', 'pending', 'ignored') THEN",
    searchPath: 'public, pg_temp',
  },
  {
    name: 'update_opportunity_status',
    signature: 'public.update_opportunity_status(uuid,text,uuid)',
    source: 'supabase/migrations/019_prepare_agent_write_boundaries.sql',
    bodyMd5: '04ce1aa4f24ff414e32c183f619d6f85',
    rebuildBodyMd5: '9035a10306204c69a1eaeaed0ef4233e',
    nextStatement: "IF p_status NOT IN ('watchlisted','dismissed','converted_to_decision') THEN",
    searchPath: 'public, pg_temp',
  },
]

const clientTables = [
  'ai_analysis_runs',
  'bankroll_transactions',
  'bankrolls',
  'bet_legs',
  'beta_feedback',
  'bets',
  'canonical_fixtures',
  'coaching_sessions',
  'decisions',
  'global_config',
  'market_catalog',
  'market_opportunities',
  'odds_snapshots',
  'profiles',
  'tennis_series',
  'tennis_series_steps',
]

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractFunctionDefinition(sql, name) {
  const startPattern = new RegExp(
    `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+(?:public\\.)?${escapeRegExp(name)}\\s*\\(`,
    'i',
  )
  const match = startPattern.exec(sql)
  assert(match, `missing function definition for ${name}`)

  const start = match.index
  const headerAndBody = sql.slice(start)
  const bodyMarker = /\bAS\s+(\$[A-Za-z0-9_]*\$)/i.exec(headerAndBody)
  assert(bodyMarker, `missing dollar-quoted body for ${name}`)
  const tag = bodyMarker[1]
  const bodyStart = start + bodyMarker.index + bodyMarker[0].length
  const bodyEnd = sql.indexOf(tag, bodyStart)
  assert(bodyEnd !== -1, `unterminated body for ${name}`)
  const definitionEnd = sql.indexOf(';', bodyEnd + tag.length)
  assert(definitionEnd !== -1, `unterminated definition for ${name}`)

  return {
    definition: sql.slice(start, definitionEnd + 1),
    body: sql.slice(bodyStart, bodyEnd),
  }
}

function stripSqlCommentsAndWhitespace(value) {
  return value
    .replace(/--[^\n\r]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, '')
}

function fnv1a(value) {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

const membershipGuardPattern = /\n\s*IF\s+private\.is_active_member\(\)\s+IS\s+DISTINCT\s+FROM\s+TRUE\s+THEN\s*\n\s*RAISE\s+EXCEPTION\s+'inactive_membership'\s*\n\s*USING\s+ERRCODE\s*=\s*'42501';\s*\n\s*END\s+IF;\s*/i

function emitPredecessorFunctions() {
  const definitions = rpcContracts.map((contract) => {
    let definition = extractFunctionDefinition(read(contract.source), contract.name).definition
    if (contract.searchPath === 'public, pg_temp') {
      definition = definition.replace(
        /SET\s+search_path\s*=\s*public\s+AS\s+/i,
        'SET search_path = public, pg_temp AS ',
      )
    }
    return definition
  })

  process.stdout.write([
    'SET check_function_bodies = off;',
    'SET search_path = public;',
    ...definitions,
    '',
  ].join('\n\n'))
}

function emitMembershipHelper() {
  const helperSql = read('supabase/migrations/20260809083122_active_membership_foundation.sql')
  const start = helperSql.indexOf('CREATE FUNCTION private.is_active_member()')
  assert(start !== -1, 'missing private.is_active_member() definition')
  const marker = '$function$;'
  const end = helperSql.indexOf(marker, start)
  assert(end !== -1, 'unterminated private.is_active_member() definition')
  process.stdout.write(`${helperSql.slice(start, end + marker.length)}\n`)
}

if (process.argv.includes('--emit-predecessor-functions')) {
  emitPredecessorFunctions()
  process.exit(0)
}

if (process.argv.includes('--emit-membership-helper')) {
  emitMembershipHelper()
  process.exit(0)
}

if (process.argv.includes('--emit-predecessor-fingerprints')) {
  const fingerprints = Object.fromEntries(rpcContracts.map((contract) => {
    const body = extractFunctionDefinition(read(contract.source), contract.name).body
    return [contract.signature, fnv1a(stripSqlCommentsAndWhitespace(body))]
  }))
  process.stdout.write(`${JSON.stringify(fingerprints)}\n`)
  process.exit(0)
}

const migration = fs.readFileSync(migrationPath, 'utf8')
const verifier = fs.readFileSync(verifierPath, 'utf8')

assert.match(migration, /^BEGIN;/m)
assert.match(migration, /^COMMIT;/m)
assert.match(migration, /SET LOCAL lock_timeout = '5s';/)
assert.match(migration, /SET LOCAL statement_timeout = '60s';/)
assert.match(migration, /expected exactly eight authenticated public definer RPCs/)
assert.match(migration, /authenticated Data API base relation inventory drift/)
assert.match(migration, /authenticated Data API non-table relation inventory drift/)
assert.match(migration, /has_any_column_privilege\('authenticated', c\.oid, 'SELECT'\)/)
assert.match(migration, /c\.relkind IN \('v', 'm', 'f'\)/)
assert.match(migration, /odds_snapshots_public security-invoker contract drift/)
assert.match(migration, /odds_snapshots_public postflight execution-mode drift/)
assert.match(migration, /AND c\.relrowsecurity/)
assert.match(migration, /pg_get_userbyid\(p\.proowner\) = 'postgres'/)
assert.match(migration, /acl\.grantee NOT IN \(v_authenticated, v_service_role\)/)
assert.match(migration, /acl\.is_grantable/)

const migrationDefinitions = [...migration.matchAll(
  /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.([a-z0-9_]+)\s*\(/gi,
)]
assert.equal(migrationDefinitions.length, 8, 'migration must replace exactly eight RPCs')
assert.deepEqual(
  migrationDefinitions.map((match) => match[1]).sort(),
  rpcContracts.map((contract) => contract.name).sort(),
)

for (const contract of rpcContracts) {
  const predecessor = extractFunctionDefinition(read(contract.source), contract.name)
  const replacement = extractFunctionDefinition(migration, contract.name)
  const guardMatches = replacement.body.match(/private\.is_active_member\(\)/g) ?? []
  assert.equal(guardMatches.length, 1, `${contract.name} must contain one membership assertion`)
  assert.match(replacement.body, membershipGuardPattern, `${contract.name} guard shape drift`)

  const authIndex = replacement.body.indexOf('IF v_user_id IS NULL THEN')
  const guardIndex = replacement.body.indexOf('private.is_active_member()')
  const nextIndex = replacement.body.indexOf(contract.nextStatement)
  assert(authIndex >= 0, `${contract.name} missing original auth guard`)
  assert(guardIndex > authIndex, `${contract.name} membership guard must follow auth guard`)
  assert(nextIndex > guardIndex, `${contract.name} membership guard must precede first operation`)

  const withoutGuard = replacement.body.replace(membershipGuardPattern, '\n')
  assert.equal(
    stripSqlCommentsAndWhitespace(withoutGuard),
    stripSqlCommentsAndWhitespace(predecessor.body),
    `${contract.name} changed logic outside the membership assertion`,
  )

  assert(
    migration.includes(`'${contract.bodyMd5}'`),
    `${contract.name} predecessor body fingerprint missing`,
  )
  if (contract.rebuildBodyMd5) {
    assert(
      migration.includes(`'${contract.rebuildBodyMd5}'`),
      `${contract.name} clean-rebuild body fingerprint missing`,
    )
  }
  const replacementHeader = replacement.definition.slice(0, replacement.definition.indexOf('AS $function$'))
  assert.match(replacementHeader, /SECURITY DEFINER/)
  assert.match(replacementHeader, /VOLATILE/)
  if (contract.searchPath === "''") {
    assert.match(replacementHeader, /SET search_path = ''/)
  } else {
    assert.match(replacementHeader, /SET search_path = public, pg_temp/)
  }
}

const policyPattern = /CREATE POLICY active_membership_required\s+ON public\.([a-z0-9_]+)\s+AS RESTRICTIVE FOR ALL TO authenticated\s+USING \(\(SELECT private\.is_active_member\(\)\)\)\s+WITH CHECK \(\(SELECT private\.is_active_member\(\)\)\);/gi
const policyTables = [...migration.matchAll(policyPattern)].map((match) => match[1])
assert.equal(policyTables.length, 16, 'migration must create exactly 16 restrictive policies')
assert.deepEqual(policyTables.sort(), [...clientTables].sort())
assert.doesNotMatch(
  migration,
  /ON public\.odds_snapshots_public\s+AS RESTRICTIVE/i,
  'the security-invoker view must be gated through odds_snapshots',
)

assert.match(
  migration,
  /REVOKE ALL PRIVILEGES ON FUNCTION[\s\S]*FROM PUBLIC, anon, authenticated, service_role;/,
)
assert.match(
  migration,
  /GRANT EXECUTE ON FUNCTION[\s\S]*TO authenticated, service_role;/,
)
assert.doesNotMatch(migration, /auth\.role\(\)|current_user\s*=|service_role.*bypass/i)
assert.equal((migration.match(/USING ERRCODE = '42501';/g) ?? []).length, 8)

const packageJson = JSON.parse(read('package.json'))
assert.equal(
  packageJson.scripts['test:active-membership-enforcement-s2-3'],
  'node scripts/test-active-membership-enforcement-s2-3.mjs',
)

const workflow = read('.github/workflows/preview-tests.yml')
assert.match(workflow, /npm run test:active-membership-enforcement-s2-3/)
assert.match(workflow, /scripts\/verify-active-membership-enforcement-s2-3\.sh/)
const s23JobStart = workflow.indexOf('  active-membership-database-enforcement:')
const s23JobEnd = workflow.indexOf('\n  design-system:', s23JobStart)
assert.notEqual(s23JobStart, -1)
assert.notEqual(s23JobEnd, -1)
const s23WorkflowJob = workflow.slice(s23JobStart, s23JobEnd)

assert.match(
  verifier,
  /unset PGHOST PGHOSTADDR PGPORT PGDATABASE PGSERVICE PGSERVICEFILE PGSYSCONFDIR/,
)
assert.match(verifier, /--confirm-disposable/)
assert.match(verifier, new RegExp(`EXPECTED_DATABASE_NAME='${disposableDatabaseName}'`))
assert.match(
  verifier,
  new RegExp(`EXPECTED_DATABASE_MARKER_PREFIX='${disposableDatabaseMarkerPrefix}'`),
)
assert.match(verifier, /randomBytes\(16\)\.toString\('hex'\)/)
assert.match(verifier, /shobj_description\(d\.oid, 'pg_database'\)/)
assert.match(verifier, /rolname IN \('anon', 'authenticated', 'service_role'\)/)
assert.match(
  verifier,
  /datname NOT IN \([\s\S]*'postgres',[\s\S]*'template0',[\s\S]*'template1',[\s\S]*'bettracker_s23_disposable'/,
)
assert.match(verifier, /COMMENT ON DATABASE \$EXPECTED_DATABASE_NAME IS '\$RUN_MARKER'/)
assert.match(
  verifier,
  /psql_guarded\(\)[\s\S]*printf 'BEGIN;\\n'[\s\S]*emit_session_guard[\s\S]*\| "\$\{PSQL\[@\]\}"/,
)
assert.match(
  verifier,
  /bootstrap_disposable\(\)[\s\S]*s23_bootstrap_guard[\s\S]*COMMENT ON DATABASE/,
)
assert.match(verifier, /<> '\$RUN_MARKER'/)
assert.match(verifier, /psql_guarded_file "\$MIGRATION"/)
assert.match(verifier, /psql_guarded_file "\$EMERGENCY_STOP"/)
const verifierMain = verifier.slice(verifier.indexOf('node "$STATIC_TEST"'))
assert.doesNotMatch(verifierMain, /"\$\{PSQL\[@\]\}"/)
assert.match(verifier, /GRANT SELECT \(id, user_id\) ON public\.odds_snapshots/)
assert.match(verifier, /GRANT SELECT \(id\) ON public\.unexpected_column_data/)
assert.match(verifier, /CREATE VIEW public\.unexpected_owner_view/)
assert.match(s23WorkflowJob, /POSTGRES_DB: bettracker_s23_disposable/)
assert.doesNotMatch(s23WorkflowJob, /COMMENT ON DATABASE|Attest disposable/)
assert.match(
  s23WorkflowJob,
  /verify-active-membership-enforcement-s2-3\.sh\s+--confirm-disposable/,
)

for (const databaseUrl of [
  `postgresql://test:pw@localhost:5432/${disposableDatabaseName}`,
  `postgresql://test:pw@127.0.0.1:5432/${disposableDatabaseName}`,
  `postgresql://test:pw@[::1]:5432/${disposableDatabaseName}`,
]) {
  const result = spawnSync('bash', [verifierPath, '--check-database-url', databaseUrl], {
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, `loopback verifier URL must pass: ${databaseUrl}`)
}

for (const databaseUrl of [
  `postgresql://test:pw@remote.invalid:5432/${disposableDatabaseName}`,
  `postgresql://test@localhost:5432@remote.invalid:5432/${disposableDatabaseName}`,
  `postgresql://test:pw@localhost:5432/${disposableDatabaseName}?host=remote.invalid`,
  `postgresql://test:pw@localhost:5432/${disposableDatabaseName}?hostaddr=203.0.113.10`,
  `postgresql://test:pw@localhost:5432/${disposableDatabaseName}?service=production`,
  `postgresql://test:pw@localhost:5432/${disposableDatabaseName}?sslmode=disable`,
  'postgresql://test:pw@localhost:5432/postgres',
  'postgresql://test:pw@127.0.0.1:5432/template1',
  'postgresql://test:pw@[::1]:5432/production_tunnel',
]) {
  const result = spawnSync('bash', [verifierPath, '--check-database-url', databaseUrl], {
    encoding: 'utf8',
  })
  assert.notEqual(result.status, 0, `remote-capable verifier URL must be refused: ${databaseUrl}`)
  assert.match(result.stderr, /REFUSED:/)
}

const missingConfirmation = spawnSync(
  'bash',
  [verifierPath, `postgresql://test:pw@localhost:5432/${disposableDatabaseName}`],
  { encoding: 'utf8' },
)
assert.notEqual(missingConfirmation.status, 0)
assert.match(missingConfirmation.stderr, /--confirm-disposable/)

const evidence = read('docs/active-membership-enforcement-s2-3.md')
for (const required of [
  '16 client-readable base tables',
  'eight authenticated',
  'inactive_membership',
  '42501',
  'odds_snapshots_public',
  'No production migration has been applied',
]) {
  assert(evidence.includes(required), `S2.3 evidence missing: ${required}`)
}

const emergencyStop = read('docs/active-membership-enforcement-s2-3-emergency-stop.sql')
assert.match(emergencyStop, /REVOKE EXECUTE ON FUNCTION[\s\S]*FROM authenticated;/)
assert.match(emergencyStop, /refusing emergency stop on widened RPC inventory/)
assert.match(emergencyStop, /refusing emergency stop on policy drift/)
assert.match(emergencyStop, /refusing emergency stop on base relation inventory drift/)
assert.match(emergencyStop, /refusing emergency stop on non-table relation inventory drift/)
assert.match(emergencyStop, /refusing emergency stop on view execution-mode drift/)
assert.match(emergencyStop, /emergency-stop view execution-mode mismatch/)
assert.match(emergencyStop, /AND c\.relrowsecurity/)
assert.match(emergencyStop, /has_any_column_privilege\('authenticated', c\.oid, 'SELECT'\)/)
assert.match(emergencyStop, /exact Data API policies must remain active/)
assert.match(
  emergencyStop,
  /= '\( SELECT private\.is_active_member\(\) AS is_active_member\)'/,
)
assert.match(emergencyStop, /acl\.grantee NOT IN \(v_authenticated, v_service_role\)/)
assert.doesNotMatch(emergencyStop, /DROP POLICY|DROP FUNCTION|GRANT EXECUTE[\s\S]*authenticated/)

console.log('S2.3 static contract: exact tables/views, policies, RPC ACLs and loopback verifier — PASS')
