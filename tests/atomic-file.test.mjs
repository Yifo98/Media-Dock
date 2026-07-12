import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'
import { createSiblingTemporaryPath } from '../dist-electron/core/atomicFile.js'

test('temporary executable paths retain the .exe extension for Windows process probes', () => {
  const temporaryPath = createSiblingTemporaryPath(join('runtime', 'deno.exe'), 'download')

  assert.match(temporaryPath, /\.download\.exe$/)
})
