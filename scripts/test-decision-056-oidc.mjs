import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateKeyPair, SignJWT } from 'jose'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const compiledModulePath = path.join(
  repoRoot,
  'build/provider-smoke/lib/security/github-actions-oidc.js'
)
const compiledLedgerPath = path.join(
  repoRoot,
  'build/provider-smoke/lib/security/decision-056-execution-ledger.js'
)
const routeSourcePath = path.join(
  repoRoot,
  'app/api/admin/sports/enrichment/sportmonks-structural-presence-dry-run/route.ts'
)
const ledgerSourcePath = path.join(repoRoot, 'lib/security/decision-056-execution-ledger.ts')
const workflowPath = path.join(repoRoot, '.github/workflows/decision-056-production.yml')
const migrationName = readdirSync(path.join(repoRoot, 'supabase/migrations')).find((name) =>
  name.endsWith('_decision_056_execution_ledger.sql')
)
assert.ok(migrationName, 'Decision #056 execution-ledger migration is missing')
const migrationPath = path.join(repoRoot, 'supabase/migrations', migrationName)

const {
  DECISION_056_GITHUB_ACTOR,
  DECISION_056_GITHUB_ACTOR_ID,
  DECISION_056_GITHUB_ENVIRONMENT,
  DECISION_056_GITHUB_OIDC_AUDIENCE,
  DECISION_056_GITHUB_OIDC_ISSUER,
  DECISION_056_GITHUB_REPOSITORY,
  DECISION_056_GITHUB_REPOSITORY_ID,
  DECISION_056_GITHUB_REPOSITORY_OWNER,
  DECISION_056_GITHUB_REPOSITORY_OWNER_ID,
  DECISION_056_GITHUB_SUBJECT,
  DECISION_056_GITHUB_WORKFLOW,
  DECISION_056_GITHUB_WORKFLOW_REF,
  DECISION_056_EXECUTION_KEY,
  authorizeDecision056GitHubOidcRequest,
  verifyDecision056GitHubOidcToken,
} = await import(compiledModulePath)
const { claimDecision056Execution } = await import(compiledLedgerPath)

const DEPLOYMENT_SHA = '0123456789abcdef0123456789abcdef01234567'
const NOW_SECONDS = 1_785_254_400
const CURRENT_DATE = new Date(NOW_SECONDS * 1_000)
const { privateKey, publicKey } = await generateKeyPair('RS256')

function approvedClaims(overrides = {}) {
  return {
    iss: DECISION_056_GITHUB_OIDC_ISSUER,
    aud: DECISION_056_GITHUB_OIDC_AUDIENCE,
    sub: DECISION_056_GITHUB_SUBJECT,
    jti: '11111111-2222-3333-4444-555555555555',
    iat: NOW_SECONDS,
    nbf: NOW_SECONDS - 5,
    exp: NOW_SECONDS + 600,
    actor: DECISION_056_GITHUB_ACTOR,
    actor_id: DECISION_056_GITHUB_ACTOR_ID,
    environment: DECISION_056_GITHUB_ENVIRONMENT,
    event_name: 'workflow_dispatch',
    ref: 'refs/heads/main',
    ref_type: 'branch',
    repository: DECISION_056_GITHUB_REPOSITORY,
    repository_id: DECISION_056_GITHUB_REPOSITORY_ID,
    repository_owner: DECISION_056_GITHUB_REPOSITORY_OWNER,
    repository_owner_id: DECISION_056_GITHUB_REPOSITORY_OWNER_ID,
    repository_visibility: 'public',
    run_attempt: '1',
    runner_environment: 'github-hosted',
    sha: DEPLOYMENT_SHA,
    workflow: DECISION_056_GITHUB_WORKFLOW,
    workflow_ref: DECISION_056_GITHUB_WORKFLOW_REF,
    workflow_sha: DEPLOYMENT_SHA,
    ...overrides,
  }
}

async function sign(claims = approvedClaims(), header = {}) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: 'decision-056-test-key', ...header })
    .sign(privateKey)
}

async function verify(token) {
  return verifyDecision056GitHubOidcToken(token, {
    deploymentSha: DEPLOYMENT_SHA,
    currentDate: CURRENT_DATE,
    verificationKey: publicKey,
  })
}

const approved = await verify(await sign())
assert.deepEqual(approved, {
  jti: '11111111-2222-3333-4444-555555555555',
  expiresAt: NOW_SECONDS + 600,
})

