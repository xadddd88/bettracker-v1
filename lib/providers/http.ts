import type { ProviderName } from './types'
import { sanitizeProviderError } from './errors'

const DEFAULT_TIMEOUT_MS = 8000

export interface ProviderRequestOptions {
  headers?: Record<string, string>
  timeoutMs?: number
}

// Server-only: adapters call this from lib/providers/adapters/*, never from
// a client component. Callers must never pass requestUrl to console.log —
// on any failure it goes through sanitizeProviderError()/redactUrl() first,
// and the raw response body is never surfaced (only used to check `.ok`).
export async function providerFetch<T>(
  provider: ProviderName,
  requestUrl: string,
  options: ProviderRequestOptions = {}
): Promise<T> {
  const { headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = options
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetch(requestUrl, { method: 'GET', headers, signal: controller.signal })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw sanitizeProviderError(provider, 'timeout', undefined, requestUrl)
    }
    throw sanitizeProviderError(provider, 'network', undefined, requestUrl)
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    const kind =
      response.status === 401 || response.status === 403
        ? 'auth'
        : response.status === 429
          ? 'rate_limit'
          : response.status === 404
            ? 'not_found'
            : 'invalid_response'
    throw sanitizeProviderError(provider, kind, response.status, requestUrl)
  }

  try {
    return (await response.json()) as T
  } catch {
    throw sanitizeProviderError(provider, 'invalid_response', response.status, requestUrl)
  }
}
