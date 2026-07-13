import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

const ffprobeCommand = process.env.MEDIA_DOCK_TEST_FFPROBE ?? 'ffprobe'
const hasFfprobe = spawnSync(ffprobeCommand, ['-version'], { stdio: 'ignore' }).status === 0
const ffmpegCommand = process.env.MEDIA_DOCK_TEST_FFMPEG ?? 'ffmpeg'
const hasFfmpeg = spawnSync(ffmpegCommand, ['-version'], { stdio: 'ignore' }).status === 0

test('a new Media Task Engine exposes an empty revisioned workspace snapshot', async () => {
  await withTemporaryWorkspace((dataDirectory) => {
    const engine = createMediaTaskEngine({ dataDirectory })

    try {
      assert.deepEqual(engine.getWorkspaceSnapshot(), {
        contractVersion: 1,
        revision: 0,
        tasks: [],
        deliverables: [],
        systemOperations: [],
      })
    } finally {
      engine.close()
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

      assert.equal(completedSnapshot.revision, 4)
      assert.equal(completedSnapshot.tasks[0].state, 'completed')
      assert.equal(completedSnapshot.tasks[0].stage, 'delivering')
      assert.equal(completedSnapshot.tasks[0].problem, null)
      assert.deepEqual(completedSnapshot.deliverables, [{
        id: 'deliverable-local-001',
        taskId: 'task-local-001',
        path: deliveryPath,
        deliveryName: 'field-note - Audio.m4a',
        createdAt: '2026-07-13T05:00:03.000Z',
      }])
      assert.equal((await engine.inspectSource({ kind: 'local-file', path: deliveryPath })).status, 'ready')
      assert.equal(spawnSync(ffprobeCommand, ['-v', 'error', deliveryPath]).status, 0)
      assert.equal(spawnSync(ffprobeCommand, ['-v', 'error', sourcePath]).status, 0)
      assert.equal(existsSync(path.join(outputDirectory, '.media-dock-staging')), false)
      assert.deepEqual(publishedRevisions, [1, 2, 3, 4])
      unsubscribe()
    } finally {
      engine.close()
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
