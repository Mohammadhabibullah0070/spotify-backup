/**
 * backupFormat.ts — defines the Spotify Backup JSON schema.
 *
 * The backup file produced by this app is a single self-contained JSON
 * document that stores everything needed to restore a Spotify library:
 * liked songs + all playlists + their tracks.
 *
 * ── Schema overview ─────────────────────────────────────────
 * {
 *   version:    "1.0"            Schema version for future migrations
 *   exportedAt: "2026-04-16T…"  ISO 8601 UTC timestamp
 *   source:     { id, name, … } Who this backup belongs to
 *   likedSongs: { total, items } All saved tracks
 *   playlists:  [ … ]           All playlists with their tracks
 *   stats:      { … }           Summary counts for quick inspection
 * }
 */

import type { SpotifyUser, SpotifyPlaylist, SavedTrack, PlaylistItem } from './spotifyApi'
import { classifyItem } from './spotifyApi'
import type { TrackKind } from './spotifyApi'

// ─── Schema version ───────────────────────────────────────────
export const BACKUP_VERSION = '1.0' as const

// ─── Root document ────────────────────────────────────────────

export interface SpotifyBackup {
  version:    typeof BACKUP_VERSION
  exportedAt: string            // ISO 8601 UTC
  source:     BackupUser
  likedSongs: BackupLikedSongs
  playlists:  BackupPlaylist[]
  stats:      BackupStats
}

// ─── Source account ───────────────────────────────────────────

export interface BackupUser {
  id:          string
  displayName: string | null
  email:       string
  country:     string
  product:     string
}

// ─── Liked songs ──────────────────────────────────────────────

export interface BackupLikedSongs {
  total: number
  items: BackupSavedTrack[]
}

export interface BackupSavedTrack {
  addedAt: string | null   // ISO 8601
  track:   BackupTrack
}

// ─── Playlists ────────────────────────────────────────────────

export interface BackupPlaylist {
  id:            string
  name:          string
  description:   string | null
  public:        boolean | null
  collaborative: boolean
  owner:         { id: string; displayName: string | null }
  snapshotId:    string
  tracks: {
    total:   number          // Spotify-reported total
    fetched: number          // How many we actually got (may be less if access denied)
    items:   BackupTrackItem[]
  }
  /**
   * Only present if this playlist could not be fetched.
   * Common case: Spotify-generated playlists (Top Songs, Wrapped)
   * return 403 and cannot be backed up.
   */
  skipped?: {
    reason:  'access_denied' | 'not_found' | 'network_error'
    message: string
  }
}

// ─── Track item (inside a playlist) ──────────────────────────

export interface BackupTrackItem {
  addedAt: string | null
  /**
   * kind tells the restore engine what to do with this item:
   *  'track'       → restore using track.uri
   *  'local'       → skip — local files cannot be added via API
   *  'episode'     → skip — episodes cannot be added to music playlists
   *  'unavailable' → try track.linkedFromUri first, then skip if still fails
   *  'null'        → skip — track was deleted from Spotify
   */
  kind:  TrackKind
  track: BackupTrack | null   // null when kind === 'null'
}

// ─── Track data ───────────────────────────────────────────────

export interface BackupTrack {
  id:            string | null   // null for local files
  name:          string
  uri:           string
  isLocal:       boolean
  durationMs:    number
  explicit:      boolean
  artists:       { id: string; name: string }[]
  album:         { id: string; name: string }
  /**
   * ISRC = International Standard Recording Code.
   * Useful for matching a track across streaming platforms
   * when the Spotify URI is no longer valid.
   */
  isrc?:         string
  /**
   * Present for geo-restricted (unavailable) tracks.
   * The restore engine should prefer this URI over `uri` when restoring.
   */
  linkedFromUri?: string
}

// ─── Stats ────────────────────────────────────────────────────

export interface BackupStats {
  totalPlaylists:        number
  playlistsSkipped:      number   // could not be fetched (403, 404, etc.)
  totalPlaylistTracks:   number   // sum of all fetched playlist tracks
  totalLikedSongs:       number
  localFilesCount:       number   // items that cannot be restored
  episodesCount:         number   // items that cannot be restored
  unavailableCount:      number   // items that might restore via linkedFromUri
  nullTracksCount:       number   // completely missing, will be skipped
}

// ─── Builder functions ────────────────────────────────────────

/** Convert a SpotifyUser to the compact BackupUser format */
function buildUser(user: SpotifyUser): BackupUser {
  return {
    id:          user.id,
    displayName: user.display_name,
    email:       user.email,
    country:     user.country,
    product:     user.product,
  }
}

/** Convert a SavedTrack into the backup format */
function buildSavedTrack(saved: SavedTrack): BackupSavedTrack {
  const t = saved.track
  return {
    addedAt: saved.added_at,
    track: {
      id:          t.id,
      name:        t.name,
      uri:         t.uri,
      isLocal:     t.is_local,
      durationMs:  t.duration_ms,
      explicit:    t.explicit,
      artists:     (t.artists ?? []).map(a => ({ id: a.id, name: a.name })),
      album:       { id: t.album?.id ?? '', name: t.album?.name ?? '' },
      isrc:        t.external_ids?.isrc,
    },
  }
}

