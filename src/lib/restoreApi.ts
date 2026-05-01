/**
 * restoreApi.ts — Spotify API write operations for restore flow.
 * Includes: createPlaylist, addTracksToPlaylist, saveLikedSongs with rate-limit handling.
 */

const BASE = "https://api.spotify.com/v1";
const authHeader = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

export const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function spotifyFetch(url: string, options: RequestInit, maxRetries: number = 3): Promise<Response> {
  let attempt = 0;
  while (attempt <= maxRetries) {
    const res = await fetch(url, options);
    if (res.status !== 429) return res;
    const retryAfter = Number(res.headers.get("Retry-After") ?? "2");
    if (attempt === maxRetries) throw new Error(`restore_429: Rate limit hit too many times. Retry after ${retryAfter}s.`);
    await delay((retryAfter + 0.1) * 1000);
    attempt++;
  }
  throw new Error("restore_429: Exceeded retry limit");
}

export interface CreatePlaylistOptions { name: string; description: string; isPublic: boolean; collaborative: boolean; }
export interface CreatedPlaylist { id: string; name: string; url: string; publicOverridden: boolean; }
export interface AddTracksResult { snapshot_id: string; }

export async function createPlaylist(accessToken: string, opts: CreatePlaylistOptions): Promise<CreatedPlaylist> {
  const publicOverridden = opts.collaborative && opts.isPublic;
  const isPublic = publicOverridden ? false : opts.isPublic;
  const body = {
    name: opts.name.trim() || "Untitled Playlist",
    description: opts.description ?? "",
    public: isPublic,
    collaborative: opts.collaborative,
  };
  const res = await spotifyFetch(`${BASE}/me/playlists`, {
    method: "POST",
    headers: authHeader(accessToken),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: { message?: string } });
    const spotifyMsg = (body as { error?: { message?: string } })?.error?.message ?? "";
    throw new Error(`create_playlist_${res.status}${spotifyMsg ? ":" + spotifyMsg : ""}`);
  }
  const pl = (await res.json()) as { id: string; name: string; external_urls: { spotify: string } };
  return { id: pl.id, name: pl.name, url: pl.external_urls.spotify, publicOverridden };
}

export async function addTracksToPlaylist(accessToken: string, playlistId: string, uris: string[]): Promise<AddTracksResult> {
  if (uris.length === 0) return { snapshot_id: "" };
  if (uris.length > 100) throw new Error("addTracksToPlaylist: max 100 URIs per call");
  const res = await spotifyFetch(`${BASE}/playlists/${encodeURIComponent(playlistId)}/items`, {
    method: "POST",
    headers: authHeader(accessToken),
    body: JSON.stringify({ uris }),
  });
  if (!res.ok) {
    const rawText = await res.text().catch(() => "");
    let spotifyMsg = "";
    let spotifyReason = "";
    try {
      const errBody = JSON.parse(rawText) as { error?: { status?: number; message?: string; reason?: string } };
      spotifyMsg = errBody?.error?.message ?? "";
      spotifyReason = errBody?.error?.reason ?? "";
    } catch {}

  return res.json() as Promise<AddTracksResult>;
}

// ─────────────────────────────────────────────────────────────
// CHUNK HELPER  — splits an array into groups of N
// ─────────────────────────────────────────────────────────────
export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
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
 * IMPORTANT: Spotify 2026 API — URIs must be sent as query parameters, not in body.
 * Throws on any non-2xx response (caller handles retry logic).
 */
export async function saveLikedSongs(
  accessToken: string,
  uris: string[], // max 50
): Promise<void> {
  if (uris.length === 0) return;
  if (uris.length > 50) {
    throw new Error(
      "saveLikedSongs: max 50 URIs per call — split into batches first",
    );
  }

  // Spotify 2026: URIs go as query parameters, comma-separated
  const params = new URLSearchParams();
  params.append("uris", uris.join(","));

  const res = await spotifyFetch(`${BASE}/me/library?${params.toString()}`, {
    method: "PUT",
    headers: authHeader(accessToken),
  });

  if (!res.ok) {
    const rawText = await res.text().catch(() => "");
    let detail = "";
    try {
      const body = JSON.parse(rawText) as {
        error?: { message?: string; reason?: string };
      };
      detail = [body?.error?.message, body?.error?.reason]
        .filter(Boolean)
        .join(" / ");
    } catch {
      /* ignore */
    }
    throw new Error(`save_liked_${res.status}${detail ? ":" + detail : ""}`);
  }
}
