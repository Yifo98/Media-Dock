import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { runRuntimeProcessCollectOutput } from '../dist-electron/core/runtimeProcess.js'

test('an absolute runtime executable launches even when the packaged app fallback points at app.asar', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'media-dock-runtime-process-'))
  const asarPath = join(rootDir, 'app.asar')
  writeFileSync(asarPath, 'archive fixture')

  try {
    const result = await runRuntimeProcessCollectOutput({
      command: process.execPath,
      args: ['-e', "process.stdout.write('runtime-ok')"],
      timeoutMs: 3000,
      workingDirectory: asarPath,
      env: process.env,
    })

    assert.equal(result.stdout, 'runtime-ok')
  } finally {
    rmSync(rootDir, { recursive: true, force: true })
  }
})
