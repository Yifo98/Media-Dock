import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import MediaToolsView from './MediaToolsView'
import { appApi } from './services/appApi'
import { readJsonStorage, removeStorageItem, writeJsonStorage } from './services/localStore'
import { getThemeLabel, isTheme, THEME_OPTIONS, type Theme } from './themeOptions'

type Language = 'zh' | 'en'
type ActiveWorkspace = 'download' | 'media'
type ExtraPresetId =
  | 'noPlaylist'
  | 'embedMetadata'
  | 'writeSubs'
  | 'writeAutoSubs'
  | 'subtitleOnly'
  | 'splitAudioTrack'
  | 'embedThumbnail'
  | 'writeThumbnail'
  | 'writeDescription'
  | 'writeInfoJson'

type CookieTargetId =
  | 'bilibili'
  | 'youtube'
  | 'youku'
  | 'iqiyi'
  | 'douyin'
  | 'tencentVideo'
  | 'xiaohongshu'

type HistoryItem = {
  id: string
  urls: string[]
  mode: DownloadMode
  outputDir: string
  status: DownloadStatus
  outputPath?: string
  finishedAt: string
}

type ActiveQueueSnapshot = {
  mode: DownloadMode
  outputDir: string
}

type StoredPreferences = {
  outputDir: string
  mode: DownloadMode
  audioFormat: AudioFormat
  audioQuality: AudioQuality
  videoPreset: VideoPreset
  language: Language
  theme: Theme
  cookieFile: string
  enabledExtraPresets: ExtraPresetId[]
}

const STORAGE_KEY = 'yt-dlp-studio.preferences'
const HISTORY_KEY = 'yt-dlp-studio.history'

const DEFAULT_PREFS: StoredPreferences = {
  outputDir: '',
  mode: 'video',
  audioFormat: 'mp3',
  audioQuality: 'best',
  videoPreset: 'best',
  language: 'zh',
  theme: 'graphite',
  cookieFile: '',
  enabledExtraPresets: [],
}

const EXTRA_PRESETS: Record<Language, Record<ExtraPresetId, { label: string; desc: string; args: string[] }>> = {
  zh: {
    noPlaylist: { label: '只下当前视频', desc: '链接带播放列表时，只抓这一条。', args: ['--no-playlist'] },
    embedMetadata: { label: '写入元数据', desc: '把标题和作者写进文件。', args: ['--embed-metadata'] },
    writeSubs: { label: '字幕分离', desc: '把字幕单独下载成文件，适合后期整理。', args: ['--write-subs', '--sub-langs', 'all'] },
    writeAutoSubs: { label: '自动字幕', desc: '站点没有人工字幕时，尝试抓自动字幕。', args: ['--write-auto-subs', '--sub-langs', 'all'] },
    subtitleOnly: { label: '仅导出字幕', desc: '只拿字幕文件，不下载音视频本体。', args: ['--skip-download', '--write-subs', '--write-auto-subs', '--sub-langs', 'all'] },
    splitAudioTrack: { label: '音轨分离', desc: '保留视频的同时，额外导出一份 MP3 音频。', args: ['-k', '--extract-audio', '--audio-format', 'mp3', '--audio-quality', '0'] },
    embedThumbnail: { label: '嵌入封面', desc: '把封面写进媒体文件。', args: ['--embed-thumbnail'] },
    writeThumbnail: { label: '导出封面', desc: '把封面图片单独保存出来。', args: ['--write-thumbnail'] },
    writeDescription: { label: '导出简介', desc: '把视频简介或说明文字保存成文本。', args: ['--write-description'] },
    writeInfoJson: { label: '导出信息 JSON', desc: '把标题、作者、时长等详情导出成 JSON。', args: ['--write-info-json'] },
  },
  en: {
    noPlaylist: { label: 'Only current video', desc: 'Ignore playlist params and download only the current item.', args: ['--no-playlist'] },
    embedMetadata: { label: 'Embed metadata', desc: 'Write title and uploader info into the file.', args: ['--embed-metadata'] },
    writeSubs: { label: 'Subtitle split', desc: 'Download subtitle files separately for later use.', args: ['--write-subs', '--sub-langs', 'all'] },
    writeAutoSubs: { label: 'Auto subtitles', desc: 'Try auto-generated subtitles when manual ones are missing.', args: ['--write-auto-subs', '--sub-langs', 'all'] },
    subtitleOnly: { label: 'Subtitles only', desc: 'Export subtitle files without downloading the media itself.', args: ['--skip-download', '--write-subs', '--write-auto-subs', '--sub-langs', 'all'] },
    splitAudioTrack: { label: 'Split audio track', desc: 'Keep the video and export an extra MP3 audio copy.', args: ['-k', '--extract-audio', '--audio-format', 'mp3', '--audio-quality', '0'] },
    embedThumbnail: { label: 'Embed thumbnail', desc: 'Store the cover image in the file.', args: ['--embed-thumbnail'] },
    writeThumbnail: { label: 'Export thumbnail', desc: 'Save the cover image as a separate file.', args: ['--write-thumbnail'] },
    writeDescription: { label: 'Export description', desc: 'Save the video description or notes as text.', args: ['--write-description'] },
    writeInfoJson: { label: 'Export info JSON', desc: 'Save title, uploader, duration, and other metadata as JSON.', args: ['--write-info-json'] },
  },
}

const COOKIE_TARGETS: Array<{
  id: CookieTargetId
  zhName: string
  enName: string
  urlMarkers: string[]
  preferredMarkers: string[]
  relatedMarkers: string[]
}> = [
  {
    id: 'bilibili',
    zhName: 'B 站',
    enName: 'Bilibili',
    urlMarkers: ['bilibili.com', 'bilibili.cn', 'b23.tv', 'biligame.com'],
    preferredMarkers: ['by-service/bilibili-b-site.cookies.txt', 'bilibili-b-site.cookies.txt'],
    relatedMarkers: ['bilibili', 'biligame', 'b23.tv'],
  },
  {
    id: 'youtube',
    zhName: 'YouTube',
    enName: 'YouTube',
    urlMarkers: ['youtube.com', 'youtu.be', 'googlevideo.com'],
    preferredMarkers: ['by-service/youtube.cookies.txt', 'youtube.cookies.txt'],
    relatedMarkers: ['youtube.com', 'youtube', 'google.com'],
  },
  {
    id: 'youku',
    zhName: '优酷',
    enName: 'Youku',
    urlMarkers: ['youku.com', 'tudou.com', 'soku.com'],
    preferredMarkers: ['by-service/youku.cookies.txt', 'youku.cookies.txt'],
    relatedMarkers: ['youku.com', 'youku', 'tudou.com', 'soku.com'],
  },
  {
    id: 'iqiyi',
    zhName: '爱奇艺',
    enName: 'iQIYI',
    urlMarkers: ['iqiyi.com', 'pps.tv'],
    preferredMarkers: ['by-service/iqiyi.cookies.txt', 'iqiyi.cookies.txt'],
    relatedMarkers: ['iqiyi.com', 'iqiyi', 'pps.tv'],
  },
  {
    id: 'douyin',
    zhName: '抖音',
    enName: 'Douyin',
    urlMarkers: ['douyin.com', 'iesdouyin.com'],
    preferredMarkers: ['by-service/douyin.cookies.txt', 'douyin.cookies.txt'],
    relatedMarkers: ['douyin.com', 'douyin', 'iesdouyin.com'],
  },
  {
    id: 'tencentVideo',
    zhName: '腾讯视频',
    enName: 'Tencent Video',
    urlMarkers: ['v.qq.com', 'video.qq.com'],
    preferredMarkers: ['by-service/tencent-video.cookies.txt', 'tencent-video.cookies.txt'],
    relatedMarkers: ['tencent-video', 'qq.com'],
  },
  {
    id: 'xiaohongshu',
    zhName: '小红书',
    enName: 'Xiaohongshu',
    urlMarkers: ['xiaohongshu.com', 'xhslink.com'],
    preferredMarkers: ['by-service/xiaohongshu.cookies.txt', 'xiaohongshu.cookies.txt'],
    relatedMarkers: ['xiaohongshu.com', 'xiaohongshu', 'xhslink.com'],
  },
]

