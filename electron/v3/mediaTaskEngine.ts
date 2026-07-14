import { constants, mkdirSync } from 'node:fs'
import { access, mkdir, rename, rm, rmdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

import { runRuntimeProcessCollectOutput } from '../core/runtimeProcess.js'
import {
  authenticationServiceMatches,
  copyAuthenticationPackage,
  inspectAuthenticationPackage,
} from './authenticationProfiles.js'
import { sanitizeDeliveryFileName } from './deliveryNaming.js'
import { getLocalMediaRecipeOptions, inspectLocalMediaSource } from './localMediaSourceAdapter.js'
import { inspectNetworkCollectionSource, type NetworkCollectionResolver } from './networkCollectionSourceAdapter.js'
import { getNetworkMediaRecipeOptions, inspectNetworkMediaSource, inspectNetworkVideoQualities } from './networkMediaSourceAdapter.js'
import { runScheduledTaskBatch, type SchedulingProfile } from './taskBatchScheduler.js'

export const MEDIA_DOCK_CONTRACT_VERSION = 1 as const

export type DeliverableSnapshot = Readonly<{
  id: string
  taskId: string
  path: string
  deliveryName: string
  createdAt: string
}>

export type SystemOperationSnapshot = Readonly<{
  id: string
}>

export type AuthenticationProfileSnapshot = Readonly<{
  id: string
  displayName: string
  services: readonly string[]
  health: 'ready'
  createdAt: string
}>

export type LocalFileSourceInput = Readonly<{
  kind: 'local-file'
  path: string
}>

export type NetworkUrlSourceInput = Readonly<{
  kind: 'network-url'
  url: string
}>

export type SourceInput = LocalFileSourceInput | NetworkUrlSourceInput

export type InspectedLocalSource = Readonly<{
  kind: 'local-file'
  locator: string
  displayName: string
  mediaKind: 'video' | 'audio' | 'unknown'
  durationSeconds: number | null
  startTimeSeconds?: number | null
  formatName: string
}>

export type InspectedNetworkSource = Readonly<{
  kind: 'network-url'
  locator: string
  displayName: string
  mediaKind: 'video' | 'audio'
  durationSeconds: number | null
  formatName: string
  sourceId: string
  serviceName: string
}>

export type InspectedLocalAvPairSource = Readonly<{
  kind: 'local-av-pair'
  locator: string
  videoPath: string
  audioPath: string
  displayName: string
  mediaKind: 'video'
  durationSeconds: number | null
  formatName: 'video + audio'
}>

export type InspectedTaskSource = InspectedLocalSource | InspectedLocalAvPairSource | InspectedNetworkSource

export type InspectedNetworkCollectionSource = Readonly<{
  kind: 'network-collection'
  locator: string
  displayName: string
  mediaKind: 'video'
  durationSeconds: null
  formatName: 'collection'
  collectionId: string
  serviceName: string
  groups: readonly Readonly<{
    id: string
    title: string
    entries: readonly Readonly<{
      id: string
      title: string
      subtitle: string
      badge: string
      defaultSelected: boolean
      source: InspectedNetworkSource
    }>[]
  }>[]
}>

export type InspectedSource = InspectedTaskSource | InspectedNetworkCollectionSource

export type DeliverableRecipeOption = Readonly<{
  id: 'video-compatible' | 'audio-compatible' | 'keep-original' | 'network-video' | 'merge-fast' | 'merge-compatible' | 'merge-resolve'
  deliverableKind: 'video' | 'audio' | 'source'
  extension: string
}>

export type ReadySourceInspection = Readonly<{
  status: 'ready'
  source: InspectedSource
  recipes: readonly DeliverableRecipeOption[]
}>

export type ProblemAction = Readonly<{
  id: string
  kind: 'choose-source' | 'retry-task'
}>

export type ProblemSnapshot = Readonly<{
  code: string
  category: 'source' | 'media-processing'
  stage: 'preparing' | 'acquiring' | 'processing' | 'delivering'
  titleKey: string
  summaryKey: string
  actions: readonly ProblemAction[]
}>

export type NeedsAttentionSourceInspection = Readonly<{
  status: 'needs-attention'
  problem: ProblemSnapshot
}>

export type SourceInspection = ReadySourceInspection | NeedsAttentionSourceInspection

export type TaskPlanStep = Readonly<{
  id: 'verify-input' | 'transcode-audio' | 'acquire-network' | 'merge-media' | 'deliver'
  stage: 'preparing' | 'acquiring' | 'processing' | 'delivering'
  runtime?: 'ffmpeg' | 'yt-dlp'
}>

export type TaskPlan = Readonly<{
  planVersion: 1
  source: InspectedTaskSource
  recipe: DeliverableRecipeOption
  outputDirectory: string
  deliveryName: string
  steps: readonly TaskPlanStep[]
  runtimeVersions: Readonly<{
    ffmpeg: string
    ytDlp?: string
    deno?: string
  }>
  authenticationProfileId?: string
  videoQuality?: VideoQualityPreference
}>

export type VideoQualityPreference = Readonly<
  { mode: 'best' }
  | { mode: 'max-height'; height: number }
>

export type VideoQualityInspection = Readonly<{
  availableHeights: readonly number[]
  qualityOptions: readonly Readonly<{ height: number; estimatedBytes: number | null }>[]
  authenticationProfileId: string | null
  authenticationProfileDisplayName: string | null
}>

export type MediaTaskProgress = Readonly<{
  mediaKind: 'video' | 'audio' | 'media'
  percent: number
  downloaded: string
  total: string
  speed: string
  eta: string
}>

export type MediaTaskSnapshot = Readonly<{
  id: string
  state: 'queued' | 'running' | 'needs-attention' | 'completed' | 'cancelled'
  stage: 'preparing' | 'acquiring' | 'processing' | 'delivering' | null
  createdAt: string
  updatedAt: string
  plan: TaskPlan
  problem: ProblemSnapshot | null
  progress?: MediaTaskProgress
}>

export type TaskBatchSnapshot = Readonly<{
  id: string
  schedulingProfile: SchedulingProfile
  createdAt: string
  taskIds: readonly string[]
}>

export type PlanTaskInput = Readonly<{
  source: InspectedTaskSource
  recipeId: DeliverableRecipeOption['id']
  outputDirectory: string
  language: 'zh-CN' | 'en'
  videoQuality?: VideoQualityPreference
}>

export type ManagedRuntimeReference = Readonly<{
  command: string
  argsPrefix?: readonly string[]
  version: string
}>

export type WorkspaceSnapshot = Readonly<{
  contractVersion: typeof MEDIA_DOCK_CONTRACT_VERSION
  revision: number
  taskBatches: readonly TaskBatchSnapshot[]
  tasks: readonly MediaTaskSnapshot[]
  deliverables: readonly DeliverableSnapshot[]
  authenticationProfiles: readonly AuthenticationProfileSnapshot[]
  systemOperations: readonly SystemOperationSnapshot[]
}>

export type MediaTaskEngine = Readonly<{
  inspectSource(input: SourceInput): Promise<SourceInspection>
  inspectVideoQualities(source: InspectedNetworkSource): Promise<VideoQualityInspection>
  planTask(input: PlanTaskInput): Promise<TaskPlan>
  importAuthenticationPackage(input: Readonly<{ sourceDirectory: string; displayName: string }>): Promise<WorkspaceSnapshot>
  createTask(plan: TaskPlan): WorkspaceSnapshot
  createTaskBatch(plans: readonly TaskPlan[], schedulingProfile: SchedulingProfile): WorkspaceSnapshot
  startTask(taskId: string): WorkspaceSnapshot
  cancelTask(taskId: string): WorkspaceSnapshot
  runTask(taskId: string): Promise<WorkspaceSnapshot>
  runTaskBatch(batchId: string): Promise<WorkspaceSnapshot>
  clearTaskHistory(): Promise<WorkspaceSnapshot>
  subscribeWorkspace(listener: (snapshot: WorkspaceSnapshot) => void): () => void
  getWorkspaceSnapshot(): WorkspaceSnapshot
  close(): void
}>

export type CreateMediaTaskEngineOptions = Readonly<{
  dataDirectory: string
  managedRuntimes?: Readonly<{
    ffprobe?: ManagedRuntimeReference
    ffmpeg?: ManagedRuntimeReference
    ytDlp?: ManagedRuntimeReference
    deno?: ManagedRuntimeReference
  }>
  resolveCollection?: NetworkCollectionResolver
  idFactory?: (kind: 'task' | 'task-batch' | 'deliverable' | 'authentication-profile') => string
  now?: () => Date
}>

type RevisionRow = Readonly<{
  revision: number
}>

type MediaTaskRow = Readonly<{
  id: string
  state: MediaTaskSnapshot['state']
  stage: MediaTaskSnapshot['stage']
  created_at: string
  updated_at: string
  plan_json: string
  problem_json: string | null
}>

type DeliverableRow = Readonly<{
  id: string
  task_id: string
  path: string
  delivery_name: string
  created_at: string
}>

type AuthenticationProfileRow = Readonly<{
  id: string
  display_name: string
  services_json: string
  directory_name: string
  created_at: string
}>

type TaskBatchRow = Readonly<{
  id: string
  scheduling_profile: SchedulingProfile
  created_at: string
}>

function readRevision(database: DatabaseSync): number {
  const row = database
    .prepare('SELECT revision FROM workspace_metadata WHERE singleton = 1')
    .get() as RevisionRow | undefined

  if (!row) {
    throw new Error('Media Dock workspace metadata is missing.')
  }

  return row.revision
}

function freezeTaskPlan(plan: TaskPlan): TaskPlan {
  return Object.freeze({
    ...plan,
    source: Object.freeze({ ...plan.source }),
    recipe: Object.freeze({ ...plan.recipe }),
    steps: Object.freeze(plan.steps.map((step) => Object.freeze({ ...step }))),
    runtimeVersions: Object.freeze({ ...plan.runtimeVersions }),
    ...(plan.videoQuality ? { videoQuality: Object.freeze({ ...plan.videoQuality }) } : {}),
  })
}

function readTasks(
  database: DatabaseSync,
  taskProgresses: ReadonlyMap<string, MediaTaskProgress> = new Map(),
): readonly MediaTaskSnapshot[] {
  const rows = database.prepare(`
    SELECT id, state, stage, created_at, updated_at, plan_json, problem_json
    FROM media_tasks
    ORDER BY created_at ASC, id ASC
  `).all() as MediaTaskRow[]

  return Object.freeze(rows.map((row) => Object.freeze({
    id: row.id,
    state: row.state,
    stage: row.stage,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    plan: freezeTaskPlan(JSON.parse(row.plan_json) as TaskPlan),
    problem: row.problem_json ? Object.freeze(JSON.parse(row.problem_json) as ProblemSnapshot) : null,
    ...(taskProgresses.get(row.id) ? { progress: taskProgresses.get(row.id) } : {}),
  })))
}

function readDeliverables(database: DatabaseSync): readonly DeliverableSnapshot[] {
  const rows = database.prepare(`
    SELECT id, task_id, path, delivery_name, created_at
    FROM deliverables
    ORDER BY created_at ASC, id ASC
  `).all() as DeliverableRow[]

  return Object.freeze(rows.map((row) => Object.freeze({
    id: row.id,
    taskId: row.task_id,
    path: row.path,
    deliveryName: row.delivery_name,
    createdAt: row.created_at,
  })))
}

function readAuthenticationProfiles(database: DatabaseSync): readonly AuthenticationProfileSnapshot[] {
  const rows = database.prepare(`
    SELECT id, display_name, services_json, directory_name, created_at
    FROM authentication_profiles
    ORDER BY created_at ASC, id ASC
  `).all() as AuthenticationProfileRow[]

  return Object.freeze(rows.map((row) => Object.freeze({
    id: row.id,
    displayName: row.display_name,
    services: Object.freeze(JSON.parse(row.services_json) as string[]),
    health: 'ready' as const,
    createdAt: row.created_at,
  })))
}

function readTaskBatches(database: DatabaseSync): readonly TaskBatchSnapshot[] {
  const rows = database.prepare(`
    SELECT id, scheduling_profile, created_at
    FROM task_batches
    ORDER BY created_at ASC, id ASC
  `).all() as TaskBatchRow[]
  const readMembers = database.prepare(`
    SELECT task_id
    FROM task_batch_members
    WHERE batch_id = ?
    ORDER BY position ASC
  `)

  return Object.freeze(rows.map((row) => Object.freeze({
    id: row.id,
    schedulingProfile: row.scheduling_profile,
    createdAt: row.created_at,
    taskIds: Object.freeze((readMembers.all(row.id) as { task_id: string }[]).map((member) => member.task_id)),
  })))
}

function readWorkspaceSnapshot(
  database: DatabaseSync,
  taskProgresses: ReadonlyMap<string, MediaTaskProgress> = new Map(),
): WorkspaceSnapshot {
  return Object.freeze({
    contractVersion: MEDIA_DOCK_CONTRACT_VERSION,
    revision: readRevision(database),
    taskBatches: readTaskBatches(database),
    tasks: readTasks(database, taskProgresses),
    deliverables: readDeliverables(database),
    authenticationProfiles: readAuthenticationProfiles(database),
    systemOperations: Object.freeze([]),
  })
}

function parseYtDlpProgressLine(line: string): Readonly<{
  formatId: string
  progress: MediaTaskProgress
}> | null {
  const markerIndex = line.indexOf('PROGRESS|')
  if (markerIndex === -1) return null
  const [,
    formatId = 'unknown',
    videoCodec = 'none',
    audioCodec = 'none',
    percentText = '',
    downloaded = '--',
    total = '--',
    speed = '--',
    eta = '--',
  ] = line
    .slice(markerIndex)
    .trim()
    .split('|')
  const normalizedPercent = percentText.replace('%', '').trim()
  const normalizedTotal = total.trim().toUpperCase()
  // yt-dlp prefixes estimates with "~" and may report a percentage while the
  // total is unavailable. Those values are useful diagnostics, not a reliable
  // progress bar contract.
  if (normalizedPercent.startsWith('~') || ['', '--', 'NA', 'N/A'].includes(normalizedTotal)) return null
  const percent = Number.parseFloat(normalizedPercent)
  if (!Number.isFinite(percent)) return null
  return Object.freeze({
    formatId,
    progress: Object.freeze({
      mediaKind: videoCodec !== 'none' && videoCodec !== 'NA'
        ? audioCodec !== 'none' && audioCodec !== 'NA' ? 'media' : 'video'
        : audioCodec !== 'none' && audioCodec !== 'NA' ? 'audio' : 'media',
      percent: Math.max(0, Math.min(100, percent)),
      downloaded: downloaded.trim() || '--',
      total: total.trim() || '--',
      speed: speed.trim() || '--',
      eta: eta.trim() || '--',
    }),
  })
}

function findTask(database: DatabaseSync, taskId: string): MediaTaskSnapshot {
  const task = readTasks(database).find((candidate) => candidate.id === taskId)
  if (!task) {
    throw new Error(`Media Task does not exist: ${taskId}`)
  }
  return task
}

function updateTaskExecutionState(
  database: DatabaseSync,
  taskId: string,
  state: MediaTaskSnapshot['state'],
  stage: MediaTaskSnapshot['stage'],
  updatedAt: string,
  problem: ProblemSnapshot | null,
): void {
  database.exec('BEGIN IMMEDIATE')
  try {
    const result = database.prepare(`
      UPDATE media_tasks
      SET state = ?, stage = ?, updated_at = ?, problem_json = ?
      WHERE id = ?
    `).run(state, stage, updatedAt, problem ? JSON.stringify(problem) : null, taskId)
    if (result.changes !== 1) {
      throw new Error(`Media Task does not exist: ${taskId}`)
    }
    database.prepare(`
      UPDATE workspace_metadata
      SET revision = revision + 1
      WHERE singleton = 1
    `).run()
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

function interruptedTaskProblem(stage: NonNullable<MediaTaskSnapshot['stage']>): ProblemSnapshot {
  return Object.freeze({
    code: 'task.interrupted',
    category: 'media-processing',
    stage,
    titleKey: 'problem.taskInterrupted.title',
    summaryKey: 'problem.taskInterrupted.summary',
    actions: Object.freeze([
      Object.freeze({ id: 'retry-task', kind: 'retry-task' }),
    ]),
  })
}

function requiredRuntimeProblem(): ProblemSnapshot {
  return Object.freeze({
    code: 'runtime.required-version-unavailable',
    category: 'media-processing',
    stage: 'preparing',
    titleKey: 'problem.requiredRuntimeUnavailable.title',
    summaryKey: 'problem.requiredRuntimeUnavailable.summary',
    actions: Object.freeze([
      Object.freeze({ id: 'retry-task', kind: 'retry-task' }),
    ]),
  })
}

function recoverAbandonedTasks(database: DatabaseSync, getRecoveredAt: () => string): void {
  const abandoned = database.prepare(`
    SELECT id, state, stage, created_at, updated_at, plan_json, problem_json
    FROM media_tasks
    WHERE state = 'running'
    ORDER BY created_at ASC, id ASC
  `).all() as MediaTaskRow[]
  if (abandoned.length === 0) return
  const recoveredAt = getRecoveredAt()

  database.exec('BEGIN IMMEDIATE')
  try {
    const update = database.prepare(`
      UPDATE media_tasks
      SET state = 'needs-attention', stage = ?, updated_at = ?, problem_json = ?
      WHERE id = ? AND state = 'running'
    `)
    for (const task of abandoned) {
      const stage = task.stage ?? 'preparing'
      update.run(stage, recoveredAt, JSON.stringify(interruptedTaskProblem(stage)), task.id)
    }
    database.prepare(`
      UPDATE workspace_metadata
      SET revision = revision + 1
      WHERE singleton = 1
    `).run()
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

async function pathExists(candidatePath: string): Promise<boolean> {
  try {
    await stat(candidatePath)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false
    }
    throw error
  }
}

async function assertWritableOutputDirectory(outputDirectory: string): Promise<void> {
  const outputStat = await stat(outputDirectory)
  if (!outputStat.isDirectory()) {
    throw new Error(`Output location is not a directory: ${outputDirectory}`)
  }
  await access(outputDirectory, constants.W_OK)
}

function createDeliveryName(source: InspectedTaskSource, recipe: DeliverableRecipeOption, language: PlanTaskInput['language']): string {
  if (source.kind === 'local-file' && recipe.id === 'keep-original') {
    return source.displayName
  }

  const sourceExtension = path.extname(source.displayName)
  const sourceStem = source.kind === 'network-url'
    ? source.displayName
    : path.basename(source.displayName, sourceExtension)
  const role = recipe.id.startsWith('merge-')
    ? language === 'zh-CN' ? '音画合并' : 'Merged'
    : recipe.id === 'audio-compatible'
    ? language === 'zh-CN' ? '音频' : 'Audio'
    : recipe.id === 'network-video'
      ? language === 'zh-CN' ? '视频' : 'Video'
      : language === 'zh-CN' ? '兼容视频' : 'Compatible Video'

  return sanitizeDeliveryFileName(`${sourceStem} - ${role}.${recipe.extension}`)
}

function createTaskPlanSteps(recipe: DeliverableRecipeOption): readonly TaskPlanStep[] {
  if (recipe.id === 'merge-fast' || recipe.id === 'merge-compatible' || recipe.id === 'merge-resolve') {
    return Object.freeze([
      Object.freeze({ id: 'verify-input', stage: 'preparing' }),
      Object.freeze({ id: 'merge-media', stage: 'processing', runtime: 'ffmpeg' }),
      Object.freeze({ id: 'deliver', stage: 'delivering' }),
    ])
  }

  if (recipe.id === 'audio-compatible') {
    return Object.freeze([
      Object.freeze({ id: 'verify-input', stage: 'preparing' }),
      Object.freeze({ id: 'transcode-audio', stage: 'processing', runtime: 'ffmpeg' }),
      Object.freeze({ id: 'deliver', stage: 'delivering' }),
    ])
  }

  if (recipe.id === 'network-video') {
    return Object.freeze([
      Object.freeze({ id: 'verify-input', stage: 'preparing' }),
      Object.freeze({ id: 'acquire-network', stage: 'acquiring', runtime: 'yt-dlp' }),
      Object.freeze({ id: 'deliver', stage: 'delivering' }),
    ])
  }

  throw new Error(`Task planning is not implemented for recipe: ${recipe.id}`)
}

function getMergeRecipeOptions(): readonly DeliverableRecipeOption[] {
  return Object.freeze([
    Object.freeze({ id: 'merge-fast', deliverableKind: 'video', extension: 'mkv' }),
    Object.freeze({ id: 'merge-compatible', deliverableKind: 'video', extension: 'mp4' }),
    Object.freeze({ id: 'merge-resolve', deliverableKind: 'video', extension: 'mov' }),
  ])
}

function createMergeFfmpegArgs(source: InspectedLocalAvPairSource, recipe: DeliverableRecipeOption, outputPath: string): string[] {
  const shared = ['-i', source.videoPath, '-i', source.audioPath, '-map', '0:v:0', '-map', '1:a:0', '-shortest']
  if (recipe.id === 'merge-fast') return [...shared, '-c', 'copy', outputPath]
  if (recipe.id === 'merge-compatible') {
    return [...shared, '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', outputPath]
  }
  if (recipe.id === 'merge-resolve') {
    return [...shared, '-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le', '-c:a', 'pcm_s24le', outputPath]
  }
  throw new Error(`Merge execution is not implemented for recipe: ${recipe.id}`)
}

function inferAuthenticationServiceFromUrl(sourceUrl: string): string | null {
  try {
    const hostname = new URL(sourceUrl).hostname.toLowerCase()
    if (hostname.includes('youtube') || hostname === 'youtu.be') return 'YouTube'
    if (hostname.includes('bilibili')) return 'Bilibili'
    if (hostname.includes('douyin')) return 'Douyin'
    if (hostname.includes('tiktok')) return 'TikTok'
    if (hostname.includes('instagram')) return 'Instagram'
    return null
  } catch {
    return null
  }
}

export function createMediaTaskEngine(options: CreateMediaTaskEngineOptions): MediaTaskEngine {
  mkdirSync(options.dataDirectory, { recursive: true })

  const databasePath = path.join(options.dataDirectory, 'media-dock-v3.sqlite')
  const database = new DatabaseSync(databasePath)

  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS workspace_metadata (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      revision INTEGER NOT NULL CHECK (revision >= 0)
    ) STRICT;

    INSERT INTO workspace_metadata (singleton, revision)
    VALUES (1, 0)
    ON CONFLICT (singleton) DO NOTHING;

    CREATE TABLE IF NOT EXISTS media_tasks (
      id TEXT PRIMARY KEY,
      state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'needs-attention', 'completed', 'cancelled')),
      stage TEXT CHECK (stage IS NULL OR stage IN ('preparing', 'acquiring', 'processing', 'delivering')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      plan_json TEXT NOT NULL,
      problem_json TEXT
    ) STRICT;

    CREATE TABLE IF NOT EXISTS deliverables (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES media_tasks(id),
      path TEXT NOT NULL UNIQUE,
      delivery_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS authentication_profiles (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      services_json TEXT NOT NULL,
      directory_name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS task_batches (
      id TEXT PRIMARY KEY,
      scheduling_profile TEXT NOT NULL CHECK (scheduling_profile IN ('safe', 'balanced', 'fast')),
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS task_batch_members (
      batch_id TEXT NOT NULL REFERENCES task_batches(id) ON DELETE CASCADE,
      task_id TEXT NOT NULL UNIQUE REFERENCES media_tasks(id) ON DELETE CASCADE,
      position INTEGER NOT NULL CHECK (position >= 0),
      PRIMARY KEY (batch_id, position)
    ) STRICT;
  `)
  recoverAbandonedTasks(database, () => (options.now?.() ?? new Date()).toISOString())

  let isClosed = false
  const workspaceListeners = new Set<(snapshot: WorkspaceSnapshot) => void>()
  const taskProgresses = new Map<string, MediaTaskProgress>()
  const taskProgressFormatIds = new Map<string, string>()
  const taskProgressPublishedAt = new Map<string, number>()
  const authenticationProfilesRoot = path.join(options.dataDirectory, 'authentication-profiles')

  function publishWorkspace(): WorkspaceSnapshot {
    const snapshot = readWorkspaceSnapshot(database, taskProgresses)
    for (const listener of workspaceListeners) {
      try {
        listener(snapshot)
      } catch {
        // One renderer subscription must not block authoritative state changes.
      }
    }
    return snapshot
  }

  function findMatchingAuthenticationProfile(sourceService: string): AuthenticationProfileSnapshot | null {
    const matches = readAuthenticationProfiles(database)
      .filter((profile) => profile.services.some((service) => authenticationServiceMatches(service, sourceService)))
    // Automatic matching follows the most recently imported package for a service.
    // This keeps repeat imports useful without silently dropping back to guest mode.
    return matches.length > 0 ? matches[matches.length - 1] : null
  }

  function resolveAuthenticationCookiePath(profileId: string, sourceService: string): string {
    const row = database.prepare(`
      SELECT id, display_name, services_json, directory_name, created_at
      FROM authentication_profiles
      WHERE id = ?
    `).get(profileId) as AuthenticationProfileRow | undefined
    if (!row) throw new Error(`Authentication Profile does not exist: ${profileId}`)
    const services = JSON.parse(row.services_json) as string[]
    const service = services.find((candidate) => authenticationServiceMatches(candidate, sourceService))
    if (!service) throw new Error(`Authentication Profile ${profileId} does not match ${sourceService}.`)
    return path.join(authenticationProfilesRoot, row.directory_name, 'by-service', `${service}.cookies.txt`)
  }

  function assertTaskPlanIntegrity(plan: TaskPlan): void {
    if (plan.planVersion !== 1) throw new Error('Task Plan version does not match the engine contract.')
    if (!path.isAbsolute(plan.outputDirectory)) throw new Error('Task Plan output directory is unsafe.')
    if ((plan.source.kind === 'local-file' || plan.source.kind === 'local-av-pair') && !path.isAbsolute(plan.source.locator)) {
      throw new Error('Task Plan local source is unsafe.')
    }
    if (plan.source.kind === 'local-av-pair' && (!path.isAbsolute(plan.source.videoPath) || !path.isAbsolute(plan.source.audioPath))) {
      throw new Error('Task Plan local media pair is unsafe.')
    }
    if (plan.source.kind === 'local-av-pair' && plan.source.locator !== plan.source.videoPath) {
      throw new Error('Task Plan local media pair locator does not match its video source.')
    }
    if (plan.source.kind === 'network-url') {
      let sourceUrl: URL
      try {
        sourceUrl = new URL(plan.source.locator)
      } catch {
        throw new Error('Task Plan network source is unsafe.')
      }
      if (sourceUrl.protocol !== 'https:' && sourceUrl.protocol !== 'http:') {
        throw new Error('Task Plan network source is unsafe.')
      }
    }

    const availableRecipes = plan.source.kind === 'local-file'
      ? getLocalMediaRecipeOptions(plan.source.mediaKind, plan.source.locator)
      : plan.source.kind === 'local-av-pair'
        ? getMergeRecipeOptions()
        : getNetworkMediaRecipeOptions()
    const expectedRecipe = availableRecipes.find((candidate) => candidate.id === plan.recipe.id)
    if (!expectedRecipe || JSON.stringify(plan.recipe) !== JSON.stringify(expectedRecipe)) {
      throw new Error('Task Plan recipe does not match its Source.')
    }
    const expectedSteps = createTaskPlanSteps(expectedRecipe)
    if (JSON.stringify(plan.steps) !== JSON.stringify(expectedSteps)) {
      throw new Error('Task Plan steps do not match its recipe.')
    }
    if (path.basename(plan.deliveryName) !== plan.deliveryName || sanitizeDeliveryFileName(plan.deliveryName) !== plan.deliveryName) {
      throw new Error('Task Plan delivery name is unsafe.')
    }
    const allowedDeliveryNames = new Set([
      createDeliveryName(plan.source, expectedRecipe, 'zh-CN'),
      createDeliveryName(plan.source, expectedRecipe, 'en'),
    ])
    if (!allowedDeliveryNames.has(plan.deliveryName)) {
      throw new Error('Task Plan delivery name does not match its Source and recipe.')
    }

    const ffmpeg = options.managedRuntimes?.ffmpeg
    if (!ffmpeg || plan.runtimeVersions.ffmpeg !== ffmpeg.version) {
      throw new Error('Task Plan FFmpeg version does not match the active runtime.')
    }
    const ytDlp = plan.source.kind === 'network-url' ? options.managedRuntimes?.ytDlp : undefined
    if (plan.source.kind === 'network-url' && (!ytDlp || plan.runtimeVersions.ytDlp !== ytDlp.version)) {
      throw new Error('Task Plan yt-dlp version does not match the active runtime.')
    }
    if (plan.source.kind !== 'network-url' && plan.runtimeVersions.ytDlp !== undefined) {
      throw new Error('Task Plan runtime set does not match its local Source.')
    }
    const deno = plan.source.kind === 'network-url' ? options.managedRuntimes?.deno : undefined
    if (plan.source.kind === 'network-url' && plan.runtimeVersions.deno !== deno?.version) {
      throw new Error('Task Plan Deno version does not match the active runtime.')
    }
    if (plan.source.kind !== 'network-url' && (plan.runtimeVersions.deno !== undefined || plan.videoQuality !== undefined)) {
      throw new Error('Task Plan network options do not match its local Source.')
    }
    if (plan.source.kind === 'network-url') {
      const quality = plan.videoQuality ?? { mode: 'best' as const }
      if (quality.mode !== 'best' && (quality.mode !== 'max-height' || !Number.isInteger(quality.height) || quality.height < 144 || quality.height > 8640)) {
        throw new Error('Task Plan video quality is unsupported.')
      }
    }

    const expectedAuthenticationProfile = plan.source.kind === 'network-url'
      ? findMatchingAuthenticationProfile(plan.source.serviceName)
      : null
    if (plan.authenticationProfileId !== expectedAuthenticationProfile?.id) {
      throw new Error('Task Plan Authentication Profile does not match its Source.')
    }
  }

  function startQueuedTask(taskId: string): WorkspaceSnapshot {
    if (isClosed) throw new Error('Media Task Engine is closed.')
    const task = findTask(database, taskId)
    if (task.state !== 'queued') {
      throw new Error(`Media Task ${taskId} cannot start from state ${task.state}.`)
    }
    updateTaskExecutionState(
      database,
      taskId,
      'running',
      'preparing',
      (options.now?.() ?? new Date()).toISOString(),
      null,
    )
    return publishWorkspace()
  }

  function cancelQueuedTask(taskId: string): WorkspaceSnapshot {
    if (isClosed) throw new Error('Media Task Engine is closed.')
    const task = findTask(database, taskId)
    if (task.state !== 'queued') {
      throw new Error(`Media Task ${taskId} cannot be cancelled from state ${task.state}.`)
    }
    updateTaskExecutionState(
      database,
      taskId,
      'cancelled',
      null,
      (options.now?.() ?? new Date()).toISOString(),
      null,
    )
    return publishWorkspace()
  }

  const engine: MediaTaskEngine = Object.freeze({
    async inspectSource(input: SourceInput): Promise<SourceInspection> {
      if (isClosed) {
        throw new Error('Media Task Engine is closed.')
      }

      if (input.kind === 'local-file') {
        return await inspectLocalMediaSource(input.path, options.managedRuntimes?.ffprobe?.command ?? 'ffprobe')
      }

      if (options.resolveCollection) {
        const collectionInspection = await inspectNetworkCollectionSource(input.url, options.resolveCollection)
        if (collectionInspection) return collectionInspection
      }

      const ytDlp = options.managedRuntimes?.ytDlp
      if (!ytDlp) {
        throw new Error('The yt-dlp managed runtime is required to inspect a network source.')
      }
      const sourceService = inferAuthenticationServiceFromUrl(input.url)
      const authenticationProfile = sourceService ? findMatchingAuthenticationProfile(sourceService) : null
      const authenticationCookiePath = authenticationProfile && sourceService
        ? resolveAuthenticationCookiePath(authenticationProfile.id, sourceService)
        : null
      return await inspectNetworkMediaSource(input.url, ytDlp, {
        authenticationCookiePath,
        deno: options.managedRuntimes?.deno,
      })
    },

    async inspectVideoQualities(source: InspectedNetworkSource): Promise<VideoQualityInspection> {
      if (isClosed) throw new Error('Media Task Engine is closed.')
      const ytDlp = options.managedRuntimes?.ytDlp
      if (!ytDlp) throw new Error('The yt-dlp managed runtime is required to inspect video qualities.')
      const authenticationProfile = findMatchingAuthenticationProfile(source.serviceName)
      const authenticationCookiePath = authenticationProfile
        ? resolveAuthenticationCookiePath(authenticationProfile.id, source.serviceName)
        : null
      const qualityOptions = await inspectNetworkVideoQualities(source.locator, ytDlp, {
        authenticationCookiePath,
        deno: options.managedRuntimes?.deno,
      })
      return Object.freeze({
        availableHeights: Object.freeze(qualityOptions.map((option) => option.height)),
        qualityOptions,
        authenticationProfileId: authenticationProfile?.id ?? null,
        authenticationProfileDisplayName: authenticationProfile?.displayName ?? null,
      })
    },

    async planTask(input: PlanTaskInput): Promise<TaskPlan> {
      if (isClosed) {
        throw new Error('Media Task Engine is closed.')
      }

      await assertWritableOutputDirectory(input.outputDirectory)

      const recipeOptions = input.source.kind === 'local-file'
        ? getLocalMediaRecipeOptions(input.source.mediaKind, input.source.locator)
        : input.source.kind === 'local-av-pair'
          ? getMergeRecipeOptions()
          : getNetworkMediaRecipeOptions()
      const recipe = recipeOptions
        .find((candidate) => candidate.id === input.recipeId)
      if (!recipe) {
        throw new Error(`Recipe ${input.recipeId} is not compatible with ${input.source.mediaKind} media.`)
      }

      const ffmpeg = options.managedRuntimes?.ffmpeg
      if (!ffmpeg) {
        throw new Error('The FFmpeg managed runtime is required to plan this task.')
      }

      const ytDlp = input.source.kind === 'network-url' ? options.managedRuntimes?.ytDlp : undefined
      if (input.source.kind === 'network-url' && !ytDlp) {
        throw new Error('The yt-dlp managed runtime is required to plan this task.')
      }

      const authenticationProfile = input.source.kind === 'network-url'
        ? findMatchingAuthenticationProfile(input.source.serviceName)
        : null
      const deno = input.source.kind === 'network-url' ? options.managedRuntimes?.deno : undefined
      const videoQuality = input.source.kind === 'network-url'
        ? input.videoQuality ?? Object.freeze({ mode: 'best' as const })
        : undefined
      return freezeTaskPlan({
        planVersion: 1,
        source: input.source,
        recipe,
        outputDirectory: input.outputDirectory,
        deliveryName: createDeliveryName(input.source, recipe, input.language),
        steps: createTaskPlanSteps(recipe),
        runtimeVersions: Object.freeze({
          ffmpeg: ffmpeg.version,
          ...(ytDlp ? { ytDlp: ytDlp.version } : {}),
          ...(deno ? { deno: deno.version } : {}),
        }),
        ...(authenticationProfile ? { authenticationProfileId: authenticationProfile.id } : {}),
        ...(videoQuality ? { videoQuality } : {}),
      })
    },

    async importAuthenticationPackage(input): Promise<WorkspaceSnapshot> {
      if (isClosed) throw new Error('Media Task Engine is closed.')
      const displayName = input.displayName.trim()
      if (!displayName) throw new Error('Authentication Profile display name must not be empty.')
      const files = await inspectAuthenticationPackage(input.sourceDirectory)
      const id = options.idFactory?.('authentication-profile') ?? randomUUID()
      if (!/^[a-zA-Z0-9._-]+$/u.test(id)) throw new Error('Authentication Profile id is unsafe.')
      const timestamp = (options.now?.() ?? new Date()).toISOString()
      const targetDirectory = path.join(authenticationProfilesRoot, id)
      const stagingDirectory = path.join(authenticationProfilesRoot, `.${id}.staging`)
      await mkdir(authenticationProfilesRoot, { recursive: true })
      if (await pathExists(targetDirectory)) throw new Error(`Authentication Profile already exists: ${id}`)
      await copyAuthenticationPackage(files, stagingDirectory, targetDirectory)

      database.exec('BEGIN IMMEDIATE')
      try {
        database.prepare(`
          INSERT INTO authentication_profiles (id, display_name, services_json, directory_name, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(id, displayName, JSON.stringify(files.map((file) => file.service)), id, timestamp)
        database.prepare(`
          UPDATE workspace_metadata
          SET revision = revision + 1
          WHERE singleton = 1
        `).run()
        database.exec('COMMIT')
      } catch (error) {
        database.exec('ROLLBACK')
        await rm(targetDirectory, { recursive: true, force: true })
        throw error
      }
      return publishWorkspace()
    },

    createTask(plan: TaskPlan): WorkspaceSnapshot {
      if (isClosed) {
        throw new Error('Media Task Engine is closed.')
      }

      assertTaskPlanIntegrity(plan)
      const id = options.idFactory?.('task') ?? randomUUID()
      const timestamp = (options.now?.() ?? new Date()).toISOString()

      database.exec('BEGIN IMMEDIATE')
      try {
        database.prepare(`
          INSERT INTO media_tasks (
            id, state, stage, created_at, updated_at, plan_json, problem_json
          ) VALUES (?, 'queued', NULL, ?, ?, ?, NULL)
        `).run(id, timestamp, timestamp, JSON.stringify(plan))
        database.prepare(`
          UPDATE workspace_metadata
          SET revision = revision + 1
          WHERE singleton = 1
        `).run()
        database.exec('COMMIT')
      } catch (error) {
        database.exec('ROLLBACK')
        throw error
      }

      return publishWorkspace()
    },

    createTaskBatch(plans: readonly TaskPlan[], schedulingProfile: SchedulingProfile): WorkspaceSnapshot {
      if (isClosed) throw new Error('Media Task Engine is closed.')
      if (plans.length === 0) throw new Error('A Task Batch must contain at least one Task Plan.')
      if (!['safe', 'balanced', 'fast'].includes(schedulingProfile)) {
        throw new Error(`Unsupported Scheduling Profile: ${schedulingProfile}`)
      }
      plans.forEach(assertTaskPlanIntegrity)
      const batchId = options.idFactory?.('task-batch') ?? randomUUID()
      const timestamp = (options.now?.() ?? new Date()).toISOString()

      database.exec('BEGIN IMMEDIATE')
      try {
        database.prepare(`
          INSERT INTO task_batches (id, scheduling_profile, created_at)
          VALUES (?, ?, ?)
        `).run(batchId, schedulingProfile, timestamp)
        const insertTask = database.prepare(`
          INSERT INTO media_tasks (
            id, state, stage, created_at, updated_at, plan_json, problem_json
          ) VALUES (?, 'queued', NULL, ?, ?, ?, NULL)
        `)
        const insertMember = database.prepare(`
          INSERT INTO task_batch_members (batch_id, task_id, position)
          VALUES (?, ?, ?)
        `)
        plans.forEach((plan, position) => {
          const taskId = options.idFactory?.('task') ?? randomUUID()
          insertTask.run(taskId, timestamp, timestamp, JSON.stringify(plan))
          insertMember.run(batchId, taskId, position)
        })
        database.prepare(`
          UPDATE workspace_metadata
          SET revision = revision + 1
          WHERE singleton = 1
        `).run()
        database.exec('COMMIT')
      } catch (error) {
        database.exec('ROLLBACK')
        throw error
      }
      return publishWorkspace()
    },

    startTask(taskId: string): WorkspaceSnapshot {
      return startQueuedTask(taskId)
    },

    cancelTask(taskId: string): WorkspaceSnapshot {
      return cancelQueuedTask(taskId)
    },

    async clearTaskHistory(): Promise<WorkspaceSnapshot> {
      if (isClosed) throw new Error('Media Task Engine is closed.')
      const terminalTasks = readTasks(database).filter((task) =>
        task.state === 'completed' || task.state === 'cancelled' || task.state === 'needs-attention')
      if (terminalTasks.length === 0) return readWorkspaceSnapshot(database, taskProgresses)

      for (const task of terminalTasks) {
        const stagingRoot = path.resolve(task.plan.outputDirectory, '.media-dock-staging')
        const taskStagingDirectory = path.resolve(stagingRoot, task.id)
        if (path.dirname(taskStagingDirectory) !== stagingRoot) {
          throw new Error(`Media Task staging path is unsafe: ${task.id}`)
        }
        await rm(taskStagingDirectory, { recursive: true, force: true })
        await rmdir(stagingRoot).catch(() => undefined)
      }

      database.exec('BEGIN IMMEDIATE')
      try {
        database.prepare(`
          DELETE FROM deliverables
          WHERE task_id IN (
            SELECT id FROM media_tasks
            WHERE state IN ('completed', 'cancelled', 'needs-attention')
          )
        `).run()
        database.prepare(`
          DELETE FROM media_tasks
          WHERE state IN ('completed', 'cancelled', 'needs-attention')
        `).run()
        database.prepare(`
          DELETE FROM task_batches
          WHERE NOT EXISTS (
            SELECT 1 FROM task_batch_members
            WHERE task_batch_members.batch_id = task_batches.id
          )
        `).run()
        database.prepare(`
          UPDATE workspace_metadata
          SET revision = revision + 1
          WHERE singleton = 1
        `).run()
        database.exec('COMMIT')
      } catch (error) {
        database.exec('ROLLBACK')
        throw error
      }

      for (const task of terminalTasks) {
        taskProgresses.delete(task.id)
        taskProgressFormatIds.delete(task.id)
        taskProgressPublishedAt.delete(task.id)
      }
      return publishWorkspace()
    },

    async runTask(taskId: string): Promise<WorkspaceSnapshot> {
      if (isClosed) {
        throw new Error('Media Task Engine is closed.')
      }

      let task = findTask(database, taskId)
      const isQueued = task.state === 'queued'
      const isStarted = task.state === 'running' && task.stage === 'preparing'
      if (!isQueued && !isStarted) {
        throw new Error(`Media Task ${taskId} cannot run from state ${task.state}.`)
      }

      const ffmpeg = options.managedRuntimes?.ffmpeg
      if (!ffmpeg || ffmpeg.version !== task.plan.runtimeVersions.ffmpeg) {
        updateTaskExecutionState(
          database,
          taskId,
          'needs-attention',
          'preparing',
          (options.now?.() ?? new Date()).toISOString(),
          requiredRuntimeProblem(),
        )
        publishWorkspace()
        throw new Error(`Media Task ${taskId} requires FFmpeg ${task.plan.runtimeVersions.ffmpeg}.`)
      }
      const ytDlp = task.plan.source.kind === 'network-url' ? options.managedRuntimes?.ytDlp : undefined
      if (task.plan.source.kind === 'network-url' && (!ytDlp || ytDlp.version !== task.plan.runtimeVersions.ytDlp)) {
        updateTaskExecutionState(
          database,
          taskId,
          'needs-attention',
          'preparing',
          (options.now?.() ?? new Date()).toISOString(),
          requiredRuntimeProblem(),
        )
        publishWorkspace()
        throw new Error(`Media Task ${taskId} requires yt-dlp ${task.plan.runtimeVersions.ytDlp}.`)
      }
      const deno = task.plan.source.kind === 'network-url' && task.plan.runtimeVersions.deno
        ? options.managedRuntimes?.deno
        : undefined
      if (task.plan.runtimeVersions.deno && (!deno || deno.version !== task.plan.runtimeVersions.deno)) {
        updateTaskExecutionState(
          database,
          taskId,
          'needs-attention',
          'preparing',
          (options.now?.() ?? new Date()).toISOString(),
          requiredRuntimeProblem(),
        )
        publishWorkspace()
        throw new Error(`Media Task ${taskId} requires Deno ${task.plan.runtimeVersions.deno}.`)
      }
      if (isQueued) {
        startQueuedTask(taskId)
        task = findTask(database, taskId)
      }

      const stagingRoot = path.join(task.plan.outputDirectory, '.media-dock-staging')
      const taskStagingDirectory = path.join(stagingRoot, taskId)
      const stagedDeliveryPath = path.join(taskStagingDirectory, task.plan.deliveryName)
      const finalDeliveryPath = path.join(task.plan.outputDirectory, task.plan.deliveryName)

      try {
        await assertWritableOutputDirectory(task.plan.outputDirectory)
        if (task.plan.source.kind === 'local-file') {
          const sourceStat = await stat(task.plan.source.locator)
          if (!sourceStat.isFile()) {
            throw new Error(`Local media source is not a file: ${task.plan.source.locator}`)
          }
        }
        if (task.plan.source.kind === 'local-av-pair') {
          for (const sourcePath of [task.plan.source.videoPath, task.plan.source.audioPath]) {
            const sourceStat = await stat(sourcePath)
            if (!sourceStat.isFile()) throw new Error(`Local media source is not a file: ${sourcePath}`)
          }
        }
        if (await pathExists(finalDeliveryPath)) {
          throw new Error(`Delivery already exists: ${finalDeliveryPath}`)
        }

        await mkdir(taskStagingDirectory, { recursive: true })
        updateTaskExecutionState(
          database,
          taskId,
          'running',
          task.plan.source.kind === 'network-url' ? 'acquiring' : 'processing',
          (options.now?.() ?? new Date()).toISOString(),
          null,
        )
        publishWorkspace()

        if (task.plan.source.kind === 'network-url' && ytDlp) {
          const authenticationCookiePath = task.plan.authenticationProfileId
            ? resolveAuthenticationCookiePath(task.plan.authenticationProfileId, task.plan.source.serviceName)
            : null
          await runRuntimeProcessCollectOutput({
            command: ytDlp.command,
            args: [
              ...(ytDlp.argsPrefix ?? []),
              '--no-update',
              '--no-playlist',
              '--progress',
              '--newline',
              '--progress-template',
              'download:PROGRESS|%(info.format_id)s|%(info.vcodec)s|%(info.acodec)s|%(progress._percent_str)s|%(progress._downloaded_bytes_str)s|%(progress._total_bytes_str)s|%(progress._speed_str)s|%(progress._eta_str)s',
              '--ffmpeg-location',
              path.isAbsolute(ffmpeg.command) ? path.dirname(ffmpeg.command) : ffmpeg.command,
              '-f',
              task.plan.videoQuality?.mode === 'max-height'
                ? `bv*[height<=${task.plan.videoQuality.height}]+ba/b[height<=${task.plan.videoQuality.height}]`
                : 'bv*+ba/b',
              '--merge-output-format',
              'mp4',
              ...(deno ? ['--js-runtimes', `deno:${deno.command}`] : []),
              ...(authenticationCookiePath ? ['--cookies', authenticationCookiePath] : []),
              '--output',
              stagedDeliveryPath,
              task.plan.source.locator,
            ],
            timeoutMs: 30 * 60_000,
            workingDirectory: taskStagingDirectory,
            env: process.env,
            onOutputLine: (line) => {
              const parsed = parseYtDlpProgressLine(line)
              if (!parsed) return
              const previousProgress = taskProgresses.get(taskId)
              const formatChanged = taskProgressFormatIds.get(taskId) !== parsed.formatId
              const publishedAt = taskProgressPublishedAt.get(taskId) ?? 0
              const now = Date.now()
              taskProgresses.set(taskId, parsed.progress)
              taskProgressFormatIds.set(taskId, parsed.formatId)
              if (formatChanged || now - publishedAt >= 500 || (parsed.progress.percent >= 100 && (previousProgress?.percent ?? 0) < 100)) {
                taskProgressPublishedAt.set(taskId, now)
                publishWorkspace()
              }
            },
          })
        } else if (task.plan.source.kind === 'local-av-pair') {
          await runRuntimeProcessCollectOutput({
            command: ffmpeg.command,
            args: [
              ...(ffmpeg.argsPrefix ?? []),
              '-hide_banner',
              '-loglevel',
              'error',
              '-nostdin',
              '-y',
              ...createMergeFfmpegArgs(task.plan.source, task.plan.recipe, stagedDeliveryPath),
            ],
            timeoutMs: 30 * 60_000,
            workingDirectory: taskStagingDirectory,
            env: process.env,
          })
        } else {
          await runRuntimeProcessCollectOutput({
            command: ffmpeg.command,
            args: [
              ...(ffmpeg.argsPrefix ?? []),
              '-hide_banner',
              '-loglevel',
              'error',
              '-nostdin',
              '-y',
              '-i',
              task.plan.source.locator,
              '-vn',
              '-c:a',
              'aac',
              '-b:a',
              '192k',
              stagedDeliveryPath,
            ],
            timeoutMs: 120_000,
            workingDirectory: taskStagingDirectory,
            env: process.env,
          })
        }

        updateTaskExecutionState(
          database,
          taskId,
          'running',
          'delivering',
          (options.now?.() ?? new Date()).toISOString(),
          null,
        )
        publishWorkspace()

        const stagedStat = await stat(stagedDeliveryPath)
        if (!stagedStat.isFile() || stagedStat.size === 0) {
          throw new Error('FFmpeg did not produce a usable staged deliverable.')
        }

        await rename(stagedDeliveryPath, finalDeliveryPath)
        const acquisitionProgress = taskProgresses.get(taskId)
        if (acquisitionProgress) {
          taskProgresses.set(taskId, Object.freeze({ ...acquisitionProgress, percent: 100, eta: '0s' }))
        }
        const completedAt = (options.now?.() ?? new Date()).toISOString()
        const deliverableId = options.idFactory?.('deliverable') ?? randomUUID()

        database.exec('BEGIN IMMEDIATE')
        try {
          database.prepare(`
            INSERT INTO deliverables (id, task_id, path, delivery_name, created_at)
            VALUES (?, ?, ?, ?, ?)
          `).run(deliverableId, taskId, finalDeliveryPath, task.plan.deliveryName, completedAt)
          database.prepare(`
            UPDATE media_tasks
            SET state = 'completed', stage = 'delivering', updated_at = ?, problem_json = NULL
            WHERE id = ?
          `).run(completedAt, taskId)
          database.prepare(`
            UPDATE workspace_metadata
            SET revision = revision + 1
            WHERE singleton = 1
          `).run()
          database.exec('COMMIT')
        } catch (error) {
          database.exec('ROLLBACK')
          throw error
        }

        await rm(taskStagingDirectory, { recursive: true, force: true })
        await rmdir(stagingRoot).catch(() => undefined)
        return publishWorkspace()
      } catch (error) {
        const isNetworkTask = task.plan.source.kind === 'network-url'
        const problem = Object.freeze({
          code: isNetworkTask ? 'network.acquisition.failed' : 'media.processing.failed',
          category: 'media-processing' as const,
          stage: isNetworkTask ? 'acquiring' as const : 'processing' as const,
          titleKey: isNetworkTask ? 'problem.networkAcquisitionFailed.title' : 'problem.mediaProcessingFailed.title',
          summaryKey: isNetworkTask ? 'problem.networkAcquisitionFailed.summary' : 'problem.mediaProcessingFailed.summary',
          actions: Object.freeze([
            Object.freeze({ id: 'retry-task', kind: 'retry-task' as const }),
          ]),
        })
        updateTaskExecutionState(
          database,
          taskId,
          'needs-attention',
          isNetworkTask ? 'acquiring' : 'processing',
          (options.now?.() ?? new Date()).toISOString(),
          problem,
        )
        publishWorkspace()
        throw error
      }
    },

    async runTaskBatch(batchId: string): Promise<WorkspaceSnapshot> {
      if (isClosed) throw new Error('Media Task Engine is closed.')
      const batch = readTaskBatches(database).find((candidate) => candidate.id === batchId)
      if (!batch) throw new Error(`Task Batch does not exist: ${batchId}`)
      const queuedTasks = batch.taskIds
        .map((taskId) => findTask(database, taskId))
        .filter((task) => task.state === 'queued')
      await runScheduledTaskBatch(
        queuedTasks.map((task) => ({
          id: task.id,
          sourceKind: task.plan.source.kind,
          ...(task.plan.source.kind === 'network-url' ? { serviceName: task.plan.source.serviceName } : {}),
          ...(task.plan.authenticationProfileId ? { authenticationProfileId: task.plan.authenticationProfileId } : {}),
        })),
        batch.schedulingProfile,
        (taskId) => engine.runTask(taskId),
      )
      return readWorkspaceSnapshot(database, taskProgresses)
    },

    subscribeWorkspace(listener: (snapshot: WorkspaceSnapshot) => void): () => void {
      if (isClosed) {
        throw new Error('Media Task Engine is closed.')
      }

      workspaceListeners.add(listener)
      return () => {
        workspaceListeners.delete(listener)
      }
    },

    getWorkspaceSnapshot(): WorkspaceSnapshot {
      if (isClosed) {
        throw new Error('Media Task Engine is closed.')
      }

      return readWorkspaceSnapshot(database, taskProgresses)
    },

    close(): void {
      if (isClosed) {
        return
      }

      database.close()
      workspaceListeners.clear()
      taskProgresses.clear()
      taskProgressFormatIds.clear()
      taskProgressPublishedAt.clear()
      isClosed = true
    },
  })
  return engine
}
