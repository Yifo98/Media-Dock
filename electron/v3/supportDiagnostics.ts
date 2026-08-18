import type { MediaTaskSnapshot, TaskDiagnosticEvidence, WorkspaceSnapshot } from './mediaTaskEngine.js'
import { redactDiagnosticText } from './diagnosticRedaction.js'

export { redactDiagnosticText } from './diagnosticRedaction.js'

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

function sourceSummary(source: WorkspaceSnapshot['tasks'][number]['plan']['source']) {
  if (source.kind === 'network-url') return `network-url (${source.serviceName})`
  return source.kind
}

export type TaskDiagnosticsInput = Readonly<{
  generatedAt: string
  appVersion: string
  uiLanguage: 'zh-CN' | 'en'
  platform: Readonly<{ name: string; release: string; arch: string }>
  processVersions: Readonly<{ electron: string; chrome: string; node: string }>
  runtimes: Readonly<{ ffmpeg: string; ffprobe: string; ytDlp: string; deno: string | null }>
  homeDirectory: string
  task: MediaTaskSnapshot
  diagnosticEvidence: TaskDiagnosticEvidence | null
}>

export function buildSanitizedTaskDiagnostics(input: TaskDiagnosticsInput) {
  const task = input.task
  const quality = task.plan.videoQuality?.mode === 'max-height'
    ? `${task.plan.videoQuality.height}p ceiling`
    : task.plan.videoQuality?.mode ?? 'not recorded'
  const lines = [
    'Media Dock Task Diagnostics',
    'This file was created by the user for one selected task and is never uploaded automatically.',
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
    '[Active managed runtimes]',
    `FFmpeg: ${input.runtimes.ffmpeg}`,
    `FFprobe: ${input.runtimes.ffprobe}`,
    `yt-dlp: ${input.runtimes.ytDlp}`,
    `Deno: ${input.runtimes.deno ?? 'not installed'}`,
    '',
    '[Selected task]',
    `task reference: ${task.id}`,
    `state: ${task.state}`,
    `stage: ${task.stage ?? 'none'}`,
    `created: ${task.createdAt}`,
    `updated: ${task.updatedAt}`,
    `source: ${sourceSummary(task.plan.source)}`,
    `recipe: ${task.plan.recipe.id}`,
    `quality: ${quality}`,
    `authentication used: ${task.plan.authenticationProfileId ? 'yes' : 'no'}`,
    `pinned runtimes: FFmpeg=${task.plan.runtimeVersions.ffmpeg}; yt-dlp=${task.plan.runtimeVersions.ytDlp ?? 'not used'}; Deno=${task.plan.runtimeVersions.deno ?? 'not used'}`,
    `problem: ${task.problem ? `${task.problem.code}; category=${task.problem.category}; stage=${task.problem.stage}` : 'none'}`,
    ...(task.progress ? [
      `last progress: kind=${task.progress.mediaKind}; percent=${task.progress.percent}; downloaded=${task.progress.downloaded}; total=${task.progress.total}; speed=${task.progress.speed}; eta=${task.progress.eta}`,
    ] : []),
    '',
    '[Bounded diagnostic evidence]',
    input.diagnosticEvidence
      ? `recorded: ${input.diagnosticEvidence.recordedAt}\n${redactDiagnosticText(input.diagnosticEvidence.detail, input.homeDirectory)}`
      : 'No process error was recorded for this task. Older tasks may not have retained diagnostic evidence.',
  ]
  return `${lines.join('\n')}\n`
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
