import { createHash, randomUUID } from 'node:crypto'
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { compareVersions, normalizeVersion } from './version.js'

export type RuntimeExecutableStatus = 'ready' | 'missing' | 'invalid'
export type RuntimeInstallStage = 'downloading' | 'verifying' | 'installing'

export type RuntimeExecutableInspection = {
  status: RuntimeExecutableStatus
  version: string | null
}

type DownloadResult = {
  receivedBytes: number
  totalBytes: number | null
}

type InstallValidatedRuntimeExecutableOptions = {
  targetPath: string
  expectedVersion: string
  expectedSha256?: string | null
  expectedSize?: number | null
  platform?: NodeJS.Platform
  download: (temporaryPath: string) => Promise<DownloadResult | void>
  probeVersion: (executablePath: string) => Promise<string | null>
  onStage?: (stage: RuntimeInstallStage) => void
}

export function getRuntimeUpdateAvailability(currentVersion: string | null, latestVersion: string | null) {
  const current = currentVersion?.trim() || null
  const repairRequired = current === null
  return {
    repairRequired,
    updateAvailable: Boolean(latestVersion && (!current || compareVersions(current, latestVersion) < 0)),
  }
}

function normalizedSha256(value: string | null | undefined) {
  if (!value) return null
  const normalized = value.trim().replace(/^sha256:/i, '').toLowerCase()
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : null
}

function calculateSha256(filePath: string) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

function temporaryExecutablePath(targetPath: string) {
  const extension = extname(targetPath)
  const stem = basename(targetPath, extension)
  return join(dirname(targetPath), `.${stem}.${randomUUID()}.download${extension}`)
}

export async function inspectRuntimeExecutable(
  executablePath: string | null,
  probeVersion: (executablePath: string) => Promise<string | null>,
): Promise<RuntimeExecutableInspection> {
  if (!executablePath || !existsSync(executablePath)) {
    return { status: 'missing', version: null }
  }

  try {
    const stats = statSync(executablePath)
    if (!stats.isFile() || stats.size === 0) {
      return { status: 'invalid', version: null }
    }
    const version = (await probeVersion(executablePath))?.trim() || null
    return version
      ? { status: 'ready', version }
      : { status: 'invalid', version: null }
  } catch {
    return { status: 'invalid', version: null }
  }
}

export async function installValidatedRuntimeExecutable(
  options: InstallValidatedRuntimeExecutableOptions,
) {
  const targetDir = dirname(options.targetPath)
  mkdirSync(targetDir, { recursive: true })
  const temporaryPath = temporaryExecutablePath(options.targetPath)

  try {
    options.onStage?.('downloading')
    const downloadResult = await options.download(temporaryPath)
    if (!existsSync(temporaryPath)) {
      throw new Error('The runtime download did not create a candidate file.')
    }

    const downloadedSize = statSync(temporaryPath).size
    if (downloadedSize === 0) {
      throw new Error('The runtime download is empty.')
    }
    if (downloadResult && downloadResult.receivedBytes !== downloadedSize) {
      throw new Error(`Incomplete runtime download: wrote ${downloadedSize} bytes but received ${downloadResult.receivedBytes}.`)
    }
    if (downloadResult?.totalBytes !== null && downloadResult?.totalBytes !== undefined && downloadResult.receivedBytes !== downloadResult.totalBytes) {
      throw new Error(`Incomplete runtime download: received ${downloadResult.receivedBytes} of ${downloadResult.totalBytes} bytes.`)
    }
    if (options.expectedSize && downloadedSize !== options.expectedSize) {
      throw new Error(`Runtime size validation failed: expected ${options.expectedSize} bytes but received ${downloadedSize}.`)
    }

    options.onStage?.('verifying')
    const expectedSha256 = normalizedSha256(options.expectedSha256)
    if (options.expectedSha256 && !expectedSha256) {
      throw new Error('The runtime release supplied an invalid SHA-256 digest.')
    }
    if (expectedSha256) {
      const actualSha256 = calculateSha256(temporaryPath)
      if (actualSha256 !== expectedSha256) {
        throw new Error(`Runtime SHA-256 validation failed: expected ${expectedSha256}, received ${actualSha256}.`)
      }
    }

    if ((options.platform ?? process.platform) !== 'win32') {
      chmodSync(temporaryPath, 0o755)
    }
    const version = (await options.probeVersion(temporaryPath))?.trim() || null
    if (!version) {
      throw new Error('Downloaded runtime could not report its version.')
    }
    if (normalizeVersion(version) !== normalizeVersion(options.expectedVersion)) {
      throw new Error(`Runtime version validation failed: expected ${options.expectedVersion}, received ${version}.`)
    }

    const descriptor = openSync(temporaryPath, 'r+')
    try {
      fsyncSync(descriptor)
    } finally {
      closeSync(descriptor)
    }

    options.onStage?.('installing')
    renameSync(temporaryPath, options.targetPath)

    return {
      path: options.targetPath,
      version,
    }
  } finally {
    rmSync(temporaryPath, { force: true })
  }
}
