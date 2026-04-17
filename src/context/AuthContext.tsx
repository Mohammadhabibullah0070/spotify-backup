/**
 * AuthContext — global auth state for both Spotify accounts.
 *
 * Holds:
 *   source      → the account we back up FROM
 *   destination → the account we restore TO
 *
 * Each account slot stores tokens + user profile.
 * On mount the context re-hydrates from localStorage so users
 * stay logged in across page refreshes.
 */

import {
  createContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react'

import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateNonce,
} from '../lib/pkce'
import {
  buildAuthUrl,
  refreshAccessToken,
  type AccountRole,
  type TokenResponse,
} from '../lib/spotifyAuth'
import {
  saveTokens,
  loadTokens,
  clearTokens,
  saveUser,
  loadUser,
  clearUser,
  saveCodeVerifier,
  saveNonce,
  type StoredTokens,
} from '../lib/storage'
import type { SpotifyUser } from '../lib/spotifyApi'

// ─── Types ────────────────────────────────────────────────────

export interface AccountState {
  tokens: StoredTokens
  user:   SpotifyUser | null
}

export interface AuthContextValue {
  source:      AccountState | null
  destination: AccountState | null

  /** Starts the PKCE login flow — redirects to Spotify */
  loginAs: (role: AccountRole) => Promise<void>

  /** Clears tokens + user for the given role */
  logoutAs: (role: AccountRole) => void

  /**
   * Returns a valid access token, auto-refreshing if expired.
   * Returns null if the user is not logged in.
   */
  getAccessToken: (role: AccountRole) => Promise<string | null>

  /** Called by CallbackPage after a successful token exchange */
  setAccount: (role: AccountRole, tokens: StoredTokens, user: SpotifyUser) => void

  /**
   * NEW in Milestone 3 — update only the user profile for a role.
   * Called by useUserProfile hook after a fresh /me fetch.
   */
  updateUser: (role: AccountRole, user: SpotifyUser) => void
}

// ─── Context ──────────────────────────────────────────────────

export const AuthContext = createContext<AuthContextValue | null>(null)

// ─── Provider ─────────────────────────────────────────────────

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [source,      setSource]      = useState<AccountState | null>(() => hydrate('source'))
  const [destination, setDestination] = useState<AccountState | null>(() => hydrate('destination'))

  // ── loginAs ──────────────────────────────────────────────────
  const loginAs = useCallback(async (role: AccountRole) => {
    const verifier  = generateCodeVerifier()
    const challenge = await generateCodeChallenge(verifier)
    const nonce     = generateNonce()

    saveCodeVerifier(role, verifier)
    saveNonce(role, nonce)

    window.location.href = buildAuthUrl(challenge, { role, nonce })
  }, [])

  // ── logoutAs ─────────────────────────────────────────────────
  const logoutAs = useCallback((role: AccountRole) => {
    clearTokens(role)
    clearUser(role)
    if (role === 'source')      setSource(null)
    if (role === 'destination') setDestination(null)
  }, [])

  // ── getAccessToken ────────────────────────────────────────────
  const getAccessToken = useCallback(
    async (role: AccountRole): Promise<string | null> => {
      const account = role === 'source' ? source : destination
      if (!account) return null

      const fiveMinutes = 5 * 60 * 1000
      if (account.tokens.expiresAt - Date.now() < fiveMinutes) {
        try {
          const fresh: TokenResponse = await refreshAccessToken(
            account.tokens.refreshToken
          )
          const updated: StoredTokens = {
            accessToken:  fresh.access_token,
            refreshToken: fresh.refresh_token ?? account.tokens.refreshToken,
            expiresAt:    Date.now() + fresh.expires_in * 1000,
          }
          saveTokens(role, updated)
          const setter = role === 'source' ? setSource : setDestination
          setter((prev) => (prev ? { ...prev, tokens: updated } : null))
          return updated.accessToken
        } catch {
          logoutAs(role)
          return null
        }
      }

      return account.tokens.accessToken
    },
    [source, destination, logoutAs]
  )

  // ── setAccount ────────────────────────────────────────────────
  const setAccount = useCallback(
    (role: AccountRole, tokens: StoredTokens, user: SpotifyUser) => {
      saveTokens(role, tokens)
      saveUser(role, user)
      const setter = role === 'source' ? setSource : setDestination
      setter({ tokens, user })
    },
    []
  )

  // ── updateUser (NEW in M3) ────────────────────────────────────
  // Updates only the user profile without touching tokens.
  const updateUser = useCallback(
    (role: AccountRole, user: SpotifyUser) => {
      saveUser(role, user)
      const setter = role === 'source' ? setSource : setDestination
      setter((prev) => (prev ? { ...prev, user } : null))
    },
    []
  )

  const value: AuthContextValue = {
    source,
    destination,
    loginAs,
    logoutAs,
    getAccessToken,
    setAccount,
    updateUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// ─── Helpers ─────────────────────────────────────────────────

function hydrate(role: AccountRole): AccountState | null {
  const tokens = loadTokens(role)
  const user   = loadUser(role)
  if (!tokens) return null
  return { tokens, user }
}
