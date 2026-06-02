'use client';
import { useEffect, useState, useCallback } from 'react';
import {
  signIn, signOut, signUp, confirmSignUp,
  getCurrentUser, fetchAuthSession,
  type AuthUser,
} from 'aws-amplify/auth';

type AuthState = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  error: string | null;
};

export function useAuth() {
  const [state, setState] = useState<AuthState>({ user: null, token: null, loading: true, error: null });

  const refresh = useCallback(async (forceRefresh = false) => {
    try {
      const [user, session] = await Promise.all([
        getCurrentUser(),
        // BUG FIX: Accept forceRefresh flag so callers can get a new token after expiry
        fetchAuthSession({ forceRefresh }),
      ]);
      const token = session.tokens?.accessToken.toString() ?? null;
      setState({ user, token, loading: false, error: null });
      return token;
    } catch {
      setState({ user: null, token: null, loading: false, error: null });
      return null;
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      await signIn({ username: email, password });
      await refresh();
    } catch (e: any) {
      setState(s => ({ ...s, loading: false, error: e.message ?? 'Login failed' }));
      throw e;
    }
  }, [refresh]);

  const register = useCallback(async (email: string, password: string) => {
    await signUp({ username: email, password, options: { userAttributes: { email } } });
  }, []);

  const confirm = useCallback(async (email: string, code: string) => {
    await confirmSignUp({ username: email, confirmationCode: code });
  }, []);

  const logout = useCallback(async () => {
    await signOut();
    setState({ user: null, token: null, loading: false, error: null });
  }, []);

  return { ...state, login, register, confirm, logout, refresh };
}
