export class ReadModelError extends Error {
  constructor(public readonly kind: 'offline' | 'not_found' | 'unauthorized' | 'unknown') {
    super(kind);
  }
}

export function sanitizeReadError(message?: string, code?: string): ReadModelError {
  const normalized = message?.toLowerCase() ?? '';
  if (code === 'PGRST116') return new ReadModelError('not_found');
  if (normalized.includes('jwt') || normalized.includes('unauthorized')) return new ReadModelError('unauthorized');
  if (normalized.includes('fetch') || normalized.includes('network')) return new ReadModelError('offline');
  return new ReadModelError('unknown');
}

export function readErrorMessage(error: unknown): string {
  if (error instanceof ReadModelError) {
    if (error.kind === 'offline') return 'Could not connect. Check your internet connection.';
    if (error.kind === 'not_found') return 'This bet was not found.';
    if (error.kind === 'unauthorized') return 'Your session expired. Sign in again.';
  }
  return 'Could not load your bets. Please try again.';
}
