/**
 * useTrackRestorer — adds backup tracks to the destination playlists.
 *
 * Pre-requisite: Milestone 10's usePlaylistCreator must have run so
 * that BackupContext.playlistMap is populated with:
 *   sourcePlaylistId → destinationPlaylistId
 *
 * ── Per-track decision table ──────────────────────────────────
 *
 *  kind           Action            Reason
 *  ─────────────  ────────────────  ──────────────────────────────────────────
 *  'track'        Add via URI       Normal case
 *  'unavailable'  Try linkedFromUri Track was geo-restricted at backup time;
 *                 then fall back    linkedFromUri may work in dest's region.
 *                 to original uri   If both fail → counted as failed.
 *  'local'        Skip              Local files have no Spotify URI;
 *                                   the API cannot add them.
 *  'episode'      Skip              Podcast episodes cannot be added to
 *                                   music playlists via API.
 *  'null'         Skip              Track was deleted from Spotify since backup.
 *
 * ── Duplicate handling ────────────────────────────────────────
 *
 *  We deduplicate URIs WITHIN each playlist (using a Set) so the same
 *  track is never added twice in a single restore run.
 *
 *  We do NOT pre-check what's already in the destination playlist because
 *  fetching the full track list of every playlist is too expensive.
 *  → If you run the restore twice, you will get duplicates on Spotify.
 *    Spotify's "Remove duplicates" playlist feature can clean this up.
 *
 * ── Batching ─────────────────────────────────────────────────
 *
 *  Spotify accepts max 100 URIs per POST /playlists/{id}/items call.
 *  We process 100 tracks at a time with a 300 ms delay between batches.
 *
 * ── Bad-batch fallback ────────────────────────────────────────
 *
 *  If a 100-track batch returns 4xx (e.g. one invalid URI poisons the whole
 *  batch), we retry the batch one track at a time — slow but safe.
 *  Any individually-failing tracks are recorded in warnings.
 */

import { useState, useCallback }            from 'react'
import { useAuth }                           from './useAuth'
import { useImportedBackup }                 from '../context/BackupContext'
import { addTracksToPlaylist, chunk, delay } from '../lib/restoreApi'
import type { BackupPlaylist }               from '../lib/backupFormat'

// ── Public types ──────────────────────────────────────────────

export type RestorerStatus = 'idle' | 'restoring' | 'done' | 'error'

export interface TrackProgress {
  playlistIndex: number    // 1-based playlist position
  playlistTotal: number
  playlistName:  string
  batchIndex:    number    // 1-based batch within the current playlist
  batchTotal:    number
  tracksAdded:   number    // running total added so far
  tracksTotal:   number    // grand total of restorable tracks across all playlists
}

export interface TrackRestoreResult {
  /** Tracks successfully added to Spotify */
  added:               number
  /** Tracks skipped because they are local files (no Spotify URI) */
  skippedLocal:        number
  /** Tracks skipped because they are podcast episodes */
  skippedEpisode:      number
  /** Tracks that were unavailable in source region — tried to restore anyway */
  attemptedUnavailable: number
  /** Tracks with kind 'null' — deleted from Spotify since backup */
  skippedNull:         number
  /** Tracks whose URI was rejected by Spotify even after single-track retry */
  failed:              number
  /** Playlists not in the PlaylistMap (weren't created in M10) */
  skippedPlaylists:    number
  /** Non-fatal per-track / per-playlist notices */
  warnings:            string[]
}

export interface UseTrackRestorerResult {
  status:         RestorerStatus
  progress:       TrackProgress | null
  result:         TrackRestoreResult | null
  error:          string | null
  startRestoring: () => Promise<void>
  reset:          () => void
}

// ── Constants ─────────────────────────────────────────────────

const BATCH_SIZE        = 100   // Spotify's hard limit per POST
const DELAY_BETWEEN_MS  = 300   // polite delay between API calls

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────

