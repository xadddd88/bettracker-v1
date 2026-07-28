import { createHash } from 'node:crypto'
import { createAdminClient } from '../supabase/admin'

export const DECISION_056_EXECUTION_KEY =
  'decision-056:sportmonks-structural-presence-dry-run'

export interface Decision056ExecutionClaimInput {
  executionKey: string
  jti: string
  deploymentSha: string
}

export type Decision056ExecutionClaimResult =
  | { claimed: true }
  | { claimed: false; reason: 'already-claimed' | 'unavailable' }

export type Decision056ExecutionClaimFunction = (
  input: Decision056ExecutionClaimInput
) => Promise<Decision056ExecutionClaimResult>

interface Decision056LedgerClient {
  from(table: string): {
    insert(values: Record<string, string>): PromiseLike<{
      error: unknown
    }>
  }
}

interface Decision056ExecutionClaimOptions {
  createClient?: () => Decision056LedgerClient
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  )
}

export async function claimDecision056Execution(
  { executionKey, jti, deploymentSha }: Decision056ExecutionClaimInput,
  options: Decision056ExecutionClaimOptions = {}
): Promise<Decision056ExecutionClaimResult> {
  if (
    executionKey !== DECISION_056_EXECUTION_KEY ||
    jti.length === 0 ||
    jti.length > 256 ||
    !/^[0-9a-f]{40}$/.test(deploymentSha)
  ) {
    return { claimed: false, reason: 'unavailable' }
  }

  try {
    const adminClient = options.createClient?.() ?? createAdminClient()
    const { error } = await adminClient.from('decision_056_execution_ledger').insert({
      execution_key: executionKey,
      token_jti_sha256: createHash('sha256').update(jti, 'utf8').digest('hex'),
      deployment_sha: deploymentSha,
    })

    if (!error) return { claimed: true }
    if (isDuplicateKeyError(error)) {
      return { claimed: false, reason: 'already-claimed' }
    }
    return { claimed: false, reason: 'unavailable' }
  } catch {
    return { claimed: false, reason: 'unavailable' }
  }
}
