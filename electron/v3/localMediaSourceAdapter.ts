import { stat } from 'node:fs/promises'
import path from 'node:path'

import { runRuntimeProcessCollectOutput } from '../core/runtimeProcess.js'

import type { DeliverableRecipeOption, NeedsAttentionSourceInspection, SourceInspection } from './mediaTaskEngine.js'

type FfprobePayload = Readonly<{
  format?: Readonly<{
    duration?: string
    format_name?: string
  }>
  streams?: readonly Readonly<{
    codec_type?: string
  }>[]
}>

export function getLocalMediaRecipeOptions(mediaKind: 'video' | 'audio' | 'unknown', sourcePath: string): readonly DeliverableRecipeOption[] {
  const sourceExtension = path.extname(sourcePath).slice(1).toLowerCase() || 'bin'

  if (mediaKind === 'video') {
    return Object.freeze([
      Object.freeze({ id: 'video-compatible', deliverableKind: 'video', extension: 'mp4' }),
      Object.freeze({ id: 'audio-compatible', deliverableKind: 'audio', extension: 'm4a' }),
      Object.freeze({ id: 'keep-original', deliverableKind: 'source', extension: sourceExtension }),
    ])
  }

  if (mediaKind === 'audio') {
    return Object.freeze([
      Object.freeze({ id: 'audio-compatible', deliverableKind: 'audio', extension: 'm4a' }),
      Object.freeze({ id: 'keep-original', deliverableKind: 'source', extension: sourceExtension }),
    ])
  }

  return Object.freeze([
    Object.freeze({ id: 'keep-original', deliverableKind: 'source', extension: sourceExtension }),
  ])
}

function parseDurationSeconds(value: string | undefined): number | null {
  if (!value) {
    return null
  }

  const duration = Number.parseFloat(value)
  return Number.isFinite(duration) ? duration : null
}

function sourceNotFoundProblem(): NeedsAttentionSourceInspection {
  return Object.freeze({
    status: 'needs-attention',
    problem: Object.freeze({
      code: 'source.local.not-found',
      category: 'source',
      stage: 'preparing',
      titleKey: 'problem.sourceNotFound.title',
      summaryKey: 'problem.sourceNotFound.summary',
      actions: Object.freeze([
        Object.freeze({ id: 'choose-source', kind: 'choose-source' }),
      ]),
    }),
  })
}

export async function inspectLocalMediaSource(sourcePath: string, ffprobeCommand: string): Promise<SourceInspection> {
  let sourceStat
  try {
    sourceStat = await stat(sourcePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return sourceNotFoundProblem()
    }
    throw error
  }

  if (!sourceStat.isFile()) {
    throw new Error(`Local media source is not a file: ${sourcePath}`)
  }

  const result = await runRuntimeProcessCollectOutput({
    command: ffprobeCommand,
    args: [
      '-v',
      'error',
      '-show_entries',
      'format=duration,format_name',
      '-show_streams',
      '-of',
      'json',
      sourcePath,
    ],
    timeoutMs: 15_000,
    workingDirectory: path.dirname(sourcePath),
    env: process.env,
  })

  const payload = JSON.parse(result.stdout) as FfprobePayload
  const streams = payload.streams ?? []
  const mediaKind = streams.some((stream) => stream.codec_type === 'video')
    ? 'video'
    : streams.some((stream) => stream.codec_type === 'audio')
      ? 'audio'
      : 'unknown'

  return Object.freeze({
    status: 'ready',
    source: Object.freeze({
      kind: 'local-file',
      locator: sourcePath,
      displayName: path.basename(sourcePath),
      mediaKind,
      durationSeconds: parseDurationSeconds(payload.format?.duration),
      formatName: payload.format?.format_name ?? 'unknown',
    }),
    recipes: getLocalMediaRecipeOptions(mediaKind, sourcePath),
  })
}
