/**
 * AccountCard — displays a single Spotify account slot.
 *
 * States:
 *   idle        → not logged in (Connect button)
 *   loading     → logged in but profile not fetched yet (skeleton)
 *   success     → logged in + profile loaded (full user details)
 *   error       → fetch failed (error message + retry button)
 *   refreshing  → has cached data, silently re-fetching in background
 */

import { useAuth }        from '../../hooks/useAuth'
import { useUserProfile } from '../../hooks/useUserProfile'
import type { AccountRole } from '../../lib/spotifyAuth'
import './AccountCard.css'

interface AccountCardProps {
  role: AccountRole
}

// Convert an ISO 3166-1 alpha-2 country code to a flag emoji.
// Works in all modern browsers via Unicode regional indicator symbols.
function countryToFlag(code: string): string {
  return code
    .toUpperCase()
    .split('')
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('')
}

// Format a follower count with commas (e.g. 12345 → "12,345")
function formatFollowers(n: number): string {
  return n.toLocaleString()
}

export default function AccountCard({ role }: AccountCardProps) {
  const { loginAs, logoutAs } = useAuth()

  // Force-reconnect: wipes ALL stored tokens for this role then starts fresh OAuth.
  // Use this when a normal disconnect+reconnect still shows 403 errors.
  const forceReconnect = () => {
    // Wipe every key that could hold a stale token for this role
    ;['source', 'destination'].forEach(r => {
      if (r !== role) return
      localStorage.removeItem(`spotify_tokens_${r}`)
      localStorage.removeItem(`spotify_user_${r}`)
      sessionStorage.removeItem(`spotify_verifier_${r}`)
      sessionStorage.removeItem(`spotify_nonce_${r}`)
    })
    logoutAs(role)
    setTimeout(() => loginAs(role), 100)
  }
  const { user, isLoading, isRefreshing, error, status, refetch } =
    useUserProfile(role)

  const label       = role === 'source' ? 'Source Account'      : 'Destination Account'
  const description = role === 'source'
    ? 'The Spotify account to back up FROM.'
    : 'The Spotify account to restore TO.'
  const tagLabel    = role === 'source' ? 'FROM' : 'TO'

  const isPremium   = user?.product === 'premium'
  const avatarUrl   = user?.images?.[0]?.url ?? null

  // ── LOADING SKELETON ──────────────────────────────────────────
  if (isLoading) {
    return (
      <div className={`account-card account-card--${role} account-card--connected`}>
        <div className="account-card__tag">{tagLabel}</div>
        <div className="skeleton skeleton-avatar" aria-hidden="true" />
        <div className="account-card__skeleton-info">
          <div className="skeleton skeleton-text" style={{ width: '60%' }} />
          <div className="skeleton skeleton-text" style={{ width: '80%' }} />
          <div className="skeleton skeleton-text" style={{ width: '50%' }} />
        </div>
        <p className="account-card__loading-msg">Loading profile…</p>
      </div>
    )
  }

  // ── LOGGED-OUT STATE ──────────────────────────────────────────
  if (status === 'idle') {
    return (
      <div className={`account-card account-card--${role}`}>
        <div className="account-card__tag">{tagLabel}</div>
        <div className="account-card__avatar">
          <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
            <circle cx="32" cy="32" r="32" fill="var(--color-surface-3)" />
            <circle cx="32" cy="25" r="11" fill="var(--color-text-faint)" />
            <path d="M10 58c0-12.15 9.85-22 22-22s22 9.85 22 22"
              stroke="var(--color-text-faint)" strokeWidth="2" fill="none" />
          </svg>
        </div>
        <h2 className="account-card__title">{label}</h2>
        <p className="account-card__description">{description}</p>

        {/* Destination-specific tip: explain account switching */}
        {role === 'destination' && (
          <div className="account-card__dest-tip">
            <p className="account-card__dest-tip-title">💡 Logging in with a different account?</p>
            <p className="account-card__dest-tip-body">
              Spotify will show an account picker — click{' '}
              <strong>"Not you?"</strong> or <strong>"Add account"</strong>{' '}
              to switch. For the cleanest experience, open this app in a
              private/incognito window and log in there.
            </p>
          </div>
        )}

        <button
          className="account-card__btn account-card__btn--login"
          onClick={() => loginAs(role)}
        >
          <SpotifyIcon />
          Connect with Spotify
        </button>
      </div>
    )
  }

  // ── ERROR STATE (no cached data) ──────────────────────────────
  if (status === 'error' && !user) {
    return (
      <div className={`account-card account-card--${role} account-card--error`}>
        <div className="account-card__tag">{tagLabel}</div>
        <span className="account-card__error-icon" aria-hidden="true">⚠️</span>
        <p className="account-card__error-msg">{error ?? 'Something went wrong.'}</p>
        <div className="account-card__error-actions">
          <button
            className="account-card__btn account-card__btn--retry"
            onClick={() => refetch()}
          >
            Retry
          </button>
          <button
            className="account-card__btn account-card__btn--logout"
            onClick={() => logoutAs(role)}
          >
            Disconnect
          </button>
        </div>
      </div>
    )
  }

  // ── LOGGED-IN STATE (with profile) ────────────────────────────
  return (
    <div className={`account-card account-card--${role} account-card--connected`}>
      <div className="account-card__tag">{tagLabel}</div>

      {/* Subtle refreshing indicator — shown when silently re-fetching */}
      {isRefreshing && (
        <div className="account-card__refreshing" aria-label="Refreshing profile">
          <span className="account-card__refresh-dot" />
          <span className="account-card__refresh-dot" />
          <span className="account-card__refresh-dot" />
        </div>
      )}

      {/* Avatar */}
      <div className="account-card__avatar">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={`${user?.display_name ?? 'User'} avatar`}
            width="64"
            height="64"
            className="account-card__avatar-img"
            loading="lazy"
          />
        ) : (
          <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
            <circle cx="32" cy="32" r="32" fill="var(--color-surface-3)" />
            <circle cx="32" cy="25" r="11" fill="var(--color-text-faint)" />
            <path d="M10 58c0-12.15 9.85-22 22-22s22 9.85 22 22"
              stroke="var(--color-text-faint)" strokeWidth="2" fill="none" />
          </svg>
        )}
      </div>

      {/* ── Profile details ─────────────────────────────────── */}
      <div className="account-card__user-info">
        {/* Display name */}
        <p className="account-card__display-name">
          {user?.display_name ?? user?.id ?? '—'}
        </p>

        {/* Email */}
        <p className="account-card__email">{user?.email}</p>
      </div>

      {/* ── Stats row ───────────────────────────────────────── */}
      <div className="account-card__stats">
        {/* User ID */}
        <div className="account-card__stat">
          <span className="account-card__stat-label">ID</span>
          <span className="account-card__stat-value account-card__stat-value--mono">
            {user?.id}
          </span>
        </div>

        {/* Country with flag emoji */}
        {user?.country && (
          <div className="account-card__stat">
            <span className="account-card__stat-label">Country</span>
            <span className="account-card__stat-value">
              {countryToFlag(user.country)} {user.country}
            </span>
          </div>
        )}

        {/* Followers */}
        {user?.followers?.total !== undefined && (
          <div className="account-card__stat">
            <span className="account-card__stat-label">Followers</span>
            <span className="account-card__stat-value">
              {formatFollowers(user.followers.total)}
            </span>
          </div>
        )}
      </div>

      {/* ── Badges ──────────────────────────────────────────── */}
      <div className="account-card__badges">
        <span
          className={`account-card__badge ${
            isPremium
              ? 'account-card__badge--premium'
              : 'account-card__badge--free'
          }`}
        >
          {isPremium ? '✓ Premium' : '⚠ Free'}
        </span>
      </div>

      {/* Free-account warning */}
      {!isPremium && (
        <p className="account-card__warning">
          ⚠️ Dev Mode requires <strong>Spotify Premium</strong>.
          Some features may not work on this account.
        </p>
      )}

      {/* Soft error banner — shown when refresh fails but we still have cached data */}
      {status === 'error' && user && (
        <div className="account-card__soft-error">
          <span>⚠ Could not refresh profile</span>
          <button
            className="account-card__soft-error-retry"
            onClick={() => refetch()}
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Actions ─────────────────────────────────────────── */}
      <div className="account-card__actions">
        <button
          className="account-card__btn account-card__btn--logout"
          onClick={() => logoutAs(role)}
        >
          Disconnect
        </button>
        <button
          className="account-card__btn account-card__btn--force"
          onClick={forceReconnect}
          title="Clears all cached tokens and starts a completely fresh Spotify login. Use this if Disconnect + reconnect still shows 403 errors."
        >
          ↺ Force Reconnect
        </button>
      </div>
    </div>
  )
}

// ── Small inline Spotify logo icon ───────────────────────────
function SpotifyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  )
}
