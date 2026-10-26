import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, isUnauthorized } from './api';
import type { Session, User } from './api';

const KEY = 'studio.session';
type AuthState = {
  token: string | null; user: User | null; checking: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => void; sessionExpired: () => void;
};
const AuthContext = createContext<AuthState | null>(null);
function readStoredToken(): string | null {
  try { return sessionStorage.getItem(KEY); } catch { return null; }
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(readStoredToken);
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(Boolean(token));
  const logout = useCallback(() => {
    try { sessionStorage.removeItem(KEY); } catch { /* memory-only fallback */ }
    setToken(null); setUser(null); setChecking(false);
  }, []);
  useEffect(() => {
    if (!token) { setChecking(false); return; }
    const controller = new AbortController();
    setChecking(true);
    void api.me(token, controller.signal)
      .then(person => { if (!controller.signal.aborted) setUser(person); })
      .catch(error => {
        if (!controller.signal.aborted) {
          if (isUnauthorized(error)) logout();
          else { setUser(null); setChecking(false); }
        }
      })
      .finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, [token, logout]);
  const accept = useCallback((session: Session) => {
    try { sessionStorage.setItem(KEY, session.accessToken); } catch { /* temporary browser session */ }
    setUser(session.user); setToken(session.accessToken); setChecking(false);
  }, []);
  const login = useCallback(async (email: string, password: string) => {
    accept(await api.login(email, password));
  }, [accept]);
  const register = useCallback(async (email: string, password: string, displayName: string) => {
    accept(await api.register(email, password, displayName));
  }, [accept]);
  const value = useMemo(() => ({
    token, user, checking, login, register, logout, sessionExpired: logout,
  }), [token, user, checking, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth(): AuthState {
  const state = useContext(AuthContext);
  if (!state) throw new Error('useAuth requires AuthProvider');
  return state;
}
