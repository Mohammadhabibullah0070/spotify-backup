/**
 * validateBackup.ts — validates an imported JSON file against our backup schema.
 *
 * We do a two-level check:
 *
 *  1. STRUCTURAL — required top-level keys exist and have the right types.
 *     Fails fast with clear error messages for each missing/wrong field.
 *
 *  2. LIGHT CONTENT — spot-checks a sample of tracks to catch obviously
 *     corrupt data without iterating 2,000+ items (which would freeze the UI).
 *
 * We intentionally do NOT exhaustively validate every track item — that
 * would be slow and the restore engine handles individual bad items itself.
 *
 * ── Required fields ─────────────────────────────────────────
 *
 *  Field                  Type        Why required
 *  ─────────────────────  ──────────  ──────────────────────────────────
 *  version                "1.0"       Future schema migration detection
 *  exportedAt             string      ISO 8601 — shown in preview card
 *  source.id              string      Identifies whose backup this is
 *  source.displayName     string|null Shown in preview card
 *  source.country         string      Informational
 *  source.product         string      Informational
 *  likedSongs             object      Must exist even if total = 0
 *  likedSongs.total       number      For the preview count
 *  likedSongs.items       array       The actual tracks
 *  playlists              array       May be empty but must be present
 *  stats                  object      For the preview summary
 *  stats.totalPlaylists   number      For the preview count
 *  stats.totalLikedSongs  number      Cross-check with likedSongs.total
 */

import type { SpotifyBackup } from './backupFormat'
import { BACKUP_VERSION }     from './backupFormat'

export type ValidationResult =
  | { valid: true;  backup: SpotifyBackup; warnings: string[] }
  | { valid: false; errors: string[] }

/** Maximum file size we accept — 20 MB should be more than enough */
const MAX_FILE_BYTES = 20 * 1024 * 1024

/**
 * Read a File object and validate it as a SpotifyBackup.
 * Returns a promise so the UI can stay responsive while the FileReader runs.
 */
export function readAndValidateBackupFile(file: File): Promise<ValidationResult> {
  return new Promise(resolve => {
    // ── File type check ────────────────────────────────────────
    if (!file.name.endsWith('.json') && file.type !== 'application/json') {
      resolve({ valid: false, errors: ['File must be a .json file.'] })
      return
    }

    // ── File size check ────────────────────────────────────────
    if (file.size > MAX_FILE_BYTES) {
      resolve({
        valid: false,
        errors: [`File is too large (${(file.size / 1_048_576).toFixed(1)} MB). Maximum is 20 MB.`],
      })
      return
    }

    const reader = new FileReader()

    reader.onerror = () => resolve({ valid: false, errors: ['Could not read the file.'] })

    reader.onload = (e) => {
      const raw = e.target?.result
      if (typeof raw !== 'string') {
        resolve({ valid: false, errors: ['File could not be read as text.'] })
        return
      }

      // ── JSON parse ─────────────────────────────────────────
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        resolve({ valid: false, errors: ['File is not valid JSON. It may be corrupted.'] })
        return
      }

      resolve(validateParsed(parsed))
    }

    reader.readAsText(file)
  })
}

/**
 * Validate the parsed JSON object against our schema.
 * Call this directly if you already have a parsed object.
 */
export function validateParsed(obj: unknown): ValidationResult {
  const errors:   string[] = []
  const warnings: string[] = []

  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return { valid: false, errors: ['Backup must be a JSON object, not an array or primitive.'] }
  }

  const data = obj as Record<string, unknown>

  // ── version ───────────────────────────────────────────────
  if (!('version' in data)) {
    errors.push('Missing field: "version". This may not be a Spotify backup file.')
  } else if (data.version !== BACKUP_VERSION) {
    // Warn for future versions but don't fail — forward-compat attempt
    warnings.push(
      `Backup version is "${data.version}" but this app expects "${BACKUP_VERSION}". ` +
      'The file may have been created by a newer version of this app.'
    )
  }

  // ── exportedAt ────────────────────────────────────────────
  if (!data.exportedAt || typeof data.exportedAt !== 'string') {
    errors.push('Missing or invalid field: "exportedAt" (expected ISO 8601 date string).')
  } else if (isNaN(Date.parse(data.exportedAt as string))) {
    errors.push(`"exportedAt" is not a valid date: "${data.exportedAt}".`)
  }

  // ── source ────────────────────────────────────────────────
  if (!data.source || typeof data.source !== 'object' || Array.isArray(data.source)) {
    errors.push('Missing or invalid field: "source" (expected an object with user info).')
  } else {
    const src = data.source as Record<string, unknown>
    if (!src.id || typeof src.id !== 'string') {
      errors.push('Missing or invalid field: "source.id".')
    }
    if (!('displayName' in src)) {
      errors.push('Missing field: "source.displayName".')
    }
    if (!src.country || typeof src.country !== 'string') {
      errors.push('Missing or invalid field: "source.country".')
    }
    if (!src.product || typeof src.product !== 'string') {
      warnings.push('"source.product" is missing — assuming "free" account.')
    }
  }

  // ── likedSongs ────────────────────────────────────────────
  if (!data.likedSongs || typeof data.likedSongs !== 'object' || Array.isArray(data.likedSongs)) {
    errors.push('Missing or invalid field: "likedSongs" (expected an object).')
  } else {
    const ls = data.likedSongs as Record<string, unknown>
    if (typeof ls.total !== 'number') {
      errors.push('Missing or invalid field: "likedSongs.total" (expected a number).')
    }
    if (!Array.isArray(ls.items)) {
      errors.push('Missing or invalid field: "likedSongs.items" (expected an array).')
    } else if (typeof ls.total === 'number' && ls.items.length !== ls.total) {
      warnings.push(
        `"likedSongs.total" is ${ls.total} but "likedSongs.items" has ${ls.items.length} entries. ` +
        'The file may be partially truncated.'
      )
    }
  }

  // ── playlists ─────────────────────────────────────────────
  if (!Array.isArray(data.playlists)) {
    errors.push('Missing or invalid field: "playlists" (expected an array).')
  } else {
    // Spot-check the first 3 playlists for required fields
    const sample = (data.playlists as unknown[]).slice(0, 3)
    sample.forEach((pl, i) => {
      if (typeof pl !== 'object' || pl === null) {
        errors.push(`playlists[${i}] is not an object.`)
        return
      }
      const p = pl as Record<string, unknown>
      if (!p.id)   errors.push(`playlists[${i}] is missing "id".`)
      if (!p.name) errors.push(`playlists[${i}] is missing "name".`)
      if (!p.tracks || typeof p.tracks !== 'object') {
        errors.push(`playlists[${i}] ("${p.name ?? '?'}") is missing "tracks".`)
      }
    })
  }

  // ── stats ─────────────────────────────────────────────────
  if (!data.stats || typeof data.stats !== 'object' || Array.isArray(data.stats)) {
    errors.push('Missing or invalid field: "stats" (expected an object).')
  } else {
    const s = data.stats as Record<string, unknown>
    if (typeof s.totalPlaylists !== 'number') {
      errors.push('Missing or invalid field: "stats.totalPlaylists".')
    }
    if (typeof s.totalLikedSongs !== 'number') {
      errors.push('Missing or invalid field: "stats.totalLikedSongs".')
    }
  }

  // ── Return result ─────────────────────────────────────────
  if (errors.length > 0) {
    return { valid: false, errors }
  }

  return { valid: true, backup: data as unknown as SpotifyBackup, warnings }
}
