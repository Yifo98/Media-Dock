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
  formats?: readonly Readonly<{
    height?: number | null
    vcodec?: string | null
    acodec?: string | null
    filesize?: number | null
    filesize_approx?: number | null
    tbr?: number | null
  }>[]
}>

export type NetworkVideoQualityOption = Readonly<{
  height: number
  estimatedBytes: number | null
}>

export type NetworkVideoQualityOptions = Readonly<{
  authenticationCookiePath?: string | null
  deno?: ManagedRuntimeReference | null
  signal?: AbortSignal
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
  options: NetworkVideoQualityOptions = {},
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
        ...(options.deno ? ['--js-runtimes', `deno:${options.deno.command}`] : []),
        ...(options.authenticationCookiePath ? ['--cookies', options.authenticationCookiePath] : []),
        sourceUrl,
      ],
      timeoutMs: 45_000,
      workingDirectory: path.dirname(ytDlp.command),
      env: process.env,
      signal: options.signal,
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

export async function inspectNetworkVideoQualities(
  sourceUrl: string,
  ytDlp: ManagedRuntimeReference,
  options: NetworkVideoQualityOptions = {},
): Promise<readonly NetworkVideoQualityOption[]> {
  if (!isPublicNetworkUrl(sourceUrl)) throw new Error('Network quality inspection requires a public URL.')

  const result = await runRuntimeProcessCollectOutput({
    command: ytDlp.command,
    args: [
      ...(ytDlp.argsPrefix ?? []),
      '--no-update',
      '--no-playlist',
      '--skip-download',
      '--dump-single-json',
      '--no-warnings',
      ...(options.deno ? ['--js-runtimes', `deno:${options.deno.command}`] : []),
      ...(options.authenticationCookiePath ? ['--cookies', options.authenticationCookiePath] : []),
      sourceUrl,
    ],
    timeoutMs: 60_000,
    workingDirectory: path.dirname(ytDlp.command),
    env: process.env,
    signal: options.signal,
  })
  const metadata = JSON.parse(result.stdout.trim()) as YtDlpMetadata
  const formats = metadata.formats ?? []
  const estimateBytes = (format: (typeof formats)[number]): number | null => {
    const direct = [format.filesize, format.filesize_approx]
      .find((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0)
    if (direct !== undefined) return Math.round(direct)
    if (typeof format.tbr === 'number' && Number.isFinite(format.tbr) && format.tbr > 0
      && typeof metadata.duration === 'number' && Number.isFinite(metadata.duration) && metadata.duration > 0) {
      return Math.round(format.tbr * 1_000 / 8 * metadata.duration)
    }
    return null
  }
  const audioEstimates = formats
    .filter((format) => format.vcodec === 'none' && format.acodec !== 'none')
    .map(estimateBytes)
    .filter((value): value is number => value !== null)
  const bestAudioEstimate = audioEstimates.length > 0 ? Math.max(...audioEstimates) : null
  const estimatesByHeight = new Map<number, number[]>()

  for (const format of formats) {
    if (format.vcodec === 'none' || typeof format.height !== 'number' || !Number.isFinite(format.height) || format.height <= 0) continue
    const height = Math.round(format.height)
    const ownEstimate = estimateBytes(format)
    const includesAudio = format.acodec !== undefined && format.acodec !== null && format.acodec !== 'none'
    const combinedEstimate = ownEstimate === null
      ? null
      : includesAudio || bestAudioEstimate === null
        ? ownEstimate
        : ownEstimate + bestAudioEstimate
    if (combinedEstimate !== null) {
      const current = estimatesByHeight.get(height) ?? []
      current.push(combinedEstimate)
      estimatesByHeight.set(height, current)
    } else if (!estimatesByHeight.has(height)) {
      estimatesByHeight.set(height, [])
    }
  }

  return Object.freeze([...estimatesByHeight.entries()]
    .sort(([left], [right]) => right - left)
    .map(([height, estimates]) => Object.freeze({
      height,
      estimatedBytes: estimates.length > 0 ? Math.max(...estimates) : null,
    })))
}
