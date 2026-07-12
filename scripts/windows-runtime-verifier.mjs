import { createHash } from 'node:crypto'
import {
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const YT_DLP_RELEASE_API = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases'
const REQUIRED_WINDOWS_TOOLS = ['yt-dlp.exe', 'deno.exe', 'ffmpeg.exe', 'ffprobe.exe']

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

function normalizeDigest(value) {
  const normalized = String(value ?? '').trim().replace(/^sha256:/i, '').toLowerCase()
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : null
}

function requireRegularFile(filePath, label) {
  if (!existsSync(filePath)) {
    throw new Error(`${label} is missing: ${filePath}`)
  }
  const stats = statSync(filePath)
  if (!stats.isFile() || stats.size === 0) {
    throw new Error(`${label} is empty or not a regular file: ${filePath}`)
  }
  return stats
}

export async function resolveYtDlpWindowsRelease({ version = '', fetchImpl = fetch } = {}) {
  const requestedVersion = String(version).trim()
  const endpoint = requestedVersion
    ? `${YT_DLP_RELEASE_API}/tags/${encodeURIComponent(requestedVersion)}`
    : `${YT_DLP_RELEASE_API}/latest`
  const response = await fetchImpl(endpoint, {
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (!response.ok) {
    throw new Error(`Could not resolve the official yt-dlp release (${response.status ?? 'unknown status'}).`)
  }

  const release = await response.json()
  const resolvedVersion = String(release.tag_name ?? '').trim()
  if (!resolvedVersion || (requestedVersion && resolvedVersion !== requestedVersion)) {
    throw new Error(`yt-dlp release version mismatch: requested ${requestedVersion || 'latest'}, received ${resolvedVersion || 'none'}.`)
  }

  const asset = Array.isArray(release.assets)
    ? release.assets.find((item) => item?.name === 'yt-dlp.exe')
    : null
  const assetUrl = String(asset?.browser_download_url ?? '').trim()
  const expectedUrlMarker = `/yt-dlp/yt-dlp/releases/download/${resolvedVersion}/yt-dlp.exe`
  const size = Number(asset?.size)
  const sha256 = normalizeDigest(asset?.digest)
  if (!assetUrl.startsWith('https://github.com/') || !assetUrl.includes(expectedUrlMarker)) {
    throw new Error(`yt-dlp.exe did not resolve to a concrete official release URL: ${assetUrl || 'missing'}.`)
  }
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new Error('The official yt-dlp.exe asset did not provide a valid size.')
  }
  if (!sha256) {
    throw new Error('The official yt-dlp.exe asset did not provide a valid SHA-256 digest.')
  }

  return {
    schemaVersion: 1,
    version: resolvedVersion,
    assetName: 'yt-dlp.exe',
    assetUrl,
    size,
    sha256,
  }
}

export async function verifyOfficialYtDlpManifest(manifest, { fetchImpl = fetch } = {}) {
  const official = await resolveYtDlpWindowsRelease({
    version: String(manifest?.version ?? ''),
    fetchImpl,
  })
  for (const key of ['schemaVersion', 'version', 'assetName', 'assetUrl', 'size', 'sha256']) {
    if (manifest?.[key] !== official[key]) {
      throw new Error(`Runtime manifest does not match the official yt-dlp Windows asset (${key}).`)
    }
  }
  return official
}

export function verifyYtDlpFile(filePath, manifest) {
  const stats = requireRegularFile(filePath, 'yt-dlp.exe')
  if (stats.size !== manifest.size) {
    throw new Error(`yt-dlp.exe size validation failed: expected ${manifest.size}, received ${stats.size}.`)
  }
  const sha256 = sha256File(filePath)
  if (sha256 !== manifest.sha256) {
    throw new Error(`yt-dlp.exe SHA-256 validation failed: expected ${manifest.sha256}, received ${sha256}.`)
  }
  return { size: stats.size, sha256 }
}

export function verifyWindowsRuntimeDirectory(runtimeDir, manifest, { requireRecordedFingerprints = true } = {}) {
  if (requireRecordedFingerprints && (!manifest.tools || typeof manifest.tools !== 'object')) {
    throw new Error('Runtime manifest does not contain recorded tool fingerprints.')
  }
  const tools = {}
  for (const fileName of REQUIRED_WINDOWS_TOOLS) {
    const filePath = join(runtimeDir, fileName)
    const stats = requireRegularFile(filePath, fileName)
    tools[fileName] = {
      path: filePath,
      size: stats.size,
      sha256: sha256File(filePath),
    }
    const expected = manifest.tools?.[fileName]
    if (requireRecordedFingerprints && !expected) {
      throw new Error(`Runtime manifest does not include ${fileName}.`)
    }
    if (expected) {
      if (stats.size !== expected.size) {
        throw new Error(`${fileName} size validation failed: expected ${expected.size}, received ${stats.size}.`)
      }
      if (tools[fileName].sha256 !== expected.sha256) {
        throw new Error(`${fileName} SHA-256 validation failed: expected ${expected.sha256}, received ${tools[fileName].sha256}.`)
      }
    }
  }

  const ytDlp = verifyYtDlpFile(join(runtimeDir, 'yt-dlp.exe'), manifest)
  return { tools, ytDlp }
}

export function recordWindowsRuntimeManifest(runtimeDir, manifest) {
  const verification = verifyWindowsRuntimeDirectory(runtimeDir, manifest, { requireRecordedFingerprints: false })
  return {
    ...manifest,
    tools: Object.fromEntries(
      Object.entries(verification.tools).map(([fileName, details]) => [fileName, {
        size: details.size,
        sha256: details.sha256,
      }]),
    ),
  }
}

function parseArguments(argv) {
  const [command, ...tokens] = argv
  const options = {}
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`)
    const key = token.slice(2)
    const value = tokens[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`)
    index += 1
    options[key] = value
  }
  return { command, options }
}

