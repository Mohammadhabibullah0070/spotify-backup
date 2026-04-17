/**
 * useLikedSongs — fetches all saved/liked tracks for an account role.
 *
 * Auto-fetches when the account connects (access token changes).
 * Exposes per-page progress for large libraries.
 * Clears data when account logs out.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth }           from './useAuth'
import { fetchAllLikedSongs } from '../lib/spotifyApi'
import type { SavedTrack }   from '../lib/spotifyApi'
import type { AccountRole }  from '../lib/spotifyAuth'

export type LikedSongsStatus = 'idle' | 'loading' | 'success' | 'error'

export interface LikedSongsProgress {
  fetched: number
  total:   number
}

export interface UseLikedSongsResult {
  songs:    SavedTrack[]
  status:   LikedSongsStatus
  progress: LikedSongsProgress | null
  error:    string | null
  refetch:  () => Promise<void>
}

export function useLikedSongs(role: AccountRole): UseLikedSongsResult {
  const { source, destination, getAccessToken } = useAuth()
  const account = role === 'source' ? source : destination

  const [songs,    setSongs]    = useState<SavedTrack[]>([])
  const [status,   setStatus]   = useState<LikedSongsStatus>('idle')
  const [progress, setProgress] = useState<LikedSongsProgress | null>(null)
  const [error,    setError]    = useState<string | null>(null)

  const lastToken = useRef<string | null>(null)

  const fetchSongs = useCallback(async () => {
    const token = await getAccessToken(role)
    if (!token) {
      setStatus('error')
      setError('No valid session. Please log in again.')
      return
    }

    setStatus('loading')
    setSongs([])
    setProgress({ fetched: 0, total: 0 })
    setError(null)

    try {
      const results = await fetchAllLikedSongs(token, (fetched, total) => {
        setProgress({ fetched, total })
      })
      setSongs(results)
      setStatus('success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)

      if (msg.includes('fetch_liked_401')) {
        setError('Session expired. Please disconnect and log in again.')
      } else if (msg.includes('fetch_liked_403')) {
        setError('Permission denied. Make sure "user-library-read" was granted during login.')
      } else if (msg.includes('fetch_liked_429')) {
        setError('Spotify rate limit hit. Wait at least 60 seconds, then click Try again once.')
      } else {
        setError('Failed to load liked songs. Check your connection.')
      }

      setStatus('error')
    } finally {
      setProgress(null)
    }
  }, [role, getAccessToken])

  // Auto-fetch when account logs in, clear when logs out
  useEffect(() => {
    if (!account) {
      setSongs([])
      setStatus('idle')
      setError(null)
      lastToken.current = null
      return
    }

    const token = account.tokens.accessToken
    if (lastToken.current === token && status === 'success') return

    lastToken.current = token
    fetchSongs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.tokens.accessToken])

  return { songs, status, progress, error, refetch: fetchSongs }
}
