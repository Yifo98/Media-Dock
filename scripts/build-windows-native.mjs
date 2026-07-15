import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import extractZip from 'extract-zip'
import {
  recordWindowsRuntimeManifest,
  resolveYtDlpWindowsRelease,
  verifyYtDlpFile,
} from './windows-runtime-verifier.mjs'

if (process.platform !== 'win32') {
  throw new Error('Windows packages must be built on a native Windows runner or Windows virtual machine.')
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDirectory, '..')
const packageJson = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'))
const appVersion = packageJson.version
const npmCliPath = String(process.env.npm_execpath ?? '').trim()
const electronBuilderCliPath = path.join(projectRoot, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js')
const releaseRoot = path.join(projectRoot, 'release')
const versionDirectory = path.join(releaseRoot, appVersion)
const toolsDirectory = path.join(projectRoot, 'tools')
const toolsBinDirectory = path.join(toolsDirectory, 'bin')
const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'media-dock-windows-build-'))
const ytDlpVersion = String(process.env.YTDLP_VERSION ?? '').trim()
const denoVersion = String(process.env.DENO_VERSION ?? '2.9.2').trim()
const denoUrl = process.env.DENO_URL
  ?? `https://github.com/denoland/deno/releases/download/v${denoVersion}/deno-x86_64-pc-windows-msvc.zip`
const ffmpegUrl = String(process.env.FFMPEG_URL ?? '').trim()
  || 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl-shared.zip'

if (process.env.MEDIA_DOCK_SIGNED_RELEASE === '1' && ffmpegUrl.includes('/latest/')) {
  throw new Error('A signed release requires FFMPEG_URL to identify an immutable versioned FFmpeg asset.')
}
if (!npmCliPath) {
  throw new Error('Run the native Windows build through `npm run dist:win` so the npm CLI can be resolved safely.')
}

async function run(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: process.env,
      stdio: 'inherit',
      ...options,
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${command} exited with code ${code ?? 'unknown'}.`))
      }
    })
  })
}

async function download(url, destination) {
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15 * 60_000) })
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status}): ${url}`)
  }
  await mkdir(path.dirname(destination), { recursive: true })
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(destination, { flags: 'wx' }))
  } catch (error) {
    await rm(destination, { force: true })
    throw error
  }
}

async function findFile(root, fileName) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const candidate = path.join(root, entry.name)
    if (entry.isDirectory()) {
      const nested = await findFile(candidate, fileName)
      if (nested) return nested
    } else if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()) {
      return candidate
    }
  }
  return null
}

async function copyRuntimeDirectory(sourceDirectory) {
  const entries = await readdir(sourceDirectory, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isFile() || !/\.(?:exe|dll)$/iu.test(entry.name)) continue
    await copyFile(path.join(sourceDirectory, entry.name), path.join(toolsBinDirectory, entry.name))
  }
}

async function prepareRuntimes() {
  await rm(toolsDirectory, { recursive: true, force: true })
  await mkdir(toolsBinDirectory, { recursive: true })

  const ytDlpManifest = await resolveYtDlpWindowsRelease({ version: ytDlpVersion })
  const ytDlpPath = path.join(toolsBinDirectory, 'yt-dlp.exe')
  await download(ytDlpManifest.assetUrl, ytDlpPath)
  verifyYtDlpFile(ytDlpPath, ytDlpManifest)

  const denoArchive = path.join(temporaryDirectory, 'deno.zip')
  const denoExtracted = path.join(temporaryDirectory, 'deno')
  await download(denoUrl, denoArchive)
  await extractZip(denoArchive, { dir: denoExtracted })
  const denoExecutable = await findFile(denoExtracted, 'deno.exe')
  if (!denoExecutable) throw new Error('Deno archive did not contain deno.exe.')
  await copyFile(denoExecutable, path.join(toolsBinDirectory, 'deno.exe'))

  const ffmpegArchive = path.join(temporaryDirectory, 'ffmpeg.zip')
  const ffmpegExtracted = path.join(temporaryDirectory, 'ffmpeg')
  await download(ffmpegUrl, ffmpegArchive)
  await extractZip(ffmpegArchive, { dir: ffmpegExtracted })
  const ffmpegExecutable = await findFile(ffmpegExtracted, 'ffmpeg.exe')
  const ffprobeExecutable = await findFile(ffmpegExtracted, 'ffprobe.exe')
  if (!ffmpegExecutable || !ffprobeExecutable) {
    throw new Error('FFmpeg archive did not contain ffmpeg.exe and ffprobe.exe.')
  }
  if (path.dirname(ffmpegExecutable) !== path.dirname(ffprobeExecutable)) {
    throw new Error('FFmpeg and FFprobe were not found in the same runtime directory.')
  }
  await copyRuntimeDirectory(path.dirname(ffmpegExecutable))

  return {
    ...recordWindowsRuntimeManifest(toolsBinDirectory, ytDlpManifest),
    sources: {
      deno: { version: denoVersion, url: denoUrl },
      ffmpeg: { url: ffmpegUrl },
    },
  }
}

async function findSingleArtifact() {
  const artifacts = (await readdir(releaseRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.startsWith(`Media-Dock-${appVersion}`) && name.endsWith('-x64-win.zip'))
  if (artifacts.length !== 1) {
    throw new Error(`Expected exactly one electron-builder Windows ZIP, found ${artifacts.length}.`)
  }
  return path.join(releaseRoot, artifacts[0])
}

try {
  await mkdir(versionDirectory, { recursive: true })
  for (const entry of await readdir(versionDirectory, { withFileTypes: true })) {
    if (entry.isFile() && /(?:-win\.zip|WINDOWS\.json|WINDOWS-SIGNATURES\.json|SHA256SUMS\.txt)$/iu.test(entry.name)) {
      await rm(path.join(versionDirectory, entry.name), { force: true })
    }
  }

  const runtimeManifest = await prepareRuntimes()
  const runtimeManifestPath = path.join(versionDirectory, 'WINDOWS-RUNTIMES.json')
  await writeFile(runtimeManifestPath, `${JSON.stringify(runtimeManifest, null, 2)}\n`, 'utf8')

  await run(process.execPath, [npmCliPath, 'run', 'build'])
  await run(process.execPath, [
    electronBuilderCliPath,
    '--config', 'electron-builder.config.cjs',
    '--win', 'zip',
    '--x64',
    '--publish', 'never',
  ])

  const artifact = await findSingleArtifact()
  const finalArtifact = path.join(versionDirectory, path.basename(artifact))
  await rm(finalArtifact, { force: true })
  await copyFile(artifact, finalArtifact)
  await rm(artifact, { force: true })
  const releaseNotesSource = path.join(projectRoot, 'docs', 'release', `${appVersion}.md`)
  try {
    await copyFile(releaseNotesSource, path.join(versionDirectory, 'RELEASE-NOTES.md'))
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  process.stdout.write(`Windows package candidate: ${finalArtifact}\n`)
  process.stdout.write(`Windows runtime manifest: ${runtimeManifestPath}\n`)
} finally {
  await rm(toolsDirectory, { recursive: true, force: true })
  await rm(temporaryDirectory, { recursive: true, force: true })
}
