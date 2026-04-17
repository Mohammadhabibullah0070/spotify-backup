/**
 * SameAccountWarning — shown between the account cards when
 * both source and destination resolve to the same Spotify user ID.
 *
 * Why this can happen:
 *   Spotify's account picker (show_dialog=true) gives the user an "Add account"
 *   link and a "Not you?" option. But if the user just clicks through without
 *   switching, the same session account is used for both slots.
 *
 * This is NOT a bug in our auth flow — it is a user error.
 * We detect it here and block restore until it is resolved.
 */

import './SameAccountWarning.css'

interface SameAccountWarningProps {
  userId:             string
  displayName:        string | null
  onDisconnectDest:   () => void
}

export default function SameAccountWarning({
  userId,
  displayName,
  onDisconnectDest,
}: SameAccountWarningProps) {
  const name = displayName ?? userId

  return (
    <div className="same-warn" role="alert" aria-live="polite">
      <span className="same-warn__icon" aria-hidden="true">⚠️</span>
      <div className="same-warn__body">
        <p className="same-warn__title">
          Source and destination are the same account
        </p>
        <p className="same-warn__detail">
          Both slots are connected as <strong>{name}</strong>
          {' '}(<code>@{userId}</code>).
          Restoring to the same account will create duplicate playlists and
          duplicate liked songs.
        </p>
        <p className="same-warn__hint">
          To fix: disconnect the destination and log in with a <em>different</em> Spotify account.
          On the Spotify login page, click <strong>"Not you?"</strong> or
          <strong> "Add account"</strong> to switch.
        </p>
      </div>
      <button
        className="same-warn__btn"
        onClick={onDisconnectDest}
        aria-label="Disconnect destination account"
      >
        Disconnect destination →
      </button>
    </div>
  )
}
