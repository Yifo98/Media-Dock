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

export type NetworkMediaSourceInspectionResult = Readonly<{
  inspection: SourceInspection
  qualityOptions: readonly NetworkVideoQualityOption[] | null
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

function createMetadataArgs(
  sourceUrl: string,
  ytDlp: ManagedRuntimeReference,
  options: NetworkVideoQualityOptions,
): string[] {
  return [
    ...(ytDlp.argsPrefix ?? []),
    '--ignore-config',
    '--no-update',
    '--no-playlist',
    '--skip-download',
    '--dump-single-json',
    '--no-warnings',
    ...(options.deno ? ['--js-runtimes', `deno:${options.deno.command}`] : []),
    ...(options.authenticationCookiePath ? ['--cookies', options.authenticationCookiePath] : []),
    sourceUrl,
  ]
}

async function readNetworkMetadataOutput(
  sourceUrl: string,
  ytDlp: ManagedRuntimeReference,
  options: NetworkVideoQualityOptions,
  timeoutMs: number,
): Promise<string> {
  const result = await runRuntimeProcessCollectOutput({
    command: ytDlp.command,
    args: createMetadataArgs(sourceUrl, ytDlp, options),
    timeoutMs,
    workingDirectory: path.dirname(ytDlp.command),
    env: process.env,
    signal: options.signal,
  })
  return result.stdout.trim()
}

function parseNetworkMetadata(output: string): YtDlpMetadata {
  return JSON.parse(output) as YtDlpMetadata
}

function videoQualityOptionsFromMetadata(metadata: YtDlpMetadata): readonly NetworkVideoQualityOption[] {
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
  const audioFormats = formats
    .filter((format) => format.vcodec === 'none' && format.acodec !== 'none')
  // yt-dlp returns formats from least to most preferred. The download selector
  // uses the last eligible video/audio formats, so the preview must follow that
  // order instead of treating the largest byte count as the best format.
  const bestAudioFormat = audioFormats[audioFormats.length - 1]
  const bestAudioEstimate = bestAudioFormat ? estimateBytes(bestAudioFormat) : null
  const estimateByHeight = new Map<number, number | null>()

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
    estimateByHeight.set(height, combinedEstimate)
  }

  return Object.freeze([...estimateByHeight.entries()]
    .sort(([left], [right]) => right - left)
    .map(([height, estimatedBytes]) => Object.freeze({ height, estimatedBytes })))
}

export async function inspectNetworkMediaSourceWithQualities(
  sourceUrl: string,
  ytDlp: ManagedRuntimeReference,
  options: NetworkVideoQualityOptions = {},
): Promise<NetworkMediaSourceInspectionResult> {
  if (!isPublicNetworkUrl(sourceUrl)) {
    return Object.freeze({
      inspection: networkSourceProblem(
        'source.network.invalid-url',
        'problem.invalidNetworkSource.title',
        'problem.invalidNetworkSource.summary',
      ),
      qualityOptions: null,
    })
  }

  let metadataOutput: string
  try {
    metadataOutput = await readNetworkMetadataOutput(sourceUrl, ytDlp, options, 45_000)
  } catch {
    return Object.freeze({
      inspection: networkSourceProblem(
        'source.network.inspect-failed',
        'problem.networkInspectionFailed.title',
        'problem.networkInspectionFailed.summary',
      ),
      qualityOptions: null,
    })
  }

  let metadata: YtDlpMetadata
  try {
    metadata = parseNetworkMetadata(metadataOutput)
  } catch {
    return Object.freeze({
      inspection: networkSourceProblem(
        'source.network.invalid-metadata',
        'problem.invalidNetworkMetadata.title',
        'problem.invalidNetworkMetadata.summary',
      ),
      qualityOptions: null,
    })
  }

  if (!metadata.id || !metadata.title) {
    return Object.freeze({
      inspection: networkSourceProblem(
        'source.network.incomplete-metadata',
        'problem.incompleteNetworkMetadata.title',
        'problem.incompleteNetworkMetadata.summary',
      ),
      qualityOptions: null,
    })
  }

  return Object.freeze({
    inspection: Object.freeze({
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
    }),
    qualityOptions: videoQualityOptionsFromMetadata(metadata),
  })
}

export async function inspectNetworkMediaSource(
  sourceUrl: string,
  ytDlp: ManagedRuntimeReference,
  options: NetworkVideoQualityOptions = {},
): Promise<SourceInspection> {
  return (await inspectNetworkMediaSourceWithQualities(sourceUrl, ytDlp, options)).inspection
}

export async function inspectNetworkVideoQualities(
  sourceUrl: string,
  ytDlp: ManagedRuntimeReference,
  options: NetworkVideoQualityOptions = {},
): Promise<readonly NetworkVideoQualityOption[]> {
  if (!isPublicNetworkUrl(sourceUrl)) throw new Error('Network quality inspection requires a public URL.')

  const metadata = parseNetworkMetadata(
    await readNetworkMetadataOutput(sourceUrl, ytDlp, options, 60_000),
  )
  return videoQualityOptionsFromMetadata(metadata)
}
