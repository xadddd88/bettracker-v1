export type ApiFailureCode =
  | 'configuration'
  | 'conflict'
  | 'invalid_response'
  | 'network'
  | 'rate_limited'
  | 'request_rejected'
  | 'server'
  | 'timeout'
  | 'unauthorized';

export type ApiOperation = 'scanner' | 'tracked_bet';

export type ApiResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; code: ApiFailureCode; message: string; retryAfter?: number; status: number | null };

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type AuthenticatedJsonRequest = {
  baseUrl?: string;
  body: unknown;
  fetchImpl?: FetchLike;
  getAccessToken(refresh: boolean): Promise<string | null>;
  path: `/api/${string}`;
  operation?: ApiOperation;
  timeoutMs?: number;
};

const DEFAULT_API_BASE_URL = 'https://btdk.app';
const DEFAULT_TIMEOUT_MS = 75_000;

function isLoopback(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export function resolveApiUrl(path: `/api/${string}`, configuredBase = process.env.EXPO_PUBLIC_API_BASE_URL): string {
  const base = configuredBase?.trim() || DEFAULT_API_BASE_URL;
  let parsed: URL;

  try {
    parsed = new URL(base);
  } catch {
    throw new Error('invalid_api_base');
  }

  const transportAllowed = parsed.protocol === 'https:'
    || (parsed.protocol === 'http:' && isLoopback(parsed.hostname));
  if (!transportAllowed) {
    throw new Error('invalid_api_base');
  }
  if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('invalid_api_base');
  }

  const target = new URL(path, `${parsed.origin}/`);
  if (target.origin !== parsed.origin || !target.pathname.startsWith('/api/')) {
    throw new Error('invalid_api_path');
  }
  return target.toString();
}

function operationCopy(operation: ApiOperation) {
  return operation === 'tracked_bet'
    ? {
        invalid: 'The saved response was invalid. Check Tracker before retrying.',
        network: 'Could not save the bet. Check your connection and try again.',
        rateLimited: 'Too many save attempts. Wait before trying again.',
        rejected: 'The bet could not be saved. Review the highlighted details.',
        server: 'The bet could not be saved. Retrying the same draft is safe.',
        timeout: 'Saving timed out. Retry the unchanged draft to reuse the same request key.',
      }
    : {
        invalid: 'Scanner returned an invalid response.',
        network: 'Could not reach the scanner. Check your connection.',
        rateLimited: 'Too many scans. Wait a moment and try again.',
        rejected: 'The scanner could not read this image safely.',
        server: 'Scanner is temporarily unavailable.',
        timeout: 'Scanner timed out. Try again once.',
      };
}

function failureForResponse(response: Response, operation: ApiOperation): Exclude<ApiResult<never>, { ok: true }> {
  const copy = operationCopy(operation);
  if (response.status === 401) {
    return { ok: false, code: 'unauthorized', message: 'Your session expired. Sign in again.', status: 401 };
  }
  if (response.status === 429) {
    const retryAfter = Number.parseInt(response.headers.get('Retry-After') ?? '', 10);
    return {
      ok: false,
      code: 'rate_limited',
      message: copy.rateLimited,
      status: 429,
      ...(Number.isFinite(retryAfter) && retryAfter >= 0 ? { retryAfter } : {}),
    };
  }
  if (response.status === 504) {
    return { ok: false, code: 'timeout', message: copy.timeout, status: 504 };
  }
  if (response.status === 409) {
    return {
      ok: false,
      code: 'conflict',
      message: 'This save request conflicts with an earlier attempt. Edit the draft before starting a new intent.',
      status: 409,
    };
  }
  if (response.status === 400 || response.status === 413 || response.status === 422) {
    return { ok: false, code: 'request_rejected', message: copy.rejected, status: response.status };
  }
  return { ok: false, code: 'server', message: copy.server, status: response.status };
}

async function requestOnce(
  url: string,
  token: string,
  serializedBody: string,
  timeoutMs: number,
  fetchImpl: FetchLike,
  operation: ApiOperation,
): Promise<{ response: Response } | { failure: Exclude<ApiResult<never>, { ok: true }> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: serializedBody,
      signal: controller.signal,
    });
    return { response };
  } catch {
    return controller.signal.aborted
      ? { failure: { ok: false, code: 'timeout', message: operationCopy(operation).timeout, status: null } }
      : { failure: { ok: false, code: 'network', message: operationCopy(operation).network, status: null } };
  } finally {
    clearTimeout(timer);
  }
}

export async function authenticatedJsonRequest<T>({
  baseUrl,
  body,
  fetchImpl = fetch,
  getAccessToken,
  operation = 'scanner',
  path,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: AuthenticatedJsonRequest): Promise<ApiResult<T>> {
  let url: string;
  try {
    url = resolveApiUrl(path, baseUrl);
  } catch {
    return { ok: false, code: 'configuration', message: 'Mobile API is not configured.', status: null };
  }

  let token: string | null;
  try {
    token = await getAccessToken(false);
  } catch {
    token = null;
  }
  if (!token) {
    return { ok: false, code: 'unauthorized', message: 'Your session expired. Sign in again.', status: 401 };
  }

  const serializedBody = JSON.stringify(body);
  let attempt = await requestOnce(url, token, serializedBody, timeoutMs, fetchImpl, operation);
  if ('failure' in attempt) return attempt.failure;

  if (attempt.response.status === 401) {
    try {
      token = await getAccessToken(true);
    } catch {
      token = null;
    }
    if (!token) return failureForResponse(attempt.response, operation);
    attempt = await requestOnce(url, token, serializedBody, timeoutMs, fetchImpl, operation);
    if ('failure' in attempt) return attempt.failure;
  }

  const { response } = attempt;
  if (!response.ok) return failureForResponse(response, operation);

  try {
    return { ok: true, data: await response.json() as T, status: response.status };
  } catch {
    return { ok: false, code: 'invalid_response', message: operationCopy(operation).invalid, status: response.status };
  }
}
