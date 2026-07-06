import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { chmodSync, copyFileSync, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, dirname, extname, isAbsolute, join, parse, relative } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { TextDecoder } from 'node:util'

type DownloadMode = 'video' | 'audio'
type AudioFormat = 'mp3' | 'm4a' | 'wav' | 'opus'
type AudioQuality = 'best' | '320k' | '192k' | '128k'
type VideoPreset = 'best' | '2160p' | '1080p' | '720p' | '480p'
type DownloadStatus = 'idle' | 'running' | 'success' | 'error' | 'cancelled'
type MediaToolAction = 'extractAudio' | 'extractSubtitles'
type MediaAudioExportFormat = 'mp3' | 'wav' | 'flac' | 'm4a'
type MediaSubtitleExportFormat = 'srt' | 'ass' | 'vtt'
type SubtitleCleanupMode = 'single' | 'batch'
type MediaMergeMode = 'selection' | 'folder'
type MediaMergeOutputFormat = 'mp4' | 'mkv' | 'mov'
type RuntimeToolInstallTarget = 'deno' | 'yt-dlp'

type DownloadRequest = {
  urls: string[]
  outputDir: string
  mode: DownloadMode
  audioFormat: AudioFormat
  audioQuality: AudioQuality
  videoPreset: VideoPreset
  extraArgs: string
  cookieFile: string | null
  urlCookieFiles?: Array<string | null>
  concurrency: number
}

type CookieFileInfo = {
  label: string
  path: string
  domains: string[]
  cookieCount: number
  expiredCookieCount: number
  expiredCookieNames: string[]
  expiringSoonCookieCount: number
  expiringSoonCookieNames: string[]
}

type CookieZipImportResult = {
  importedDir: string
  importedFiles: string[]
  cookieFiles: CookieFileInfo[]
}

type SelfCheckItem = {
  key: string
  label: string
  ok: boolean
  detail: string
}

type MediaStreamInfo = {
  index: number
  codecType: string
  codecName: string
  language: string
  title: string
}

type MediaInspection = {
  inputPath: string
  fileName: string
  duration: number | null
  formatName: string
  streams: MediaStreamInfo[]
}

type MediaToolRequest = {
  action: MediaToolAction
  inputPath: string
  outputDir: string
  audioFormat: MediaAudioExportFormat
  subtitleFormat: MediaSubtitleExportFormat
  subtitleStreamIndexes: number[]
}

type MediaMergeRequest = {
  mode: MediaMergeMode
  inputPaths: string[]
  inputDir: string | null
  outputDir: string
  outputFormat: MediaMergeOutputFormat
  outputName: string | null
}

type MediaMergePair = {
  videoPath: string
  audioPath: string
  outputPath: string
  durationDiff: number | null
  durationSeconds: number | null
  estimatedSizeBytes: number | null
  videoAudioTracks: number
  audioTracks: number
  matchReason: string
}

type MediaMergeSkippedItem = {
  path: string
  reason: string
}

type MediaMergePreviewResult = {
  inputCount: number
  videoCount: number
  audioCount: number
  pairCount: number
  unmatchedVideoCount: number
  unmatchedAudioCount: number
  estimatedSizeBytes: number | null
  estimatedDurationSeconds: number | null
  longestDurationSeconds: number | null
  pairs: MediaMergePair[]
  skipped: MediaMergeSkippedItem[]
}

type UpdateCheckResult = {
  currentVersion: string
  latestVersion: string | null
  updateAvailable: boolean
  releaseName: string | null
  releaseUrl: string | null
  assetName: string | null
  assetUrl: string | null
}

type UpdateDownloadResult = {
  filePath: string
  assetName: string
  releaseUrl: string
}

type RuntimeToolInstallResult = {
  tool: RuntimeToolInstallTarget
  path: string
  version: string
}

type RuntimeToolUpdateInfo = {
  tool: 'yt-dlp' | 'deno'
  currentVersion: string | null
  latestVersion: string | null
  updateAvailable: boolean
  releaseUrl: string | null
  detail: string | null
}

type RuntimeToolUpdateCheckResult = {
  ytDlp: RuntimeToolUpdateInfo
  deno: RuntimeToolUpdateInfo
}

type RuntimeToolProgressUpdate = {
  tool: RuntimeToolInstallTarget
  stage: 'checking' | 'downloading' | 'extracting' | 'installing' | 'complete' | 'error'
  message: string
  percent: number | null
}

type BilibiliApiEpisode = {
  id?: number | string
  ep_id?: number | string
  title?: string
  long_title?: string
  badge?: string
  status?: number | string
  duration?: number
  link?: string
  share_url?: string
}

type BilibiliApiSection = {
  title?: string
  episodes?: BilibiliApiEpisode[]
}

type BilibiliApiSeasonResult = {
  title?: string
  season_title?: string
  season_id?: number | string
  media_id?: number | string
  episodes?: BilibiliApiEpisode[]
  section?: BilibiliApiSection[]
}

type BilibiliCheeseEpisode = {
  id?: number | string
  index?: number | string
  title?: string
  subtitle?: string
  label?: string
  status?: number | string
  ep_status?: number | string
  duration?: number
  playable?: boolean
  episode_can_view?: boolean
}

type BilibiliCheeseSeasonData = {
  title?: string
  season_id?: number | string
  ep_count?: number
  episodes?: BilibiliCheeseEpisode[]
}

type BilibiliSeasonResolveResult = {
  sourceUrl: string
  title: string
  seasonId: string
  mediaId: string | null
  groups: BilibiliEpisodeGroup[]
}

type BilibiliEpisodeGroup = {
  id: string
  title: string
  episodes: BilibiliEpisodeItem[]
}

type BilibiliEpisodeItem = {
  id: string
  title: string
  subtitle: string
  badge: string
  link: string
  status: string
  duration: number | null
  defaultSelected: boolean
}

type YtDlpFlatEntry = {
  id?: string
  title?: string
  url?: string
  webpage_url?: string
  duration?: number
}

type YtDlpFlatPlaylist = {
  id?: string
  title?: string
  webpage_url?: string
  extractor?: string
  entries?: YtDlpFlatEntry[]
}

type SubtitleCleanupConfig = {
  baseUrl: string
  apiKey: string
  model: string
  prompt: string
  thinkingMode: 'default' | 'disabled'
  customPresets: SubtitleCleanupCustomPreset[]
  providerProfiles: Record<string, SubtitleCleanupProviderProfile>
}

type SubtitleCleanupCustomPreset = {
  id: string
  label: string
  url: string
}

type SubtitleCleanupProviderProfile = {
  baseUrl: string
  apiKey: string
  model: string
}

type SubtitleCleanupRunRequest = SubtitleCleanupConfig & {
  mode: SubtitleCleanupMode
  inputPath: string | null
  inputDir: string | null
  outputDir: string
  skipExistingOutputs: boolean
}

type QueueSnapshot = {
  total: number
  pending: number
  running: number
  completed: number
  failed: number
  cancelled: number
  concurrency: number
}

type JobSnapshot = {
  jobId: string
  url: string
  title: string
  status: DownloadStatus
  percent: number | null
  downloaded: string
  total: string
  speed: string
  eta: string
  outputPath?: string
  command?: string
  message?: string
  exitCode?: number | null
  index: number
  totalJobs: number
}

type JobContext = {
  request: DownloadRequest
  jobId: string
  url: string
  index: number
  totalJobs: number
  snapshot: JobSnapshot
  command: string
  process: ChildProcessWithoutNullStreams
}

const isWindows = process.platform === 'win32'
const APP_DISPLAY_NAME = 'Media Dock'
const windowsHomeDir = process.env.USERPROFILE ?? homedir()
const windowsLocalAppDataDir = process.env.LOCALAPPDATA ?? join(windowsHomeDir, 'AppData', 'Local')
const windowsProgramFilesDir = process.env.ProgramFiles ?? 'C:\\Program Files'
const windowsProgramFilesX86Dir = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
const envRoot = process.env.YTDLP_ENV_ROOT
  ?? (
    isWindows
      ? join(windowsHomeDir, '.conda', 'envs', 'yt-dlp')
      : join(homedir(), '.conda', 'envs', 'yt-dlp')
  )
const denoCandidates = [
  process.env.DENO_BIN,
  ...(isWindows
    ? [
        join(windowsHomeDir, '.deno', 'bin', 'deno.exe'),
        join(windowsLocalAppDataDir, 'Microsoft', 'WinGet', 'Packages', 'DenoLand.Deno_Microsoft.Winget.Source_8wekyb3d8bbwe', 'deno.exe'),
        join(windowsProgramFilesDir, 'Deno', 'bin', 'deno.exe'),
      ]
    : [
        join(homedir(), '.deno', 'bin', 'deno'),
        '/opt/homebrew/bin/deno',
        '/usr/local/bin/deno',
      ]),
].filter((value): value is string => Boolean(value))

const __dirname = dirname(fileURLToPath(import.meta.url))
const rendererDist = join(__dirname, '..', 'dist')
const preloadPath = join(__dirname, '..', 'electron', 'preload.cjs')

let mainWindow: BrowserWindow | null = null
let mediaToolsWindow: BrowserWindow | null = null
let activeBatchRequest: DownloadRequest | null = null
let pendingJobs: Array<{ jobId: string; url: string; index: number; totalJobs: number }> = []
const activeJobs = new Map<string, JobContext>()
let queueSnapshot: QueueSnapshot = {
  total: 0,
  pending: 0,
  running: 0,
  completed: 0,
  failed: 0,
  cancelled: 0,
  concurrency: 1,
}
let batchCancelled = false
let downloadSchedulerQueued = false
let activeMediaProcess: ChildProcessWithoutNullStreams | null = null
let mediaCancelled = false
let activeSubtitleCleanupAbort: AbortController | null = null
let subtitleCleanupCancelled = false

const DEFAULT_SUBTITLE_CLEANUP_PROMPT = [
  '请帮我优化以下这份视频字幕文档。这份文档是通过 OCR 自动生成的，包含大量冗余和识别错误，同时含有时间戳和序号，需要请按以下规则进行清理和修复文字，最终形成一整份纯文本。',
  '',
  '1. 叙事完整性（最高优先级）',
  '严禁摘要或精简内容。只要是博主的口播内容，必须 100% 保留。特别注意：文中的具体案例是视频的核心，绝对不能删除或概括。',
  '2. 去除 UI 噪音',
  '去除时间戳、序号、样式标签，或误识别到的明显逻辑不通顺、突然冒出来与上下文不搭的系统 UI 词汇。任何疑似博主口中说出的话，只要出现在句子逻辑中，一律视为口播保留。',
  '3. 术语保护',
  '请务必保留 Claude、Anthropic、Skills、MCP、CODE、NotebookLM、Notion、Obsidain、Slack 等所有英文专业术语，不要翻译成中文或修改。',
  '4. 纠错原则',
  '保留原有叙述顺序，修正明显的 OCR 错别字和断句问题，让文本成为自然可读的纯文本。',
  '5. 输出格式',
  '最终输出只能包含整理后的正文，不要附加标题、解释、摘要、项目符号、Markdown、时间戳或额外说明。',
].join('\n')

