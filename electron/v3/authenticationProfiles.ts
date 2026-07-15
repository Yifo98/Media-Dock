import { chmod, copyFile, mkdir, readdir, readFile, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'

export type AuthenticationPackageFile = Readonly<{
  service: string
  sourcePath: string
  fileName: string
}>

const NETSCAPE_COOKIE_HEADER = '# Netscape HTTP Cookie File'
const MAX_COOKIE_FILE_BYTES = 16 * 1024 * 1024

function normalizeServiceId(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (!normalized || !/^[a-z0-9][a-z0-9._-]*$/u.test(normalized)) {
    throw new Error(`Authentication package contains an unsupported service id: ${value}`)
  }
  return normalized
}

export async function inspectAuthenticationPackage(sourceDirectory: string): Promise<readonly AuthenticationPackageFile[]> {
  const sourceStat = await stat(sourceDirectory)
  if (!sourceStat.isDirectory()) {
    throw new Error('Authentication package source must be a directory.')
  }

  const serviceDirectory = path.join(sourceDirectory, 'by-service')
  const entries = await readdir(serviceDirectory, { withFileTypes: true }).catch(() => [])
  const files: AuthenticationPackageFile[] = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.cookies.txt')) continue
    const service = normalizeServiceId(entry.name.slice(0, -'.cookies.txt'.length))
    // MediaCookies also exports generic domain snapshots for advanced use. They
    // are not product-level authentication profiles and would make automatic
    // source matching noisy, so v3 imports only named service files.
    if (service.startsWith('domain-')) continue
    const sourcePath = path.join(serviceDirectory, entry.name)
    const fileStat = await stat(sourcePath)
    if (!fileStat.isFile() || fileStat.size === 0 || fileStat.size > MAX_COOKIE_FILE_BYTES) {
      throw new Error(`Authentication Cookie file is empty or too large: ${entry.name}`)
    }
    const header = (await readFile(sourcePath, { encoding: 'utf8' })).slice(0, 256)
    if (!header.startsWith(NETSCAPE_COOKIE_HEADER)) {
      throw new Error(`Authentication Cookie file is not Netscape format: ${entry.name}`)
    }
    files.push(Object.freeze({ service, sourcePath, fileName: `${service}.cookies.txt` }))
  }

  files.sort((left, right) => left.service.localeCompare(right.service))
  if (files.length === 0) {
    throw new Error('Authentication package contains no supported by-service Cookie files.')
  }
  return Object.freeze(files)
}

export async function copyAuthenticationPackage(
  files: readonly AuthenticationPackageFile[],
  stagingDirectory: string,
  targetDirectory: string,
): Promise<void> {
  await rm(stagingDirectory, { recursive: true, force: true })
  await mkdir(path.join(stagingDirectory, 'by-service'), { recursive: true })
  try {
    for (const file of files) {
      const targetPath = path.join(stagingDirectory, 'by-service', file.fileName)
      await copyFile(file.sourcePath, targetPath)
      if (process.platform !== 'win32') await chmod(targetPath, 0o600)
    }
    await rename(stagingDirectory, targetDirectory)
  } catch (error) {
    await rm(stagingDirectory, { recursive: true, force: true })
    throw error
  }
}

function serviceTokens(value: string): readonly string[] {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/gu, ' ').trim()
  return normalized ? normalized.split(/\s+/u) : []
}

export function authenticationServiceMatches(profileService: string, sourceService: string): boolean {
  const profile = profileService.toLowerCase()
  const source = sourceService.toLowerCase()
  if (profile === source) return true
  const aliases: readonly (readonly string[])[] = [
    ['youtube', 'youtube'],
    ['bilibili', 'bilibili'],
    ['tiktok', 'tiktok'],
    ['douyin', 'douyin'],
    ['instagram', 'instagram'],
  ]
  const profileTokens = new Set(serviceTokens(profile))
  const sourceTokens = new Set(serviceTokens(source))
  return aliases.some(([profileAlias, sourceAlias]) =>
    (profile.includes(profileAlias) || profileTokens.has(profileAlias))
    && (source.includes(sourceAlias) || sourceTokens.has(sourceAlias)))
}
