/**
 * backupFormat.ts — Spotify Backup JSON schema for self-contained library export.
 * Stores: liked songs + all playlists + their tracks in a single JSON document.
 */

import type {
  SpotifyUser,
  SpotifyPlaylist,
  SavedTrack,
  PlaylistItem,
} from "./spotifyApi";
import { classifyItem } from "./spotifyApi";
import type { TrackKind } from "./spotifyApi";

export const BACKUP_VERSION = "1.0" as const;

export interface SpotifyBackup {
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  source: BackupUser;
  likedSongs: BackupLikedSongs;
  playlists: BackupPlaylist[];
  stats: BackupStats;
}

export interface BackupUser {
  id: string;
  displayName: string | null;
  email: string;
  country: string;
  product: string;
}

export interface BackupLikedSongs {
  total: number;
  items: BackupSavedTrack[];
}

export interface BackupSavedTrack {
  addedAt: string | null;
  track: BackupTrack;
}

export interface BackupPlaylist {
  id: string;
  name: string;
  description: string | null;
  public: boolean | null;
  collaborative: boolean;
  owner: { id: string; displayName: string | null };
  snapshotId: string;
  tracks: { total: number; fetched: number; items: BackupTrackItem[] };
  skipped?: {
    reason: "access_denied" | "not_found" | "network_error";
    message: string;
  };
}

export interface BackupTrackItem {
  addedAt: string | null;
  kind: TrackKind;
  track: BackupTrack | null;
}

export interface BackupTrack {
  id: string | null;
  name: string;
  uri: string;
  isLocal: boolean;
  durationMs: number;
  explicit: boolean;
  artists: { id: string; name: string }[];
  album: { id: string; name: string };
  isrc?: string;
  linkedFromUri?: string;
}

export interface BackupStats {
  totalPlaylists: number;
  playlistsSkipped: number;
  totalPlaylistTracks: number;
  totalLikedSongs: number;
  localFilesCount: number;
  episodesCount: number;
  unavailableCount: number;
  nullTracksCount: number;
}

function buildUser(user: SpotifyUser): BackupUser {
  return {
    id: user.id,
    displayName: user.display_name,
    email: user.email,
    country: user.country,
    product: user.product,
  };
}

/** Convert a SavedTrack into the backup format */
function buildSavedTrack(saved: SavedTrack): BackupSavedTrack {
  const t = saved.track;
  return {
    addedAt: saved.added_at,
    track: {
      id: t.id,
      name: t.name,
      uri: t.uri,
      isLocal: t.is_local,
      durationMs: t.duration_ms,
      explicit: t.explicit,
      artists: (t.artists ?? []).map((a) => ({ id: a.id, name: a.name })),
      album: { id: t.album?.id ?? "", name: t.album?.name ?? "" },
      isrc: t.external_ids?.isrc,
    },
  };
}

/** Convert a PlaylistItem into the backup format */
function buildTrackItem(item: PlaylistItem): BackupTrackItem {
  const kind = classifyItem(item);

  if (kind === "null" || !item.item) {
    return { addedAt: item.added_at, kind: "null", track: null };
  }

  if (kind === "episode") {
    // Episodes: store minimal info but mark as skip
    return {
      addedAt: item.added_at,
      kind: "episode",
      track: {
        id: (item.item as any).id,
        name: item.item.name,
        uri: item.item.uri,
        isLocal: false,
        durationMs: item.item.duration_ms,
        explicit: false,
        artists: [],
        album: { id: "", name: (item.item as any).show?.name ?? "Podcast" },
      },
    };
  }

  // track / local / unavailable — all have SpotifyTrack shape
  const t = item.item as import("./spotifyApi").SpotifyTrack;
  return {
    addedAt: item.added_at,
    kind,
    track: {
      id: t.id,
      name: t.name,
      uri: t.uri,
      isLocal: t.is_local,
      durationMs: t.duration_ms,
      explicit: t.explicit,
      artists: (t.artists ?? []).map((a) => ({ id: a.id, name: a.name })),
      album: { id: t.album?.id ?? "", name: t.album?.name ?? "" },
      isrc: t.external_ids?.isrc,
      linkedFromUri: t.linked_from?.uri,
    },
  };
}

// ─── Result type returned by buildBackup ─────────────────────

export interface BuildBackupResult {
  backup: SpotifyBackup;
  warnings: string[]; // non-fatal issues (e.g. skipped playlists)
}