const negativeCases = [
  ['issuer', { iss: 'https://attacker.example' }],
  ['audience', { aud: 'urn:btdk:decision-056:preview' }],
  ['subject', { sub: 'repo:xadddd88/bettracker-v1:ref:refs/heads/main' }],
  ['actor', { actor_id: '1' }],
  ['environment', { environment: 'production' }],
  ['event', { event_name: 'push' }],
  ['ref', { ref: 'refs/heads/agent/decision-056-github-oidc' }],
  ['repository', { repository: 'attacker/bettracker-v1' }],
  ['repository id', { repository_id: '1' }],
  ['repository owner id', { repository_owner_id: '1' }],
  ['visibility', { repository_visibility: 'private' }],
  ['rerun', { run_attempt: '2' }],
  ['runner', { runner_environment: 'self-hosted' }],
  ['sha', { sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }],
  ['workflow name', { workflow: 'Attacker workflow' }],
  [
    'workflow ref',
    { workflow_ref: 'xadddd88/bettracker-v1/.github/workflows/other.yml@refs/heads/main' },
  ],
  ['workflow sha', { workflow_sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }],
  ['missing jti', { jti: undefined }],
  ['empty jti', { jti: '' }],
  ['overlong lifetime', { exp: NOW_SECONDS + 601 }],
  [
    'expired',
    {
      iat: NOW_SECONDS - 1_200,
      nbf: NOW_SECONDS - 1_205,
      exp: NOW_SECONDS - 600,
    },
  ],
]

for (const [label, overrides] of negativeCases) {
  await assert.rejects(verify(await sign(approvedClaims(overrides))), undefined, label)
}

await assert.rejects(
  verifyDecision056GitHubOidcToken(await sign(), {
    deploymentSha: 'not-a-commit',
    currentDate: CURRENT_DATE,
    verificationKey: publicKey,
  }),
  undefined,
  'invalid deployment SHA'
)

function headers(token) {
  return new Headers(token ? { authorization: `Bearer ${token}` } : {})
}

const authorizationOptions = {
  deploymentSha: DEPLOYMENT_SHA,
  vercelEnvironment: 'production',
  currentDate: CURRENT_DATE,
  verificationKey: publicKey,
}
assert.deepEqual(await authorizeDecision056GitHubOidcRequest(headers(null), authorizationOptions), {
  ok: false,
  status: 401,
})
assert.deepEqual(
  await authorizeDecision056GitHubOidcRequest(headers(await sign()), {
    ...authorizationOptions,
    vercelEnvironment: 'preview',
  }),
  { ok: false, status: 503 }
)
assert.deepEqual(
  await authorizeDecision056GitHubOidcRequest(headers('not-a-jwt'), authorizationOptions),
  { ok: false, status: 401 }
)

function ledgerClient(result, calls) {
  return {
    from(table) {
      calls.push({ table })
      return {
        async insert(values) {
          calls.at(-1).values = values
          if (result instanceof Error) throw result
          return result
        },
      }
    },
  }
}

const directClaimCalls = []
assert.deepEqual(
  await claimDecision056Execution(
    {
      executionKey: DECISION_056_EXECUTION_KEY,
      jti: 'direct-ledger-jti',
      deploymentSha: DEPLOYMENT_SHA,
    },
    {
      createClient: () => ledgerClient({ error: null }, directClaimCalls),
    }
  ),
  { claimed: true }
)
assert.equal(directClaimCalls.length, 1)
assert.equal(directClaimCalls[0].table, 'decision_056_execution_ledger')
assert.equal(directClaimCalls[0].values.execution_key, DECISION_056_EXECUTION_KEY)
assert.equal(directClaimCalls[0].values.deployment_sha, DEPLOYMENT_SHA)
assert.match(directClaimCalls[0].values.token_jti_sha256, /^[0-9a-f]{64}$/)
assert.notEqual(directClaimCalls[0].values.token_jti_sha256, 'direct-ledger-jti')

for (const [error, expected] of [
  [{ code: '23505' }, { claimed: false, reason: 'already-claimed' }],
  [{ code: '08006' }, { claimed: false, reason: 'unavailable' }],
  [new Error('client unavailable'), { claimed: false, reason: 'unavailable' }],
]) {
  assert.deepEqual(
    await claimDecision056Execution(
      {
        executionKey: DECISION_056_EXECUTION_KEY,
        jti: 'direct-ledger-jti',
        deploymentSha: DEPLOYMENT_SHA,
      },
      {
        createClient: () => ledgerClient({ error }, []),
      }
    ),
    expected
  )
}

let invalidInputClientCreated = false
assert.deepEqual(
  await claimDecision056Execution(
    {
      executionKey: 'decision-056:widened',
      jti: 'direct-ledger-jti',
      deploymentSha: DEPLOYMENT_SHA,
    },
    {
      createClient: () => {
        invalidInputClientCreated = true
        return ledgerClient({ error: null }, [])
      },
    }
  ),
  { claimed: false, reason: 'unavailable' }
)
assert.equal(invalidInputClientCreated, false)

function makeDurableLedger() {
  const calls = []
  let claimed = false

  return {
    calls,
    async claimExecution(input) {
      calls.push(input)
      if (claimed) return { claimed: false, reason: 'already-claimed' }
      claimed = true
      return { claimed: true }
    },
  }
}

