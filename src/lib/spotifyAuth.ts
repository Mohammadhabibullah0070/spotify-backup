/**
 * Spotify authorization helpers.
 *
 * Handles:
 *  - Building the /authorize URL (with PKCE params)
 *  - Exchanging auth code for tokens
 *  - Refreshing an expired access token
 */

export type AccountRole = 'source' | 'destination'

/** Shape of the state object we pass through the OAuth redirect */
export interface OAuthState {
  role: AccountRole
  nonce: string
}

/** Shape of what Spotify returns from /api/token */
export interface TokenResponse {
  access_token: string
  refresh_token: string   // May be absent on refresh — keep old one if so
  expires_in: number      // Seconds until token expires (usually 3600)
  token_type: string
  scope: string
}

// ─────────────────────────────────────────────────────────────
// Scopes requested from the user
// Only request what you need — extra scopes make users nervous.
// ─────────────────────────────────────────────────────────────
export const SPOTIFY_SCOPES = [
  // Who are you?
  'user-read-private',          // Profile name, country, product type (free/premium)
  'user-read-email',            // Email address — shown on account card

  // Liked songs
  'user-library-read',          // Backup: read your saved tracks & albums
  'user-library-modify',        // Restore: save tracks & albums to library

  // Playlists
  'playlist-read-private',      // Backup: read private playlists
  'playlist-read-collaborative',// Backup: read playlists you collaborate on
  'playlist-modify-public',     // Restore: add tracks to / create public playlists
  'playlist-modify-private',    // Restore: add tracks to / create private playlists

  // Followed artists & users
  'user-follow-read',           // Backup: read who you follow
  'user-follow-modify',         // Restore: re-follow artists
]

const AUTH_ENDPOINT  = 'https://accounts.spotify.com/authorize'
const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token'

// Pulled from .env at build time — never hard-code these
const CLIENT_ID    = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string
const REDIRECT_URI = import.meta.env.VITE_SPOTIFY_REDIRECT_URI as string

// ─────────────────────────────────────────────────────────────
// Build the /authorize URL
// ─────────────────────────────────────────────────────────────
export function buildAuthUrl(codeChallenge: string, state: OAuthState): string {
  // We JSON-stringify the state object so we can carry role + nonce together
  const stateString = JSON.stringify(state)

  const params = new URLSearchParams({
    client_id:             CLIENT_ID,
    response_type:         'code',
    redirect_uri:          REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge:        codeChallenge,
    state:                 stateString,
    scope:                 SPOTIFY_SCOPES.join(' '),
    // show_dialog forces Spotify to show the account-picker every time.
    // Critical for logging in with a DIFFERENT account for destination.
    show_dialog:           'true',
  })

  return `${AUTH_ENDPOINT}?${params.toString()}`
}

// ─────────────────────────────────────────────────────────────
// Exchange auth code for tokens  (Step 3 of PKCE flow)
// ─────────────────────────────────────────────────────────────
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string
): Promise<TokenResponse> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     CLIENT_ID,
      grant_type:    'authorization_code',
      code,
      redirect_uri:  REDIRECT_URI,   // Must EXACTLY match what was used in /authorize
      code_verifier: codeVerifier,   // Proves we started this flow (no client secret needed)
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(
      (err as { error_description?: string }).error_description ??
        `Token exchange failed: ${response.status}`
    )
  }

  return response.json() as Promise<TokenResponse>
}

// ─────────────────────────────────────────────────────────────
// Refresh an expired access token using the refresh token
// ─────────────────────────────────────────────────────────────
export async function refreshAccessToken(
  refreshToken: string
): Promise<TokenResponse> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     CLIENT_ID,
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(
      (err as { error_description?: string }).error_description ??
        `Token refresh failed: ${response.status}`
    )
  }

  return response.json() as Promise<TokenResponse>
}
