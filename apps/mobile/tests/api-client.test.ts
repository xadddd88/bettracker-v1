import assert from 'node:assert/strict';
import test from 'node:test';

import { authenticatedJsonRequest, resolveApiUrl } from '../src/lib/api-client';

const API_BASE = 'https://mobile-api.example.test';

test('API URL accepts HTTPS and loopback, but rejects unsafe bases', () => {
  assert.equal(resolveApiUrl('/api/ai/scanner', API_BASE), `${API_BASE}/api/ai/scanner`);
  assert.equal(resolveApiUrl('/api/ai/scanner', 'http://127.0.0.1:3000'), 'http://127.0.0.1:3000/api/ai/scanner');
  assert.equal(resolveApiUrl('/api/ai/scanner', 'http://localhost:3000'), 'http://localhost:3000/api/ai/scanner');

  for (const base of [
    'http://mobile-api.example.test',
    'ftp://localhost:3000',
    'https://user:pass@mobile-api.example.test',
    'https://mobile-api.example.test/unexpected-path',
    'https://mobile-api.example.test?redirect=evil',
    'not-a-url',
  ]) {
    assert.throws(() => resolveApiUrl('/api/ai/scanner', base), /invalid_api_base/);
  }
});

test('missing mobile session fails before a request', async () => {
  let calls = 0;
  const result = await authenticatedJsonRequest({
    baseUrl: API_BASE,
    body: { image: 'abc' },
    fetchImpl: async () => {
      calls += 1;
      return new Response('{}');
    },
    getAccessToken: async () => null,
    path: '/api/ai/scanner',
  });

  assert.deepEqual(result, {
    ok: false,
    code: 'unauthorized',
    message: 'Your session expired. Sign in again.',
    status: 401,
  });
  assert.equal(calls, 0);
});

test('authenticated request sends the exact JSON once with a Bearer token', async () => {
  const body = { image: 'coupon-base64', media_type: 'image/jpeg' };
  const requests: Array<{ init?: RequestInit; url: string }> = [];
  const result = await authenticatedJsonRequest<{ success: boolean }>({
    baseUrl: API_BASE,
    body,
    fetchImpl: async (url, init) => {
      requests.push({ init, url });
      return Response.json({ success: true });
    },
    getAccessToken: async (refresh) => refresh ? null : 'access-token',
    path: '/api/ai/scanner',
  });

  assert.deepEqual(result, { ok: true, data: { success: true }, status: 200 });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, `${API_BASE}/api/ai/scanner`);
  assert.equal(requests[0].init?.method, 'POST');
  assert.equal(requests[0].init?.body, JSON.stringify(body));
  assert.deepEqual(requests[0].init?.headers, {
    Accept: 'application/json',
    Authorization: 'Bearer access-token',
    'Content-Type': 'application/json',
  });
});

test('401 refreshes once and retries the identical body with the rotated token', async () => {
  const refreshCalls: boolean[] = [];
  const bodies: unknown[] = [];
  const authorizations: string[] = [];
  let requests = 0;
  const body = { immutable: 'request-body' };

  const result = await authenticatedJsonRequest<{ ok: string }>({
    baseUrl: API_BASE,
    body,
    fetchImpl: async (_url, init) => {
      requests += 1;
      bodies.push(init?.body);
      authorizations.push((init?.headers as Record<string, string>).Authorization);
      return requests === 1
        ? new Response('{}', { status: 401 })
        : Response.json({ ok: 'rotated' });
    },
    getAccessToken: async (refresh) => {
      refreshCalls.push(refresh);
      return refresh ? 'new-token' : 'old-token';
    },
    path: '/api/ai/scanner',
  });

  assert.deepEqual(result, { ok: true, data: { ok: 'rotated' }, status: 200 });
  assert.deepEqual(refreshCalls, [false, true]);
  assert.deepEqual(authorizations, ['Bearer old-token', 'Bearer new-token']);
  assert.deepEqual(bodies, [JSON.stringify(body), JSON.stringify(body)]);
});