function getText(language: Language) {
  return language === 'zh'
    ? {
        heroTitle: '媒体中枢。',
        heroCopy: '把链接采集、认证文件、合并和整理动作收进一个轻量工作台。',
        status: '状态',
        compatibility: '兼容性',
        refreshTools: '刷新环境',
        refreshingTools: '刷新中...',
        refreshedWithDeno: '环境已刷新，已检测到 Deno。',
        refreshedWithoutDeno: '环境已刷新，暂时还没检测到 Deno。',
        refreshFailed: '环境刷新失败。',
        checkUpdates: '检查更新',
        checkingUpdates: '检查中...',
        updateReady: '发现新版本',
        updateCurrent: '当前版本',
        updateLatest: '最新版本',
        updateNone: '当前已是最新版本。',
        updateUnknown: '还没有检查更新。',
        updateDownload: '下载更新',
        updateDownloading: '下载中...',
        updateDownloaded: '更新包已下载。',
        updateMissingAsset: '没有找到适合当前系统的更新包。',
        installDenoAuto: '自动安装 Deno',
        installingDeno: '安装中...',
        denoInstalled: 'Deno 已安装完成。',
        denoInstallAutoHint: '检测到 Deno 缺失时，可自动下载官方 Deno zip，并放入同级数据目录的 tools/bin。',
        workspace: '工作区',
        mediaTools: '媒体工具',
        engine: '核心工具',
        downloadCore: '下载核心',
        mediaCore: '媒体核心',
        mediaProbe: '媒体探测',
        authDir: '认证目录',
        loading: '加载中...',
        loadingPath: '正在读取核心工具路径...',
        basicMode: '基础模式',
        readyForYoutube: 'YouTube 已优化',
        denoReady: '已检测到 Deno，YouTube 解析更稳。',
        denoMissing: '未检测到 Deno，多数站点仍可用。',
        downloadPanel: '下载面板',
        downloadPanelHint: '一行一个链接，默认顺序下载。',
        urls: '链接列表',
        urlsPlaceholder: '每行一个链接',
        urlsHint: '支持一次粘贴多行链接，系统会自动拆成多条。',
        addLink: '添加链接',
        clearLinks: '清空链接',
        outputFolder: '输出目录',
        browse: '选择目录',
        openCookiesDir: '打开 cookies 目录',
        mode: '下载模式',
        video: '视频',
        audio: '音频',
        sequentialHint: '现在默认按顺序下载，不再额外让你选队列模式。',
        videoPreset: '画质策略',
        videoPresetHint: '默认自动最佳；B 站 4K 取决于源片、登录态和账号权限。',
        best: '自动最佳',
        p2160: '最高 4K',
        p1080: '最高 1080p',
        p720: '最高 720p',
        p480: '最高 480p',
        audioFormat: '音频格式',
        audioQuality: '音频质量',
        audioQualityHint: '只在音频模式生效。',
        cookieFile: '认证文件',
        cookieAuto: '不使用 cookies 文件',
        cookieHint: '先粘贴链接，软件会按 B 站、YouTube、优酷等站点提示推荐 Cookie。',
        cookieFallback: '只选择目标站专用 Cookie，可以减少无关登录态暴露。',
        cookieAdvisor: 'Cookie 推荐',
        cookieAdvisorIdle: '粘贴链接后，这里会提示应该选哪个 Cookie。',
        cookieAdvisorUse: '使用推荐 Cookie',
        cookieAdvisorCurrent: '当前已选择推荐 Cookie。',
        cookieAdvisorNone: '这个链接暂时不需要专用 Cookie；遇到会员、登录态或 412/403 错误时，再选择目标站 Cookie。',
        cookieAdvisorDetected: '检测到 {service} 链接，推荐使用 {file}。这样可以排除其他不相关 Cookie。',
        cookieAdvisorMissing: '检测到 {service} 链接，但没有找到专用 Cookie。请把对应 by-service 文件放进认证目录。',
        cookieAdvisorMismatch: '当前选择不像 {service} 专用 Cookie，可能会无效或带入过多无关登录态。',
        cookieMeta: '{count} 条 Cookie · {domains}',
        cookieExpiredWarning: '有 {count} 条 Cookie 已过期：{names}。登录态可能已失效，请重新导出 cookies.txt。',
        cookieExpiringSoonWarning: '有 {count} 条 Cookie 24 小时内将过期：{names}。',
        extraOptions: '下载附加项',
        extraOptionsHint: '可选。用于给链接下载追加字幕、封面、简介、仅当前视频等参数；不选就是默认下载。',
        extraOptionsSummary: '已启用参数',
        extraOptionsEmpty: '未启用附加项，下载会按默认参数执行。',
        advancedArgs: '高级附加参数',
        extraArgsPlaceholder: '例如：--restrict-filenames',
        rememberArgs: '记住高级附加参数',
        start: '开始',
        cancel: '停止全部',
        openFolder: '打开目录',
        telemetry: '实时信息',
        telemetryHint: '这里能看到总进度、单任务进度、速度和 ETA。',
        queueSummary: '任务总览',
        queueProgress: '队列进度',
        queueProgressHint: '总进度会把当前下载中的实时百分比也算进去，不再只看完成数。',
        taskList: '任务清单',
        taskListHint: '每个小格对应一个链接，完成后会亮起，出错会标红。',
        taskListIdle: '粘贴链接后会生成任务格子。',
        taskTotal: '总数',
        liveDownload: '当前下载中',
        liveDownloadHint: '像 Claude 的状态面板一样，先盯住最关键的那条任务。',
        liveDownloadIdle: '还没有正在进行的下载任务。',
        waiting: '等待中',
        pending: '待开始',
        running: '进行中',
        done: '已完成',
        failed: '失败',
        cancelled: '已取消',
        activeJobs: '任务进度',
        activeJobsHint: '每张卡片代表一个链接。',
        downloaded: '已下载',
        total: '总量',
        eta: '剩余',
        currentCommand: '当前命令',
        ffmpegPath: 'FFmpeg 路径',
        logs: '日志',
        logsHint: '保留最近 600 行输出。',
        noLogs: '还没有输出。',
        recentJobs: '最近任务',
        recentJobsHint: '点卡片可回填链接和目录。',
        clearHistory: '清空记录',
        noHistory: '还没有历史任务。',
        audioExtract: '音频提取',
        videoDownload: '视频下载',
        language: '语言',
        theme: '背景',
        statusIdle: '待命',
        statusRunning: '运行中',
        statusDone: '完成',
        statusError: '错误',
        statusCancelled: '已取消',
        bootstrapError: 'window.appApi 不可用，preload 没有挂上。',
        startHint: '先粘贴至少一个链接吧。',
        queuePrepared: '已准备好 {count} 个下载链接。',
        currentCommandPlaceholder: '任务启动后，这里会显示最新命令。',
        openFile: '打开所在文件夹',
        copiedFromHistory: '已从历史记录回填。',
      }
    : {
        heroTitle: 'Media Hub.',
        heroCopy: 'A compact workspace for link capture, auth files, merges, and everyday media cleanup.',
        status: 'Status',
        compatibility: 'Compatibility',
        refreshTools: 'Refresh runtime',
        refreshingTools: 'Refreshing...',
        refreshedWithDeno: 'Runtime refreshed. Deno is now available.',
        refreshedWithoutDeno: 'Runtime refreshed. Deno is still missing.',
        refreshFailed: 'Failed to refresh runtime.',
        checkUpdates: 'Check updates',
        checkingUpdates: 'Checking...',
        updateReady: 'Update available',
        updateCurrent: 'Current version',
        updateLatest: 'Latest version',
        updateNone: 'You are on the latest version.',
        updateUnknown: 'Updates have not been checked yet.',
        updateDownload: 'Download update',
        updateDownloading: 'Downloading...',
        updateDownloaded: 'Update package downloaded.',
        updateMissingAsset: 'No update package matched this platform.',
        installDenoAuto: 'Install Deno automatically',
        installingDeno: 'Installing...',
        denoInstalled: 'Deno has been installed.',
        denoInstallAutoHint: 'When Deno is missing, download the official Deno zip and place it in the sibling data folder tools/bin.',
        workspace: 'Workspace',
        mediaTools: 'Media tools',
        engine: 'Core tools',
        downloadCore: 'Download core',
        mediaCore: 'Media core',
        mediaProbe: 'Media probe',
        authDir: 'Auth folder',
        loading: 'Loading...',
        loadingPath: 'Reading core tool path...',
        basicMode: 'Basic mode',
        readyForYoutube: 'Ready for YouTube',
        denoReady: 'Deno detected. YouTube support should be more stable.',
        denoMissing: 'Deno not found. Most sites still work.',
        downloadPanel: 'Download panel',
        downloadPanelHint: 'One URL per line. Downloads run sequentially by default.',
        urls: 'URL list',
        urlsPlaceholder: 'One URL per line',
        urlsHint: 'Paste multiple lines at once and they will be split into separate URLs.',
        addLink: 'Add link',
        clearLinks: 'Clear links',
        outputFolder: 'Output folder',
        browse: 'Browse',
        openCookiesDir: 'Open cookies folder',
        mode: 'Mode',
        video: 'Video',
        audio: 'Audio',
        sequentialHint: 'Queue mode has been removed from the UI. Downloads are sequential by default.',
        videoPreset: 'Quality policy',
        videoPresetHint: 'Best available by default. Bilibili 4K still depends on the source, login state, and account permissions.',
        best: 'Best available',
        p2160: 'Up to 4K',
        p1080: 'Up to 1080p',
        p720: 'Up to 720p',
        p480: 'Up to 480p',
        audioFormat: 'Audio format',
        audioQuality: 'Audio quality',
        audioQualityHint: 'Only used in audio mode.',
        cookieFile: 'Auth file',
        cookieAuto: 'Do not use a cookie file',
        cookieHint: 'Paste a link first and the app will suggest the right cookie file for Bilibili, YouTube, Youku, and similar sites.',
        cookieFallback: 'Pick only the target-site cookie file to avoid sending unrelated login state.',
        cookieAdvisor: 'Cookie suggestion',
        cookieAdvisorIdle: 'Paste a link and the recommended cookie file will appear here.',
        cookieAdvisorUse: 'Use suggested cookie',
        cookieAdvisorCurrent: 'The suggested cookie file is selected.',
        cookieAdvisorNone: 'This link does not appear to need a dedicated cookie file. Use one when member access, login state, or 412/403 errors appear.',
        cookieAdvisorDetected: '{service} link detected. Suggested file: {file}. This keeps unrelated cookies out.',
        cookieAdvisorMissing: '{service} link detected, but no dedicated cookie file was found. Place the matching by-service file in the auth folder.',
        cookieAdvisorMismatch: 'The selected file does not look like a dedicated {service} cookie file.',
        cookieMeta: '{count} cookie(s) · {domains}',
        cookieExpiredWarning: '{count} cookie(s) already expired: {names}. The login session may be stale; export cookies.txt again.',
        cookieExpiringSoonWarning: '{count} cookie(s) expire within 24h: {names}.',
        extraOptions: 'Download add-ons',
        extraOptionsHint: 'Optional. Add subtitles, thumbnails, descriptions, current-video-only behavior, and similar link-download flags.',
        extraOptionsSummary: 'Enabled args',
        extraOptionsEmpty: 'No add-ons enabled. Downloads will use the default arguments.',
        advancedArgs: 'Advanced extra args',
        extraArgsPlaceholder: 'For example: --restrict-filenames',
        rememberArgs: 'Remember advanced extra args',
        start: 'Start',
        cancel: 'Stop all',
        openFolder: 'Open folder',
        telemetry: 'Telemetry',
        telemetryHint: 'See total progress, per-job progress, speed, and ETA.',
        queueSummary: 'Queue summary',
        queueProgress: 'Queue progress',
        queueProgressHint: 'Aggregate progress includes the live percent from the running job, not just completed items.',
        taskList: 'Task list',
        taskListHint: 'Each tile is one URL. Finished tasks light up; failed tasks turn red.',
        taskListIdle: 'Paste links to create task tiles.',
        taskTotal: 'Total',
        liveDownload: 'Live download',
        liveDownloadHint: 'Keep the most important active job in focus, similar to Claude-style telemetry.',
        liveDownloadIdle: 'No active download job yet.',
        waiting: 'Waiting',
        pending: 'Pending',
        running: 'Running',
        done: 'Done',
        failed: 'Failed',
        cancelled: 'Cancelled',
        activeJobs: 'Job progress',
        activeJobsHint: 'Each card is one URL.',
        downloaded: 'Downloaded',
        total: 'Total',
        eta: 'ETA',
        currentCommand: 'Current command',
        ffmpegPath: 'FFmpeg path',
        logs: 'Logs',
        logsHint: 'Keeps the latest 600 lines.',
        noLogs: 'No output yet.',
        recentJobs: 'Recent jobs',
        recentJobsHint: 'Click a card to refill URLs and folder.',
        clearHistory: 'Clear history',
        noHistory: 'No history yet.',
        audioExtract: 'Audio extract',
        videoDownload: 'Video download',
        language: 'Language',
        theme: 'Theme',
        statusIdle: 'Idle',
        statusRunning: 'Running',
        statusDone: 'Done',
        statusError: 'Error',
        statusCancelled: 'Cancelled',
        bootstrapError: 'window.appApi is unavailable. Preload did not attach.',
        startHint: 'Paste at least one URL to begin.',
        queuePrepared: '{count} URL(s) queued and ready.',
        currentCommandPlaceholder: 'The latest command will appear here after a job starts.',
        openFile: 'Show in folder',
        copiedFromHistory: 'Refilled from history.',
      }
}

