/**
 * resultsExport.ts — utilities for exporting restore results as JSON.
 * Collects data from all restore operations for debugging and archival.
 */

export interface RestoreLogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  step: "playlists" | "tracks" | "liked-songs" | "summary";
  message: string;
}

export interface RestoreResultSummary {
  exportedAt: string;
  source: { id: string; displayName: string | null };
  destination: { id: string; displayName: string | null };
  playlists: { created: number; failed: number; total: number };
  tracks: {
    restored: number;
    skippedLocal: number;
    skippedEpisode: number;
    skippedUnavailable: number;
    skippedNull: number;
    failed: number;
    total: number;
  };
  likedSongs: {
    restored: number;
    skippedLocal: number;
    skippedEpisode: number;
    skippedNull: number;
    failed: number;
    total: number;
  };
  logs: RestoreLogEntry[];
}

export function downloadResultsJSON(results: RestoreResultSummary): void {
  const json = JSON.stringify(results, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `spotify-restore-results-${new Date().toISOString().split("T")[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const formatNumber = (n: number) => n.toLocaleString();
export const calculateSuccessRate = (succeeded: number, total: number) =>
  total === 0 ? 0 : Math.round((succeeded / total) * 100);