function readManifest(manifestPath) {
  return JSON.parse(readFileSync(manifestPath, 'utf8'))
}

async function runCli() {
  const { command, options } = parseArguments(process.argv.slice(2))
  if (command === 'resolve') {
    if (!options.output) throw new Error('resolve requires --output.')
    const manifest = await resolveYtDlpWindowsRelease({ version: options.version ?? '' })
    writeFileSync(options.output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    process.stdout.write(`${manifest.version} ${manifest.sha256} ${manifest.size}\n`)
    return
  }
  if (command === 'verify-file') {
    if (!options.manifest || !options.file) throw new Error('verify-file requires --manifest and --file.')
    const result = verifyYtDlpFile(options.file, readManifest(options.manifest))
    process.stdout.write(`${result.sha256} ${result.size} ${options.file}\n`)
    return
  }
  if (command === 'verify-official') {
    if (!options.manifest) throw new Error('verify-official requires --manifest.')
    const result = await verifyOfficialYtDlpManifest(readManifest(options.manifest))
    process.stdout.write(`Verified official yt-dlp Windows manifest: ${result.version}\n`)
    return
  }
  if (command === 'verify-runtime') {
    if (!options.manifest || !options.runtime-dir) throw new Error('verify-runtime requires --manifest and --runtime-dir.')
    verifyWindowsRuntimeDirectory(options.runtime-dir, readManifest(options.manifest))
    process.stdout.write(`Verified Windows runtime directory: ${options.runtime-dir}\n`)
    return
  }
  if (command === 'record-runtime') {
    if (!options.manifest || !options.runtime-dir) throw new Error('record-runtime requires --manifest and --runtime-dir.')
    const manifest = recordWindowsRuntimeManifest(options.runtime-dir, readManifest(options.manifest))
    const temporaryPath = `${options.manifest}.tmp-${process.pid}`
    try {
      writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
      renameSync(temporaryPath, options.manifest)
    } finally {
      rmSync(temporaryPath, { force: true })
    }
    process.stdout.write(`Recorded Windows runtime fingerprints: ${options.manifest}\n`)
    return
  }
  throw new Error(`Unknown command: ${command ?? 'none'}`)
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
