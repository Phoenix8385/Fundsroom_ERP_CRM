import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setAuthHeader, setUnauthorizedHandler } from '../lib/api';
import {
  clearSession,
  decodeJwt,
  loadSession,
  persistSession,
  type Session,
} from '../lib/auth';
import type { LoginResponse } from '../types/api';

interface AuthContextValue {
  session: Session | null;
  /** True until the stored token has been read and checked, once, on load. */
  restoring: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(true);

  // One synchronous pass over localStorage at startup: seeds the in-memory
  // token, drops it if `exp` has already gone by.
  useEffect(() => {
    const restored = loadSession();

    if (restored) {
      setAuthHeader(restored.token);
      setSession(restored);
    }

    setRestoring(false);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setAuthHeader(null);
    setSession(null);
    navigate('/login', { replace: true });
  }, [navigate]);

  // Lets the response interceptor unwind React state and route in-app rather
  // than hard-reloading the page. The interceptor has already decided the 401
  // is worth acting on (not the login call, not already on /login).
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setSession(null);
      navigate('/login', { replace: true });
    });

    return () => setUnauthorizedHandler(null);
  }, [navigate]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { data } = await api.post<LoginResponse>('/auth/login', { email, password });
      const claims = decodeJwt(data.token);

      if (!claims?.userId) {
        throw new Error('The server returned a token this app cannot read');
      }

      persistSession(data.token, data.name);
      setAuthHeader(data.token);
      setSession({
        token: data.token,
        userId: claims.userId,
        role: data.role,
        name: data.name,
      });

      navigate('/dashboard', { replace: true });
    },
    [navigate],
  );

  return (
    <AuthContext.Provider value={useMemo(
      () => ({ session, restoring, login, logout }),
      [session, restoring, login, logout],
    )}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);

  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');

  return value;
}

/**
 * The authenticated user, for the many components that only render behind
 * ProtectedRoute and would otherwise null-check on every line.
 */
export function useSession(): Session {
  const { session } = useAuth();

  if (!session) throw new Error('useSession used outside an authenticated route');

  return session;
}

