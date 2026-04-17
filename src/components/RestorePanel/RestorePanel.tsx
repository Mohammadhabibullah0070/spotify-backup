/**
 * RestorePanel — multi-step restore coordinator.
 *
 * Visible when: importedBackup is loaded AND destination is connected.
 *
 *   Step 1 — Create empty playlists   (Milestone 10 ✅)
 *   Step 2 — Add tracks               (Milestone 11 ✅)
 *   Step 3 — Restore liked songs      (Milestone 12 ✅)
 */

import { useImportedBackup }        from '../../context/BackupContext'
import { useAuth }                  from '../../hooks/useAuth'
import { usePlaylistCreator }       from '../../hooks/usePlaylistCreator'
import { useTrackRestorer }         from '../../hooks/useTrackRestorer'
import { useLikedSongsRestorer }    from '../../hooks/useLikedSongsRestorer'
import './RestorePanel.css'

export default function RestorePanel() {
  const { importedBackup, playlistMap } = useImportedBackup()
  const { destination }                 = useAuth()
  const creator                         = usePlaylistCreator()
  const restorer                        = useTrackRestorer()
  const likedRestorer                   = useLikedSongsRestorer()

  if (!importedBackup || !destination?.user) return null

  const backup       = importedBackup
  const destName     = destination.user.display_name ?? destination.user.id
  const toCreate     = backup.playlists.filter(p => !p.skipped).length
  const skippedCount = backup.playlists.length - toCreate

  // ── Step tracker state ────────────────────────────────────
  const step1Status: StepStatus =
    creator.status === 'done'     ? 'done' :
    creator.status === 'creating' ? 'active' : 'idle'

  const step2Status: StepStatus =
    !playlistMap                   ? 'locked' :
    restorer.status === 'done'     ? 'done' :
    restorer.status === 'restoring'? 'active' : 'idle'

  const step3Status: StepStatus =
    restorer.status !== 'done'          ? 'locked' :
    likedRestorer.status === 'done'     ? 'done' :
    likedRestorer.status === 'restoring'? 'active' : 'idle'

  // ── Progress ──────────────────────────────────────────────
  const creatorPct =
    creator.status === 'creating' && creator.progress
      ? Math.round((creator.progress.current / creator.progress.total) * 100)
      : creator.status === 'done' ? 100 : 0

  const restorerPct =
    restorer.status === 'restoring' && restorer.progress
      ? restorer.progress.tracksTotal > 0
          ? Math.round((restorer.progress.tracksAdded / restorer.progress.tracksTotal) * 100)
          : 0
      : restorer.status === 'done' ? 100 : 0

  const likedPct =
    likedRestorer.status === 'restoring' && likedRestorer.progress
      ? likedRestorer.progress.total > 0
          ? Math.round((likedRestorer.progress.saved / likedRestorer.progress.total) * 100)
          : 0
      : likedRestorer.status === 'done' ? 100 : 0

  return (
    <div className="restore-panel">

      {/* ── Header ──────────────────────────────────────────── */}
      <header className="restore-panel__header">
        <span className="restore-panel__icon" aria-hidden="true">♻️</span>
        <div>
          <h2 className="restore-panel__title">Restore to Destination</h2>
          <p className="restore-panel__subtitle">
            <strong>{backup.source.displayName ?? backup.source.id}</strong>
            {' '}→ <strong>{destName}</strong>
          </p>
        </div>
      </header>

      {/* ── Step tracker ────────────────────────────────────── */}
      <div className="restore-steps" aria-label="Restore steps">
        <Step num={1} label="Create playlists" status={step1Status} />
        <div className="restore-steps__connector" aria-hidden="true" />
        <Step num={2} label="Add tracks"       status={step2Status} />
        <div className="restore-steps__connector" aria-hidden="true" />
        <Step num={3} label="Liked songs"      status={step3Status} />
      </div>

      {/* ════════════════════════════════════════════════════════
          STEP 1 — Create empty playlists
          ════════════════════════════════════════════════════════ */}
      <section className="restore-panel__step-body" aria-label="Step 1: Create playlists">
        <h3 className="restore-panel__step-heading">Step 1 — Create Empty Playlists</h3>

        {/* Idle */}
        {creator.status === 'idle' && (
          <>
            <div className="restore-summary">
              <SummaryRow icon="🎵" label="Playlists to create"   value={toCreate} />
              {skippedCount > 0 && (
                <SummaryRow icon="⏭" label="Skipped (no track data)" value={skippedCount} muted />
              )}
            </div>
            <button className="restore-panel__btn" onClick={() => creator.startCreating()}>
              🎵 Create {toCreate} playlists
            </button>
          </>
        )}

        {/* Creating */}
        {creator.status === 'creating' && creator.progress && (
          <>
            <p className="restore-panel__progress-label">
              Creating playlist {creator.progress.current} of {creator.progress.total}:{' '}
              <strong>{creator.progress.playlistName}</strong>
            </p>
            <ProgressBar pct={creatorPct} />
          </>
        )}

        {/* Done */}
        {(creator.status === 'done' || creator.status === 'idle' && playlistMap) && creator.result && (
          <>
            <div className="restore-summary restore-summary--done">
              <SummaryRow icon="✅" label="Playlists created"     value={creator.result.created} />
              {creator.result.skipped > 0 && (
                <SummaryRow icon="⏭" label="Skipped"             value={creator.result.skipped} muted />
              )}
              {creator.result.failed > 0 && (
                <SummaryRow icon="❌" label="Failed"              value={creator.result.failed} error />
              )}
            </div>
            {creator.result.warnings.length > 0 && (
              <WarningList warnings={creator.result.warnings} />
            )}
          </>
        )}

        {creator.status === 'error' && (
          <ErrorBox message={creator.error ?? 'Unknown error'} onRetry={() => creator.reset()} />
        )}
      </section>

      {/* ════════════════════════════════════════════════════════
          STEP 2 — Add tracks to playlists
          ════════════════════════════════════════════════════════ */}
      <section
        className={`restore-panel__step-body${!playlistMap ? ' restore-panel__step-body--locked' : ''}`}
        aria-label="Step 2: Add tracks"
      >
        <h3 className="restore-panel__step-heading">
          Step 2 — Add Tracks
          {!playlistMap && <span className="restore-panel__locked-badge">🔒 Complete Step 1 first</span>}
        </h3>

        {/* Locked */}
        {!playlistMap && (
          <p className="restore-panel__locked-note">
            Step 1 must finish before tracks can be added. Click{' '}
            <strong>"Create playlists"</strong> above.
          </p>
        )}

        {/* Idle (playlists exist, restore not started) */}
        {playlistMap && restorer.status === 'idle' && (
          <>
            <div className="restore-summary">
              <SummaryRow icon="🎶" label="Total tracks in backup"   value={backup.stats.totalPlaylistTracks} />
              <SummaryRow icon="⏭" label="Local files (will skip)"   value={backup.stats.localFilesCount}   muted />
              <SummaryRow icon="⏭" label="Podcast episodes (skip)"   value={backup.stats.episodesCount}     muted />
              <SummaryRow icon="⚠" label="Unavailable (will attempt)" value={backup.stats.unavailableCount} muted />
              <SummaryRow icon="⏭" label="Deleted tracks (skip)"     value={backup.stats.nullTracksCount}   muted />
            </div>
            <div className="restore-panel__limitations">
              <p className="restore-panel__limitations-title">ℹ️ How tracks are handled:</p>
              <ul>
                <li>✅ Normal tracks added using their Spotify URI</li>
                <li>✅ Duplicate URIs within a playlist are deduplicated automatically</li>
                <li>⚠️ <strong>Running restore twice</strong> WILL create duplicates on Spotify</li>
                <li>⚠️ Unavailable tracks: we try the linked URI first, then fall back</li>
                <li>❌ Local files cannot be added via API — they are skipped</li>
                <li>❌ Podcast episodes cannot be added to music playlists — skipped</li>
                <li>❌ Deleted Spotify tracks are skipped (null entries)</li>
              </ul>
            </div>
            <button
              className="restore-panel__btn"
              onClick={() => restorer.startRestoring()}
            >
              🎶 Add tracks to all playlists
            </button>
          </>
        )}

        {/* Restoring */}
        {restorer.status === 'restoring' && restorer.progress && (
          <>
            <p className="restore-panel__progress-label">
              Playlist {restorer.progress.playlistIndex} of {restorer.progress.playlistTotal}:{' '}
              <strong>{restorer.progress.playlistName}</strong>
            </p>
            <p className="restore-panel__progress-sub">
              Batch {restorer.progress.batchIndex} of {restorer.progress.batchTotal}
              {' — '}{restorer.progress.tracksAdded.toLocaleString()} tracks added so far
            </p>
            <ProgressBar pct={restorerPct} />
          </>
        )}

        {/* Done */}
        {restorer.status === 'done' && restorer.result && (
          <>
            <div className="restore-summary restore-summary--done">
              <SummaryRow icon="✅" label="Tracks added"            value={restorer.result.added} />
              {restorer.result.skippedLocal > 0 && (
                <SummaryRow icon="💾" label="Local files skipped"   value={restorer.result.skippedLocal} muted />
              )}
              {restorer.result.skippedEpisode > 0 && (
                <SummaryRow icon="🎙" label="Episodes skipped"      value={restorer.result.skippedEpisode} muted />
              )}
              {restorer.result.attemptedUnavailable > 0 && (
                <SummaryRow icon="⚠" label="Unavailable (attempted)" value={restorer.result.attemptedUnavailable} muted />
              )}
              {restorer.result.skippedNull > 0 && (
                <SummaryRow icon="🗑" label="Deleted tracks skipped" value={restorer.result.skippedNull} muted />
              )}
              {restorer.result.failed > 0 && (
                <SummaryRow icon="❌" label="Failed"                 value={restorer.result.failed} error />
              )}
            </div>

            {restorer.result.warnings.length > 0 && (
              <WarningList warnings={restorer.result.warnings} />
            )}

            <div className="restore-panel__done-note">
              ✅ Tracks restored to <strong>{destName}</strong>'s playlists.
              Continue to <strong>Step 3</strong> to restore liked songs.
            </div>

            <button
              className="restore-panel__btn restore-panel__btn--secondary"
              onClick={() => restorer.reset()}
            >
              ↻ Run again
            </button>
          </>
        )}

        {restorer.status === 'error' && (
          <ErrorBox message={restorer.error ?? 'Unknown error'} onRetry={() => restorer.reset()} />
        )}
      </section>

      {/* ════════════════════════════════════════════════════════
          STEP 3 — Restore liked songs
          ════════════════════════════════════════════════════════ */}
      <section
        className={`restore-panel__step-body${restorer.status !== 'done' ? ' restore-panel__step-body--locked' : ''}`}
        aria-label="Step 3: Restore liked songs"
      >
        <h3 className="restore-panel__step-heading">
          Step 3 — Liked Songs
          {restorer.status !== 'done' && (
            <span className="restore-panel__locked-badge">🔒 Complete Step 2 first</span>
          )}
        </h3>

        {/* Locked */}
        {restorer.status !== 'done' && (
          <p className="restore-panel__locked-note">
            Complete Step 2 (Add Tracks) before restoring liked songs.
          </p>
        )}

        {/* Idle */}
        {restorer.status === 'done' && likedRestorer.status === 'idle' && (
          <>
            <div className="restore-summary">
              <SummaryRow icon="❤️"  label="Liked songs in backup"  value={backup.likedSongs.total} />
              <SummaryRow icon="⏭"  label="Local files (will skip)" value={backup.stats.localFilesCount} muted />
            </div>
            <div className="restore-panel__limitations">
              <p className="restore-panel__limitations-title">ℹ️ How liked songs are handled:</p>
              <ul>
                <li>✅ Tracks saved using <code>PUT /me/library</code> (Spotify 2026 API)</li>
                <li>✅ Processed in batches of 50 with rate-limit protection</li>
                <li>⚠️ Original "liked" order is <strong>not preserved</strong> — Spotify always sorts by recently added</li>
                <li>⚠️ Running this twice will <strong>not</strong> create duplicates (library saves are idempotent)</li>
                <li>❌ Local files skipped — no Spotify URI</li>
                <li>❌ Podcast episodes skipped — cannot be saved to track library</li>
              </ul>
            </div>
            <button
              className="restore-panel__btn"
              onClick={() => likedRestorer.startRestoring()}
            >
              ❤️ Restore {backup.likedSongs.total.toLocaleString()} liked songs
            </button>
          </>
        )}

        {/* Restoring */}
        {likedRestorer.status === 'restoring' && likedRestorer.progress && (
          <>
            <p className="restore-panel__progress-label">
              Saving liked songs… batch {likedRestorer.progress.batch} of {likedRestorer.progress.batches}
            </p>
            <p className="restore-panel__progress-sub">
              {likedRestorer.progress.saved.toLocaleString()} of {likedRestorer.progress.total.toLocaleString()} saved
            </p>
            <ProgressBar pct={likedPct} />
          </>
        )}

        {/* Done */}
        {likedRestorer.status === 'done' && likedRestorer.result && (
          <>
            <div className="restore-summary restore-summary--done">
              <SummaryRow icon="✅" label="Liked songs saved"       value={likedRestorer.result.saved} />
              {likedRestorer.result.skippedLocal > 0 && (
                <SummaryRow icon="💾" label="Local files skipped"   value={likedRestorer.result.skippedLocal} muted />
              )}
              {likedRestorer.result.skippedEpisode > 0 && (
                <SummaryRow icon="🎙" label="Episodes skipped"      value={likedRestorer.result.skippedEpisode} muted />
              )}
              {likedRestorer.result.skippedNull > 0 && (
                <SummaryRow icon="🗑" label="Deleted tracks skipped" value={likedRestorer.result.skippedNull} muted />
              )}
              {likedRestorer.result.failed > 0 && (
                <SummaryRow icon="❌" label="Failed"                 value={likedRestorer.result.failed} error />
              )}
            </div>
            {likedRestorer.result.warnings.length > 0 && (
              <WarningList warnings={likedRestorer.result.warnings} />
            )}
            <div className="restore-panel__done-note">
              ✅ All done! Liked songs restored to <strong>{destName}</strong>'s library.
            </div>
            <button
              className="restore-panel__btn restore-panel__btn--secondary"
              onClick={() => likedRestorer.reset()}
            >
              ↻ Run again
            </button>
          </>
        )}

        {likedRestorer.status === 'error' && (
          <ErrorBox message={likedRestorer.error ?? 'Unknown error'} onRetry={() => likedRestorer.reset()} />
        )}
      </section>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

type StepStatus = 'idle' | 'active' | 'done' | 'locked'

function Step({ num, label, status, note }: {
  num:    number
  label:  string
  status: StepStatus
  note?:  string
}) {
  return (
    <div className={`restore-step restore-step--${status}`}
         aria-current={status === 'active' ? 'step' : undefined}>
      <div className="restore-step__circle">
        {status === 'done' ? '✓' : num}
      </div>
      <div className="restore-step__text">
        <span className="restore-step__label">{label}</span>
        {note && status === 'locked' && (
          <span className="restore-step__note">{note}</span>
        )}
      </div>
    </div>
  )
}

function SummaryRow({ icon, label, value, muted, error }: {
  icon:   string
  label:  string
  value:  number
  muted?: boolean
  error?: boolean
}) {
  return (
    <div className={
      `restore-summary__row` +
      (muted  ? ' restore-summary__row--muted' : '') +
      (error  ? ' restore-summary__row--error' : '')
    }>
      <span>{icon} {label}</span>
      <strong>{value.toLocaleString()}</strong>
    </div>
  )
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <>
      <div className="restore-panel__bar"
           role="progressbar"
           aria-valuenow={pct}
           aria-valuemin={0}
           aria-valuemax={100}>
        <div className="restore-panel__bar-fill" style={{ width: `${Math.max(pct, 3)}%` }} />
      </div>
      <p className="restore-panel__bar-label">{pct}%</p>
    </>
  )
}

function WarningList({ warnings }: { warnings: string[] }) {
  return (
    <details className="restore-panel__warnings">
      <summary>⚠ {warnings.length} notice{warnings.length !== 1 ? 's' : ''}</summary>
      <ul>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
    </details>
  )
}

function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="restore-panel__error">
      <span aria-hidden="true">⚠️</span>
      <p>{message}</p>
      <button className="restore-panel__btn" onClick={onRetry}>Try again</button>
    </div>
  )
}
