import assert from 'node:assert/strict'
import test from 'node:test'

import { inspectNetworkCollectionSource } from '../dist-electron/v3/networkCollectionSourceAdapter.js'

function youtubeEpisode(id, title, link = `https://www.youtube.com/watch?v=${id}`) {
  return Object.freeze({
    id,
    title,
    subtitle: '',
    badge: '',
    link,
    status: '',
    duration: 60,
    defaultSelected: false,
  })
}

test('Source Inspection exposes each repeated YouTube Mix video as one selectable entry', async () => {
  const videoA = youtubeEpisode('video-a', 'Video A')
  const videoB = youtubeEpisode('video-b', 'Video B')
  const videoAFromMix = youtubeEpisode('video-a', 'Video A in mix', 'https://www.youtube.com/watch?v=video-a&list=RDmix&index=3')
  const videoBFromShortLink = youtubeEpisode('video-b', 'Video B short link', 'https://youtu.be/video-b?list=RDmix')

  const inspection = await inspectNetworkCollectionSource(
    'https://www.youtube.com/watch?v=video-a&list=RDmix',
    async (sourceUrl) => ({
      sourceUrl,
      title: 'YouTube Mix',
      seasonId: 'RDmix',
      mediaId: null,
      groups: [{
        id: 'youtube-playlist',
        title: 'YouTube Mix',
        episodes: [videoA, videoB, videoAFromMix, videoBFromShortLink, videoA, videoB],
      }],
    }),
  )

  assert.equal(inspection?.status, 'ready')
  assert.equal(inspection.source.kind, 'network-collection')
  assert.deepEqual(
    inspection.source.groups.flatMap((group) => group.entries).map((entry) => entry.source.sourceId),
    ['video-a', 'video-b'],
  )
})
