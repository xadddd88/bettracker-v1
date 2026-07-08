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

  // The timer stays armed until the body is fully consumed — clearing it as
  // soon as headers arrive would leave response.json() free to hang forever.
  try {
    let response: Response
    try {
      // redirect: 'error' — following a cross-origin redirect would re-send
      // provider auth headers (e.g. x-apisports-key) to the redirect target.
      response = await fetch(requestUrl, {
        method: 'GET',
        headers,
        redirect: 'error',
        signal: controller.signal,
      })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw sanitizeProviderError(provider, 'timeout', undefined, requestUrl)
      }
      throw sanitizeProviderError(provider, 'network', undefined, requestUrl)
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
    } catch (err) {
      // An abort mid-body rejects the read — report it as the timeout it is.
      if (err instanceof Error && err.name === 'AbortError') {
        throw sanitizeProviderError(provider, 'timeout', response.status, requestUrl)
      }
      throw sanitizeProviderError(provider, 'invalid_response', response.status, requestUrl)
    }
  } finally {
    clearTimeout(timer)
  }
}
