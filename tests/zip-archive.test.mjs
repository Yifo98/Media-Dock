import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { extractZipArchive } from '../dist-electron/core/zipArchive.js'

const fixtureZip = Buffer.from(
  'UEsDBAoAAAAAAFxa71yKgFOWFgAAABYAAAAPABwA5rWL6K+VIGZpbGUudHh0VVQJAAMg/FZqIPxWanV4CwABBPUBAAAEFAAAAGhlbGxvIGZyb20gTWVkaWEgRG9jawpQSwECHgMKAAAAAABcWu9cioBTlhYAAAAWAAAADwAYAAAAAAABAAAApIEAAAAA5rWL6K+VIGZpbGUudHh0VVQFAAMg/FZqdXgLAAEE9QEAAAQUAAAAUEsFBgAAAAABAAEAVQAAAF8AAAAAAA==',
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

test('the application no longer invokes PowerShell or Bandizip for ZIP extraction', () => {
  const mainSource = readFileSync(new URL('../electron/main.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(mainSource, /ExecutionPolicy|Expand-Archive|Bandizip|powershell\.exe/iu)
})
