/**
 * useUserProfile — fetches and keeps Spotify user profile fresh.
 * Uses stale-while-revalidate: returns cached data instantly, refreshes silently.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "./useAuth";
import { fetchCurrentUser } from "../lib/spotifyApi";
import type { SpotifyUser } from "../lib/spotifyApi";
import type { AccountRole } from "../lib/spotifyAuth";

export type ProfileStatus = "idle" | "loading" | "success" | "error";

export interface UseUserProfileResult {
  user: SpotifyUser | null;
  status: ProfileStatus;
  error: string | null;
  isLoading: boolean;
  isRefreshing: boolean;
  refetch: () => Promise<void>;
}

export function useUserProfile(role: AccountRole): UseUserProfileResult {
  const { source, destination, getAccessToken, updateUser } = useAuth();
  const account = role === "source" ? source : destination;

  const [status, setStatus] = useState<ProfileStatus>(() => {
    if (!account) return "idle";
    return account.user ? "success" : "loading";
  });
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const lastFetchedToken = useRef<string | null>(null);

  const fetchProfile = useCallback(async () => {
    const token = await getAccessToken(role);
    if (!token) {
      setStatus(account ? "error" : "idle");
      setError(account ? "Session expired. Please log in again." : null);
      return;
    }

    if (lastFetchedToken.current === token && status === "success") return;
    lastFetchedToken.current = token;

    if (!account?.user) setStatus("loading");
    else setIsRefreshing(true);

    try {
      const freshUser = await fetchCurrentUser(token);
      updateUser(role, freshUser);
      setStatus("success");
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("fetch_user_401"))
        setError("Your session expired. Please disconnect and log in again.");
      else if (message.includes("fetch_user_403"))
        setError("Permission denied. Missing required Spotify scopes.");
      else setError("Could not load profile. Check your internet connection.");
      if (!account?.user) setStatus("error");
    } finally {
      setIsRefreshing(false);
    }
  }, [role, account, getAccessToken, updateUser, status]);

  useEffect(() => {
    if (!account) {
      setStatus("idle");
      setError(null);
      lastFetchedToken.current = null;
      return;
    }
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.tokens.accessToken]);

  return {
    user: account?.user ?? null,
    status,
    error,
    isLoading: status === "loading",
    isRefreshing,
    refetch: fetchProfile,
  };
}
