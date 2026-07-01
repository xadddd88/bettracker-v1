import type { ProviderName } from './types'

export type ProviderErrorKind =
  | 'auth'
  | 'rate_limit'
  | 'network'
  | 'timeout'
  | 'invalid_response'
  | 'not_found'
  | 'unknown'

export class ProviderError extends Error {
  constructor(
    public readonly provider: ProviderName,
    public readonly kind: ProviderErrorKind,
    message: string,
    public readonly httpStatus?: number
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}

// Provider secret hygiene (§11): never log raw request URLs containing
// api_token, never expose a provider token in an error message. Covers
// all three providers' known secret-bearing query param names.
const SECRET_QUERY_PARAMS = ['api_token', 'apikey', 'api_key', 'token', 'key']

export function redactUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl)
    for (const param of SECRET_QUERY_PARAMS) {
      if (url.searchParams.has(param)) {
        url.searchParams.set(param, 'REDACTED')
      }
    }
    return url.toString()
  } catch {
    return '[unparseable_url]'
  }
}

// Adapter errors must be typed and sanitized before propagating (§11) —
// raw provider error bodies are never surfaced verbatim, since they may
// echo back request parameters or tokens.
export function sanitizeProviderError(
  provider: ProviderName,
  kind: ProviderErrorKind,
  httpStatus: number | undefined,
  requestUrl: string
): ProviderError {
  return new ProviderError(
    provider,
    kind,
    `${provider} request failed (${kind})${httpStatus ? ` [${httpStatus}]` : ''}: ${redactUrl(requestUrl)}`,
    httpStatus
  )
}
