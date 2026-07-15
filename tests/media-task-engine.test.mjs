import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import { createMediaTaskEngine } from '../dist-electron/v3/mediaTaskEngine.js'

async function withTemporaryWorkspace(run) {
  const directory = mkdtempSync(path.join(tmpdir(), 'media-dock-v3-engine-'))

  try {
    return await run(directory)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

function writeSilentWave(filePath) {
  const sampleRate = 8_000
  const sampleCount = 800
  const bytesPerSample = 2
  const dataSize = sampleCount * bytesPerSample
  const buffer = Buffer.alloc(44 + dataSize)

  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28)
  buffer.writeUInt16LE(bytesPerSample, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  writeFileSync(filePath, buffer)
}

function writeFakeYtDlp(filePath) {
  writeFileSync(filePath, `
const { writeFileSync } = require('node:fs')

const args = process.argv.slice(2)
if (args.includes('--dump-single-json')) {
  process.stdout.write(JSON.stringify({
    id: 'public-episode-42',
    title: '山海 Episode 42',
    duration: 42.5,
    webpage_url: 'https://media.example/watch?v=42',
    extractor_key: 'FixtureTV',
    ext: 'webm',
    vcodec: 'vp9',
    acodec: 'opus',
    formats: [
      { format_id: 'v720', height: 720, vcodec: 'vp9', acodec: 'none', filesize: 8000000 },
      { format_id: 'v2160', height: 2160, vcodec: 'vp9', acodec: 'none', filesize: 32000000 },
      { format_id: 'v1080-a', height: 1080, vcodec: 'vp9', acodec: 'none', filesize: 16000000 },
      { format_id: 'v1080-b', height: 1080, vcodec: 'avc1', acodec: 'none', filesize_approx: 18000000 },
      { format_id: 'audio', vcodec: 'none', acodec: 'opus', filesize: 2000000 },
    ],
  }))
  process.exit(0)
}

const outputFlag = args.indexOf('--output')
if (outputFlag === -1 || !args[outputFlag + 1]) {
  process.stderr.write('missing --output')
  process.exit(2)
}
const formatFlag = args.indexOf('-f')
process.stdout.write('PROGRESS|estimate|vp9|none| 33.0%|3.2MiB|N/A|4.0MiB/s|00:07\\n')
process.stdout.write('PROGRESS|v1080|vp9|none| 10.0%|3.2MiB|32.0MiB|4.0MiB/s|00:07\\n')
process.stdout.write('PROGRESS|v1080|vp9|none| 50.0%|16.0MiB|32.0MiB|4.0MiB/s|00:04\\n')
process.stdout.write('PROGRESS|v1080|vp9|none|100.0%|32.0MiB|32.0MiB|4.0MiB/s|00:00\\n')
process.stdout.write('PROGRESS|a128|none|opus| 10.0%|1.6MiB|16.0MiB|4.0MiB/s|00:03\\n')
process.stdout.write('PROGRESS|a128|none|opus| 50.0%|8.0MiB|16.0MiB|4.0MiB/s|00:02\\n')
process.stdout.write('PROGRESS|a128|none|opus|100.0%|16.0MiB|16.0MiB|4.0MiB/s|00:00\\n')
writeFileSync(args[outputFlag + 1], Buffer.from(formatFlag === -1 ? 'fixture-network-media' : args[formatFlag + 1]))
`)
}

function writeCookieAwareFakeYtDlp(filePath, secretValue) {
  writeFileSync(filePath, `
const { readFileSync, writeFileSync } = require('node:fs')
const args = process.argv.slice(2)
const cookieFlag = args.indexOf('--cookies')
const hasExpectedCookie = cookieFlag !== -1 && readFileSync(args[cookieFlag + 1], 'utf8').includes(${JSON.stringify(secretValue)})
if (args.includes('--dump-single-json')) {
  if (!hasExpectedCookie) {
    process.stderr.write('authentication required')
    process.exit(4)
  }
  process.stdout.write(JSON.stringify({
    id: 'private-episode',
    title: 'Private Episode',
    duration: 8,
    webpage_url: 'https://youtube.example/watch?v=private',
    extractor_key: 'Youtube',
    ext: 'webm',
    vcodec: 'vp9',
    acodec: 'opus',
    formats: hasExpectedCookie
      ? [{ format_id: 'private-2160', height: 2160, vcodec: 'vp9', acodec: 'none' }, { format_id: 'private-1080', height: 1080, vcodec: 'vp9', acodec: 'none' }]
      : [{ format_id: 'guest-720', height: 720, vcodec: 'vp9', acodec: 'none' }],
  }))
  process.exit(0)
}
const outputFlag = args.indexOf('--output')
if (cookieFlag === -1 || outputFlag === -1) process.exit(2)
if (!hasExpectedCookie) process.exit(3)
writeFileSync(args[outputFlag + 1], Buffer.from('authenticated-network-media'))
`)
}

const ffprobeCommand = process.env.MEDIA_DOCK_TEST_FFPROBE ?? 'ffprobe'
const hasFfprobe = spawnSync(ffprobeCommand, ['-version'], { stdio: 'ignore' }).status === 0
const ffmpegCommand = process.env.MEDIA_DOCK_TEST_FFMPEG ?? 'ffmpeg'
const hasFfmpeg = spawnSync(ffmpegCommand, ['-version'], { stdio: 'ignore' }).status === 0

async function waitUntil(predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  return predicate()
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

test('a new Media Task Engine exposes an empty revisioned workspace snapshot', async () => {
  await withTemporaryWorkspace((dataDirectory) => {
    const engine = createMediaTaskEngine({ dataDirectory })

    try {
      assert.deepEqual(engine.getWorkspaceSnapshot(), {
        contractVersion: 1,
        revision: 0,
        taskBatches: [],
        tasks: [],
        deliverables: [],
        authenticationProfiles: [],
        systemOperations: [],
      })
    } finally {
      engine.close()
    }
  })
})

test('engine shutdown waits for an active task process tree to terminate', async () => {
  await withTemporaryWorkspace(async (rootDirectory) => {
    const dataDirectory = path.join(rootDirectory, 'data')
    const outputDirectory = path.join(rootDirectory, 'output')
    const sourcePath = path.join(rootDirectory, 'source.wav')
    const pidPath = path.join(rootDirectory, 'runtime-pids.json')
    mkdirSync(outputDirectory)
    writeSilentWave(sourcePath)

    const childScript = [
      "const { spawn } = require('node:child_process')",
      "const { writeFileSync } = require('node:fs')",
      "const grandchild = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })",
      "writeFileSync(process.env.MEDIA_DOCK_ENGINE_PID_PATH, JSON.stringify({ parent: process.pid, grandchild: grandchild.pid }))",
      'setInterval(() => {}, 1000)',
    ].join(';')
    const previousPidPath = process.env.MEDIA_DOCK_ENGINE_PID_PATH
    process.env.MEDIA_DOCK_ENGINE_PID_PATH = pidPath
    const engine = createMediaTaskEngine({
      dataDirectory,
      idFactory: () => 'shutdown-task',
      managedRuntimes: {
        ffmpeg: {
          command: process.execPath,
          argsPrefix: ['-e', childScript, '--'],
          version: 'shutdown-fixture',
        },
      },
    })

    try {
      const plan = await engine.planTask({
        source: {
          kind: 'local-file',
          locator: sourcePath,
          displayName: 'source.wav',
          mediaKind: 'audio',
          durationSeconds: 0.1,
          formatName: 'wav',
        },
        recipeId: 'audio-compatible',
        outputDirectory,
        language: 'en',
      })
      engine.createTask(plan)
      const runningTask = engine.runTask('shutdown-task')
      assert.equal(await waitUntil(() => existsSync(pidPath)), true)
      const pids = JSON.parse(readFileSync(pidPath, 'utf8'))

      await engine.shutdown()
      await assert.rejects(runningTask, { name: 'AbortError' })
      assert.equal(await waitUntil(() => !isProcessRunning(pids.parent) && !isProcessRunning(pids.grandchild)), true)
      assert.equal(isProcessRunning(pids.parent), false)
      assert.equal(isProcessRunning(pids.grandchild), false)
    } finally {
      await engine.shutdown()
      if (previousPidPath === undefined) delete process.env.MEDIA_DOCK_ENGINE_PID_PATH
      else process.env.MEDIA_DOCK_ENGINE_PID_PATH = previousPidPath
    }
  })
})

test('Source Inspection identifies a real local audio file without changing workspace state', { skip: !hasFfprobe }, async () => {
  await withTemporaryWorkspace(async (rootDirectory) => {
    const dataDirectory = path.join(rootDirectory, 'data')
    const sourcePath = path.join(rootDirectory, '静音片段.wav')
    writeSilentWave(sourcePath)

    const engine = createMediaTaskEngine({
      dataDirectory,
      managedRuntimes: {
        ffprobe: { command: ffprobeCommand, version: 'test-ffprobe' },
      },
    })

    try {
      const inspection = await engine.inspectSource({ kind: 'local-file', path: sourcePath })

      assert.deepEqual(inspection, {
        status: 'ready',
        source: {
          kind: 'local-file',
          locator: sourcePath,
          displayName: '静音片段.wav',
          mediaKind: 'audio',
          durationSeconds: 0.1,
          startTimeSeconds: null,
          formatName: 'wav',
        },
        recipes: [
          { id: 'audio-compatible', deliverableKind: 'audio', extension: 'm4a' },
          { id: 'keep-original', deliverableKind: 'source', extension: 'wav' },
        ],
      })
      assert.equal(engine.getWorkspaceSnapshot().revision, 0)
    } finally {
      engine.close()
    }
  })
})

test('a compatible audio recipe compiles into an immutable Task Plan without creating work', { skip: !hasFfprobe }, async () => {
  await withTemporaryWorkspace(async (rootDirectory) => {
    const dataDirectory = path.join(rootDirectory, 'data')
    const outputDirectory = path.join(rootDirectory, '成品')
    const sourcePath = path.join(rootDirectory, '采访：片段.wav')
    mkdirSync(outputDirectory)
    writeSilentWave(sourcePath)

    const engine = createMediaTaskEngine({
      dataDirectory,
      managedRuntimes: {
        ffprobe: { command: ffprobeCommand, version: 'test-ffprobe' },
        ffmpeg: { command: 'ffmpeg', version: '7.1-test' },
      },
    })

    try {
      const inspection = await engine.inspectSource({ kind: 'local-file', path: sourcePath })
      assert.equal(inspection.status, 'ready')
      if (inspection.status !== 'ready') return

      const plan = await engine.planTask({
        source: inspection.source,
        recipeId: 'audio-compatible',
        outputDirectory,
        language: 'zh-CN',
      })

      assert.deepEqual(plan, {
        planVersion: 1,
        source: inspection.source,
        recipe: { id: 'audio-compatible', deliverableKind: 'audio', extension: 'm4a' },
        outputDirectory,
        deliveryName: '采访：片段 - 音频.m4a',
        steps: [
          { id: 'verify-input', stage: 'preparing' },
          { id: 'transcode-audio', stage: 'processing', runtime: 'ffmpeg' },
          { id: 'deliver', stage: 'delivering' },
        ],
        runtimeVersions: { ffmpeg: '7.1-test' },
      })
      assert.equal(Object.isFrozen(plan), true)
      assert.equal(engine.getWorkspaceSnapshot().revision, 0)
    } finally {
      engine.close()
    }
  })
})

test('Task Plan delivery names preserve Unicode while removing Windows-prohibited characters', async () => {
  await withTemporaryWorkspace(async (rootDirectory) => {
    const outputDirectory = path.join(rootDirectory, 'output')
    mkdirSync(outputDirectory)
    const engine = createMediaTaskEngine({
      dataDirectory: path.join(rootDirectory, 'data'),
      managedRuntimes: {
        ffmpeg: { command: 'ffmpeg', version: '7.1-test' },
      },
    })

    try {
      const plan = await engine.planTask({
        source: {
          kind: 'local-file',
          locator: path.join(rootDirectory, '采访:片段?.wav'),
          displayName: '采访:片段?.wav',
          mediaKind: 'audio',
          durationSeconds: 1,
          formatName: 'wav',
        },
        recipeId: 'audio-compatible',
        outputDirectory,
        language: 'zh-CN',
      })

      assert.equal(plan.deliveryName, '采访_片段_ - 音频.m4a')
    } finally {
      engine.close()
    }
  })
})

test('creating work rejects a renderer-tampered Task Plan before it reaches SQLite', async () => {
  await withTemporaryWorkspace(async (rootDirectory) => {
    const outputDirectory = path.join(rootDirectory, 'output')
    mkdirSync(outputDirectory)
    const engine = createMediaTaskEngine({
      dataDirectory: path.join(rootDirectory, 'data'),
      managedRuntimes: {
        ffmpeg: { command: 'ffmpeg', version: '7.1-test' },
      },
    })
    try {
      const plan = await engine.planTask({
        source: {
          kind: 'local-file',
          locator: path.join(rootDirectory, 'source.wav'),
          displayName: 'source.wav',
          mediaKind: 'audio',
          durationSeconds: 1,
          formatName: 'wav',
        },
        recipeId: 'audio-compatible',
        outputDirectory,
        language: 'en',
      })
      const tampered = {
        ...plan,
        deliveryName: '../outside.m4a',
        steps: [{ id: 'acquire-network', stage: 'acquiring', runtime: 'yt-dlp' }],
      }

      assert.throws(() => engine.createTask(tampered), /Task Plan .*match|unsafe/i)
      assert.throws(() => engine.createTaskBatch([plan, tampered], 'balanced'), /Task Plan .*match|unsafe/i)
      assert.equal(engine.getWorkspaceSnapshot().revision, 0)
      assert.deepEqual(engine.getWorkspaceSnapshot().tasks, [])
      assert.deepEqual(engine.getWorkspaceSnapshot().taskBatches, [])
    } finally {
      engine.close()
    }
  })
})

test('creating a Media Task advances the workspace revision and survives an engine restart', async () => {
  await withTemporaryWorkspace(async (rootDirectory) => {
    const dataDirectory = path.join(rootDirectory, 'data')
    const outputDirectory = path.join(rootDirectory, 'output')
    mkdirSync(outputDirectory)
    const source = {
      kind: 'local-file',
      locator: path.join(rootDirectory, 'interview.wav'),
      displayName: 'interview.wav',
      mediaKind: 'audio',
      durationSeconds: 2,
      formatName: 'wav',
    }
    const engine = createMediaTaskEngine({
      dataDirectory,
      idFactory: () => 'task-001',
      now: () => new Date('2026-07-13T04:00:00.000Z'),
      managedRuntimes: {
        ffmpeg: { command: 'ffmpeg', version: '7.1-test' },
      },
    })

    const plan = await engine.planTask({
      source,
      recipeId: 'audio-compatible',
      outputDirectory,
      language: 'en',
    })
    const createdSnapshot = engine.createTask(plan)

    assert.deepEqual(createdSnapshot, {
      contractVersion: 1,
      revision: 1,
      taskBatches: [],
      tasks: [{
        id: 'task-001',
        state: 'queued',
        stage: null,
        createdAt: '2026-07-13T04:00:00.000Z',
        updatedAt: '2026-07-13T04:00:00.000Z',
        plan,
        problem: null,
      }],
      deliverables: [],
      authenticationProfiles: [],
      systemOperations: [],
    })
    engine.close()

    const reopenedEngine = createMediaTaskEngine({ dataDirectory })
    try {
      assert.deepEqual(reopenedEngine.getWorkspaceSnapshot(), createdSnapshot)
    } finally {
      reopenedEngine.close()
    }
  })
})

test('a queued local audio task runs through staging and indexes a verified Deliverable', { skip: !hasFfprobe || !hasFfmpeg }, async () => {
  await withTemporaryWorkspace(async (rootDirectory) => {
    const dataDirectory = path.join(rootDirectory, 'data')
    const outputDirectory = path.join(rootDirectory, 'output')
    const sourcePath = path.join(rootDirectory, 'field-note.wav')
    mkdirSync(outputDirectory)
    writeSilentWave(sourcePath)

    let timestampOffset = 0
    const engine = createMediaTaskEngine({
      dataDirectory,
      idFactory: (kind) => kind === 'task' ? 'task-local-001' : 'deliverable-local-001',
      now: () => new Date(Date.parse('2026-07-13T05:00:00.000Z') + timestampOffset++ * 1_000),
      managedRuntimes: {
        ffprobe: { command: ffprobeCommand, version: 'test-ffprobe' },
        ffmpeg: { command: ffmpegCommand, version: 'test-ffmpeg' },
      },
    })

    try {
      const publishedRevisions = []
      const unsubscribe = engine.subscribeWorkspace((snapshot) => {
        publishedRevisions.push(snapshot.revision)
      })
      const inspection = await engine.inspectSource({ kind: 'local-file', path: sourcePath })
      assert.equal(inspection.status, 'ready')
      if (inspection.status !== 'ready') return

      const plan = await engine.planTask({
        source: inspection.source,
        recipeId: 'audio-compatible',
        outputDirectory,
        language: 'en',
      })
      engine.createTask(plan)

      const completedSnapshot = await engine.runTask('task-local-001')
      const deliveryPath = path.join(outputDirectory, 'field-note - Audio.m4a')

      assert.equal(completedSnapshot.revision, 5)
      assert.equal(completedSnapshot.tasks[0].state, 'completed')
      assert.equal(completedSnapshot.tasks[0].stage, 'delivering')
      assert.equal(completedSnapshot.tasks[0].problem, null)
      assert.deepEqual(completedSnapshot.deliverables, [{
        id: 'deliverable-local-001',
        taskId: 'task-local-001',
        path: deliveryPath,
        deliveryName: 'field-note - Audio.m4a',
        createdAt: '2026-07-13T05:00:04.000Z',
      }])
      assert.equal((await engine.inspectSource({ kind: 'local-file', path: deliveryPath })).status, 'ready')
      assert.equal(spawnSync(ffprobeCommand, ['-v', 'error', deliveryPath]).status, 0)
      assert.equal(spawnSync(ffprobeCommand, ['-v', 'error', sourcePath]).status, 0)
      assert.equal(existsSync(path.join(outputDirectory, '.media-dock-staging')), false)
      assert.deepEqual(publishedRevisions, [1, 2, 3, 4, 5])
      unsubscribe()
    } finally {
      engine.close()
    }
  })
})

test('a local video and audio pair compiles into a real merge Task Plan', async () => {
  await withTemporaryWorkspace(async (rootDirectory) => {
    const outputDirectory = path.join(rootDirectory, 'output')
    const videoPath = path.join(rootDirectory, 'IDM-video.mp4')
    const audioPath = path.join(rootDirectory, 'IDM-audio.m4a')
    mkdirSync(outputDirectory)

    const engine = createMediaTaskEngine({
      dataDirectory: path.join(rootDirectory, 'data'),
      managedRuntimes: {
        ffmpeg: { command: ffmpegCommand, version: 'test-ffmpeg' },
      },
    })

    try {
      const source = {
        kind: 'local-av-pair',
        locator: videoPath,
        videoPath,
        audioPath,
        displayName: 'IDM-video.mp4',
        mediaKind: 'video',
        durationSeconds: null,
        formatName: 'video + audio',
      }
      const plan = await engine.planTask({
        source,
        recipeId: 'merge-compatible',
        outputDirectory,
        language: 'zh-CN',
      })

      assert.deepEqual(plan, {
        planVersion: 1,
        source,
        recipe: { id: 'merge-compatible', deliverableKind: 'video', extension: 'mp4' },
        outputDirectory,
        deliveryName: 'IDM-video - 音画合并.mp4',
        steps: [
          { id: 'verify-input', stage: 'preparing' },
          { id: 'merge-media', stage: 'processing', runtime: 'ffmpeg' },
          { id: 'deliver', stage: 'delivering' },
        ],
        runtimeVersions: { ffmpeg: 'test-ffmpeg' },
      })
      assert.equal(engine.getWorkspaceSnapshot().revision, 0)
    } finally {
      engine.close()
    }
  })
})

test('a local video and audio pair runs through FFmpeg and indexes one merged Deliverable', { skip: !hasFfprobe || !hasFfmpeg }, async () => {
  await withTemporaryWorkspace(async (rootDirectory) => {
    const outputDirectory = path.join(rootDirectory, 'output')
    const videoPath = path.join(rootDirectory, 'IDM-video.mp4')
    const audioPath = path.join(rootDirectory, 'IDM-audio.wav')
    mkdirSync(outputDirectory)
    writeSilentWave(audioPath)
    const videoFixture = spawnSync(ffmpegCommand, [
      '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x180:r=25',
      '-t', '0.1', '-an', '-c:v', 'mpeg4', '-y', videoPath,
    ])
    assert.equal(videoFixture.status, 0, videoFixture.stderr?.toString())

    const engine = createMediaTaskEngine({
      dataDirectory: path.join(rootDirectory, 'data'),
      idFactory: (kind) => kind === 'task' ? 'task-merge-001' : 'deliverable-merge-001',
      managedRuntimes: {
        ffprobe: { command: ffprobeCommand, version: 'test-ffprobe' },
        ffmpeg: { command: ffmpegCommand, version: 'test-ffmpeg' },
      },
    })

    try {
      const plan = await engine.planTask({
        source: {
          kind: 'local-av-pair',
          locator: videoPath,
          videoPath,
          audioPath,
          displayName: 'IDM-video.mp4',
          mediaKind: 'video',
          durationSeconds: 0.1,
          formatName: 'video + audio',
        },
        recipeId: 'merge-compatible',
        outputDirectory,
        language: 'en',
      })
      engine.createTask(plan)
      const completed = await engine.runTask('task-merge-001')
      const deliveryPath = path.join(outputDirectory, 'IDM-video - Merged.mp4')
      const probe = spawnSync(ffprobeCommand, ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name', '-of', 'json', deliveryPath], { encoding: 'utf8' })
      const streams = JSON.parse(probe.stdout).streams

      assert.equal(completed.tasks[0].state, 'completed')
      assert.deepEqual(completed.deliverables, [{
        id: 'deliverable-merge-001',
        taskId: 'task-merge-001',
        path: deliveryPath,
        deliveryName: 'IDM-video - Merged.mp4',
        createdAt: completed.deliverables[0].createdAt,
      }])
      assert.deepEqual(streams.map((stream) => stream.codec_type).sort(), ['audio', 'video'])
      assert.equal(streams.find((stream) => stream.codec_type === 'video')?.codec_name, 'h264')
      assert.equal(streams.find((stream) => stream.codec_type === 'audio')?.codec_name, 'aac')
      assert.equal(existsSync(path.join(outputDirectory, '.media-dock-staging')), false)
    } finally {
      engine.close()
    }
  })
})

test('lossless-remux and DaVinci merge presets each produce their promised stream codecs', { skip: !hasFfprobe || !hasFfmpeg }, async () => {
  await withTemporaryWorkspace(async (rootDirectory) => {
    const videoPath = path.join(rootDirectory, 'IDM-video.mp4')
    const audioPath = path.join(rootDirectory, 'IDM-audio.wav')
    writeSilentWave(audioPath)
    const videoFixture = spawnSync(ffmpegCommand, [
      '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x180:r=25',
      '-t', '0.1', '-an', '-c:v', 'mpeg4', '-y', videoPath,
    ])
    assert.equal(videoFixture.status, 0, videoFixture.stderr?.toString())

    for (const preset of [
      { id: 'merge-fast', extension: 'mkv', videoCodec: 'mpeg4', audioCodec: 'pcm_s16le' },
      { id: 'merge-resolve', extension: 'mov', videoCodec: 'prores', audioCodec: 'pcm_s24le' },
    ]) {
      const outputDirectory = path.join(rootDirectory, `output-${preset.id}`)
      mkdirSync(outputDirectory)
      const engine = createMediaTaskEngine({
        dataDirectory: path.join(rootDirectory, `data-${preset.id}`),
        idFactory: (kind) => `${kind}-${preset.id}`,
        managedRuntimes: {
          ffprobe: { command: ffprobeCommand, version: 'test-ffprobe' },
          ffmpeg: { command: ffmpegCommand, version: 'test-ffmpeg' },
        },
      })
      try {
        const plan = await engine.planTask({
          source: {
            kind: 'local-av-pair', locator: videoPath, videoPath, audioPath,
            displayName: 'IDM-video.mp4', mediaKind: 'video', durationSeconds: 0.1, formatName: 'video + audio',
          },
          recipeId: preset.id,
          outputDirectory,
          language: 'en',
        })
        engine.createTask(plan)
        const completed = await engine.runTask(`task-${preset.id}`)
        const probe = spawnSync(ffprobeCommand, ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name', '-of', 'json', completed.deliverables[0].path], { encoding: 'utf8' })
        const streams = JSON.parse(probe.stdout).streams
        assert.equal(path.extname(completed.deliverables[0].path), `.${preset.extension}`)
        assert.equal(streams.find((stream) => stream.codec_type === 'video')?.codec_name, preset.videoCodec)
        assert.equal(streams.find((stream) => stream.codec_type === 'audio')?.codec_name, preset.audioCodec)
      } finally {
        engine.close()
      }
    }
  })
})

test('Source Inspection returns an actionable Problem when a local file is missing', async () => {
  await withTemporaryWorkspace(async (dataDirectory) => {
    const sourcePath = path.join(dataDirectory, '已经移动.mp4')
    const engine = createMediaTaskEngine({ dataDirectory })

    try {
      assert.deepEqual(await engine.inspectSource({ kind: 'local-file', path: sourcePath }), {
        status: 'needs-attention',
        problem: {
          code: 'source.local.not-found',
          category: 'source',
          stage: 'preparing',
          titleKey: 'problem.sourceNotFound.title',
          summaryKey: 'problem.sourceNotFound.summary',
          actions: [{ id: 'choose-source', kind: 'choose-source' }],
        },
      })
      assert.equal(engine.getWorkspaceSnapshot().revision, 0)
    } finally {
      engine.close()
    }
  })
})

test('Source Inspection resolves a public network URL through the pinned yt-dlp runtime', async () => {
  await withTemporaryWorkspace(async (rootDirectory) => {
    const fakeYtDlpPath = path.join(rootDirectory, 'fake-yt-dlp.cjs')
    writeFakeYtDlp(fakeYtDlpPath)
    const engine = createMediaTaskEngine({
      dataDirectory: path.join(rootDirectory, 'data'),
      managedRuntimes: {
        ytDlp: { command: process.execPath, argsPrefix: [fakeYtDlpPath], version: '2026.07.04-fixture' },
      },
    })

    try {
      const inspection = await engine.inspectSource({
        kind: 'network-url',
        url: 'https://media.example/watch?v=42',
      })

      assert.deepEqual(inspection, {
        status: 'ready',
        source: {
          kind: 'network-url',
          locator: 'https://media.example/watch?v=42',
          displayName: '山海 Episode 42',
          mediaKind: 'video',
          durationSeconds: 42.5,
          formatName: 'webm',
          sourceId: 'public-episode-42',
          serviceName: 'FixtureTV',
        },
        recipes: [
          { id: 'network-video', deliverableKind: 'video', extension: 'mp4' },
        ],
      })
      assert.equal(engine.getWorkspaceSnapshot().revision, 0)
      const quality = await engine.inspectVideoQualities(inspection.source)
      assert.deepEqual(quality, {
        availableHeights: [2160, 1080, 720],
        qualityOptions: [
          { height: 2160, estimatedBytes: 34000000 },
          { height: 1080, estimatedBytes: 20000000 },
          { height: 720, estimatedBytes: 10000000 },
        ],
        authenticationProfileId: null,
        authenticationProfileDisplayName: null,
      })
    } finally {
      engine.close()
    }
  })
})

test('Source Inspection preserves a resolved Bilibili season as selectable episodes instead of a numeric single-item title', async () => {
  await withTemporaryWorkspace(async (rootDirectory) => {
    const sourceUrl = 'https://www.bilibili.com/bangumi/play/ep3537964'
    const engine = createMediaTaskEngine({
      dataDirectory: path.join(rootDirectory, 'data'),
      resolveCollection: async (candidateUrl) => candidateUrl === sourceUrl
        ? {
            sourceUrl,
            title: '山海之间',
            seasonId: 'season-9',
            mediaId: null,
            groups: [{
              id: 'main',
              title: '正片',
              episodes: [
                { id: '92', title: '92', subtitle: '终点之前', badge: '', link: sourceUrl, status: '2', duration: 49, defaultSelected: true },
                { id: '93', title: '93', subtitle: '新的航线', badge: '会员', link: 'https://www.bilibili.com/bangumi/play/ep3537965', status: '2', duration: 51, defaultSelected: true },
              ],
            }],
          }
        : null,
    })

    try {
      const inspection = await engine.inspectSource({ kind: 'network-url', url: sourceUrl })
      assert.deepEqual(inspection, {
        status: 'ready',
        source: {
          kind: 'network-collection',
          locator: sourceUrl,
          displayName: '山海之间',
          mediaKind: 'video',
          durationSeconds: null,
          formatName: 'collection',
          collectionId: 'season-9',
          serviceName: 'Bilibili',
          groups: [{
            id: 'main',
            title: '正片',
            entries: [
              {
                id: '92',
                title: '92',
                subtitle: '终点之前',
                badge: '',
                defaultSelected: true,
                source: {
                  kind: 'network-url',
                  locator: sourceUrl,
                  displayName: '山海之间 · 92 · 终点之前',
                  mediaKind: 'video',
                  durationSeconds: 49,
                  formatName: 'unknown',
                  sourceId: '92',
                  serviceName: 'Bilibili',
                },
              },
              {
                id: '93',
                title: '93',
                subtitle: '新的航线',
                badge: '会员',
                defaultSelected: true,
                source: {
                  kind: 'network-url',
                  locator: 'https://www.bilibili.com/bangumi/play/ep3537965',
                  displayName: '山海之间 · 93 · 新的航线',
                  mediaKind: 'video',
                  durationSeconds: 51,
                  formatName: 'unknown',
                  sourceId: '93',
                  serviceName: 'Bilibili',
                },
              },
            ],
          }],
        },
        recipes: [{ id: 'network-video', deliverableKind: 'video', extension: 'mp4' }],
      })
      assert.equal(JSON.stringify(inspection).includes('"displayName":"92"'), false)
      assert.equal(engine.getWorkspaceSnapshot().revision, 0)
    } finally {
      engine.close()
    }
  })
})

test('Source Inspection recognizes a YouTube playlist as selectable collection entries', async () => {
  await withTemporaryWorkspace(async (rootDirectory) => {
    const sourceUrl = 'https://www.youtube.com/playlist?list=PL-media-dock'
    const engine = createMediaTaskEngine({
      dataDirectory: path.join(rootDirectory, 'data'),
      resolveCollection: async (candidateUrl) => candidateUrl === sourceUrl
        ? {
            sourceUrl,
            title: 'Field Notes',
            seasonId: 'PL-media-dock',
            mediaId: null,
            groups: [{
              id: 'youtube-playlist',
              title: 'YouTube 合集',
              episodes: [{
                id: 'video-1',
                title: '1',
                subtitle: 'Morning tide',
                badge: '',
                link: 'https://www.youtube.com/watch?v=video-1',
                status: '',
                duration: 75,
                defaultSelected: false,
              }],
            }],
          }
        : null,
    })

    try {
      const inspection = await engine.inspectSource({ kind: 'network-url', url: sourceUrl })
      assert.equal(inspection.status, 'ready')
      assert.equal(inspection.source.kind, 'network-collection')
      assert.equal(inspection.source.serviceName, 'YouTube')
      assert.equal(inspection.source.groups[0].entries[0].source.locator, 'https://www.youtube.com/watch?v=video-1')
      assert.equal(inspection.source.groups[0].entries[0].source.displayName, 'Field Notes · 1 · Morning tide')
      assert.equal(inspection.source.groups[0].entries[0].source.durationSeconds, 75)
    } finally {
      engine.close()
    }
  })
})

test('a queued network task acquires into staging and safely delivers an indexed MP4', async () => {
  await withTemporaryWorkspace(async (rootDirectory) => {
    const fakeYtDlpPath = path.join(rootDirectory, 'fake-yt-dlp.cjs')
    const outputDirectory = path.join(rootDirectory, '中文 成品')
    writeFakeYtDlp(fakeYtDlpPath)
    mkdirSync(outputDirectory)
    let timestampOffset = 0
    const engine = createMediaTaskEngine({
      dataDirectory: path.join(rootDirectory, 'data'),
      idFactory: (kind) => kind === 'task' ? 'task-network-001' : 'deliverable-network-001',
      now: () => new Date(Date.parse('2026-07-13T06:00:00.000Z') + timestampOffset++ * 1_000),
      managedRuntimes: {
        ytDlp: { command: process.execPath, argsPrefix: [fakeYtDlpPath], version: '2026.07.04-fixture' },
        ffmpeg: { command: 'ffmpeg', version: '7.1-fixture' },
      },
    })

    try {
      const inspection = await engine.inspectSource({
        kind: 'network-url',
        url: 'https://media.example/watch?v=42',
      })
      assert.equal(inspection.status, 'ready')
      if (inspection.status !== 'ready') return

      const plan = await engine.planTask({
        source: inspection.source,
        recipeId: 'network-video',
        outputDirectory,
        language: 'zh-CN',
        videoQuality: { mode: 'max-height', height: 1080 },
      })
      assert.deepEqual(plan.steps, [
        { id: 'verify-input', stage: 'preparing' },
        { id: 'acquire-network', stage: 'acquiring', runtime: 'yt-dlp' },
        { id: 'deliver', stage: 'delivering' },
      ])
      assert.deepEqual(plan.runtimeVersions, {
        ffmpeg: '7.1-fixture',
        ytDlp: '2026.07.04-fixture',
      })
      assert.deepEqual(plan.videoQuality, { mode: 'max-height', height: 1080 })

      engine.createTask(plan)
      const observedProgress = []
      const unsubscribe = engine.subscribeWorkspace((snapshot) => {
        const progress = snapshot.tasks[0]?.progress
        if (progress) observedProgress.push([progress.mediaKind, progress.percent])
      })
      const completedSnapshot = await engine.runTask('task-network-001')
      unsubscribe()
      const deliveryPath = path.join(outputDirectory, '山海 Episode 42 - 视频.mp4')

      assert.equal(completedSnapshot.tasks[0].state, 'completed')
      assert.equal(completedSnapshot.tasks[0].stage, 'delivering')
      assert.deepEqual(completedSnapshot.tasks[0].progress, {
        mediaKind: 'audio',
        percent: 100,
        downloaded: '16.0MiB',
        total: '16.0MiB',
        speed: '4.0MiB/s',
        eta: '0s',
      })
      assert.equal(observedProgress.some(([kind, percent]) => kind === 'video' && percent === 100), true)
      assert.equal(observedProgress.some(([kind, percent]) => kind === 'audio' && percent === 10), true)
      assert.equal(observedProgress.some(([, percent]) => percent === 50), false)
      assert.equal(observedProgress.some(([, percent]) => percent === 33), false)
      assert.deepEqual(completedSnapshot.deliverables, [{
        id: 'deliverable-network-001',
        taskId: 'task-network-001',
        path: deliveryPath,
        deliveryName: '山海 Episode 42 - 视频.mp4',
        createdAt: '2026-07-13T06:00:04.000Z',
      }])
      assert.equal(existsSync(deliveryPath), true)
      assert.equal(readFileSync(deliveryPath, 'utf8'), 'bv*[height<=1080]+ba/b[height<=1080]')
      assert.equal(existsSync(path.join(outputDirectory, '.media-dock-staging')), false)
    } finally {
      engine.close()
    }
  })
})

test('clearing task history removes terminal records and managed staging without deleting delivered files', async () => {
  await withTemporaryWorkspace(async (rootDirectory) => {
    const fakeYtDlpPath = path.join(rootDirectory, 'fake-yt-dlp.cjs')
    const outputDirectory = path.join(rootDirectory, 'output')
    writeFakeYtDlp(fakeYtDlpPath)
    mkdirSync(outputDirectory)
    const engine = createMediaTaskEngine({
      dataDirectory: path.join(rootDirectory, 'data'),
      idFactory: (kind) => kind === 'task' ? 'task-history-001' : 'deliverable-history-001',
      managedRuntimes: {
        ytDlp: { command: process.execPath, argsPrefix: [fakeYtDlpPath], version: '2026.07.04-fixture' },
        ffmpeg: { command: 'ffmpeg', version: '7.1-fixture' },
      },
    })

    try {
      const inspection = await engine.inspectSource({ kind: 'network-url', url: 'https://media.example/watch?v=42' })
      assert.equal(inspection.status, 'ready')
      if (inspection.status !== 'ready') return
      const plan = await engine.planTask({
        source: inspection.source,
        recipeId: 'network-video',
        outputDirectory,
        language: 'en',
      })
      engine.createTask(plan)
      const completed = await engine.runTask('task-history-001')
      const deliveryPath = completed.deliverables[0].path
      assert.equal(existsSync(deliveryPath), true)

      const cleared = await engine.clearTaskHistory()
      assert.equal(cleared.tasks.length, 0)
      assert.equal(cleared.deliverables.length, 0)
      assert.equal(cleared.taskBatches.length, 0)
      assert.equal(existsSync(deliveryPath), true)
      assert.equal(existsSync(path.join(outputDirectory, '.media-dock-staging')), false)
    } finally {
      engine.close()
    }
  })
})

test('network delivery names sanitize URL-title separators without dropping Unicode title segments', async () => {
  await withTemporaryWorkspace(async (rootDirectory) => {
    const outputDirectory = path.join(rootDirectory, 'output')
    mkdirSync(outputDirectory)
    const engine = createMediaTaskEngine({
      dataDirectory: path.join(rootDirectory, 'data'),
      managedRuntimes: {
        ytDlp: { command: 'yt-dlp', version: '2026.07.04-test' },
        ffmpeg: { command: 'ffmpeg', version: '7.1-test' },
      },
    })

    try {
      const plan = await engine.planTask({
        source: {
          kind: 'network-url',
          locator: 'https://media.example/watch?v=title',
          displayName: '系列 / 第 1 集: 开场?',
          mediaKind: 'video',
          durationSeconds: 12,
          formatName: 'webm',
          sourceId: 'title',
          serviceName: 'FixtureTV',
        },
        recipeId: 'network-video',
        outputDirectory,
        language: 'zh-CN',
      })

      assert.equal(plan.deliveryName, '系列 _ 第 1 集_ 开场_ - 视频.mp4')
    } finally {
      engine.close()
    }
  })
})

test('an imported MediaCookies package stays secret while its profile is pinned by an authenticated network task', async () => {
  await withTemporaryWorkspace(async (rootDirectory) => {
    const dataDirectory = path.join(rootDirectory, 'data')
    const packageDirectory = path.join(rootDirectory, 'MediaCookies Export')
    const serviceDirectory = path.join(packageDirectory, 'by-service')
    const outputDirectory = path.join(rootDirectory, 'output')
    const fakeYtDlpPath = path.join(rootDirectory, 'cookie-aware-yt-dlp.cjs')
    const cookieSecret = 'SECRET_COOKIE_VALUE_MUST_NOT_LEAK'
    mkdirSync(serviceDirectory, { recursive: true })
    mkdirSync(outputDirectory)
    writeFileSync(
      path.join(serviceDirectory, 'youtube.cookies.txt'),
      `# Netscape HTTP Cookie File\n.youtube.example\tTRUE\t/\tTRUE\t2147483647\tSID\t${cookieSecret}\n`,
    )
    writeCookieAwareFakeYtDlp(fakeYtDlpPath, cookieSecret)

    let timestampOffset = 0
    let authenticationProfileCount = 0
    const engine = createMediaTaskEngine({
      dataDirectory,
      idFactory: (kind) => kind === 'authentication-profile'
        ? `auth-profile-${String(++authenticationProfileCount).padStart(3, '0')}`
        : kind === 'task'
          ? 'task-auth-001'
          : 'deliverable-auth-001',
      now: () => new Date(Date.parse('2026-07-13T08:00:00.000Z') + timestampOffset++ * 1_000),
      managedRuntimes: {
        ytDlp: { command: process.execPath, argsPrefix: [fakeYtDlpPath], version: '2026.07.04-fixture' },
        ffmpeg: { command: 'ffmpeg', version: '7.1-fixture' },
      },
    })

    try {
      const imported = await engine.importAuthenticationPackage({
        sourceDirectory: packageDirectory,
        displayName: 'My MediaCookies',
      })
      assert.deepEqual(imported.authenticationProfiles, [{
        id: 'auth-profile-001',
        displayName: 'My MediaCookies',
        services: ['youtube'],
        health: 'ready',
        createdAt: '2026-07-13T08:00:00.000Z',
      }])
      assert.equal(JSON.stringify(imported).includes(cookieSecret), false)
      assert.equal(JSON.stringify(imported).includes(packageDirectory), false)

      const reimported = await engine.importAuthenticationPackage({
        sourceDirectory: packageDirectory,
        displayName: 'My newest MediaCookies',
      })
      assert.equal(reimported.authenticationProfiles.length, 2)

      const inspection = await engine.inspectSource({
        kind: 'network-url',
        url: 'https://youtube.example/watch?v=private',
      })
      assert.equal(inspection.status, 'ready')
      if (inspection.status !== 'ready') return
      const quality = await engine.inspectVideoQualities(inspection.source)
      assert.deepEqual(quality, {
        availableHeights: [2160, 1080],
        qualityOptions: [
          { height: 2160, estimatedBytes: null },
          { height: 1080, estimatedBytes: null },
        ],
        authenticationProfileId: 'auth-profile-002',
        authenticationProfileDisplayName: 'My newest MediaCookies',
      })
      const plan = await engine.planTask({
        source: inspection.source,
        recipeId: 'network-video',
        outputDirectory,
        language: 'en',
      })
      assert.equal(plan.authenticationProfileId, 'auth-profile-002')
      assert.equal(JSON.stringify(plan).includes(cookieSecret), false)
      assert.equal(JSON.stringify(plan).includes('cookies.txt'), false)

      engine.createTask(plan)
      rmSync(packageDirectory, { recursive: true, force: true })
      const completed = await engine.runTask('task-auth-001')
      assert.equal(completed.tasks[0].state, 'completed')
      assert.equal(existsSync(path.join(outputDirectory, 'Private Episode - Video.mp4')), true)
      assert.equal(JSON.stringify(completed).includes(cookieSecret), false)
    } finally {
      engine.close()
    }
  })
})

test('an abandoned running task becomes Needs Attention exactly once on restart', async () => {
  await withTemporaryWorkspace(async (rootDirectory) => {
    const dataDirectory = path.join(rootDirectory, 'data')
    const outputDirectory = path.join(rootDirectory, 'output')
    mkdirSync(outputDirectory)
    const planSource = {
      kind: 'local-file',
      locator: path.join(rootDirectory, 'interrupted.wav'),
      displayName: 'interrupted.wav',
      mediaKind: 'audio',
      durationSeconds: 2,
      formatName: 'wav',
    }
    const engine = createMediaTaskEngine({
      dataDirectory,
      idFactory: () => 'task-interrupted-001',
      now: () => new Date('2026-07-13T09:00:00.000Z'),
      managedRuntimes: {
        ffmpeg: { command: 'ffmpeg', version: '7.1-test' },
      },
    })
    const plan = await engine.planTask({
      source: planSource,
      recipeId: 'audio-compatible',
      outputDirectory,
      language: 'en',
    })
    engine.createTask(plan)
    const started = engine.startTask('task-interrupted-001')
    assert.equal(started.revision, 2)
    assert.equal(started.tasks[0].state, 'running')
    assert.equal(started.tasks[0].stage, 'preparing')
    engine.close()

    const recoveredEngine = createMediaTaskEngine({
      dataDirectory,
      now: () => new Date('2026-07-13T09:05:00.000Z'),
    })
    const recovered = recoveredEngine.getWorkspaceSnapshot()
    assert.equal(recovered.revision, 3)
    assert.equal(recovered.tasks[0].state, 'needs-attention')
    assert.equal(recovered.tasks[0].stage, 'preparing')
    assert.deepEqual(recovered.tasks[0].problem, {
      code: 'task.interrupted',
      category: 'media-processing',
      stage: 'preparing',
      titleKey: 'problem.taskInterrupted.title',
      summaryKey: 'problem.taskInterrupted.summary',
      actions: [{ id: 'retry-task', kind: 'retry-task' }],
    })
    recoveredEngine.close()

    const secondRestart = createMediaTaskEngine({ dataDirectory })
    try {
      assert.equal(secondRestart.getWorkspaceSnapshot().revision, 3)
    } finally {
      secondRestart.close()
    }
  })
})

test('a queued task can be cancelled without touching its source or destination', async () => {
  await withTemporaryWorkspace(async (rootDirectory) => {
    const outputDirectory = path.join(rootDirectory, 'output')
    mkdirSync(outputDirectory)
    const engine = createMediaTaskEngine({
      dataDirectory: path.join(rootDirectory, 'data'),
      idFactory: () => 'task-cancelled-001',
      managedRuntimes: {
        ffmpeg: { command: 'ffmpeg', version: '7.1-test' },
      },
    })
    try {
      const plan = await engine.planTask({
        source: {
          kind: 'local-file',
          locator: path.join(rootDirectory, 'not-created.wav'),
          displayName: 'not-created.wav',
          mediaKind: 'audio',
          durationSeconds: 2,
          formatName: 'wav',
        },
        recipeId: 'audio-compatible',
        outputDirectory,
        language: 'en',
      })
      engine.createTask(plan)
      const cancelled = engine.cancelTask('task-cancelled-001')
      assert.equal(cancelled.revision, 2)
      assert.equal(cancelled.tasks[0].state, 'cancelled')
      assert.equal(cancelled.tasks[0].stage, null)
      assert.equal(existsSync(path.join(outputDirectory, '.media-dock-staging')), false)
      await assert.rejects(engine.runTask('task-cancelled-001'), /cannot run from state cancelled/i)
    } finally {
      engine.close()
    }
  })
})

test('a Task Batch preserves member order and lets an independent task finish after another needs attention', { skip: !hasFfmpeg }, async () => {
  await withTemporaryWorkspace(async (rootDirectory) => {
    const outputDirectory = path.join(rootDirectory, 'output')
    const validSourcePath = path.join(rootDirectory, 'valid.wav')
    const missingSourcePath = path.join(rootDirectory, 'missing.wav')
    mkdirSync(outputDirectory)
    writeSilentWave(validSourcePath)

    let taskNumber = 0
    const engine = createMediaTaskEngine({
      dataDirectory: path.join(rootDirectory, 'data'),
      idFactory: (kind) => {
        if (kind === 'task-batch') return 'batch-001'
        if (kind === 'task') return `task-batch-${++taskNumber}`
        if (kind === 'deliverable') return 'deliverable-batch-001'
        return 'unused-auth-profile'
      },
      managedRuntimes: {
        ffmpeg: { command: ffmpegCommand, version: 'test-ffmpeg' },
      },
    })

    try {
      const missingPlan = await engine.planTask({
        source: {
          kind: 'local-file',
          locator: missingSourcePath,
          displayName: 'missing.wav',
          mediaKind: 'audio',
          durationSeconds: 1,
          formatName: 'wav',
        },
        recipeId: 'audio-compatible',
        outputDirectory,
        language: 'en',
      })
      const validPlan = await engine.planTask({
        source: {
          kind: 'local-file',
          locator: validSourcePath,
          displayName: 'valid.wav',
          mediaKind: 'audio',
          durationSeconds: 1,
          formatName: 'wav',
        },
        recipeId: 'audio-compatible',
        outputDirectory,
        language: 'en',
      })

      const created = engine.createTaskBatch([missingPlan, validPlan], 'balanced')
      assert.deepEqual(created.taskBatches, [{
        id: 'batch-001',
        schedulingProfile: 'balanced',
        createdAt: created.taskBatches[0].createdAt,
        taskIds: ['task-batch-1', 'task-batch-2'],
      }])
      assert.deepEqual(created.tasks.map((task) => task.id), ['task-batch-1', 'task-batch-2'])
      assert.equal(created.revision, 1)

      const finished = await engine.runTaskBatch('batch-001')
      assert.equal(finished.tasks.find((task) => task.id === 'task-batch-1')?.state, 'needs-attention')
      assert.equal(finished.tasks.find((task) => task.id === 'task-batch-2')?.state, 'completed')
      assert.equal(existsSync(path.join(outputDirectory, 'valid - Audio.m4a')), true)
      assert.equal(finished.deliverables[0]?.taskId, 'task-batch-2')
    } finally {
      engine.close()
    }
  })
})

test('a queued task whose pinned runtime is no longer active becomes Needs Attention instead of staying silently queued', async () => {
  await withTemporaryWorkspace(async (rootDirectory) => {
    const dataDirectory = path.join(rootDirectory, 'data')
    const outputDirectory = path.join(rootDirectory, 'output')
    mkdirSync(outputDirectory)
    const creator = createMediaTaskEngine({
      dataDirectory,
      idFactory: () => 'task-stale-runtime-001',
      managedRuntimes: {
        ffmpeg: { command: 'ffmpeg', version: '7.1-pinned' },
      },
    })
    const plan = await creator.planTask({
      source: {
        kind: 'local-file',
        locator: path.join(rootDirectory, 'source.wav'),
        displayName: 'source.wav',
        mediaKind: 'audio',
        durationSeconds: 1,
        formatName: 'wav',
      },
      recipeId: 'audio-compatible',
      outputDirectory,
      language: 'en',
    })
    creator.createTask(plan)
    creator.close()

    const runner = createMediaTaskEngine({
      dataDirectory,
      managedRuntimes: {
        ffmpeg: { command: 'ffmpeg', version: '8.0-active' },
      },
    })
    try {
      await assert.rejects(runner.runTask('task-stale-runtime-001'), /requires FFmpeg 7\.1-pinned/i)
      const task = runner.getWorkspaceSnapshot().tasks[0]
      assert.equal(task.state, 'needs-attention')
      assert.equal(task.stage, 'preparing')
      assert.equal(task.problem?.code, 'runtime.required-version-unavailable')
    } finally {
      runner.close()
    }
  })
})

test('a queued network task refuses to run after its pinned Deno runtime changes', async () => {
  await withTemporaryWorkspace(async (rootDirectory) => {
    const dataDirectory = path.join(rootDirectory, 'data')
    const outputDirectory = path.join(rootDirectory, 'output')
    mkdirSync(outputDirectory)
    const source = {
      kind: 'network-url',
      locator: 'https://media.example/watch?v=deno-pin',
      displayName: 'Deno pin fixture',
      mediaKind: 'video',
      durationSeconds: 12,
      formatName: 'webm',
      sourceId: 'deno-pin',
      serviceName: 'FixtureTV',
    }
    const planner = createMediaTaskEngine({
      dataDirectory,
      idFactory: () => 'task-deno-pin-001',
      managedRuntimes: {
        ffmpeg: { command: 'ffmpeg', version: '7.1-pinned' },
        ytDlp: { command: 'yt-dlp', version: '2026.07.04-pinned' },
        deno: { command: 'deno', version: '2.3.3-pinned' },
      },
    })
    const plan = await planner.planTask({
      source,
      recipeId: 'network-video',
      outputDirectory,
      language: 'en',
      videoQuality: { mode: 'best' },
    })
    planner.createTask(plan)
    planner.close()

    const runner = createMediaTaskEngine({
      dataDirectory,
      managedRuntimes: {
        ffmpeg: { command: 'ffmpeg', version: '7.1-pinned' },
        ytDlp: { command: 'yt-dlp', version: '2026.07.04-pinned' },
        deno: { command: 'deno', version: '2.9.2-new' },
      },
    })
    try {
      await assert.rejects(runner.runTask('task-deno-pin-001'), /requires Deno 2\.3\.3-pinned/i)
      const task = runner.getWorkspaceSnapshot().tasks[0]
      assert.equal(task.state, 'needs-attention')
      assert.equal(task.problem?.code, 'runtime.required-version-unavailable')
    } finally {
      runner.close()
    }
  })
})
