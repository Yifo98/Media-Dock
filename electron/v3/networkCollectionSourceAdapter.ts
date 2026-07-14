import { getNetworkMediaRecipeOptions } from './networkMediaSourceAdapter.js'

import type { NeedsAttentionSourceInspection, SourceInspection } from './mediaTaskEngine.js'

export type NetworkCollectionEpisode = Readonly<{
  id: string
  title: string
  subtitle: string
  badge: string
  link: string
  status: string
  duration: number | null
  defaultSelected: boolean
}>

export type NetworkCollectionResolution = Readonly<{
  sourceUrl: string
  title: string
  seasonId: string
  mediaId: string | null
  groups: readonly Readonly<{
    id: string
    title: string
    episodes: readonly NetworkCollectionEpisode[]
  }>[]
}>

export type NetworkCollectionResolver = (sourceUrl: string) => Promise<NetworkCollectionResolution | null>

function isHostOrSubdomain(hostname: string, root: string): boolean {
  return hostname === root || hostname.endsWith(`.${root}`)
}

export function isSupportedNetworkCollectionUrl(sourceUrl: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(sourceUrl)
  } catch {
    return false
  }

  const hostname = parsed.hostname.toLowerCase()
  if (hostname === 'youtu.be' || isHostOrSubdomain(hostname, 'youtube.com')) {
    return Boolean(parsed.searchParams.get('list')?.trim())
  }
  if (!isHostOrSubdomain(hostname, 'bilibili.com')) return false
  return /\/(?:ep|ss|md)\d+/iu.test(parsed.pathname)
    || /[?&](?:ep_id|season_id|media_id)=\d+/iu.test(parsed.toString())
}

function collectionServiceName(sourceUrl: string): string {
  const hostname = new URL(sourceUrl).hostname.toLowerCase()
  if (hostname === 'youtu.be' || isHostOrSubdomain(hostname, 'youtube.com')) return 'YouTube'
  if (isHostOrSubdomain(hostname, 'bilibili.com')) return 'Bilibili'
  return 'Collection'
}

function normalizeCollectionDuration(duration: number | null): number | null {
  if (duration === null || !Number.isFinite(duration) || duration < 0) return null
  return duration
}

function collectionInspectionProblem(): NeedsAttentionSourceInspection {
  return Object.freeze({
    status: 'needs-attention',
    problem: Object.freeze({
      code: 'source.collection.inspect-failed',
      category: 'source',
      stage: 'preparing',
      titleKey: 'problem.collectionInspectionFailed.title',
      summaryKey: 'problem.collectionInspectionFailed.summary',
      actions: Object.freeze([
        Object.freeze({ id: 'choose-source', kind: 'choose-source' }),
      ]),
    }),
  })
}

export async function inspectNetworkCollectionSource(
  sourceUrl: string,
  resolveCollection: NetworkCollectionResolver,
): Promise<SourceInspection | null> {
  if (!isSupportedNetworkCollectionUrl(sourceUrl)) return null

  let resolution: NetworkCollectionResolution | null
  try {
    resolution = await resolveCollection(sourceUrl)
  } catch {
    return collectionInspectionProblem()
  }
  if (!resolution) return collectionInspectionProblem()

  const serviceName = collectionServiceName(resolution.sourceUrl)
  const groups = resolution.groups
    .map((group) => Object.freeze({
      id: group.id,
      title: group.title,
      entries: Object.freeze(group.episodes
        .filter((episode) => episode.id && episode.link)
        .map((episode) => {
          const nameParts = [resolution.title, episode.title, episode.subtitle].filter((part) => part.trim().length > 0)
          return Object.freeze({
            id: episode.id,
            title: episode.title,
            subtitle: episode.subtitle,
            badge: episode.badge,
            defaultSelected: episode.defaultSelected,
            source: Object.freeze({
              kind: 'network-url' as const,
              locator: episode.link,
              displayName: nameParts.join(' · '),
              mediaKind: 'video' as const,
              durationSeconds: normalizeCollectionDuration(episode.duration),
              formatName: 'unknown',
              sourceId: episode.id,
              serviceName,
            }),
          })
        })),
    }))
    .filter((group) => group.entries.length > 0)

  if (groups.length === 0) return collectionInspectionProblem()

  return Object.freeze({
    status: 'ready',
    source: Object.freeze({
      kind: 'network-collection',
      locator: resolution.sourceUrl,
      displayName: resolution.title,
      mediaKind: 'video',
      durationSeconds: null,
      formatName: 'collection',
      collectionId: resolution.seasonId,
      serviceName,
      groups: Object.freeze(groups),
    }),
    recipes: getNetworkMediaRecipeOptions(),
  })
}
