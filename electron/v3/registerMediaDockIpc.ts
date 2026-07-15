import type { MediaTaskEngine, PlanTaskInput, TaskPlan } from './mediaTaskEngine.js'

export const MEDIA_DOCK_V3_CHANNELS = Object.freeze({
  getWorkspace: 'media-dock:v3:get-workspace',
  pickLocalSource: 'media-dock:v3:pick-local-source',
  pickLocalSources: 'media-dock:v3:pick-local-sources',
  pickOutputDirectory: 'media-dock:v3:pick-output-directory',
  importAuthenticationProfile: 'media-dock:v3:import-authentication-profile',
  openMediaCookiesResource: 'media-dock:v3:open-mediacookies-resource',
  inspectSource: 'media-dock:v3:inspect-source',
  inspectVideoQualities: 'media-dock:v3:inspect-video-qualities',
  planTask: 'media-dock:v3:plan-task',
  createTask: 'media-dock:v3:create-task',
  createTaskBatch: 'media-dock:v3:create-task-batch',
  runTask: 'media-dock:v3:run-task',
  runTaskBatch: 'media-dock:v3:run-task-batch',
  cancelTask: 'media-dock:v3:cancel-task',
  clearTaskHistory: 'media-dock:v3:clear-task-history',
  revealDeliverable: 'media-dock:v3:reveal-deliverable',
  checkRuntimeUpdates: 'media-dock:v3:check-runtime-updates',
  exportSupportDiagnostics: 'media-dock:v3:export-support-diagnostics',
  workspaceChanged: 'media-dock:v3:workspace-changed',
})

type IpcRegistrar = Readonly<{
  handle(channel: string, listener: (event: unknown, payload?: unknown) => unknown): void
  removeHandler(channel: string): void
}>

type WorkspaceTarget = Readonly<{
  send(channel: string, payload: unknown): void
}>

type MediaDockV3Pickers = Readonly<{
  pickLocalSource(currentPath: string | undefined): Promise<string | null>
  pickLocalSources(currentPath: string | undefined): Promise<readonly string[]>
  pickOutputDirectory(currentPath: string | undefined): Promise<string | null>
  importAuthenticationProfile(): Promise<ReturnType<MediaTaskEngine['getWorkspaceSnapshot']> | null>
  openMediaCookiesResource(resource: 'chrome-store' | 'github'): Promise<void>
  revealDeliverable(deliverableId: string): Promise<void>
  checkRuntimeUpdates(): Promise<unknown>
  exportSupportDiagnostics(input: Readonly<{ language: 'zh-CN' | 'en'; recentError?: string }>): Promise<string | null>
}>

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`)
  }
  return value as Record<string, unknown>
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`)
  }
  return value
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined
  }
  return requireString(value, label)
}

function parseMediaCookiesResource(value: unknown): 'chrome-store' | 'github' {
  if (value === 'chrome-store' || value === 'github') return value
  throw new TypeError('MediaCookies resource is unsupported.')
}

function parseSupportDiagnosticsInput(value: unknown): Readonly<{ language: 'zh-CN' | 'en'; recentError?: string }> {
  const input = requireRecord(value, 'Support diagnostics input')
  if (input.language !== 'zh-CN' && input.language !== 'en') {
    throw new TypeError('Support diagnostics language must be zh-CN or en.')
  }
  if (input.recentError !== undefined && typeof input.recentError !== 'string') {
    throw new TypeError('Support diagnostics recent error must be a string.')
  }
  return Object.freeze({
    language: input.language,
    ...(typeof input.recentError === 'string' && input.recentError.length > 0
      ? { recentError: input.recentError.slice(0, 8_000) }
      : {}),
  })
}

function parseSourceInput(value: unknown) {
  const input = requireRecord(value, 'Source input')
  if (input.kind === 'local-file') {
    return Object.freeze({
      kind: 'local-file' as const,
      path: requireString(input.path, 'Source path'),
    })
  }
  if (input.kind === 'network-url') {
    return Object.freeze({
      kind: 'network-url' as const,
      url: requireString(input.url, 'Source URL'),
    })
  }
  throw new TypeError('Source input kind must be local-file or network-url.')
}

