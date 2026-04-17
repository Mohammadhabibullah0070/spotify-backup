/**
 * restoreApi.ts — Spotify API write operations for the restore flow.
 *
 * This file grows across milestones:
 *   Milestone 10 — createPlaylist()          ← NOW
 *   Milestone 11 — addTracksToPlaylist()     ← NEXT
 *   Milestone 12 — saveLikedSongs()          ← NOW ✅
 *
 * ── Rate limiting ───────────────────────────────────────────
 * All write endpoints share a rate limit. Best practice:
 *   - Sequential calls (never parallel)
 *   - 300 ms polite delay between calls
 *   - Honour the Retry-After header on 429 (auto-retry up to 3x)
 *
 * ── What Spotify does NOT support ───────────────────────────
 *   ✗ Cannot preserve the original playlist Spotify ID
 *   ✗ Cannot preserve playlist cover art via this flow
 *     (requires PUT /playlists/{id}/images with a base64 JPEG — future)
 *   ✗ Cannot set a playlist's owner to anyone other than the auth'd user
 *   ✗ Collaborative playlists MUST be created with public:false
 *   ✗ Cannot restore the original "added_at" timestamp for tracks
 *   ✗ Cannot restore follower counts
 *   ✗ Free accounts can create playlists but cannot add >10,000 tracks
 *     (Spotify's own playlist track limit)
 */

const BASE = 'https://api.spotify.com/v1'

