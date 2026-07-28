import {
  createRemoteJWKSet,
  jwtVerify,
  type KeyLike,
  type JWTPayload,
  type JWTVerifyOptions,
} from 'jose'

export const DECISION_056_GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com'
export const DECISION_056_GITHUB_OIDC_AUDIENCE = 'urn:btdk:decision-056:production'
export const DECISION_056_GITHUB_ENVIRONMENT = 'decision-056-production'
export const DECISION_056_GITHUB_REPOSITORY = 'xadddd88/bettracker-v1'
export const DECISION_056_GITHUB_REPOSITORY_ID = '1280991721'
export const DECISION_056_GITHUB_REPOSITORY_OWNER = 'xadddd88'
export const DECISION_056_GITHUB_REPOSITORY_OWNER_ID = '295055646'
export const DECISION_056_GITHUB_ACTOR = 'xadddd88'
export const DECISION_056_GITHUB_ACTOR_ID = '295055646'
export const DECISION_056_GITHUB_WORKFLOW = 'Decision 056 Production Dry Run'
export const DECISION_056_GITHUB_WORKFLOW_REF =
  'xadddd88/bettracker-v1/.github/workflows/decision-056-production.yml@refs/heads/main'
export const DECISION_056_GITHUB_SUBJECT =
  'repo:xadddd88/bettracker-v1:environment:decision-056-production'

const GITHUB_ACTIONS_JWKS_URL = new URL(
  'https://token.actions.githubusercontent.com/.well-known/jwks'
)
const CLOCK_TOLERANCE_SECONDS = 30
const MAX_TOKEN_LIFETIME_SECONDS = 10 * 60
const MAX_JTI_LENGTH = 256
const MAX_REPLAY_CACHE_ENTRIES = 1_024
const SHA_PATTERN = /^[0-9a-f]{40}$/

const githubActionsJwks = createRemoteJWKSet(GITHUB_ACTIONS_JWKS_URL, {
  timeoutDuration: 5_000,
  cooldownDuration: 30_000,
  cacheMaxAge: 10 * 60 * 1_000,
})

type VerificationKey = KeyLike | Uint8Array

interface GitHubActionsOidcPayload extends JWTPayload {
  actor?: unknown
  actor_id?: unknown
  environment?: unknown
  event_name?: unknown
  ref?: unknown
  ref_type?: unknown
  repository?: unknown
  repository_id?: unknown
  repository_owner?: unknown
  repository_owner_id?: unknown
  repository_visibility?: unknown
  run_attempt?: unknown
  runner_environment?: unknown
  sha?: unknown
  workflow?: unknown
  workflow_ref?: unknown
  workflow_sha?: unknown
}

export interface Decision056OidcVerificationOptions {
  deploymentSha: string
  currentDate?: Date
  verificationKey?: VerificationKey
}

export interface Decision056OidcAuthorizationOptions {
  deploymentSha?: string
  vercelEnvironment?: string
  currentDate?: Date
  verificationKey?: VerificationKey
}

export type Decision056OidcAuthorizationResult =
  | { ok: true }
  | { ok: false; status: 401 | 503 }

const consumedJtis = new Map<string, number>()

function claimEquals(value: unknown, expected: string): boolean {
  return typeof value === 'string' && value === expected
}

function runAttemptIsOne(value: unknown): boolean {
  return value === '1' || value === 1
}

function pruneReplayCache(nowSeconds: number): void {
  for (const [jti, expiresAt] of consumedJtis) {
    if (expiresAt + CLOCK_TOLERANCE_SECONDS < nowSeconds) consumedJtis.delete(jti)
  }

  while (consumedJtis.size > MAX_REPLAY_CACHE_ENTRIES) {
    const oldest = consumedJtis.keys().next().value
    if (typeof oldest !== 'string') break
    consumedJtis.delete(oldest)
  }
}

function consumeJti(jti: string, expiresAt: number, nowSeconds: number): boolean {
  pruneReplayCache(nowSeconds)
  if (consumedJtis.has(jti)) return false
  consumedJtis.set(jti, expiresAt)
  return true
}

function bearerToken(headers: Pick<Headers, 'get'>): string | null {
  const authorization = headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return null
  const token = authorization.slice('Bearer '.length).trim()
  return token || null
}

