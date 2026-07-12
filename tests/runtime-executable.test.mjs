import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'
import {
  getRuntimeUpdateAvailability,
  inspectRuntimeExecutable,
  installValidatedRuntimeExecutable,
} from '../dist-electron/core/runtimeExecutable.js'

const execFileAsync = promisify(execFile)
const validPayload = Buffer.from("process.stdout.write('2026.07.04\\n')\n", 'utf8')
const corruptPayload = Buffer.from('this is not a runnable JavaScript fixture !!!\n', 'utf8')

function sha256(payload) {
  return createHash('sha256').update(payload).digest('hex')
}

async function probeFixtureVersion(filePath) {
  try {
    const result = await execFileAsync(process.execPath, [filePath, '--version'])
    return result.stdout.trim() || null
  } catch {
    return null
  }
}

function createSandbox() {
  const rootDir = mkdtempSync(join(tmpdir(), 'media-dock-runtime-'))
  const targetPath = join(rootDir, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')
  return {
    rootDir,
    targetPath,
    cleanup: () => rmSync(rootDir, { recursive: true, force: true }),
  }
}

test('distinguishes missing, truncated, and runnable runtime executables', async () => {
  const sandbox = createSandbox()
  try {
    assert.deepEqual(
      await inspectRuntimeExecutable(null, probeFixtureVersion),
      { status: 'missing', version: null },
    )

    writeFileSync(sandbox.targetPath, corruptPayload)
    chmodSync(sandbox.targetPath, 0o755)
    assert.deepEqual(
      await inspectRuntimeExecutable(sandbox.targetPath, probeFixtureVersion),
      { status: 'invalid', version: null },
    )

    writeFileSync(sandbox.targetPath, validPayload)
    assert.deepEqual(
      await inspectRuntimeExecutable(sandbox.targetPath, probeFixtureVersion),
      { status: 'ready', version: '2026.07.04' },
    )
  } finally {
    sandbox.cleanup()
  }
})

test('offers repair when the current runtime cannot report a version', () => {
  assert.deepEqual(
    getRuntimeUpdateAvailability(null, '2026.07.04'),
    { repairRequired: true, updateAvailable: true },
  )
  assert.deepEqual(
    getRuntimeUpdateAvailability('2026.07.04', '2026.07.04'),
    { repairRequired: false, updateAvailable: false },
  )
})

test('installs only after download, checksum, and version validation', async () => {
  const sandbox = createSandbox()
  const stages = []
  try {
    writeFileSync(sandbox.targetPath, Buffer.from("process.stdout.write('2026.06.01\\n')\n"))

    const result = await installValidatedRuntimeExecutable({
      targetPath: sandbox.targetPath,
      expectedVersion: '2026.07.04',
      expectedSha256: sha256(validPayload),
      expectedSize: validPayload.byteLength,
      platform: process.platform,
      probeVersion: probeFixtureVersion,
      download: async (temporaryPath) => {
        writeFileSync(temporaryPath, validPayload)
        return { receivedBytes: validPayload.byteLength, totalBytes: validPayload.byteLength }
      },
      onStage: (stage) => stages.push(stage),
    })

    assert.equal(result.version, '2026.07.04')
    assert.deepEqual(readFileSync(sandbox.targetPath), validPayload)
    assert.deepEqual(stages, ['downloading', 'verifying', 'installing'])
    assert.deepEqual(readdirSync(sandbox.rootDir), [basename(sandbox.targetPath)])
  } finally {
    sandbox.cleanup()
  }
})

for (const failure of ['incomplete', 'checksum', 'version']) {
  test(`preserves the existing runtime when ${failure} validation fails`, async () => {
    const sandbox = createSandbox()
    const originalPayload = Buffer.from("process.stdout.write('2026.06.01\\n')\n")
    try {
      writeFileSync(sandbox.targetPath, originalPayload)

      await assert.rejects(
        installValidatedRuntimeExecutable({
          targetPath: sandbox.targetPath,
          expectedVersion: '2026.07.04',
          expectedSha256: failure === 'checksum' ? '0'.repeat(64) : sha256(failure === 'version' ? corruptPayload : validPayload),
          platform: process.platform,
          probeVersion: probeFixtureVersion,
          download: async (temporaryPath) => {
            const payload = failure === 'version' ? corruptPayload : validPayload
            writeFileSync(temporaryPath, payload)
            return {
              receivedBytes: failure === 'incomplete' ? payload.byteLength - 1 : payload.byteLength,
              totalBytes: payload.byteLength,
            }
          },
        }),
      )

      assert.deepEqual(readFileSync(sandbox.targetPath), originalPayload)
      assert.equal(readdirSync(sandbox.rootDir).length, 1)
    } finally {
      sandbox.cleanup()
    }
  })
}