function authHeader(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

// ── Polite delay between consecutive write calls ──────────────
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── Rate-limit-aware fetch wrapper ────────────────────────────
/**
 * Wraps fetch() with automatic 429 retry.
 * On 429, reads the Retry-After header (seconds) and waits before retrying.
 * Throws after maxRetries consecutive 429 responses.
 */
async function spotifyFetch(
  url:        string,
  options:    RequestInit,
  maxRetries: number = 3,
): Promise<Response> {
  let attempt = 0

  while (attempt <= maxRetries) {
    const res = await fetch(url, options)

    if (res.status !== 429) return res

    // 429 — rate limited
    const retryAfter = Number(res.headers.get('Retry-After') ?? '2')
    if (attempt === maxRetries) throw new Error(`restore_429: Rate limit hit too many times. Retry after ${retryAfter}s.`)

    // Wait for Spotify's requested back-off time (+100ms buffer)
    await delay((retryAfter + 0.1) * 1000)
    attempt++
  }

  throw new Error('restore_429: Exceeded retry limit')
}

// ─────────────────────────────────────────────────────────────
// CREATE PLAYLIST
// POST /me/playlists  (modern endpoint — /users/{id}/playlists returns 403)
// Scopes required: playlist-modify-public, playlist-modify-private
// ─────────────────────────────────────────────────────────────

export interface CreatePlaylistOptions {
  name:          string
  description:   string
  /** Whether the playlist is public. Defaults to false (private). */
  isPublic:      boolean
  /**
   * Collaborative playlists must be private (Spotify enforces this).
   * If collaborative=true AND isPublic=true was in the backup, we
   * silently flip isPublic to false and warn the caller.
   */
  collaborative: boolean
}

export interface CreatedPlaylist {
  id:   string    // New Spotify playlist ID on the destination account
  name: string
  url:  string    // Spotify open URL for the new playlist
  /** True if we had to override public→private to satisfy collaborative requirement */
  publicOverridden: boolean
}

export async function createPlaylist(
  accessToken: string,
  opts:        CreatePlaylistOptions,
): Promise<CreatedPlaylist> {
  // Spotify rule: collaborative playlists must be private
  const publicOverridden = opts.collaborative && opts.isPublic
  const isPublic = publicOverridden ? false : opts.isPublic

  const body = {
    name:          opts.name.trim() || 'Untitled Playlist',
    description:   opts.description ?? '',
    public:        isPublic,
    collaborative: opts.collaborative,
  }

  const res = await spotifyFetch(
    `${BASE}/me/playlists`,
    {
      method:  'POST',
      headers: authHeader(accessToken),
      body:    JSON.stringify(body),
    },
  )

  if (!res.ok) {
    const body = await res.json().catch(() => ({} as { error?: { message?: string } }))
    const spotifyMsg = (body as { error?: { message?: string } })?.error?.message ?? ""
    throw new Error(`create_playlist_${res.status}${spotifyMsg ? ":" + spotifyMsg : ""}`)
  }

  const pl = (await res.json()) as { id: string; name: string; external_urls: { spotify: string } }
  return {
    id:               pl.id,
    name:             pl.name,
    url:              pl.external_urls.spotify,
    publicOverridden,
  }
}

// ─────────────────────────────────────────────────────────────
// ADD TRACKS TO A PLAYLIST  (Milestone 11)
// POST /playlists/{playlist_id}/items  (replaces deprecated /tracks — Spotify Feb 2026 API update)
// Scopes: playlist-modify-public, playlist-modify-private
//
// Spotify limits: max 100 URIs per call.
// Call this in a loop with chunks of 100.
// ─────────────────────────────────────────────────────────────

export interface AddTracksResult {
  snapshot_id: string
}

/**
 * Adds up to 100 track URIs to a playlist.
 * Returns the new snapshot_id on success.
 * Throws on non-429 errors (caller decides how to handle).
 */
export async function addTracksToPlaylist(
  accessToken: string,
  playlistId:  string,
  uris:        string[],   // max 100
): Promise<AddTracksResult> {
  if (uris.length === 0) return { snapshot_id: '' }
  if (uris.length > 100) {
    throw new Error('addTracksToPlaylist: max 100 URIs per call — split into batches first')
  }

  const res = await spotifyFetch(
    `${BASE}/playlists/${encodeURIComponent(playlistId)}/items`,
    {
      method:  'POST',
      headers: authHeader(accessToken),
      body:    JSON.stringify({ uris }),
    },
  )

  if (!res.ok) {
    const rawText = await res.text().catch(() => '')
    let spotifyMsg = ''
    let spotifyReason = ''
    try {
      const errBody = JSON.parse(rawText) as { error?: { status?: number; message?: string; reason?: string } }
      spotifyMsg   = errBody?.error?.message ?? ''
      spotifyReason = errBody?.error?.reason  ?? ''
    } catch { /* ignore */ }
    const detail = [spotifyMsg, spotifyReason].filter(Boolean).join(' / ')
    throw new Error(`add_tracks_${res.status}${detail ? ':' + detail : ''}`)
  }

  return res.json() as Promise<AddTracksResult>
}

// ─────────────────────────────────────────────────────────────
// CHUNK HELPER  — splits an array into groups of N
// ─────────────────────────────────────────────────────────────
export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// ─────────────────────────────────────────────────────────────
// SAVE LIKED SONGS  (Milestone 12)
// PUT /me/library  (Spotify Feb 2026 — replaces deprecated PUT /me/tracks)
// Scope: user-library-modify
//
// Spotify limits: max 50 URIs per call.
// Accepts track URIs: ["spotify:track:XXXX", ...]
// Returns 200 with empty body on success.
// ─────────────────────────────────────────────────────────────

/**
 * Saves up to 50 track URIs to the authenticated user's Liked Songs library.
 * Throws on any non-2xx response (caller handles retry logic).
 */
export async function saveLikedSongs(
  accessToken: string,
  uris:        string[],   // max 50
): Promise<void> {
  if (uris.length === 0)  return
  if (uris.length > 50) {
    throw new Error('saveLikedSongs: max 50 URIs per call — split into batches first')
  }

  const res = await spotifyFetch(
    `${BASE}/me/library`,
    {
      method:  'PUT',
      headers: authHeader(accessToken),
      body:    JSON.stringify({ uris }),
    },
  )

  if (!res.ok) {
    const rawText = await res.text().catch(() => '')
    let detail = ''
    try {
      const body = JSON.parse(rawText) as { error?: { message?: string; reason?: string } }
      detail = [body?.error?.message, body?.error?.reason].filter(Boolean).join(' / ')
    } catch { /* ignore */ }
    throw new Error(`save_liked_${res.status}${detail ? ':' + detail : ''}`)
  }
}