export async function verifyDecision056GitHubOidcToken(
  token: string,
  options: Decision056OidcVerificationOptions
): Promise<{ jti: string; expiresAt: number }> {
  if (!SHA_PATTERN.test(options.deploymentSha)) {
    throw new Error('Decision #056 deployment SHA is invalid')
  }

  const verifyOptions: JWTVerifyOptions = {
      algorithms: ['RS256'],
      issuer: DECISION_056_GITHUB_OIDC_ISSUER,
      audience: DECISION_056_GITHUB_OIDC_AUDIENCE,
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
      maxTokenAge: MAX_TOKEN_LIFETIME_SECONDS,
      currentDate: options.currentDate,
      requiredClaims: [
        'sub',
        'jti',
        'iat',
        'nbf',
        'exp',
        'actor',
        'actor_id',
        'environment',
        'event_name',
        'ref',
        'ref_type',
        'repository',
        'repository_id',
        'repository_owner',
        'repository_owner_id',
        'repository_visibility',
        'run_attempt',
        'runner_environment',
        'sha',
        'workflow',
        'workflow_ref',
        'workflow_sha',
      ],
    }

  const { payload, protectedHeader } = options.verificationKey
    ? await jwtVerify<GitHubActionsOidcPayload>(
        token,
        options.verificationKey,
        verifyOptions
      )
    : await jwtVerify<GitHubActionsOidcPayload>(token, githubActionsJwks, verifyOptions)

  if (
    protectedHeader.alg !== 'RS256' ||
    protectedHeader.typ !== 'JWT' ||
    typeof protectedHeader.kid !== 'string' ||
    protectedHeader.kid.length === 0 ||
    protectedHeader.kid.length > 256
  ) {
    throw new Error('Decision #056 OIDC header is invalid')
  }

  const exactClaims =
    claimEquals(payload.sub, DECISION_056_GITHUB_SUBJECT) &&
    claimEquals(payload.actor, DECISION_056_GITHUB_ACTOR) &&
    claimEquals(payload.actor_id, DECISION_056_GITHUB_ACTOR_ID) &&
    claimEquals(payload.environment, DECISION_056_GITHUB_ENVIRONMENT) &&
    claimEquals(payload.event_name, 'workflow_dispatch') &&
    claimEquals(payload.ref, 'refs/heads/main') &&
    claimEquals(payload.ref_type, 'branch') &&
    claimEquals(payload.repository, DECISION_056_GITHUB_REPOSITORY) &&
    claimEquals(payload.repository_id, DECISION_056_GITHUB_REPOSITORY_ID) &&
    claimEquals(payload.repository_owner, DECISION_056_GITHUB_REPOSITORY_OWNER) &&
    claimEquals(payload.repository_owner_id, DECISION_056_GITHUB_REPOSITORY_OWNER_ID) &&
    claimEquals(payload.repository_visibility, 'public') &&
    runAttemptIsOne(payload.run_attempt) &&
    claimEquals(payload.runner_environment, 'github-hosted') &&
    claimEquals(payload.sha, options.deploymentSha) &&
    claimEquals(payload.workflow, DECISION_056_GITHUB_WORKFLOW) &&
    claimEquals(payload.workflow_ref, DECISION_056_GITHUB_WORKFLOW_REF) &&
    claimEquals(payload.workflow_sha, options.deploymentSha)

  if (!exactClaims) throw new Error('Decision #056 OIDC claims are invalid')

  if (
    typeof payload.iat !== 'number' ||
    typeof payload.nbf !== 'number' ||
    typeof payload.exp !== 'number' ||
    payload.exp <= payload.iat ||
    payload.exp - payload.iat > MAX_TOKEN_LIFETIME_SECONDS
  ) {
    throw new Error('Decision #056 OIDC lifetime is invalid')
  }

  if (
    typeof payload.jti !== 'string' ||
    payload.jti.length === 0 ||
    payload.jti.length > MAX_JTI_LENGTH
  ) {
    throw new Error('Decision #056 OIDC jti is invalid')
  }

  return { jti: payload.jti, expiresAt: payload.exp }
}

export async function authorizeDecision056GitHubOidcRequest(
  headers: Pick<Headers, 'get'>,
  options: Decision056OidcAuthorizationOptions = {}
): Promise<Decision056OidcAuthorizationResult> {
  const deploymentSha = options.deploymentSha ?? process.env.VERCEL_GIT_COMMIT_SHA
  const vercelEnvironment = options.vercelEnvironment ?? process.env.VERCEL_ENV
  if (vercelEnvironment !== 'production' || !deploymentSha || !SHA_PATTERN.test(deploymentSha)) {
    return { ok: false, status: 503 }
  }

  const token = bearerToken(headers)
  if (!token) return { ok: false, status: 401 }

  try {
    const verified = await verifyDecision056GitHubOidcToken(token, {
      deploymentSha,
      currentDate: options.currentDate,
      verificationKey: options.verificationKey,
    })
    const nowSeconds = Math.floor((options.currentDate?.getTime() ?? Date.now()) / 1_000)
    if (!consumeJti(verified.jti, verified.expiresAt, nowSeconds)) {
      return { ok: false, status: 401 }
    }
    return { ok: true }
  } catch {
    return { ok: false, status: 401 }
  }
}
