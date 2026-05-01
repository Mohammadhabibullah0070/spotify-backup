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

import { useState, useCallback } from "react";
import { useAuth } from "./useAuth";
import { useImportedBackup } from "../context/BackupContext";
import { fetchAllPlaylistTracks } from "../lib/spotifyApi";
import { buildBackup, downloadBackup } from "../lib/backupFormat";
import type { PlaylistItem, SpotifyPlaylist } from "../lib/spotifyApi";
import type { SavedTrack } from "../lib/spotifyApi";

export type BackupStatus = "idle" | "fetching" | "building" | "done" | "error";

export interface BackupProgress {
  playlistIndex: number;
  playlistTotal: number;
  playlistName: string;
  tracksFetched: number;
  tracksTotal: number;
}

export interface BackupResult {
  filename: string;
  fileSize: string;
  totalPlaylists: number;
  totalTracks: number;
  totalLiked: number;
  warnings: string[];
}

export interface UseBackupResult {
  status: BackupStatus;
  progress: BackupProgress | null;
  result: BackupResult | null;
  error: string | null;
  startBackup: (
    playlists: SpotifyPlaylist[],
    likedSongs: SavedTrack[],
  ) => Promise<void>;
  reset: () => void;
}

export function useBackup(): UseBackupResult {
  const { source, getAccessToken } = useAuth();
  const {
    setStatus: setContextStatus,
    addLog,
    clearLogs,
  } = useImportedBackup();

  const [status, setStatus] = useState<BackupStatus>("idle");
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [result, setResult] = useState<BackupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setProgress(null);
    setResult(null);
    setError(null);
    setContextStatus("IDLE");
    clearLogs();
  }, [setContextStatus, clearLogs]);

  const handleError = (msg: string) => {
    setError(msg);
    setStatus("error");
    setContextStatus("ERROR");
    addLog(`Error: ${msg}`, "error");
  };

  const startBackup = useCallback(
    async (playlists: SpotifyPlaylist[], likedSongs: SavedTrack[]) => {
      clearLogs();
      setContextStatus("BACKING_UP");
      addLog("Starting backup...", "info");

      if (!source?.user) {
        handleError("No source account connected.");
        return;
      }

      const token = await getAccessToken("source");
      if (!token) {
        handleError("Session expired. Please reconnect your source account.");
        return;
      }

      setStatus("fetching");
      setError(null);
      setResult(null);
      addLog(`Fetching ${playlists.length} playlists...`, "info");

      const playlistTracks = new Map<string, PlaylistItem[] | Error>();

      for (let i = 0; i < playlists.length; i++) {
        const pl = playlists[i];
        const trackCount = pl.items?.total ?? 0;

        setProgress({
          playlistIndex: i + 1,
          playlistTotal: playlists.length,
          playlistName: pl.name,
          tracksFetched: 0,
          tracksTotal: trackCount,
        });

        addLog(`Fetching "${pl.name}" (${trackCount} tracks)...`, "info");

        try {
          const items = await fetchAllPlaylistTracks(
            token,
            pl.id,
            (fetched, total) => {
              setProgress((prev) =>
                prev
                  ? { ...prev, tracksFetched: fetched, tracksTotal: total }
                  : null,
              );
            },
          );
          playlistTracks.set(pl.id, items);
          addLog(`✓ "${pl.name}" fetched`, "success");
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          playlistTracks.set(
            pl.id,
            err instanceof Error ? err : new Error(String(err)),
          );
          addLog(`✗ Failed to fetch "${pl.name}": ${errorMsg}`, "error");
        }
      }

      setStatus("building");
      setProgress(null);
      addLog("Building backup file...", "info");

      const { backup, warnings } = buildBackup(
        source.user,
        likedSongs,
        playlists,
        playlistTracks,
      );
      const fileSize = downloadBackup(backup, source.user.id);
      const date = new Date().toISOString().slice(0, 10);

      setResult({
        filename: `spotify-backup-${source.user.id}-${date}.json`,
        fileSize,
        totalPlaylists: backup.stats.totalPlaylists,
        totalTracks: backup.stats.totalPlaylistTracks,
        totalLiked: backup.stats.totalLikedSongs,
        warnings,
      });

      addLog(
        `✓ Backup complete! (${backup.stats.totalPlaylistTracks} tracks, ${backup.stats.totalLikedSongs} liked)`,
        "success",
      );
      setStatus("done");
      setContextStatus("COMPLETE");
    },
    [source, getAccessToken, setContextStatus, addLog, clearLogs],
  );

  return { status, progress, result, error, startBackup, reset };
}