/**
 * Assembles the full SpotifyBackup document from all the fetched data.
 *
 * playlistTracks is a Map from playlist ID → its items array (or an Error
 * if that playlist could not be fetched — e.g. 403 on Spotify-generated playlists).
 */
export function buildBackup(
  user: SpotifyUser,
  likedSongs: SavedTrack[],
  playlists: SpotifyPlaylist[],
  playlistTracks: Map<string, PlaylistItem[] | Error>,
): BuildBackupResult {
  const warnings: string[] = [];

  // ── Build liked songs section ─────────────────────────────
  const likedSection: BackupLikedSongs = {
    total: likedSongs.length,
    items: likedSongs.map(buildSavedTrack),
  };

  // ── Build playlists section ───────────────────────────────
  let totalPlaylistTracks = 0;
  let playlistsSkipped = 0;
  let localFilesCount = 0;
  let episodesCount = 0;
  let unavailableCount = 0;
  let nullTracksCount = 0;

  const backupPlaylists: BackupPlaylist[] = playlists.map((pl) => {
    const result = playlistTracks.get(pl.id);

    // Playlist fetch failed
    if (result instanceof Error) {
      playlistsSkipped++;
      const is403 = result.message.includes("fetch_tracks_403");
      const is404 = result.message.includes("fetch_tracks_404");

      const friendlyReason = result.message.includes("fetch_tracks_403")
        ? pl.owner.id !== user.id
          ? `not owned by you (owned by ${pl.owner.display_name ?? pl.owner.id})`
          : "Spotify-generated playlist — access denied"
        : result.message.includes("fetch_tracks_404")
          ? "playlist not found (may have been deleted)"
          : result.message;
      warnings.push(`Skipped "${pl.name}": ${friendlyReason}`);

      return {
        id: pl.id,
        name: pl.name,
        description: pl.description,
        public: pl.public ?? null,
        collaborative: pl.collaborative,
        owner: { id: pl.owner.id, displayName: pl.owner.display_name },
        snapshotId: pl.snapshot_id,
        tracks: { total: pl.items?.total ?? 0, fetched: 0, items: [] },
        skipped: {
          reason: is403
            ? "access_denied"
            : is404
              ? "not_found"
              : "network_error",
          message: is403
            ? pl.owner.id !== user.id
              ? `Owned by another user (${pl.owner.display_name ?? pl.owner.id}) — ` +
                "Development Mode apps cannot read tracks from playlists you follow but do not own"
              : "Spotify blocked access — this is a Spotify-generated playlist (e.g. Wrapped, Top Songs)"
            : result.message,
        },
      };
    }

    // Playlist fetched successfully
    const items = (result ?? []).map(buildTrackItem);

    // Tally special kinds
    items.forEach((i) => {
      if (i.kind === "local") localFilesCount++;
      if (i.kind === "episode") episodesCount++;
      if (i.kind === "unavailable") unavailableCount++;
      if (i.kind === "null") nullTracksCount++;
    });

    totalPlaylistTracks += items.length;

    return {
      id: pl.id,
      name: pl.name,
      description: pl.description,
      public: pl.public ?? null,
      collaborative: pl.collaborative,
      owner: { id: pl.owner.id, displayName: pl.owner.display_name },
      snapshotId: pl.snapshot_id,
      tracks: {
        total: pl.items?.total ?? items.length,
        fetched: items.length,
        items,
      },
    };
  });

  const backup: SpotifyBackup = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    source: buildUser(user),
    likedSongs: likedSection,
    playlists: backupPlaylists,
    stats: {
      totalPlaylists: playlists.length,
      playlistsSkipped,
      totalPlaylistTracks,
      totalLikedSongs: likedSongs.length,
      localFilesCount,
      episodesCount,
      unavailableCount,
      nullTracksCount,
    },
  };

  return { backup, warnings };
}

/**
 * Serialise and trigger a browser download for the backup JSON.
 * Returns the file size in a human-readable string (e.g. "1.2 MB").
 */
export function downloadBackup(backup: SpotifyBackup, userId: string): string {
  const json = JSON.stringify(backup, null, 2);
  const bytes = new TextEncoder().encode(json).length;
  const sizeStr =
    bytes > 1_048_576
      ? `${(bytes / 1_048_576).toFixed(1)} MB`
      : `${(bytes / 1024).toFixed(0)} KB`;

  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const filename = `spotify-backup-${userId}-${date}.json`;

  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  return sizeStr;
}