/** Convert a PlaylistItem into the backup format */
function buildTrackItem(item: PlaylistItem): BackupTrackItem {
  const kind = classifyItem(item)

  if (kind === 'null' || !item.item) {
    return { addedAt: item.added_at, kind: 'null', track: null }
  }

  if (kind === 'episode') {
    // Episodes: store minimal info but mark as skip
    return {
      addedAt: item.added_at,
      kind:    'episode',
      track: {
        id:         (item.item as any).id,
        name:       item.item.name,
        uri:        item.item.uri,
        isLocal:    false,
        durationMs: item.item.duration_ms,
        explicit:   false,
        artists:    [],
        album:      { id: '', name: (item.item as any).show?.name ?? 'Podcast' },
      },
    }
  }

  // track / local / unavailable — all have SpotifyTrack shape
  const t = item.item as import('./spotifyApi').SpotifyTrack
  return {
    addedAt: item.added_at,
    kind,
    track: {
      id:            t.id,
      name:          t.name,
      uri:           t.uri,
      isLocal:       t.is_local,
      durationMs:    t.duration_ms,
      explicit:      t.explicit,
      artists:       (t.artists ?? []).map(a => ({ id: a.id, name: a.name })),
      album:         { id: t.album?.id ?? '', name: t.album?.name ?? '' },
      isrc:          t.external_ids?.isrc,
      linkedFromUri: t.linked_from?.uri,
    },
  }
}

// ─── Result type returned by buildBackup ─────────────────────

export interface BuildBackupResult {
  backup:   SpotifyBackup
  warnings: string[]   // non-fatal issues (e.g. skipped playlists)
}

/**
 * Assembles the full SpotifyBackup document from all the fetched data.
 *
 * playlistTracks is a Map from playlist ID → its items array (or an Error
 * if that playlist could not be fetched — e.g. 403 on Spotify-generated playlists).
 */
export function buildBackup(
  user:           SpotifyUser,
  likedSongs:     SavedTrack[],
  playlists:      SpotifyPlaylist[],
  playlistTracks: Map<string, PlaylistItem[] | Error>,
): BuildBackupResult {
  const warnings: string[] = []

  // ── Build liked songs section ─────────────────────────────
  const likedSection: BackupLikedSongs = {
    total: likedSongs.length,
    items: likedSongs.map(buildSavedTrack),
  }

  // ── Build playlists section ───────────────────────────────
  let totalPlaylistTracks = 0
  let playlistsSkipped    = 0
  let localFilesCount     = 0
  let episodesCount       = 0
  let unavailableCount    = 0
  let nullTracksCount     = 0

  const backupPlaylists: BackupPlaylist[] = playlists.map(pl => {
    const result = playlistTracks.get(pl.id)

    // Playlist fetch failed
    if (result instanceof Error) {
      playlistsSkipped++
      const is403 = result.message.includes('fetch_tracks_403')
      const is404 = result.message.includes('fetch_tracks_404')

      const friendlyReason = result.message.includes('fetch_tracks_403')
        ? (pl.owner.id !== user.id
            ? `not owned by you (owned by ${pl.owner.display_name ?? pl.owner.id})`
            : 'Spotify-generated playlist — access denied')
        : result.message.includes('fetch_tracks_404')
          ? 'playlist not found (may have been deleted)'
          : result.message
      warnings.push(`Skipped "${pl.name}": ${friendlyReason}`)

      return {
        id:            pl.id,
        name:          pl.name,
        description:   pl.description,
        public:        pl.public ?? null,
        collaborative: pl.collaborative,
        owner:         { id: pl.owner.id, displayName: pl.owner.display_name },
        snapshotId:    pl.snapshot_id,
        tracks:        { total: pl.items?.total ?? 0, fetched: 0, items: [] },
        skipped: {
          reason:  is403 ? 'access_denied' : is404 ? 'not_found' : 'network_error',
          message: is403
            ? (pl.owner.id !== user.id
                ? `Owned by another user (${pl.owner.display_name ?? pl.owner.id}) — ` +
                  'Development Mode apps cannot read tracks from playlists you follow but do not own'
                : 'Spotify blocked access — this is a Spotify-generated playlist (e.g. Wrapped, Top Songs)')
            : result.message,
        },
      }
    }

    // Playlist fetched successfully
    const items = (result ?? []).map(buildTrackItem)

    // Tally special kinds
    items.forEach(i => {
      if (i.kind === 'local')       localFilesCount++
      if (i.kind === 'episode')     episodesCount++
      if (i.kind === 'unavailable') unavailableCount++
      if (i.kind === 'null')        nullTracksCount++
    })

    totalPlaylistTracks += items.length

    return {
      id:            pl.id,
      name:          pl.name,
      description:   pl.description,
      public:        pl.public ?? null,
      collaborative: pl.collaborative,
      owner:         { id: pl.owner.id, displayName: pl.owner.display_name },
      snapshotId:    pl.snapshot_id,
      tracks:        {
        total:   pl.items?.total ?? items.length,
        fetched: items.length,
        items,
      },
    }
  })

  const backup: SpotifyBackup = {
    version:    BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    source:     buildUser(user),
    likedSongs: likedSection,
    playlists:  backupPlaylists,
    stats: {
      totalPlaylists:      playlists.length,
      playlistsSkipped,
      totalPlaylistTracks,
      totalLikedSongs:     likedSongs.length,
      localFilesCount,
      episodesCount,
      unavailableCount,
      nullTracksCount,
    },
  }

  return { backup, warnings }
}

/**
 * Serialise and trigger a browser download for the backup JSON.
 * Returns the file size in a human-readable string (e.g. "1.2 MB").
 */
export function downloadBackup(backup: SpotifyBackup, userId: string): string {
  const json     = JSON.stringify(backup, null, 2)
  const bytes    = new TextEncoder().encode(json).length
  const sizeStr  = bytes > 1_048_576
    ? `${(bytes / 1_048_576).toFixed(1)} MB`
    : `${(bytes / 1024).toFixed(0)} KB`

  const date     = new Date().toISOString().slice(0, 10)   // YYYY-MM-DD
  const filename = `spotify-backup-${userId}-${date}.json`

  const blob = new Blob([json], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)

  return sizeStr
}
