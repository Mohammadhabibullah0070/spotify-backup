/**
 * BackupButton — the main action component for Milestone 7.
 *
 * Renders four visual states:
 *
 *  idle     → "📦 Download Backup" button + summary of what will be exported
 *  fetching → Progress bar + "Fetching playlist X of N: [name]" label
 *  building → "Building JSON…" spinner
 *  done     → ✅ Success card showing filename, size, counts, warnings
 *  error    → ⚠️ Error banner with retry button
 *
 * The component receives the already-fetched playlists and likedSongs
 * from the parent (HomePage) — it does not fetch them itself.
 * It only fetches individual playlist tracks (which requires one API
 * call per playlist, handled inside useBackup).
 */

import { useBackup }      from '../../hooks/useBackup'
import type { SpotifyPlaylist } from '../../lib/spotifyApi'
import type { SavedTrack }      from '../../lib/spotifyApi'
import './BackupButton.css'

interface BackupButtonProps {
  playlists:        SpotifyPlaylist[]
  likedSongs:       SavedTrack[]
  likedSongsReady:  boolean    // false while liked songs are still loading
  playlistsReady:   boolean    // false while playlist list is still loading
}

export default function BackupButton({
  playlists,
  likedSongs,
  likedSongsReady,
  playlistsReady,
}: BackupButtonProps) {
  const { status, progress, result, error, startBackup, reset } = useBackup()

  const isReady    = likedSongsReady && playlistsReady
  const isWorking  = status === 'fetching' || status === 'building'

  // ── Progress bar percentage ───────────────────────────────────
  let pct = 0
  if (status === 'fetching' && progress) {
    // Overall playlist progress
    const playlistPct = ((progress.playlistIndex - 1) / progress.playlistTotal) * 100
    // Within current playlist (track fetch sub-progress)
    const trackPct = progress.tracksTotal > 0
      ? (progress.tracksFetched / progress.tracksTotal) * (1 / progress.playlistTotal) * 100
      : 0
    pct = Math.round(playlistPct + trackPct)
  }
  if (status === 'building') pct = 98   // almost done
  if (status === 'done')     pct = 100

  // ── IDLE ──────────────────────────────────────────────────────
  if (status === 'idle') {
    return (
      <div className="backup-panel">
        <div className="backup-panel__info">
          <span className="backup-panel__icon" aria-hidden="true">📦</span>
          <div className="backup-panel__text">
            <h2 className="backup-panel__title">Export Backup</h2>
            <p className="backup-panel__desc">
              Downloads a JSON file containing your liked songs and all
              playlist tracks — ready to restore later.
            </p>
            {isReady && (
              <ul className="backup-panel__preview">
                <li>❤️ <strong>{likedSongs.length.toLocaleString()}</strong> liked songs</li>
                <li>🎵 <strong>{playlists.length}</strong> playlists</li>
                <li>📁 Local files and ⚠ unavailable tracks will be labelled in the export</li>
              </ul>
            )}
            {!isReady && (
              <p className="backup-panel__waiting">
                ⏳ Waiting for liked songs and playlists to finish loading…
              </p>
            )}
          </div>
        </div>
        <button
          className="backup-panel__btn"
          disabled={!isReady}
          onClick={() => startBackup(playlists, likedSongs)}
        >
          📦 Download Backup
        </button>
      </div>
    )
  }

  // ── FETCHING / BUILDING ───────────────────────────────────────
  if (status === 'fetching' || status === 'building') {
    return (
      <div className="backup-panel backup-panel--working">
        <div className="backup-panel__progress-header">
          <span className="backup-panel__icon" aria-hidden="true">⏳</span>
          <h2 className="backup-panel__title">
            {status === 'building' ? 'Building JSON…' : 'Fetching tracks…'}
          </h2>
        </div>

        <div
          className="backup-panel__bar"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="backup-panel__bar-fill" style={{ width: `${Math.max(pct, 3)}%` }} />
        </div>

        {status === 'fetching' && progress && (
          <div className="backup-panel__detail">
            <span className="backup-panel__detail-main">
              Playlist {progress.playlistIndex} of {progress.playlistTotal}:
              &nbsp;<strong>{progress.playlistName}</strong>
            </span>
            {progress.tracksTotal > 0 && (
              <span className="backup-panel__detail-sub">
                {progress.tracksFetched} / {progress.tracksTotal} tracks
              </span>
            )}
          </div>
        )}
        {status === 'building' && (
          <p className="backup-panel__detail-main">
            Assembling your backup file…
          </p>
        )}
      </div>
    )
  }

  // ── ERROR ─────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <div className="backup-panel backup-panel--error">
        <span aria-hidden="true">⚠️</span>
        <p>{error}</p>
        <button className="backup-panel__retry" onClick={reset}>Try again</button>
      </div>
    )
  }

  // ── DONE ──────────────────────────────────────────────────────
  if (status === 'done' && result) {
    return (
      <div className="backup-panel backup-panel--done">
        <div className="backup-panel__done-header">
          <span className="backup-panel__icon" aria-hidden="true">✅</span>
          <h2 className="backup-panel__title">Backup downloaded!</h2>
        </div>

        <div className="backup-panel__done-stats">
          <Stat label="File" value={result.filename} mono />
          <Stat label="Size" value={result.fileSize} />
          <Stat label="Liked songs" value={result.totalLiked.toLocaleString()} />
          <Stat label="Playlists" value={result.totalPlaylists.toLocaleString()} />
          <Stat label="Playlist tracks" value={result.totalTracks.toLocaleString()} />
        </div>

        {result.warnings.length > 0 && (
          <details className="backup-panel__warnings">
            <summary>
              ⚠ {result.warnings.length} playlist{result.warnings.length > 1 ? 's' : ''} skipped
            </summary>
            <ul>
              {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </details>
        )}

        <div className="backup-panel__done-actions">
          <button
            className="backup-panel__btn backup-panel__btn--secondary"
            onClick={() => startBackup(playlists, likedSongs)}
          >
            ↻ Export again
          </button>
          <button className="backup-panel__btn" onClick={reset}>
            Done
          </button>
        </div>
      </div>
    )
  }

  return null
}

// ── Stat row ──────────────────────────────────────────────────
function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="backup-stat">
      <span className="backup-stat__label">{label}</span>
      <span className={`backup-stat__value${mono ? ' backup-stat__value--mono' : ''}`}>
        {value}
      </span>
    </div>
  )
}