const GITHUB_OWNER = 'Yifo98'
const GITHUB_REPO = 'Media-Dock'
const GITHUB_LATEST_RELEASE_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`
const YT_DLP_LATEST_RELEASE_API = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest'
const DENO_LATEST_RELEASE_API = 'https://api.github.com/repos/denoland/deno/releases/latest'

function ensureDirectory(dirPath: string) {
  if (existsSync(dirPath)) {
    if (!statSync(dirPath).isDirectory()) {
      throw new Error(`Expected a directory but found a file at: ${dirPath}`)
    }
    return dirPath
  }

  mkdirSync(dirPath, { recursive: true })
  return dirPath
}

function getDevRootDir() {
  return join(__dirname, '..')
}

function getBundledToolsDir() {
  return join(process.resourcesPath, 'tools')
}

function getPortableRootDir() {
  const explicitPortableRoot = process.env.MEDIA_DOCK_PORTABLE_ROOT?.trim()
  if (app.isPackaged && explicitPortableRoot) {
    return explicitPortableRoot
  }

  if (app.isPackaged && process.platform === 'darwin') {
    const appBundleDir = dirname(dirname(dirname(process.execPath)))
    return dirname(appBundleDir)
  }

  return dirname(process.execPath)
}

function getPortableDataRootDir() {
  const rootDir = app.isPackaged
    ? getPortableRootDir()
    : getDevRootDir()

  return ensureDirectory(join(rootDir, `${APP_DISPLAY_NAME} Data`))
}

function initializePortableUserDataPath() {
  app.setPath('userData', ensureDirectory(join(getPortableDataRootDir(), 'app-cache')))
}

function uniquePaths(paths: Array<string | undefined>) {
  return [...new Set(paths.filter((value): value is string => Boolean(value)))]
}

function getExecutableName(name: string) {
  return isWindows ? `${name}.exe` : name
}

function getManagedToolBinDirs() {
  const bundledToolsDir = getBundledToolsDir()

  return uniquePaths([
    join(getRuntimeToolsInstallRoot(), 'bin'),
    getRuntimeToolsInstallRoot(),
    join(bundledToolsDir, 'bin'),
    bundledToolsDir,
    join(getPortableRootDir(), 'tools', 'bin'),
    join(getPortableRootDir(), 'tools'),
    join(getDevRootDir(), 'tools', 'bin'),
    join(getDevRootDir(), 'tools'),
  ])
}

function getManagedToolLibDirs() {
  const bundledToolsDir = getBundledToolsDir()

  return uniquePaths([
    join(getRuntimeToolsInstallRoot(), 'lib'),
    join(bundledToolsDir, 'lib'),
    join(getPortableRootDir(), 'tools', 'lib'),
    join(getDevRootDir(), 'tools', 'lib'),
  ])
}

function getManagedToolsDirs() {
  return getManagedToolBinDirs()
}

function getFallbackToolDirs() {
  if (!shouldAllowSystemToolFallback()) {
    return []
  }

  return uniquePaths([
    process.env.YTDLP_TOOLS_DIR,
    join(envRoot, isWindows ? 'Scripts' : 'bin'),
    ...(isWindows ? [] : ['/opt/homebrew/bin', '/usr/local/bin']),
  ])
}

function findExecutableInDirectory(directory: string, name: string) {
  const candidatePath = join(directory, getExecutableName(name))
  return existsSync(candidatePath) ? candidatePath : null
}

function findExecutableInPath(name: string) {
  const pathEntries = (process.env.PATH ?? '').split(delimiter).filter(Boolean)

  for (const entry of uniquePaths(pathEntries)) {
    const candidatePath = findExecutableInDirectory(entry, name)
    if (candidatePath) {
      return candidatePath
    }
  }

  return null
}

function resolveExecutablePath(name: string) {
  const searchDirs = [
    ...getManagedToolsDirs(),
    ...getFallbackToolDirs(),
  ]

  for (const directory of searchDirs) {
    const candidatePath = findExecutableInDirectory(directory, name)
    if (candidatePath) {
      return candidatePath
    }
  }

  return shouldAllowSystemToolFallback() ? findExecutableInPath(name) : null
}

function isPathInside(parentDir: string, targetPath: string) {
  const nestedPath = relative(parentDir, targetPath)
  return nestedPath === '' || (!nestedPath.startsWith('..') && !isAbsolute(nestedPath))
}

function getToolsSource() {
  const ytDlpPath = resolveExecutablePath('yt-dlp')
  if (!ytDlpPath) {
    return 'external' as const
  }

  return getManagedToolsDirs().some((directory) => isPathInside(directory, ytDlpPath))
    ? 'bundled'
    : 'external'
}

function getEnvironmentLabel() {
  const ytDlpPath = resolveExecutablePath('yt-dlp')
  if (!ytDlpPath) {
    return app.isPackaged ? 'portable-missing' : 'system-path'
  }

  if (getManagedToolsDirs().some((directory) => isPathInside(directory, ytDlpPath))) {
    return 'portable-tools'
  }

  if (isPathInside(envRoot, ytDlpPath)) {
    return 'conda-env'
  }

  if (ytDlpPath.startsWith('/opt/homebrew')) {
    return 'homebrew'
  }

  return 'system-path'
}

function collectToolPathEntries() {
  const resolvedToolDirs = [
    getYtDlpPath(),
    getFfmpegPath(),
    getFfprobePath(),
  ]
    .filter((value) => isAbsolute(value))
    .map((value) => dirname(value))

  return uniquePaths([
    ...resolvedToolDirs,
    ...getManagedToolBinDirs(),
    ...getFallbackToolDirs(),
    ...(process.env.PATH ?? '').split(delimiter).filter(Boolean),
  ])
}

function buildToolPathEnv() {
  return collectToolPathEntries().join(delimiter)
}

function buildDyldLibraryPathEnv() {
  return uniquePaths([
    ...getManagedToolLibDirs(),
    process.env.DYLD_LIBRARY_PATH,
  ]).join(delimiter)
}

function createStreamDecoder() {
  const encoding = isWindows ? 'gb18030' : 'utf-8'

  try {
    const decoder = new TextDecoder(encoding, { fatal: false })
    return {
      write(chunk: Uint8Array) {
        return decoder.decode(chunk, { stream: true })
      },
      end() {
        return decoder.decode()
      },
    }
  } catch {
    const decoder = new TextDecoder('utf-8', { fatal: false })
    return {
      write(chunk: Uint8Array) {
        return decoder.decode(chunk, { stream: true })
      },
      end() {
        return decoder.decode()
      },
    }
  }
}

function getCookiesDir() {
  const targetDir = app.isPackaged
    ? join(getPortableDataRootDir(), 'cookies')
    : join(getDevRootDir(), 'cookies')

  return ensureDirectory(targetDir)
}

function getCookieImportTempRoot() {
  return ensureDirectory(join(getPortableDataRootDir(), 'app-cache', 'cookie-imports'))
}

function safeImportFolderName(value: string) {
  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)

  return cleaned || `media-dock-cookies-${Date.now()}`
}

function ensureUniqueImportDir(rootDir: string, preferredName: string) {
  const baseName = safeImportFolderName(preferredName)
  let candidate = join(rootDir, baseName)
  let suffix = 2

  while (existsSync(candidate)) {
    candidate = join(rootDir, `${baseName}-${suffix}`)
    suffix += 1
  }

  return ensureDirectory(candidate)
}

function getCookieImportRootScore(candidateDir: string) {
  let score = 0

  if (existsSync(join(candidateDir, 'manifest.json'))) score += 3
  if (existsSync(join(candidateDir, 'cookies.txt'))) score += 2
  if (existsSync(join(candidateDir, 'by-service')) && statSync(join(candidateDir, 'by-service')).isDirectory()) score += 2
  if (existsSync(join(candidateDir, 'by-domain')) && statSync(join(candidateDir, 'by-domain')).isDirectory()) score += 1

  return score
}

function findCookieExportRoot(extractRoot: string) {
  const candidates: Array<{ dir: string; score: number }> = []

  function visit(dirPath: string, depth: number) {
    if (depth > 4 || !existsSync(dirPath) || !statSync(dirPath).isDirectory()) {
      return
    }

    const score = getCookieImportRootScore(dirPath)
    if (score > 0) {
      candidates.push({ dir: dirPath, score })
    }

    for (const item of readdirSync(dirPath, { withFileTypes: true })) {
      if (item.isDirectory()) {
        visit(join(dirPath, item.name), depth + 1)
      }
    }
  }

  visit(extractRoot, 0)
  const best = candidates.sort((a, b) => b.score - a.score || a.dir.length - b.dir.length)[0]
  return best && best.score >= 2 ? best.dir : null
}

function normalizeCookieImportRelativePath(relativePath: string) {
  const normalized = relativePath.replace(/\\/g, '/')
  const lower = normalized.toLowerCase()

  if (!normalized || normalized.startsWith('../') || normalized.includes('/../') || isAbsolute(relativePath)) {
    return null
  }

  if (lower === 'cookies.txt') return 'cookies.txt'
  if (lower === 'manifest.json') return 'manifest.json'
  if (lower === 'readme.txt') return 'README.txt'

  if (/^by-service\/[^/]+\.cookies\.txt$/i.test(normalized)) {
    return normalized
  }

  if (/^by-domain\/[^/]+\.cookies\.txt$/i.test(normalized)) {
    return normalized
  }

  return null
}

function copyCookieImportFiles(sourceRoot: string, targetRoot: string) {
  const importedFiles: string[] = []

  function visit(dirPath: string) {
    for (const item of readdirSync(dirPath, { withFileTypes: true })) {
      const fullPath = join(dirPath, item.name)
      if (item.isDirectory()) {
        visit(fullPath)
        continue
      }

      if (!item.isFile()) {
        continue
      }

      const allowedRelativePath = normalizeCookieImportRelativePath(relative(sourceRoot, fullPath))
      if (!allowedRelativePath) {
        continue
      }

      const outputPath = join(targetRoot, allowedRelativePath)
      ensureDirectory(dirname(outputPath))
      copyFileSync(fullPath, outputPath)
      importedFiles.push(allowedRelativePath)
    }
  }

  visit(sourceRoot)
  importedFiles.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  return importedFiles
}

async function importCookieZip(zipPath: string): Promise<CookieZipImportResult> {
  if (!zipPath || !existsSync(zipPath)) {
    throw new Error(`Cookie export zip does not exist: ${zipPath}`)
  }

  const extractDir = join(getCookieImportTempRoot(), `extract-${Date.now()}`)

  try {
    await extractZip(zipPath, extractDir)
    const sourceRoot = findCookieExportRoot(extractDir)
    if (!sourceRoot) {
      throw new Error('The selected zip does not look like a Media Dock cookie export.')
    }

    const importedDir = ensureUniqueImportDir(getCookiesDir(), parse(zipPath).name)
    const importedFiles = copyCookieImportFiles(sourceRoot, importedDir)
    if (importedFiles.length === 0) {
      rmSync(importedDir, { recursive: true, force: true })
      throw new Error('No supported cookie files were found in the selected zip.')
    }

    return {
      importedDir,
      importedFiles,
      cookieFiles: listCookieFilesRecursive(getCookiesDir()),
    }
  } finally {
    rmSync(extractDir, { recursive: true, force: true })
  }
}

function getRuntimeToolsInstallRoot() {
  return app.isPackaged ? join(getPortableDataRootDir(), 'tools') : join(getDevRootDir(), 'tools')
}

function getRuntimeToolsInstallBinDir() {
  return join(getRuntimeToolsInstallRoot(), 'bin')
}

function getRuntimeToolsDownloadDir() {
  return join(getRuntimeToolsInstallRoot(), '_downloads')
}

function getUpdateDownloadDir() {
  return app.isPackaged ? join(getPortableDataRootDir(), 'updates') : join(getDevRootDir(), 'updates')
}

initializePortableUserDataPath()

function shouldAllowSystemToolFallback() {
  return !app.isPackaged || process.env.MEDIA_DOCK_ALLOW_SYSTEM_TOOLS === '1'
}

function getWindowIconPath() {
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(getDevRootDir(), 'build', 'icon.png')

  return existsSync(iconPath) ? iconPath : undefined
}

function applyDockIcon() {
  if (process.platform !== 'darwin') {
    return
  }

  const iconPath = getWindowIconPath()
  if (iconPath) {
    app.dock?.setIcon(iconPath)
  }
}

function shouldOpenDevTools() {
  return process.env.MEDIA_DOCK_OPEN_DEVTOOLS === '1'
}

function normalizeVersion(value: string) {
  return value.trim().replace(/^[^\d]*/, '').split(/[+-]/, 1)[0]
}

function compareVersions(left: string, right: string) {
  const leftParts = normalizeVersion(left).split('.').map((part) => Number.parseInt(part, 10) || 0)
  const rightParts = normalizeVersion(right).split('.').map((part) => Number.parseInt(part, 10) || 0)
  const length = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] ?? 0
    const rightValue = rightParts[index] ?? 0
    if (leftValue > rightValue) return 1
    if (leftValue < rightValue) return -1
  }

  return 0
}

function normalizePipVersion(value: string) {
  return normalizeVersion(value)
    .split('.')
    .map((part) => String(Number.parseInt(part, 10) || 0))
    .join('.')
}

function scalarToString(value: unknown) {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function isBilibiliHost(hostname: string) {
  return hostname === 'bilibili.com'
    || hostname.endsWith('.bilibili.com')
    || hostname === 'b23.tv'
    || hostname.endsWith('.b23.tv')
}

function isYoutubeHost(hostname: string) {
  return hostname === 'youtube.com'
    || hostname.endsWith('.youtube.com')
    || hostname === 'youtu.be'
    || hostname.endsWith('.youtu.be')
}

function parseMediaCollectionUrl(input: string) {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error('A source URL is required.')
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('Please paste a valid source URL.')
  }

  const hostname = parsed.hostname.toLowerCase()
  if (isBilibiliHost(hostname)) {
    return { sourceUrl: parsed.toString(), service: 'bilibili' as const, parsed }
  }
  if (isYoutubeHost(hostname)) {
    return { sourceUrl: parsed.toString(), service: 'youtube' as const, parsed }
  }

  throw new Error('Only Bilibili and YouTube collection URLs are supported.')
}

function parseBilibiliSeasonLookup(input: string) {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error('Bilibili URL is required.')
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('Please paste a valid Bilibili URL.')
  }

  if (!isBilibiliHost(parsed.hostname.toLowerCase())) {
    throw new Error('Only Bilibili season or episode URLs are supported.')
  }

  const urlText = parsed.toString()
  const epId = parsed.searchParams.get('ep_id')?.trim()
    || urlText.match(/\/ep(\d+)/i)?.[1]
    || urlText.match(/[?&]ep_id=(\d+)/i)?.[1]
  const seasonId = parsed.searchParams.get('season_id')?.trim()
    || urlText.match(/\/ss(\d+)/i)?.[1]
    || urlText.match(/[?&]season_id=(\d+)/i)?.[1]
  const mediaId = parsed.searchParams.get('media_id')?.trim()
    || urlText.match(/\/md(\d+)/i)?.[1]
    || urlText.match(/[?&]media_id=(\d+)/i)?.[1]

  if (epId) {
    return { sourceUrl: urlText, key: 'ep_id' as const, value: epId }
  }
  if (seasonId) {
    return { sourceUrl: urlText, key: 'season_id' as const, value: seasonId }
  }
  if (mediaId) {
    return { sourceUrl: urlText, key: 'media_id' as const, value: mediaId }
  }

  throw new Error('No ep, season, or media id was found in this Bilibili URL.')
}

function parseBilibiliCheeseLookup(input: string) {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error('Bilibili Cheese URL is required.')
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('Please paste a valid Bilibili Cheese URL.')
  }

  if (!isBilibiliHost(parsed.hostname.toLowerCase())) {
    throw new Error('Only Bilibili Cheese URLs are supported.')
  }

  const urlText = parsed.toString()
  const epId = parsed.searchParams.get('ep_id')?.trim()
    || urlText.match(/\/ep(\d+)/i)?.[1]
    || urlText.match(/[?&]ep_id=(\d+)/i)?.[1]
  const seasonId = parsed.searchParams.get('season_id')?.trim()
    || urlText.match(/\/ss(\d+)/i)?.[1]
    || urlText.match(/[?&]season_id=(\d+)/i)?.[1]

  if (epId) {
    return { sourceUrl: urlText, key: 'ep_id' as const, value: epId }
  }
  if (seasonId) {
    return { sourceUrl: urlText, key: 'season_id' as const, value: seasonId }
  }

  throw new Error('No ep or season id was found in this Bilibili Cheese URL.')
}

function episodeBadgeText(episode: BilibiliApiEpisode) {
  return scalarToString(episode.badge)
}

function isPreviewEpisode(episode: BilibiliApiEpisode) {
  const badge = episodeBadgeText(episode)
  const title = `${scalarToString(episode.title)} ${scalarToString(episode.long_title)}`
  return badge.includes('预告') || /预告|trailer|preview/i.test(title)
}

function episodeSortKey(episode: BilibiliApiEpisode, fallbackIndex: number) {
  const title = scalarToString(episode.title)
  const numericTitle = Number.parseFloat(title)
  return Number.isFinite(numericTitle) ? numericTitle : fallbackIndex
}

function scoreBilibiliEpisode(episode: BilibiliApiEpisode) {
  const badge = episodeBadgeText(episode)
  const status = Number(scalarToString(episode.status))
  let score = 0

  if (!isPreviewEpisode(episode)) score += 100
  if (status === 13) score += 30
  if (badge.includes('会员') || badge.includes('限免') || badge.includes('免费')) score += 16
  if (scalarToString(episode.link) || scalarToString(episode.share_url)) score += 8

  return score
}

function dedupeMainBilibiliEpisodes(episodes: BilibiliApiEpisode[]) {
  const byTitle = new Map<string, { episode: BilibiliApiEpisode; index: number }>()

  episodes.forEach((episode, index) => {
    const title = scalarToString(episode.title)
    const id = scalarToString(episode.id) || scalarToString(episode.ep_id)
    const key = title || id || `episode-${index}`
    const current = byTitle.get(key)
    if (!current || scoreBilibiliEpisode(episode) > scoreBilibiliEpisode(current.episode)) {
      byTitle.set(key, { episode, index })
    }
  })

  return [...byTitle.values()]
    .sort((left, right) => episodeSortKey(left.episode, left.index) - episodeSortKey(right.episode, right.index))
    .map(({ episode }) => episode)
}

function normalizeBilibiliEpisode(episode: BilibiliApiEpisode, fallbackIndex: number, defaultSelected: boolean): BilibiliEpisodeItem | null {
  const id = scalarToString(episode.id) || scalarToString(episode.ep_id)
  if (!id) return null

  const link = scalarToString(episode.link)
    || scalarToString(episode.share_url)
    || `https://www.bilibili.com/bangumi/play/ep${id}`
  const title = scalarToString(episode.title) || String(fallbackIndex + 1)
  const longTitle = scalarToString(episode.long_title)
  const badge = episodeBadgeText(episode)
  const duration = typeof episode.duration === 'number' && Number.isFinite(episode.duration) ? episode.duration : null

  return {
    id,
    title,
    subtitle: longTitle,
    badge,
    link,
    status: scalarToString(episode.status),
    duration,
    defaultSelected,
  }
}

function buildBilibiliEpisodeGroup(id: string, title: string, episodes: BilibiliApiEpisode[], defaultSelected: boolean): BilibiliEpisodeGroup | null {
  const normalizedEpisodes = episodes
    .map((episode, index) => normalizeBilibiliEpisode(episode, index, defaultSelected && !isPreviewEpisode(episode)))
    .filter((episode): episode is BilibiliEpisodeItem => Boolean(episode))

  if (normalizedEpisodes.length === 0) {
    return null
  }

  return { id, title, episodes: normalizedEpisodes }
}

type CollectionLogger = (line: string) => void

function normalizeBilibiliCheeseEpisode(episode: BilibiliCheeseEpisode, fallbackIndex: number): BilibiliEpisodeItem | null {
  const id = scalarToString(episode.id)
  if (!id) return null

  const indexLabel = scalarToString(episode.index) || String(fallbackIndex + 1)
  const isPlayable = episode.playable !== false
  const badge = scalarToString(episode.label)
    || (episode.episode_can_view === false || !isPlayable ? '需权限' : '')

  return {
    id,
    title: indexLabel,
    subtitle: scalarToString(episode.title) || scalarToString(episode.subtitle) || `ep${id}`,
    badge,
    link: `https://www.bilibili.com/cheese/play/ep${id}`,
    status: scalarToString(episode.status || episode.ep_status),
    duration: typeof episode.duration === 'number' && Number.isFinite(episode.duration) ? episode.duration : null,
    defaultSelected: false,
  }
}

async function resolveBilibiliMediaSeasonId(mediaId: string, sourceUrl: string, log?: CollectionLogger) {
  const apiUrl = new URL('https://api.bilibili.com/pgc/review/user')
  apiUrl.searchParams.set('media_id', mediaId)
  log?.(`B 站 media_id ${mediaId} 正在转换 season_id。`)

  const response = await fetch(apiUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 Media Dock',
      Referer: sourceUrl,
    },
  })

  if (!response.ok) {
    throw new Error(`Bilibili media request failed with status ${response.status}.`)
  }

  const payload = await response.json() as {
    code?: number
    message?: string
    result?: {
      media?: {
        season_id?: number | string
      }
    }
  }
  const seasonId = scalarToString(payload.result?.media?.season_id)
  if (payload.code !== 0 || !seasonId) {
    throw new Error(payload.message || 'Bilibili did not return a season id for this media URL.')
  }

  return seasonId
}

async function resolveBilibiliCheese(sourceUrl: string, log?: CollectionLogger): Promise<BilibiliSeasonResolveResult> {
  const lookup = parseBilibiliCheeseLookup(sourceUrl)
  const apiUrl = new URL('https://api.bilibili.com/pugv/view/web/season')
  apiUrl.searchParams.set(lookup.key, lookup.value)
  log?.(`B 站课程目录解析：${lookup.key}=${lookup.value}`)

  const response = await fetch(apiUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 Media Dock',
      Referer: lookup.sourceUrl,
    },
  })

  if (!response.ok) {
    throw new Error(`Bilibili Cheese request failed with status ${response.status}.`)
  }

  const payload = await response.json() as {
    code?: number
    message?: string
    data?: BilibiliCheeseSeasonData
  }
  const season = payload.data
  if (payload.code !== 0 || !season) {
    throw new Error(payload.message || 'Bilibili did not return Cheese course data.')
  }

  const episodes = (season.episodes ?? [])
    .map((episode, index) => normalizeBilibiliCheeseEpisode(episode, index))
    .filter((episode): episode is BilibiliEpisodeItem => Boolean(episode))

  if (episodes.length === 0) {
    throw new Error('No course episode links were found in this Bilibili Cheese URL.')
  }

  log?.(`B 站课程解析完成：${episodes.length} 个课时。`)

  return {
    sourceUrl: lookup.sourceUrl,
    title: scalarToString(season.title) || 'Bilibili course',
    seasonId: scalarToString(season.season_id),
    mediaId: null,
    groups: [
      {
        id: 'course',
        title: '课程课时',
        episodes,
      },
    ],
  }
}

async function resolveBilibiliSeason(sourceUrl: string, log?: CollectionLogger): Promise<BilibiliSeasonResolveResult> {
  const lookup = parseBilibiliSeasonLookup(sourceUrl)
  const apiUrl = new URL('https://api.bilibili.com/pgc/view/web/season')
  const seasonLookup = lookup.key === 'media_id'
    ? { key: 'season_id' as const, value: await resolveBilibiliMediaSeasonId(lookup.value, lookup.sourceUrl, log) }
    : lookup
  apiUrl.searchParams.set(seasonLookup.key, seasonLookup.value)
  log?.(`B 站番剧解析：${seasonLookup.key}=${seasonLookup.value}`)

  const response = await fetch(apiUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 Media Dock',
      Referer: lookup.sourceUrl,
    },
  })

  if (!response.ok) {
    throw new Error(`Bilibili season request failed with status ${response.status}.`)
  }

  const payload = await response.json() as {
    code?: number
    message?: string
    result?: BilibiliApiSeasonResult
  }
  if (payload.code !== 0 || !payload.result) {
    throw new Error(payload.message || 'Bilibili did not return season data.')
  }

  const season = payload.result
  const mainEpisodes = dedupeMainBilibiliEpisodes(season.episodes ?? [])
  const groups = [
    buildBilibiliEpisodeGroup('main', '正片', mainEpisodes, true),
    ...(season.section ?? []).map((section, index) => buildBilibiliEpisodeGroup(
      `section-${index + 1}`,
      scalarToString(section.title) || `Section ${index + 1}`,
      section.episodes ?? [],
      false,
    )),
  ].filter((group): group is BilibiliEpisodeGroup => Boolean(group))

  if (groups.length === 0) {
    throw new Error('No downloadable episode links were found in this Bilibili season.')
  }

  const episodeCount = groups.reduce((total, group) => total + group.episodes.length, 0)
  log?.(`B 站番剧解析完成：${groups.length} 个分组，${episodeCount} 个条目。`)

  return {
    sourceUrl: lookup.sourceUrl,
    title: scalarToString(season.title) || scalarToString(season.season_title) || 'Bilibili season',
    seasonId: scalarToString(season.season_id),
    mediaId: scalarToString(season.media_id) || null,
    groups,
  }
}

