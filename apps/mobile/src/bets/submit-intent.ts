export type SubmitIntent = {
  fingerprint: string | null;
  key: string | null;
  status: 'ready' | 'in_flight' | 'conflict';
};

export type BeginSubmitResult =
  | { intent: SubmitIntent; key: string; ok: true }
  | { intent: SubmitIntent; ok: false; reason: 'conflict_unchanged' | 'in_flight' };

export function createSubmitIntent(): SubmitIntent {
  return { fingerprint: null, key: null, status: 'ready' };
}

export function fingerprintPayload(payload: unknown): string {
  return JSON.stringify(payload);
}

export function beginSubmit(
  intent: SubmitIntent,
  fingerprint: string,
  generateUuid: () => string,
): BeginSubmitResult {
  if (intent.status === 'in_flight') {
    return { intent, ok: false, reason: 'in_flight' };
  }
  if (intent.status === 'conflict' && intent.fingerprint === fingerprint) {
    return { intent, ok: false, reason: 'conflict_unchanged' };
  }

  const key = intent.status === 'ready'
    && intent.key !== null
    && intent.fingerprint === fingerprint
    ? intent.key
    : generateUuid();

  return {
    intent: { fingerprint, key, status: 'in_flight' },
    key,
    ok: true,
  };
}

export function resolveSubmit(
  intent: SubmitIntent,
  outcome: 'conflict' | 'retryable' | 'success',
): SubmitIntent {
  if (outcome === 'success') return createSubmitIntent();
  return { ...intent, status: outcome === 'conflict' ? 'conflict' : 'ready' };
}
