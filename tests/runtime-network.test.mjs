import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  downloadRuntimeFile,
  fetchRuntimeJson,
} from '../dist-electron/core/runtimeNetwork.js'

function createSandbox() {
  const rootDir = mkdtempSync(join(tmpdir(), 'media-dock-runtime-network-'))
  return {
    rootDir,
    targetPath: join(rootDir, '中文 下载', 'yt-dlp.exe.part'),
    cleanup: () => rmSync(rootDir, { recursive: true, force: true }),
  }
}

function createFetchFailure() {
  const cause = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1'), { code: 'ECONNREFUSED' })
  return new TypeError('fetch failed', { cause })
}

test('runtime metadata errors preserve the stage, host, and network cause', async () => {
  await assert.rejects(
    fetchRuntimeJson({
      fetchImpl: async () => { throw createFetchFailure() },
      url: 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest',
      label: 'yt-dlp metadata request',
    }),
    /yt-dlp metadata request.*api\.github\.com.*ECONNREFUSED/i,
  )
})

test('failed runtime downloads remove partial files and identify the asset host', async () => {
  const sandbox = createSandbox()
  try {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]))
        controller.error(createFetchFailure())
      },
    })

    await assert.rejects(
      downloadRuntimeFile({
        fetchImpl: async () => new Response(stream, {
          status: 200,
          headers: { 'content-length': '10' },
        }),
        url: 'https://github.com/yt-dlp/yt-dlp/releases/download/test/yt-dlp.exe',
        targetPath: sandbox.targetPath,
        label: 'yt-dlp asset download',
      }),
      /yt-dlp asset download.*github\.com.*ECONNREFUSED/i,
    )
    assert.equal(existsSync(sandbox.targetPath), false)
  } finally {
    sandbox.cleanup()
  }
})

test('a failed runtime download preserves an existing completed target', async () => {
  const sandbox = createSandbox()
  const originalPayload = Buffer.from('previous complete download')
  try {
    mkdirSync(join(sandbox.rootDir, '中文 下载'), { recursive: true })
    writeFileSync(sandbox.targetPath, originalPayload)

    await assert.rejects(
      downloadRuntimeFile({
        fetchImpl: async () => { throw createFetchFailure() },
        url: 'https://github.com/example/runtime.bin',
        targetPath: sandbox.targetPath,
        label: 'runtime asset download',
      }),
      /runtime asset download.*github\.com.*ECONNREFUSED/i,
    )

    assert.deepEqual(readFileSync(sandbox.targetPath), originalPayload)
  } finally {
    sandbox.cleanup()
  }
})

test('runtime network errors redact URL credentials, query values, and control characters', async () => {
  const sensitiveCause = Object.assign(
    new Error('proxy https://user:secret@proxy.example/path?token=private\nsecond line'),
    { code: 'ECONNRESET' },
  )

  await assert.rejects(
    fetchRuntimeJson({
      fetchImpl: async () => { throw new TypeError('fetch failed', { cause: sensitiveCause }) },
      url: 'https://api.github.com/repos/example/runtime/releases/latest',
      label: 'runtime metadata request',
    }),
    (error) => {
      assert.match(error.message, /proxy\.example/)
      assert.match(error.message, /ECONNRESET/)
      assert.doesNotMatch(error.message, /user|secret|private|token=/)
      assert.doesNotMatch(error.message, /[\r\n]/)
      return true
    },
  )
})

test('runtime downloads report progress and preserve exact bytes in non-ASCII paths', async () => {
  const sandbox = createSandbox()
  const progress = []
  const payload = new Uint8Array([4, 5, 6, 7])
  try {
    const result = await downloadRuntimeFile({
      fetchImpl: async () => new Response(payload, {
        status: 200,
        headers: { 'content-length': String(payload.byteLength) },
      }),
      url: 'https://github.com/example/runtime.bin',
      targetPath: sandbox.targetPath,
      label: 'runtime asset download',
      onProgress: (event) => progress.push(event),
    })

    assert.deepEqual(readFileSync(sandbox.targetPath), Buffer.from(payload))
    assert.deepEqual(result, { receivedBytes: payload.byteLength, totalBytes: payload.byteLength })
    assert.equal(progress.at(0).percent, 0)
    assert.equal(progress.at(-1).percent, 100)
  } finally {
    sandbox.cleanup()
  }
})