function parseInspectedSource(value: unknown): PlanTaskInput['source'] {
  const source = requireRecord(value, 'Inspected Source')
  if (source.kind !== 'local-file' && source.kind !== 'local-av-pair' && source.kind !== 'network-url') {
    throw new TypeError('Inspected Source kind is unsupported.')
  }
  if (!['video', 'audio', 'unknown'].includes(String(source.mediaKind))) {
    throw new TypeError('Inspected Source mediaKind is unsupported.')
  }
  if (source.durationSeconds !== null && typeof source.durationSeconds !== 'number') {
    throw new TypeError('Inspected Source durationSeconds must be a number or null.')
  }
  if (source.kind === 'local-av-pair') {
    if (source.mediaKind !== 'video') throw new TypeError('Local media pair mediaKind must be video.')
    if (source.formatName !== 'video + audio') throw new TypeError('Local media pair formatName is unsupported.')
    const locator = requireString(source.locator, 'Source locator')
    const videoPath = requireString(source.videoPath, 'Video source path')
    if (locator !== videoPath) throw new TypeError('Local media pair locator must match its video source path.')
    return Object.freeze({
      kind: 'local-av-pair',
      locator,
      videoPath,
      audioPath: requireString(source.audioPath, 'Audio source path'),
      displayName: requireString(source.displayName, 'Source displayName'),
      mediaKind: 'video',
      durationSeconds: source.durationSeconds as number | null,
      formatName: 'video + audio',
    })
  }
  const common = {
    locator: requireString(source.locator, 'Source locator'),
    displayName: requireString(source.displayName, 'Source displayName'),
    mediaKind: source.mediaKind as PlanTaskInput['source']['mediaKind'],
    durationSeconds: source.durationSeconds as number | null,
    formatName: requireString(source.formatName, 'Source formatName'),
  }
  if (source.kind === 'network-url') {
    if (source.mediaKind !== 'video' && source.mediaKind !== 'audio') {
      throw new TypeError('Network Source mediaKind must be video or audio.')
    }
    return Object.freeze({
      kind: 'network-url',
      ...common,
      mediaKind: source.mediaKind as 'video' | 'audio',
      sourceId: requireString(source.sourceId, 'Source id'),
      serviceName: requireString(source.serviceName, 'Source serviceName'),
    })
  }
  if (source.startTimeSeconds !== undefined && source.startTimeSeconds !== null
    && (typeof source.startTimeSeconds !== 'number' || !Number.isFinite(source.startTimeSeconds))) {
    throw new TypeError('Local media startTimeSeconds must be a finite number or null.')
  }
  return Object.freeze({
    kind: 'local-file',
    ...common,
    ...(source.startTimeSeconds === undefined
      ? {}
      : { startTimeSeconds: source.startTimeSeconds as number | null }),
  })
}

function parsePlanTaskInput(value: unknown): PlanTaskInput {
  const input = requireRecord(value, 'Task Plan input')
  if (!['video-compatible', 'audio-compatible', 'keep-original', 'network-video', 'merge-fast', 'merge-compatible', 'merge-resolve'].includes(String(input.recipeId))) {
    throw new TypeError('Task Plan recipeId is unsupported.')
  }
  if (input.language !== 'zh-CN' && input.language !== 'en') {
    throw new TypeError('Task Plan language must be zh-CN or en.')
  }
  return Object.freeze({
    source: parseInspectedSource(input.source),
    recipeId: input.recipeId as PlanTaskInput['recipeId'],
    outputDirectory: requireString(input.outputDirectory, 'Task Plan outputDirectory'),
    language: input.language,
    ...(input.videoQuality === undefined ? {} : { videoQuality: parseVideoQuality(input.videoQuality, 'Task Plan videoQuality') }),
  })
}

function parseVideoQuality(value: unknown, label: string): NonNullable<PlanTaskInput['videoQuality']> {
  const quality = requireRecord(value, label)
  if (quality.mode === 'best') return Object.freeze({ mode: 'best' })
  if (quality.mode === 'max-height' && Number.isInteger(quality.height) && Number(quality.height) >= 144 && Number(quality.height) <= 8640) {
    return Object.freeze({ mode: 'max-height', height: Number(quality.height) })
  }
  throw new TypeError(`${label} is unsupported.`)
}

