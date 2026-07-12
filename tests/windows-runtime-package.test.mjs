import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  recordWindowsRuntimeManifest,
  resolveYtDlpWindowsRelease,
  verifyOfficialYtDlpManifest,
  verifyWindowsRuntimeDirectory,
  verifyYtDlpFile,
} from '../scripts/windows-runtime-verifier.mjs'

const ytDlpPayload = Buffer.from('complete yt-dlp fixture\n')
const runtimeVerifierPath = fileURLToPath(new URL('../scripts/windows-runtime-verifier.mjs', import.meta.url))
const powershellVerifierPath = fileURLToPath(new URL('../scripts/verify-windows-package.ps1', import.meta.url))

function sha256(payload) {
  return createHash('sha256').update(payload).digest('hex')
}

function createSandbox() {
  const rootDir = mkdtempSync(join(tmpdir(), 'media-dock-win-package-'))
  const runtimeDir = join(rootDir, 'resources', 'tools', 'bin')
  mkdirSync(runtimeDir, { recursive: true })
  const manifest = {
    schemaVersion: 1,
    version: '2026.07.04',
    assetName: 'yt-dlp.exe',
    assetUrl: 'https://github.com/yt-dlp/yt-dlp/releases/download/2026.07.04/yt-dlp.exe',
    size: ytDlpPayload.byteLength,
    sha256: sha256(ytDlpPayload),
  }
  return {
    rootDir,
    runtimeDir,
    manifest,
    cleanup: () => rmSync(rootDir, { recursive: true, force: true }),
  }
}

function writeRuntimeFixtures(runtimeDir, ytDlp = ytDlpPayload) {
  writeFileSync(join(runtimeDir, 'yt-dlp.exe'), ytDlp)
  writeFileSync(join(runtimeDir, 'deno.exe'), 'deno fixture')
  writeFileSync(join(runtimeDir, 'ffmpeg.exe'), 'ffmpeg fixture')
  writeFileSync(join(runtimeDir, 'ffprobe.exe'), 'ffprobe fixture')
}

test('resolves latest metadata to a concrete official yt-dlp asset', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      tag_name: '2026.07.04',
      assets: [{
        name: 'yt-dlp.exe',
        browser_download_url: 'https://github.com/yt-dlp/yt-dlp/releases/download/2026.07.04/yt-dlp.exe',
        size: 18_226_085,
        digest: `sha256:${'a'.repeat(64)}`,
      }],
    }),
  })
  const metadata = await resolveYtDlpWindowsRelease({
    fetchImpl,
  })

  assert.deepEqual(metadata, {
    schemaVersion: 1,
    version: '2026.07.04',
    assetName: 'yt-dlp.exe',
    assetUrl: 'https://github.com/yt-dlp/yt-dlp/releases/download/2026.07.04/yt-dlp.exe',
    size: 18_226_085,
    sha256: 'a'.repeat(64),
  })
  assert.doesNotMatch(metadata.assetUrl, /\/latest\//)

  await verifyOfficialYtDlpManifest(metadata, { fetchImpl })
  await assert.rejects(
    verifyOfficialYtDlpManifest({ ...metadata, sha256: 'b'.repeat(64) }, { fetchImpl }),
    /does not match the official/i,
  )
})

test('rejects a truncated yt-dlp fixture by official size and hash', () => {
  const sandbox = createSandbox()
  try {
    const filePath = join(sandbox.runtimeDir, 'yt-dlp.exe')
    writeFileSync(filePath, ytDlpPayload.subarray(0, 7))

    assert.throws(() => verifyYtDlpFile(filePath, sandbox.manifest), /size validation failed/i)
  } finally {
    sandbox.cleanup()
  }
})

test('verifies all packaged runtime files and the embedded yt-dlp hash', () => {
  const sandbox = createSandbox()
  try {
    writeRuntimeFixtures(sandbox.runtimeDir)

    const recordedManifest = recordWindowsRuntimeManifest(sandbox.runtimeDir, sandbox.manifest)
    const result = verifyWindowsRuntimeDirectory(sandbox.runtimeDir, recordedManifest)

    assert.equal(result.ytDlp.sha256, sandbox.manifest.sha256)
    assert.deepEqual(Object.keys(result.tools).sort(), ['deno.exe', 'ffmpeg.exe', 'ffprobe.exe', 'yt-dlp.exe'])
    assert.deepEqual(Object.keys(recordedManifest.tools).sort(), ['deno.exe', 'ffmpeg.exe', 'ffprobe.exe', 'yt-dlp.exe'])

    writeFileSync(join(sandbox.runtimeDir, 'ffmpeg.exe'), 'ffmpeg changed')
    assert.throws(
      () => verifyWindowsRuntimeDirectory(sandbox.runtimeDir, recordedManifest),
      /ffmpeg\.exe SHA-256 validation failed/i,
    )

    writeFileSync(join(sandbox.runtimeDir, 'ffmpeg.exe'), 'ffmpeg fixture')
    rmSync(join(sandbox.runtimeDir, 'deno.exe'))
    assert.throws(
      () => verifyWindowsRuntimeDirectory(sandbox.runtimeDir, recordedManifest),
      /deno\.exe is missing/i,
    )
  } finally {
    sandbox.cleanup()
  }
})

