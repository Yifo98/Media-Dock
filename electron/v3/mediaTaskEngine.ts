import { constants, mkdirSync } from 'node:fs'
import { access, mkdir, rename, rm, rmdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

import { runRuntimeProcessCollectOutput } from '../core/runtimeProcess.js'
import { sanitizeDeliveryFileName } from './deliveryNaming.js'
import { getLocalMediaRecipeOptions, inspectLocalMediaSource } from './localMediaSourceAdapter.js'
import { getNetworkMediaRecipeOptions, inspectNetworkMediaSource } from './networkMediaSourceAdapter.js'

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

export type InspectedSource = InspectedLocalSource | InspectedNetworkSource

export type DeliverableRecipeOption = Readonly<{
  id: 'video-compatible' | 'audio-compatible' | 'keep-original' | 'network-video'
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
  id: 'verify-input' | 'transcode-audio' | 'acquire-network' | 'deliver'
  stage: 'preparing' | 'acquiring' | 'processing' | 'delivering'
  runtime?: 'ffmpeg' | 'yt-dlp'
}>

export type TaskPlan = Readonly<{
  planVersion: 1
  source: InspectedSource
  recipe: DeliverableRecipeOption
  outputDirectory: string
  deliveryName: string
  steps: readonly TaskPlanStep[]
  runtimeVersions: Readonly<{
    ffmpeg: string
    ytDlp?: string
  }>
}>

export type MediaTaskSnapshot = Readonly<{
  id: string
  state: 'queued' | 'running' | 'needs-attention' | 'completed' | 'cancelled'
  stage: 'preparing' | 'acquiring' | 'processing' | 'delivering' | null
  createdAt: string
  updatedAt: string
  plan: TaskPlan
  problem: ProblemSnapshot | null
}>

export type PlanTaskInput = Readonly<{
  source: InspectedSource
  recipeId: DeliverableRecipeOption['id']
  outputDirectory: string
  language: 'zh-CN' | 'en'
}>

export type ManagedRuntimeReference = Readonly<{
  command: string
  argsPrefix?: readonly string[]
  version: string
}>

export type WorkspaceSnapshot = Readonly<{
  contractVersion: typeof MEDIA_DOCK_CONTRACT_VERSION
  revision: number
  tasks: readonly MediaTaskSnapshot[]
  deliverables: readonly DeliverableSnapshot[]
  systemOperations: readonly SystemOperationSnapshot[]
}>

export type MediaTaskEngine = Readonly<{
  inspectSource(input: SourceInput): Promise<SourceInspection>
  planTask(input: PlanTaskInput): Promise<TaskPlan>
  createTask(plan: TaskPlan): WorkspaceSnapshot
  runTask(taskId: string): Promise<WorkspaceSnapshot>
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
  }>
  idFactory?: (kind: 'task' | 'deliverable') => string
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
  })
}

