/**
 * TrackList — shows all tracks inside a selected playlist.
 *
 * Each track item is classified and displayed with an appropriate badge:
 *
 *  ✅ Normal track   → track name, artists, album, duration
 *  📁 Local file     → displayed but flagged — cannot be restored via API
 *  🎙 Episode        → podcast episode — skipped during restore
 *  ⚠  Unavailable   → geo-restricted — restore will try linked_from.uri
 *  ✖  Null           → deleted from Spotify — skipped during restore
 */

import { usePlaylistTracks }                from '../../hooks/usePlaylistTracks'
import {
  classifyItem,
  formatDuration,
} from '../../lib/spotifyApi'
import type { PlaylistItem, SpotifyTrack, SpotifyEpisode, TrackKind } from '../../lib/spotifyApi'
import type { SpotifyPlaylist }             from '../../lib/spotifyApi'
import type { AccountRole }                 from '../../lib/spotifyAuth'
import './TrackList.css'

interface TrackListProps {
  playlist: SpotifyPlaylist
  role:     AccountRole
}

export default function TrackList({ playlist, role }: TrackListProps) {
  const { tracks, status, progress, error, refetch } =
    usePlaylistTracks(role, playlist.id)

  // ── Loading ───────────────────────────────────────────────────
  if (status === 'loading') {
    const pct = progress && progress.total > 0
      ? Math.round((progress.fetched / progress.total) * 100)
      : 0

    return (
      <div className="track-list">
        <TrackListHeader playlist={playlist} />
        <div
          className="track-list__progress-bar"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="track-list__progress-fill"
            style={{ width: `${Math.max(pct, 5)}%` }}
          />
        </div>
        <p className="track-list__loading-text">
          Loading tracks{progress?.total ? ` — ${progress.fetched} of ${progress.total}` : ''}…
        </p>
        {/* Skeleton rows */}
        <ul className="track-list__rows">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="track-row track-row--skeleton" aria-hidden="true">
              <span className="track-row__num skeleton" style={{ width: 24, height: '1em' }} />
              <div className="track-row__main">
                <div className="skeleton skeleton-text" style={{ width: '55%' }} />
                <div className="skeleton skeleton-text" style={{ width: '40%', marginTop: 5 }} />
              </div>
              <div className="skeleton skeleton-text" style={{ width: '30%' }} />
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
      <div className="track-list">
        <TrackListHeader playlist={playlist} />
        <div className="track-list__error">
          <span aria-hidden="true">⚠️</span>
          <p>{error}</p>
          <button className="track-list__retry-btn" onClick={() => refetch()}>
            Try again
          </button>
        </div>
      </div>
    )
  }

  // ── Empty ─────────────────────────────────────────────────────
  if (status === 'success' && tracks.length === 0) {
    return (
      <div className="track-list">
        <TrackListHeader playlist={playlist} />
        <div className="track-list__empty">
          <span aria-hidden="true">🎵</span>
          <p>This playlist is empty.</p>
        </div>
      </div>
    )
  }

  // ── Count special items for the summary footer ────────────────
  const localCount       = tracks.filter(i => classifyItem(i) === 'local').length
  const episodeCount     = tracks.filter(i => classifyItem(i) === 'episode').length
  const unavailableCount = tracks.filter(i => classifyItem(i) === 'unavailable').length
  const nullCount        = tracks.filter(i => classifyItem(i) === 'null').length
  const restorableCount  =
    tracks.length - localCount - episodeCount - unavailableCount - nullCount

  // ── Success ───────────────────────────────────────────────────
  return (
    <div className="track-list">
      <TrackListHeader playlist={playlist} count={tracks.length} onRefetch={refetch} />

      {/* Column labels */}
      <div className="track-list__cols-header" aria-hidden="true">
        <span>#</span>
        <span>Title</span>
        <span>Album</span>
        <span>Duration</span>
      </div>

      <ul className="track-list__rows" aria-label={`Tracks in ${playlist.name}`}>
        {tracks.map((item, index) => (
          <TrackRow key={index} item={item} index={index} />
        ))}
      </ul>

      {/* Summary footer */}
      <div className="track-list__summary">
        <span className="track-list__summary-item track-list__summary-item--ok">
          ✅ {restorableCount} restorable
        </span>
        {localCount > 0 && (
          <span className="track-list__summary-item track-list__summary-item--local">
            📁 {localCount} local file{localCount > 1 ? 's' : ''} (cannot restore)
          </span>
        )}
        {episodeCount > 0 && (
          <span className="track-list__summary-item track-list__summary-item--episode">
            🎙 {episodeCount} episode{episodeCount > 1 ? 's' : ''} (skipped)
          </span>
        )}
        {unavailableCount > 0 && (
          <span className="track-list__summary-item track-list__summary-item--warn">
            ⚠ {unavailableCount} unavailable (will attempt via linked URI)
          </span>
        )}
        {nullCount > 0 && (
          <span className="track-list__summary-item track-list__summary-item--null">
            ✖ {nullCount} deleted (skipped)
          </span>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────

function TrackListHeader({
  playlist,
  count,
  onRefetch,
}: {
  playlist:  SpotifyPlaylist
  count?:    number
  onRefetch?: () => void
}) {
  return (
    <header className="track-list__header">
      <h3 className="track-list__title">
        🎵 {playlist.name}
      </h3>
      {count !== undefined && (
        <span className="track-list__count-badge">{count} tracks</span>
      )}
      {onRefetch && (
        <button
          className="track-list__refresh-btn"
          onClick={onRefetch}
          aria-label="Refresh tracks"
          title="Refresh"
        >
          ↻
        </button>
      )}
    </header>
  )
}

// ── Single track row ──────────────────────────────────────────

function TrackRow({ item, index }: { item: PlaylistItem; index: number }) {
  const kind = classifyItem(item)

  // ── NULL row — completely deleted track ───────────────────────
  if (kind === 'null') {
    return (
      <li className="track-row track-row--null">
        <span className="track-row__num">{index + 1}</span>
        <div className="track-row__main">
          <span className="track-row__name">
            [Deleted track]
            <span className="track-badge track-badge--null">✖ Deleted</span>
          </span>
        </div>
        <span className="track-row__album">—</span>
        <span className="track-row__duration">—</span>
      </li>
    )
  }

  // ── EPISODE row ───────────────────────────────────────────────
  if (kind === 'episode') {
    const ep = item.item as SpotifyEpisode
    return (
      <li className="track-row track-row--episode">
        <span className="track-row__num">{index + 1}</span>
        <div className="track-row__main">
          <span className="track-row__name">
            {ep.name}
            <span className="track-badge track-badge--episode">🎙 Episode</span>
          </span>
          <span className="track-row__artist">{ep.show?.name ?? '—'}</span>
        </div>
        <span className="track-row__album">—</span>
        <span className="track-row__duration">{formatDuration(ep.duration_ms)}</span>
      </li>
    )
  }

  // ── TRACK, LOCAL, or UNAVAILABLE row ─────────────────────────
  const track      = item.item as SpotifyTrack
  const artistList = track.artists?.map(a => a.name).join(', ') ?? '—'
  const albumName  = track.album?.name ?? '—'
  const duration   = formatDuration(track.duration_ms ?? 0)

  return (
    <li className={`track-row track-row--${kind}`}>
      <span className="track-row__num">{index + 1}</span>

      <div className="track-row__main">
        <span className="track-row__name">
          {track.name || '[Untitled]'}
          <KindBadge kind={kind} />
        </span>
        <span className="track-row__artist">{artistList}</span>
      </div>

      <span className="track-row__album">{albumName}</span>
      <span className="track-row__duration">{duration}</span>
    </li>
  )
}

function KindBadge({ kind }: { kind: TrackKind }) {
  if (kind === 'track')       return null   // no badge — normal track
  if (kind === 'local')       return <span className="track-badge track-badge--local">📁 Local</span>
  if (kind === 'unavailable') return <span className="track-badge track-badge--unavail">⚠ Unavailable</span>
  return null
}
