import { useState, useEffect, useCallback } from 'react';
import { getCurrentUser, fetchAuthSession, signIn, signOut, signUp, confirmSignUp } from 'aws-amplify/auth';

type AuthState = { userId: string | null; token: string | null; loading: boolean };

export function useAuth() {
  const [state, setState] = useState<AuthState>({ userId: null, token: null, loading: true });

  const refresh = useCallback(async () => {
    try {
      const [user, session] = await Promise.all([getCurrentUser(), fetchAuthSession()]);
      setState({ userId: user.userId, token: session.tokens?.accessToken.toString() ?? null, loading: false });
    } catch { setState({ userId: null, token: null, loading: false }); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    await signIn({ username: email, password });
    await refresh();
  }, [refresh]);

  const register = (email: string, password: string) =>
    signUp({ username: email, password, options: { userAttributes: { email } } });

  const confirm = (email: string, code: string) =>
    confirmSignUp({ username: email, confirmationCode: code });

  const logout = useCallback(async () => {
    await signOut();
    setState({ userId: null, token: null, loading: false });
  }, []);

  return { ...state, login, register, confirm, logout, refresh };
}
