import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_RUNTIME_MIRROR_BASE_URL,
  normalizeRuntimeMirrorBaseUrl,
  resolveRuntimeDownloadUrl,
} from '../dist-electron/core/runtimeDownloadSource.js'

const officialAsset = 'https://github.com/yt-dlp/yt-dlp/releases/download/2026.07.04/yt-dlp.exe'

test('official runtime downloads keep the trusted GitHub release URL', () => {
  assert.equal(
    resolveRuntimeDownloadUrl(officialAsset, { source: 'official' }),
    officialAsset,
  )
})

test('mirror runtime downloads prefix the official asset with a normalized HTTPS mirror', () => {
  assert.equal(DEFAULT_RUNTIME_MIRROR_BASE_URL, 'https://gh-proxy.com/')
  assert.equal(normalizeRuntimeMirrorBaseUrl(' https://mirror.example/ghproxy '), 'https://mirror.example/ghproxy/')
  assert.equal(
    resolveRuntimeDownloadUrl(officialAsset, {
      source: 'mirror',
      mirrorBaseUrl: 'https://mirror.example/ghproxy',
    }),
    `https://mirror.example/ghproxy/${officialAsset}`,
  )
})

test('runtime mirrors reject insecure, credentialed, and ambiguous addresses', () => {
  assert.throws(() => normalizeRuntimeMirrorBaseUrl('http://mirror.example'), /HTTPS/i)
  assert.throws(() => normalizeRuntimeMirrorBaseUrl('https://user:secret@mirror.example'), /credentials/i)
  assert.throws(() => normalizeRuntimeMirrorBaseUrl('https://mirror.example/?target=github'), /query or fragment/i)
  assert.throws(
    () => resolveRuntimeDownloadUrl('https://downloads.example/runtime.exe', { source: 'official' }),
    /official GitHub/i,
  )
})
