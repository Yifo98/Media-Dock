import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { createMediaDockV3Api } = require('../electron/v3/preloadApi.cjs')

test('the versioned preload API exposes only Media Dock product commands and revision notifications', async () => {
  const invocations = []
  const listeners = new Map()
  const ipcRenderer = {
    invoke(channel, payload) {
      invocations.push({ channel, payload })
      return Promise.resolve({ channel, payload })
    },
    on(channel, listener) {
      listeners.set(channel, listener)
    },
    removeListener(channel, listener) {
      if (listeners.get(channel) === listener) listeners.delete(channel)
    },
  }
  const api = createMediaDockV3Api(ipcRenderer)

  assert.deepEqual(Object.keys(api).sort(), [
    'cancelTask',
    'checkRuntimeUpdates',
    'clearTaskHistory',
    'contractVersion',
    'createTask',
    'createTaskBatch',
    'exportSupportDiagnostics',
    'getWorkspaceSnapshot',
    'importAuthenticationProfile',
    'inspectSource',
    'inspectVideoQualities',
    'onWorkspaceChanged',
    'openMediaCookiesResource',
    'pickLocalSource',
    'pickLocalSources',
    'pickOutputDirectory',
    'planTask',
    'revealDeliverable',
    'runTask',
    'runTaskBatch',
  ])
  assert.equal(api.contractVersion, 1)

  await api.getWorkspaceSnapshot()
  await api.pickLocalSource('/media')
  await api.pickLocalSources('/media')
  await api.pickOutputDirectory('/deliverables')
  await api.importAuthenticationProfile()
  await api.openMediaCookiesResource('chrome-store')
  await api.inspectSource({ kind: 'local-file', path: '/media/input.wav' })
  await api.inspectVideoQualities({ kind: 'network-url', locator: 'https://media.example/watch?v=42' })
  await api.planTask({ recipeId: 'audio-compatible' })
  await api.createTask({ planVersion: 1 })
  await api.createTaskBatch([{ planVersion: 1 }], 'balanced')
  await api.runTask('task-001')
  await api.runTaskBatch('batch-001')
  await api.cancelTask('task-002')
  await api.clearTaskHistory()
  await api.revealDeliverable('deliverable-001')
  await api.checkRuntimeUpdates()
  await api.exportSupportDiagnostics({ language: 'zh-CN', recentError: 'network unavailable' })

  assert.deepEqual(invocations, [
    { channel: 'media-dock:v3:get-workspace', payload: undefined },
    { channel: 'media-dock:v3:pick-local-source', payload: '/media' },
    { channel: 'media-dock:v3:pick-local-sources', payload: '/media' },
    { channel: 'media-dock:v3:pick-output-directory', payload: '/deliverables' },
    { channel: 'media-dock:v3:import-authentication-profile', payload: undefined },
    { channel: 'media-dock:v3:open-mediacookies-resource', payload: 'chrome-store' },
    { channel: 'media-dock:v3:inspect-source', payload: { kind: 'local-file', path: '/media/input.wav' } },
    { channel: 'media-dock:v3:inspect-video-qualities', payload: { kind: 'network-url', locator: 'https://media.example/watch?v=42' } },
    { channel: 'media-dock:v3:plan-task', payload: { recipeId: 'audio-compatible' } },
    { channel: 'media-dock:v3:create-task', payload: { planVersion: 1 } },
    { channel: 'media-dock:v3:create-task-batch', payload: { plans: [{ planVersion: 1 }], schedulingProfile: 'balanced' } },
    { channel: 'media-dock:v3:run-task', payload: 'task-001' },
    { channel: 'media-dock:v3:run-task-batch', payload: 'batch-001' },
    { channel: 'media-dock:v3:cancel-task', payload: 'task-002' },
    { channel: 'media-dock:v3:clear-task-history', payload: undefined },
    { channel: 'media-dock:v3:reveal-deliverable', payload: 'deliverable-001' },
    { channel: 'media-dock:v3:check-runtime-updates', payload: undefined },
    { channel: 'media-dock:v3:export-support-diagnostics', payload: { language: 'zh-CN', recentError: 'network unavailable' } },
  ])

  const received = []
  const unsubscribe = api.onWorkspaceChanged((snapshot) => received.push(snapshot.revision))
  const notification = listeners.get('media-dock:v3:workspace-changed')
  notification({}, { revision: 4 })
  assert.deepEqual(received, [4])

  unsubscribe()
  assert.equal(listeners.has('media-dock:v3:workspace-changed'), false)
})
