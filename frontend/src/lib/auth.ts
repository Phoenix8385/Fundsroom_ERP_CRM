import type { Role } from '../types/api';

/**
 * The session token lives in a module variable, not in localStorage.
 *
 * localStorage is touched exactly twice — once on load to seed this store, and
 * again on login/logout to persist it — so the request interceptor never pays
 * for a synchronous storage read on every call.
 */
let token: string | null = null;

const TOKEN_KEY = 'fundsroom.token';
const NAME_KEY = 'fundsroom.name';

export interface JwtClaims {
  userId: string;
  role: Role;
  /** Expiry, in seconds since the epoch. */
  exp?: number;
  iat?: number;
}

export interface Session {
  token: string;
  userId: string;
  role: Role;
  name: string;
}

export function getToken(): string | null {
  return token;
}

export function setToken(value: string | null): void {
  token = value;
}

/**
 * Reads a JWT payload without verifying it.
 *
 * The signature is the server's business; the client only needs `role` to draw
 * the right nav and `exp` to know the session is already dead. Anything this
 * returns is a hint for the UI, never an authorisation decision.
 */
export function decodeJwt(value: string): JwtClaims | null {
  const payload = value.split('.')[1];

  if (!payload) return null;

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const binary = atob(padded);

    // atob yields one byte per char; re-decode as UTF-8 so non-ASCII names survive.
    const json = new TextDecoder().decode(
      Uint8Array.from(binary, (char) => char.charCodeAt(0)),
    );

    return JSON.parse(json) as JwtClaims;
  } catch {
    return null;
  }
}

/** True when the token carries an `exp` that has already passed. */
export function isExpired(claims: JwtClaims, skewMs = 0): boolean {
  if (typeof claims.exp !== 'number') return false;

  return claims.exp * 1000 - skewMs <= Date.now();
}

export function persistSession(value: string, name: string): void {
  localStorage.setItem(TOKEN_KEY, value);
  localStorage.setItem(NAME_KEY, name);
  setToken(value);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(NAME_KEY);
  setToken(null);
}

/**
 * Restores the session from localStorage once, at startup.
 *
 * An expired token is dropped here rather than being sent and bounced: waiting
 * for the first 401 would flash a logged-in shell before kicking the user out.
 */
export function loadSession(): Session | null {
  const stored = localStorage.getItem(TOKEN_KEY);

  if (!stored) return null;

  const claims = decodeJwt(stored);

  if (!claims || !claims.userId || !claims.role || isExpired(claims)) {
    clearSession();
    return null;
  }

  setToken(stored);

  return {
    token: stored,
    userId: claims.userId,
    role: claims.role,
    name: localStorage.getItem(NAME_KEY) ?? 'User',
  };
}
