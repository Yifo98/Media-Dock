import assert from 'node:assert/strict'
import test from 'node:test'

import { MEDIA_DOCK_V3_CHANNELS, registerMediaDockV3Ipc } from '../dist-electron/v3/registerMediaDockIpc.js'

test('the IPC boundary accepts a complete local audio-video pair and rejects incomplete pair payloads', async () => {
  const handlers = new Map()
  const ipc = {
    handle(channel, listener) { handlers.set(channel, listener) },
    removeHandler(channel) { handlers.delete(channel) },
  }
  let receivedPlanInput = null
  const engine = {
    getWorkspaceSnapshot: () => ({ revision: 0 }),
    subscribeWorkspace: () => () => {},
    inspectSource: async () => null,
    inspectVideoQualities: async () => null,
    planTask: async (input) => { receivedPlanInput = input; return input },
    createTask: () => null,
    createTaskBatch: () => null,
    runTask: async () => null,
    runTaskBatch: async () => null,
    cancelTask: () => null,
    clearTaskHistory: async () => null,
  }
  const pickers = {
    pickLocalSource: async () => null,
    pickOutputDirectory: async () => null,
    importAuthenticationProfile: async () => null,
    openMediaCookiesResource: async () => {},
    revealDeliverable: async () => {},
    checkRuntimeUpdates: async () => null,
  }
  const unregister = registerMediaDockV3Ipc(ipc, engine, () => [], pickers)
  const planHandler = handlers.get(MEDIA_DOCK_V3_CHANNELS.planTask)
  const source = {
    kind: 'local-av-pair',
    locator: '/media/video.mp4',
    videoPath: '/media/video.mp4',
    audioPath: '/media/audio.m4a',
    displayName: 'video.mp4',
    mediaKind: 'video',
    durationSeconds: 42,
    formatName: 'video + audio',
  }

  await planHandler({}, {
    source,
    recipeId: 'merge-compatible',
    outputDirectory: '/deliverables',
    language: 'zh-CN',
  })
  assert.deepEqual(receivedPlanInput, {
    source,
    recipeId: 'merge-compatible',
    outputDirectory: '/deliverables',
    language: 'zh-CN',
  })
  await assert.rejects(
    async () => planHandler({}, {
      source: { ...source, audioPath: '' },
      recipeId: 'merge-compatible',
      outputDirectory: '/deliverables',
      language: 'zh-CN',
    }),
    /Audio source path must be a non-empty string/i,
  )
  await assert.rejects(
    async () => planHandler({}, {
      source: { ...source, locator: '/media/other-video.mp4' },
      recipeId: 'merge-compatible',
      outputDirectory: '/deliverables',
      language: 'zh-CN',
    }),
    /locator must match its video source path/i,
  )
  unregister()
  assert.equal(handlers.size, 0)
})

test('the IPC boundary exports support diagnostics from validated renderer context only', async () => {
  const handlers = new Map()
  const ipc = {
    handle(channel, listener) { handlers.set(channel, listener) },
    removeHandler(channel) { handlers.delete(channel) },
  }
  const engine = {
    getWorkspaceSnapshot: () => ({ revision: 0 }),
    subscribeWorkspace: () => () => {},
    inspectSource: async () => null,
    inspectVideoQualities: async () => null,
    planTask: async () => null,
    createTask: () => null,
    createTaskBatch: () => null,
    runTask: async () => null,
    runTaskBatch: async () => null,
    cancelTask: () => null,
    clearTaskHistory: async () => null,
  }
  let receivedInput = null
  const pickers = {
    pickLocalSource: async () => null,
    pickLocalSources: async () => [],
    pickOutputDirectory: async () => null,
    importAuthenticationProfile: async () => null,
    openMediaCookiesResource: async () => {},
    revealDeliverable: async () => {},
    checkRuntimeUpdates: async () => null,
    exportSupportDiagnostics: async (input) => { receivedInput = input; return 'support-log.txt' },
  }
  const unregister = registerMediaDockV3Ipc(ipc, engine, () => [], pickers)
  const exportHandler = handlers.get(MEDIA_DOCK_V3_CHANNELS.exportSupportDiagnostics)

  assert.equal(typeof exportHandler, 'function')
  assert.equal(await exportHandler({}, { language: 'zh-CN', recentError: 'network unavailable' }), 'support-log.txt')
  assert.deepEqual(receivedInput, { language: 'zh-CN', recentError: 'network unavailable' })
  await assert.rejects(async () => exportHandler({}, { language: 'system', recentError: 'x' }), /language/i)
  await assert.rejects(async () => exportHandler({}, { language: 'en', recentError: 42 }), /recent error/i)

  unregister()
  assert.equal(handlers.size, 0)
})
