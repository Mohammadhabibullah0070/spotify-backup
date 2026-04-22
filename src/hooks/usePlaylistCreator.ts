/**
 * usePlaylistCreator — creates empty playlists on the destination account.
 *
 * Reads BackupPlaylist[] from the imported backup, then iterates through
 * them sequentially — one POST /users/{id}/playlists per playlist, with a
 * 300ms polite delay between each call.
 *
 * Playlists marked as `skipped` in the backup (those that returned 403
 * during export) are skipped here too — they have no track data to restore.
 *
 * On completion, writes the sourceId → destId PlaylistMap to BackupContext
 * so Milestone 11 (track restore) can find the right destination playlist.
 */

import { useState, useCallback }  from 'react'
import { useAuth }                 from './useAuth'
import { useImportedBackup }       from '../context/BackupContext'
import { createPlaylist, delay }   from '../lib/restoreApi'
import type { BackupPlaylist }     from '../lib/backupFormat'
import type { PlaylistMap }        from '../context/BackupContext'

// ── Status & Progress types ───────────────────────────────────

export type CreatorStatus = 'idle' | 'creating' | 'done' | 'error'

export interface CreatorProgress {
  current:      number   // 1-based index
  total:        number
  playlistName: string
}

export interface CreatorResult {
  created:     number   // successfully created
  skipped:     number   // skipped (backup.skipped set) or 0-track playlists
  failed:      number   // API errors
  warnings:    string[] // non-fatal issues (e.g. public→private override)
  playlistMap: PlaylistMap
}

export interface UsePlaylistCreatorResult {
  status:    CreatorStatus
  progress:  CreatorProgress | null
  result:    CreatorResult | null
  error:     string | null
  startCreating: () => Promise<void>
  reset:         () => void
}

const DELAY_BETWEEN_CALLS_MS = 300

export function usePlaylistCreator(): UsePlaylistCreatorResult {
  const { destination, getAccessToken } = useAuth()
  const { importedBackup, setPlaylistMap, setStatus: setContextStatus, addLog } = useImportedBackup()

  const [status,   setStatus]   = useState<CreatorStatus>('idle')
  const [progress, setProgress] = useState<CreatorProgress | null>(null)
  const [result,   setResult]   = useState<CreatorResult | null>(null)
  const [error,    setError]    = useState<string | null>(null)

  const reset = useCallback(() => {
    setStatus('idle')
    setProgress(null)
    setResult(null)
    setError(null)
  }, [])

  const startCreating = useCallback(async () => {
    addLog('Starting playlist creation...', 'info')
    setContextStatus('RESTORING')

    if (!importedBackup) {
      setError('No backup loaded. Please import a backup file first.')
      setStatus('error')
      addLog('Error: No backup loaded', 'error')
      setContextStatus('ERROR')
      return
    }
    if (!destination?.user) {
      setError('No destination account connected.')
      setStatus('error')
      addLog('Error: No destination account connected', 'error')
      setContextStatus('ERROR')
      return
    }

    const token = await getAccessToken('destination')
    if (!token) {
      setError('Destination session expired. Please reconnect.')
      setStatus('error')
      addLog('Error: Destination session expired', 'error')
      setContextStatus('ERROR')
      return
    }

    // Filter to playlists we can actually create
    // (exclude those marked skipped during backup — no track data)
    const toCreate: BackupPlaylist[] = importedBackup.playlists.filter(
      pl => !pl.skipped
    )

    setStatus('creating')
    setError(null)
    setResult(null)
    addLog(`Creating ${toCreate.length} playlists...`, 'info')

    const map:      PlaylistMap = new Map()
    const warnings: string[]   = []
    let created = 0
    let failed  = 0

    for (let i = 0; i < toCreate.length; i++) {
      const pl = toCreate[i]

      setProgress({ current: i + 1, total: toCreate.length, playlistName: pl.name })

      try {
        const created_pl = await createPlaylist(token, {
          name:          pl.name,
          description:   pl.description ?? '',
          isPublic:      pl.public ?? false,
          collaborative: pl.collaborative,
        })

        // Store source → destination ID mapping
        map.set(pl.id, created_pl.id)
        created++
        addLog(`✓ Created playlist "${pl.name}"`, 'success')

        if (created_pl.publicOverridden) {
          warnings.push(
            `"${pl.name}" was collaborative — automatically set to private ` +
            '(Spotify requires collaborative playlists to be private).'
          )
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        failed++
        addLog(`✗ Failed to create "${pl.name}": ${friendlyError(msg)}`, 'error')
        warnings.push(`Failed to create "${pl.name}": ${friendlyError(msg)}`)
      }

      // Polite delay — don't hammer the API
      if (i < toCreate.length - 1) {
        await delay(DELAY_BETWEEN_CALLS_MS)
      }
    }

    const finalResult: CreatorResult = {
      created,
      skipped: importedBackup.playlists.length - toCreate.length,
      failed,
      warnings,
      playlistMap: map,
    }

    // Persist map to BackupContext for Milestone 11
    setPlaylistMap(map)

    addLog(`✓ Playlist creation complete (${created} created, ${failed} failed)`, 'success')
    setResult(finalResult)
    setStatus('done')
    setProgress(null)
  }, [importedBackup, destination, getAccessToken, setPlaylistMap, setContextStatus, addLog])

  return { status, progress, result, error, startCreating, reset }
}

function friendlyError(msg: string): string {
  // msg format: "create_playlist_403:Insufficient client scope"
  const colonIdx = msg.indexOf(':')
  const code     = colonIdx === -1 ? msg : msg.slice(0, colonIdx)
  const detail   = colonIdx === -1 ? ''  : msg.slice(colonIdx + 1).trim()

  if (code === 'create_playlist_401') return detail || 'Session expired — reconnect destination'
  if (code === 'create_playlist_403') return detail || 'Permission denied — check playlist-modify scopes'
  if (code === 'create_playlist_429') return 'Rate limited by Spotify — wait a minute and retry'
  // Always surface the real Spotify message if we have one
  return detail || msg
}
