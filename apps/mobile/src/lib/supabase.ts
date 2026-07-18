import 'react-native-url-polyfill/auto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { secureSessionStorage } from '@/auth/secure-storage';

let client: SupabaseClient | null = null;

export class MobileConfigurationError extends Error {}

function readPublicConfig() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
    || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !publishableKey) {
    throw new MobileConfigurationError(
      'Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, then restart Metro.',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new MobileConfigurationError('EXPO_PUBLIC_SUPABASE_URL is not a valid URL.');
  }
  if (parsed.protocol !== 'https:' && parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
    throw new MobileConfigurationError('Supabase URL must use HTTPS.');
  }

  return { publishableKey, url };
}

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const { publishableKey, url } = readPublicConfig();
  client = createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: false,
      persistSession: true,
      storage: secureSessionStorage,
    },
  });
  return client;
}
