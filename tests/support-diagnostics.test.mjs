import assert from 'node:assert/strict'
import test from 'node:test'

import { buildSanitizedSupportDiagnostics } from '../dist-electron/v3/supportDiagnostics.js'

test('support diagnostics keep cross-platform evidence while redacting user media and authentication details', () => {
  const report = buildSanitizedSupportDiagnostics({
    generatedAt: '2026-07-14T08:00:00.000Z',
    appVersion: '3.0.0-preview',
    uiLanguage: 'zh-CN',
    platform: { name: 'win32', release: '10.0.26100', arch: 'x64' },
    processVersions: { electron: '39.0.0', chrome: '140.0.0.0', node: '22.0.0' },
    runtimes: { ffmpeg: '7.1', ffprobe: '7.1', ytDlp: '2026.07.04', deno: '2.9.2' },
    homeDirectory: 'C:\\Users\\XiaoFu',
    recentError: 'Failed C:\\Users\\XiaoFu\\Videos\\private.mp4 and F:\\Desktop\\second-private.mp4 plus /Volumes/Media/third-private.mov, /data/media/fourth-private.webm, \\\\studio-nas\\private-share\\fifth-private.mkv, clips/sixth-private.mp4, and seventh-private.mov --cookies C:\\Users\\XiaoFu\\cookies.txt https://example.com/watch/private-title?v=42&token=url-secret SESSDATA=cookie-secret\nCookie: SESSDATA=header-secret; bili_jct=csrf-secret\nAuthorization: Bearer bearer-secret',
    workspace: {
      contractVersion: 1,
      revision: 17,
      taskBatches: [],
      tasks: [{
        id: 'task-private-id',
        state: 'needs-attention',
        stage: 'acquiring',
        createdAt: '2026-07-14T07:55:00.000Z',
        updatedAt: '2026-07-14T07:56:00.000Z',
        plan: {
          planVersion: 1,
          source: { kind: 'network-url', locator: 'https://example.com/watch?v=42&token=plan-secret', displayName: 'Private video title', mediaKind: 'video', durationSeconds: 42, formatName: 'webm', sourceId: 'private-source', serviceName: 'FixtureTV' },
          recipe: { id: 'network-video', deliverableKind: 'video', extension: 'mp4' },
          outputDirectory: 'C:\\Users\\XiaoFu\\Videos',
          deliveryName: 'Private video title.mp4',
          steps: [{ id: 'acquire-network', stage: 'acquiring', runtime: 'yt-dlp' }],
          runtimeVersions: { ffmpeg: '7.1', ytDlp: '2026.07.04', deno: '2.9.2' },
          authenticationProfileId: 'auth-private-id',
          videoQuality: { mode: 'max-height', height: 2160 },
        },
        problem: { code: 'network.acquire.failed', category: 'network', stage: 'acquiring', titleKey: 'private-title-key', summaryKey: 'private-summary-key', actions: [] },
      }],
      deliverables: [{ id: 'deliverable-private-id', taskId: 'task-private-id', path: 'C:\\Users\\XiaoFu\\Videos\\Private video title.mp4', deliveryName: 'Private video title.mp4', createdAt: '2026-07-14T07:56:00.000Z' }],
      authenticationProfiles: [{ id: 'auth-private-id', displayName: 'My private Bilibili login', services: ['bilibili-b-site'], health: 'ready', createdAt: '2026-07-14T07:00:00.000Z' }],
      systemOperations: [],
    },
  })

  assert.match(report, /Media Dock Support Diagnostics/)
  assert.match(report, /platform: win32 10\.0\.26100 x64/)
  assert.match(report, /yt-dlp: 2026\.07\.04/)
  assert.match(report, /network\.acquire\.failed/)
  assert.match(report, /authentication profiles: 1/)
  assert.match(report, /services: bilibili-b-site/)
  for (const secret of [
    'XiaoFu',
    'private.mp4',
    'Private video title',
    'task-private-id',
    'auth-private-id',
    'plan-secret',
    'url-secret',
    'cookie-secret',
    'header-secret',
    'csrf-secret',
    'bearer-secret',
    'second-private.mp4',
    'third-private.mov',
    'fourth-private.webm',
    'studio-nas',
    'private-share',
    'fifth-private.mkv',
    'sixth-private.mp4',
    'seventh-private.mov',
    'private-title',
    'SESSDATA',
    '--cookies C:',
    '?v=42',
  ]) {
    assert.doesNotMatch(report, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
  }
})
