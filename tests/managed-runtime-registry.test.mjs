import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'

import { createManagedRuntimeRegistry } from '../dist-electron/v3/managedRuntimeRegistry.js'

const execFileAsync = promisify(execFile)

function sha256(payload) {
  return createHash('sha256').update(payload).digest('hex')
}

async function probeNodeFixture(filePath) {
  try {
    const result = await execFileAsync(process.execPath, [filePath, '--version'])
    return result.stdout.trim() || null
  } catch {
    return null
  }
}

async function withRuntimeWorkspace(run) {
  const rootDirectory = mkdtempSync(path.join(tmpdir(), 'media-dock-v3-runtimes-'))
  try {
    return await run(rootDirectory)
  } finally {
    rmSync(rootDirectory, { recursive: true, force: true })
  }
}

function runtimePayload(version) {
  return Buffer.from(`process.stdout.write('${version}\\n')\n`, 'utf8')
}

test('a verified managed runtime activates from a version directory without changing the bundled baseline', async () => {
  await withRuntimeWorkspace(async (rootDirectory) => {
    const baselinePath = path.join(rootDirectory, 'bundled-yt-dlp.cjs')
    const baselinePayload = runtimePayload('2026.06.01')
    const updatePayload = runtimePayload('2026.07.04')
    writeFileSync(baselinePath, baselinePayload)

    const registry = createManagedRuntimeRegistry({
      rootDirectory: path.join(rootDirectory, 'tools'),
      baselines: {
        'yt-dlp': { command: baselinePath, argsPrefix: [], version: '2026.06.01' },
      },
      now: () => new Date('2026-07-13T07:00:00.000Z'),
      idFactory: () => 'operation-001',
    })

    const stages = []
    const activated = await registry.installAndActivate({
      tool: 'yt-dlp',
      version: '2026.07.04',
      executableName: 'yt-dlp.cjs',
      expectedSize: updatePayload.byteLength,
      expectedSha256: sha256(updatePayload),
      populateCandidate: async (candidatePath) => writeFileSync(candidatePath, updatePayload),
      probeVersion: probeNodeFixture,
      onStage: (stage) => stages.push(stage),
    })

    assert.equal(activated.version, '2026.07.04')
    assert.equal(activated.source, 'managed')
    assert.match(activated.command, /tools[/\\]versions[/\\]yt-dlp[/\\].+[/\\]yt-dlp\.cjs$/u)
    assert.deepEqual(readFileSync(baselinePath), baselinePayload)
    assert.deepEqual(readFileSync(activated.command), updatePayload)
    assert.deepEqual(stages, ['staging', 'verifying', 'activating', 'complete'])
    assert.deepEqual(registry.getSnapshot(), {
      active: [{
        tool: 'yt-dlp',
        version: '2026.07.04',
        command: activated.command,
        source: 'managed',
        activatedAt: '2026-07-13T07:00:00.000Z',
      }],
      rollbackAvailable: [{ tool: 'yt-dlp', version: '2026.06.01', source: 'baseline' }],
    })
  })
})

test('a failed managed runtime candidate leaves the active manifest and version untouched', async () => {
  await withRuntimeWorkspace(async (rootDirectory) => {
    const baselinePath = path.join(rootDirectory, 'bundled-yt-dlp.cjs')
    writeFileSync(baselinePath, runtimePayload('2026.06.01'))
    const registry = createManagedRuntimeRegistry({
      rootDirectory: path.join(rootDirectory, 'tools'),
      baselines: {
        'yt-dlp': { command: baselinePath, version: '2026.06.01' },
      },
    })
    const validPayload = runtimePayload('2026.07.04')
    await registry.installAndActivate({
      tool: 'yt-dlp',
      version: '2026.07.04',
      executableName: 'yt-dlp.cjs',
      expectedSha256: sha256(validPayload),
      populateCandidate: async (candidatePath) => writeFileSync(candidatePath, validPayload),
      probeVersion: probeNodeFixture,
    })
    const beforeFailure = registry.getSnapshot()

    await assert.rejects(
      registry.installAndActivate({
        tool: 'yt-dlp',
        version: '2026.08.01',
        executableName: 'yt-dlp.cjs',
        expectedSha256: '0'.repeat(64),
        populateCandidate: async (candidatePath) => writeFileSync(candidatePath, runtimePayload('2026.08.01')),
        probeVersion: probeNodeFixture,
      }),
      /SHA-256 validation failed/i,
    )

    assert.deepEqual(registry.getSnapshot(), beforeFailure)
    assert.equal(existsSync(path.join(rootDirectory, 'tools', 'staging')), true)
    assert.deepEqual(readdirSync(path.join(rootDirectory, 'tools', 'staging')), [])
  })
})

test('managed runtime activation survives restart and rollback restores the previous known-good version', async () => {
  await withRuntimeWorkspace(async (rootDirectory) => {
    const toolsDirectory = path.join(rootDirectory, 'tools')
    const baselinePath = path.join(rootDirectory, 'bundled-yt-dlp.cjs')
    writeFileSync(baselinePath, runtimePayload('2026.06.01'))
    const createRegistry = () => createManagedRuntimeRegistry({
      rootDirectory: toolsDirectory,
      baselines: {
        'yt-dlp': { command: baselinePath, version: '2026.06.01' },
      },
    })

    const firstRegistry = createRegistry()
    const firstUpdate = runtimePayload('2026.07.04')
    const firstActive = await firstRegistry.installAndActivate({
      tool: 'yt-dlp',
      version: '2026.07.04',
      executableName: 'yt-dlp.cjs',
      expectedSha256: sha256(firstUpdate),
      populateCandidate: async (candidatePath) => writeFileSync(candidatePath, firstUpdate),
      probeVersion: probeNodeFixture,
    })

    const restartedRegistry = createRegistry()
    assert.deepEqual(restartedRegistry.getActive('yt-dlp'), firstActive)
    const secondUpdate = runtimePayload('2026.08.01')
    await restartedRegistry.installAndActivate({
      tool: 'yt-dlp',
      version: '2026.08.01',
      executableName: 'yt-dlp.cjs',
      expectedSha256: sha256(secondUpdate),
      populateCandidate: async (candidatePath) => writeFileSync(candidatePath, secondUpdate),
      probeVersion: probeNodeFixture,
    })

    const rolledBack = restartedRegistry.rollback('yt-dlp')
    assert.equal(rolledBack.version, '2026.07.04')
    assert.equal(rolledBack.command, firstActive.command)
    assert.deepEqual(createRegistry().getActive('yt-dlp'), firstActive)
  })
})
