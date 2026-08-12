import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { clearSession, getToken } from './auth';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export const api = axios.create({ baseURL: BASE_URL });

/** Path of the one endpoint that legitimately answers 401 during normal use. */
const LOGIN_PATH = '/auth/login';

/**
 * Set by AuthContext so a 401 can unwind React state and route in-app.
 * Falls back to a hard redirect if nothing has registered yet.
 */
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const status = error.response?.status;

    // A 401 from the login call is just "wrong password" — bouncing to /login
    // from /login would either loop or wipe the error the form wants to show.
    const isLoginAttempt = (error.config?.url ?? '').includes(LOGIN_PATH);
    const alreadyOnLogin = window.location.pathname === '/login';

    if (status === 401 && !isLoginAttempt && !alreadyOnLogin) {
      clearSession();
      delete api.defaults.headers.common.Authorization;

      if (onUnauthorized) {
        onUnauthorized();
      } else {
        window.location.assign('/login');
      }
    }

    return Promise.reject(error);
  },
);

/** Applies the token to the shared default header after a successful login. */
export function setAuthHeader(token: string | null): void {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

/** The parsed error body, for callers that need more than the message. */
export function errorBody<T>(error: unknown): T | undefined {
  if (error instanceof AxiosError) {
    return error.response?.data as T | undefined;
  }

  return undefined;
}

/** Pulls the API's `{ error }` string out, with a readable fallback. */
export function errorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (error instanceof AxiosError) {
    const data = error.response?.data as { error?: unknown } | undefined;

    if (typeof data?.error === 'string' && data.error) return data.error;
    if (error.code === 'ERR_NETWORK') return 'Cannot reach the server';
    if (error.message) return error.message;
  }

  if (error instanceof Error && error.message) return error.message;

  return fallback;
}

export function statusOf(error: unknown): number | undefined {
  return error instanceof AxiosError ? error.response?.status : undefined;
}
