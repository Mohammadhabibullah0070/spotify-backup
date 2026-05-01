/**
 * Thin wrappers around localStorage / sessionStorage.
 * Tokens (access + refresh) -> localStorage (persists).
 * Code verifier + nonce -> sessionStorage (ephemeral).
 */

import type { AccountRole } from "./spotifyAuth";
import type { SpotifyUser } from "./spotifyApi";

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

const tokenKey = (role: AccountRole) => `spotify_tokens_${role}`;
const userKey = (role: AccountRole) => `spotify_user_${role}`;
const verifierKey = (role: AccountRole) => `spotify_verifier_${role}`;
const nonceKey = (role: AccountRole) => `spotify_nonce_${role}`;

export function saveTokens(role: AccountRole, tokens: StoredTokens): void {
  localStorage.setItem(tokenKey(role), JSON.stringify(tokens));
}

export function loadTokens(role: AccountRole): StoredTokens | null {
  const raw = localStorage.getItem(tokenKey(role));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredTokens;
  } catch {
    return null;
  }
}

export function clearTokens(role: AccountRole): void {
  localStorage.removeItem(tokenKey(role));
}

export function saveUser(role: AccountRole, user: SpotifyUser): void {
  localStorage.setItem(userKey(role), JSON.stringify(user));
}

export function loadUser(role: AccountRole): SpotifyUser | null {
  const raw = localStorage.getItem(userKey(role));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SpotifyUser;
  } catch {
    return null;
  }
}

export function clearUser(role: AccountRole): void {
  localStorage.removeItem(userKey(role));
}

export function saveCodeVerifier(role: AccountRole, verifier: string): void {
  sessionStorage.setItem(verifierKey(role), verifier);
}

export function loadCodeVerifier(role: AccountRole): string | null {
  return sessionStorage.getItem(verifierKey(role));
}

export function clearCodeVerifier(role: AccountRole): void {
  sessionStorage.removeItem(verifierKey(role));
}

export function saveNonce(role: AccountRole, nonce: string): void {
  sessionStorage.setItem(nonceKey(role), nonce);
}

export function loadNonce(role: AccountRole): string | null {
  return sessionStorage.getItem(nonceKey(role));
}

export function clearNonce(role: AccountRole): void {
  sessionStorage.removeItem(nonceKey(role));
}
