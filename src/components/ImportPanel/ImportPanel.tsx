/**
 * ImportPanel — file upload + validation + preview for Milestone 8.
 *
 * States:
 *  idle      → drag-and-drop zone + "Browse" button
 *  reading   → "Reading file…" spinner
 *  preview   → validation passed, show backup metadata card
 *  confirmed → backup stored in BackupContext, ready for Milestone 9
 *  error     → validation failed, list of specific errors
 *
 * The component accepts:
 *  • Click to browse (hidden <input type="file">)
 *  • Drag and drop a .json file onto the zone
 */

import { useState, useRef, useCallback, useId } from 'react'
import { readAndValidateBackupFile } from '../../lib/validateBackup'
import { useImportedBackup }         from '../../context/BackupContext'
import type { SpotifyBackup }        from '../../lib/backupFormat'
import './ImportPanel.css'

type PanelState = 'idle' | 'reading' | 'preview' | 'confirmed' | 'error'

export default function ImportPanel() {
  const { setImportedBackup } = useImportedBackup()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneId   = useId()

  const [state,     setState]     = useState<PanelState>('idle')
  const [errors,    setErrors]    = useState<string[]>([])
  const [warnings,  setWarnings]  = useState<string[]>([])
  const [preview,   setPreview]   = useState<SpotifyBackup | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  // ── Process a file (from click or drag) ──────────────────────
  const processFile = useCallback(async (file: File) => {
    setState('reading')
    setErrors([])
    setWarnings([])
    setPreview(null)

    const result = await readAndValidateBackupFile(file)

    if (!result.valid) {
      setErrors(result.errors)
      setState('error')
      return
    }

    setPreview(result.backup)
    setWarnings(result.warnings)
    setState('preview')
  }, [])

  // ── Input onChange ────────────────────────────────────────────
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    // Reset so user can re-select same file if needed
    e.target.value = ''
  }

  // ── Drag & drop handlers ──────────────────────────────────────
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  const handleDragOver  = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true) }
  const handleDragLeave = ()                      => setIsDragOver(false)

  // ── Confirm: store in context ─────────────────────────────────
  const handleConfirm = () => {
    if (!preview) return
    setImportedBackup(preview)
    setState('confirmed')
  }

  // ── Reset ─────────────────────────────────────────────────────
  const handleReset = () => {
    setState('idle')
    setErrors([])
    setWarnings([])
    setPreview(null)
    setImportedBackup(null)
  }

  // ── IDLE / ERROR — show drop zone ─────────────────────────────
  if (state === 'idle' || state === 'error') {
    return (
      <div className="import-panel">
        <header className="import-panel__header">
          <span className="import-panel__icon" aria-hidden="true">🔄</span>
          <h2 className="import-panel__title">Restore from Backup</h2>
          <p className="import-panel__subtitle">
            Import a backup JSON file to restore your library to any account.
          </p>
        </header>

        {/* Drop zone */}
        <div
          className={`import-drop${isDragOver ? ' import-drop--over' : ''}`}
          role="button"
          tabIndex={0}
          aria-label="Drop backup JSON file here or press Enter to browse"
          aria-describedby={dropZoneId}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && fileInputRef.current?.click()}
        >
          <span className="import-drop__emoji" aria-hidden="true">📂</span>
          <p className="import-drop__main" id={dropZoneId}>
            Drop your <code>spotify-backup-*.json</code> file here
          </p>
          <p className="import-drop__sub">or click to browse</p>
          <span className="import-drop__hint">Max 20 MB · JSON only</span>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={handleInputChange}
          aria-hidden="true"
        />

        {/* Error list */}
        {state === 'error' && errors.length > 0 && (
          <div className="import-panel__errors" role="alert">
            <p className="import-panel__error-heading">
              ⚠️ This file could not be imported:
            </p>
            <ul>
              {errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
            <p className="import-panel__error-hint">
              Make sure you are uploading a file exported by this app
              (<code>spotify-backup-*.json</code>).
            </p>
          </div>
        )}
      </div>
    )
  }

  // ── READING ───────────────────────────────────────────────────
  if (state === 'reading') {
    return (
      <div className="import-panel import-panel--loading">
        <span className="import-panel__spinner" aria-hidden="true">⏳</span>
        <p>Reading and validating file…</p>
      </div>
    )
  }

  // ── PREVIEW ───────────────────────────────────────────────────
  if (state === 'preview' && preview) {
    const exportDate = new Date(preview.exportedAt).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
    const skipped = preview.stats.playlistsSkipped ?? 0
    const restorablePlaylists = preview.stats.totalPlaylists - skipped

    return (
      <div className="import-panel">
        <header className="import-panel__header">
          <span className="import-panel__icon" aria-hidden="true">🔄</span>
          <h2 className="import-panel__title">Restore from Backup</h2>
        </header>

        <div className="import-preview">
          <p className="import-preview__valid-badge">✅ Valid backup file</p>

          {/* Metadata rows */}
          <div className="import-preview__rows">
            <PreviewRow label="Account" value={
              preview.source.displayName
                ? `${preview.source.displayName} (@${preview.source.id})`
                : `@${preview.source.id}`
            } />
            <PreviewRow label="Exported" value={exportDate} />
            <PreviewRow label="Country"  value={preview.source.country} />
            <PreviewRow label="Plan"     value={preview.source.product ?? 'unknown'} />
          </div>

          <hr className="import-preview__divider" />

          {/* Content counts */}
          <div className="import-preview__counts">
            <CountCard icon="❤️" label="Liked songs" value={preview.stats.totalLikedSongs} />
            <CountCard icon="🎵" label="Playlists"   value={restorablePlaylists}
              note={skipped > 0 ? `${skipped} skipped during export` : undefined} />
            <CountCard icon="🎶" label="Tracks"      value={preview.stats.totalPlaylistTracks} />
          </div>

          {/* Warnings (non-fatal) */}
          {warnings.length > 0 && (
            <div className="import-preview__warnings">
              {warnings.map((w, i) => (
                <p key={i} className="import-preview__warning">⚠️ {w}</p>
              ))}
            </div>
          )}

          <div className="import-preview__actions">
            <button className="import-panel__btn import-panel__btn--ghost" onClick={handleReset}>
              ← Choose a different file
            </button>
            <button className="import-panel__btn" onClick={handleConfirm}>
              Use this backup →
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── CONFIRMED ─────────────────────────────────────────────────
  if (state === 'confirmed' && preview) {
    return (
      <div className="import-panel import-panel--confirmed">
        <div className="import-confirmed">
          <span className="import-confirmed__icon" aria-hidden="true">✅</span>
          <div className="import-confirmed__text">
            <h2 className="import-panel__title">Backup loaded</h2>
            <p className="import-confirmed__sub">
              {preview.source.displayName ?? preview.source.id}'s backup is ready.
              Connect your <strong>destination</strong> account above to begin restoring.
            </p>
          </div>
          <button
            className="import-panel__btn import-panel__btn--ghost"
            onClick={handleReset}
            title="Load a different backup file"
          >
            Change file
          </button>
        </div>
      </div>
    )
  }

  return null
}

// ── Small helper components ───────────────────────────────────

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="import-preview__row">
      <span className="import-preview__label">{label}</span>
      <span className="import-preview__value">{value}</span>
    </div>
  )
}

function CountCard({
  icon, label, value, note,
}: { icon: string; label: string; value: number; note?: string }) {
  return (
    <div className="import-count-card">
      <span className="import-count-card__icon" aria-hidden="true">{icon}</span>
      <span className="import-count-card__value">{value.toLocaleString()}</span>
      <span className="import-count-card__label">{label}</span>
      {note && <span className="import-count-card__note">{note}</span>}
    </div>
  )
}
