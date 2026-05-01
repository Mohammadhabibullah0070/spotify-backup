/**
 * usePlaylistTracks — fetches every item in a single playlist.
 * Re-fetches if playlistId changes, exposes per-page progress.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "./useAuth";
import { fetchAllPlaylistTracks } from "../lib/spotifyApi";
import type { PlaylistItem } from "../lib/spotifyApi";
import type { AccountRole } from "../lib/spotifyAuth";

export type TracksStatus = "idle" | "loading" | "success" | "error";

export interface TrackProgress {
  fetched: number;
  total: number;
}

export interface UsePlaylistTracksResult {
  tracks: PlaylistItem[];
  status: TracksStatus;
  progress: TrackProgress | null;
  error: string | null;
  refetch: () => Promise<void>;
}

export function usePlaylistTracks(
  role: AccountRole,
  playlistId: string | null,
): UsePlaylistTracksResult {
  const { getAccessToken } = useAuth();

  const [tracks, setTracks] = useState<PlaylistItem[]>([]);
  const [status, setStatus] = useState<TracksStatus>("idle");
  const [progress, setProgress] = useState<TrackProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastFetched = useRef<string | null>(null);

  const fetchTracks = useCallback(async () => {
    if (!playlistId) return;

    const token = await getAccessToken(role);
    if (!token) {
      setStatus("error");
      setError("No valid session. Please log in again.");
      return;
    }

    setStatus("loading");
    setTracks([]);
    setProgress({ fetched: 0, total: 0 });
    setError(null);

    try {
      const results = await fetchAllPlaylistTracks(
        token,
        playlistId,
        (fetched, total) => {
          setProgress({ fetched, total });
        },
      );
      setTracks(results);
      setStatus("success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("fetch_tracks_401"))
        setError("Session expired. Please disconnect and log in again.");
      else if (msg.includes("fetch_tracks_403"))
        setError(
          "Access denied (403). Spotify blocked reading this playlist's tracks. This happens when: (1) the playlist is owned by another user and your app is in Development Mode, OR (2) this is a Spotify-generated playlist like 'Top Songs 2024'.",
        );
      else if (msg.includes("fetch_tracks_404"))
        setError("Playlist not found. It may have been deleted.");
      else if (msg.includes("fetch_tracks_429"))
        setError("Spotify rate limit hit. Please wait a moment and try again.");
      else setError("Failed to load tracks. Check your connection.");
      setStatus("error");
    } finally {
      setProgress(null);
    }
  }, [role, playlistId, getAccessToken]);

  useEffect(() => {
    if (!playlistId) {
      setTracks([]);
      setStatus("idle");
      setError(null);
      lastFetched.current = null;
      return;
    }
    if (lastFetched.current === playlistId && status === "success") return;
    lastFetched.current = playlistId;
    fetchTracks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistId]);

  return { tracks, status, progress, error, refetch: fetchTracks };
}
