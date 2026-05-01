/**
 * useTrackRestorer — adds backup tracks to destination playlists.
 * Requires: usePlaylistCreator completed so BackupContext.playlistMap is populated.
 */

import { useState, useCallback } from "react";
import { useAuth } from "./useAuth";
import { useImportedBackup } from "../context/BackupContext";
import { addTracksToPlaylist, chunk, delay } from "../lib/restoreApi";
import type { BackupPlaylist } from "../lib/backupFormat";

export type RestorerStatus = "idle" | "restoring" | "done" | "error";

export interface TrackProgress {
  playlistIndex: number;
  playlistTotal: number;
  playlistName: string;
  batchIndex: number;
  batchTotal: number;
  tracksAdded: number;
  tracksTotal: number;
}
export interface TrackRestoreResult {
  added: number;
  skippedLocal: number;
  skippedEpisode: number;
  attemptedUnavailable: number;
  skippedNull: number;
  failed: number;
  skippedPlaylists: number;
  warnings: string[];
}
export interface UseTrackRestorerResult {
  status: RestorerStatus;
  progress: TrackProgress | null;
  result: TrackRestoreResult | null;
  error: string | null;
  startRestoring: () => Promise<void>;
  reset: () => void;
}

const BATCH_SIZE = 100;
const DELAY_BETWEEN_MS = 300;

