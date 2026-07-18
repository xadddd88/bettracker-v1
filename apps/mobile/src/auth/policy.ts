import type { AppStateStatus } from 'react-native';

export function shouldRefreshForAppState(nextState: AppStateStatus) {
  return nextState === 'active';
}

export function sanitizeAuthError(message?: string): string {
  const normalized = message?.toLowerCase() ?? '';
  if (normalized.includes('invalid login credentials')) return 'Email or password is incorrect.';
  if (normalized.includes('email not confirmed')) return 'Confirm your email before signing in.';
  if (normalized.includes('network') || normalized.includes('fetch')) {
    return 'Could not connect. Check your internet connection and try again.';
  }
  return 'Sign in failed. Please try again.';
}
