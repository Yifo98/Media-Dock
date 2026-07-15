import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'

import type { MediaTaskEngine } from './mediaTaskEngine.js'

type LegacyPackageCandidate = Readonly<{
  directory: string
  modifiedAt: number
}>

export async function importLatestLegacyAuthenticationPackage(
  engine: MediaTaskEngine,
  legacyRoot: string,
): Promise<boolean> {
  if (engine.getWorkspaceSnapshot().authenticationProfiles.length > 0) return false

  const entries = await readdir(legacyRoot, { withFileTypes: true }).catch(() => [])
  const candidates = (await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map(async (entry): Promise<LegacyPackageCandidate | null> => {
      const directory = path.join(legacyRoot, entry.name)
      const candidateStat = await stat(directory).catch(() => null)
      return candidateStat?.isDirectory()
        ? Object.freeze({ directory, modifiedAt: candidateStat.mtimeMs })
        : null
    })))
    .filter((candidate): candidate is LegacyPackageCandidate => candidate !== null)
    .sort((left, right) => right.modifiedAt - left.modifiedAt || right.directory.localeCompare(left.directory))

  for (const candidate of candidates) {
    try {
      await engine.importAuthenticationPackage({
        sourceDirectory: candidate.directory,
        displayName: 'Existing MediaCookies',
      })
      return true
    } catch {
      // A stale or unrelated legacy directory must not block app startup. Try
      // the next most recent package and leave the source untouched.
    }
  }

  return false
}
