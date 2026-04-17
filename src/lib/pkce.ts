/**
 * PKCE (Proof Key for Code Exchange) helpers.
 *
 * PKCE stops a malicious app from stealing your auth code.
 * You generate a random "verifier", hash it into a "challenge",
 * send the challenge to Spotify, then prove ownership later
 * by sending the original verifier when swapping code for tokens.
 */

/**
 * Generates a random code verifier string.
 * Must be 43–128 characters (RFC 7636).
 */
export function generateCodeVerifier(length = 128): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join('')
}

/**
 * Hashes the verifier with SHA-256 and returns a Base64URL-encoded string.
 * This is what gets sent to Spotify as code_challenge.
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)

  // Convert ArrayBuffer → Base64 → Base64URL
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * Generates a short random string used as an OAuth state nonce.
 * Used to detect CSRF attacks on the callback.
 */
export function generateNonce(length = 16): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join('')
}
