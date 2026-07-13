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
    'contractVersion',
    'createTask',
    'getWorkspaceSnapshot',
    'inspectSource',
    'onWorkspaceChanged',
    'pickLocalSource',
    'pickOutputDirectory',
    'planTask',
    'runTask',
  ])
  assert.equal(api.contractVersion, 1)

  await api.getWorkspaceSnapshot()
  await api.pickLocalSource('/media')
  await api.pickOutputDirectory('/deliverables')
  await api.inspectSource({ kind: 'local-file', path: '/media/input.wav' })
  await api.planTask({ recipeId: 'audio-compatible' })
  await api.createTask({ planVersion: 1 })
  await api.runTask('task-001')

  assert.deepEqual(invocations, [
    { channel: 'media-dock:v3:get-workspace', payload: undefined },
    { channel: 'media-dock:v3:pick-local-source', payload: '/media' },
    { channel: 'media-dock:v3:pick-output-directory', payload: '/deliverables' },
    { channel: 'media-dock:v3:inspect-source', payload: { kind: 'local-file', path: '/media/input.wav' } },
    { channel: 'media-dock:v3:plan-task', payload: { recipeId: 'audio-compatible' } },
    { channel: 'media-dock:v3:create-task', payload: { planVersion: 1 } },
    { channel: 'media-dock:v3:run-task', payload: 'task-001' },
  ])

  const received = []
  const unsubscribe = api.onWorkspaceChanged((snapshot) => received.push(snapshot.revision))
  const notification = listeners.get('media-dock:v3:workspace-changed')
  notification({}, { revision: 4 })
  assert.deepEqual(received, [4])

  unsubscribe()
  assert.equal(listeners.has('media-dock:v3:workspace-changed'), false)
})