test('a second 401 stops after the single approved refresh', async () => {
  let requests = 0;
  let refreshes = 0;
  const result = await authenticatedJsonRequest({
    baseUrl: API_BASE,
    body: { image: 'abc' },
    fetchImpl: async () => {
      requests += 1;
      return new Response('{}', { status: 401 });
    },
    getAccessToken: async (refresh) => {
      if (refresh) refreshes += 1;
      return refresh ? 'new-token' : 'old-token';
    },
    path: '/api/ai/scanner',
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'unauthorized');
  assert.equal(requests, 2);
  assert.equal(refreshes, 1);
});

test('rate limits, server timeouts and network failures are never retried', async () => {
  const cases = [
    {
      expected: 'rate_limited',
      response: () => new Response('{}', { status: 429, headers: { 'Retry-After': '37' } }),
    },
    {
      expected: 'timeout',
      response: () => new Response('{}', { status: 504 }),
    },
  ] as const;

  for (const fixture of cases) {
    let requests = 0;
    const result = await authenticatedJsonRequest({
      baseUrl: API_BASE,
      body: { image: 'abc' },
      fetchImpl: async () => {
        requests += 1;
        return fixture.response();
      },
      getAccessToken: async () => 'token',
      path: '/api/ai/scanner',
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, fixture.expected);
    assert.equal(requests, 1);
  }

  let networkRequests = 0;
  const networkResult = await authenticatedJsonRequest({
    baseUrl: API_BASE,
    body: { image: 'abc' },
    fetchImpl: async () => {
      networkRequests += 1;
      throw new Error('raw-network-detail-must-not-escape');
    },
    getAccessToken: async () => 'token',
    path: '/api/ai/scanner',
  });
  assert.deepEqual(networkResult, {
    ok: false,
    code: 'network',
    message: 'Could not reach the scanner. Check your connection.',
    status: null,
  });
  assert.equal(networkRequests, 1);
});

test('generic 500, 502 and 503 server failures are never refreshed or retried', async () => {
  for (const status of [500, 502, 503]) {
    let requests = 0;
    const refreshCalls: boolean[] = [];
    const result = await authenticatedJsonRequest({
      baseUrl: API_BASE,
      body: { image: 'abc' },
      fetchImpl: async () => {
        requests += 1;
        return new Response('RAW_SERVER_DETAIL', { status });
      },
      getAccessToken: async (refresh) => {
        refreshCalls.push(refresh);
        return 'token';
      },
      path: '/api/ai/scanner',
    });

    assert.deepEqual(result, {
      ok: false,
      code: 'server',
      message: 'Scanner is temporarily unavailable.',
      status,
    });
    assert.equal(requests, 1);
    assert.deepEqual(refreshCalls, [false]);
  }
});

test('invalid JSON response is sanitized', async () => {
  const result = await authenticatedJsonRequest({
    baseUrl: API_BASE,
    body: { image: 'abc' },
    fetchImpl: async () => new Response('not-json', { status: 200 }),
    getAccessToken: async () => 'token',
    path: '/api/ai/scanner',
  });

  assert.deepEqual(result, {
    ok: false,
    code: 'invalid_response',
    message: 'Scanner returned an invalid response.',
    status: 200,
  });
});

test('tracked-bet failures keep save-specific copy and fail closed on conflicts', async () => {
  const fixtures = [
    { code: 'conflict', status: 409 },
    { code: 'request_rejected', status: 422 },
    { code: 'rate_limited', status: 429 },
  ] as const;

  for (const fixture of fixtures) {
    let calls = 0;
    const result = await authenticatedJsonRequest({
      baseUrl: API_BASE,
      body: { idempotency_key: 'intent-key' },
      fetchImpl: async () => {
        calls += 1;
        return new Response('{}', { status: fixture.status });
      },
      getAccessToken: async () => 'token',
      operation: 'tracked_bet',
      path: '/api/bets/tracked',
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, fixture.code);
      assert.doesNotMatch(result.message, /scanner/i);
    }
    assert.equal(calls, 1);
  }
});

test('tracked-bet timeout is never retried and tells the user to preserve the intent', async () => {
  const result = await authenticatedJsonRequest({
    baseUrl: API_BASE,
    body: { idempotency_key: 'intent-key' },
    fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    }),
    getAccessToken: async () => 'token',
    operation: 'tracked_bet',
    path: '/api/bets/tracked',
    timeoutMs: 5,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'timeout');
    assert.match(result.message, /same request key/i);
  }
});