async function runProcessCollectOutput(command: string, args: string[], timeoutMs: number) {
  return await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: getDevRootDir(),
      env: {
        ...process.env,
        PATH: buildToolPathEnv(),
        DYLD_LIBRARY_PATH: buildDyldLibraryPathEnv(),
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
      },
    })

    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`${command} timed out after ${Math.round(timeoutMs / 1000)} seconds.`))
    }, timeoutMs)

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timeout)
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }
      reject(new Error(stderr.trim() || `${command} exited with code ${code}`))
    })
  })
}

function normalizeYoutubeEntry(entry: YtDlpFlatEntry, index: number): BilibiliEpisodeItem | null {
  const id = scalarToString(entry.id) || scalarToString(entry.url)
  const rawUrl = scalarToString(entry.url) || scalarToString(entry.webpage_url)
  const link = rawUrl.startsWith('http') ? rawUrl : id ? `https://www.youtube.com/watch?v=${id}` : ''
  if (!id || !link) return null

  return {
    id,
    title: String(index + 1),
    subtitle: scalarToString(entry.title) || id,
    badge: '',
    link,
    status: '',
    duration: typeof entry.duration === 'number' && Number.isFinite(entry.duration) ? entry.duration : null,
    defaultSelected: false,
  }
}

async function resolveYoutubeCollection(sourceUrl: string, log?: CollectionLogger): Promise<BilibiliSeasonResolveResult> {
  const parsed = parseMediaCollectionUrl(sourceUrl)
  if (parsed.service !== 'youtube') {
    throw new Error('Only YouTube collection URLs are supported here.')
  }

  const listId = parsed.parsed.searchParams.get('list')?.trim()
  if (!listId) {
    throw new Error('No YouTube playlist id was found in this URL.')
  }

  log?.(`YouTube 合集解析：list=${listId}`)
  log?.('正在调用 yt-dlp 读取合集目录，只解析列表，不下载视频。')
  const { stdout } = await runProcessCollectOutput(getYtDlpPath(), [
    '--flat-playlist',
    '--dump-single-json',
    '--skip-download',
    '--no-warnings',
    parsed.sourceUrl,
  ], 60000)
  const payload = JSON.parse(stdout) as YtDlpFlatPlaylist
  const entries = (payload.entries ?? [])
    .map((entry, index) => normalizeYoutubeEntry(entry, index))
    .filter((episode): episode is BilibiliEpisodeItem => Boolean(episode))

  if (entries.length === 0) {
    throw new Error('No YouTube playlist entries were found in this URL.')
  }

  log?.(`YouTube 合集解析完成：${entries.length} 个条目。`)

  return {
    sourceUrl: parsed.sourceUrl,
    title: scalarToString(payload.title) || 'YouTube playlist',
    seasonId: scalarToString(payload.id) || listId,
    mediaId: null,
    groups: [
      {
        id: 'youtube-playlist',
        title: 'YouTube 合集',
        episodes: entries,
      },
    ],
  }
}

async function resolveMediaCollection(sourceUrl: string, log?: CollectionLogger): Promise<BilibiliSeasonResolveResult> {
  const parsed = parseMediaCollectionUrl(sourceUrl)
  if (parsed.service === 'youtube') {
    log?.('识别为 YouTube 合集链接。')
    return await resolveYoutubeCollection(parsed.sourceUrl, log)
  }
  if (parsed.parsed.pathname.toLowerCase().startsWith('/cheese/')) {
    log?.('识别为 B 站课程链接。')
    return await resolveBilibiliCheese(parsed.sourceUrl, log)
  }
  log?.('识别为 B 站番剧/剧集链接。')
  return await resolveBilibiliSeason(parsed.sourceUrl, log)
}

type GitHubReleasePayload = {
  tag_name?: string
  name?: string
  html_url?: string
  assets?: Array<{
    name?: string
    browser_download_url?: string
  }>
}

function selectUpdateAsset(assets: NonNullable<GitHubReleasePayload['assets']>) {
  const normalizedAssets = assets
    .map((asset) => ({
      name: asset.name ?? '',
      url: asset.browser_download_url ?? '',
    }))
    .filter((asset) => asset.name && asset.url)

  if (isWindows) {
    return normalizedAssets.find((asset) => /\.exe$/i.test(asset.name))
      ?? normalizedAssets.find((asset) => /win.*\.zip$/i.test(asset.name))
      ?? null
  }

  if (process.platform === 'darwin') {
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
    return normalizedAssets.find((asset) => new RegExp(`${arch}.*mac.*\\.zip$`, 'i').test(asset.name))
      ?? normalizedAssets.find((asset) => /mac.*\.zip$/i.test(asset.name))
      ?? null
  }

  return normalizedAssets.find((asset) => /\.zip$/i.test(asset.name)) ?? null
}

async function checkForUpdates(): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion()
  const response = await fetch(GITHUB_LATEST_RELEASE_API)

  if (!response.ok) {
    throw new Error(`Update check failed with status ${response.status}.`)
  }

  const release = await response.json() as GitHubReleasePayload
  const latestVersion = release.tag_name ? normalizeVersion(release.tag_name) : null
  const asset = selectUpdateAsset(release.assets ?? [])

  return {
    currentVersion,
    latestVersion,
    updateAvailable: latestVersion ? compareVersions(currentVersion, latestVersion) < 0 : false,
    releaseName: release.name ?? release.tag_name ?? null,
    releaseUrl: release.html_url ?? null,
    assetName: asset?.name ?? null,
    assetUrl: asset?.url ?? null,
  }
}

