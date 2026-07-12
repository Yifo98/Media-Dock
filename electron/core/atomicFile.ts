import { randomUUID } from 'node:crypto'
import { renameSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'

export function createSiblingTemporaryPath(targetPath: string, marker = 'part') {
  const extension = extname(targetPath)
  const stem = basename(targetPath, extension)
  return join(dirname(targetPath), `.${stem}.${randomUUID()}.${marker}${extension}`)
}

export function replaceFileFromTemporary(temporaryPath: string, targetPath: string) {
  // Node's rename contract replaces an existing destination in one filesystem operation.
  // Keeping both paths in the same directory also avoids cross-volume rename failures.
  renameSync(temporaryPath, targetPath)
}
