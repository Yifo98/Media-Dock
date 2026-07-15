import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

test('runtime output observers receive complete stdout and stderr lines without changing collected output', async () => {
  const lines = []
  const result = await runRuntimeProcessCollectOutput({
    command: process.execPath,
    args: ['-e', "process.stdout.write('first\\npar'); process.stdout.write('tial'); process.stderr.write('warning\\n')"],
    timeoutMs: 3000,
    workingDirectory: tmpdir(),
    env: process.env,
    onOutputLine: (line, stream) => lines.push([stream, line]),
  })

  assert.equal(result.stdout, 'first\npartial')
  assert.equal(result.stderr, 'warning\n')
  assert.deepEqual(lines, [
    ['stdout', 'first'],
    ['stderr', 'warning'],
    ['stdout', 'partial'],
  ])
})

test('aborting a managed runtime terminates its complete process tree', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'media-dock-runtime-abort-'))
  const pidPath = join(rootDir, 'pids.json')
  const controller = new AbortController()
  const childScript = [
    "const { spawn } = require('node:child_process')",
    "const { writeFileSync } = require('node:fs')",
    "const grandchild = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })",
    "writeFileSync(process.env.MEDIA_DOCK_TEST_PID_PATH, JSON.stringify({ parent: process.pid, grandchild: grandchild.pid }))",
    'setInterval(() => {}, 1000)',
  ].join(';')

  const operation = runRuntimeProcessCollectOutput({
    command: process.execPath,
    args: ['-e', childScript],
    timeoutMs: 30_000,
    workingDirectory: rootDir,
    env: { ...process.env, MEDIA_DOCK_TEST_PID_PATH: pidPath },
    signal: controller.signal,
  })

  try {
    const deadline = Date.now() + 5000
    while (!existsSync(pidPath) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    assert.equal(existsSync(pidPath), true, 'runtime process did not report its process tree')
    const pids = JSON.parse(readFileSync(pidPath, 'utf8'))

    controller.abort()
    await assert.rejects(operation, { name: 'AbortError' })

    const isRunning = (pid) => {
      try {
        process.kill(pid, 0)
        return true
      } catch {
        return false
      }
    }
    const exitDeadline = Date.now() + 5000
    while ((isRunning(pids.parent) || isRunning(pids.grandchild)) && Date.now() < exitDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    assert.equal(isRunning(pids.parent), false)
    assert.equal(isRunning(pids.grandchild), false)
  } finally {
    controller.abort()
    await operation.catch(() => undefined)
    rmSync(rootDir, { recursive: true, force: true })
  }
})
