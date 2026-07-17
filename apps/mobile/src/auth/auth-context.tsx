import type { Session } from '@supabase/supabase-js';
import { type PropsWithChildren, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { getSupabase, MobileConfigurationError } from '@/lib/supabase';
import { sanitizeAuthError, shouldRefreshForAppState } from '@/auth/policy';

type SignInResult = { ok: true } | { ok: false; message: string };

interface AuthValue {
  booting: boolean;
  configurationError: string | null;
  session: Session | null;
  signIn(email: string, password: string): Promise<SignInResult>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [initialization] = useState(() => {
    try {
      return { configurationError: null, supabase: getSupabase() };
    } catch (error) {
      return {
        configurationError: error instanceof MobileConfigurationError
          ? error.message
          : 'Mobile authentication could not be initialized.',
        supabase: null,
      };
    }
  });
  const [booting, setBooting] = useState(Boolean(initialization.supabase));
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const supabase = initialization.supabase;
    if (!supabase) return;
    let mounted = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      setSession(error ? null : data.session);
      setBooting(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) setSession(nextSession);
    });

    const appStateListener = AppState.addEventListener('change', (nextState) => {
      if (shouldRefreshForAppState(nextState)) supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });
    if (shouldRefreshForAppState(AppState.currentState)) supabase.auth.startAutoRefresh();

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
      appStateListener.remove();
      supabase.auth.stopAutoRefresh();
    };
  }, [initialization.supabase]);

  const value = useMemo<AuthValue>(() => ({
    booting,
    configurationError: initialization.configurationError,
    session,
    async signIn(email, password) {
      try {
        if (!initialization.supabase) return { ok: false, message: 'Mobile authentication is not configured.' };
        const { error } = await initialization.supabase.auth.signInWithPassword({ email, password });
        return error ? { ok: false, message: sanitizeAuthError(error.message) } : { ok: true };
      } catch {
        return { ok: false, message: 'Could not connect. Check your internet connection and try again.' };
      }
    },
    async signOut() {
      if (initialization.supabase) await initialization.supabase.auth.signOut({ scope: 'local' });
      setSession(null);
    },
  }), [booting, initialization, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
