import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  ensureWritablePortableDataDirectory,
  getPortableDataDirectory,
} from '../dist-electron/core/portableData.js'

const mainSource = readFileSync(new URL('../electron/main.ts', import.meta.url), 'utf8')

test('portable data supports spaces and Chinese paths without leaving a probe file', () => {
  const sandbox = mkdtempSync(path.join(tmpdir(), 'media-dock-portable-'))
  try {
    const root = path.join(sandbox, '便携 测试')
    const dataDirectory = getPortableDataDirectory(root, 'Media Dock')
    assert.equal(dataDirectory, path.join(root, 'Media Dock Data'))
    assert.equal(ensureWritablePortableDataDirectory(dataDirectory), dataDirectory)
    assert.equal(existsSync(dataDirectory), true)
    assert.deepEqual(readdirSync(dataDirectory), [])
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})

test('portable data reports a clear error when the data path is a file', () => {
  const sandbox = mkdtempSync(path.join(tmpdir(), 'media-dock-readonly-'))
  const dataDirectory = path.join(sandbox, 'Media Dock Data')
  try {
    writeFileSync(dataDirectory, 'not a directory')
    assert.throws(
      () => ensureWritablePortableDataDirectory(dataDirectory),
      /cannot write to its portable data directory[\s\S]*not a directory/iu,
    )
  } finally {
    chmodSync(sandbox, 0o700)
    rmSync(sandbox, { recursive: true, force: true })
  }
})

test('portable data reports a clear error for a genuinely write-denied directory', {
  skip: process.platform === 'win32' ? 'native Windows ACL denial is covered by the package gate' : false,
}, () => {
  const sandbox = mkdtempSync(path.join(tmpdir(), 'media-dock-permission-denied-'))
  const blockedRoot = path.join(sandbox, '只读 目录')
  const dataDirectory = path.join(blockedRoot, 'Media Dock Data')
  try {
    mkdirSync(blockedRoot, { recursive: true })
    chmodSync(blockedRoot, 0o500)
    assert.throws(
      () => ensureWritablePortableDataDirectory(dataDirectory),
      /cannot write to its portable data directory/iu,
    )
  } finally {
    chmodSync(blockedRoot, 0o700)
    rmSync(sandbox, { recursive: true, force: true })
  }
})

test('application shutdown terminates active work before closing the task database', () => {
  assert.match(mainSource, /function shutdownApplicationWork\(\)/u)
  assert.match(mainSource, /for \(const \[, job\] of activeJobs\)[\s\S]*?terminateProcess\(job\.process/u)
  assert.match(mainSource, /terminateProcess\(activeMediaProcess/u)
  assert.match(mainSource, /activeSubtitleCleanupAbort\?\.abort\(\)/u)
  assert.match(mainSource, /await v3TaskEngine\?\.shutdown\(\)/u)
  assert.match(mainSource, /app\.on\('before-quit',[\s\S]*?shutdownApplicationWork\(\)/u)
  assert.match(mainSource, /MEDIA_DOCK_EXIT_PROBE[\s\S]*?exit-probe\.json/u)
})