function parseTaskPlan(value: unknown): TaskPlan {
  const plan = requireRecord(value, 'Task Plan')
  if (plan.planVersion !== 1) {
    throw new TypeError('Task Plan version is unsupported.')
  }
  const recipe = requireRecord(plan.recipe, 'Task Plan recipe')
  if (!['video-compatible', 'audio-compatible', 'keep-original', 'network-video', 'merge-fast', 'merge-compatible', 'merge-resolve'].includes(String(recipe.id))) {
    throw new TypeError('Task Plan recipe is unsupported.')
  }
  if (!['video', 'audio', 'source'].includes(String(recipe.deliverableKind))) {
    throw new TypeError('Task Plan deliverable kind is unsupported.')
  }
  if (!Array.isArray(plan.steps)) {
    throw new TypeError('Task Plan steps must be an array.')
  }
  const runtimeVersions = requireRecord(plan.runtimeVersions, 'Task Plan runtimeVersions')

  return Object.freeze({
    planVersion: 1,
    source: parseInspectedSource(plan.source),
    recipe: Object.freeze({
      id: recipe.id as TaskPlan['recipe']['id'],
      deliverableKind: recipe.deliverableKind as TaskPlan['recipe']['deliverableKind'],
      extension: requireString(recipe.extension, 'Task Plan recipe extension'),
    }),
    outputDirectory: requireString(plan.outputDirectory, 'Task Plan outputDirectory'),
    deliveryName: requireString(plan.deliveryName, 'Task Plan deliveryName'),
    steps: Object.freeze(plan.steps.map((value, index) => {
      const step = requireRecord(value, `Task Plan step ${index + 1}`)
      return Object.freeze({
        id: requireString(step.id, `Task Plan step ${index + 1} id`) as TaskPlan['steps'][number]['id'],
        stage: requireString(step.stage, `Task Plan step ${index + 1} stage`) as TaskPlan['steps'][number]['stage'],
        ...(step.runtime === undefined
          ? {}
          : { runtime: requireString(step.runtime, `Task Plan step ${index + 1} runtime`) as 'ffmpeg' | 'yt-dlp' }),
      })
    })),
    runtimeVersions: Object.freeze({
      ffmpeg: requireString(runtimeVersions.ffmpeg, 'Task Plan FFmpeg version'),
      ...(runtimeVersions.ytDlp === undefined
        ? {}
        : { ytDlp: requireString(runtimeVersions.ytDlp, 'Task Plan yt-dlp version') }),
      ...(runtimeVersions.deno === undefined
        ? {}
        : { deno: requireString(runtimeVersions.deno, 'Task Plan Deno version') }),
    }),
    ...(plan.authenticationProfileId === undefined
      ? {}
      : { authenticationProfileId: requireString(plan.authenticationProfileId, 'Task Plan Authentication Profile id') }),
    ...(plan.videoQuality === undefined
      ? {}
      : { videoQuality: parseVideoQuality(plan.videoQuality, 'Task Plan videoQuality') }),
  })
}

function parseTaskBatch(value: unknown): Readonly<{ plans: readonly TaskPlan[]; schedulingProfile: 'safe' | 'balanced' | 'fast' }> {
  const batch = requireRecord(value, 'Task Batch')
  if (!Array.isArray(batch.plans) || batch.plans.length === 0) {
    throw new TypeError('Task Batch plans must be a non-empty array.')
  }
  if (batch.schedulingProfile !== 'safe' && batch.schedulingProfile !== 'balanced' && batch.schedulingProfile !== 'fast') {
    throw new TypeError('Task Batch Scheduling Profile is unsupported.')
  }
  return Object.freeze({
    plans: Object.freeze(batch.plans.map(parseTaskPlan)),
    schedulingProfile: batch.schedulingProfile,
  })
}