function readPreferences(): StoredPreferences {
  const parsed = readJsonStorage<Partial<StoredPreferences> & { concurrency?: number; extraArgs?: string; rememberExtraArgs?: boolean }>(STORAGE_KEY, {})
  const enabledExtraPresets = Array.isArray(parsed.enabledExtraPresets)
    ? parsed.enabledExtraPresets.filter(
        (value): value is ExtraPresetId =>
          [
            'noPlaylist',
            'embedMetadata',
            'writeSubs',
            'writeAutoSubs',
            'subtitleOnly',
            'splitAudioTrack',
            'embedThumbnail',
            'writeThumbnail',
            'writeDescription',
            'writeInfoJson',
          ].includes(String(value)),
      )
    : []
  const theme = isTheme(parsed.theme) ? parsed.theme : DEFAULT_PREFS.theme
  return { ...DEFAULT_PREFS, ...parsed, theme, videoPreset: 'best', enabledExtraPresets }
}

function readHistory(): HistoryItem[] {
  const parsed = readJsonStorage<Array<Partial<HistoryItem> & { url?: string }>>(HISTORY_KEY, [])
  const normalized: HistoryItem[] = []
  parsed.forEach((item, index) => {
    const urls = Array.isArray(item.urls)
      ? item.urls.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : typeof item.url === 'string' && item.url.trim().length > 0
        ? [item.url.trim()]
        : []
    if (urls.length === 0) return
    normalized.push({
      id: typeof item.id === 'string' && item.id.trim().length > 0 ? item.id : `history-${index}`,
      urls,
      mode: item.mode === 'audio' ? 'audio' : 'video',
      outputDir: typeof item.outputDir === 'string' && item.outputDir.trim().length > 0 ? item.outputDir : DEFAULT_PREFS.outputDir,
      status: item.status === 'running' || item.status === 'success' || item.status === 'error' || item.status === 'cancelled' ? item.status : 'idle',
      outputPath: typeof item.outputPath === 'string' ? item.outputPath : undefined,
      finishedAt: typeof item.finishedAt === 'string' && item.finishedAt.trim().length > 0 ? item.finishedAt : new Date().toISOString(),
    })
  })
  return normalized
}

function statusLabel(status: DownloadStatus, text: ReturnType<typeof getText>) {
  if (status === 'running') return text.statusRunning
  if (status === 'success') return text.statusDone
  if (status === 'error') return text.statusError
  if (status === 'cancelled') return text.statusCancelled
  return text.statusIdle
}

function taskTileStatusLabel(status: DownloadStatus | 'pending', text: ReturnType<typeof getText>) {
  if (status === 'pending') return text.pending
  return statusLabel(status, text)
}

function getCookieTargetName(target: (typeof COOKIE_TARGETS)[number], language: Language) {
  return language === 'zh' ? target.zhName : target.enName
}

function normalizeCookieText(value: string) {
  return value.replace(/\\/g, '/').toLowerCase()
}

function cookieSearchText(item: CookieFileInfo) {
  return `${item.label} ${item.path} ${item.domains.join(' ')}`.replace(/\\/g, '/').toLowerCase()
}

function detectCookieTarget(urls: string[]) {
  const haystack = urls.join('\n').toLowerCase()
  if (!haystack) return null
  return COOKIE_TARGETS.find((target) => target.urlMarkers.some((marker) => haystack.includes(marker))) ?? null
}

