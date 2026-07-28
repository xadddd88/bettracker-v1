import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateKeyPair, SignJWT } from 'jose'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const compiledModulePath = path.join(
  repoRoot,
  'build/provider-smoke/lib/security/github-actions-oidc.js'
)
const routeSourcePath = path.join(
  repoRoot,
  'app/api/admin/sports/enrichment/sportmonks-structural-presence-dry-run/route.ts'
)
const workflowPath = path.join(repoRoot, '.github/workflows/decision-056-production.yml')

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
  authorizeDecision056GitHubOidcRequest,
  verifyDecision056GitHubOidcToken,
} = await import(compiledModulePath)

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

const replayToken = await sign(
  approvedClaims({ jti: '99999999-8888-7777-6666-555555555555' })
)
assert.deepEqual(
  await authorizeDecision056GitHubOidcRequest(headers(replayToken), authorizationOptions),
  { ok: true }
)
assert.deepEqual(
  await authorizeDecision056GitHubOidcRequest(headers(replayToken), authorizationOptions),
  { ok: false, status: 401 }
)

const routeSource = readFileSync(routeSourcePath, 'utf8')
assert.match(routeSource, /authorizeDecision056GitHubOidcRequest/)
assert.doesNotMatch(routeSource, /SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN/)
assert.doesNotMatch(routeSource, /x-bettracker-sync-token/)

const workflowSource = readFileSync(workflowPath, 'utf8')
assert.match(workflowSource, /^\s*workflow_dispatch:/m)
assert.match(workflowSource, /^\s*id-token: write$/m)
assert.match(workflowSource, /^\s*environment: decision-056-production$/m)
assert.match(workflowSource, /github\.run_attempt == 1/)
assert.doesNotMatch(workflowSource, /^\s*(push|pull_request|schedule):/m)
assert.doesNotMatch(workflowSource, /retry/)

console.log(`Decision #056 OIDC gate: 1 approved token and ${negativeCases.length + 1} negative cases passed`)
