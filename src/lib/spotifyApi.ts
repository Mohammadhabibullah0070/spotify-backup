/**
 * Thin wrappers for Spotify Web API calls.
 * Every function takes an access token and returns typed data.
 */

// ─── Shared types ─────────────────────────────────────────────

export interface SpotifyImage {
  url:    string
  width:  number | null
  height: number | null
}

export interface SpotifyFollowers {
  total: number
}

export interface SpotifyExternalUrls {
  spotify: string
}

// Generic paginated response wrapper used by all list endpoints
export interface SpotifyPage<T> {
  items:    T[]
  total:    number
  limit:    number
  offset:   number
  next:     string | null
  previous: string | null
  href:     string
}

// ─── User ─────────────────────────────────────────────────────

export interface SpotifyUser {
  id:            string
  display_name:  string | null
  email:         string
  images:        SpotifyImage[]
  product:       'premium' | 'free' | 'open' | string
  country:       string
  followers:     SpotifyFollowers
  external_urls: SpotifyExternalUrls
}

// ─── Playlist types ───────────────────────────────────────────

export interface SpotifyPlaylistOwner {
  id:            string
  display_name:  string | null
  external_urls: SpotifyExternalUrls
  type:          string
}

// Renamed from TracksRef → ItemsRef in the February 2026 API update
export interface SpotifyPlaylistItemsRef {
  href:  string
  total: number
}

export interface SpotifyPlaylist {
  id:            string
  name:          string
  description:   string | null
  owner:         SpotifyPlaylistOwner
  public:        boolean | null
  collaborative: boolean
  items?:        SpotifyPlaylistItemsRef   // absent for playlists you follow but don't own
  images:        SpotifyImage[]
  snapshot_id:   string
  external_urls: SpotifyExternalUrls
}

// ─── Track / Episode types (used inside playlist items) ───────

export interface SpotifyArtist {
  id:   string
  name: string
  external_urls: SpotifyExternalUrls
}

export interface SpotifyAlbum {
  id:     string
  name:   string
  images: SpotifyImage[]
  external_urls: SpotifyExternalUrls
}

/**
 * A normal Spotify track OR a local file track.
 *
 * Local files have:
 *   is_local   = true
 *   id         = null
 *   uri        = "spotify:local:Artist:Album:TrackName:duration_seconds"
 *   is_playable = undefined / not set
 *
 * Unavailable tracks (geo-restricted) have:
 *   is_playable = false
 *   linked_from = the original URI that should be used for restore
 */
export interface SpotifyTrack {
  type:         'track'
  id:           string | null   // null for local files
  name:         string
  uri:          string
  is_local:     boolean
  is_playable?: boolean         // absent = assume playable; false = blocked in user's region
  duration_ms:  number
  explicit:     boolean
  artists:      SpotifyArtist[]
  album:        SpotifyAlbum
  linked_from?: {               // Present when track was relinked due to regional restriction
    uri: string
    id:  string
  }
  external_ids?: { isrc?: string }
  external_urls: SpotifyExternalUrls
}

/**
 * A podcast episode (can appear in playlists in some regions).
 * We display these but skip them during restore — they cannot be added
 * to music playlists via the API.
 */
export interface SpotifyEpisode {
  type:         'episode'
  id:           string
  name:         string
  uri:          string
  duration_ms:  number
  description:  string
  show: {
    id:   string
    name: string
  }
  external_urls: SpotifyExternalUrls
}

/**
 * One item in a playlist — wraps either a track or an episode.
 *
 * February 2026 API change: the field was renamed from 'track' to 'item'.
 *
 * item can be:
 *   SpotifyTrack   — normal track or local file
 *   SpotifyEpisode — podcast episode
 *   null           — track was deleted or is completely unavailable
 */
export interface PlaylistItem {
  added_at: string | null
  added_by: { id: string } | null
  is_local: boolean     // true when this item is a local file
  item:     SpotifyTrack | SpotifyEpisode | null  // renamed from 'track' in Feb 2026
}

