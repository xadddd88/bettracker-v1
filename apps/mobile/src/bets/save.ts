import { getSupabase } from '@/lib/supabase';
import { authenticatedJsonRequest } from '@/lib/api-client';
import type { TrackerDraftPayload } from '@/bets/draft';

export type SaveTrackedBetResult =
  | { betId: string; ok: true; replayed: boolean }
  | { code: 'conflict' | 'retryable'; message: string; ok: false };

type SavedBetResponse = {
  bet_id?: unknown;
  replayed?: unknown;
  success?: unknown;
};

async function accessToken(refresh: boolean): Promise<string | null> {
  const auth = getSupabase().auth;
  const { data, error } = refresh
    ? await auth.refreshSession()
    : await auth.getSession();
  return error ? null : data.session?.access_token ?? null;
}

export async function saveTrackedBet(
  payload: TrackerDraftPayload,
  idempotencyKey: string,
): Promise<SaveTrackedBetResult> {
  const response = await authenticatedJsonRequest<SavedBetResponse>({
    body: { ...payload, idempotency_key: idempotencyKey },
    getAccessToken: accessToken,
    operation: 'tracked_bet',
    path: '/api/bets/tracked',
  });

  if (!response.ok) {
    return {
      code: response.code === 'conflict' ? 'conflict' : 'retryable',
      message: response.message,
      ok: false,
    };
  }

  const { data } = response;
  if (data.success !== true || typeof data.bet_id !== 'string') {
    return {
      code: 'retryable',
      message: 'The saved response was invalid. Check Tracker before retrying.',
      ok: false,
    };
  }

  return { betId: data.bet_id, ok: true, replayed: data.replayed === true };
}
