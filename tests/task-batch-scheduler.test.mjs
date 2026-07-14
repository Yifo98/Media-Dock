import assert from 'node:assert/strict'
import test from 'node:test'

import { runScheduledTaskBatch } from '../dist-electron/v3/taskBatchScheduler.js'

function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

test('Safe Scheduling runs every batch member one at a time in intent order', async () => {
  const firstRelease = deferred()
  const started = []
  let active = 0
  let peak = 0
  const run = runScheduledTaskBatch([
    { id: 'first', sourceKind: 'network-url', serviceName: 'A' },
    { id: 'second', sourceKind: 'local-file' },
  ], 'safe', async (taskId) => {
    started.push(taskId)
    peak = Math.max(peak, ++active)
    if (taskId === 'first') await firstRelease.promise
    active -= 1
  })

  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(started, ['first'])
  firstRelease.resolve()
  await run
  assert.deepEqual(started, ['first', 'second'])
  assert.equal(peak, 1)
})

test('Balanced Scheduling runs two tasks from one source and Authentication Profile, but not a third', async () => {
  const releases = new Map()
  const started = []
  const run = runScheduledTaskBatch([
    { id: 'bilibili-1', sourceKind: 'network-url', serviceName: 'Bilibili', authenticationProfileId: 'profile-1' },
    { id: 'bilibili-2', sourceKind: 'network-url', serviceName: 'Bilibili', authenticationProfileId: 'profile-1' },
    { id: 'bilibili-3', sourceKind: 'network-url', serviceName: 'Bilibili', authenticationProfileId: 'profile-1' },
  ], 'balanced', async (taskId) => {
    started.push(taskId)
    const release = deferred()
    releases.set(taskId, release)
    await release.promise
  })

  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(started, ['bilibili-1', 'bilibili-2'])
  assert.equal(started.includes('bilibili-3'), false)
  releases.get('bilibili-1').resolve()
  while (!started.includes('bilibili-3')) await new Promise((resolve) => setImmediate(resolve))
  releases.get('bilibili-2').resolve()
  releases.get('bilibili-3').resolve()
  await run
})

test('Fast Scheduling runs three tasks from one source and Authentication Profile', async () => {
  const releases = new Map()
  const started = []
  const run = runScheduledTaskBatch([
    { id: 'bilibili-1', sourceKind: 'network-url', serviceName: 'Bilibili', authenticationProfileId: 'profile-1' },
    { id: 'bilibili-2', sourceKind: 'network-url', serviceName: 'Bilibili', authenticationProfileId: 'profile-1' },
    { id: 'bilibili-3', sourceKind: 'network-url', serviceName: 'Bilibili', authenticationProfileId: 'profile-1' },
  ], 'fast', async (taskId) => {
    started.push(taskId)
    const release = deferred()
    releases.set(taskId, release)
    await release.promise
  })

  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(started, ['bilibili-1', 'bilibili-2', 'bilibili-3'])
  for (const release of releases.values()) release.resolve()
  await run
})

test('a failed scheduled member does not abort the remaining members in its lane', async () => {
  const attempted = []
  await runScheduledTaskBatch([
    { id: 'broken', sourceKind: 'local-file' },
    { id: 'healthy', sourceKind: 'local-file' },
  ], 'balanced', async (taskId) => {
    attempted.push(taskId)
    if (taskId === 'broken') throw new Error('fixture failure')
  })
  assert.deepEqual(attempted, ['broken', 'healthy'])
})
