import type { PreparedCapture } from './image-capture';
import { parseScannerResponse, scannerRequestBody, type ScannerAnalysis } from './scanner-model';
import { authenticatedJsonRequest } from '@/lib/api-client';
import { getSupabase } from '@/lib/supabase';

export type ScanCouponResult =
  | { ok: true; analysis: ScannerAnalysis }
  | { ok: false; message: string };

async function accessToken(refresh: boolean): Promise<string | null> {
  const auth = getSupabase().auth;
  const { data, error } = refresh
    ? await auth.refreshSession()
    : await auth.getSession();
  return error ? null : data.session?.access_token ?? null;
}
export async function scanPreparedCoupon(image: PreparedCapture): Promise<ScanCouponResult> {
  const body = scannerRequestBody(image);
  if (!body) {
    return { ok: false, message: 'This image is too large to send safely.' };
  }

  const response = await authenticatedJsonRequest<unknown>({
    body,
    getAccessToken: accessToken,
    path: '/api/ai/scanner',
  });
  if (!response.ok) return { ok: false, message: response.message };

  const analysis = parseScannerResponse(response.data);
  return analysis
    ? { ok: true, analysis }
    : { ok: false, message: 'Scanner returned an unreadable result.' };
}