async function downloadUrlToFile(
  url: string,
  targetPath: string,
  onProgress?: (progress: { receivedBytes: number; totalBytes: number | null; percent: number | null }) => void,
) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Download failed with status ${response.status}.`)
  }
  if (!response.body) {
    throw new Error('Download response did not include a body.')
  }

  ensureDirectory(dirname(targetPath))
  const totalBytesHeader = Number(response.headers.get('content-length') ?? 0)
  const totalBytes = Number.isFinite(totalBytesHeader) && totalBytesHeader > 0 ? totalBytesHeader : null
  let receivedBytes = 0
  const source = Readable.fromWeb(response.body)

  onProgress?.({ receivedBytes, totalBytes, percent: totalBytes ? 0 : null })
  source.on('data', (chunk: Buffer) => {
    receivedBytes += chunk.byteLength
    onProgress?.({
      receivedBytes,
      totalBytes,
      percent: totalBytes ? Math.min(100, (receivedBytes / totalBytes) * 100) : null,
    })
  })

  await pipeline(source, createWriteStream(targetPath))
  onProgress?.({ receivedBytes, totalBytes, percent: 100 })
}

async function downloadLatestUpdate(): Promise<UpdateDownloadResult> {
  const update = await checkForUpdates()
  if (!update.releaseUrl || !update.assetName || !update.assetUrl) {
    throw new Error('No matching release asset was found for this platform.')
  }

  const outputDir = ensureDirectory(getUpdateDownloadDir())
  const targetPath = join(outputDir, update.assetName)
  await downloadUrlToFile(update.assetUrl, targetPath)
  shell.showItemInFolder(targetPath)

  return {
    filePath: targetPath,
    assetName: update.assetName,
    releaseUrl: update.releaseUrl,
  }
}

function selectYtDlpDownloadAsset(assets: NonNullable<GitHubReleasePayload['assets']>) {
  const preferredName = isWindows ? 'yt-dlp.exe' : 'yt-dlp'
  const normalizedAssets = assets
    .map((asset) => ({
      name: asset.name ?? '',
      url: asset.browser_download_url ?? '',
    }))
    .filter((asset) => asset.name && asset.url)

  return normalizedAssets.find((asset) => asset.name === preferredName)
    ?? normalizedAssets.find((asset) => asset.name.toLowerCase() === preferredName.toLowerCase())
    ?? null
}

async function fetchLatestYtDlpRelease() {
  const response = await fetch(YT_DLP_LATEST_RELEASE_API)
  if (!response.ok) {
    throw new Error(`yt-dlp update check failed with status ${response.status}.`)
  }

  return await response.json() as GitHubReleasePayload
}

async function fetchLatestDenoRelease() {
  const response = await fetch(DENO_LATEST_RELEASE_API)
  if (!response.ok) {
    throw new Error(`Deno update check failed with status ${response.status}.`)
  }

  return await response.json() as GitHubReleasePayload
}

async function getCurrentYtDlpVersion() {
  try {
    const result = await runProcessCollectOutput(getYtDlpPath(), ['--version'], 15000)
    const versionLine = `${result.stdout}\n${result.stderr}`
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean)
    return versionLine ? normalizeVersion(versionLine) : null
  } catch {
    return null
  }
}

async function getCurrentDenoVersion() {
  const denoPath = getDenoPath()
  if (!denoPath) {
    return null
  }

  try {
    const result = await runProcessCollectOutput(denoPath, ['--version'], 15000)
    const versionLine = `${result.stdout}\n${result.stderr}`
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => /^deno\s+\d/i.test(line))
    const version = versionLine?.match(/^deno\s+([^\s]+)/i)?.[1]
    return version ? normalizeVersion(version) : null
  } catch {
    return null
  }
}

async function checkRuntimeToolUpdates(): Promise<RuntimeToolUpdateCheckResult> {
  const [ytDlpRelease, currentYtDlpVersion, denoRelease, currentDenoVersion] = await Promise.all([
    fetchLatestYtDlpRelease(),
    getCurrentYtDlpVersion(),
    fetchLatestDenoRelease(),
    getCurrentDenoVersion(),
  ])
  const latestYtDlpVersion = ytDlpRelease.tag_name ? normalizeVersion(ytDlpRelease.tag_name) : null
  const latestDenoVersion = denoRelease.tag_name ? normalizeVersion(denoRelease.tag_name) : null

  return {
    ytDlp: {
      tool: 'yt-dlp',
      currentVersion: currentYtDlpVersion,
      latestVersion: latestYtDlpVersion,
      updateAvailable: Boolean(currentYtDlpVersion && latestYtDlpVersion && compareVersions(currentYtDlpVersion, latestYtDlpVersion) < 0),
      releaseUrl: ytDlpRelease.html_url ?? null,
      detail: getYtDlpPath(),
    },
    deno: {
      tool: 'deno',
      currentVersion: currentDenoVersion,
      latestVersion: latestDenoVersion,
      updateAvailable: Boolean(latestDenoVersion && (!currentDenoVersion || compareVersions(currentDenoVersion, latestDenoVersion) < 0)),
      releaseUrl: denoRelease.html_url ?? null,
      detail: getDenoPath(),
    },
  }
}

function getCondaPythonPath() {
  const candidate = isWindows
    ? join(envRoot, 'python.exe')
    : join(envRoot, 'bin', 'python')

  return existsSync(candidate) ? candidate : null
}

async function installYtDlpRuntime(): Promise<RuntimeToolInstallResult> {
  emitRuntimeToolProgress({ tool: 'yt-dlp', stage: 'checking', message: '正在检查 yt-dlp 最新版本...', percent: null })
  const release = await fetchLatestYtDlpRelease()
  const latestVersion = release.tag_name ? normalizeVersion(release.tag_name) : null
  if (!latestVersion) {
    throw new Error('Could not determine the latest yt-dlp version.')
  }

  const currentPath = getYtDlpPath()
  const condaPythonPath = getCondaPythonPath()
  if (condaPythonPath && isPathInside(envRoot, currentPath)) {
    emitRuntimeToolProgress({ tool: 'yt-dlp', stage: 'installing', message: `正在更新 Conda 环境中的 yt-dlp 到 ${latestVersion}...`, percent: null })
    await runSimpleProcess(
      condaPythonPath,
      ['-m', 'pip', 'install', '--upgrade', '--force-reinstall', `yt-dlp==${normalizePipVersion(latestVersion)}`],
      getDevRootDir(),
    )
    const result: RuntimeToolInstallResult = {
      tool: 'yt-dlp',
      path: currentPath,
      version: await getCurrentYtDlpVersion() ?? latestVersion,
    }
    emitRuntimeToolProgress({ tool: 'yt-dlp', stage: 'complete', message: `yt-dlp 已更新到 ${result.version}。`, percent: 100 })
    return result
  }

  const asset = selectYtDlpDownloadAsset(release.assets ?? [])
  if (!asset) {
    throw new Error('No matching yt-dlp release asset was found for this platform.')
  }

  const targetPath = join(ensureDirectory(getRuntimeToolsInstallBinDir()), getExecutableName('yt-dlp'))
  await downloadUrlToFile(asset.url, targetPath, ({ percent }) => {
    emitRuntimeToolProgress({
      tool: 'yt-dlp',
      stage: 'downloading',
      message: `正在下载 yt-dlp ${latestVersion}...`,
      percent,
    })
  })
  emitRuntimeToolProgress({ tool: 'yt-dlp', stage: 'installing', message: '正在写入 yt-dlp 可执行文件...', percent: null })
  if (!isWindows) {
    chmodSync(targetPath, 0o755)
  }

  const result: RuntimeToolInstallResult = {
    tool: 'yt-dlp',
    path: targetPath,
    version: await getCurrentYtDlpVersion() ?? latestVersion,
  }
  emitRuntimeToolProgress({ tool: 'yt-dlp', stage: 'complete', message: `yt-dlp 已更新到 ${result.version}。`, percent: 100 })
  return result
}

function getDenoArchiveName() {
  if (isWindows) {
    return 'deno-x86_64-pc-windows-msvc.zip'
  }

  if (process.platform === 'darwin') {
    return process.arch === 'arm64' ? 'deno-aarch64-apple-darwin.zip' : 'deno-x86_64-apple-darwin.zip'
  }

  if (process.platform === 'linux') {
    return process.arch === 'arm64' ? 'deno-aarch64-unknown-linux-gnu.zip' : 'deno-x86_64-unknown-linux-gnu.zip'
  }

  throw new Error(`Deno auto-install is not supported on ${process.platform}.`)
}

function selectDenoDownloadAsset(assets: NonNullable<GitHubReleasePayload['assets']>) {
  const preferredName = getDenoArchiveName()
  const normalizedAssets = assets
    .map((asset) => ({
      name: asset.name ?? '',
      url: asset.browser_download_url ?? '',
    }))
    .filter((asset) => asset.name && asset.url)

  return normalizedAssets.find((asset) => asset.name === preferredName)
    ?? normalizedAssets.find((asset) => asset.name.toLowerCase() === preferredName.toLowerCase())
    ?? null
}

function quotePowerShellPath(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

function getBandizipPath() {
  if (!isWindows) {
    return null
  }

  const candidatePaths = uniquePaths([
    process.env.BANDIZIP_BIN,
    join(windowsProgramFilesDir, 'Bandizip', 'bz.exe'),
    join(windowsProgramFilesX86Dir, 'Bandizip', 'bz.exe'),
    findExecutableInPath('bz') ?? undefined,
  ])

  return candidatePaths.find((candidate) => existsSync(candidate)) ?? null
}

async function runSimpleProcess(command: string, args: string[], cwd: string) {
  return await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        PATH: buildToolPathEnv(),
      },
    })

    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(stderr.trim() || `${command} exited with code ${code}`))
    })
  })
}

async function extractZip(zipPath: string, outputDir: string) {
  rmSync(outputDir, { recursive: true, force: true })
  ensureDirectory(outputDir)

  if (isWindows) {
    const bandizipPath = getBandizipPath()
    if (bandizipPath) {
      await runSimpleProcess(
        bandizipPath,
        ['x', '-y', '-aoa', `-o:${outputDir}`, zipPath],
        dirname(zipPath),
      )
      return
    }

    const powershell = process.env.SystemRoot
      ? join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      : 'powershell.exe'
    await runSimpleProcess(
      powershell,
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `Expand-Archive -LiteralPath ${quotePowerShellPath(zipPath)} -DestinationPath ${quotePowerShellPath(outputDir)} -Force`,
      ],
      dirname(zipPath),
    )
    return
  }

  await runSimpleProcess('unzip', ['-oq', zipPath, '-d', outputDir], dirname(zipPath))
}

function findFileRecursive(rootDir: string, fileName: string): string | null {
  if (!existsSync(rootDir)) {
    return null
  }

  for (const item of readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = join(rootDir, item.name)
    if (item.isDirectory()) {
      const nested = findFileRecursive(fullPath, fileName)
      if (nested) return nested
      continue
    }
    if (item.isFile() && item.name === fileName) {
      return fullPath
    }
  }

  return null
}

async function installDenoRuntime(): Promise<RuntimeToolInstallResult> {
  emitRuntimeToolProgress({ tool: 'deno', stage: 'checking', message: '正在检查 Deno 最新版本...', percent: null })
  const release = await fetchLatestDenoRelease()
  const latestVersion = release.tag_name ? normalizeVersion(release.tag_name) : null
  if (!latestVersion) {
    throw new Error('Could not determine the latest Deno version.')
  }
  const asset = selectDenoDownloadAsset(release.assets ?? [])
  if (!asset) {
    throw new Error('No matching Deno release asset was found for this platform.')
  }

  const binDir = ensureDirectory(getRuntimeToolsInstallBinDir())
  const downloadDir = ensureDirectory(getRuntimeToolsDownloadDir())
  const archiveName = getDenoArchiveName()
  const archivePath = join(downloadDir, archiveName)
  const extractDir = join(downloadDir, `deno-${latestVersion}`)
  const executableName = getExecutableName('deno')
  const targetPath = join(binDir, executableName)

  await downloadUrlToFile(asset.url, archivePath, ({ percent }) => {
    emitRuntimeToolProgress({
      tool: 'deno',
      stage: 'downloading',
      message: `正在下载 Deno ${latestVersion}...`,
      percent,
    })
  })
  emitRuntimeToolProgress({ tool: 'deno', stage: 'extracting', message: '正在解压 Deno...', percent: null })
  await extractZip(archivePath, extractDir)

  const extractedDeno = findFileRecursive(extractDir, executableName)
  if (!extractedDeno) {
    throw new Error(`Downloaded Deno archive did not contain ${executableName}.`)
  }

  emitRuntimeToolProgress({ tool: 'deno', stage: 'installing', message: '正在写入 Deno 可执行文件...', percent: null })
  copyFileSync(extractedDeno, targetPath)
  if (!isWindows) {
    chmodSync(targetPath, 0o755)
  }

  rmSync(downloadDir, { recursive: true, force: true })

  const result: RuntimeToolInstallResult = {
    tool: 'deno',
    path: targetPath,
    version: await getCurrentDenoVersion() ?? latestVersion,
  }
  emitRuntimeToolProgress({ tool: 'deno', stage: 'complete', message: `Deno 已安装到 ${result.version}。`, percent: 100 })
  return result
}

function getSubtitleCleanupConfigPath() {
  return app.isPackaged
    ? join(getPortableDataRootDir(), 'subtitle-cleanup-config.json')
    : join(getDevRootDir(), 'subtitle-cleanup-config.json')
}

function normalizeSubtitleCleanupProviderProfile(input?: Partial<SubtitleCleanupProviderProfile> | null): SubtitleCleanupProviderProfile {
  return {
    baseUrl: input?.baseUrl?.trim() ?? '',
    apiKey: input?.apiKey?.trim() ?? '',
    model: input?.model?.trim() ?? '',
  }
}

function normalizeSubtitleCleanupThinkingMode(input?: string | null): SubtitleCleanupConfig['thinkingMode'] {
  return input === 'disabled' ? 'disabled' : 'default'
}

function normalizeSubtitleCleanupConfig(input?: Partial<SubtitleCleanupConfig> | null): SubtitleCleanupConfig {
  const customPresets = Array.isArray(input?.customPresets)
    ? input.customPresets
        .map((item, index) => ({
          id: typeof item?.id === 'string' && item.id.trim() ? item.id.trim() : `custom-${index + 1}`,
          label: typeof item?.label === 'string' && item.label.trim() ? item.label.trim() : '',
          url: typeof item?.url === 'string' ? item.url.trim() : '',
        }))
        .filter((item) => item.label && item.url)
    : []
  const providerProfiles = input?.providerProfiles && typeof input.providerProfiles === 'object'
    ? Object.fromEntries(
        Object.entries(input.providerProfiles)
          .map(([key, value]) => [key.trim(), normalizeSubtitleCleanupProviderProfile(value)] as const)
          .filter(([key, value]) => key && (value.baseUrl || value.apiKey || value.model)),
      ) as Record<string, SubtitleCleanupProviderProfile>
    : {}

  return {
    baseUrl: input?.baseUrl?.trim() ?? '',
    apiKey: input?.apiKey?.trim() ?? '',
    model: input?.model?.trim() ?? '',
    prompt: input?.prompt?.trim() || DEFAULT_SUBTITLE_CLEANUP_PROMPT,
    thinkingMode: normalizeSubtitleCleanupThinkingMode(input?.thinkingMode),
    customPresets,
    providerProfiles,
  }
}

function shouldDisableThinkingForProvider(config: Pick<SubtitleCleanupConfig, 'baseUrl' | 'thinkingMode'>) {
  if (config.thinkingMode !== 'disabled') {
    return false
  }

  const normalizedBaseUrl = config.baseUrl.trim().toLowerCase()
  return normalizedBaseUrl.includes('bigmodel.cn') || normalizedBaseUrl.includes('z.ai')
}

function buildSubtitleCleanupRequestBody(config: SubtitleCleanupConfig, chunk: string) {
  const body: Record<string, unknown> = {
    model: config.model,
    temperature: 0,
    messages: [
      { role: 'system', content: config.prompt },
      { role: 'user', content: chunk },
    ],
  }

  if (shouldDisableThinkingForProvider(config)) {
    body.thinking = { type: 'disabled' }
  }

  return body
}

function buildSubtitleCleanupConnectionTestBody(config: SubtitleCleanupConfig) {
  const body: Record<string, unknown> = {
    model: config.model,
    temperature: 0,
    max_tokens: 24,
    messages: [
      { role: 'system', content: 'Reply with OK only.' },
      { role: 'user', content: 'Connection test.' },
    ],
  }

  if (shouldDisableThinkingForProvider(config)) {
    body.thinking = { type: 'disabled' }
  }

  return body
}

function loadSubtitleCleanupConfig() {
  const configPath = getSubtitleCleanupConfigPath()
  if (!existsSync(configPath)) {
    return normalizeSubtitleCleanupConfig()
  }

  try {
    const raw = readFileSync(configPath, 'utf8')
    return normalizeSubtitleCleanupConfig(JSON.parse(raw) as Partial<SubtitleCleanupConfig>)
  } catch {
    return normalizeSubtitleCleanupConfig()
  }
}

function saveSubtitleCleanupConfig(input: Partial<SubtitleCleanupConfig>) {
  const configPath = getSubtitleCleanupConfigPath()
  ensureDirectory(dirname(configPath))
  const config = normalizeSubtitleCleanupConfig(input)
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
  return config
}

function buildOpenAiEndpoint(baseUrl: string, path: string) {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, '')
  const url = new URL(normalizedBaseUrl)
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const basePath = url.pathname.replace(/\/+$/, '')
  const pathSegments = basePath.split('/').filter(Boolean)
  const lastSegment = pathSegments[pathSegments.length - 1] ?? ''
  const baseHasVersionPrefix =
    /^v\d+$/i.test(lastSegment)
    || /\/(?:api|compatible-mode)(?:\/[^/]+)*\/v\d+$/i.test(basePath)
  const resourcePath = baseHasVersionPrefix
    ? normalizedPath.replace(/^\/v\d+(?=\/)/i, '')
    : normalizedPath

  url.pathname = `${basePath}${resourcePath}`.replace(/\/{2,}/g, '/')
  return url.toString()
}

function buildOpenAiHeaders(apiKey: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }
}

function assertOpenAiConfig(config: Pick<SubtitleCleanupConfig, 'baseUrl' | 'apiKey'> & { model?: string }) {
  if (!config.baseUrl.trim()) {
    throw new Error('Base URL is required.')
  }
  if (!config.apiKey.trim()) {
    throw new Error('API key is required.')
  }
  if ('model' in config && typeof config.model === 'string' && config.model.trim().length === 0) {
    throw new Error('Model is required.')
  }
}

async function parseOpenAiResponse(response: Response) {
  const text = await response.text()
  if (!text) {
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}.`)
    }
    return null
  }

  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}: ${text}`)
    }
    return text
  }

  if (!response.ok) {
    if (
      payload
      && typeof payload === 'object'
      && 'error' in payload
      && payload.error
      && typeof payload.error === 'object'
      && 'message' in payload.error
      && typeof payload.error.message === 'string'
    ) {
      throw new Error(payload.error.message)
    }

    throw new Error(`Request failed with status ${response.status}.`)
  }

  return payload
}

async function listOpenAiModels(config: Pick<SubtitleCleanupConfig, 'baseUrl' | 'apiKey'>) {
  assertOpenAiConfig(config)
  const response = await fetch(buildOpenAiEndpoint(config.baseUrl, '/v1/models'), {
    headers: buildOpenAiHeaders(config.apiKey),
  })

  const payload = await parseOpenAiResponse(response) as { data?: Array<{ id?: string }> } | null
  const models = (payload?.data ?? [])
    .map((item) => item.id?.trim() ?? '')
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right))

  if (models.length === 0) {
    throw new Error('No models were returned by this endpoint.')
  }

  return models
}

async function testOpenAiModelConnection(config: SubtitleCleanupConfig) {
  assertOpenAiConfig(config)
  const response = await fetch(buildOpenAiEndpoint(config.baseUrl, '/v1/chat/completions'), {
    method: 'POST',
    headers: buildOpenAiHeaders(config.apiKey),
    body: JSON.stringify(buildSubtitleCleanupConnectionTestBody(config)),
  })

  await parseOpenAiResponse(response)
  return { ok: true as const, message: 'Connection test passed.' }
}

function isSubtitleFile(filePath: string) {
  const extension = parse(filePath).ext.toLowerCase()
  return ['.srt', '.vtt', '.ass', '.ssa', '.txt'].includes(extension)
}

function shouldSkipSubtitleCleanupInput(filePath: string) {
  const normalizedName = parse(filePath).name.toLowerCase()
  return normalizedName.endsWith('.cleaned')
}

function collectSubtitleFiles(inputDir: string) {
  const files: string[] = []
  const entries = readdirSync(inputDir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = join(inputDir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectSubtitleFiles(fullPath))
      continue
    }
    if (entry.isFile() && isSubtitleFile(fullPath) && !shouldSkipSubtitleCleanupInput(fullPath)) {
      files.push(fullPath)
    }
  }

  return files.sort((left, right) => left.localeCompare(right))
}

function stripSubtitleLineNoise(line: string) {
  if (!line.trim()) {
    return ''
  }

  if (/^\d+$/.test(line.trim())) {
    return ''
  }

  if (/^WEBVTT\b/i.test(line.trim())) {
    return ''
  }

  if (/^(NOTE|STYLE|REGION)\b/i.test(line.trim())) {
    return ''
  }

  if (/^\[[^\]]+\]$/.test(line.trim())) {
    return ''
  }

  if (/^(Script Info|V4\+ Styles|Events|Format)\b/i.test(line.trim())) {
    return ''
  }

  if (/^\d{1,2}:\d{2}:\d{2}(?:[.,]\d{1,3})?\s*-->\s*\d{1,2}:\d{2}:\d{2}(?:[.,]\d{1,3})?/i.test(line.trim())) {
    return ''
  }

  if (/^\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?\s*-->\s*\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?/i.test(line.trim())) {
    return ''
  }

  let nextLine = line

  if (/^Dialogue:/i.test(nextLine)) {
    const segments = nextLine.split(',')
    nextLine = segments.length >= 10 ? segments.slice(9).join(',') : nextLine.replace(/^Dialogue:\s*/i, '')
  }

  nextLine = nextLine
    .replace(/^\uFEFF/, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{[^}]+\}/g, ' ')
    .replace(/\\[Nn]/g, '\n')
    .replace(/\\h/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return nextLine
}

function preprocessSubtitleContent(raw: string) {
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const cleanedLines = normalized
    .split('\n')
    .map((line) => stripSubtitleLineNoise(line))
    .filter(Boolean)

  return cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function chunkSubtitleContent(content: string, maxChars = 6000) {
  const paragraphs = content
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean)

  const chunks: string[] = []
  let buffer = ''

  const pushBuffer = () => {
    if (buffer.trim()) {
      chunks.push(buffer.trim())
      buffer = ''
    }
  }

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      pushBuffer()
      let start = 0
      while (start < paragraph.length) {
        chunks.push(paragraph.slice(start, start + maxChars).trim())
        start += maxChars
      }
      continue
    }

    const candidate = buffer ? `${buffer}\n\n${paragraph}` : paragraph
    if (candidate.length > maxChars) {
      pushBuffer()
      buffer = paragraph
    } else {
      buffer = candidate
    }
  }

  pushBuffer()
  return chunks.length > 0 ? chunks : [content]
}

async function requestSubtitleCleanupChunk(config: SubtitleCleanupConfig, chunk: string) {
  assertOpenAiConfig(config)
  activeSubtitleCleanupAbort = new AbortController()

  try {
    const response = await fetch(buildOpenAiEndpoint(config.baseUrl, '/v1/chat/completions'), {
      method: 'POST',
      headers: buildOpenAiHeaders(config.apiKey),
      signal: activeSubtitleCleanupAbort.signal,
      body: JSON.stringify(buildSubtitleCleanupRequestBody(config, chunk)),
    })

    const payload = await parseOpenAiResponse(response) as {
      choices?: Array<{ message?: { content?: string } }>
    } | null

    const content = payload?.choices?.[0]?.message?.content?.trim()
    if (!content) {
      throw new Error('Model returned an empty response.')
    }

    return content
  } catch (error) {
    if (subtitleCleanupCancelled) {
      throw new Error('Subtitle cleanup was cancelled.')
    }
    throw error
  } finally {
    activeSubtitleCleanupAbort = null
  }
}

function buildSubtitleCleanupOutputPath(inputPath: string, outputDir: string) {
  return join(outputDir, `${parse(inputPath).name}.cleaned.txt`)
}

async function runSubtitleCleanup(request: SubtitleCleanupRunRequest) {
  const config = normalizeSubtitleCleanupConfig(request)
  assertOpenAiConfig(config)

  const targets = request.mode === 'single'
    ? [request.inputPath].filter((value): value is string => Boolean(value)).filter((value) => !shouldSkipSubtitleCleanupInput(value))
    : request.inputDir
      ? collectSubtitleFiles(request.inputDir)
      : []

  if (targets.length === 0) {
    throw new Error(
      request.mode === 'single'
        ? 'Please choose a subtitle file first. Files already ending with .cleaned.txt are skipped.'
        : 'No subtitle files were found in this folder. Files already ending with .cleaned.txt are skipped.',
    )
  }

  subtitleCleanupCancelled = false
  const outputs: string[] = []
  emitMedia({
    type: 'status',
    status: 'running',
    message: request.mode === 'single' ? 'Cleaning subtitle file...' : `Cleaning ${targets.length} subtitle files...`,
    progress: {
      current: 0,
      total: targets.length,
    },
  })

  for (let index = 0; index < targets.length; index += 1) {
    if (subtitleCleanupCancelled) {
      throw new Error('Subtitle cleanup was cancelled.')
    }

    const targetPath = targets[index]
    const outputPath = buildSubtitleCleanupOutputPath(targetPath, request.outputDir)
    emitMedia({
      type: 'status',
      status: 'running',
      message: request.mode === 'single'
        ? 'Cleaning subtitle file...'
        : `Cleaning subtitle file ${index + 1}/${targets.length}...`,
      progress: {
        current: index + 1,
        total: targets.length,
        currentPath: targetPath,
      },
    })
    if (request.skipExistingOutputs && existsSync(outputPath)) {
      emitMedia({ type: 'log', line: `[${index + 1}/${targets.length}] Skipped existing output: ${outputPath}`, stream: 'stdout' })
      outputs.push(outputPath)
      continue
    }

    const raw = readFileSync(targetPath, 'utf8')
    const preprocessed = preprocessSubtitleContent(raw)

    if (!preprocessed) {
      throw new Error(`No usable subtitle text remained after preprocessing: ${targetPath}`)
    }

    const chunks = chunkSubtitleContent(preprocessed)
    const chunkOutputs: string[] = []

    emitMedia({ type: 'log', line: `[${index + 1}/${targets.length}] ${targetPath}`, stream: 'stdout' })
    emitMedia({ type: 'log', line: `Preprocessed ${preprocessed.length} chars into ${chunks.length} chunk(s).`, stream: 'stdout' })

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      if (subtitleCleanupCancelled) {
        throw new Error('Subtitle cleanup was cancelled.')
      }

      emitMedia({
        type: 'command',
        command: `POST ${buildOpenAiEndpoint(config.baseUrl, '/v1/chat/completions')} · ${config.model} · chunk ${chunkIndex + 1}/${chunks.length}`,
      })
      emitMedia({ type: 'log', line: `Requesting model cleanup for chunk ${chunkIndex + 1}/${chunks.length}...`, stream: 'stdout' })
      const content = await requestSubtitleCleanupChunk(config, chunks[chunkIndex])
      chunkOutputs.push(content)
    }

    activeSubtitleCleanupAbort = null
    writeFileSync(outputPath, chunkOutputs.join('\n\n').trim(), 'utf8')
    outputs.push(outputPath)
    emitMedia({ type: 'log', line: `Saved cleaned text to ${outputPath}`, stream: 'stdout' })
  }

  emitMedia({
    type: 'status',
    status: 'success',
    message: request.mode === 'single' ? 'Subtitle cleanup finished.' : `Subtitle cleanup finished for ${targets.length} file(s).`,
    outputs,
    progress: {
      current: targets.length,
      total: targets.length,
      currentPath: targets[targets.length - 1],
    },
  })

  return outputs
}

function resolveDialogStartDirectory(inputPath?: string) {
  const fallback = resolveDefaultDownloads()
  if (!inputPath || inputPath.trim().length === 0) {
    return fallback
  }

  let currentPath = inputPath.trim()

  while (currentPath.length > 0) {
    if (existsSync(currentPath)) {
      try {
        return statSync(currentPath).isDirectory() ? currentPath : dirname(currentPath)
      } catch {
        break
      }
    }

    const parentPath = dirname(currentPath)
    if (parentPath === currentPath) {
      break
    }
    currentPath = parentPath
  }

  return fallback
}

function getYtDlpPath() {
  return resolveExecutablePath('yt-dlp') ?? getExecutableName('yt-dlp')
}

function getFfmpegPath() {
  return resolveExecutablePath('ffmpeg') ?? getExecutableName('ffmpeg')
}

function getFfprobePath() {
  return resolveExecutablePath('ffprobe') ?? getExecutableName('ffprobe')
}

function getSelfCheckItems(): SelfCheckItem[] {
  const ytDlpPath = getYtDlpPath()
  const ffmpegPath = getFfmpegPath()
  const ffprobePath = getFfprobePath()
  const denoPath = getDenoPath()

  return [
    {
      key: 'yt-dlp',
      label: 'download-core',
      ok: ytDlpPath !== getExecutableName('yt-dlp') || Boolean(findExecutableInPath('yt-dlp')),
      detail: ytDlpPath,
    },
    {
      key: 'ffmpeg',
      label: 'media-core',
      ok: ffmpegPath !== getExecutableName('ffmpeg') || Boolean(findExecutableInPath('ffmpeg')),
      detail: ffmpegPath,
    },
    {
      key: 'ffprobe',
      label: 'media-probe',
      ok: ffprobePath !== getExecutableName('ffprobe') || Boolean(findExecutableInPath('ffprobe')),
      detail: ffprobePath,
    },
    {
      key: 'deno',
      label: 'Deno',
      ok: denoPath !== null,
      detail: denoPath ?? 'Not found',
    },
    {
      key: 'cookies',
      label: 'auth-dir',
      ok: existsSync(getCookiesDir()),
      detail: getCookiesDir(),
    },
  ]
}

function emit(payload: unknown) {
  mainWindow?.webContents.send('download:update', payload)
}

function emitMedia(payload: unknown) {
  mainWindow?.webContents.send('media-tools:update', payload)
  if (mediaToolsWindow && mediaToolsWindow.id !== mainWindow?.id) {
    mediaToolsWindow.webContents.send('media-tools:update', payload)
  }
}

function emitRuntimeToolProgress(payload: RuntimeToolProgressUpdate) {
  mainWindow?.webContents.send('runtime-tools:update', payload)
}

function emitQueue(message?: string) {
  emit({
    type: 'queue',
    queue: queueSnapshot,
    message,
  })
}

function emitJob(snapshot: JobSnapshot) {
  emit({
    type: 'job',
    job: snapshot,
  })
}

function emitLog(line: string, stream: 'stdout' | 'stderr' | 'system', jobId?: string) {
  emit({
    type: 'log',
    line,
    stream,
    jobId,
  })
}

function terminateProcess(child: ChildProcessWithoutNullStreams | null, label: string) {
  if (!child || child.killed) {
    return
  }

  const pid = child.pid
  try {
    if (isWindows && pid) {
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
      return
    }

    child.kill('SIGTERM')
    setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGKILL')
      }
    }, 1200)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    emitLog(`[${label}] failed to terminate process: ${message}`, 'stderr')
  }
}

function resolveDefaultDownloads() {
  return ensureDirectory(join(getPortableDataRootDir(), 'downloads'))
}

function assertSafeExternalUrl(targetUrl: string) {
  const parsed = new URL(targetUrl)
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`Unsupported external URL protocol: ${parsed.protocol}`)
  }
  return parsed.toString()
}

function assertSafeLocalPath(value: string) {
  const targetPath = String(value ?? '').trim()
  if (!targetPath) {
    throw new Error('Path is required.')
  }
  if (targetPath.includes('\0')) {
    throw new Error('Path contains an invalid character.')
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(targetPath)) {
    throw new Error('Only local filesystem paths can be opened.')
  }
  if (!isAbsolute(targetPath)) {
    throw new Error('Only absolute filesystem paths can be opened.')
  }
  if (!existsSync(targetPath)) {
    throw new Error(`Path does not exist: ${targetPath}`)
  }
  return targetPath
}

function getHostWindow(webContentsId?: Electron.WebContents) {
  return (webContentsId ? BrowserWindow.fromWebContents(webContentsId) : null) ?? mediaToolsWindow ?? mainWindow!
}

function getDenoPath() {
  return resolveExecutablePath('deno')
    ?? (shouldAllowSystemToolFallback() ? denoCandidates.find((candidate) => existsSync(candidate)) ?? null : null)
}

function normalizeCookieDomain(value: string) {
  return value.trim().replace(/^\./, '').toLowerCase()
}

function inspectCookieFile(filePath: string): Pick<CookieFileInfo, 'domains' | 'cookieCount' | 'expiredCookieCount' | 'expiredCookieNames' | 'expiringSoonCookieCount' | 'expiringSoonCookieNames'> {
  const domainCounts = new Map<string, number>()
  const expiredNames = new Set<string>()
  const expiringSoonNames = new Set<string>()
  const nowSeconds = Math.floor(Date.now() / 1000)
  const soonSeconds = nowSeconds + 24 * 60 * 60
  let cookieCount = 0
  let expiredCookieCount = 0
  let expiringSoonCookieCount = 0

  try {
    const content = readFileSync(filePath, 'utf8')
    content.split(/\r?\n/).forEach((rawLine) => {
      let line = rawLine.trim()
      if (!line) return
      if (line.startsWith('#HttpOnly_')) {
        line = line.replace(/^#HttpOnly_/, '')
      } else if (line.startsWith('#')) {
        return
      }

      const parts = line.split('\t')
      if (parts.length < 7) return

      const domain = normalizeCookieDomain(parts[0])
      if (!domain) return

      const expiry = Number.parseInt(parts[4] ?? '', 10)
      const name = parts[5]?.trim() ?? ''
      cookieCount += 1
      domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1)
      if (Number.isFinite(expiry) && expiry > 0 && expiry < nowSeconds) {
        expiredCookieCount += 1
        if (name) expiredNames.add(name)
      } else if (Number.isFinite(expiry) && expiry > 0 && expiry < soonSeconds) {
        expiringSoonCookieCount += 1
        if (name) expiringSoonNames.add(name)
      }
    })
  } catch {
    return {
      domains: [],
      cookieCount: 0,
      expiredCookieCount: 0,
      expiredCookieNames: [],
      expiringSoonCookieCount: 0,
      expiringSoonCookieNames: [],
    }
  }

  const domains = [...domainCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([domain]) => domain)

  return {
    domains,
    cookieCount,
    expiredCookieCount,
    expiredCookieNames: [...expiredNames].sort().slice(0, 6),
    expiringSoonCookieCount,
    expiringSoonCookieNames: [...expiringSoonNames].sort().slice(0, 6),
  }
}

function listCookieFilesRecursive(rootDir: string, currentDir = rootDir): CookieFileInfo[] {
  if (!existsSync(currentDir)) {
    return []
  }

  const items = readdirSync(currentDir, { withFileTypes: true })
  const result: CookieFileInfo[] = []

  for (const item of items) {
    const fullPath = join(currentDir, item.name)
    if (item.isDirectory()) {
      result.push(...listCookieFilesRecursive(rootDir, fullPath))
      continue
    }

    if (!item.isFile() || !item.name.toLowerCase().endsWith('.txt')) {
      continue
    }

    const cookieMetadata = inspectCookieFile(fullPath)
    result.push({
      label: relative(rootDir, fullPath) || item.name,
      path: fullPath,
      domains: cookieMetadata.domains,
      cookieCount: cookieMetadata.cookieCount,
      expiredCookieCount: cookieMetadata.expiredCookieCount,
      expiredCookieNames: cookieMetadata.expiredCookieNames,
      expiringSoonCookieCount: cookieMetadata.expiringSoonCookieCount,
      expiringSoonCookieNames: cookieMetadata.expiringSoonCookieNames,
    })
  }

  return result.sort((left, right) => left.label.localeCompare(right.label))
}

const ansiEscape = String.fromCharCode(27)
const ansiColorPattern = new RegExp(`${ansiEscape}\\[[0-9;]*m`, 'g')
const ansiControlPattern = new RegExp(`${ansiEscape}\\[[0-9;]*[A-Za-z]`, 'g')

function parseProgressLine(line: string) {
  const normalizedLine = line
    .replace(ansiColorPattern, '')
    .replace(ansiControlPattern, '')
    .trim()
  const markerIndex = normalizedLine.indexOf('PROGRESS|')
  if (markerIndex === -1) {
    return null
  }
  const payload = normalizedLine.slice(markerIndex)
  const [, percentText, downloaded, total, speed, eta] = payload.split('|')
  const normalized = percentText.replace('%', '').trim()
  const percent = normalized ? Number.parseFloat(normalized) : null
  return {
    percent: Number.isFinite(percent ?? Number.NaN) ? percent : null,
    downloaded: downloaded || '--',
    total: total || '--',
    speed: speed || '--',
    eta: eta || '--',
  }
}

function tokenizeExtraArgs(value: string) {
  const tokens = value.match(/"[^"]*"|'[^']*'|\S+/g) ?? []
  return tokens.map((token) => token.replace(/^['"]|['"]$/g, ''))
}

const allowedExtraArgFlags = new Set([
  '--no-playlist',
  '--embed-metadata',
  '--write-subs',
  '--write-auto-subs',
  '--skip-download',
  '-k',
  '--extract-audio',
  '--embed-thumbnail',
  '--write-thumbnail',
  '--write-description',
  '--write-info-json',
])

const allowedExtraArgValues = new Map<string, Set<string>>([
  ['--sub-langs', new Set(['all'])],
  ['--audio-format', new Set(['mp3'])],
  ['--audio-quality', new Set(['0'])],
])

function validateExtraArgs(args: string[]) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    const [inlineOption, inlineValue] = arg.split('=', 2)
    const allowedInlineValues = allowedExtraArgValues.get(inlineOption)

    if (allowedInlineValues && inlineValue !== undefined) {
      if (!allowedInlineValues.has(inlineValue)) {
        throw new Error(`Unsupported extra option value: ${inlineOption}=${inlineValue}`)
      }
      continue
    }

    if (allowedExtraArgFlags.has(arg)) {
      continue
    }

    const allowedValues = allowedExtraArgValues.get(arg)
    if (allowedValues) {
      const value = args[index + 1]
      if (!value || !allowedValues.has(value)) {
        throw new Error(`Unsupported extra option value: ${arg}`)
      }
      index += 1
      continue
    }

    throw new Error(`Unsupported extra option: ${arg}`)
  }
}

function hasExtraArg(args: string[], option: string) {
  return args.some((arg) => arg === option || arg.startsWith(`${option}=`))
}

function shouldForceSinglePlaylistItem(extraArgs: string[]) {
  return ![
    '--yes-playlist',
    '--playlist-items',
    '--playlist-start',
    '--playlist-end',
    '--max-downloads',
  ].some((option) => hasExtraArg(extraArgs, option))
}

function normalizeDownloadUrl(url: string) {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()
    const isDouyin = hostname === 'douyin.com' || hostname.endsWith('.douyin.com')
    const modalId = parsed.searchParams.get('modal_id')?.trim()

    if (isDouyin && modalId && /^\d{10,}$/.test(modalId) && !/^\/video\/\d+/.test(parsed.pathname)) {
      return `https://www.douyin.com/video/${modalId}`
    }
  } catch {
    return url
  }

  return url
}

