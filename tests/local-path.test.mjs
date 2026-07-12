import assert from 'node:assert/strict'
import test from 'node:test'
import { assertSafeLocalPath } from '../dist-electron/core/localPath.js'

const existingPath = () => true

test('accepts an existing Windows drive path', () => {
  const targetPath = 'I:\\Media Dock Data\\cookies'

  assert.equal(
    assertSafeLocalPath(targetPath, { platform: 'win32', pathExists: existingPath }),
    targetPath,
  )
})

test('accepts an existing Windows UNC path', () => {
  const targetPath = '\\\\media-server\\downloads'

  assert.equal(
    assertSafeLocalPath(targetPath, { platform: 'win32', pathExists: existingPath }),
    targetPath,
  )
})

test('accepts an existing macOS absolute path', () => {
  const targetPath = '/Users/xiaofu/Downloads'

  assert.equal(
    assertSafeLocalPath(targetPath, { platform: 'darwin', pathExists: existingPath }),
    targetPath,
  )
})

test('rejects URLs, relative paths, empty paths, and null bytes', () => {
  const cases = [
    ['https://example.com/file', 'win32', /Only local filesystem paths/],
    ['file:///C:/Windows', 'win32', /Only local filesystem paths/],
    ['relative\\folder', 'win32', /Only absolute filesystem paths/],
    ['C:relative', 'win32', /Only local filesystem paths/],
    ['', 'win32', /Path is required/],
    ['C:\\safe\0unsafe', 'win32', /invalid character/],
  ]

  for (const [targetPath, platform, expected] of cases) {
    assert.throws(
      () => assertSafeLocalPath(targetPath, { platform, pathExists: existingPath }),
      expected,
    )
  }
})

test('rejects an absolute path that does not exist', () => {
  assert.throws(
    () => assertSafeLocalPath('C:\\missing', { platform: 'win32', pathExists: () => false }),
    /Path does not exist/,
  )
})