export function useTrackRestorer(): UseTrackRestorerResult {
  const { destination, getAccessToken } = useAuth();
  const {
    importedBackup,
    playlistMap,
    setPlaylistMap,
    setStatus: setContextStatus,
    addLog,
  } = useImportedBackup();
  const [status, setStatus] = useState<RestorerStatus>("idle");
  const [progress, setProgress] = useState<TrackProgress | null>(null);
  const [result, setResult] = useState<TrackRestoreResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setProgress(null);
    setResult(null);
    setError(null);
    setPlaylistMap(null);
  }, [setPlaylistMap]);

  const startRestoring = useCallback(async () => {
    addLog("Starting track restore...", "info");

    if (!importedBackup) {
      setError("No backup loaded.");
      setStatus("error");
      addLog("Error: No backup loaded", "error");
      setContextStatus("ERROR");
      return;
    }
    if (!destination?.user) {
      setError("No destination account connected.");
      setStatus("error");
      addLog("Error: No destination account connected", "error");
      setContextStatus("ERROR");
      return;
    }
    if (!playlistMap || playlistMap.size === 0) {
      setError(
        "No playlists have been created yet. Please complete Step 1 first.",
      );
      setStatus("error");
      addLog("Error: No playlists created yet", "error");
      setContextStatus("ERROR");
      return;
    }

    const token = await getAccessToken("destination");
    if (!token) {
      setError("Destination session expired. Please reconnect.");
      setStatus("error");
      addLog("Error: Destination session expired", "error");
      setContextStatus("ERROR");
      return;
    }

    const toProcess: Array<{ pl: BackupPlaylist; destId: string }> = [];
    let skippedPlaylists = 0;

    for (const pl of importedBackup.playlists) {
      if (pl.skipped) {
        skippedPlaylists++;
        continue;
      }
      const destId = playlistMap.get(pl.id);
      if (!destId) {
        skippedPlaylists++;
        continue;
      }
      toProcess.push({ pl, destId });
    }

    const tracksTotal = toProcess.reduce(
      (sum, { pl }) =>
        sum +
        pl.tracks.items.filter(
          (i) => i.kind === "track" || i.kind === "unavailable",
        ).length,
      0,
    );

    setStatus("restoring");
    setError(null);
    setResult(null);
    addLog(
      `Adding ${tracksTotal} tracks to ${toProcess.length} playlists...`,
      "info",
    );

    let added = 0;
    let skippedLocal = 0;
    let skippedEpisode = 0;
    let attemptedUnavailable = 0;
    let skippedNull = 0;
    let failed = 0;
    const warnings: string[] = [];

    // Preflight token check
    try {
      const meRes = await fetch("https://api.spotify.com/v1/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (meRes.status === 401) {
        setError(
          'Destination session expired. Please click "↺ Force Reconnect" and try again.',
        );
        setStatus("error");
        addLog("Error: Session expired during restore", "error");
        setContextStatus("ERROR");
        return;
      }
    } catch {
      /* Network error — continue */
    }

    let preflightFailed = false;

    // Direct write test
    if (toProcess.length > 0) {
      const testPl = toProcess[0];
      const testUri = testPl.pl.tracks.items.find(
        (i) => i.kind === "track" && i.track?.uri,
      )?.track?.uri;
      if (testUri) {
        const testRes = await fetch(
          `https://api.spotify.com/v1/playlists/${testPl.destId}/items`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ uris: [testUri] }),
          },
        );
        if (!testRes.ok) {
          const rawBody = await testRes.text().catch(() => "");
          setError(
            `Spotify test call failed (${testRes.status}). ` +
              `Raw response: ${rawBody || "(empty)"}. ` +
              `Playlist ID: ${testPl.destId}. ` +
              `Track URI: ${testUri}.`,
          );
          setStatus("error");
          addLog(`Error: Failed to add test track`, "error");
          setContextStatus("ERROR");
          return;
        }
        added += 1;
      }
    }

    for (let pi = 0; pi < toProcess.length; pi++) {
      const { pl, destId } = toProcess[pi];
      const items = pl.tracks.items;

      const urisToAdd: string[] = [];
      const seenUris = new Set<string>();

      for (const item of items) {
        switch (item.kind) {
          case "local":
            skippedLocal++;
            break;
          case "episode":
            skippedEpisode++;
            break;
          case "null":
            skippedNull++;
            break;
          case "unavailable": {
            const uri = item.track?.linkedFromUri ?? item.track?.uri;
            if (uri && !seenUris.has(uri)) {
              urisToAdd.push(uri);
              seenUris.add(uri);
              attemptedUnavailable++;
            } else {
              skippedNull++;
            }
            break;
          }
          case "track": {
            const uri = item.track?.uri;
            if (uri && !seenUris.has(uri)) {
              urisToAdd.push(uri);
              seenUris.add(uri);
            } else if (!uri) {
              skippedNull++;
            }
            break;
          }
        }
      }

      if (urisToAdd.length === 0) continue;

      addLog(`Adding tracks to "${pl.name}"...`, "info");

      const batches = chunk(urisToAdd, BATCH_SIZE);

      for (let bi = 0; bi < batches.length; bi++) {
        const batch = batches[bi];

        setProgress({
          playlistIndex: pi + 1,
          playlistTotal: toProcess.length,
          playlistName: pl.name,
          batchIndex: bi + 1,
          batchTotal: batches.length,
          tracksAdded: added,
          tracksTotal,
        });

        try {
          await addTracksToPlaylist(token, destId, batch);
          added += batch.length;
          setProgress({
            playlistIndex: pi + 1,
            playlistTotal: toProcess.length,
            playlistName: pl.name,
            batchIndex: bi + 1,
            batchTotal: batches.length,
            tracksAdded: added,
            tracksTotal,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);

          if (
            msg.includes("add_tracks_403") &&
            added === 0 &&
            !preflightFailed
          ) {
            preflightFailed = true;
            const rawDetail = msg.split(":").slice(1).join(":").trim();
            setError(
              `Spotify denied adding tracks (403${rawDetail ? ": " + rawDetail : ""}). ` +
                "This can happen if: (1) the destination account lacks playlist-write permission — " +
                'Force Reconnect and click "Agree" on the Spotify screen; or (2) the Spotify app ' +
                "is in Development Mode and the destination account is not added under User Management " +
                "at developer.spotify.com → your app → Settings.",
            );
            setStatus("error");
            addLog("Error: Permission denied", "error");
            setContextStatus("ERROR");
            return;
          }

          if (msg.includes("add_tracks_4")) {
            warnings.push(
              `Batch ${bi + 1} in "${pl.name}" failed (${msg}) — retrying track by track…`,
            );
            for (const uri of batch) {
              try {
                await addTracksToPlaylist(token, destId, [uri]);
                added++;
                await delay(DELAY_BETWEEN_MS);
              } catch {
                failed++;
                warnings.push(`  Could not add: ${uri}`);
              }
            }
          } else {
            failed += batch.length;
            warnings.push(
              `Batch ${bi + 1} in "${pl.name}" failed: ${friendlyError(msg)}`,
            );
          }
        }

        if (bi < batches.length - 1) await delay(DELAY_BETWEEN_MS);
      }

      addLog(`✓ Finished "${pl.name}"`, "success");

      if (pi < toProcess.length - 1) await delay(DELAY_BETWEEN_MS);
    }

    addLog(
      `✓ Track restore complete (${added} added, ${failed} failed)`,
      "success",
    );
    setResult({
      added,
      skippedLocal,
      skippedEpisode,
      attemptedUnavailable,
      skippedNull,
      failed,
      skippedPlaylists,
      warnings,
    });
    setStatus("done");
    setProgress(null);
    setContextStatus("COMPLETE");
  }, [
    importedBackup,
    destination,
    getAccessToken,
    playlistMap,
    setContextStatus,
    addLog,
  ]);

  return { status, progress, result, error, startRestoring, reset };
}

function friendlyError(msg: string): string {
  if (msg.includes("401")) return "Session expired — reconnect destination";
  if (msg.includes("403"))
    return "Permission denied — missing playlist-modify scope";
  if (msg.includes("404"))
    return "Playlist not found on Spotify (was it deleted?)";
  if (msg.includes("429")) return "Rate limited by Spotify";
  return msg;
}