function getUrlNormalizationHint(originalUrl: string, normalizedUrl: string) {
  if (originalUrl === normalizedUrl) {
    return null
  }
  if (originalUrl.toLowerCase().includes('douyin.com')) {
    return `提示：检测到抖音弹窗/精选入口，已转换为单条视频链接：${normalizedUrl}`
  }
  return `提示：已转换为 yt-dlp 更容易识别的链接：${normalizedUrl}`
}

function getPreflightDownloadHint(url: string) {
  const lowerUrl = url.toLowerCase()
  if (lowerUrl.includes('tiktok.com/foryou')) {
    return '提示：TikTok /foryou 是推荐流页面，不是单条视频链接。请打开目标视频，复制 @用户名/video/数字ID 或 vm/vt 分享短链后再下载。'
  }
  if (/bilibili\.com\/cheese\/play\/ss/i.test(lowerUrl)) {
    return '提示：这个 B 站课程链接看起来是系列入口。软件会强制只处理 1 个条目，若要下载指定小节，请优先复制具体 ep 链接。'
  }
  if (lowerUrl.includes('list=') || lowerUrl.includes('/playlist?') || lowerUrl.includes('/playlist/')) {
    return '提示：检测到播放列表参数。默认只处理当前链接中的 1 个条目，避免展开整个列表。'
  }
  return null
}

function videoPresetToFormat(value: VideoPreset) {
  switch (value) {
    case '2160p':
      return 'bestvideo[height<=2160]+bestaudio/best[height<=2160]'
    case '1080p':
      return 'bestvideo[height<=1080]+bestaudio/best[height<=1080]'
    case '720p':
      return 'bestvideo[height<=720]+bestaudio/best[height<=720]'
    case '480p':
      return 'bestvideo[height<=480]+bestaudio/best[height<=480]'
    default:
      return 'bv*+ba/b'
  }
}

function audioQualityToValue(value: AudioQuality) {
  switch (value) {
    case '320k':
      return '320'
    case '192k':
      return '192'
    case '128k':
      return '128'
    default:
      return '0'
  }
}

function detectKnownCookieTarget(url: string) {
  const lowerUrl = url.toLowerCase()
  if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be') || lowerUrl.includes('googlevideo.com')) return 'youtube'
  if (lowerUrl.includes('bilibili.com') || lowerUrl.includes('b23.tv') || lowerUrl.includes('biligame.com')) return 'bilibili'
  if (lowerUrl.includes('douyin.com') || lowerUrl.includes('iesdouyin.com')) return 'douyin'
  if (lowerUrl.includes('tiktok.com')) return 'tiktok'
  return null
}

function cookieFileLooksMismatchedForUrl(cookieFile: string | null | undefined, url: string) {
  if (!cookieFile) return false
  const target = detectKnownCookieTarget(url)
  if (!target) return false
  const normalized = cookieFile.replace(/\\/g, '/').toLowerCase()
  const tokensByTarget: Record<string, string[]> = {
    youtube: ['youtube', 'google.com', 'google.cookies.txt'],
    bilibili: ['bilibili', 'b-site', 'b23.tv', 'biligame'],
    douyin: ['douyin', 'iesdouyin'],
    tiktok: ['tiktok'],
  }
  const ownTokens = tokensByTarget[target] ?? []
  const hasOwnToken = ownTokens.some((token) => normalized.includes(token))
  const hasOtherServiceToken = Object.entries(tokensByTarget)
    .filter(([key]) => key !== target)
    .some(([, tokens]) => tokens.some((token) => normalized.includes(token)))
  return hasOtherServiceToken && !hasOwnToken
}

function getCookieFileForJob(request: DownloadRequest, jobIndex: number, url: string) {
  const manualCookieFile = request.cookieFile?.trim()
  const autoCookieFile = request.urlCookieFiles?.[jobIndex - 1]?.trim()
  if (manualCookieFile && !cookieFileLooksMismatchedForUrl(manualCookieFile, url)) {
    return manualCookieFile
  }
  return autoCookieFile || null
}

function getCookieAutoFallbackHint(request: DownloadRequest, url: string, jobIndex: number) {
  const manualCookieFile = request.cookieFile?.trim()
  const autoCookieFile = request.urlCookieFiles?.[jobIndex - 1]?.trim()
  if (!manualCookieFile || !autoCookieFile || !cookieFileLooksMismatchedForUrl(manualCookieFile, url)) {
    return null
  }
  return '提示：检测到手动 Cookie 与当前链接来源不匹配，本任务已改用按链接自动匹配的 Cookie。'
}

function shouldUseYoutubeRemoteChallengeComponents(url: string, denoPath: string | null) {
  return Boolean(denoPath && detectKnownCookieTarget(url) === 'youtube')
}

function buildArgs(request: DownloadRequest, url: string, jobIndex: number) {
  const ffmpegPath = getFfmpegPath()
  const denoPath = getDenoPath()
  const extraArgs = tokenizeExtraArgs(request.extraArgs.trim())
  validateExtraArgs(extraArgs)
  const skipDownload = extraArgs.includes('--skip-download')
  const cookieFile = getCookieFileForJob(request, jobIndex, url)
  const args = [
    '--no-update',
    '--no-playlist',
    '--progress',
    '--newline',
    '--progress-template',
    'download:PROGRESS|%(progress._percent_str)s|%(progress._downloaded_bytes_str)s|%(progress._total_bytes_str)s|%(progress._speed_str)s|%(progress._eta_str)s',
    '--print',
    'before_dl:TITLE|%(title)s',
    '--print',
    'after_move:FILEPATH|%(filepath)s',
    '--ffmpeg-location',
    isAbsolute(ffmpegPath) ? dirname(ffmpegPath) : ffmpegPath,
    '-o',
    join(request.outputDir, '%(title)s [%(id)s].%(ext)s'),
  ]

  if (shouldForceSinglePlaylistItem(extraArgs)) {
    args.push('--playlist-items', '1')
  }

  if (denoPath && !hasExtraArg(extraArgs, '--js-runtimes')) {
    args.push('--js-runtimes', `deno:${denoPath}`)
  }

  if (shouldUseYoutubeRemoteChallengeComponents(url, denoPath) && !hasExtraArg(extraArgs, '--remote-components')) {
    args.push('--remote-components', 'ejs:github')
  }

  if (!skipDownload && request.mode === 'audio') {
    args.push(
      '-x',
      '--audio-format',
      request.audioFormat,
      '--audio-quality',
      audioQualityToValue(request.audioQuality),
    )
  } else if (!skipDownload) {
    args.push('-f', videoPresetToFormat(request.videoPreset), '--merge-output-format', 'mp4')
  }

  if (cookieFile) {
    args.push('--cookies', cookieFile)
  }

  args.push(...extraArgs)
  args.push(url)
  return args
}