function readTasks(database: DatabaseSync): readonly MediaTaskSnapshot[] {
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

function readWorkspaceSnapshot(database: DatabaseSync): WorkspaceSnapshot {
  return Object.freeze({
    contractVersion: MEDIA_DOCK_CONTRACT_VERSION,
    revision: readRevision(database),
    tasks: readTasks(database),
    deliverables: readDeliverables(database),
    systemOperations: Object.freeze([]),
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

function createDeliveryName(source: InspectedSource, recipe: DeliverableRecipeOption, language: PlanTaskInput['language']): string {
  if (source.kind === 'local-file' && recipe.id === 'keep-original') {
    return source.displayName
  }

  const sourceExtension = path.extname(source.displayName)
  const sourceStem = source.kind === 'network-url'
    ? source.displayName
    : path.basename(source.displayName, sourceExtension)
  const role = recipe.id === 'audio-compatible'
    ? language === 'zh-CN' ? '音频' : 'Audio'
    : recipe.id === 'network-video'
      ? language === 'zh-CN' ? '视频' : 'Video'
      : language === 'zh-CN' ? '兼容视频' : 'Compatible Video'

  return sanitizeDeliveryFileName(`${sourceStem} - ${role}.${recipe.extension}`)
}

function createTaskPlanSteps(recipe: DeliverableRecipeOption): readonly TaskPlanStep[] {
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
  `)

  let isClosed = false
  const workspaceListeners = new Set<(snapshot: WorkspaceSnapshot) => void>()

  function publishWorkspace(): WorkspaceSnapshot {
    const snapshot = readWorkspaceSnapshot(database)
    for (const listener of workspaceListeners) {
      try {
        listener(snapshot)
      } catch {
        // One renderer subscription must not block authoritative state changes.
      }
    }
    return snapshot
  }

  return Object.freeze({
    async inspectSource(input: SourceInput): Promise<SourceInspection> {
      if (isClosed) {
        throw new Error('Media Task Engine is closed.')
      }

      if (input.kind === 'local-file') {
        return await inspectLocalMediaSource(input.path, options.managedRuntimes?.ffprobe?.command ?? 'ffprobe')
      }

      const ytDlp = options.managedRuntimes?.ytDlp
      if (!ytDlp) {
        throw new Error('The yt-dlp managed runtime is required to inspect a network source.')
      }
      return await inspectNetworkMediaSource(input.url, ytDlp)
    },

    async planTask(input: PlanTaskInput): Promise<TaskPlan> {
      if (isClosed) {
        throw new Error('Media Task Engine is closed.')
      }

      await assertWritableOutputDirectory(input.outputDirectory)

      const recipeOptions = input.source.kind === 'local-file'
        ? getLocalMediaRecipeOptions(input.source.mediaKind, input.source.locator)
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
        }),
      })
    },

    createTask(plan: TaskPlan): WorkspaceSnapshot {
      if (isClosed) {
        throw new Error('Media Task Engine is closed.')
      }

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

    async runTask(taskId: string): Promise<WorkspaceSnapshot> {
      if (isClosed) {
        throw new Error('Media Task Engine is closed.')
      }

      const task = findTask(database, taskId)
      if (task.state !== 'queued') {
        throw new Error(`Media Task ${taskId} cannot run from state ${task.state}.`)
      }

      const ffmpeg = options.managedRuntimes?.ffmpeg
      if (!ffmpeg || ffmpeg.version !== task.plan.runtimeVersions.ffmpeg) {
        throw new Error(`Media Task ${taskId} requires FFmpeg ${task.plan.runtimeVersions.ffmpeg}.`)
      }
      const ytDlp = task.plan.source.kind === 'network-url' ? options.managedRuntimes?.ytDlp : undefined
      if (task.plan.source.kind === 'network-url' && (!ytDlp || ytDlp.version !== task.plan.runtimeVersions.ytDlp)) {
        throw new Error(`Media Task ${taskId} requires yt-dlp ${task.plan.runtimeVersions.ytDlp}.`)
      }

      updateTaskExecutionState(
        database,
        taskId,
        'running',
        'preparing',
        (options.now?.() ?? new Date()).toISOString(),
        null,
      )
      publishWorkspace()

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
          await runRuntimeProcessCollectOutput({
            command: ytDlp.command,
            args: [
              ...(ytDlp.argsPrefix ?? []),
              '--no-update',
              '--no-playlist',
              '--newline',
              '--ffmpeg-location',
              path.isAbsolute(ffmpeg.command) ? path.dirname(ffmpeg.command) : ffmpeg.command,
              '-f',
              'bv*+ba/b',
              '--merge-output-format',
              'mp4',
              '--output',
              stagedDeliveryPath,
              task.plan.source.locator,
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

        const stagedStat = await stat(stagedDeliveryPath)
        if (!stagedStat.isFile() || stagedStat.size === 0) {
          throw new Error('FFmpeg did not produce a usable staged deliverable.')
        }

        await rename(stagedDeliveryPath, finalDeliveryPath)
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

      return readWorkspaceSnapshot(database)
    },

    close(): void {
      if (isClosed) {
        return
      }

      database.close()
      workspaceListeners.clear()
      isClosed = true
    },
  })
}