test('records and verifies runtime directories through the production CLI', () => {
  const sandbox = createSandbox()
  const manifestPath = join(sandbox.rootDir, 'YT-DLP-WINDOWS.json')
  try {
    writeRuntimeFixtures(sandbox.runtimeDir)
    writeFileSync(manifestPath, `${JSON.stringify(sandbox.manifest, null, 2)}\n`)

    const recordResult = spawnSync(process.execPath, [
      runtimeVerifierPath,
      'record-runtime',
      '--manifest', manifestPath,
      '--runtime-dir', sandbox.runtimeDir,
    ], { encoding: 'utf8' })
    assert.equal(recordResult.status, 0, `${recordResult.stdout}${recordResult.stderr}`)
    assert.equal(Object.keys(JSON.parse(readFileSync(manifestPath, 'utf8')).tools).length, 4)

    const verifyResult = spawnSync(process.execPath, [
      runtimeVerifierPath,
      'verify-runtime',
      '--manifest', manifestPath,
      '--runtime-dir', sandbox.runtimeDir,
    ], { encoding: 'utf8' })
    assert.equal(verifyResult.status, 0, `${verifyResult.stdout}${verifyResult.stderr}`)
  } finally {
    sandbox.cleanup()
  }
})

test('rejects a truncated final runtime after recording valid staging fingerprints', () => {
  const sandbox = createSandbox()
  try {
    const stagedRuntimeDir = join(sandbox.rootDir, 'staged-runtime')
    mkdirSync(stagedRuntimeDir, { recursive: true })
    writeRuntimeFixtures(stagedRuntimeDir)
    const recordedManifest = recordWindowsRuntimeManifest(stagedRuntimeDir, sandbox.manifest)
    writeRuntimeFixtures(sandbox.runtimeDir, ytDlpPayload.subarray(0, 7))

    assert.throws(
      () => verifyWindowsRuntimeDirectory(sandbox.runtimeDir, recordedManifest),
      /yt-dlp\.exe size validation failed/i,
    )

    writeFileSync(join(sandbox.runtimeDir, 'yt-dlp.exe'), ytDlpPayload)
    verifyWindowsRuntimeDirectory(sandbox.runtimeDir, recordedManifest)
  } finally {
    sandbox.cleanup()
  }
})

test('production PowerShell gate removes stale checksums before a failed verification', {
  skip: process.platform !== 'win32' ? 'requires Windows PowerShell' : false,
}, () => {
  const sandbox = createSandbox()
  const sourceDir = join(sandbox.rootDir, 'zip-source')
  const packagePath = join(sandbox.rootDir, 'broken package.zip')
  const manifestPath = join(sandbox.rootDir, 'YT-DLP-WINDOWS.json')
  const checksumsPath = join(sandbox.rootDir, 'SHA256SUMS.txt')
  try {
    mkdirSync(sourceDir)
    writeFileSync(join(sourceDir, 'placeholder.txt'), 'not a runtime package')
    const escapedSource = sourceDir.replaceAll("'", "''")
    const escapedPackage = packagePath.replaceAll("'", "''")
    const archiveResult = spawnSync('powershell.exe', [
      '-NoProfile',
      '-Command',
      `Compress-Archive -LiteralPath '${escapedSource}' -DestinationPath '${escapedPackage}' -Force`,
    ], { encoding: 'utf8' })
    assert.equal(archiveResult.status, 0, `${archiveResult.stdout}${archiveResult.stderr}`)

    writeFileSync(manifestPath, `${JSON.stringify({
      schemaVersion: 1,
      version: '2026.07.04',
      assetName: 'yt-dlp.exe',
      assetUrl: 'https://github.com/yt-dlp/yt-dlp/releases/download/2026.07.04/yt-dlp.exe',
      size: 18_226_085,
      sha256: '52fe3c26dcf71fbdc85b528589020bb0b8e383155cfa81b64dd447bbe35e24b8',
      tools: {},
    }, null, 2)}\n`)
    writeFileSync(checksumsPath, 'stale checksum\n')

    const result = spawnSync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', powershellVerifierPath,
      '-PackagePath', packagePath,
      '-YtDlpManifestPath', manifestPath,
      '-ChecksumPath', checksumsPath,
      '-WriteChecksum',
    ], { encoding: 'utf8', timeout: 60000 })

    assert.notEqual(result.status, 0, 'broken package should fail Windows verification')
    assert.equal(existsSync(checksumsPath), false)
  } finally {
    sandbox.cleanup()
  }
})
