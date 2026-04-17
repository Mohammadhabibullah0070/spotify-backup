/**
 * PlaylistList — shows all playlists for a given account role.
 *
 * NEW in Milestone 5:
 *  - Playlist rows are now clickable
 *  - Clicking a row selects it and shows a TrackList below the playlist panel
 *  - Clicking again deselects (collapses the track view)
 *  - An expand arrow (▶ / ▼) shows which row is selected
 */

import { useState }   from 'react'
import { useAuth }    from '../../hooks/useAuth'
import { usePlaylists } from '../../hooks/usePlaylists'
import TrackList      from '../TrackList/TrackList'
import type { SpotifyPlaylist } from '../../lib/spotifyApi'
import type { AccountRole }    from '../../lib/spotifyAuth'
import './PlaylistList.css'

interface PlaylistListProps {
  role: AccountRole
}

export default function PlaylistList({ role }: PlaylistListProps) {
  const { source, destination } = useAuth()
  const account       = role === 'source' ? source : destination
  const currentUserId = account?.user?.id

  const { playlists, status, progress, error, refetch } = usePlaylists(role)

  // Which playlist has its track list expanded?
  const [selectedPlaylist, setSelectedPlaylist] = useState<SpotifyPlaylist | null>(null)

  function handleRowClick(playlist: SpotifyPlaylist) {
    // Toggle: click the same row again to collapse
    setSelectedPlaylist(prev => prev?.id === playlist.id ? null : playlist)
  }

  // ── LOADING ───────────────────────────────────────────────────
  if (status === 'loading') {
    const pct = progress && progress.total > 0
      ? Math.round((progress.fetched / progress.total) * 100)
      : 0

    return (
      <div className="playlist-list">
        <header className="playlist-list__header">
          <h2 className="playlist-list__title">Source Playlists</h2>
          <span className="playlist-list__status-text">
            Loading{progress?.total ? ` ${progress.fetched} of ${progress.total}` : ''}…
          </span>
        </header>
        <div className="playlist-list__progress-bar" role="progressbar"
          aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="playlist-list__progress-fill" style={{ width: `${pct || 8}%` }} />
        </div>
        <ul className="playlist-list__rows" aria-label="Loading playlists">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="playlist-row playlist-row--skeleton" aria-hidden="true">
              <div className="skeleton playlist-row__cover" />
              <div className="playlist-row__info">
                <div className="skeleton skeleton-text" style={{ width: '50%' }} />
                <div className="skeleton skeleton-text" style={{ width: '35%', marginTop: '6px' }} />
              </div>
              <div className="skeleton skeleton-text" style={{ width: '40px' }} />
            </li>
          ))}
        </ul>
      </div>
    )
  }

  // ── ERROR ─────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <div className="playlist-list">
        <header className="playlist-list__header">
          <h2 className="playlist-list__title">Source Playlists</h2>
        </header>
        <div className="playlist-list__error">
          <span aria-hidden="true">⚠️</span>
          <p className="playlist-list__error-msg">{error}</p>
          <button className="playlist-list__retry-btn" onClick={() => refetch()}>Try again</button>
        </div>
      </div>
    )
  }

  // ── EMPTY ─────────────────────────────────────────────────────
  if (status === 'success' && playlists.length === 0) {
    return (
      <div className="playlist-list">
        <header className="playlist-list__header">
          <h2 className="playlist-list__title">Source Playlists</h2>
          <span className="playlist-list__count-badge">0</span>
        </header>
        <div className="playlist-list__empty">
          <span aria-hidden="true">🎵</span>
          <p>No playlists found on this account.</p>
          <p className="playlist-list__empty-sub">Spotify only returns playlists you own or follow.</p>
        </div>
      </div>
    )
  }

  // ── SUCCESS ───────────────────────────────────────────────────
  return (
    <>
      <div className="playlist-list">
        <header className="playlist-list__header">
          <h2 className="playlist-list__title">Source Playlists</h2>
          <span className="playlist-list__count-badge">{playlists.length}</span>
          <button
            className="playlist-list__refresh-btn"
            onClick={() => { setSelectedPlaylist(null); refetch() }}
            aria-label="Refresh playlist list"
            title="Refresh"
          >↻</button>
        </header>

        {selectedPlaylist && (
          <p className="playlist-list__hint">
            Click a playlist again to collapse its track list.
          </p>
        )}
        {!selectedPlaylist && (
          <p className="playlist-list__hint">
            Click any playlist to view its tracks.
          </p>
        )}

        {/* Column labels */}
        <div className="playlist-list__cols-header" aria-hidden="true">
          <span />
          <span>Playlist</span>
          <span>Tracks</span>
          <span>Visibility</span>
          <span />
        </div>

        <ul className="playlist-list__rows" aria-label="Playlists">
          {playlists.map((playlist) => (
            <PlaylistRow
              key={playlist.id}
              playlist={playlist}
              currentUserId={currentUserId}
              isSelected={selectedPlaylist?.id === playlist.id}
              onClick={() => handleRowClick(playlist)}
            />
          ))}
        </ul>
      </div>

      {/* TrackList panel — shown below PlaylistList when a playlist is selected */}
      {selectedPlaylist && (
        <TrackList playlist={selectedPlaylist} role={role} />
      )}
    </>
  )
}

// ── PlaylistRow ───────────────────────────────────────────────

interface PlaylistRowProps {
  playlist:      SpotifyPlaylist
  currentUserId: string | undefined
  isSelected:    boolean
  onClick:       () => void
}

function PlaylistRow({ playlist, currentUserId, isSelected, onClick }: PlaylistRowProps) {
  const isOwner         = playlist.owner.id === currentUserId
  const isCollaborative = playlist.collaborative
  const coverUrl        = playlist.images?.[0]?.url ?? null

  let visibilityLabel: string
  let visibilityClass: string

  if (isCollaborative) {
    visibilityLabel = 'Collaborative'; visibilityClass = 'badge--collab'
  } else if (playlist.public === true) {
    visibilityLabel = 'Public';  visibilityClass = 'badge--public'
  } else if (playlist.public === false) {
    visibilityLabel = 'Private'; visibilityClass = 'badge--private'
  } else {
    visibilityLabel = 'Unknown'; visibilityClass = 'badge--unknown'
  }

  return (
    <li
      className={`playlist-row${isSelected ? ' playlist-row--selected' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onClick()}
    >
      {/* Cover art */}
      <div className="playlist-row__cover-wrap">
        {coverUrl ? (
          <img src={coverUrl} alt="" width="40" height="40" loading="lazy" className="playlist-row__cover" />
        ) : (
          <div className="playlist-row__cover playlist-row__cover--placeholder" aria-hidden="true">🎵</div>
        )}
      </div>

      {/* Name + owner */}
      <div className="playlist-row__info">
        <span className="playlist-row__name">{playlist.name || 'Untitled playlist'}</span>
        <span className="playlist-row__owner">
          {playlist.owner.display_name ?? playlist.owner.id}
          {isOwner && <span className="playlist-row__you-tag">You</span>}
        </span>
      </div>

      {/* Track count */}
      <span className="playlist-row__tracks">
        {playlist.items?.total?.toLocaleString() ?? '—'}
      </span>

      {/* Visibility badge */}
      <span className={`playlist-row__badge ${visibilityClass}`}>{visibilityLabel}</span>

      {/* Expand arrow */}
      <span className="playlist-row__arrow" aria-hidden="true">
        {isSelected ? '▼' : '▶'}
      </span>
    </li>
  )
}
