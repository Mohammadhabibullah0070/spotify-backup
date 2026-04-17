/**
 * LikedSongs — displays the source account's liked/saved tracks.
 *
 * The component has two visual states:
 *
 *  Collapsed (default):
 *    Shows a summary card with the total count and a "View songs" button.
 *    Keeps the page clean when the user just wants to check the count.
 *
 *  Expanded:
 *    Full scrollable track list with name, artists, album, duration.
 *    Each row shows the date the song was liked in a tooltip.
 *
 * ── How liked songs differ from playlists in backup/restore ──
 *
 *  Feature            Liked Songs            Playlists
 *  ─────────────────  ─────────────────────  ──────────────────────
 *  Read endpoint      GET /me/tracks         GET /playlists/{id}/items
 *  Restore endpoint   PUT /me/library        POST /playlists/{id}/items
 *  Restore unit       Spotify URIs (50/req)  Spotify URIs (100/req)
 *  Order preserved?   No (Spotify sorts)     Yes (position param)
 *  Episodes allowed?  No                     Yes (some regions)
 *  Scope (read)       user-library-read      playlist-read-private
 *  Scope (write)      user-library-modify    playlist-modify-private
 *  Can share?         No (personal library)  Yes (public playlists)
 */

import { useState }     from 'react'
import { useLikedSongs } from '../../hooks/useLikedSongs'
import { formatDuration } from '../../lib/spotifyApi'
import type { SavedTrack } from '../../lib/spotifyApi'
import type { AccountRole } from '../../lib/spotifyAuth'
import './LikedSongs.css'

interface LikedSongsProps {
  role: AccountRole
}

export default function LikedSongs({ role }: LikedSongsProps) {
  const { songs, status, progress, error, refetch } = useLikedSongs(role)
  const [expanded, setExpanded] = useState(false)

  // ── Loading ───────────────────────────────────────────────────
  if (status === 'loading') {
    const pct = progress && progress.total > 0
      ? Math.round((progress.fetched / progress.total) * 100)
      : 0

    return (
      <div className="liked-songs">
        <header className="liked-songs__header">
          <span className="liked-songs__icon" aria-hidden="true">❤️</span>
          <h2 className="liked-songs__title">Liked Songs</h2>
          <span className="liked-songs__loading-text">
            Loading{progress?.total ? ` ${progress.fetched} of ${progress.total}` : ''}…
          </span>
        </header>
        <div
          className="liked-songs__progress-bar"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="liked-songs__progress-fill"
            style={{ width: `${Math.max(pct, 5)}%` }}
          />
        </div>
        {/* Skeleton rows */}
        <ul className="liked-songs__rows">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="liked-row liked-row--skeleton" aria-hidden="true">
              <span className="skeleton liked-row__num" />
              <div className="liked-row__main">
                <div className="skeleton skeleton-text" style={{ width: '50%' }} />
                <div className="skeleton skeleton-text" style={{ width: '38%', marginTop: 5 }} />
              </div>
              <div className="skeleton skeleton-text" style={{ width: '28%' }} />
              <div className="skeleton skeleton-text" style={{ width: 36 }} />
            </li>
          ))}
        </ul>
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <div className="liked-songs">
        <header className="liked-songs__header">
          <span className="liked-songs__icon" aria-hidden="true">❤️</span>
          <h2 className="liked-songs__title">Liked Songs</h2>
        </header>
        <div className="liked-songs__error">
          <span aria-hidden="true">⚠️</span>
          <p>{error}</p>
          <button className="liked-songs__btn" onClick={() => refetch()}>Try again</button>
        </div>
      </div>
    )
  }

  // ── Empty ─────────────────────────────────────────────────────
  if (status === 'success' && songs.length === 0) {
    return (
      <div className="liked-songs">
        <header className="liked-songs__header">
          <span className="liked-songs__icon" aria-hidden="true">❤️</span>
          <h2 className="liked-songs__title">Liked Songs</h2>
          <span className="liked-songs__count-badge">0</span>
        </header>
        <p className="liked-songs__empty">No liked songs found on this account.</p>
      </div>
    )
  }

  // ── Success — Collapsed ───────────────────────────────────────
  if (status === 'success' && !expanded) {
    return (
      <div className="liked-songs liked-songs--collapsed">
        <header className="liked-songs__header">
          <span className="liked-songs__icon" aria-hidden="true">❤️</span>
          <h2 className="liked-songs__title">Liked Songs</h2>
          <span className="liked-songs__count-badge">{songs.length.toLocaleString()}</span>
          <button
            className="liked-songs__refresh-btn"
            onClick={() => refetch()}
            aria-label="Refresh liked songs"
            title="Refresh"
          >↻</button>
          <button
            className="liked-songs__btn liked-songs__btn--expand"
            onClick={() => setExpanded(true)}
          >
            View songs ▼
          </button>
        </header>
        <p className="liked-songs__summary-hint">
          {songs.length.toLocaleString()} liked songs ready for backup.
          Click "View songs" to browse them.
        </p>
      </div>
    )
  }

  // ── Success — Expanded ────────────────────────────────────────
  return (
    <div className="liked-songs">
      <header className="liked-songs__header">
        <span className="liked-songs__icon" aria-hidden="true">❤️</span>
        <h2 className="liked-songs__title">Liked Songs</h2>
        <span className="liked-songs__count-badge">{songs.length.toLocaleString()}</span>
        <button
          className="liked-songs__refresh-btn"
          onClick={() => refetch()}
          aria-label="Refresh liked songs"
          title="Refresh"
        >↻</button>
        <button
          className="liked-songs__btn liked-songs__btn--collapse"
          onClick={() => setExpanded(false)}
        >
          Collapse ▲
        </button>
      </header>

      {/* Column labels */}
      <div className="liked-songs__cols-header" aria-hidden="true">
        <span>#</span>
        <span>Title</span>
        <span>Album</span>
        <span>Duration</span>
      </div>

      <ul className="liked-songs__rows" aria-label="Liked songs">
        {songs.map((saved, index) => (
          <LikedSongRow key={saved.track.uri} saved={saved} index={index} />
        ))}
      </ul>

      {/* Restore limitation note */}
      <div className="liked-songs__restore-note">
        ℹ️ <strong>Restore note:</strong> Liked songs are restored using
        <code> PUT /me/library</code> in batches of 50 URIs.
        Order is not preserved — Spotify sorts by date liked.
      </div>
    </div>
  )
}

// ── Single liked song row ─────────────────────────────────────

function LikedSongRow({ saved, index }: { saved: SavedTrack; index: number }) {
  const { track } = saved
  const artists   = track.artists?.map(a => a.name).join(', ') ?? '—'
  const album     = track.album?.name ?? '—'
  const duration  = formatDuration(track.duration_ms ?? 0)

  // Format the liked date for a tooltip
  const likedDate = saved.added_at
    ? new Date(saved.added_at).toLocaleDateString(undefined, {
        year: 'month' in Date ? undefined : 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null

  return (
    <li
      className="liked-row"
      title={likedDate ? `Liked on ${likedDate}` : undefined}
    >
      <span className="liked-row__num">{index + 1}</span>

      <div className="liked-row__main">
        <span className="liked-row__name">{track.name || '[Untitled]'}</span>
        <span className="liked-row__artist">{artists}</span>
      </div>

      <span className="liked-row__album">{album}</span>
      <span className="liked-row__duration">{duration}</span>
    </li>
  )
}
