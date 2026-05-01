/**
 * usePlaylists — fetches all playlists for a given account role.
 * Auto-fetches on login, reports progress, handles errors & refresh.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "./useAuth";
import { fetchAllPlaylists } from "../lib/spotifyApi";
import type { SpotifyPlaylist } from "../lib/spotifyApi";
import type { AccountRole } from "../lib/spotifyAuth";

export type PlaylistsStatus = "idle" | "loading" | "success" | "error";

export interface PlaylistProgress {
  fetched: number;
  total: number;
}

export interface UsePlaylistsResult {
  playlists: SpotifyPlaylist[];
  status: PlaylistsStatus;
  progress: PlaylistProgress | null;
  error: string | null;
  refetch: () => Promise<void>;
}

export function usePlaylists(role: AccountRole): UsePlaylistsResult {
  const { source, destination, getAccessToken } = useAuth();
  const account = role === "source" ? source : destination;

  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [status, setStatus] = useState<PlaylistsStatus>("idle");
  const [progress, setProgress] = useState<PlaylistProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastToken = useRef<string | null>(null);

  const fetchPlaylists = useCallback(async () => {
    const token = await getAccessToken(role);
    if (!token) {
      setStatus("error");
      setError("No valid session. Please log in again.");
      return;
    }

    setStatus("loading");
    setProgress({ fetched: 0, total: 0 });
    setError(null);

    try {
      const results = await fetchAllPlaylists(token, (fetched, total) => {
        setProgress({ fetched, total });
      });
      setPlaylists(results);
      setStatus("success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("fetch_playlists_401"))
        setError("Your session expired. Please disconnect and log in again.");
      else if (msg.includes("fetch_playlists_403"))
        setError(
          "Permission denied. Make sure you granted playlist access during login.",
        );
      else if (msg.includes("fetch_playlists_429"))
        setError(
          "Spotify rate limit hit. Wait at least 60 seconds, then click Try again once.",
        );
      else
        setError(
          "Failed to load playlists. Check your connection and try again.",
        );
      setStatus("error");
    } finally {
      setProgress(null);
    }
  }, [role, getAccessToken]);

  useEffect(() => {
    if (!account) {
      setPlaylists([]);
      setStatus("idle");
      setError(null);
      lastToken.current = null;
      return;
    }

    const token = account.tokens.accessToken;
    if (lastToken.current === token) return;
    if (status !== "idle") return;

    lastToken.current = token;
    fetchPlaylists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.tokens.accessToken, status]);

  return { playlists, status, progress, error, refetch: fetchPlaylists };
}
