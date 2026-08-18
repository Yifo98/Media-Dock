import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { inspectNetworkVideoQualities } from '../dist-electron/v3/networkMediaSourceAdapter.js'

async function withFakeYtDlp(metadata, run) {
  const directory = mkdtempSync(path.join(tmpdir(), 'media-dock-network-adapter-'))
  const fixturePath = path.join(directory, 'fake-yt-dlp.cjs')
  mkdirSync(directory, { recursive: true })
  writeFileSync(fixturePath, `process.stdout.write(${JSON.stringify(JSON.stringify(metadata))})\n`)
  try {
    return await run({ command: process.execPath, argsPrefix: [fixturePath], version: 'fixture' })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test('Quality Preview estimates the formats selected by yt-dlp instead of the largest same-height candidates', async () => {
  const qualities = await withFakeYtDlp({
    duration: 1_200,
    formats: [
      { format_id: 'audio-large', vcodec: 'none', acodec: 'aac', filesize: 400_000_000 },
      { format_id: 'audio-best', vcodec: 'none', acodec: 'opus', filesize: 200_000_000 },
      { format_id: 'video-large', height: 1080, vcodec: 'avc1', acodec: 'none', filesize: 2_600_000_000 },
      { format_id: 'video-best', height: 1080, vcodec: 'vp9', acodec: 'none', filesize: 1_500_000_000 },
    ],
  }, (ytDlp) => inspectNetworkVideoQualities('https://media.example/watch?v=estimate', ytDlp))

  assert.deepEqual(qualities, [{ height: 1080, estimatedBytes: 1_700_000_000 }])
})

test('Quality Preview reports an unknown estimate when the selected format has no reliable size metadata', async () => {
  const qualities = await withFakeYtDlp({
    duration: 1_200,
    formats: [
      { format_id: 'audio-known', vcodec: 'none', acodec: 'aac', filesize: 200_000_000 },
      { format_id: 'audio-selected-unknown', vcodec: 'none', acodec: 'opus' },
      { format_id: 'video-known', height: 1080, vcodec: 'avc1', acodec: 'none', filesize: 1_500_000_000 },
      { format_id: 'video-selected-unknown', height: 1080, vcodec: 'vp9', acodec: 'none' },
    ],
  }, (ytDlp) => inspectNetworkVideoQualities('https://media.example/watch?v=unknown-estimate', ytDlp))

  assert.deepEqual(qualities, [{ height: 1080, estimatedBytes: null }])
})
