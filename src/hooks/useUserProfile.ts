/**
 * useUserProfile — fetches and keeps the Spotify user profile fresh.
 *
 * Strategy (stale-while-revalidate):
 *   1. Instantly return whatever is cached in AuthContext (from localStorage)
 *      → no loading flash on page refresh
 *   2. In the background, fetch a fresh copy from GET /me
 *      → display updates silently if data changed
 *   3. If the token is expired, getAccessToken() auto-refreshes it
 *   4. If refresh also fails, mark status = 'error' and return null
 *
 * The hook re-runs automatically whenever the user logs in/out
 * (it watches the access token, which changes on each new login).
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from './useAuth'
import { fetchCurrentUser } from '../lib/spotifyApi'
import type { SpotifyUser } from '../lib/spotifyApi'
import type { AccountRole } from '../lib/spotifyAuth'

export type ProfileStatus = 'idle' | 'loading' | 'success' | 'error'

export interface UseUserProfileResult {
  /** The user profile — may be stale cached data while refreshing */
  user:        SpotifyUser | null
  /** Current fetch status */
  status:      ProfileStatus
  /** Human-readable error message, or null */
  error:       string | null
  /** True only when we're refreshing AND have no cached data to show yet */
  isLoading:   boolean
  /** True when refreshing in the background (cached data still visible) */
  isRefreshing: boolean
  /** Manually re-fetch the profile */
  refetch:     () => Promise<void>
}

export function useUserProfile(role: AccountRole): UseUserProfileResult {
  const { source, destination, getAccessToken, updateUser } = useAuth()
  const account = role === 'source' ? source : destination

  // Initialise status based on what we already have in cache
  const [status,       setStatus]       = useState<ProfileStatus>(() => {
    if (!account)       return 'idle'
    if (account.user)   return 'success'   // Have cached data — show it immediately
    return 'loading'                       // Have token but no user yet
  })
  const [error,        setError]        = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Track the access token we last fetched for, to avoid redundant calls
  const lastFetchedToken = useRef<string | null>(null)

  const fetchProfile = useCallback(async () => {
    // No token → nothing to do
    const token = await getAccessToken(role)
    if (!token) {
      setStatus(account ? 'error' : 'idle')
      setError(account ? 'Session expired. Please log in again.' : null)
      return
    }

    // Avoid duplicate fetches for the same token
    if (lastFetchedToken.current === token && status === 'success') return
    lastFetchedToken.current = token

    // Show skeleton only if we have NO cached data yet
    // Otherwise use the subtle "refreshing" indicator
    if (!account?.user) {
      setStatus('loading')
    } else {
      setIsRefreshing(true)
    }

    try {
      const freshUser = await fetchCurrentUser(token)
      updateUser(role, freshUser)
      setStatus('success')
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)

      if (message.includes('fetch_user_401')) {
        setError('Your session expired. Please disconnect and log in again.')
      } else if (message.includes('fetch_user_403')) {
        setError('Permission denied. Missing required Spotify scopes.')
      } else {
        setError('Could not load profile. Check your internet connection.')
      }

      // Keep old cached data visible even on error
      if (!account?.user) setStatus('error')
    } finally {
      setIsRefreshing(false)
    }
  }, [role, account, getAccessToken, updateUser, status])

  // Run on mount AND whenever the access token changes (new login)
  useEffect(() => {
    if (!account) {
      setStatus('idle')
      setError(null)
      lastFetchedToken.current = null
      return
    }
    fetchProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.tokens.accessToken])

  return {
    user:         account?.user ?? null,
    status,
    error,
    isLoading:    status === 'loading',
    isRefreshing,
    refetch:      fetchProfile,
  }
}