function stringifyCommand(args: string[]) {
  const ytDlpPath = getYtDlpPath()
  return `"${ytDlpPath}" ${args.map((part) => (part.includes(' ') ? `"${part}"` : part)).join(' ')}`
}

function stringifyExecutableCommand(executable: string, args: string[]) {
  return `"${executable}" ${args.map((part) => (part.includes(' ') ? `"${part}"` : part)).join(' ')}`
}

function getDownloadHint(line: string, url: string) {
  const lowerLine = line.toLowerCase()
  const lowerUrl = url.toLowerCase()
  if (lowerUrl.includes('bilibili.com') && (lowerLine.includes('http error 412') || lowerLine.includes('precondition failed'))) {
    return '提示：B 站返回 412 通常是登录态、风控或请求条件不匹配。请优先选择 B 站专用 cookies 文件后重试。'
  }
  if (lowerUrl.includes('bilibili.com') && (lowerLine.includes('purchase the course') || lowerLine.includes('need to purchase'))) {
    return '提示：这是 B 站课程权限问题。请确认当前账号已购买/可观看该课程，并重新用同一个浏览器导出 B 站 Cookie；如果链接是课程系列 ss 入口，建议换成具体 ep 小节链接。'
  }
  if (lowerUrl.includes('bilibili.com') && (lowerLine.includes('eof occurred in violation of protocol') || lowerLine.includes('_ssl') || lowerLine.includes('ssl'))) {
    return '提示：这是 B 站下载过程中的 SSL/TLS 连接中断，更像网络、代理、CDN 或并发连接波动。若本地留下有画面没声音的文件，多半是音轨或合并未完成的半成品；建议删除残留文件后，降低并发、关闭/切换代理或稍后重试。'
  }
  if ((lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) && (lowerLine.includes('sign in to confirm') || lowerLine.includes('not a bot'))) {
    return '提示：YouTube 触发了登录/机器人校验。请确认本任务使用的是 YouTube 专用 Cookie；多来源批量下载时建议使用自动匹配 Cookie，不要把 B 站 Cookie 强制套给 YouTube。'
  }
  if ((lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) && lowerLine.includes('challenge solver lib script version')) {
    return '提示：YouTube challenge solver 组件过旧。Media Dock 会为 YouTube 自动启用 yt-dlp 官方 EJS 组件；若这里仍失败，请检查网络是否能访问 GitHub，或更新 yt-dlp 后重试。'
  }
  if ((lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) && (
    lowerLine.includes('signature solving failed')
    || lowerLine.includes('n challenge solving failed')
    || lowerLine.includes('found 0 n function possibilities')
    || lowerLine.includes('error solving')
  )) {
    return '提示：已进入 YouTube 播放器签名解析，但 n challenge / signature 求解失败。Cookie 不一定失效；建议先把并发降到 1，稍后重试，或更新 yt-dlp/Deno 后再跑。'
  }
  if (lowerLine.includes('unsupported url') && lowerUrl.includes('tiktok.com/foryou')) {
    return '提示：这个 TikTok 链接是推荐流入口，yt-dlp 无法从 /foryou 判断要下载哪一条视频。请复制具体视频页或分享短链。'
  }
  if (lowerLine.includes('unsupported url') && lowerUrl.includes('douyin.com') && lowerUrl.includes('modal_id=')) {
    return '提示：这个抖音链接是弹窗入口。若自动转换后仍失败，请在网页中打开单条视频，再复制 /video/数字ID 形式的链接。'
  }
  if (lowerLine.includes('unsupported url') && lowerUrl.includes('douyin.com')) {
    return '提示：这个抖音链接不是单条视频页。请复制具体作品链接，优先使用 /video/数字ID 或分享出来的单条视频链接。'
  }
  if (lowerUrl.includes('douyin.com') && lowerLine.includes('fresh cookies')) {
    return '提示：抖音返回需要 fresh cookies。请在同一个浏览器里打开这条视频，确认能正常播放后立刻重新用 MediaCookies 导出；如果浏览器里也要验证/刷新/登录，需要先完成验证。'
  }
  if (lowerUrl.includes('tiktok.com') && (lowerLine.includes('tls connect error') || lowerLine.includes('curl: (35)'))) {
    return '提示：TikTok 连接在 TLS 阶段失败，更像网络、代理或系统证书/加密库兼容问题。可以先换网络或代理节点，或稍后重试；Cookie 已经按 TikTok 来源使用。'
  }
  if ((lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) && (lowerLine.includes('http error 403') || lowerLine.includes('forbidden'))) {
    return '提示：YouTube 返回 403。若命令里已经带 YouTube Cookie，通常不是“没加 Cookie”，更可能是签名 challenge、风控、并发或 Cookie 新鲜度问题；建议并发 1、重新导出 YouTube Cookie，或更新 yt-dlp/Deno 后重试。'
  }
  if ((lowerLine.includes('http error 403') || lowerLine.includes('forbidden')) && lowerUrl.includes('bilibili.com')) {
    return '提示：这个站点可能需要登录态或会员权限。请改用对应站点专用 cookies 文件后重试。'
  }
  return null
}

function parseDuration(value?: string) {
  if (!value) return null
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

async function inspectMedia(inputPath: string): Promise<MediaInspection> {
  const ffprobePath = getFfprobePath()

  return await new Promise((resolve, reject) => {
    const child = spawn(ffprobePath, [
      '-v',
      'error',
      '-show_entries',
      'format=duration,format_name',
      '-show_streams',
      '-of',
      'json',
      inputPath,
    ])

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8')
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8')
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `ffprobe exited with code ${code}`))
        return
      }

      try {
        const payload = JSON.parse(stdout) as {
          format?: { duration?: string; format_name?: string }
          streams?: Array<{ index?: number; codec_type?: string; codec_name?: string; tags?: { language?: string; title?: string } }>
        }

        resolve({
          inputPath,
          fileName: parse(inputPath).base,
          duration: parseDuration(payload.format?.duration),
          formatName: payload.format?.format_name ?? 'unknown',
          streams: (payload.streams ?? []).map((stream) => ({
            index: stream.index ?? -1,
            codecType: stream.codec_type ?? 'unknown',
            codecName: stream.codec_name ?? 'unknown',
            language: stream.tags?.language ?? '',
            title: stream.tags?.title ?? '',
          })),
        })
      } catch (error) {
        reject(error)
      }
    })
  })
}

function getAudioExportConfig(format: MediaAudioExportFormat) {
  switch (format) {
    case 'wav':
      return { extension: 'wav', args: ['-acodec', 'pcm_s16le'] }
    case 'flac':
      return { extension: 'flac', args: ['-acodec', 'flac'] }
    case 'm4a':
      return { extension: 'm4a', args: ['-acodec', 'aac', '-b:a', '256k'] }
    default:
      return { extension: 'mp3', args: ['-acodec', 'libmp3lame', '-q:a', '0'] }
  }
}

function getSubtitleExportConfig(format: MediaSubtitleExportFormat) {
  switch (format) {
    case 'ass':
      return { extension: 'ass', args: ['-c:s', 'ass'] }
    case 'vtt':
      return { extension: 'vtt', args: ['-c:s', 'webvtt'] }
    default:
      return { extension: 'srt', args: ['-c:s', 'srt'] }
  }
}

function buildMediaOutputPath(inputPath: string, outputDir: string, suffix: string, extension: string) {
  const baseName = parse(inputPath).name
  return join(outputDir, `${baseName}${suffix}.${extension}`)
}

const mergeCandidateExtensions = new Set([
  '.aac',
  '.avi',
  '.flac',
  '.flv',
  '.m4a',
  '.m4s',
  '.m4v',
  '.mka',
  '.mkv',
  '.mov',
  '.mp3',
  '.mp4',
  '.ogg',
  '.opus',
  '.ts',
  '.wav',
  '.webm',
])

function getAvailableOutputPath(outputPath: string) {
  if (!existsSync(outputPath)) {
    return outputPath
  }

  const parsed = parse(outputPath)
  for (let index = 2; index < 1000; index += 1) {
    const candidate = join(parsed.dir, `${parsed.name} ${index}${parsed.ext}`)
    if (!existsSync(candidate)) {
      return candidate
    }
  }

  throw new Error(`Could not find an available output file name near: ${outputPath}`)
}

function sanitizeOutputBaseName(value: string | null | undefined) {
  const normalized = value?.normalize('NFKC').trim() ?? ''
  if (!normalized) {
    return ''
  }

  const sanitized = [...normalized]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint < 32 || '<>:"/\\|?*'.includes(character) ? ' ' : character
    })
    .join('')

  return sanitized
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .slice(0, 140)
    .trim()
}

function buildMergeOutputPath(
  videoPath: string,
  outputDir: string,
  outputFormat: MediaMergeOutputFormat,
  outputName?: string | null,
  sequenceIndex?: number,
  ensureAvailable = true,
) {
  const customName = sanitizeOutputBaseName(outputName)
  const defaultName = `${parse(videoPath).name} - merged`
  const sequenceSuffix = customName && typeof sequenceIndex === 'number' ? ` ${String(sequenceIndex + 1).padStart(2, '0')}` : ''
  const baseName = customName ? `${customName}${sequenceSuffix}` : defaultName
  const outputPath = outputDir ? join(outputDir, `${baseName}.${outputFormat}`) : `${baseName}.${outputFormat}`
  return ensureAvailable ? getAvailableOutputPath(outputPath) : outputPath
}

function getMergeRole(inspection: MediaInspection) {
  const hasVideo = inspection.streams.some((stream) => stream.codecType === 'video')
  const hasAudio = inspection.streams.some((stream) => stream.codecType === 'audio')

  if (hasVideo && hasAudio) return 'video'
  if (hasVideo) return 'video'
  if (hasAudio) return 'audio'
  return 'unknown'
}

type MergeCandidate = {
  path: string
  duration: number | null
  sizeBytes: number | null
  videoStreamCount: number
  audioStreamCount: number
}

function getDurationDiff(left: number | null, right: number | null) {
  if (left === null || right === null) {
    return null
  }
  return Math.abs(left - right)
}

function getDurationPairThreshold(videoDuration: number | null) {
  if (videoDuration === null) {
    return 0
  }

  return Math.max(0.25, Math.min(5, videoDuration * 0.01))
}

function selectAudioForVideo(videoFile: MergeCandidate, audioFiles: MergeCandidate[], usedAudioPaths: Set<string>) {
  const availableAudioFiles = audioFiles.filter((item) => !usedAudioPaths.has(item.path))
  if (availableAudioFiles.length === 0) {
    return null
  }

  const durationCandidates = availableAudioFiles
    .map((audioFile) => ({
      audioFile,
      durationDiff: getDurationDiff(videoFile.duration, audioFile.duration),
    }))
    .filter((item): item is { audioFile: MergeCandidate; durationDiff: number } => item.durationDiff !== null)
    .sort((left, right) =>
      left.durationDiff - right.durationDiff
      || parse(left.audioFile.path).base.localeCompare(parse(right.audioFile.path).base),
    )

  const bestDurationCandidate = durationCandidates[0]
  if (bestDurationCandidate && bestDurationCandidate.durationDiff <= getDurationPairThreshold(videoFile.duration)) {
    return {
      audioFile: bestDurationCandidate.audioFile,
      durationDiff: bestDurationCandidate.durationDiff,
      matchReason: `duration ${bestDurationCandidate.durationDiff.toFixed(3)}s`,
    }
  }

  return null
}

function getCandidateSize(candidatePath: string) {
  try {
    return statSync(candidatePath).size
  } catch {
    return null
  }
}

function getMergedDuration(videoDuration: number | null, audioDuration: number | null) {
  if (videoDuration !== null && audioDuration !== null) {
    return Math.min(videoDuration, audioDuration)
  }
  return videoDuration ?? audioDuration
}

function addNullableSize(left: number | null, right: number | null) {
  if (left === null || right === null) {
    return null
  }
  return left + right
}

function collectMergeInputPaths(request: Pick<MediaMergeRequest, 'mode' | 'inputPaths' | 'inputDir'>, skipped: MediaMergeSkippedItem[]) {
  if (request.mode === 'folder') {
    if (!request.inputDir) {
      return []
    }

    return readdirSync(request.inputDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => join(request.inputDir!, entry.name))
      .sort((left, right) => parse(left).base.localeCompare(parse(right).base))
  }

  const uniquePaths = new Set<string>()
  for (const inputPath of request.inputPaths) {
    const normalized = inputPath.trim()
    if (!normalized || uniquePaths.has(normalized)) {
      continue
    }
    uniquePaths.add(normalized)
  }

  return [...uniquePaths].filter((inputPath) => {
    if (!existsSync(inputPath)) {
      skipped.push({ path: inputPath, reason: 'file not found' })
      return false
    }
    if (!statSync(inputPath).isFile()) {
      skipped.push({ path: inputPath, reason: 'not a file' })
      return false
    }
    return true
  })
}

async function inspectMergeCandidate(candidatePath: string): Promise<{ role: ReturnType<typeof getMergeRole>; candidate: MergeCandidate }> {
  const inspection = await inspectMedia(candidatePath)
  return {
    role: getMergeRole(inspection),
    candidate: {
      path: candidatePath,
      duration: inspection.duration,
      sizeBytes: getCandidateSize(candidatePath),
      videoStreamCount: inspection.streams.filter((stream) => stream.codecType === 'video').length,
      audioStreamCount: inspection.streams.filter((stream) => stream.codecType === 'audio').length,
    },
  }
}

