import path from 'node:path'

import { runRuntimeProcessCollectOutput } from '../core/runtimeProcess.js'

import type {
  DeliverableRecipeOption,
  ManagedRuntimeReference,
  NeedsAttentionSourceInspection,
  SourceInspection,
} from './mediaTaskEngine.js'

type YtDlpMetadata = Readonly<{
  id?: string
  title?: string
  duration?: number
  webpage_url?: string
  extractor_key?: string
  ext?: string
  vcodec?: string
  acodec?: string
}>

const NETWORK_VIDEO_RECIPE = Object.freeze({
  id: 'network-video' as const,
  deliverableKind: 'video' as const,
  extension: 'mp4',
})

export function getNetworkMediaRecipeOptions(): readonly DeliverableRecipeOption[] {
  return Object.freeze([NETWORK_VIDEO_RECIPE])
}

function networkSourceProblem(code: string, titleKey: string, summaryKey: string): NeedsAttentionSourceInspection {
  return Object.freeze({
    status: 'needs-attention',
    problem: Object.freeze({
      code,
      category: 'source',
      stage: 'preparing',
      titleKey,
      summaryKey,
      actions: Object.freeze([
        Object.freeze({ id: 'choose-source', kind: 'choose-source' }),
      ]),
    }),
  })
}

function isPublicNetworkUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

export async function inspectNetworkMediaSource(
  sourceUrl: string,
  ytDlp: ManagedRuntimeReference,
): Promise<SourceInspection> {
  if (!isPublicNetworkUrl(sourceUrl)) {
    return networkSourceProblem(
      'source.network.invalid-url',
      'problem.invalidNetworkSource.title',
      'problem.invalidNetworkSource.summary',
    )
  }

  let result
  try {
    result = await runRuntimeProcessCollectOutput({
      command: ytDlp.command,
      args: [
        ...(ytDlp.argsPrefix ?? []),
        '--no-update',
        '--no-playlist',
        '--skip-download',
        '--dump-single-json',
        '--no-warnings',
        sourceUrl,
      ],
      timeoutMs: 45_000,
      workingDirectory: path.dirname(ytDlp.command),
      env: process.env,
    })
  } catch {
    return networkSourceProblem(
      'source.network.inspect-failed',
      'problem.networkInspectionFailed.title',
      'problem.networkInspectionFailed.summary',
    )
  }

  let metadata: YtDlpMetadata
  try {
    metadata = JSON.parse(result.stdout.trim()) as YtDlpMetadata
  } catch {
    return networkSourceProblem(
      'source.network.invalid-metadata',
      'problem.invalidNetworkMetadata.title',
      'problem.invalidNetworkMetadata.summary',
    )
  }

  if (!metadata.id || !metadata.title) {
    return networkSourceProblem(
      'source.network.incomplete-metadata',
      'problem.incompleteNetworkMetadata.title',
      'problem.incompleteNetworkMetadata.summary',
    )
  }

  return Object.freeze({
    status: 'ready',
    source: Object.freeze({
      kind: 'network-url',
      locator: metadata.webpage_url || sourceUrl,
      displayName: metadata.title,
      mediaKind: metadata.vcodec && metadata.vcodec !== 'none' ? 'video' : 'audio',
      durationSeconds: typeof metadata.duration === 'number' && Number.isFinite(metadata.duration)
        ? metadata.duration
        : null,
      formatName: metadata.ext || 'unknown',
      sourceId: metadata.id,
      serviceName: metadata.extractor_key || 'unknown',
    }),
    recipes: getNetworkMediaRecipeOptions(),
  })
}
