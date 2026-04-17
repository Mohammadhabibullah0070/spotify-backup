import { useAuth }              from '../hooks/useAuth'
import { usePlaylists }         from '../hooks/usePlaylists'
import { useLikedSongs }        from '../hooks/useLikedSongs'
import { useImportedBackup }    from '../context/BackupContext'
import AppLayout                from '../components/layout/AppLayout'
import AccountCard              from '../components/AccountCard/AccountCard'
import SameAccountWarning       from '../components/SameAccountWarning/SameAccountWarning'
import StatusPanel              from '../components/StatusPanel/StatusPanel'
import LikedSongs               from '../components/LikedSongs/LikedSongs'
import PlaylistList             from '../components/PlaylistList/PlaylistList'
import BackupButton             from '../components/BackupButton/BackupButton'
import ImportPanel              from '../components/ImportPanel/ImportPanel'
import RestorePanel             from '../components/RestorePanel/RestorePanel'
import './HomePage.css'

function HomePage() {
  const { source, destination, logoutAs } = useAuth()
  const { importedBackup }                = useImportedBackup()

  const { playlists, status: playlistStatus } = usePlaylists('source')
  const { songs,     status: likedStatus }    = useLikedSongs('source')

  const playlistsReady  = playlistStatus === 'success'
  const likedSongsReady = likedStatus    === 'success'

  const sameAccount =
    source?.user && destination?.user &&
    source.user.id === destination.user.id

  // Show the RestorePanel when backup is imported AND destination is connected
  const showRestorePanel = !!importedBackup && !!destination?.user

  return (
    <AppLayout>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="hero">
        <h1 className="hero__title">Spotify Backup</h1>
        <p className="hero__tagline">
          Back up your Spotify playlists, liked songs, and library —
          then restore them to any account. Simple, private, no server needed.
        </p>
        <div className="hero__badges">
          <span className="badge">🔒 PKCE Auth</span>
          <span className="badge">📦 Export to JSON</span>
          <span className="badge">♻️ Restore to any account</span>
          <span className="badge">⚡ 100% client-side</span>
        </div>
      </section>

      {/* ── Steps ────────────────────────────────────────────── */}
      <section className="steps">
        <div className="step">
          <span className="step__number">1</span>
          <p className="step__text">Connect <strong>Source</strong> → click <strong>Backup</strong></p>
        </div>
        <div className="step__arrow" aria-hidden="true">→</div>
        <div className="step">
          <span className="step__number">2</span>
          <p className="step__text"><strong>Import</strong> the backup file</p>
        </div>
        <div className="step__arrow" aria-hidden="true">→</div>
        <div className="step">
          <span className="step__number">3</span>
          <p className="step__text">Connect <strong>Destination</strong> → <strong>Restore</strong></p>
        </div>
      </section>

      {/* ── Account Cards ────────────────────────────────────── */}
      <section className="accounts" aria-label="Account slots">
        <AccountCard role="source" />
        <AccountCard role="destination" />
      </section>

      {/* ── Same-account warning ──────────────────────────────── */}
      {sameAccount && source?.user && (
        <SameAccountWarning
          userId={source.user.id}
          displayName={source.user.display_name}
          onDisconnectDest={() => logoutAs('destination')}
        />
      )}

      {/* ── Backup side (source connected) ───────────────────── */}
      {source && (
        <>
          <section className="section-backup" aria-label="Export backup">
            <BackupButton
              playlists={playlists}
              likedSongs={songs}
              likedSongsReady={likedSongsReady}
              playlistsReady={playlistsReady}
            />
          </section>
          <section className="section-liked" aria-label="Source liked songs">
            <LikedSongs role="source" />
          </section>
          <section className="section-playlists" aria-label="Source account playlists">
            <PlaylistList role="source" />
          </section>
        </>
      )}

      {/* ── Import (always visible) ───────────────────────────── */}
      <section className="section-import" aria-label="Import backup">
        <ImportPanel />
      </section>

      {/* ── Restore Panel (backup loaded + destination connected) */}
      {showRestorePanel && (
        <section className="section-restore" aria-label="Restore to destination">
          <RestorePanel />
        </section>
      )}

      <StatusPanel />
    </AppLayout>
  )
}

export default HomePage