/**
 * Classified kind for a playlist item — used by TrackList to decide
 * how to render and what label/badge to show.
 *
 *  'track'       → normal Spotify track, fully restorable
 *  'local'       → local file, display-only — CANNOT be restored via API
 *  'episode'     → podcast episode — skipped during restore
 *  'unavailable' → geo-restricted track — try linked_from.uri during restore
 *  'null'        → deleted / totally unavailable — skip during restore
 */
export type TrackKind = 'track' | 'local' | 'episode' | 'unavailable' | 'null'

/** Classify a PlaylistItem into one of the TrackKind values */
export function classifyItem(playlistItem: PlaylistItem): TrackKind {
  if (!playlistItem.item)                                  return 'null'
  if (playlistItem.is_local || playlistItem.item.is_local) return 'local'
  if (playlistItem.item.type === 'episode')                return 'episode'
  const t = playlistItem.item as SpotifyTrack
  if (t.is_playable === false)                             return 'unavailable'
  return 'track'
}

/** Format duration from milliseconds to m:ss */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

// ─── Fetch helpers ────────────────────────────────────────────

const BASE = 'https://api.spotify.com/v1'

function authHeader(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` }
}

let spotifyReadBlockedUntil = 0

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function spotifyReadFetch(
  url: string,
  accessToken: string,
  maxRetries: number = 2,
): Promise<Response> {
  let attempt = 0

  while (attempt <= maxRetries) {
    const now = Date.now()
    if (spotifyReadBlockedUntil > now) {
      await wait(spotifyReadBlockedUntil - now)
    }

    const res = await fetch(url, { headers: authHeader(accessToken) })
    if (res.status !== 429) return res

    const retryAfter = Number(res.headers.get('Retry-After') ?? '5')
    spotifyReadBlockedUntil = Date.now() + (retryAfter + 1) * 1000

    if (attempt === maxRetries) {
      throw new Error(`spotify_read_429:${retryAfter}`)
    }

    await wait((retryAfter + 1) * 1000)
    attempt += 1
  }

  throw new Error('spotify_read_429')
}


// ─── User profile ─────────────────────────────────────────────

export async function fetchCurrentUser(accessToken: string): Promise<SpotifyUser> {
  const res = await fetch(`${BASE}/me`, { headers: authHeader(accessToken) })
  if (!res.ok) throw new Error(`fetch_user_${res.status}`)
  return res.json() as Promise<SpotifyUser>
}

// ─── Playlists list ───────────────────────────────────────────

/**
 * GET /me/playlists — fetches ALL playlists with automatic pagination.
 * Requires: playlist-read-private, playlist-read-collaborative
 */
export async function fetchAllPlaylists(
  accessToken: string,
  onProgress?: (fetched: number, total: number) => void,
): Promise<SpotifyPlaylist[]> {
  const all: SpotifyPlaylist[] = []
  const LIMIT = 50
  let offset = 0
  let total  = Infinity

  while (offset < total) {
    const params = new URLSearchParams({
      limit:  String(LIMIT),
      offset: String(offset),
    })

    const res = await spotifyReadFetch(`${BASE}/me/playlists?${params}`, accessToken)

    if (!res.ok) throw new Error(`fetch_playlists_${res.status}`)

    const page = (await res.json()) as SpotifyPage<SpotifyPlaylist | null>
    total = page.total

    // Filter out null items — items (track list) being absent is NORMAL for followed playlists
    const validItems = page.items.filter((p): p is SpotifyPlaylist => p !== null)
    all.push(...validItems)
    onProgress?.(all.length, total)
    offset += page.items.length
    if (!page.next) break
  }

  return all
}

// ─── Playlist tracks ──────────────────────────────────────────

/**
 * GET /playlists/{id}/items — fetches ALL items in a playlist with pagination.
 *
 * NOTE: This endpoint was updated in the February 2026 API change.
 *       The old endpoint was GET /playlists/{id}/tracks (now deprecated).
 *       Always use /items.
 *
 * Handles items up to the Spotify max of 100 per page.
 * Passing market=from_token lets Spotify tell us which tracks
 * are unplayable in the user's region (is_playable = false).
 *
 * Requires: playlist-read-private, playlist-read-collaborative
 */
export async function fetchAllPlaylistTracks(
  accessToken: string,
  playlistId:  string,
  onProgress?: (fetched: number, total: number) => void,
): Promise<PlaylistItem[]> {
  const all:  PlaylistItem[] = []
  const LIMIT = 100   // Maximum allowed for playlist items endpoint
  let offset  = 0
  let total   = Infinity

  while (offset < total) {
    const params = new URLSearchParams({
      limit:  String(LIMIT),
      offset: String(offset),
      // NOTE: We deliberately do NOT pass market=from_token here.
      // Passing market filters out tracks not licensed in the user's country,
      // returning them as null items instead of the real track object.
      // This caused all tracks to appear as "Deleted" in some regions (e.g. Bangladesh).
      // Without market, Spotify returns the full track object for all items regardless of region.
    })

    const res = await fetch(`${BASE}/playlists/${playlistId}/items?${params}`, {
      headers: authHeader(accessToken),
    })

    if (!res.ok) throw new Error(`fetch_tracks_${res.status}`)

    const page = (await res.json()) as SpotifyPage<PlaylistItem | null>
    total = page.total

    // Null items can appear when a track was deleted from Spotify entirely
    const valid = page.items.filter((i): i is PlaylistItem => i !== null)
    all.push(...valid)
    onProgress?.(all.length, total)
    offset += page.items.length
    if (!page.next) break
  }

  return all
}

// ─── Liked Songs (Saved Tracks) ──────────────────────────────

/**
 * One item from GET /me/tracks (User's Saved Tracks).
 *
 * NOTE: Unlike playlist items (which use 'item' since Feb 2026),
 * the saved tracks endpoint still uses 'track' as the field name.
 * Saved tracks are ALWAYS SpotifyTrack — never episodes or null.
 */
export interface SavedTrack {
  added_at: string       // ISO 8601 UTC — "2023-04-15T10:22:33Z"
  track:    SpotifyTrack // Always a real track — no episodes in liked songs
}

/**
 * Fetches ALL liked songs for the authenticated user by walking
 * every pagination page.
 *
 * GET /me/tracks returns max 50 items per page (unlike playlist
 * items which allows 100). A user with 500 liked songs needs 10 calls.
 *
 * Requires scope: user-library-read
 *
 * ── Restore note ────────────────────────────────────────────
 * To RESTORE liked songs in a later milestone, use the 2026 endpoint:
 *   PUT /me/library   (body: { uris: ["spotify:track:...", ...] })
 * The old PUT /me/tracks endpoint was removed in Feb 2026.
 * The new endpoint accepts Spotify URIs (not IDs) in batches of 50.
 * Requires scope: user-library-modify
 */
export async function fetchAllLikedSongs(
  accessToken: string,
  onProgress?: (fetched: number, total: number) => void,
): Promise<SavedTrack[]> {
  const all:  SavedTrack[] = []
  const LIMIT = 50   // Maximum allowed by GET /me/tracks
  let offset  = 0
  let total   = Infinity

  while (offset < total) {
    const params = new URLSearchParams({
      limit:  String(LIMIT),
      offset: String(offset),
    })

    const res = await spotifyReadFetch(`${BASE}/me/tracks?${params}`, accessToken)

    if (!res.ok) throw new Error(`fetch_liked_${res.status}`)

    const page = (await res.json()) as SpotifyPage<SavedTrack | null>
    total = page.total

    // Filter out any null items (shouldn't happen but be safe)
    const valid = page.items.filter(
      (i): i is SavedTrack => i !== null && i.track !== null
    )
    all.push(...valid)
    onProgress?.(all.length, total)

    offset += page.items.length
    if (!page.next) break
  }

  return all
}
