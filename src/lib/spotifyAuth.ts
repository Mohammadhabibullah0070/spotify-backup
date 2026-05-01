/**
 * Spotify authorization helpers: /authorize URL, token exchange, token refresh.
 */

export type AccountRole = "source" | "destination";
export interface OAuthState {
  role: AccountRole;
  nonce: string;
}
export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export const SPOTIFY_SCOPES = [
  "user-read-private",
  "user-read-email",
  "user-library-read",
  "user-library-modify",
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-public",
  "playlist-modify-private",
  "user-follow-read",
  "user-follow-modify",
];

const AUTH_ENDPOINT = "https://accounts.spotify.com/authorize";
const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string;
const REDIRECT_URI = import.meta.env.VITE_SPOTIFY_REDIRECT_URI as string;

export function buildAuthUrl(codeChallenge: string, state: OAuthState): string {
  const stateString = JSON.stringify(state);

  return `${AUTH_ENDPOINT}?${new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
    state: stateString,
    scope: SPOTIFY_SCOPES.join(" "),
    show_dialog: "true",
  }).toString()}`;
}

export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
): Promise<TokenResponse> {
  if (!code || !codeVerifier)
    throw new Error("auth_pkce_failed: Missing code or code verifier");

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    const err = (await response.json().catch(() => ({}))) as {
      error?: string;
      error_description?: string;
    };
    if (
      err.error === "invalid_request" &&
      err.error_description?.includes("redirect_uri")
    )
      throw new Error(
        "auth_redirect_uri_mismatch: redirect_uri does not match configuration",
      );
    if (err.error === "invalid_grant")
      throw new Error(
        "auth_token_exchange_failed: Authorization code expired or reused (lasts 10 minutes)",
      );
    if (err.error === "invalid_client")
      throw new Error(
        "auth_redirect_uri_mismatch: Client ID or redirect URI incorrect",
      );
    throw new Error(
      err.error_description
        ? `auth_token_exchange_failed: ${err.error_description}`
        : `auth_token_exchange_failed: HTTP ${response.status}`,
    );
  }

  return response.json() as Promise<TokenResponse>;
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<TokenResponse> {
  if (!refreshToken)
    throw new Error("auth_pkce_failed: No refresh token available");
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const err = (await response.json().catch(() => ({}))) as {
      error?: string;
      error_description?: string;
    };
    if (err.error === "invalid_grant")
      throw new Error(
        "auth_token_refresh_failed: refresh token expired or revoked",
      );
    throw new Error(
      err.error_description
        ? `auth_token_refresh_failed: ${err.error_description}`
        : `auth_token_refresh_failed: HTTP ${response.status}`,
    );
  }
  return response.json() as Promise<TokenResponse>;
}
