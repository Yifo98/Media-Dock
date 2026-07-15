import type { WorkspaceSnapshot } from './mediaTaskEngine.js'

export type SupportDiagnosticsInput = Readonly<{
  generatedAt: string
  appVersion: string
  uiLanguage: 'zh-CN' | 'en'
  platform: Readonly<{ name: string; release: string; arch: string }>
  processVersions: Readonly<{ electron: string; chrome: string; node: string }>
  runtimes: Readonly<{ ffmpeg: string; ffprobe: string; ytDlp: string; deno: string | null }>
  homeDirectory: string
  recentError?: string
  workspace: WorkspaceSnapshot
}>

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function redactUrlQueries(value: string) {
  return value.replace(/https?:\/\/[^\s"'<>]+/giu, (candidate) => {
    try {
      const url = new URL(candidate)
      return url.origin
    } catch {
      return '[network URL redacted]'
    }
  })
}

export function redactDiagnosticText(value: string, homeDirectory: string) {
  let redacted = String(value).slice(0, 8_000)
  redacted = redacted
    .replace(/^\s*(?:cookie|set-cookie|authorization|proxy-authorization)\s*:[^\r\n]*/gimu, '[credential header redacted]')
    .replace(/--cookies(?:-from-browser)?(?:=|\s+)(?:"[^"]*"|'[^']*'|[^\s]+)/giu, '--authentication-file [redacted]')
  redacted = redactUrlQueries(redacted)
  if (homeDirectory) {
    redacted = redacted.replace(new RegExp(escapeRegExp(homeDirectory), 'giu'), '[home]')
  }
  redacted = redacted
    .replace(/\[home\](?:[\\/][^\s"'<>]+)*/giu, '[local path]')
    .replace(/(?:"\\\\[^"]+"|'\\\\[^']+'|\\\\[^\s"'<>;,]+(?:\\[^\s"'<>;,]+)+)/gu, '[local path]')
    .replace(/(?:"[A-Z]:\\[^"]+"|'[A-Z]:\\[^']+'|\b[A-Z]:\\[^\s,;]+)/giu, '[local path]')
    .replace(/(?<![:/])\/(?:[^\s"'<>;,/]+\/)*[^\s"'<>;,/]+/gu, '[local path]')
    .replace(/(?:\.{0,2}[\\/]|[A-Z0-9._-]+[\\/])+[^\s"'<>;,\\/]+\.(?:3g2|3gp|aac|aiff?|alac|avi|flac|flv|m4a|m4v|mka|mkv|mov|mp3|mp4|mpeg|mpg|oga|ogg|ogv|opus|ts|wav|webm|wma|wmv)\b/giu, '[local path]')
    .replace(/\b[^\s"'<>;,\\/]+\.(?:3g2|3gp|aac|aiff?|alac|avi|flac|flv|m4a|m4v|mka|mkv|mov|mp3|mp4|mpeg|mpg|oga|ogg|ogv|opus|ts|wav|webm|wma|wmv)\b/giu, '[local path]')
    .replace(/["']?\b(?:cookie|cookies|authorization|proxy-authorization|token|access[_-]?token|refresh[_-]?token|password|passwd|secret|sessdata|bili_jct|dedeuserid|buvid3)\b["']?\s*(?:[:=]\s*|\s+)(?:"[^"]*"|'[^']*'|[^\s,;]+)/giu, '[credential redacted]')
  return redacted.trim()
}

function sourceSummary(source: WorkspaceSnapshot['tasks'][number]['plan']['source']) {
  if (source.kind === 'network-url') return `network-url (${source.serviceName})`
  return source.kind
}

export function buildSanitizedSupportDiagnostics(input: SupportDiagnosticsInput) {
  const tasks = [...input.workspace.tasks]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 20)
  const services = [...new Set(input.workspace.authenticationProfiles.flatMap((profile) => profile.services))].sort()
  const stateCounts = ['queued', 'running', 'needs-attention', 'completed', 'cancelled']
    .map((state) => `${state}=${input.workspace.tasks.filter((task) => task.state === state).length}`)
    .join(', ')
  const lines = [
    'Media Dock Support Diagnostics',
    'This file was created by the user and is never uploaded automatically.',
    'Privacy: Cookie values, sign-in credentials, media paths, home-directory details, task titles, and URL queries are excluded.',
    '',
    '[Application]',
    `generated: ${input.generatedAt}`,
    `app version: ${input.appVersion}`,
    `UI language: ${input.uiLanguage}`,
    `platform: ${input.platform.name} ${input.platform.release} ${input.platform.arch}`,
    `Electron: ${input.processVersions.electron}`,
    `Chrome: ${input.processVersions.chrome}`,
    `Node.js: ${input.processVersions.node}`,
    '',
    '[Managed runtimes]',
    `FFmpeg: ${input.runtimes.ffmpeg}`,
    `FFprobe: ${input.runtimes.ffprobe}`,
    `yt-dlp: ${input.runtimes.ytDlp}`,
    `Deno: ${input.runtimes.deno ?? 'not installed'}`,
    '',
    '[Workspace]',
    `revision: ${input.workspace.revision}`,
    `task batches: ${input.workspace.taskBatches.length}`,
    `tasks: ${input.workspace.tasks.length} (${stateCounts})`,
    `deliverables: ${input.workspace.deliverables.length}`,
    `system operations: ${input.workspace.systemOperations.length}`,
    `authentication profiles: ${input.workspace.authenticationProfiles.length}`,
    `services: ${services.length > 0 ? services.join(', ') : 'none'}`,
    '',
    `[Recent tasks: ${tasks.length}]`,
  ]
  if (tasks.length === 0) lines.push('none')
  tasks.forEach((task, index) => {
    lines.push(
      `task ${index + 1}: state=${task.state}; stage=${task.stage ?? 'none'}; source=${sourceSummary(task.plan.source)}; recipe=${task.plan.recipe.id}; updated=${task.updatedAt}`,
      `  quality: ${task.plan.videoQuality?.mode === 'max-height' ? `${task.plan.videoQuality.height}p ceiling` : task.plan.videoQuality?.mode ?? 'not recorded'}`,
      `  runtimes: FFmpeg=${task.plan.runtimeVersions.ffmpeg}; yt-dlp=${task.plan.runtimeVersions.ytDlp ?? 'not used'}; Deno=${task.plan.runtimeVersions.deno ?? 'not used'}`,
      `  problem: ${task.problem ? `${task.problem.code}; category=${task.problem.category}; stage=${task.problem.stage}` : 'none'}`,
    )
  })
  lines.push('', '[Most recent UI error]')
  lines.push(input.recentError ? redactDiagnosticText(input.recentError, input.homeDirectory) : 'none recorded')
  return `${lines.join('\n')}\n`
}
