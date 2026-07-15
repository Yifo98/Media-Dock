import { createRequire } from 'node:module'
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'

const require = createRequire(import.meta.url)
const extractZipPackage = require('extract-zip') as typeof import('extract-zip')

const MAX_ARCHIVE_ENTRIES = 10_000
const MAX_UNCOMPRESSED_BYTES = 4 * 1024 * 1024 * 1024

function assertSafeArchiveEntry(fileName: string) {
  const normalized = fileName.replaceAll('\\', '/')
  const segments = normalized.split('/')
  if (
    !normalized
    || normalized.includes('\0')
    || normalized.startsWith('/')
    || /^[a-z]:/iu.test(normalized)
    || segments.includes('..')
  ) {
    throw new Error(`ZIP contains an unsafe path: ${fileName}`)
  }
}

export async function extractZipArchive(zipPath: string, outputDirectory: string) {
  if (!existsSync(zipPath) || !statSync(zipPath).isFile()) {
    throw new Error(`ZIP archive does not exist: ${zipPath}`)
  }

  const resolvedOutputDirectory = path.resolve(outputDirectory)
  rmSync(resolvedOutputDirectory, { recursive: true, force: true })
  mkdirSync(resolvedOutputDirectory, { recursive: true })

  let entryCount = 0
  let uncompressedBytes = 0
  try {
    await extractZipPackage(zipPath, {
      dir: resolvedOutputDirectory,
      onEntry(entry) {
        assertSafeArchiveEntry(entry.fileName)
        entryCount += 1
        uncompressedBytes += entry.uncompressedSize
        if (entryCount > MAX_ARCHIVE_ENTRIES || uncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
          throw new Error('ZIP archive exceeds the safe extraction limit.')
        }

        const unixMode = (entry.externalFileAttributes >>> 16) & 0o170000
        if (unixMode === 0o120000) {
          throw new Error(`ZIP symbolic links are not supported: ${entry.fileName}`)
        }
      },
    })
  } catch (error) {
    rmSync(resolvedOutputDirectory, { recursive: true, force: true })
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Could not safely extract ZIP archive: ${message}`, { cause: error })
  }

  return resolvedOutputDirectory
}
