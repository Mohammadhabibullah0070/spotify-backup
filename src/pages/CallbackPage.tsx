/**
 * CallbackPage — rendered when Spotify redirects back to /callback.
 *
 * Steps:
 *  1. Read ?code and ?state from the URL
 *  2. Validate the nonce (CSRF check)
 *  3. Load the code verifier from sessionStorage
 *  4. Exchange the auth code for tokens
 *  5. Fetch the user's profile
 *  6. Save everything via AuthContext
 *  7. Redirect to /
 */

import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { exchangeCodeForTokens } from '../lib/spotifyAuth'
import { fetchCurrentUser } from '../lib/spotifyApi'
import {
  loadCodeVerifier,
  loadNonce,
  clearCodeVerifier,
  clearNonce,
  type StoredTokens,
} from '../lib/storage'
import type { OAuthState } from '../lib/spotifyAuth'
import './CallbackPage.css'

type Status = 'loading' | 'error'

export default function CallbackPage() {
  const { setAccount } = useAuth()
  const [status, setStatus]       = useState<Status>('loading')
  const [errorMsg, setErrorMsg]   = useState<string>('')

  useEffect(() => {
    const params   = new URLSearchParams(window.location.search)
    const code     = params.get('code')
    const stateRaw = params.get('state')
    const error    = params.get('error')   // e.g. 'access_denied'

    // ── User denied access ─────────────────────────────────────
    if (error) {
      setErrorMsg(
        error === 'access_denied'
          ? 'You declined the Spotify permissions. Please try again.'
          : `Spotify returned an error: ${error}`
      )
      setStatus('error')
      return
    }

    // ── Missing params ─────────────────────────────────────────
    if (!code || !stateRaw) {
      setErrorMsg('Missing code or state parameter. Did Spotify redirect correctly?')
      setStatus('error')
      return
    }

    // ── Parse state ────────────────────────────────────────────
    let oauthState: OAuthState
    try {
      oauthState = JSON.parse(stateRaw) as OAuthState
    } catch {
      setErrorMsg('Could not parse OAuth state. Please try logging in again.')
      setStatus('error')
      return
    }

    const { role, nonce } = oauthState

    // ── CSRF nonce check ───────────────────────────────────────
    const savedNonce = loadNonce(role)
    if (!savedNonce || savedNonce !== nonce) {
      setErrorMsg('Security check failed (nonce mismatch). Please try logging in again.')
      setStatus('error')
      return
    }

    // ── Load code verifier ─────────────────────────────────────
    const codeVerifier = loadCodeVerifier(role)
    if (!codeVerifier) {
      setErrorMsg('Code verifier not found. Please try logging in again.')
      setStatus('error')
      return
    }

    // ── Exchange code for tokens ────────────────────────────────
    ;(async () => {
      try {
        const tokenResponse = await exchangeCodeForTokens(code, codeVerifier)

        const tokens: StoredTokens = {
          accessToken:  tokenResponse.access_token,
          refreshToken: tokenResponse.refresh_token,
          expiresAt:    Date.now() + tokenResponse.expires_in * 1000,
        }

        // Fetch the user's Spotify profile
        const user = await fetchCurrentUser(tokenResponse.access_token)

        // Save to context + localStorage
        setAccount(role, tokens, user)

        // Clean up session storage (these are single-use)
        clearCodeVerifier(role)
        clearNonce(role)

        // Redirect to home
        window.location.href = '/'
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setErrorMsg(`Login failed: ${msg}`)
        setStatus('error')
      }
    })()
  }, [setAccount])

  // ── Render ──────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div className="callback-page">
        <div className="callback-page__card">
          <div className="callback-page__spinner" aria-hidden="true" />
          <h1 className="callback-page__title">Connecting to Spotify…</h1>
          <p className="callback-page__desc">
            Exchanging your authorization code for tokens. This only takes a moment.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="callback-page">
      <div className="callback-page__card callback-page__card--error">
        <span className="callback-page__icon" aria-hidden="true">⚠️</span>
        <h1 className="callback-page__title">Login failed</h1>
        <p className="callback-page__desc">{errorMsg}</p>
        <a href="/" className="callback-page__btn">← Back to home</a>
      </div>
    </div>
  )
}
