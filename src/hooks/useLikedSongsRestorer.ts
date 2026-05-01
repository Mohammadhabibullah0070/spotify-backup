/**
 * useLikedSongsRestorer — saves backup liked songs to destination account.
 * Uses PUT /me/library endpoint with max 50 URIs per call, 300ms delay between batches.
 */

import { useState, useCallback } from "react";
import { useAuth } from "./useAuth";
import { useImportedBackup } from "../context/BackupContext";
import { saveLikedSongs, chunk, delay } from "../lib/restoreApi";

export type LikedRestorerStatus = "idle" | "restoring" | "done" | "error";

export interface LikedProgress {
  saved: number;
  total: number;
  batch: number;
  batches: number;
}
export interface LikedRestoreResult {
  saved: number;
  skippedLocal: number;
  skippedEpisode: number;
  skippedNull: number;
  failed: number;
  warnings: string[];
}
export interface UseLikedSongsRestorerResult {
  status: LikedRestorerStatus;
  progress: LikedProgress | null;
  result: LikedRestoreResult | null;
  error: string | null;
  startRestoring: () => Promise<void>;
  reset: () => void;
}

const BATCH_SIZE = 50;
const DELAY_BETWEEN_MS = 300;

export function useLikedSongsRestorer(): UseLikedSongsRestorerResult {
  const { destination, getAccessToken } = useAuth();
  const {
    importedBackup,
    setStatus: setContextStatus,
    addLog,
  } = useImportedBackup();
  const [status, setStatus] = useState<LikedRestorerStatus>("idle");
  const [progress, setProgress] = useState<LikedProgress | null>(null);
  const [result, setResult] = useState<LikedRestoreResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setProgress(null);
    setResult(null);
    setError(null);
  }, []);

  const startRestoring = useCallback(async () => {
    addLog("Starting liked songs restore...", "info");

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

    const token = await getAccessToken("destination");
    if (!token) {
      setError("Destination session expired. Please reconnect.");
      setStatus("error");
      addLog("Error: Session expired", "error");
      setContextStatus("ERROR");
      return;
    }

    // ── Collect restorable URIs ───────────────────────────────
    // Only 'track' kind items have a valid Spotify URI.
    // local / episode / null are skipped.
    const urisToSave: string[] = [];
    let skippedLocal = 0;
    let skippedEpisode = 0;
    let skippedNull = 0;

    for (const item of importedBackup.likedSongs.items) {
      const t = item.track;
      if (!t || !t.uri) {
        skippedNull++;
        continue;
      }
      if (t.isLocal) {
        skippedLocal++;
        continue;
      }
      // Episodes stored in liked songs (rare but possible)
      if (t.uri.startsWith("spotify:episode:")) {
        skippedEpisode++;
        continue;
      }
      urisToSave.push(t.uri);
    }

    if (urisToSave.length === 0) {
      setResult({
        saved: 0,
        skippedLocal,
        skippedEpisode,
        skippedNull,
        failed: 0,
        warnings: [],
      });
      setStatus("done");
      addLog("✓ No liked songs to restore", "info");
      setContextStatus("COMPLETE");
      return;
    }

    const batches = chunk(urisToSave, BATCH_SIZE);
    setStatus("restoring");
    setError(null);
    setResult(null);
    addLog(`Saving ${urisToSave.length} liked songs...`, "info");

    let saved = 0;
    let failed = 0;
    const warnings: string[] = [];

    // ── Main loop — one batch at a time ───────────────────────
    for (let bi = 0; bi < batches.length; bi++) {
      const batch = batches[bi];

      setProgress({
        saved,
        total: urisToSave.length,
        batch: bi + 1,
        batches: batches.length,
      });

      try {
        await saveLikedSongs(token, batch);
        saved += batch.length;
        setProgress({
          saved,
          total: urisToSave.length,
          batch: bi + 1,
          batches: batches.length,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

        // Hard stop on auth errors
        if (msg.includes("save_liked_401")) {
          setError(
            "Session expired mid-restore. Please reconnect the destination account.",
          );
          setStatus("error");
          addLog("Error: Session expired during restore", "error");
          setContextStatus("ERROR");
          return;
        }
        if (msg.includes("save_liked_403")) {
          setError(
            "Spotify denied saving liked songs (403). " +
              'Please Force Reconnect the destination account and ensure you click "Agree" ' +
              "on the Spotify permissions screen to grant library access.",
          );
          setStatus("error");
          addLog("Error: Permission denied", "error");
          setContextStatus("ERROR");
          return;
        }

        // Batch failed — retry one by one
        warnings.push(
          `Batch ${bi + 1} failed (${msg}) — retrying track by track…`,
        );
        for (const uri of batch) {
          try {
            await saveLikedSongs(token, [uri]);
            saved++;
            await delay(DELAY_BETWEEN_MS);
          } catch {
            failed++;
            warnings.push(`Could not save: ${uri}`);
          }
        }
      }

      // Polite delay between batches
      if (bi < batches.length - 1) {
        await delay(DELAY_BETWEEN_MS);
      }
    }

    addLog(
      `✓ Liked songs restore complete (${saved} saved, ${failed} failed)`,
      "success",
    );
    setResult({
      saved,
      skippedLocal,
      skippedEpisode,
      skippedNull,
      failed,
      warnings,
    });
    setStatus("done");
    setProgress(null);
    setContextStatus("COMPLETE");
  }, [importedBackup, destination, getAccessToken, setContextStatus, addLog]);

  return { status, progress, result, error, startRestoring, reset };
}