export function registerMediaDockV3Ipc(
  ipc: IpcRegistrar,
  engine: MediaTaskEngine,
  getWorkspaceTargets: () => readonly WorkspaceTarget[],
  pickers: MediaDockV3Pickers,
): () => void {
  ipc.handle(MEDIA_DOCK_V3_CHANNELS.getWorkspace, () => engine.getWorkspaceSnapshot())
  ipc.handle(MEDIA_DOCK_V3_CHANNELS.pickLocalSource, (_event, payload) => pickers.pickLocalSource(optionalString(payload, 'Current source path')))
  ipc.handle(MEDIA_DOCK_V3_CHANNELS.pickLocalSources, (_event, payload) => pickers.pickLocalSources(optionalString(payload, 'Current source path')))
  ipc.handle(MEDIA_DOCK_V3_CHANNELS.pickOutputDirectory, (_event, payload) => pickers.pickOutputDirectory(optionalString(payload, 'Current output directory')))
  ipc.handle(MEDIA_DOCK_V3_CHANNELS.importAuthenticationProfile, () => pickers.importAuthenticationProfile())
  ipc.handle(MEDIA_DOCK_V3_CHANNELS.openMediaCookiesResource, (_event, payload) => pickers.openMediaCookiesResource(parseMediaCookiesResource(payload)))
  ipc.handle(MEDIA_DOCK_V3_CHANNELS.inspectSource, (_event, payload) => engine.inspectSource(parseSourceInput(payload)))
  ipc.handle(MEDIA_DOCK_V3_CHANNELS.inspectVideoQualities, (_event, payload) => {
    const source = parseInspectedSource(payload)
    if (source.kind !== 'network-url') throw new TypeError('Video quality inspection requires a network source.')
    return engine.inspectVideoQualities(source)
  })
  ipc.handle(MEDIA_DOCK_V3_CHANNELS.planTask, (_event, payload) => engine.planTask(parsePlanTaskInput(payload)))
  ipc.handle(MEDIA_DOCK_V3_CHANNELS.createTask, (_event, payload) => engine.createTask(parseTaskPlan(payload)))
  ipc.handle(MEDIA_DOCK_V3_CHANNELS.createTaskBatch, (_event, payload) => {
    const batch = parseTaskBatch(payload)
    return engine.createTaskBatch(batch.plans, batch.schedulingProfile)
  })
  ipc.handle(MEDIA_DOCK_V3_CHANNELS.runTask, (_event, payload) => engine.runTask(requireString(payload, 'Media Task id')))
  ipc.handle(MEDIA_DOCK_V3_CHANNELS.runTaskBatch, (_event, payload) => engine.runTaskBatch(requireString(payload, 'Task Batch id')))
  ipc.handle(MEDIA_DOCK_V3_CHANNELS.cancelTask, (_event, payload) => engine.cancelTask(requireString(payload, 'Media Task id')))
  ipc.handle(MEDIA_DOCK_V3_CHANNELS.clearTaskHistory, () => engine.clearTaskHistory())
  ipc.handle(MEDIA_DOCK_V3_CHANNELS.revealDeliverable, (_event, payload) => pickers.revealDeliverable(requireString(payload, 'Deliverable id')))
  ipc.handle(MEDIA_DOCK_V3_CHANNELS.checkRuntimeUpdates, () => pickers.checkRuntimeUpdates())
  ipc.handle(MEDIA_DOCK_V3_CHANNELS.exportSupportDiagnostics, (_event, payload) => pickers.exportSupportDiagnostics(parseSupportDiagnosticsInput(payload)))

  const unsubscribe = engine.subscribeWorkspace((snapshot) => {
    for (const target of getWorkspaceTargets()) {
      target.send(MEDIA_DOCK_V3_CHANNELS.workspaceChanged, snapshot)
    }
  })

  return () => {
    unsubscribe()
    ipc.removeHandler(MEDIA_DOCK_V3_CHANNELS.getWorkspace)
    ipc.removeHandler(MEDIA_DOCK_V3_CHANNELS.pickLocalSource)
    ipc.removeHandler(MEDIA_DOCK_V3_CHANNELS.pickLocalSources)
    ipc.removeHandler(MEDIA_DOCK_V3_CHANNELS.pickOutputDirectory)
    ipc.removeHandler(MEDIA_DOCK_V3_CHANNELS.importAuthenticationProfile)
    ipc.removeHandler(MEDIA_DOCK_V3_CHANNELS.openMediaCookiesResource)
    ipc.removeHandler(MEDIA_DOCK_V3_CHANNELS.inspectSource)
    ipc.removeHandler(MEDIA_DOCK_V3_CHANNELS.inspectVideoQualities)
    ipc.removeHandler(MEDIA_DOCK_V3_CHANNELS.planTask)
    ipc.removeHandler(MEDIA_DOCK_V3_CHANNELS.createTask)
    ipc.removeHandler(MEDIA_DOCK_V3_CHANNELS.createTaskBatch)
    ipc.removeHandler(MEDIA_DOCK_V3_CHANNELS.runTask)
    ipc.removeHandler(MEDIA_DOCK_V3_CHANNELS.runTaskBatch)
    ipc.removeHandler(MEDIA_DOCK_V3_CHANNELS.cancelTask)
    ipc.removeHandler(MEDIA_DOCK_V3_CHANNELS.clearTaskHistory)
    ipc.removeHandler(MEDIA_DOCK_V3_CHANNELS.revealDeliverable)
    ipc.removeHandler(MEDIA_DOCK_V3_CHANNELS.checkRuntimeUpdates)
    ipc.removeHandler(MEDIA_DOCK_V3_CHANNELS.exportSupportDiagnostics)
  }
}
