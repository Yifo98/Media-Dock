import assert from 'node:assert/strict'
import { existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { extractZipArchive } from '../dist-electron/core/zipArchive.js'

const fixtureZip = Buffer.from(
  'UEsDBAoAAAAAAFxa71yKgFOWFgAAABYAAAAPABwA5rWL6K+VIGZpbGUudHh0VVQJAAMg/FZqIPxWanV4CwABBPUBAAAEFAAAAGhlbGxvIGZyb20gTWVkaWEgRG9jawpQSwECHgMKAAAAAABcWu9cioBTlhYAAAAWAAAADwAYAAAAAAABAAAApIEAAAAA5rWL6K+VIGZpbGUudHh0VVQFAAMg/FZqdXgLAAEE9QEAAAQUAAAAUEsFBgAAAAABAAEAVQAAAF8AAAAAAA==',
  'base64',
)

const safeSymlinkZip = Buffer.from(
  'UEsDBAoAAAAAAHRPEl0AAAAAAAAAAAAAAAAHABwAYnVuZGxlL1VUCQADjLyDaoy8g2p1eAsAAQT1AQAABAAAAABQSwMECgAAAAAAdE8SXQAAAAAAAAAAAAAAABAAHABidW5kbGUvVmVyc2lvbnMvVVQJAAOMvINqjLyDanV4CwABBPUBAAAEAAAAAFBLAwQKAAAAAAB0TxJdAAAAAAAAAAAAAAAAEgAcAGJ1bmRsZS9WZXJzaW9ucy9BL1VUCQADjLyDaoy8g2p1eAsAAQT1AQAABAAAAABQSwMECgAAAAAAdE8SXfSPYf4HAAAABwAAAB0AHABidW5kbGUvVmVyc2lvbnMvQS9wYXlsb2FkLnR4dFVUCQADjLyDaoy8g2p1eAsAAQT1AQAABAAAAABpbnNpZGUKUEsDBAoAAAAAAHRPEl2LntnTAQAAAAEAAAAXABwAYnVuZGxlL1ZlcnNpb25zL0N1cnJlbnRVVAkAA4y8g2qMvINqdXgLAAEE9QEAAAQAAAAAQVBLAQIeAwoAAAAAAHRPEl0AAAAAAAAAAAAAAAAHABgAAAAAAAAAEADtQQAAAABidW5kbGUvVVQFAAOMvINqdXgLAAEE9QEAAAQAAAAAUEsBAh4DCgAAAAAAdE8SXQAAAAAAAAAAAAAAABAAGAAAAAAAAAAQAO1BQQAAAGJ1bmRsZS9WZXJzaW9ucy9VVAUAA4y8g2p1eAsAAQT1AQAABAAAAABQSwECHgMKAAAAAAB0TxJdAAAAAAAAAAAAAAAAEgAYAAAAAAAAABAA7UGLAAAAYnVuZGxlL1ZlcnNpb25zL0EvVVQFAAOMvINqdXgLAAEE9QEAAAQAAAAAUEsBAh4DCgAAAAAAdE8SXfSPYf4HAAAABwAAAB0AGAAAAAAAAQAAAKSB1wAAAGJ1bmRsZS9WZXJzaW9ucy9BL3BheWxvYWQudHh0VVQFAAOMvINqdXgLAAEE9QEAAAQAAAAAUEsBAh4DCgAAAAAAdE8SXYue2dMBAAAAAQAAABcAGAAAAAAAAAAAAO2hNQEAAGJ1bmRsZS9WZXJzaW9ucy9DdXJyZW50VVQFAAOMvINqdXgLAAEE9QEAAAQAAAAAUEsFBgAAAAAFAAUAuwEAAIcBAAAAAA==',
  'base64',
)

const escapingSymlinkZip = Buffer.from(
  'UEsDBAoAAAAAAHRPEl0AAAAAAAAAAAAAAAAHABwAYnVuZGxlL1VUCQADjLyDaoy8g2p1eAsAAQT1AQAABAAAAABQSwMECgAAAAAAdE8SXUBK/7ENAAAADQAAAAsAHABidW5kbGUvbGlua1VUCQADjLyDaoy8g2p1eAsAAQT1AQAABAAAAAAuLi8uLi9vdXRzaWRlUEsBAh4DCgAAAAAAdE8SXQAAAAAAAAAAAAAAAAcAGAAAAAAAAAAQAO1BAAAAAGJ1bmRsZS9VVAUAA4y8g2p1eAsAAQT1AQAABAAAAABQSwECHgMKAAAAAAB0TxJdQEr/sQ0AAAANAAAACwAYAAAAAAAAAAAA7aFBAAAAYnVuZGxlL2xpbmtVVAUAA4y8g2p1eAsAAQT1AQAABAAAAABQSwUGAAAAAAIAAgCeAAAAkwAAAAAA',
  'base64',
)

test('application ZIP extraction handles spaces and Chinese paths without external commands', async () => {
  const sandbox = mkdtempSync(path.join(tmpdir(), 'media-dock-zip-'))
  const zipPath = path.join(sandbox, '来源 package.zip')
  const outputDirectory = path.join(sandbox, '解压 结果')
  try {
    writeFileSync(zipPath, fixtureZip)
    await extractZipArchive(zipPath, outputDirectory)
    const [extractedFile] = readdirSync(outputDirectory)
    assert.ok(extractedFile)
    assert.equal(
      readFileSync(path.join(outputDirectory, extractedFile), 'utf8'),
      'hello from Media Dock\n',
    )
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})

test('application ZIP extraction preserves internal macOS bundle symlinks', {
  skip: process.platform === 'win32' ? 'creating symlinks requires a native Unix host' : false,
}, async () => {
  const sandbox = mkdtempSync(path.join(tmpdir(), 'media-dock-zip-symlink-'))
  const zipPath = path.join(sandbox, 'safe.zip')
  const outputDirectory = path.join(sandbox, 'safe output')
  try {
    writeFileSync(zipPath, safeSymlinkZip)
    await extractZipArchive(zipPath, outputDirectory)
    const currentLink = path.join(outputDirectory, 'bundle', 'Versions', 'Current')
    assert.equal(lstatSync(currentLink).isSymbolicLink(), true)
    assert.equal(readFileSync(path.join(currentLink, 'payload.txt'), 'utf8'), 'inside\n')
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})

test('application ZIP extraction rejects a symlink that escapes the destination', {
  skip: process.platform === 'win32' ? 'creating symlinks requires a native Unix host' : false,
}, async () => {
  const sandbox = mkdtempSync(path.join(tmpdir(), 'media-dock-zip-escape-'))
  const zipPath = path.join(sandbox, 'escape.zip')
  const outputDirectory = path.join(sandbox, 'escape output')
  try {
    writeFileSync(zipPath, escapingSymlinkZip)
    await assert.rejects(
      extractZipArchive(zipPath, outputDirectory),
      /symbolic link escapes the extraction directory/i,
    )
    assert.equal(existsSync(outputDirectory), false)
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})

test('the application no longer invokes PowerShell or Bandizip for ZIP extraction', () => {
  const mainSource = readFileSync(new URL('../electron/main.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(mainSource, /ExecutionPolicy|Expand-Archive|Bandizip|powershell\.exe/iu)
})
