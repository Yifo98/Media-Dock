import assert from 'node:assert/strict'
import test from 'node:test'
import { RuntimeOperationCoordinator } from '../dist-electron/core/runtimeOperationCoordinator.js'

test('a pending download preflight blocks runtime installs until the queue is established', () => {
  const coordinator = new RuntimeOperationCoordinator()

  coordinator.claimDownloadStart(false)
  assert.throws(
    () => coordinator.claimRuntimeInstall('yt-dlp', false),
    /Stop active downloads/i,
  )

  coordinator.releaseDownloadStart()
  assert.doesNotThrow(() => coordinator.claimRuntimeInstall('yt-dlp', false))
})

test('a claimed runtime install blocks download preflight', () => {
  const coordinator = new RuntimeOperationCoordinator()

  coordinator.claimRuntimeInstall('deno', false)
  assert.throws(
    () => coordinator.claimDownloadStart(false),
    /active deno update/i,
  )

  coordinator.releaseRuntimeInstall('deno')
  assert.doesNotThrow(() => coordinator.claimDownloadStart(false))
})
