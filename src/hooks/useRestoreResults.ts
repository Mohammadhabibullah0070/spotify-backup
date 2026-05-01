/**
 * useRestoreResults — aggregates results from all three restore operations.
 * Collects final tallies from playlist creation, track restoration, and liked songs restoration.
 */

import { useAuth } from "./useAuth";
import type {
  RestoreResultSummary,
  RestoreLogEntry,
} from "../lib/resultsExport";

export interface UseRestoreResultsInput {
  playlistsCreated?: number;
  playlistsFailed?: number;
  tracksRestored?: number;
  tracksSkippedLocal?: number;
  tracksSkippedEpisode?: number;
  tracksSkippedNull?: number;
  tracksSkippedUnavailable?: number;
  tracksFailed?: number;
  likedRestored?: number;
  likedSkippedLocal?: number;
  likedSkippedEpisode?: number;
  likedSkippedNull?: number;
  likedFailed?: number;
  logs?: RestoreLogEntry[];
}

export function buildRestoreSummary(
  sourceId: string,
  sourceName: string | null,
  destId: string,
  destName: string | null,
  input: UseRestoreResultsInput = {},
): RestoreResultSummary {
  const tr = input.tracksRestored ?? 0;
  const ts =
    (input.tracksSkippedLocal ?? 0) +
    (input.tracksSkippedEpisode ?? 0) +
    (input.tracksSkippedUnavailable ?? 0) +
    (input.tracksSkippedNull ?? 0);
  const tf = input.tracksFailed ?? 0;
  const lr = input.likedRestored ?? 0;
  const ls =
    (input.likedSkippedLocal ?? 0) +
    (input.likedSkippedEpisode ?? 0) +
    (input.likedSkippedNull ?? 0);
  const lf = input.likedFailed ?? 0;

  return {
    exportedAt: new Date().toISOString(),
    source: { id: sourceId, displayName: sourceName },
    destination: { id: destId, displayName: destName },
    playlists: {
      created: input.playlistsCreated ?? 0,
      failed: input.playlistsFailed ?? 0,
      total: (input.playlistsCreated ?? 0) + (input.playlistsFailed ?? 0),
    },
    tracks: {
      restored: tr,
      skippedLocal: input.tracksSkippedLocal ?? 0,
      skippedEpisode: input.tracksSkippedEpisode ?? 0,
      skippedUnavailable: input.tracksSkippedUnavailable ?? 0,
      skippedNull: input.tracksSkippedNull ?? 0,
      failed: tf,
      total: tr + ts + tf,
    },
    likedSongs: {
      restored: lr,
      skippedLocal: input.likedSkippedLocal ?? 0,
      skippedEpisode: input.likedSkippedEpisode ?? 0,
      skippedNull: input.likedSkippedNull ?? 0,
      failed: lf,
      total: lr + ls + lf,
    },
    logs: input.logs ?? [],
  };
}

export function useRestoreResults() {
  const { source, destination } = useAuth();
  return {
    buildSummary: (
      input: UseRestoreResultsInput,
    ): RestoreResultSummary | null => {
      if (!source?.user || !destination?.user) return null;
      return buildRestoreSummary(
        source.user.id,
        source.user.display_name,
        destination.user.id,
        destination.user.display_name,
        input,
      );
    },
  };
}