function scoreCookieForTarget(item: CookieFileInfo, target: (typeof COOKIE_TARGETS)[number]) {
  const labelText = normalizeCookieText(item.label)
  const fullText = cookieSearchText(item)
  const hasPreferredName = target.preferredMarkers.some((marker) => labelText.includes(marker))
  const hasRelatedName = target.relatedMarkers.some((marker) => labelText.includes(marker))
  const hasRelatedDomain = target.relatedMarkers.some((marker) => item.domains.some((domain) => domain.includes(marker.replace(/^by-domain\//, '').replace(/\.cookies\.txt$/, ''))))
  const isServiceFile = labelText.includes('by-service/')
  const isDomainFile = labelText.includes('by-domain/')
  const isLikelyRaw = !isServiceFile && !isDomainFile

  if (hasPreferredName && hasRelatedDomain) return 120
  if (hasPreferredName) return 110
  if (hasRelatedDomain && isServiceFile) return 100
  if (hasRelatedDomain && isDomainFile) return 82
  if (hasRelatedName && isServiceFile) return 78
  if (hasRelatedName || hasRelatedDomain || target.relatedMarkers.some((marker) => fullText.includes(marker))) {
    return isLikelyRaw ? 46 : 62
  }
  return 0
}

function findRecommendedCookieFile(items: CookieFileInfo[], target: (typeof COOKIE_TARGETS)[number] | null) {
  if (!target) return null
  return [...items]
    .map((item) => ({ item, score: scoreCookieForTarget(item, target) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.item.cookieCount - right.item.cookieCount || left.item.label.localeCompare(right.item.label))[0]?.item ?? null
}

function formatCookieMeta(item: CookieFileInfo, language: Language, text: ReturnType<typeof getText>) {
  const domains = item.domains.slice(0, 3).join(', ') || (language === 'zh' ? '未识别域名' : 'No domains detected')
  const suffix = item.domains.length > 3 ? ` +${item.domains.length - 3}` : ''
  return text.cookieMeta
    .replace('{count}', String(item.cookieCount))
    .replace('{domains}', `${domains}${suffix}`)
}

function formatCookieNames(names: string[], language: Language) {
  if (names.length === 0) return language === 'zh' ? '未识别名称' : 'unknown names'
  return names.join(', ')
}

function formatCookieHealth(item: CookieFileInfo, language: Language, text: ReturnType<typeof getText>) {
  if (item.expiredCookieCount > 0) {
    return text.cookieExpiredWarning
      .replace('{count}', String(item.expiredCookieCount))
      .replace('{names}', formatCookieNames(item.expiredCookieNames, language))
  }
  if (item.expiringSoonCookieCount > 0) {
    return text.cookieExpiringSoonWarning
      .replace('{count}', String(item.expiringSoonCookieCount))
      .replace('{names}', formatCookieNames(item.expiringSoonCookieNames, language))
  }
  return ''
}

function classifyCookieFile(item: CookieFileInfo, language: Language) {
  const normalized = normalizeCookieText(item.label)
  const matchedTarget = COOKIE_TARGETS
    .map((target) => ({ target, score: scoreCookieForTarget(item, target) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)[0]

  if (matchedTarget && matchedTarget.score >= 90) {
    const name = getCookieTargetName(matchedTarget.target, language)
    return {
      rank: 0,
      label: `[${name}推荐] ${item.label}`,
      note: language === 'zh' ? `${name} 专用 Cookie，优先选择这个。` : `Dedicated ${name} cookie file. Prefer this one.`,
    }
  }

  if (matchedTarget) {
    const name = getCookieTargetName(matchedTarget.target, language)
    return {
      rank: 1,
      label: `[${name}相关] ${item.label}`,
      note: language === 'zh' ? `包含 ${name} 相关域名，可用但不一定最干净。` : `Contains ${name}-related domains, but may not be the cleanest file.`,
    }
  }

  if (normalized.includes('by-service/')) {
    return {
      rank: 2,
      label: `${language === 'zh' ? '[站点专用]' : '[Service]'} ${item.label}`,
      note: language === 'zh' ? '按站点整理的 Cookie 文件。' : 'Service-specific cookie file.',
    }
  }

  if (normalized.includes('by-domain/')) {
    return {
      rank: 3,
      label: `${language === 'zh' ? '[按域名]' : '[Domain]'} ${item.label}`,
      note: language === 'zh' ? '按单个域名拆出的 Cookie 文件。' : 'Domain-specific cookie file.',
    }
  }

  return {
    rank: 4,
    label: `${language === 'zh' ? '[原始导出]' : '[Raw export]'} ${item.label}`,
    note: language === 'zh' ? '原始导出文件，常常混着很多站点登录态。' : 'Raw export with many site cookies.',
  }
}

function mergeExtraArgs(presets: ExtraPresetId[]) {
  const presetArgs = presets.flatMap((preset) => EXTRA_PRESETS.zh[preset].args)
  return presetArgs.join(' ').trim()
}

function sortCookieFiles(items: CookieFileInfo[], language: Language) {
  return [...items].sort((left, right) => {
    const a = classifyCookieFile(left, language)
    const b = classifyCookieFile(right, language)
    return a.rank !== b.rank ? a.rank - b.rank : left.label.localeCompare(right.label)
  })
}

function clampPercent(value: number | null | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0
  }
  return Math.min(100, Math.max(0, value))
}

function compactPath(value: string | null | undefined, maxLength = 96) {
  const normalized = value?.replace(/\s+/g, ' ').trim() ?? ''
  if (!normalized || normalized.length <= maxLength) {
    return normalized
  }

  const headLength = Math.max(24, Math.floor(maxLength * 0.42))
  const tailLength = Math.max(30, maxLength - headLength - 1)
  return `${normalized.slice(0, headLength)}…${normalized.slice(-tailLength)}`
}

function selfCheckDisplayLabel(item: SelfCheckItem, text: ReturnType<typeof getText>) {
  if (item.key === 'yt-dlp') return text.downloadCore
  if (item.key === 'ffmpeg') return text.mediaCore
  if (item.key === 'ffprobe') return text.mediaProbe
  if (item.key === 'cookies') return text.authDir
  return item.label
}

function upsertHistoryItem(currentHistory: HistoryItem[], nextItem: HistoryItem) {
  const nextUrlsKey = nextItem.urls.join('\n')
  const filtered = currentHistory.filter((item) => {
    const currentUrlsKey = item.urls.join('\n')
    return !(currentUrlsKey === nextUrlsKey && item.mode === nextItem.mode && item.outputDir === nextItem.outputDir)
  })
  return [nextItem, ...filtered].slice(0, 20)
}

function App() {
  const initialPreferences = useMemo(() => readPreferences(), [])
  const initialOutputDirRef = useRef(initialPreferences.outputDir)
  const initialCookieFileRef = useRef(initialPreferences.cookieFile)
  const initialLanguageRef = useRef(initialPreferences.language)
  const [paths, setPaths] = useState<AppPaths | null>(null)
  const [cookieFiles, setCookieFiles] = useState<CookieFileInfo[]>([])
  const [linkInputs, setLinkInputs] = useState<string[]>([''])
  const [outputDir, setOutputDir] = useState(initialPreferences.outputDir)
  const [mode, setMode] = useState<DownloadMode>(initialPreferences.mode)
  const [audioFormat, setAudioFormat] = useState<AudioFormat>(initialPreferences.audioFormat)
  const [audioQuality, setAudioQuality] = useState<AudioQuality>(initialPreferences.audioQuality)
  const [videoPreset, setVideoPreset] = useState<VideoPreset>(initialPreferences.videoPreset)
  const [language, setLanguage] = useState<Language>(initialPreferences.language)
  const [theme, setTheme] = useState<Theme>(initialPreferences.theme)
  const [cookieFile, setCookieFile] = useState(initialPreferences.cookieFile)
  const [enabledExtraPresets, setEnabledExtraPresets] = useState<ExtraPresetId[]>(initialPreferences.enabledExtraPresets)
  const [logs, setLogs] = useState<string[]>([])
  const [queue, setQueue] = useState<QueueSnapshot>({ total: 0, pending: 0, running: 0, completed: 0, failed: 0, cancelled: 0, concurrency: 1 })
  const [jobs, setJobs] = useState<Record<string, JobSnapshot>>({})
  const [jobOrder, setJobOrder] = useState<string[]>([])
  const [status, setStatus] = useState<DownloadStatus>('idle')
  const [statusMessage, setStatusMessage] = useState(getText(initialPreferences.language).startHint)
  const [activeCommand, setActiveCommand] = useState('')
  const [history, setHistory] = useState<HistoryItem[]>(() => readHistory())
  const [selfCheckItems, setSelfCheckItems] = useState<SelfCheckItem[]>([])
  const [toolsSource, setToolsSource] = useState<'bundled' | 'external'>('external')
  const [runtimeRefreshing, setRuntimeRefreshing] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null)
  const [updateChecking, setUpdateChecking] = useState(false)
  const [updateDownloading, setUpdateDownloading] = useState(false)
  const [denoInstalling, setDenoInstalling] = useState(false)
  const [activeWorkspace, setActiveWorkspace] = useState<ActiveWorkspace>('download')
  const activeQueueSnapshotRef = useRef<ActiveQueueSnapshot>({
    mode: initialPreferences.mode,
    outputDir: initialPreferences.outputDir,
  })
  const logViewerRef = useRef<HTMLDivElement | null>(null)
  const text = getText(language)
  const normalizedHeroTitle = text.heroTitle.replace(/[。.]$/, '')
  const cookiesPluginUrl = 'https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc'
  const cookiesPluginLabel = language === 'zh' ? '推荐插件：Get cookies.txt LOCALLY' : 'Recommended: Get cookies.txt LOCALLY'
  const cookiesPluginHint =
    language === 'zh'
      ? '会员或登录态内容建议先用这个浏览器扩展导出 cookies.txt，再放进本项目的 cookies 目录。'
      : 'For member-only or signed-in content, export a cookies.txt file with this browser extension first, then place it in the project cookies folder.'
  const cookiesPluginButton = language === 'zh' ? '打开插件页' : 'Open extension page'
  const updateSummary = updateInfo
    ? updateInfo.updateAvailable
      ? `${text.updateReady}: ${updateInfo.currentVersion} -> ${updateInfo.latestVersion ?? '--'}`
      : `${text.updateCurrent}: ${updateInfo.currentVersion} · ${text.updateNone}`
    : text.updateUnknown
  const presetCopy = EXTRA_PRESETS[language]

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    if (!appApi) return
    void (async () => {
      setRuntimeRefreshing(true)
      try {
        const [nextPaths, selfCheckPayload, cookieItems] = await Promise.all([
          appApi.getPaths(),
          appApi.getSelfCheck(),
          appApi.listCookieFiles(),
        ])

        setPaths(nextPaths)
        setSelfCheckItems(selfCheckPayload.items)
        setToolsSource(selfCheckPayload.toolsSource)
        setCookieFiles(sortCookieFiles(cookieItems, initialLanguageRef.current))
        if (initialOutputDirRef.current === DEFAULT_PREFS.outputDir) {
          setOutputDir((current) => (current === DEFAULT_PREFS.outputDir ? nextPaths.defaultDownloadDir : current))
        }
        if (initialCookieFileRef.current && !cookieItems.some((item) => item.path === initialCookieFileRef.current)) {
          setCookieFile('')
        }
        void appApi.checkForUpdates()
          .then((result) => {
            setUpdateInfo(result)
            if (result.updateAvailable) {
              setStatus('success')
              setStatusMessage(`${getText(initialLanguageRef.current).updateReady}: ${result.currentVersion} -> ${result.latestVersion ?? '--'}`)
            }
          })
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : 'Update check failed.'
            setLogs((current) => [...current, `[update] ${message}`].slice(-600))
          })
      } finally {
        setRuntimeRefreshing(false)
      }
    })()
  }, [])

  useEffect(() => {
    if (!appApi) return

    const unsubscribe = appApi.onDownloadUpdate((event) => {
      if (event.type === 'log') {
        const prefix = event.jobId ? `[${event.jobId}] ` : ''
        setLogs((current) => [...current, `${prefix}${event.line}`].slice(-600))
        return
      }
      if (event.type === 'queue') {
        setQueue(event.queue)
        if (event.message) {
          setStatusMessage(event.message)
          if (event.queue.running > 0 || event.queue.pending > 0) setStatus('running')
          else if (event.queue.failed > 0) setStatus('error')
          else if (event.queue.cancelled > 0 && event.queue.completed === 0) setStatus('cancelled')
          else if (event.queue.completed > 0) setStatus('success')
          else setStatus('idle')
        }
        return
      }
      const nextJob = event.job
      setJobs((current) => {
        const previous = current[nextJob.jobId]
        const next = { ...current, [nextJob.jobId]: nextJob }
        if (!previous) {
          setJobOrder((order) => (order.includes(nextJob.jobId) ? order : [...order, nextJob.jobId]))
        }
        if (['success', 'error', 'cancelled'].includes(nextJob.status) && (!previous || previous.status !== nextJob.status)) {
          setHistory((currentHistory) => {
            const queueSnapshot = activeQueueSnapshotRef.current
            const item: HistoryItem = {
              id: `${Date.now()}-${nextJob.jobId}`,
              urls: [nextJob.url],
              mode: queueSnapshot.mode,
              outputDir: queueSnapshot.outputDir,
              status: nextJob.status,
              outputPath: nextJob.outputPath,
              finishedAt: new Date().toISOString(),
            }
            const updated = upsertHistoryItem(currentHistory, item)
            writeJsonStorage(HISTORY_KEY, updated)
            return updated
          })
        }
        return next
      })
      if (nextJob.command) setActiveCommand(nextJob.command)
      if (nextJob.message) setStatusMessage(nextJob.message)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    setCookieFiles((current) => sortCookieFiles(current, language))
  }, [language])

  useEffect(() => {
    const prefs: StoredPreferences = { outputDir, mode, audioFormat, audioQuality, videoPreset, language, theme, cookieFile, enabledExtraPresets }
    writeJsonStorage(STORAGE_KEY, prefs)
  }, [audioFormat, audioQuality, cookieFile, enabledExtraPresets, language, mode, outputDir, theme, videoPreset])

  useEffect(() => {
    const container = logViewerRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
  }, [logs])

  const urls = useMemo(() => {
    const seen = new Set<string>()
    return linkInputs
      .map((item) => item.trim())
      .filter((item) => {
        if (!item || seen.has(item)) {
          return false
        }
        seen.add(item)
        return true
      })
  }, [linkInputs])
  const cookieTarget = useMemo(() => detectCookieTarget(urls), [urls])
  const recommendedCookieFile = useMemo(() => findRecommendedCookieFile(cookieFiles, cookieTarget), [cookieFiles, cookieTarget])
  const canStart = urls.length > 0 && outputDir.trim().length > 0 && queue.running === 0 && queue.pending === 0
  const bootstrapError = !appApi ? text.bootstrapError : null
  const effectiveStatus = bootstrapError ? 'error' : status
  const effectiveMessage = bootstrapError ?? statusMessage
  const visibleLogs = bootstrapError ? ['[bootstrap] window.appApi is unavailable'] : logs
  const denoHint = paths?.denoPath ? text.denoReady : text.denoMissing
  const sortedJobs = jobOrder.map((jobId) => jobs[jobId]).filter(Boolean)
  const aggregateProgressPercent = useMemo(() => {
    if (queue.total <= 0) {
      return 0
    }

    const processedUnits = sortedJobs.reduce((totalUnits, job) => {
      if (job.status === 'success' || job.status === 'error' || job.status === 'cancelled') {
        return totalUnits + 100
      }
      if (job.status === 'running') {
        return totalUnits + clampPercent(job.percent)
      }
      return totalUnits
    }, 0)

    return Math.min(100, Math.max(0, processedUnits / queue.total))
  }, [queue.total, sortedJobs])
  const liveJob = useMemo(
    () => [...sortedJobs].reverse().find((job) => job.status === 'running') ?? null,
    [sortedJobs],
  )
  const taskTiles = useMemo(() => {
    const total = Math.max(queue.total, urls.length)
    return Array.from({ length: total }, (_, index) => {
      const taskIndex = index + 1
      const job = sortedJobs.find((item) => item.index === taskIndex)
      const status: DownloadStatus | 'pending' = job?.status ?? (queue.total > 0 ? 'pending' : 'idle')
      return {
        index: taskIndex,
        status,
        title: job?.title || urls[index] || '',
        percent: job?.percent ?? null,
      }
    })
  }, [queue.total, sortedJobs, urls])
  const taskTilesDone = taskTiles.filter((tile) => tile.status === 'success').length
  const aggregateProgressLabel = queue.total > 0 ? `${aggregateProgressPercent.toFixed(1)}%` : text.waiting
  const combinedExtraArgs = mergeExtraArgs(enabledExtraPresets)
  const selectedCookieMeta = cookieFile ? cookieFiles.find((item) => item.path === cookieFile) : null
  const selectedCookieScore = cookieTarget && selectedCookieMeta ? scoreCookieForTarget(selectedCookieMeta, cookieTarget) : 0
  const cookieTargetName = cookieTarget ? getCookieTargetName(cookieTarget, language) : ''
  const cookieAdvisorMessage = cookieTarget
    ? recommendedCookieFile
      ? text.cookieAdvisorDetected
          .replace('{service}', cookieTargetName)
          .replace('{file}', classifyCookieFile(recommendedCookieFile, language).label)
      : text.cookieAdvisorMissing.replace('{service}', cookieTargetName)
    : urls.length > 0
      ? text.cookieAdvisorNone
      : text.cookieAdvisorIdle
  const selectedCookieHelp = selectedCookieMeta
    ? [
        classifyCookieFile(selectedCookieMeta, language).note,
        formatCookieMeta(selectedCookieMeta, language, text),
        formatCookieHealth(selectedCookieMeta, language, text),
        cookieTarget && selectedCookieScore === 0 ? text.cookieAdvisorMismatch.replace('{service}', cookieTargetName) : '',
      ].filter(Boolean).join(' ')
    : text.cookieHint
  const recommendedCookieHealth = recommendedCookieFile ? formatCookieHealth(recommendedCookieFile, language, text) : ''
  const canClearLinks = linkInputs.some((item) => item.trim().length > 0) || linkInputs.length > 1

  async function refreshRuntimeState() {
    if (!appApi) return

    setRuntimeRefreshing(true)
    try {
      const [nextPaths, selfCheckPayload, cookieItems] = await Promise.all([
        appApi.getPaths(),
        appApi.getSelfCheck(),
        appApi.listCookieFiles(),
      ])

      setPaths(nextPaths)
      setSelfCheckItems(selfCheckPayload.items)
      setToolsSource(selfCheckPayload.toolsSource)
      setCookieFiles(sortCookieFiles(cookieItems, language))
      if (initialOutputDirRef.current === DEFAULT_PREFS.outputDir) {
        setOutputDir((current) => (current === DEFAULT_PREFS.outputDir ? nextPaths.defaultDownloadDir : current))
      }
      if (cookieFile && !cookieItems.some((item) => item.path === cookieFile)) {
        setCookieFile('')
      }
      setStatus('idle')
      setStatusMessage(nextPaths.denoPath ? text.refreshedWithDeno : text.refreshedWithoutDeno)
    } catch (error) {
      const message = error instanceof Error ? error.message : text.refreshFailed
      setStatus('error')
      setStatusMessage(message)
      setLogs((current) => [...current, `[ui] ${message}`].slice(-600))
    } finally {
      setRuntimeRefreshing(false)
    }
  }

  async function checkForUpdates(silent = false) {
    if (!appApi) return

    setUpdateChecking(true)
    try {
      const result = await appApi.checkForUpdates()
      setUpdateInfo(result)
      if (!silent || result.updateAvailable) {
        setStatus(result.updateAvailable ? 'success' : 'idle')
        setStatusMessage(
          result.updateAvailable
            ? `${text.updateReady}: ${result.currentVersion} -> ${result.latestVersion ?? '--'}`
            : text.updateNone,
        )
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Update check failed.'
      if (!silent) {
        setStatus('error')
        setStatusMessage(message)
      }
      setLogs((current) => [...current, `[update] ${message}`].slice(-600))
    } finally {
      setUpdateChecking(false)
    }
  }

  async function downloadLatestUpdate() {
    if (!appApi) return

    setUpdateDownloading(true)
    try {
      const result = await appApi.downloadLatestUpdate()
      setStatus('success')
      setStatusMessage(`${text.updateDownloaded} ${result.filePath}`)
      setLogs((current) => [...current, `[update] ${result.assetName} -> ${result.filePath}`].slice(-600))
    } catch (error) {
      const message = error instanceof Error ? error.message : text.updateMissingAsset
      setStatus('error')
      setStatusMessage(message)
      setLogs((current) => [...current, `[update] ${message}`].slice(-600))
    } finally {
      setUpdateDownloading(false)
    }
  }

  async function installDenoRuntime() {
    if (!appApi) return

    setDenoInstalling(true)
    try {
      const result = await appApi.installDenoRuntime()
      setStatus('success')
      setStatusMessage(`${text.denoInstalled} ${result.path}`)
      setLogs((current) => [...current, `[runtime] deno ${result.version} -> ${result.path}`].slice(-600))
      await refreshRuntimeState()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Deno install failed.'
      setStatus('error')
      setStatusMessage(message)
      setLogs((current) => [...current, `[runtime] ${message}`].slice(-600))
    } finally {
      setDenoInstalling(false)
    }
  }

  async function handlePickFolder() {
    const folder = await appApi.pickDirectory(outputDir)
    if (folder) setOutputDir(folder)
  }

  async function handleStartDownload() {
    setLogs([])
    setJobs({})
    setJobOrder([])
    setActiveCommand('')
    activeQueueSnapshotRef.current = {
      mode,
      outputDir,
    }
    setQueue({ total: urls.length, pending: urls.length, running: 0, completed: 0, failed: 0, cancelled: 0, concurrency: 1 })
    setStatus('running')
    setStatusMessage(text.queuePrepared.replace('{count}', String(urls.length)))
    try {
      await appApi.startDownload({
        urls,
        outputDir,
        mode,
        audioFormat,
        audioQuality,
        videoPreset,
        extraArgs: combinedExtraArgs,
        cookieFile: cookieFile || null,
        concurrency: 1,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start queue.'
      setStatus('error')
      setStatusMessage(message)
      setLogs((current) => [...current, `[ui] ${message}`])
    }
  }

  function updateLinkInput(index: number, value: string) {
    if (value.includes('\n')) {
      const nextUrls = value
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean)
      setLinkInputs((current) => {
        const before = current.slice(0, index)
        const after = current.slice(index + 1)
        const merged = [...before, ...(nextUrls.length > 0 ? nextUrls : ['']), ...after]
        return merged.length > 0 ? merged : ['']
      })
      return
    }
    setLinkInputs((current) => current.map((item, itemIndex) => (itemIndex === index ? value : item)))
  }

  function addLinkInput() {
    setLinkInputs((current) => [...current, ''])
  }

  function removeLinkInput(index: number) {
    setLinkInputs((current) => {
      if (current.length === 1) {
        return ['']
      }
      return current.filter((_, itemIndex) => itemIndex !== index)
    })
  }

  function clearLinkInputs() {
    setLinkInputs([''])
  }

  function togglePreset(preset: ExtraPresetId) {
    setEnabledExtraPresets((current) => current.includes(preset) ? current.filter((item) => item !== preset) : [...current, preset])
  }

  async function handleExportConfig() {
    const config = {
      outputDir,
      mode,
      audioFormat,
      audioQuality,
      videoPreset,
      language,
      theme,
      enabledExtraPresets,
    }
    const savedPath = await appApi.exportConfig(config)
    if (savedPath) {
      setStatusMessage(`Config exported: ${savedPath}`)
    }
  }

  async function handleImportConfig() {
    const imported = await appApi.importConfig()
    if (!imported || typeof imported !== 'object') return
    const data = imported as Partial<StoredPreferences>
    if (typeof data.outputDir === 'string') setOutputDir(data.outputDir)
    if (data.mode === 'video' || data.mode === 'audio') setMode(data.mode)
    if (data.audioFormat === 'mp3' || data.audioFormat === 'm4a' || data.audioFormat === 'wav' || data.audioFormat === 'opus') setAudioFormat(data.audioFormat)
    if (data.audioQuality === 'best' || data.audioQuality === '320k' || data.audioQuality === '192k' || data.audioQuality === '128k') setAudioQuality(data.audioQuality)
    setVideoPreset('best')
    if (data.language === 'zh' || data.language === 'en') setLanguage(data.language)
    if (isTheme(data.theme)) setTheme(data.theme)
    if (Array.isArray(data.enabledExtraPresets)) {
      setEnabledExtraPresets(
        data.enabledExtraPresets.filter(
          (value): value is ExtraPresetId =>
            [
              'noPlaylist',
              'embedMetadata',
              'writeSubs',
              'writeAutoSubs',
              'subtitleOnly',
              'splitAudioTrack',
              'embedThumbnail',
              'writeThumbnail',
              'writeDescription',
              'writeInfoJson',
            ].includes(String(value)),
        ),
      )
    }
    setCookieFile('')
    setStatusMessage(language === 'zh' ? '配置已导入，cookies 已按安全要求清空。' : 'Config imported. Cookie selection was cleared for safety.')
  }

  return (
    <div className="shell">
      <div className="shell__glow shell__glow--left" />
      <div className="shell__glow shell__glow--right" />
      <section className="hero panel">
        <div className="hero__toolbar">
          <div className="hero-brand">
            <div className="eyebrow">MEDIA DOCK</div>
            <div className="eyebrow brand-signature">LOCAL</div>
          </div>
          <div className="toolbar-group">
            <div className="toolbar-block">
              <span>{language === 'zh' ? '配置' : 'Config'}</span>
              <div className="segmented">
                <button className="segmented__item" type="button" onClick={() => void handleImportConfig()}>{language === 'zh' ? '导入' : 'Import'}</button>
                <button className="segmented__item" type="button" onClick={() => void handleExportConfig()}>{language === 'zh' ? '导出' : 'Export'}</button>
              </div>
            </div>
            <div className="toolbar-block">
              <span>{text.workspace}</span>
              <div className="segmented">
                <button
                  className={activeWorkspace === 'download' ? 'segmented__item active' : 'segmented__item'}
                  type="button"
                  onClick={() => setActiveWorkspace('download')}
                >
                  {text.downloadPanel}
                </button>
                <button
                  className={activeWorkspace === 'media' ? 'segmented__item active' : 'segmented__item'}
                  type="button"
                  onClick={() => setActiveWorkspace('media')}
                >
                  {text.mediaTools}
                </button>
              </div>
            </div>
            <div className="toolbar-block">
              <span>{text.language}</span>
              <div className="segmented">
                <button className={language === 'zh' ? 'segmented__item active' : 'segmented__item'} type="button" onClick={() => setLanguage('zh')}>中文</button>
                <button className={language === 'en' ? 'segmented__item active' : 'segmented__item'} type="button" onClick={() => setLanguage('en')}>EN</button>
              </div>
            </div>
            <div className="toolbar-block">
              <span>{text.theme}</span>
              <div className="theme-swatch-group" role="list" aria-label={text.theme}>
                {THEME_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    className={theme === option.id ? 'theme-swatch active' : 'theme-swatch'}
                    type="button"
                    data-theme-option={option.id}
                    aria-pressed={theme === option.id}
                    onClick={() => setTheme(option.id)}
                  >
                    <span className="theme-swatch__dot" aria-hidden="true" />
                    <span>{getThemeLabel(option, language)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <h1>{normalizedHeroTitle}</h1>
        <p className="hero__copy">{text.heroCopy}</p>
        <div className="hero__status-grid">
          <div className="status-card"><span className="status-card__label">{text.status}</span><strong>{statusLabel(effectiveStatus, text)}</strong><p>{effectiveMessage}</p></div>
          <div className="status-card">
            <span className="status-card__label">{text.engine}</span>
            <strong>{paths?.envName ?? text.loading}</strong>
            <p title={paths?.ytDlpPath}>{paths?.ytDlpPath ? compactPath(paths.ytDlpPath, 86) : text.loadingPath}</p>
          </div>
          <div className="status-card">
            <span className="status-card__label">{text.compatibility}</span>
            <strong>{paths?.denoPath ? text.readyForYoutube : text.basicMode}</strong>
            <p>{denoHint}</p>
            {!paths?.denoPath ? (
              <div className="status-card__actions">
                <button
                  className="ghost-button ghost-button--small"
                  type="button"
                  disabled={denoInstalling || queue.running > 0 || queue.pending > 0}
                  onClick={() => void installDenoRuntime()}
                >
                  {denoInstalling ? text.installingDeno : text.installDenoAuto}
                </button>
                <small>{text.denoInstallAutoHint}</small>
              </div>
            ) : null}
          </div>
        </div>
        <div className="command-box hero-checks">
          <span>{language === 'zh' ? '启动自检' : 'Startup self-check'}</span>
          <code>
            {(selfCheckItems.length > 0 ? selfCheckItems : [
              { key: 'loading', label: language === 'zh' ? '检查中' : 'Checking', ok: true, detail: text.loading },
            ])
              .map((item) => `${item.ok ? 'OK' : 'MISS'} ${selfCheckDisplayLabel(item, text)}: ${compactPath(item.detail, 124)}`)
              .join('\n')}
          </code>
          <div className="section-actions">
            <button className="ghost-button ghost-button--small" type="button" disabled={runtimeRefreshing || queue.running > 0 || queue.pending > 0} onClick={() => void refreshRuntimeState()}>
              {runtimeRefreshing ? text.refreshingTools : text.refreshTools}
            </button>
            <button className="ghost-button ghost-button--small" type="button" disabled={updateChecking} onClick={() => void checkForUpdates(false)}>
              {updateChecking ? text.checkingUpdates : text.checkUpdates}
            </button>
            {updateInfo?.updateAvailable ? (
              <button className="ghost-button ghost-button--small" type="button" disabled={updateDownloading || !updateInfo.assetUrl} onClick={() => void downloadLatestUpdate()}>
                {updateDownloading ? text.updateDownloading : text.updateDownload}
              </button>
            ) : null}
          </div>
          <div className="progress-meta progress-meta--wrap">
            <span>{language === 'zh' ? '工具来源' : 'Tool source'}: {toolsSource === 'bundled' ? (language === 'zh' ? '分享包内置' : 'Bundled') : (language === 'zh' ? '系统环境' : 'System')}</span>
            <span>{updateSummary}</span>
            {updateInfo?.assetName ? <span>{text.updateLatest}: {updateInfo.latestVersion ?? '--'}</span> : null}
          </div>
        </div>
      </section>
      {activeWorkspace === 'media' ? (
        <MediaToolsView embedded onBack={() => setActiveWorkspace('download')} />
      ) : (
      <main className="workspace">
        <section className="panel control-room">
          <div className="section-title"><span>{text.downloadPanel}</span><small>{text.downloadPanelHint}</small></div>
          <div className="control-room__quickbar">
            <div className="control-room__stats">
              <div className="control-room__stat"><strong>{urls.length}</strong><span>{text.urls}</span></div>
              <div className="control-room__stat"><strong>{mode === 'video' ? text.video : text.audio}</strong><span>{text.mode}</span></div>
              <div className="control-room__stat"><strong>{queue.running > 0 || queue.pending > 0 ? statusLabel('running', text) : statusLabel(effectiveStatus, text)}</strong><span>{text.status}</span></div>
            </div>
            <div className="action-row action-row--top">
              <button className="primary-button" type="button" disabled={!canStart} onClick={handleStartDownload}>{text.start}</button>
              <button className="ghost-button" type="button" disabled={queue.running === 0 && queue.pending === 0} onClick={() => void appApi.cancelDownload()}>{text.cancel}</button>
              <button className="ghost-button" type="button" onClick={() => void appApi.openPath(outputDir)}>{text.openFolder}</button>
            </div>
          </div>
          <div className="field">
            <span>{text.urls}</span>
            <div className="link-list">
              {linkInputs.map((value, index) => (
                <div className="link-row" key={`link-${index}`}>
                  <input
                    className="link-row__input"
                    value={value}
                    onChange={(event) => updateLinkInput(index, event.target.value)}
                    placeholder={`${text.urlsPlaceholder} ${index + 1}`}
                  />
                  <button className="ghost-button ghost-button--icon" type="button" onClick={() => removeLinkInput(index)}>
                    -
                  </button>
                </div>
              ))}
            </div>
            <small className="field-help">{text.urlsHint}</small>
            <div className="section-actions">
              <button className="ghost-button ghost-button--small" type="button" onClick={addLinkInput}>
                + {text.addLink}
              </button>
              <button className="ghost-button ghost-button--small" type="button" disabled={!canClearLinks} onClick={clearLinkInputs}>
                {text.clearLinks}
              </button>
            </div>
          </div>
          <div className="field-group path-picker-group">
            <label className="field field--grow path-picker-field">
              <span>{text.outputFolder}</span>
              <input value={outputDir} onChange={(event) => setOutputDir(event.target.value)} />
            </label>
            <div className="field path-picker-action">
              <span className="path-picker-label" aria-hidden="true">{text.outputFolder}</span>
              <div className="path-picker-action-row">
                <button className="ghost-button path-picker-button" type="button" onClick={handlePickFolder}>{text.browse}</button>
              </div>
            </div>
          </div>
          <div className="field-grid field-grid--2">
            <label className="field">
              <span>{text.mode}</span>
              <div className="toggle-grid">
                <button className={mode === 'video' ? 'mode-pill active' : 'mode-pill'} type="button" onClick={() => setMode('video')}>{text.video}</button>
                <button className={mode === 'audio' ? 'mode-pill active' : 'mode-pill'} type="button" onClick={() => setMode('audio')}>{text.audio}</button>
              </div>
              <small className="field-help">{text.sequentialHint}</small>
            </label>
            {mode === 'video' ? (
              <div className="quality-card">
                <span>{text.videoPreset}</span>
                <strong>{text.best}</strong>
                <small className="field-help">{text.videoPresetHint}</small>
              </div>
            ) : (
              <div className="field-grid field-grid--2">
                <label className="field">
                  <span>{text.audioFormat}</span>
                  <select value={audioFormat} onChange={(event) => setAudioFormat(event.target.value as AudioFormat)}>
                    <option value="mp3">MP3</option><option value="m4a">M4A</option><option value="wav">WAV</option><option value="opus">OPUS</option>
                  </select>
                </label>
                <label className="field">
                  <span>{text.audioQuality}</span>
                  <select value={audioQuality} onChange={(event) => setAudioQuality(event.target.value as AudioQuality)}>
                    <option value="best">Best available</option><option value="320k">320 kbps</option><option value="192k">192 kbps</option><option value="128k">128 kbps</option>
                  </select>
                  <small className="field-help">{text.audioQualityHint}</small>
                </label>
              </div>
            )}
          </div>
          <div className="field-grid field-grid--2">
            <label className="field">
              <span>{text.cookieFile}</span>
              <select value={cookieFile} onChange={(event) => setCookieFile(event.target.value)}>
                <option value="">{text.cookieAuto}</option>
                {cookieFiles.map((item) => {
                  const meta = classifyCookieFile(item, language)
                  return <option key={item.path} value={item.path}>{meta.label}</option>
                })}
              </select>
              <small className="field-help">{selectedCookieHelp}</small>
            </label>
            <label className="field field--button">
              <span>Cookies</span>
              <div className="cookie-helper-actions">
                <button className="ghost-button ghost-button--full" type="button" onClick={() => void appApi.openPath(paths?.cookiesDir ?? '')}>{text.openCookiesDir}</button>
                <button className="ghost-button ghost-button--full" type="button" onClick={() => void appApi.openExternal(cookiesPluginUrl)}>{cookiesPluginButton}</button>
              </div>
              <small className="field-help">{cookiesPluginLabel}</small>
              <small className="field-help">{cookiesPluginHint}</small>
              <small className="field-help">{text.cookieFallback}</small>
            </label>
          </div>
          <div className={[
            'cookie-advisor',
            recommendedCookieFile ? 'cookie-advisor--active' : '',
            recommendedCookieHealth ? 'cookie-advisor--warning' : '',
          ].filter(Boolean).join(' ')}>
            <div>
              <span>{text.cookieAdvisor}</span>
              <p>{cookieAdvisorMessage}</p>
              {recommendedCookieFile ? <small>{formatCookieMeta(recommendedCookieFile, language, text)}</small> : null}
              {recommendedCookieHealth ? <small>{recommendedCookieHealth}</small> : null}
            </div>
            {recommendedCookieFile ? (
              <button
                className="ghost-button ghost-button--small"
                type="button"
                disabled={cookieFile === recommendedCookieFile.path}
                onClick={() => setCookieFile(recommendedCookieFile.path)}
              >
                {cookieFile === recommendedCookieFile.path ? text.cookieAdvisorCurrent : text.cookieAdvisorUse}
              </button>
            ) : null}
          </div>
          <div className="field">
            <span>{text.extraOptions}</span>
            <div className="preset-list">
              {(Object.keys(presetCopy) as ExtraPresetId[]).map((presetId) => {
                const preset = presetCopy[presetId]
                const active = enabledExtraPresets.includes(presetId)
                return <button key={presetId} className={active ? 'preset-chip active' : 'preset-chip'} type="button" onClick={() => togglePreset(presetId)}><strong>{preset.label}</strong><span>{preset.desc}</span></button>
              })}
            </div>
            <small className="field-help">{text.extraOptionsHint}</small>
          </div>
          <div className="command-box command-box--subtle"><span>{text.extraOptionsSummary}</span><code>{combinedExtraArgs || text.extraOptionsEmpty}</code></div>
        </section>
        <aside className="right-rail">
          <section className="panel telemetry">
            <div className="section-title"><span>{text.telemetry}</span><small>{text.telemetryHint}</small></div>
            <div className="telemetry-stack">
              <div className="progress-shell progress-shell--overview">
                <div className="progress-shell__header"><strong>{aggregateProgressLabel}</strong><span>{text.queueProgress}</span></div>
                <div className="progress-bar"><div className="progress-bar__fill" style={{ width: `${queue.total > 0 ? aggregateProgressPercent : 0}%` }} /></div>
                <div className="progress-meta progress-meta--wrap"><span>{text.pending}: {queue.pending}</span><span>{text.running}: {queue.running}</span><span>{text.done}: {queue.completed}</span><span>{text.failed}: {queue.failed}</span><span>{text.cancelled}: {queue.cancelled}</span></div>
              </div>
              <div className="task-map">
                <div className="task-map__header">
                  <div>
                    <strong>{text.taskList}</strong>
                    <small>{text.taskListHint}</small>
                  </div>
                  <span>{text.taskTotal}: {taskTiles.length} · {text.done}: {taskTilesDone}</span>
                </div>
                {taskTiles.length > 0 ? (
                  <div className="task-map__grid" aria-label={text.taskList}>
                    {taskTiles.map((tile) => (
                      <div
                        className={`task-tile task-tile--${tile.status}`}
                        key={`task-tile-${tile.index}`}
                        title={`${tile.index}. ${tile.title || taskTileStatusLabel(tile.status, text)} · ${taskTileStatusLabel(tile.status, text)}`}
                      >
                        <strong>{tile.index}</strong>
                        <span>{tile.percent !== null && tile.status === 'running' ? `${tile.percent.toFixed(0)}%` : taskTileStatusLabel(tile.status, text)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="job-empty job-empty--compact">{text.taskListIdle}</div>
                )}
              </div>
              <div className="progress-shell progress-shell--focus">
                <div className="progress-shell__header"><strong>{text.liveDownload}</strong><span>{liveJob ? statusLabel(liveJob.status, text) : text.waiting}</span></div>
                {liveJob ? (
                  <>
                    <div className="progress-focus__title"><strong>{liveJob.title}</strong><span>{liveJob.percent !== null ? `${liveJob.percent.toFixed(1)}%` : text.waiting}</span></div>
                    <div className="progress-bar progress-bar--small"><div className="progress-bar__fill" style={{ width: `${liveJob.percent === null ? 0 : clampPercent(liveJob.percent)}%` }} /></div>
                    <div className="progress-meta progress-meta--wrap"><span>{text.downloaded}: {liveJob.downloaded}</span><span>{text.total}: {liveJob.total}</span><span>{text.eta}: {liveJob.eta}</span><span>{liveJob.speed}</span></div>
                  </>
                ) : (
                  <div className="job-empty job-empty--compact">{text.liveDownloadIdle}</div>
                )}
              </div>
            </div>
            {sortedJobs.length > 0 ? (
              <div className="job-grid">
                <div className="section-title section-title--tight"><span>{text.activeJobs}</span><small>{text.activeJobsHint}</small></div>
                {sortedJobs.map((job) => (
                  <div className="job-card" key={job.jobId}>
                    <div className="job-card__header"><strong>{job.title}</strong><span>{statusLabel(job.status, text)}</span></div>
                    <p className="job-card__url">{job.url}</p>
                    <div className="progress-bar progress-bar--small"><div className="progress-bar__fill" style={{ width: `${job.percent === null ? 0 : clampPercent(job.percent)}%` }} /></div>
                    <div className="progress-meta progress-meta--wrap"><span>{job.percent !== null ? `${job.percent.toFixed(1)}%` : text.waiting}</span><span>{text.downloaded}: {job.downloaded}</span><span>{text.total}: {job.total}</span><span>{text.eta}: {job.eta}</span><span>{job.speed}</span></div>
                    {job.outputPath ? <button className="ghost-button ghost-button--full" type="button" onClick={() => void appApi.showItemInFolder(job.outputPath ?? '')}>{text.openFile}</button> : null}
                  </div>
                ))}
              </div>
            ) : null}
            {activeCommand ? (
              <div className="telemetry-meta-grid">
                <div className="command-box"><span>{text.currentCommand}</span><code>{activeCommand}</code></div>
              </div>
            ) : null}
          </section>
          <section className="panel logs">
            <div className="section-title"><span>{text.logs}</span><small>{text.logsHint}</small></div>
            <div className="log-viewer" ref={logViewerRef}>{visibleLogs.length === 0 ? <div className="log-placeholder">{text.noLogs}</div> : visibleLogs.map((line, index) => <div className="log-line" key={`${line}-${index}`}>{line}</div>)}</div>
          </section>
          <section className="panel history">
            <div className="section-title"><span>{text.recentJobs}</span><div className="section-actions"><small>{text.recentJobsHint}</small><button className="ghost-button ghost-button--small" type="button" onClick={() => { setHistory([]); removeStorageItem(HISTORY_KEY) }}>{text.clearHistory}</button></div></div>
            <div className="history-list">
              {history.length === 0 ? <div className="history-empty">{text.noHistory}</div> : history.map((item) => (
                <button className="history-item" key={item.id} type="button" onClick={() => { setLinkInputs(Array.isArray(item.urls) && item.urls.length > 0 ? item.urls : ['']); setOutputDir(item.outputDir); setMode(item.mode); setStatusMessage(text.copiedFromHistory) }}>
                  <div className="history-item__content">
                    <strong>{item.mode === 'audio' ? text.audioExtract : text.videoDownload}</strong>
                    <p>{(Array.isArray(item.urls) ? item.urls : []).join(' | ')}</p>
                  </div>
                  <div className={`history-badge history-badge--${item.status}`}>{statusLabel(item.status, text)}</div>
                </button>
              ))}
            </div>
          </section>
        </aside>
      </main>
      )}
    </div>
  )
}

export default App