const sharedLedger = makeDurableLedger()
const firstDispatchToken = await sign(
  approvedClaims({ jti: 'aaaaaaaa-1111-2222-3333-444444444444' })
)
const secondDispatchToken = await sign(
  approvedClaims({ jti: 'bbbbbbbb-1111-2222-3333-444444444444' })
)
assert.deepEqual(
  await authorizeDecision056GitHubOidcRequest(headers(firstDispatchToken), {
    ...authorizationOptions,
    claimExecution: sharedLedger.claimExecution,
  }),
  { ok: true }
)
assert.deepEqual(
  await authorizeDecision056GitHubOidcRequest(headers(secondDispatchToken), {
    ...authorizationOptions,
    claimExecution: sharedLedger.claimExecution,
  }),
  { ok: false, status: 401 },
  'a new dispatch/JTI must not bypass the immutable Decision #056 execution key'
)
assert.equal(sharedLedger.calls.length, 2)
assert.deepEqual(
  sharedLedger.calls.map(({ executionKey }) => executionKey),
  [DECISION_056_EXECUTION_KEY, DECISION_056_EXECUTION_KEY]
)
assert.deepEqual(
  sharedLedger.calls.map(({ jti }) => jti),
  [
    'aaaaaaaa-1111-2222-3333-444444444444',
    'bbbbbbbb-1111-2222-3333-444444444444',
  ]
)

const unavailableToken = await sign(
  approvedClaims({ jti: 'cccccccc-1111-2222-3333-444444444444' })
)
assert.deepEqual(
  await authorizeDecision056GitHubOidcRequest(headers(unavailableToken), {
    ...authorizationOptions,
    claimExecution: async () => ({ claimed: false, reason: 'unavailable' }),
  }),
  { ok: false, status: 503 },
  'ledger errors must fail closed as unavailable'
)

const replayToken = await sign(
  approvedClaims({ jti: '99999999-8888-7777-6666-555555555555' })
)
const replayLedger = makeDurableLedger()
assert.deepEqual(
  await authorizeDecision056GitHubOidcRequest(headers(replayToken), {
    ...authorizationOptions,
    claimExecution: replayLedger.claimExecution,
  }),
  { ok: true }
)
assert.deepEqual(
  await authorizeDecision056GitHubOidcRequest(headers(replayToken), {
    ...authorizationOptions,
    claimExecution: replayLedger.claimExecution,
  }),
  { ok: false, status: 401 }
)

const routeSource = readFileSync(routeSourcePath, 'utf8')
assert.match(routeSource, /authorizeDecision056GitHubOidcRequest/)
assert.doesNotMatch(routeSource, /SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN/)
assert.doesNotMatch(routeSource, /x-bettracker-sync-token/)
assert.ok(
  routeSource.indexOf('authorizeDecision056GitHubOidcRequest') <
    routeSource.indexOf('req.json()'),
  'durable authorization must be consumed before body parsing'
)

const oidcSource = readFileSync(
  path.join(repoRoot, 'lib/security/github-actions-oidc.ts'),
  'utf8'
)
assert.doesNotMatch(oidcSource, /consumedJtis|new Map/)
assert.match(oidcSource, /claimDecision056Execution/)

const ledgerSource = readFileSync(ledgerSourcePath, 'utf8')
assert.match(ledgerSource, /createAdminClient/)
assert.match(ledgerSource, /decision_056_execution_ledger/)
assert.match(ledgerSource, /createHash\('sha256'\)/)
assert.doesNotMatch(ledgerSource, /\.select\(/)

const migrationSource = readFileSync(migrationPath, 'utf8')
assert.match(migrationSource, /CREATE TABLE public\.decision_056_execution_ledger/)
assert.match(migrationSource, /execution_key\s+text\s+PRIMARY KEY/)
assert.match(migrationSource, /ENABLE ROW LEVEL SECURITY/)
assert.match(
  migrationSource,
  /REVOKE ALL ON TABLE public\.decision_056_execution_ledger\s+FROM PUBLIC, anon, authenticated, service_role/
)
assert.match(
  migrationSource,
  /GRANT INSERT ON TABLE public\.decision_056_execution_ledger TO service_role/
)
assert.doesNotMatch(migrationSource, /GRANT\s+(SELECT|UPDATE|DELETE|ALL)/)

const workflowSource = readFileSync(workflowPath, 'utf8')
assert.match(workflowSource, /^\s*workflow_dispatch:/m)
assert.match(workflowSource, /^\s*id-token: write$/m)
assert.match(workflowSource, /^\s*environment: decision-056-production$/m)
assert.match(workflowSource, /github\.run_attempt == 1/)
assert.match(workflowSource, /\.success == true/)
assert.match(workflowSource, /\.report\.responseStatus == "ok"/)
assert.match(workflowSource, /\.report\.requestCount == 1/)
assert.doesNotMatch(workflowSource, /\.success \| type == "boolean"/)
assert.doesNotMatch(workflowSource, /requestCount == 0/)
assert.doesNotMatch(workflowSource, /^\s*(push|pull_request|schedule):/m)
assert.doesNotMatch(workflowSource, /retry/)

console.log(`Decision #056 OIDC gate: 1 approved token and ${negativeCases.length + 1} negative cases passed`)
