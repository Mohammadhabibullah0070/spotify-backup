/**
 * BackupContext — global state for the imported backup and restore progress.
 *
 * Milestone 8  — importedBackup (the parsed backup JSON)
 * Milestone 10 — playlistMap (sourceId → destinationId, built during playlist creation)
 *                Used by Milestone 11 to know where to add tracks.
 */

import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import type { SpotifyBackup } from '../lib/backupFormat'

/**
 * Maps each source playlist ID to its newly created destination playlist ID.
 * Built by usePlaylistCreator in Milestone 10.
 * Consumed by useTrackRestorer in Milestone 11.
 *
 * key   = source playlist ID from the backup
 * value = destination playlist ID just created via POST /users/{id}/playlists
 */
export type PlaylistMap = Map<string, string>

interface BackupContextValue {
  importedBackup:    SpotifyBackup | null
  setImportedBackup: (backup: SpotifyBackup | null) => void

  /**
   * null  → playlists not yet created on destination
   * Map   → creation done; use this for track restore (Milestone 11)
   */
  playlistMap:    PlaylistMap | null
  setPlaylistMap: (map: PlaylistMap | null) => void
}

const BackupContext = createContext<BackupContextValue | null>(null)

export function BackupProvider({ children }: { children: ReactNode }) {
  const [importedBackup,    setImportedBackup]    = useState<SpotifyBackup | null>(null)
  const [playlistMap,       setPlaylistMap]        = useState<PlaylistMap | null>(null)

  return (
    <BackupContext.Provider value={{
      importedBackup, setImportedBackup,
      playlistMap,    setPlaylistMap,
    }}>
      {children}
    </BackupContext.Provider>
  )
}

export function useImportedBackup(): BackupContextValue {
  const ctx = useContext(BackupContext)
  if (!ctx) throw new Error('useImportedBackup must be used inside <BackupProvider>')
  return ctx
}
