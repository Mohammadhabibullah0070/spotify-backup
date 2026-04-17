/**
 * useBackup — orchestrates the full backup export.
 *
 * Flow when user clicks "Download Backup":
 *   1. Verify liked songs are available (they auto-fetch on login)
 *   2. For each playlist, fetch ALL its tracks sequentially
 *      (403 playlists are caught and stored as errors, not thrown)
 *   3. Call buildBackup() to assemble the JSON document
 *   4. Call downloadBackup() to trigger the browser download
 *   5. Report final stats + any warnings (e.g. skipped playlists)
 *
 * Tracks are always re-fetched during backup — this guarantees
 * the export is fresh and not stale from a prior browse session.
 */

import { useState, useCallback }   from 'react'
import { useAuth }                 from './useAuth'
import { fetchAllPlaylistTracks }  from '../lib/spotifyApi'
import { buildBackup, downloadBackup } from '../lib/backupFormat'
import type { PlaylistItem, SpotifyPlaylist } from '../lib/spotifyApi'
import type { SavedTrack }         from '../lib/spotifyApi'

export type BackupStatus =
  | 'idle'
  | 'fetching'    // fetching playlist tracks one by one
  | 'building'    // assembling the JSON
  | 'done'        // file downloaded
  | 'error'       // something went wrong entirely

export interface BackupProgress {
  playlistIndex: number    // 1-based, current playlist being fetched
  playlistTotal: number    // total number of playlists
  playlistName:  string    // name of current playlist
  tracksFetched: number    // tracks fetched so far for current playlist
  tracksTotal:   number    // total tracks in current playlist
}

export interface BackupResult {
  filename:      string
  fileSize:      string
  totalPlaylists: number
  totalTracks:   number
  totalLiked:    number
  warnings:      string[]
}

export interface UseBackupResult {
  status:   BackupStatus
  progress: BackupProgress | null
  result:   BackupResult | null
  error:    string | null
  startBackup: (
    playlists:  SpotifyPlaylist[],
    likedSongs: SavedTrack[],
  ) => Promise<void>
  reset: () => void
}

export function useBackup(): UseBackupResult {
  const { source, getAccessToken } = useAuth()

  const [status,   setStatus]   = useState<BackupStatus>('idle')
  const [progress, setProgress] = useState<BackupProgress | null>(null)
  const [result,   setResult]   = useState<BackupResult | null>(null)
  const [error,    setError]    = useState<string | null>(null)

  const reset = useCallback(() => {
    setStatus('idle')
    setProgress(null)
    setResult(null)
    setError(null)
  }, [])

  const startBackup = useCallback(async (
    playlists:  SpotifyPlaylist[],
    likedSongs: SavedTrack[],
  ) => {
    if (!source?.user) {
      setError('No source account connected.')
      setStatus('error')
      return
    }

    const token = await getAccessToken('source')
    if (!token) {
      setError('Session expired. Please reconnect your source account.')
      setStatus('error')
      return
    }

    setStatus('fetching')
    setError(null)
    setResult(null)

    // Fetch tracks for every playlist — store results OR errors
    const playlistTracks = new Map<string, PlaylistItem[] | Error>()

    for (let i = 0; i < playlists.length; i++) {
      const pl = playlists[i]

      setProgress({
        playlistIndex: i + 1,
        playlistTotal: playlists.length,
        playlistName:  pl.name,
        tracksFetched: 0,
        tracksTotal:   pl.items?.total ?? 0,
      })

      try {
        const items = await fetchAllPlaylistTracks(token, pl.id, (fetched, total) => {
          setProgress(prev => prev ? { ...prev, tracksFetched: fetched, tracksTotal: total } : null)
        })
        playlistTracks.set(pl.id, items)
      } catch (err) {
        // Don't abort the whole backup — store the error and move on
        playlistTracks.set(pl.id, err instanceof Error ? err : new Error(String(err)))
      }
    }

    // Build the JSON document
    setStatus('building')
    setProgress(null)

    const { backup, warnings } = buildBackup(
      source.user,
      likedSongs,
      playlists,
      playlistTracks,
    )

    // Trigger download and capture file size
    const userId   = source.user.id
    const fileSize = downloadBackup(backup, userId)
    const date     = new Date().toISOString().slice(0, 10)

    setResult({
      filename:       `spotify-backup-${userId}-${date}.json`,
      fileSize,
      totalPlaylists: backup.stats.totalPlaylists,
      totalTracks:    backup.stats.totalPlaylistTracks,
      totalLiked:     backup.stats.totalLikedSongs,
      warnings,
    })

    setStatus('done')
  }, [source, getAccessToken])

  return { status, progress, result, error, startBackup, reset }
}
