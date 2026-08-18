import { createRequire } from 'node:module'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  statSync,
} from 'node:fs'
import path from 'node:path'

const require = createRequire(import.meta.url)
const extractZipPackage = require('extract-zip') as typeof import('extract-zip')

const MAX_ARCHIVE_ENTRIES = 10_000
const MAX_UNCOMPRESSED_BYTES = 4 * 1024 * 1024 * 1024
const electronProcess = process as typeof process & { noAsar: boolean }
let activeAsarBypasses = 0
let originalNoAsar = false

function beginAsarBypass() {
  if (activeAsarBypasses === 0) originalNoAsar = electronProcess.noAsar
  activeAsarBypasses += 1
  electronProcess.noAsar = true
  return () => {
    activeAsarBypasses -= 1
    if (activeAsarBypasses === 0) electronProcess.noAsar = originalNoAsar
  }
}

export function removeExtractedArchiveDirectory(directory: string) {
  const endAsarBypass = beginAsarBypass()
  try {
    rmSync(path.resolve(directory), { recursive: true, force: true })
  } finally {
    endAsarBypass()
  }
}

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

function isInsideDirectory(rootDirectory: string, candidate: string) {
  const relativePath = path.relative(rootDirectory, candidate)
  return relativePath === '' || (!path.isAbsolute(relativePath) && !relativePath.split(path.sep).includes('..'))
}

function validateExtractedSymlinks(rootDirectory: string, currentDirectory = rootDirectory) {
  const canonicalRoot = realpathSync(rootDirectory)
  for (const entry of readdirSync(currentDirectory, { withFileTypes: true })) {
    const entryPath = path.join(currentDirectory, entry.name)
    const entryStat = lstatSync(entryPath)
    if (entryStat.isSymbolicLink()) {
      const linkTarget = readlinkSync(entryPath)
      if (path.isAbsolute(linkTarget)) {
        throw new Error(`ZIP symbolic link uses an absolute target: ${entryPath}`)
      }
      const resolvedTarget = path.resolve(realpathSync(path.dirname(entryPath)), linkTarget)
      if (!isInsideDirectory(canonicalRoot, resolvedTarget)) {
        throw new Error(`ZIP symbolic link escapes the extraction directory: ${entryPath}`)
      }
      const canonicalTarget = realpathSync(entryPath)
      if (!isInsideDirectory(canonicalRoot, canonicalTarget)) {
        throw new Error(`ZIP symbolic link resolves outside the extraction directory: ${entryPath}`)
      }
      continue
    }
    if (entryStat.isDirectory()) validateExtractedSymlinks(canonicalRoot, entryPath)
  }
}

export async function extractZipArchive(zipPath: string, outputDirectory: string) {
  if (!existsSync(zipPath) || !statSync(zipPath).isFile()) {
    throw new Error(`ZIP archive does not exist: ${zipPath}`)
  }

  // Electron's patched fs implementation treats any path ending in `.asar` as
  // an archive. Product packages contain a literal app.asar file, so writing it
  // through the patched implementation can leave extraction permanently pending.
  const endAsarBypass = beginAsarBypass()
  const resolvedOutputDirectory = path.resolve(outputDirectory)
  try {
    rmSync(resolvedOutputDirectory, { recursive: true, force: true })
    mkdirSync(resolvedOutputDirectory, { recursive: true })

    let entryCount = 0
    let uncompressedBytes = 0
    await extractZipPackage(zipPath, {
      dir: resolvedOutputDirectory,
      onEntry(entry) {
        assertSafeArchiveEntry(entry.fileName)
        entryCount += 1
        uncompressedBytes += entry.uncompressedSize
        if (entryCount > MAX_ARCHIVE_ENTRIES || uncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
          throw new Error('ZIP archive exceeds the safe extraction limit.')
        }

      },
    })
    validateExtractedSymlinks(resolvedOutputDirectory)
  } catch (error) {
    rmSync(resolvedOutputDirectory, { recursive: true, force: true })
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Could not safely extract ZIP archive: ${message}`, { cause: error })
  } finally {
    endAsarBypass()
  }

  return resolvedOutputDirectory
}
