/**
 * useLikedSongsRestorer — saves backup liked songs to the destination account.
 *
 * Milestone 12
 *
 * ── How liked songs differ from playlists ──────────────────
 *  • Liked songs live in the user's library, not in a playlist object.
 *  • Endpoint: PUT /me/library  (Spotify Feb 2026 — replaces PUT /me/tracks)
 *  • Accepts URIs (not IDs), max 50 per call (vs 100 for playlists).
 *  • Scope required: user-library-modify
 *  • No snapshot_id — success = HTTP 200 with empty body.
 *  • Order is NOT preserved — Spotify library always sorts by recently added.
 *  • Local files, episodes, null tracks are skipped (no URI).
 *
 * ── Batching ─────────────────────────────────────────────────
 *  Max 50 URIs per PUT /me/library call.
 *  300 ms polite delay between batches.
 */

import { useState, useCallback }      from 'react'
import { useAuth }                     from './useAuth'
import { useImportedBackup }           from '../context/BackupContext'
import { saveLikedSongs, chunk, delay } from '../lib/restoreApi'

// ── Public types ──────────────────────────────────────────────

export type LikedRestorerStatus = 'idle' | 'restoring' | 'done' | 'error'

export interface LikedProgress {
  saved:   number   // running total saved so far
  total:   number   // total restorable tracks
  batch:   number   // current batch number (1-based)
  batches: number   // total batches
}

export interface LikedRestoreResult {
  saved:          number   // successfully saved to library
  skippedLocal:   number   // local files — no URI
  skippedEpisode: number   // podcast episodes
  skippedNull:    number   // deleted/null tracks
  failed:         number   // rejected by Spotify even after retry
  warnings:       string[]
}

export interface UseLikedSongsRestorerResult {
  status:        LikedRestorerStatus
  progress:      LikedProgress | null
  result:        LikedRestoreResult | null
  error:         string | null
  startRestoring: () => Promise<void>
  reset:         () => void
}

// ── Constants ─────────────────────────────────────────────────
const BATCH_SIZE       = 50    // Spotify hard limit for PUT /me/library
const DELAY_BETWEEN_MS = 300

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────

export function useLikedSongsRestorer(): UseLikedSongsRestorerResult {
  const { destination, getAccessToken } = useAuth()
  const { importedBackup }              = useImportedBackup()

  const [status,   setStatus]   = useState<LikedRestorerStatus>('idle')
  const [progress, setProgress] = useState<LikedProgress | null>(null)
  const [result,   setResult]   = useState<LikedRestoreResult | null>(null)
  const [error,    setError]    = useState<string | null>(null)

  const reset = useCallback(() => {
    setStatus('idle')
    setProgress(null)
    setResult(null)
    setError(null)
  }, [])

  const startRestoring = useCallback(async () => {

    // ── Guard checks ──────────────────────────────────────────
    if (!importedBackup) {
      setError('No backup loaded.')
      setStatus('error')
      return
    }
    if (!destination?.user) {
      setError('No destination account connected.')
      setStatus('error')
      return
    }

    const token = await getAccessToken('destination')
    if (!token) {
      setError('Destination session expired. Please reconnect.')
      setStatus('error')
      return
    }

    // ── Collect restorable URIs ───────────────────────────────
    // Only 'track' kind items have a valid Spotify URI.
    // local / episode / null are skipped.
    const urisToSave: string[] = []
    let skippedLocal   = 0
    let skippedEpisode = 0
    let skippedNull    = 0

    for (const item of importedBackup.likedSongs.items) {
      const t = item.track
      if (!t || !t.uri) { skippedNull++;    continue }
      if (t.isLocal)     { skippedLocal++;   continue }
      // Episodes stored in liked songs (rare but possible)
      if (t.uri.startsWith('spotify:episode:')) { skippedEpisode++; continue }
      urisToSave.push(t.uri)
    }

    if (urisToSave.length === 0) {
      setResult({ saved: 0, skippedLocal, skippedEpisode, skippedNull, failed: 0, warnings: [] })
      setStatus('done')
      return
    }

    const batches = chunk(urisToSave, BATCH_SIZE)
    setStatus('restoring')
    setError(null)
    setResult(null)

    let saved    = 0
    let failed   = 0
    const warnings: string[] = []

    // ── Main loop — one batch at a time ───────────────────────
    for (let bi = 0; bi < batches.length; bi++) {
      const batch = batches[bi]

      setProgress({
        saved,
        total:   urisToSave.length,
        batch:   bi + 1,
        batches: batches.length,
      })

      try {
        await saveLikedSongs(token, batch)
        saved += batch.length
        setProgress({
          saved,
          total:   urisToSave.length,
          batch:   bi + 1,
          batches: batches.length,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)

        // Hard stop on auth errors
        if (msg.includes('save_liked_401')) {
          setError('Session expired mid-restore. Please reconnect the destination account.')
          setStatus('error')
          return
        }
        if (msg.includes('save_liked_403')) {
          setError(
            'Spotify denied saving liked songs (403). ' +
            'Please Force Reconnect the destination account and ensure you click "Agree" ' +
            'on the Spotify permissions screen to grant library access.'
          )
          setStatus('error')
          return
        }

        // Batch failed — retry one by one
        warnings.push(`Batch ${bi + 1} failed (${msg}) — retrying track by track…`)
        for (const uri of batch) {
          try {
            await saveLikedSongs(token, [uri])
            saved++
            await delay(DELAY_BETWEEN_MS)
          } catch {
            failed++
            warnings.push(`Could not save: ${uri}`)
          }
        }
      }

      // Polite delay between batches
      if (bi < batches.length - 1) {
        await delay(DELAY_BETWEEN_MS)
      }
    }

    setResult({ saved, skippedLocal, skippedEpisode, skippedNull, failed, warnings })
    setStatus('done')
    setProgress(null)

  }, [importedBackup, destination, getAccessToken])

  return { status, progress, result, error, startRestoring, reset }
}