async function buildMediaMergePreview(
  request: MediaMergeRequest,
  options: { emitLogs: boolean; ensureOutputAvailable: boolean; respectCancellation: boolean },
): Promise<MediaMergePreviewResult> {
  const skipped: MediaMergeSkippedItem[] = []
  const inputPaths = collectMergeInputPaths(request, skipped)
    .filter((inputPath) => {
      if (mergeCandidateExtensions.has(extname(inputPath).toLowerCase())) {
        return true
      }
      skipped.push({ path: inputPath, reason: 'unsupported extension' })
      return false
    })

  const videoFiles: MergeCandidate[] = []
  const audioFiles: MergeCandidate[] = []

  if (options.emitLogs) {
    emitMedia({ type: 'log', line: `[scan] inspecting ${inputPaths.length} candidate file(s).`, stream: 'system' })
  }

  for (const [candidateIndex, candidatePath] of inputPaths.entries()) {
    if (options.respectCancellation && mediaCancelled) {
      throw new Error('Media tool action was cancelled.')
    }

    try {
      if (options.emitLogs) {
        emitMedia({ type: 'log', line: `[scan] [${candidateIndex + 1}/${inputPaths.length}] ${parse(candidatePath).base}`, stream: 'stdout' })
      }
      const { role, candidate } = await inspectMergeCandidate(candidatePath)
      if (role === 'video') {
        videoFiles.push(candidate)
      } else if (role === 'audio') {
        audioFiles.push(candidate)
      } else {
        skipped.push({ path: candidatePath, reason: 'no audio/video stream' })
        if (options.emitLogs) {
          emitMedia({ type: 'log', line: `[scan] skipped non audio/video file: ${parse(candidatePath).base}`, stream: 'stderr' })
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ffprobe failed'
      skipped.push({ path: candidatePath, reason: message })
      if (options.emitLogs) {
        emitMedia({ type: 'log', line: `[scan] skipped ${parse(candidatePath).base}: ${message}`, stream: 'stderr' })
      }
    }
  }

  const usedAudioPaths = new Set<string>()
  const pairs: MediaMergePair[] = []
  const sortedVideos = [...videoFiles].sort((left, right) =>
    (left.duration ?? Number.POSITIVE_INFINITY) - (right.duration ?? Number.POSITIVE_INFINITY)
    || parse(left.path).base.localeCompare(parse(right.path).base),
  )

  for (const videoFile of sortedVideos) {
    const matchedAudio = selectAudioForVideo(videoFile, audioFiles, usedAudioPaths)

    if (!matchedAudio) {
      if (options.emitLogs) {
        emitMedia({ type: 'log', line: `[scan] no duration-matched audio file for: ${parse(videoFile.path).base}`, stream: 'stderr' })
      }
      continue
    }

    const audioFile = matchedAudio.audioFile
    usedAudioPaths.add(audioFile.path)
    const estimatedSizeBytes = addNullableSize(videoFile.sizeBytes, audioFile.sizeBytes)
    const durationSeconds = getMergedDuration(videoFile.duration, audioFile.duration)
    pairs.push({
      videoPath: videoFile.path,
      audioPath: audioFile.path,
      outputPath: '',
      durationDiff: matchedAudio.durationDiff,
      durationSeconds,
      estimatedSizeBytes,
      videoAudioTracks: videoFile.audioStreamCount,
      audioTracks: audioFile.audioStreamCount,
      matchReason: matchedAudio.matchReason,
    })

    if (options.emitLogs) {
      emitMedia({
        type: 'log',
        line: `[scan] paired ${parse(videoFile.path).base} + ${parse(audioFile.path).base} (${matchedAudio.matchReason})`,
        stream: 'stdout',
      })
    }
  }

  const finalizedPairs = pairs.map((pair, index) => ({
    ...pair,
    outputPath: buildMergeOutputPath(
      pair.videoPath,
      request.outputDir,
      request.outputFormat,
      request.outputName,
      pairs.length > 1 ? index : undefined,
      options.ensureOutputAvailable,
    ),
  }))

  if (options.emitLogs) {
    emitMedia({
      type: 'log',
      line: `[scan] found ${videoFiles.length} video candidate(s), ${audioFiles.length} audio candidate(s), ${finalizedPairs.length} merge pair(s).`,
      stream: 'system',
    })
  }

  const estimatedSizeBytes = finalizedPairs.reduce<number | null>((total, pair) => {
    if (total === null || pair.estimatedSizeBytes === null) {
      return null
    }
    return total + pair.estimatedSizeBytes
  }, 0)
  const estimatedDurationSeconds = finalizedPairs.reduce<number | null>((total, pair) => {
    if (pair.durationSeconds === null) {
      return total
    }
    return (total ?? 0) + pair.durationSeconds
  }, null)
  const longestDurationSeconds = finalizedPairs.reduce<number | null>((maxDuration, pair) => {
    if (pair.durationSeconds === null) {
      return maxDuration
    }
    return maxDuration === null ? pair.durationSeconds : Math.max(maxDuration, pair.durationSeconds)
  }, null)

  return {
    inputCount: inputPaths.length,
    videoCount: videoFiles.length,
    audioCount: audioFiles.length,
    pairCount: finalizedPairs.length,
    unmatchedVideoCount: videoFiles.length - finalizedPairs.length,
    unmatchedAudioCount: audioFiles.length - usedAudioPaths.size,
    estimatedSizeBytes,
    estimatedDurationSeconds,
    longestDurationSeconds,
    pairs: finalizedPairs,
    skipped,
  }
}

async function runMergePair(ffmpegPath: string, pair: MediaMergePair, outputFormat: MediaMergeOutputFormat, outputDir: string) {
  if (outputFormat === 'mov') {
    const resolveArgs = [
      '-y',
      '-i',
      pair.videoPath,
      '-i',
      pair.audioPath,
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      '-c:v',
      'prores_ks',
      '-profile:v',
      '3',
      '-pix_fmt',
      'yuv422p10le',
      '-c:a',
      'pcm_s16le',
      '-ar',
      '48000',
      '-shortest',
      pair.outputPath,
    ]

    emitMedia({ type: 'command', command: stringifyExecutableCommand(ffmpegPath, resolveArgs) })
    emitMedia({ type: 'log', line: `[merge] DaVinci MOV transcode -> ${parse(pair.outputPath).base}`, stream: 'system' })
    await runLoggedProcess(ffmpegPath, resolveArgs, outputDir)
    return
  }

  const copyArgs = [
    '-y',
    '-i',
    pair.videoPath,
    '-i',
    pair.audioPath,
    '-map',
    '0:v:0',
    '-map',
    '1:a:0',
    '-c',
    'copy',
    '-shortest',
    ...(outputFormat === 'mp4' ? ['-movflags', '+faststart'] : []),
    pair.outputPath,
  ]

  emitMedia({ type: 'command', command: stringifyExecutableCommand(ffmpegPath, copyArgs) })
  emitMedia({ type: 'log', line: `[merge] stream copy -> ${parse(pair.outputPath).base}`, stream: 'system' })

  try {
    await runLoggedProcess(ffmpegPath, copyArgs, outputDir)
    return
  } catch (error) {
    if (outputFormat !== 'mp4' || mediaCancelled) {
      throw error
    }

    emitMedia({
      type: 'log',
      line: '[merge] stream copy failed; retrying MP4 merge with AAC audio transcode.',
      stream: 'stderr',
    })

    const fallbackArgs = [
      '-y',
      '-i',
      pair.videoPath,
      '-i',
      pair.audioPath,
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-shortest',
      '-movflags',
      '+faststart',
      pair.outputPath,
    ]

    emitMedia({ type: 'command', command: stringifyExecutableCommand(ffmpegPath, fallbackArgs) })
    emitMedia({ type: 'log', line: `[merge] AAC transcode fallback -> ${parse(pair.outputPath).base}`, stream: 'system' })
    await runLoggedProcess(ffmpegPath, fallbackArgs, outputDir)
  }
}

async function runLoggedProcess(executable: string, args: string[], cwd: string) {
  return await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env: {
        ...process.env,
        PATH: buildToolPathEnv(),
        DYLD_LIBRARY_PATH: buildDyldLibraryPathEnv(),
      },
    })

    activeMediaProcess = child
    const stdoutDecoder = createStreamDecoder()
    const stderrDecoder = createStreamDecoder()
    let stdoutBuffer = ''
    let stderrBuffer = ''

    const flush = (stream: 'stdout' | 'stderr', final = false) => {
      const current = stream === 'stdout' ? stdoutBuffer : stderrBuffer
      const lines = current.split(/\r?\n|\r/)
      const remainder = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        emitMedia({ type: 'log', line: trimmed, stream })
      }

      if (final && remainder.trim()) {
        emitMedia({ type: 'log', line: remainder.trim(), stream })
        if (stream === 'stdout') stdoutBuffer = ''
        else stderrBuffer = ''
        return
      }

      if (stream === 'stdout') stdoutBuffer = remainder
      else stderrBuffer = remainder
    }

    child.stdout.on('data', (chunk) => {
      stdoutBuffer += stdoutDecoder.write(chunk)
      flush('stdout')
    })

    child.stderr.on('data', (chunk) => {
      stderrBuffer += stderrDecoder.write(chunk)
      flush('stderr')
    })

    child.on('error', (error) => {
      activeMediaProcess = null
      reject(error)
    })

    child.on('close', (code) => {
      stdoutBuffer += stdoutDecoder.end()
      stderrBuffer += stderrDecoder.end()
      flush('stdout', true)
      flush('stderr', true)
      activeMediaProcess = null

      if (mediaCancelled) {
        reject(new Error('Media tool action was cancelled.'))
        return
      }

      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}`))
        return
      }

      resolve()
    })
  })
}

async function runMediaTool(request: MediaToolRequest) {
  const ffmpegPath = getFfmpegPath()
  const inspection = await inspectMedia(request.inputPath)
  const outputs: string[] = []

  mediaCancelled = false
  emitMedia({
    type: 'status',
    status: 'running',
    message: request.action === 'extractAudio' ? 'Extracting audio track...' : 'Extracting subtitle streams...',
  })

  if (request.action === 'extractAudio') {
    const audioExport = getAudioExportConfig(request.audioFormat)
    const outputPath = buildMediaOutputPath(request.inputPath, request.outputDir, ` - audio-${request.audioFormat}`, audioExport.extension)
    const args = ['-y', '-i', request.inputPath, '-vn', ...audioExport.args, outputPath]
    emitMedia({ type: 'command', command: stringifyExecutableCommand(ffmpegPath, args) })
    await runLoggedProcess(ffmpegPath, args, request.outputDir)
    outputs.push(outputPath)
  } else {
    const subtitleStreams = inspection.streams.filter((stream) => stream.codecType === 'subtitle')
    if (subtitleStreams.length === 0) {
      throw new Error('No subtitle streams were found in this file.')
    }

    const selectedSubtitleStreams =
      request.subtitleStreamIndexes.length > 0
        ? subtitleStreams.filter((stream) => request.subtitleStreamIndexes.includes(stream.index))
        : subtitleStreams

    if (selectedSubtitleStreams.length === 0) {
      throw new Error('No selected subtitle streams were found in this file.')
    }

    for (const stream of selectedSubtitleStreams) {
      if (mediaCancelled) {
        throw new Error('Media tool action was cancelled.')
      }

      const subtitleExport = getSubtitleExportConfig(request.subtitleFormat)
      const outputPath = buildMediaOutputPath(
        request.inputPath,
        request.outputDir,
        ` - subtitle-${String(stream.index).padStart(2, '0')}`,
        subtitleExport.extension,
      )
      const args = ['-y', '-i', request.inputPath, '-map', `0:${stream.index}`, ...subtitleExport.args, outputPath]
      emitMedia({ type: 'command', command: stringifyExecutableCommand(ffmpegPath, args) })
      await runLoggedProcess(ffmpegPath, args, request.outputDir)
      outputs.push(outputPath)
    }
  }

  emitMedia({
    type: 'status',
    status: 'success',
    message: request.action === 'extractAudio' ? 'Audio track exported.' : 'Subtitle streams exported.',
    outputs,
  })

  return outputs
}

async function runMediaMerge(request: MediaMergeRequest) {
  const ffmpegPath = getFfmpegPath()
  const outputs: string[] = []

  mediaCancelled = false
  emitMedia({ type: 'clear' })
  emitMedia({
    type: 'log',
    line: request.mode === 'selection'
      ? `[merge] scanning ${request.inputPaths.length} selected file(s).`
      : `[merge] scanning folder: ${request.inputDir ?? ''}`,
    stream: 'system',
  })
  emitMedia({
    type: 'status',
    status: 'running',
    message: request.mode === 'selection' ? 'Scanning selected files for media pairs...' : 'Scanning folder for media pairs...',
  })

  try {
    const mergePreview = await buildMediaMergePreview(request, { emitLogs: true, ensureOutputAvailable: true, respectCancellation: true })
    const { pairs } = mergePreview

    if (pairs.length === 0) {
      throw new Error('No matching video/audio pairs were found.')
    }

    emitMedia({ type: 'log', line: `[merge] ready to merge ${pairs.length} pair(s) as ${request.outputFormat.toUpperCase()}.`, stream: 'system' })

    for (const [index, pair] of pairs.entries()) {
      if (mediaCancelled) {
        throw new Error('Media tool action was cancelled.')
      }

      emitMedia({
        type: 'log',
        line: `[merge] [${index + 1}/${pairs.length}] ${parse(pair.videoPath).base} + ${parse(pair.audioPath).base} -> ${parse(pair.outputPath).base}`,
        stream: 'system',
      })
      emitMedia({
        type: 'status',
        status: 'running',
        message: `Merging media pair ${index + 1}/${pairs.length}: ${parse(pair.videoPath).base} (${pair.matchReason})`,
        progress: {
          current: index + 1,
          total: pairs.length,
          currentPath: pair.videoPath,
        },
      })

      await runMergePair(ffmpegPath, pair, request.outputFormat, request.outputDir)
      outputs.push(pair.outputPath)
      emitMedia({ type: 'log', line: `[merge] [${index + 1}/${pairs.length}] done: ${pair.outputPath}`, stream: 'stdout' })
      emitMedia({
        type: 'status',
        status: 'running',
        message: `Merged ${index + 1}/${pairs.length} media pair(s).`,
        outputs: [pair.outputPath],
        progress: {
          current: index + 1,
          total: pairs.length,
          currentPath: pair.videoPath,
        },
      })
    }

    emitMedia({
      type: 'status',
      status: 'success',
      message: `Merged ${outputs.length} video/audio pair(s).`,
      outputs,
    })

    return outputs
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Media merge failed.'
    emitMedia({
      type: 'status',
      status: message.toLowerCase().includes('cancelled') ? 'cancelled' : 'error',
      message,
    })
    throw error
  }
}

function refreshQueueSnapshot() {
  queueSnapshot = {
    ...queueSnapshot,
    pending: pendingJobs.length,
    running: activeJobs.size,
  }
}

function finishIfBatchDone() {
  refreshQueueSnapshot()
  const isDone = queueSnapshot.pending === 0 && queueSnapshot.running === 0
  emitQueue(
    isDone
      ? batchCancelled
        ? 'Queue cancelled.'
        : queueSnapshot.failed > 0
          ? 'Queue finished with some failed jobs.'
          : 'Queue finished.'
      : undefined,
  )

  if (isDone) {
    activeBatchRequest = null
    batchCancelled = false
  }
}

function scheduleNextJobs() {
  if (downloadSchedulerQueued) {
    return
  }

  downloadSchedulerQueued = true
  setImmediate(() => {
    downloadSchedulerQueued = false
    try {
      startNextJobs()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      emitLog(`[queue] scheduler failed: ${message}`, 'stderr')
      refreshQueueSnapshot()
      emitQueue('Queue scheduler hit an error.')
      finishIfBatchDone()
    }
  })
}

function startNextJobs() {
  if (!activeBatchRequest) {
    return
  }

  while (pendingJobs.length > 0 && activeJobs.size < queueSnapshot.concurrency) {
    const next = pendingJobs.shift()
    if (!next) {
      continue
    }

    const originalUrl = next.url
    const downloadUrl = normalizeDownloadUrl(originalUrl)

    try {
      const args = buildArgs(activeBatchRequest, downloadUrl, next.index)
      const command = stringifyCommand(args)
      const snapshot: JobSnapshot = {
        jobId: next.jobId,
        url: originalUrl,
        title: originalUrl,
        status: 'running',
        percent: null,
        downloaded: '--',
        total: '--',
        speed: '--',
        eta: '--',
        command,
        message: 'Download started.',
        index: next.index,
        totalJobs: next.totalJobs,
      }

      emitLog(`[job ${next.index}/${next.totalJobs}] ${originalUrl}`, 'system', next.jobId)
      const normalizationHint = getUrlNormalizationHint(originalUrl, downloadUrl)
      if (normalizationHint) {
        emitLog(normalizationHint, 'system', next.jobId)
      }
      const preflightHint = getPreflightDownloadHint(originalUrl)
      if (preflightHint) {
        emitLog(preflightHint, 'system', next.jobId)
      }
      const cookieFallbackHint = getCookieAutoFallbackHint(activeBatchRequest, downloadUrl, next.index)
      if (cookieFallbackHint) {
        emitLog(cookieFallbackHint, 'system', next.jobId)
      }
      emitLog(`> ${command}`, 'system', next.jobId)
      emitJob(snapshot)

      const ytDlpPath = getYtDlpPath()
      const child = spawn(ytDlpPath, args, {
        cwd: activeBatchRequest.outputDir,
        env: {
          ...process.env,
          PATH: buildToolPathEnv(),
          DYLD_LIBRARY_PATH: buildDyldLibraryPathEnv(),
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1',
        },
      })

      const stdoutDecoder = createStreamDecoder()
      const stderrDecoder = createStreamDecoder()

      const context: JobContext = {
        request: activeBatchRequest,
        jobId: next.jobId,
        url: downloadUrl,
        index: next.index,
        totalJobs: next.totalJobs,
        snapshot,
        command,
        process: child,
      }

      activeJobs.set(next.jobId, context)
      refreshQueueSnapshot()
      emitQueue()

      const handleLine = (rawLine: string, stream: 'stdout' | 'stderr') => {
        const line = rawLine.trim()
        if (!line) {
          return
        }

        const job = activeJobs.get(next.jobId)
        if (!job) {
          return
        }

        const progress = parseProgressLine(line)
        if (progress) {
          job.snapshot = {
            ...job.snapshot,
            ...progress,
            status: 'running',
            message: `Downloading at ${progress.speed}`,
          }
          emitJob(job.snapshot)
          return
        }

        if (line.startsWith('TITLE|')) {
          job.snapshot = {
            ...job.snapshot,
            title: line.replace('TITLE|', ''),
          }
          emitJob(job.snapshot)
          return
        }

        if (line.startsWith('FILEPATH|')) {
          job.snapshot = {
            ...job.snapshot,
            outputPath: line.replace('FILEPATH|', ''),
          }
          emitJob(job.snapshot)
          return
        }

        emitLog(line, stream, next.jobId)
        const hint = getDownloadHint(line, originalUrl)
        if (hint) {
          emitLog(hint, 'system', next.jobId)
        }
      }

      let stdoutBuffer = ''
      let stderrBuffer = ''

      const flushLines = (stream: 'stdout' | 'stderr') => {
        const currentBuffer = stream === 'stdout' ? stdoutBuffer : stderrBuffer
        const lines = currentBuffer.split(/[\r\n]+/)
        const endsWithLineBreak = /[\r\n]$/.test(currentBuffer)
        const remainder = endsWithLineBreak ? '' : lines.pop() ?? ''

        lines.forEach((line) => handleLine(line, stream))

        if (stream === 'stdout') {
          stdoutBuffer = remainder
        } else {
          stderrBuffer = remainder
        }
      }

      child.stdout.on('data', (chunk) => {
        stdoutBuffer += stdoutDecoder.write(chunk)
        flushLines('stdout')
      })

      child.stderr.on('data', (chunk) => {
        stderrBuffer += stderrDecoder.write(chunk)
        flushLines('stderr')
      })

      child.on('close', (code) => {
        stdoutBuffer += stdoutDecoder.end()
        stderrBuffer += stderrDecoder.end()

        if (stdoutBuffer.trim()) {
          handleLine(stdoutBuffer, 'stdout')
          stdoutBuffer = ''
        }

        if (stderrBuffer.trim()) {
          handleLine(stderrBuffer, 'stderr')
          stderrBuffer = ''
        }

        const job = activeJobs.get(next.jobId)
        if (!job) {
          return
        }

        const status: DownloadStatus = batchCancelled ? 'cancelled' : code === 0 ? 'success' : 'error'
        job.snapshot = {
          ...job.snapshot,
          status,
          exitCode: code ?? null,
          percent: status === 'success' ? 100 : job.snapshot.percent,
          message:
            status === 'cancelled'
              ? 'Cancelled.'
              : code === 0
                ? 'Finished.'
                : `Exited with code ${code ?? 'unknown'}.`,
        }
        emitJob(job.snapshot)

        activeJobs.delete(next.jobId)
        if (status === 'success') {
          queueSnapshot.completed += 1
        } else if (status === 'cancelled') {
          queueSnapshot.cancelled += 1
        } else {
          queueSnapshot.failed += 1
        }

        refreshQueueSnapshot()
        emitQueue()
        scheduleNextJobs()
        finishIfBatchDone()
      })

      child.on('error', (error) => {
        const job = activeJobs.get(next.jobId)
        if (!job) {
          return
        }

        job.snapshot = {
          ...job.snapshot,
          status: 'error',
          exitCode: null,
          message: `Failed to start: ${error.message}`,
        }
        emitJob(job.snapshot)
        emitLog(`Failed to start: ${error.message}`, 'stderr', next.jobId)

        activeJobs.delete(next.jobId)
        queueSnapshot.failed += 1
        refreshQueueSnapshot()
        emitQueue()
        scheduleNextJobs()
        finishIfBatchDone()
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const failedSnapshot: JobSnapshot = {
        jobId: next.jobId,
        url: originalUrl,
        title: originalUrl,
        status: 'error',
        percent: null,
        downloaded: '--',
        total: '--',
        speed: '--',
        eta: '--',
        exitCode: null,
        message: `Failed before start: ${message}`,
        index: next.index,
        totalJobs: next.totalJobs,
      }
      queueSnapshot.failed += 1
      emitJob(failedSnapshot)
      emitLog(`Failed before start: ${message}`, 'stderr', next.jobId)
      refreshQueueSnapshot()
      emitQueue()
    }
  }

  finishIfBatchDone()
}

function createAppWindow(hash = '') {
  const windowIconPath = getWindowIconPath()
  const win = new BrowserWindow({
    width: 1500,
    height: 1000,
    minWidth: 1280,
    minHeight: 840,
    backgroundColor: '#09111f',
    title: APP_DISPLAY_NAME,
    ...(windowIconPath ? { icon: windowIconPath } : {}),
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const devServerUrl = process.env.VITE_DEV_SERVER_URL
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      void shell.openExternal(assertSafeExternalUrl(url))
    } catch (error) {
      console.error('[electron] blocked window.open', error)
    }
    return { action: 'deny' }
  })
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl) => {
    console.error('[electron] did-fail-load', { errorCode, errorDescription, validatedUrl })
  })
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[electron] render-process-gone', details)
  })
  win.webContents.on('console-message', (_event, detailsOrLevel: unknown, message?: string, line?: number, sourceId?: string) => {
    if (app.isPackaged) {
      return
    }
    if (
      typeof detailsOrLevel === 'object'
      && detailsOrLevel !== null
      && 'message' in detailsOrLevel
    ) {
      const details = detailsOrLevel as {
        level?: number
        message?: string
        lineNumber?: number
        sourceId?: string
      }
      console.log('[renderer]', {
        level: details.level,
        message: details.message,
        line: details.lineNumber,
        sourceId: details.sourceId,
      })
      return
    }

    console.log('[renderer]', {
      level: detailsOrLevel,
      message,
      line,
      sourceId,
    })
  })

  if (devServerUrl) {
    void win.loadURL(`${devServerUrl}${hash}`)
    if (!hash && shouldOpenDevTools()) {
      win.webContents.openDevTools({ mode: 'detach' })
    }
  } else {
    void win.loadFile(join(rendererDist, 'index.html'), hash ? { hash: hash.slice(1) } : undefined)
  }

  return win
}

function createWindow() {
  mainWindow = createAppWindow()
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createMediaToolsWindow() {
  if (mediaToolsWindow && !mediaToolsWindow.isDestroyed()) {
    mediaToolsWindow.focus()
    return mediaToolsWindow
  }

  mediaToolsWindow = createAppWindow('#media-tools')
  mediaToolsWindow.setTitle(`${APP_DISPLAY_NAME} - Tools`)
  mediaToolsWindow.setMinimumSize(1100, 760)
  mediaToolsWindow.on('closed', () => {
    mediaToolsWindow = null
  })

  return mediaToolsWindow
}

app.whenReady().then(() => {
  applyDockIcon()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

ipcMain.handle('paths:get', async () => ({
  ytDlpPath: getYtDlpPath(),
  ytDlpVersion: await getCurrentYtDlpVersion(),
  ffmpegPath: getFfmpegPath(),
  ffprobePath: getFfprobePath(),
  denoPath: getDenoPath(),
  denoVersion: await getCurrentDenoVersion(),
  defaultDownloadDir: resolveDefaultDownloads(),
  envName: getEnvironmentLabel(),
  cookiesDir: getCookiesDir(),
}))

ipcMain.handle('cookies:list', () => listCookieFilesRecursive(getCookiesDir()))

ipcMain.handle('cookies:importZip', async (event) => {
  const result = await dialog.showOpenDialog(getHostWindow(event.sender), {
    defaultPath: getCookiesDir(),
    properties: ['openFile'],
    filters: [
      { name: 'Media Dock cookie export', extensions: ['zip'] },
      { name: 'All files', extensions: ['*'] },
    ],
  })

  if (result.canceled || !result.filePaths[0]) {
    return null
  }

  return await importCookieZip(result.filePaths[0])
})

ipcMain.handle('self-check:get', () => ({
  items: getSelfCheckItems(),
  toolsSource: getToolsSource(),
}))

ipcMain.handle('updates:check', async () => {
  return await checkForUpdates()
})

ipcMain.handle('updates:downloadLatest', async () => {
  return await downloadLatestUpdate()
})

ipcMain.handle('bilibili:resolveSeason', async (_event, sourceUrl: string) => {
  return await resolveBilibiliSeason(sourceUrl)
})

ipcMain.handle('collections:resolve', async (event, sourceUrl: string) => {
  const log: CollectionLogger = (line) => {
    if (!event.sender.isDestroyed()) {
      event.sender.send('collections:log', { line })
    }
  }
  return await resolveMediaCollection(sourceUrl, log)
})

ipcMain.handle('runtime:installDeno', async () => {
  try {
    return await installDenoRuntime()
  } catch (error) {
    emitRuntimeToolProgress({
      tool: 'deno',
      stage: 'error',
      message: error instanceof Error ? error.message : 'Deno install failed.',
      percent: null,
    })
    throw error
  }
})

ipcMain.handle('runtime:checkToolUpdates', async () => {
  return await checkRuntimeToolUpdates()
})

ipcMain.handle('runtime:updateYtDlp', async () => {
  try {
    return await installYtDlpRuntime()
  } catch (error) {
    emitRuntimeToolProgress({
      tool: 'yt-dlp',
      stage: 'error',
      message: error instanceof Error ? error.message : 'yt-dlp update failed.',
      percent: null,
    })
    throw error
  }
})

ipcMain.handle('window:openMediaTools', () => {
  createMediaToolsWindow()
})

ipcMain.handle('subtitle-cleanup:get-config', () => loadSubtitleCleanupConfig())

ipcMain.handle('subtitle-cleanup:save-config', (_event, config: Partial<SubtitleCleanupConfig>) => {
  return saveSubtitleCleanupConfig(config)
})

ipcMain.handle('subtitle-cleanup:list-models', async (_event, config: Pick<SubtitleCleanupConfig, 'baseUrl' | 'apiKey'>) => {
  return await listOpenAiModels(config)
})

ipcMain.handle('subtitle-cleanup:test-connection', async (_event, config: SubtitleCleanupConfig) => {
  return await testOpenAiModelConnection(config)
})

ipcMain.handle('dialog:pickDirectory', async (event, currentPath?: string) => {
  const result = await dialog.showOpenDialog(getHostWindow(event.sender), {
    defaultPath: resolveDialogStartDirectory(currentPath),
    properties: ['openDirectory', 'createDirectory'],
  })

  if (result.canceled) {
    return null
  }
  return result.filePaths[0] ?? null
})

ipcMain.handle('dialog:pickMediaFile', async (event, currentPath?: string) => {
  const result = await dialog.showOpenDialog(getHostWindow(event.sender), {
    defaultPath: resolveDialogStartDirectory(currentPath),
    properties: ['openFile'],
    filters: [
      { name: 'Media files', extensions: ['mp4', 'mkv', 'webm', 'mov', 'm4v', 'avi', 'flv', 'ts', 'm4s', 'mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'opus'] },
      { name: 'All files', extensions: ['*'] },
    ],
  })

  if (result.canceled) {
    return null
  }

  return result.filePaths[0] ?? null
})

ipcMain.handle('dialog:pickMediaFiles', async (event, currentPath?: string) => {
  const result = await dialog.showOpenDialog(getHostWindow(event.sender), {
    defaultPath: resolveDialogStartDirectory(currentPath),
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Media files', extensions: ['mp4', 'mkv', 'webm', 'mov', 'm4v', 'avi', 'flv', 'ts', 'm4s', 'mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'opus'] },
      { name: 'All files', extensions: ['*'] },
    ],
  })

  if (result.canceled) {
    return []
  }

  return result.filePaths
})

ipcMain.handle('dialog:pickSubtitleFile', async (event, currentPath?: string) => {
  const result = await dialog.showOpenDialog(getHostWindow(event.sender), {
    defaultPath: resolveDialogStartDirectory(currentPath),
    properties: ['openFile'],
    filters: [
      { name: 'Subtitle files', extensions: ['srt', 'vtt', 'ass', 'ssa', 'txt'] },
      { name: 'All files', extensions: ['*'] },
    ],
  })

  if (result.canceled) {
    return null
  }

  return result.filePaths[0] ?? null
})

ipcMain.handle('shell:openPath', async (_event, targetPath: string) => {
  if (!targetPath) {
    return
  }
  await shell.openPath(assertSafeLocalPath(targetPath))
})

ipcMain.handle('shell:showItemInFolder', async (_event, targetPath: string) => {
  if (!targetPath) {
    return
  }
  shell.showItemInFolder(assertSafeLocalPath(targetPath))
})

ipcMain.handle('shell:openExternal', async (_event, targetUrl: string) => {
  if (!targetUrl) {
    return
  }
  await shell.openExternal(assertSafeExternalUrl(targetUrl))
})

ipcMain.handle('clipboard:writeText', (_event, text: string) => {
  clipboard.writeText(String(text ?? ''))
  return true
})

ipcMain.handle('logs:exportText', async (event, payload: { defaultName?: string; content: string }) => {
  const defaultName = (payload.defaultName || `media-dock-log-${Date.now()}.txt`)
    .split('')
    .map((char) => (char.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(char) ? '-' : char))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  const result = await dialog.showSaveDialog(getHostWindow(event.sender), {
    defaultPath: join(resolveDefaultDownloads(), defaultName.endsWith('.txt') ? defaultName : `${defaultName}.txt`),
    filters: [{ name: 'Text log', extensions: ['txt', 'log'] }],
  })

  if (result.canceled || !result.filePath) {
    return null
  }

  writeFileSync(result.filePath, String(payload.content ?? '').replace(/\r?\n/g, '\r\n'), 'utf8')
  return result.filePath
})

ipcMain.handle('config:export', async (_event, config: unknown) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: join(resolveDefaultDownloads(), 'media-dock-config.json'),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })

  if (result.canceled || !result.filePath) {
    return null
  }

  writeFileSync(result.filePath, JSON.stringify(config, null, 2), 'utf8')
  return result.filePath
})

ipcMain.handle('config:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    defaultPath: resolveDefaultDownloads(),
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  })

  if (result.canceled || !result.filePaths[0]) {
    return null
  }

  const raw = readFileSync(result.filePaths[0], 'utf8')
  return JSON.parse(raw)
})

ipcMain.handle('media:inspect', async (_event, inputPath: string) => {
  if (!inputPath || !existsSync(inputPath)) {
    throw new Error(`Media file does not exist: ${inputPath}`)
  }

  return await inspectMedia(inputPath)
})

ipcMain.handle('media:cancel', () => {
  mediaCancelled = true
  subtitleCleanupCancelled = true
  terminateProcess(activeMediaProcess, 'media')
  activeSubtitleCleanupAbort?.abort()
  activeSubtitleCleanupAbort = null
  emitMedia({
    type: 'status',
    status: 'cancelled',
    message: 'Current media task was cancelled.',
  })
})

ipcMain.handle('media:run', async (_event, request: MediaToolRequest) => {
  if (activeMediaProcess) {
    throw new Error('Another media tool action is already running.')
  }
  if (!existsSync(getFfmpegPath())) {
    throw new Error(`ffmpeg was not found at ${getFfmpegPath()}`)
  }
  if (!request.inputPath || !existsSync(request.inputPath)) {
    throw new Error(`Media file does not exist: ${request.inputPath}`)
  }
  if (!request.outputDir || !existsSync(request.outputDir) || !statSync(request.outputDir).isDirectory()) {
    throw new Error(`Output directory does not exist: ${request.outputDir}`)
  }

  return await runMediaTool(request)
})

ipcMain.handle('media:merge-preview', async (_event, request: MediaMergeRequest) => {
  const normalizedRequest = {
    ...request,
    inputPaths: Array.isArray(request.inputPaths) ? request.inputPaths : [],
    outputDir: request.outputDir ?? '',
  }

  if (!existsSync(getFfprobePath())) {
    throw new Error(`ffprobe was not found at ${getFfprobePath()}`)
  }
  if (normalizedRequest.mode === 'selection') {
    if (normalizedRequest.inputPaths.length === 0) {
      return await buildMediaMergePreview(normalizedRequest, { emitLogs: false, ensureOutputAvailable: false, respectCancellation: false })
    }
  } else if (!normalizedRequest.inputDir || !existsSync(normalizedRequest.inputDir) || !statSync(normalizedRequest.inputDir).isDirectory()) {
    throw new Error(`Input directory does not exist: ${normalizedRequest.inputDir ?? ''}`)
  }

  return await buildMediaMergePreview(normalizedRequest, { emitLogs: false, ensureOutputAvailable: false, respectCancellation: false })
})

ipcMain.handle('media:merge', async (_event, request: MediaMergeRequest) => {
  const normalizedRequest = {
    ...request,
    inputPaths: Array.isArray(request.inputPaths) ? request.inputPaths : [],
  }

  if (activeMediaProcess || activeSubtitleCleanupAbort) {
    throw new Error('Another media tool action is already running.')
  }
  if (!existsSync(getFfmpegPath())) {
    throw new Error(`ffmpeg was not found at ${getFfmpegPath()}`)
  }
  if (!normalizedRequest.outputDir || !existsSync(normalizedRequest.outputDir) || !statSync(normalizedRequest.outputDir).isDirectory()) {
    throw new Error(`Output directory does not exist: ${normalizedRequest.outputDir}`)
  }
  if (normalizedRequest.mode === 'selection') {
    if (normalizedRequest.inputPaths.length === 0) {
      throw new Error('Choose at least one media file first.')
    }
    for (const inputPath of normalizedRequest.inputPaths) {
      if (!inputPath || !existsSync(inputPath)) {
        throw new Error(`Selected media file does not exist: ${inputPath}`)
      }
    }
  } else if (!normalizedRequest.inputDir || !existsSync(normalizedRequest.inputDir) || !statSync(normalizedRequest.inputDir).isDirectory()) {
    throw new Error(`Input directory does not exist: ${normalizedRequest.inputDir ?? ''}`)
  }

  return await runMediaMerge(normalizedRequest)
})

ipcMain.handle('subtitle-cleanup:run', async (_event, request: SubtitleCleanupRunRequest) => {
  if (activeMediaProcess || activeSubtitleCleanupAbort) {
    throw new Error('Another media tool action is already running.')
  }
  if (!request.outputDir || !existsSync(request.outputDir) || !statSync(request.outputDir).isDirectory()) {
    throw new Error(`Output directory does not exist: ${request.outputDir}`)
  }
  if (request.mode === 'single') {
    if (!request.inputPath || !existsSync(request.inputPath)) {
      throw new Error(`Subtitle file does not exist: ${request.inputPath ?? ''}`)
    }
    if (!isSubtitleFile(request.inputPath)) {
      throw new Error(`Unsupported subtitle file: ${request.inputPath}`)
    }
  } else if (!request.inputDir || !existsSync(request.inputDir) || !statSync(request.inputDir).isDirectory()) {
    throw new Error(`Subtitle folder does not exist: ${request.inputDir ?? ''}`)
  }

  try {
    return await runSubtitleCleanup(request)
  } finally {
    activeSubtitleCleanupAbort = null
    subtitleCleanupCancelled = false
  }
})

ipcMain.handle('download:cancel', () => {
  batchCancelled = true

  for (const [, job] of activeJobs) {
    emitLog('Cancelling this job...', 'system', job.jobId)
    terminateProcess(job.process, `job ${job.jobId}`)
  }

  if (pendingJobs.length > 0) {
    queueSnapshot.cancelled += pendingJobs.length
    pendingJobs = []
  }

  refreshQueueSnapshot()
  emitQueue('Cancelling active jobs...')
})

ipcMain.handle('download:start', async (_event, request: DownloadRequest) => {
  const urls = request.urls.map((item) => item.trim()).filter(Boolean)
  const ytDlpPath = getYtDlpPath()
  if (activeJobs.size > 0 || pendingJobs.length > 0) {
    throw new Error('A download queue is already running.')
  }
  if (!existsSync(ytDlpPath)) {
    throw new Error(`yt-dlp was not found at ${ytDlpPath}`)
  }
  if (!statSync(request.outputDir).isDirectory()) {
    throw new Error(`Output directory does not exist: ${request.outputDir}`)
  }
  if (request.cookieFile && !existsSync(request.cookieFile)) {
    throw new Error(`Cookie file does not exist: ${request.cookieFile}`)
  }
  if (!request.cookieFile) {
    const missingCookieFiles = uniquePaths((request.urlCookieFiles ?? []).filter((value): value is string => Boolean(value?.trim())))
      .filter((cookiePath) => !existsSync(cookiePath))
    if (missingCookieFiles.length > 0) {
      throw new Error(`Cookie file does not exist: ${missingCookieFiles[0]}`)
    }
  }
  if (urls.length === 0) {
    throw new Error('No URLs were provided.')
  }

  activeBatchRequest = request
  batchCancelled = false
  pendingJobs = urls.map((url, index) => ({
    jobId: `${Date.now()}-${index + 1}`,
    url,
    index: index + 1,
    totalJobs: urls.length,
  }))
  queueSnapshot = {
    total: urls.length,
    pending: pendingJobs.length,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    concurrency: Math.max(1, Math.min(request.concurrency, 3)),
  }

  emitQueue(`Queue started with ${urls.length} job(s).`)
  scheduleNextJobs()
})
