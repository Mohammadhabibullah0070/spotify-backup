/**
 * BackupContext — global state for imported backup and restore progress.
 * Tracks: importedBackup (parsed backup JSON), playlistMap (sourceId→destId),
 * operation status, and live activity log.
 */

import { createContext, useContext, useState, type ReactNode } from "react";
import type { SpotifyBackup } from "../lib/backupFormat";

export type PlaylistMap = Map<string, string>;
export type OperationStatus =
  | "IDLE"
  | "BACKING_UP"
  | "RESTORING"
  | "COMPLETE"
  | "ERROR";

export interface LogEntry {
  message: string;
  type: "info" | "success" | "error";
  timestamp: number;
}

interface BackupContextValue {
  importedBackup: SpotifyBackup | null;
  setImportedBackup: (backup: SpotifyBackup | null) => void;
  playlistMap: PlaylistMap | null;
  setPlaylistMap: (map: PlaylistMap | null) => void;
  status: OperationStatus;
  setStatus: (status: OperationStatus) => void;
  logs: LogEntry[];
  addLog: (message: string, type?: "info" | "success" | "error") => void;
  clearLogs: () => void;
}

const BackupContext = createContext<BackupContextValue | null>(null);

export function BackupProvider({ children }: { children: ReactNode }) {
  const [importedBackup, setImportedBackup] = useState<SpotifyBackup | null>(
    null,
  );
  const [playlistMap, setPlaylistMap] = useState<PlaylistMap | null>(null);
  const [status, setStatus] = useState<OperationStatus>("IDLE");
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = (
    message: string,
    type: "info" | "success" | "error" = "info",
  ) => {
    setLogs((prev) => [...prev, { message, type, timestamp: Date.now() }]);
  };

  return (
    <BackupContext.Provider
      value={{
        importedBackup,
        setImportedBackup,
        playlistMap,
        setPlaylistMap,
        status,
        setStatus,
        logs,
        addLog,
        clearLogs: () => setLogs([]),
      }}
    >
      {children}
    </BackupContext.Provider>
  );
}

export function useImportedBackup(): BackupContextValue {
  const ctx = useContext(BackupContext);
  if (!ctx)
    throw new Error("useImportedBackup must be used inside <BackupProvider>");
  return ctx;
}