export function useTrackRestorer(): UseTrackRestorerResult {
  const { destination, getAccessToken } = useAuth()
  const { importedBackup, playlistMap, setPlaylistMap } = useImportedBackup()

  const [status,   setStatus]   = useState<RestorerStatus>('idle')
  const [progress, setProgress] = useState<TrackProgress | null>(null)
  const [result,   setResult]   = useState<TrackRestoreResult | null>(null)
  const [error,    setError]    = useState<string | null>(null)

  const reset = useCallback(() => {
    setStatus('idle')
    setProgress(null)
    setResult(null)
    setError(null)
    // Clear playlistMap so Step 1 must be re-run before Step 2.
    // This prevents the 403 that happens when Step 2 tries to use
    // playlist IDs from a previous session/client.
    setPlaylistMap(null)
  }, [setPlaylistMap])

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
    if (!playlistMap || playlistMap.size === 0) {
      setError('No playlists have been created yet. Please complete Step 1 first.')
      setStatus('error')
      return
    }

    const token = await getAccessToken('destination')
    if (!token) {
      setError('Destination session expired. Please reconnect.')
      setStatus('error')
      return
    }

    // ── Build list of playlists to process ────────────────────
    // Only process playlists that:
    //   1. Were not skipped at backup time
    //   2. Exist in the playlistMap (were created in M10)
    const toProcess: Array<{ pl: BackupPlaylist; destId: string }> = []
    let skippedPlaylists = 0

    for (const pl of importedBackup.playlists) {
      if (pl.skipped) { skippedPlaylists++; continue }
      const destId = playlistMap.get(pl.id)
      if (!destId) { skippedPlaylists++; continue }
      toProcess.push({ pl, destId })
    }

    // ── Count total restorable tracks upfront (for progress %) ─
    const tracksTotal = toProcess.reduce((sum, { pl }) =>
      sum + pl.tracks.items.filter(i => i.kind === 'track' || i.kind === 'unavailable').length,
      0
    )

    setStatus('restoring')
    setError(null)
    setResult(null)

    // ── Running tallies ───────────────────────────────────────
    let added                = 0
    let skippedLocal         = 0
    let skippedEpisode       = 0
    let attemptedUnavailable = 0
    let skippedNull          = 0
    let failed               = 0
    const warnings: string[] = []

    // ── Preflight: verify token is valid ─────────────────────
    try {
      const meRes = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (meRes.status === 401) {
        setError('Destination session expired. Please click "↺ Force Reconnect" and try again.')
        setStatus('error')
        return
      }
    } catch {
      // Network error — continue anyway
    }
    let preflightFailed = false

    // ── Direct write test — verify we can actually add tracks ─
    // Try adding the first track of the first available playlist.
    // This surfaces the exact raw Spotify error before we start the loop.
    if (toProcess.length > 0) {
      const testPl = toProcess[0]
      const testUri = testPl.pl.tracks.items.find(i => i.kind === 'track' && i.track?.uri)?.track?.uri
      if (testUri) {
        const testRes = await fetch(
          `https://api.spotify.com/v1/playlists/${testPl.destId}/items`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ uris: [testUri] }),
          }
        )
        if (!testRes.ok) {
          const rawBody = await testRes.text().catch(() => '')
          setError(
            `Spotify test call failed (${testRes.status}). ` +
            `Raw response: ${rawBody || '(empty)'}. ` +
            `Playlist ID: ${testPl.destId}. ` +
            `Track URI: ${testUri}.`
          )
          setStatus('error')
          return
        }
        // Test succeeded — 1 track added, count it
        added += 1
      }
    }

    // ── Main loop — one playlist at a time ────────────────────
    for (let pi = 0; pi < toProcess.length; pi++) {
      const { pl, destId } = toProcess[pi]
      const items = pl.tracks.items

      // ── Classify each item ───────────────────────────────────
      const urisToAdd: string[] = []
      const seenUris = new Set<string>()

      for (const item of items) {
        switch (item.kind) {
          case 'local':
            skippedLocal++
            break
          case 'episode':
            skippedEpisode++
            break
          case 'null':
            skippedNull++
            break
          case 'unavailable': {
            // Prefer the linked-from URI (the track it redirected from)
            // which may work in the destination account's region
            const uri = item.track?.linkedFromUri ?? item.track?.uri
            if (uri && !seenUris.has(uri)) {
              urisToAdd.push(uri)
              seenUris.add(uri)
              attemptedUnavailable++
            } else {
              skippedNull++
            }
            break
          }
          case 'track': {
            const uri = item.track?.uri
            if (uri && !seenUris.has(uri)) {
              urisToAdd.push(uri)
              seenUris.add(uri)
            } else if (!uri) {
              skippedNull++
            }
            break
          }
        }
      }

      if (urisToAdd.length === 0) continue

      // ── Batch the URIs into groups of 100 ────────────────────
      const batches = chunk(urisToAdd, BATCH_SIZE)

      for (let bi = 0; bi < batches.length; bi++) {
        const batch = batches[bi]

        // Update progress before call (shows current batch)
        setProgress({
          playlistIndex: pi + 1,
          playlistTotal: toProcess.length,
          playlistName:  pl.name,
          batchIndex:    bi + 1,
          batchTotal:    batches.length,
          tracksAdded:   added,
          tracksTotal,
        })

        try {
          await addTracksToPlaylist(token, destId, batch)
          added += batch.length
          // Update progress immediately after successful add
          setProgress({
            playlistIndex: pi + 1,
            playlistTotal: toProcess.length,
            playlistName:  pl.name,
            batchIndex:    bi + 1,
            batchTotal:    batches.length,
            tracksAdded:   added,
            tracksTotal,
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)

          // 403 on the very first batch = token lacks write scope → hard stop
          if (msg.includes('add_tracks_403') && added === 0 && !preflightFailed) {
            preflightFailed = true
            // Extract Spotify's raw reason from the error message for diagnosis
            const rawDetail = msg.split(':').slice(1).join(':').trim()
            setError(
              `Spotify denied adding tracks (403${rawDetail ? ': ' + rawDetail : ''}). ` +
              'This can happen if: (1) the destination account lacks playlist-write permission — ' +
              'Force Reconnect and click "Agree" on the Spotify screen; or (2) the Spotify app ' +
              'is in Development Mode and the destination account is not added under User Management ' +
              'at developer.spotify.com → your app → Settings.'
            )
            setStatus('error')
            return
          }

          // 4xx batch failure → retry each track individually
          if (msg.includes('add_tracks_4')) {
            warnings.push(
              `Batch ${bi + 1} in "${pl.name}" failed (${msg}) — retrying track by track…`
            )
            for (const uri of batch) {
              try {
                await addTracksToPlaylist(token, destId, [uri])
                added++
                await delay(DELAY_BETWEEN_MS)
              } catch {
                failed++
                warnings.push(`  Could not add: ${uri}`)
              }
            }
          } else {
            // Unknown error — mark whole batch as failed
            failed += batch.length
            warnings.push(`Batch ${bi + 1} in "${pl.name}" failed: ${friendlyError(msg)}`)
          }
        }

        // Polite pause between batches
        if (bi < batches.length - 1) await delay(DELAY_BETWEEN_MS)
      }

      // Pause between playlists
      if (pi < toProcess.length - 1) await delay(DELAY_BETWEEN_MS)
    }

    setResult({
      added,
      skippedLocal,
      skippedEpisode,
      attemptedUnavailable,
      skippedNull,
      failed,
      skippedPlaylists,
      warnings,
    })
    setStatus('done')
    setProgress(null)
  }, [importedBackup, destination, getAccessToken, playlistMap])

  return { status, progress, result, error, startRestoring, reset }
}

function friendlyError(msg: string): string {
  if (msg.includes('401')) return 'Session expired — reconnect destination'
  if (msg.includes('403')) return 'Permission denied — missing playlist-modify scope'
  if (msg.includes('404')) return 'Playlist not found on Spotify (was it deleted?)'
  if (msg.includes('429')) return 'Rate limited by Spotify'
  return msg
}
