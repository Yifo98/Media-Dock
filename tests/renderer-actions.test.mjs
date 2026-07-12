import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const fixturePath = fileURLToPath(new URL('./fixtures/renderer-actions-app.cjs', import.meta.url))

function runRendererAction(action) {
  return spawnSync(electronPath, [fixturePath], {
    encoding: 'utf8',
    env: {
      ...process.env,
      MEDIA_DOCK_RENDERER_ACTION: action,
    },
    timeout: 10000,
  })
}

function assertRendererAction(action) {
  const result = runRendererAction(action)
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`

  assert.equal(result.status, 0, output)
  assert.match(output, /\[GREEN\]/)
}

for (const action of ['openPath', 'pickDirectory', 'pickDirectoryCancel', 'showItemInFolder', 'mediaPickDirectory', 'mediaOpenPath']) {
  test(`${action} failure remains recoverable in the rendered app`, () => {
    assertRendererAction(action)
  })
}

test('damaged yt-dlp exposes a repair action and verification stage', () => {
  assertRendererAction('ytDlpRepair')
})

test('runtime install actions stay mutually exclusive', () => {
  assertRendererAction('runtimeInstallMutex')
})

test('runtime progress logs emit only once per 10% bucket', () => {
  assertRendererAction('runtimeProgressDedup')
})

test('download preflight failure leaves the queue empty', () => {
  assertRendererAction('downloadPreflightFailure')
})

test('an unrunnable Deno path does not claim YouTube optimization', () => {
  assertRendererAction('unrunnableDeno')
})

test('failed runtime repair remains required and explains that no file changed', () => {
  assertRendererAction('runtimeRepairFailure')
})
