import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  createPortableUpdateLaunch,
  resolveProductApplicationRoot,
  resolvePortableUpdatePayload,
  verifyProductUpdateAsset,
} from '../dist-electron/core/productUpdate.js'

async function withTemporaryDirectory(run) {
  const directory = mkdtempSync(path.join(tmpdir(), 'media-dock-product-update-'))
  try {
    return await run(directory)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test('a downloaded product update must match the GitHub asset size and SHA-256 digest', async () => {
  await withTemporaryDirectory(async (directory) => {
    const assetPath = path.join(directory, 'Media Dock update.zip')
    const contents = Buffer.from('verified Media Dock update fixture')
    writeFileSync(assetPath, contents)
    const digest = createHash('sha256').update(contents).digest('hex')

    assert.deepEqual(await verifyProductUpdateAsset(assetPath, {
      expectedSize: contents.byteLength,
      expectedDigest: `sha256:${digest}`,
    }), { size: contents.byteLength, sha256: digest })
    await assert.rejects(
      async () => verifyProductUpdateAsset(assetPath, {
        expectedSize: contents.byteLength,
        expectedDigest: `sha256:${'0'.repeat(64)}`,
      }),
      /digest did not match/i,
    )
  })
})

test('portable update payloads preserve Media Dock Data and require the platform executable', async () => {
  await withTemporaryDirectory((directory) => {
    const windowsRoot = path.join(directory, 'windows')
    mkdirSync(path.join(windowsRoot, 'resources'), { recursive: true })
    writeFileSync(path.join(windowsRoot, 'Media Dock.exe'), 'fixture')
    assert.equal(resolvePortableUpdatePayload(windowsRoot, 'win32'), windowsRoot)

    const macRoot = path.join(directory, 'mac')
    const macPayload = path.join(macRoot, 'core')
    const macExecutable = path.join(macPayload, 'Media Dock.app', 'Contents', 'MacOS', 'Media Dock')
    mkdirSync(path.dirname(macExecutable), { recursive: true })
    writeFileSync(macExecutable, 'fixture')
    assert.equal(resolvePortableUpdatePayload(macRoot, 'darwin'), macPayload)

    mkdirSync(path.join(macPayload, 'Media Dock Data'))
    assert.throws(() => resolvePortableUpdatePayload(macRoot, 'darwin'), /must not contain Media Dock Data/i)
  })
})

test('the product application root is resolved from the executable instead of the portable data override', () => {
  assert.equal(
    resolveProductApplicationRoot(
      '/Volumes/Media Dock Portable/core/Media Dock.app/Contents/MacOS/Media Dock',
      'darwin',
    ),
    '/Volumes/Media Dock Portable/core',
  )
  assert.equal(
    resolveProductApplicationRoot('C:\\Media Dock Portable\\Media Dock.exe', 'win32'),
    'C:\\Media Dock Portable',
  )
  assert.throws(
    () => resolveProductApplicationRoot('/Applications/Electron.app/Contents/MacOS/Electron', 'darwin'),
    /could not resolve the packaged Media Dock\.app root/i,
  )
})

test('portable update helpers wait for exit, keep a rollback backup, and restart without policy bypasses', async () => {
  await withTemporaryDirectory((directory) => {
    const macLaunch = createPortableUpdateLaunch({
      platform: 'darwin',
      helperDirectory: directory,
      currentPid: 42,
      payloadRoot: '/tmp/更新 staging/core',
      portableRoot: '/Applications/Media Dock Portable/core',
      backupRoot: '/Applications/Media Dock Portable/core/Media Dock Data/updates/backups/3.0.0',
    })
    const macHelper = readFileSync(macLaunch.helperPath, 'utf8')
    assert.equal(macLaunch.command, '/bin/zsh')
    assert.match(macHelper, /kill -0/u)
    assert.match(macHelper, /BACKUP_ROOT/u)
    assert.match(macHelper, /rollback/u)
    assert.match(macHelper, /open .*Media Dock\.app/u)

    const windowsLaunch = createPortableUpdateLaunch({
      platform: 'win32',
      helperDirectory: directory,
      currentPid: 42,
      payloadRoot: 'C:\\更新 staging',
      portableRoot: 'C:\\Media Dock Portable',
      backupRoot: 'C:\\Media Dock Portable\\Media Dock Data\\updates\\backups\\3.0.0',
    })
    const windowsHelper = readFileSync(windowsLaunch.helperPath, 'utf8')
    assert.equal(windowsLaunch.command, 'cmd.exe')
    assert.equal(windowsLaunch.windowsVerbatimArguments, true)
    assert.equal(windowsLaunch.env.MEDIA_DOCK_UPDATE_HELPER, windowsLaunch.helperPath)
    assert.match(windowsHelper, /tasklist/iu)
    assert.match(windowsHelper, /BACKUP_ROOT/iu)
    assert.match(windowsHelper, /rollback/iu)
    assert.match(windowsHelper, /Media Dock\.exe/iu)
    assert.doesNotMatch(windowsHelper, /PowerShell|ExecutionPolicy|Bypass/iu)
  })
})

test('the macOS portable helper replaces the app, preserves Media Dock Data, and keeps the old app backup', {
  skip: process.platform !== 'darwin' ? 'requires the native macOS update helper' : false,
}, async () => {
  await withTemporaryDirectory((directory) => {
    const portableRoot = path.join(directory, 'Media Dock Portable', 'core')
    const dataRoot = path.join(portableRoot, 'Media Dock Data')
    const payloadRoot = path.join(dataRoot, 'updates', 'staged', '3.1.0', 'core')
    const backupRoot = path.join(dataRoot, 'updates', 'backups', '3.0.0')
    const helperDirectory = path.join(dataRoot, 'updates', 'helpers')
    const oldExecutable = path.join(portableRoot, 'Media Dock.app', 'Contents', 'MacOS', 'Media Dock')
    const newExecutable = path.join(payloadRoot, 'Media Dock.app', 'Contents', 'MacOS', 'Media Dock')
    const dataSentinel = path.join(dataRoot, 'keep-me.txt')
    const openMarker = path.join(directory, 'open-called.txt')
    const stubBin = path.join(directory, 'bin')
    const stubOpen = path.join(stubBin, 'open')
    mkdirSync(path.dirname(oldExecutable), { recursive: true })
    mkdirSync(path.dirname(newExecutable), { recursive: true })
    mkdirSync(stubBin)
    writeFileSync(oldExecutable, '#!/bin/sh\necho old\n')
    writeFileSync(newExecutable, '#!/bin/sh\necho new\n')
    writeFileSync(dataSentinel, 'preserved')
    writeFileSync(stubOpen, '#!/bin/sh\nprintf opened > "$MEDIA_DOCK_UPDATE_OPEN_MARKER"\n')
    chmodSync(oldExecutable, 0o755)
    chmodSync(newExecutable, 0o755)
    chmodSync(stubOpen, 0o755)

    const launch = createPortableUpdateLaunch({
      platform: 'darwin',
      helperDirectory,
      currentPid: 2_147_483_647,
      payloadRoot,
      portableRoot,
      backupRoot,
    })
    const result = spawnSync(launch.command, [...launch.args], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${stubBin}:${process.env.PATH ?? '/usr/bin:/bin'}`,
        MEDIA_DOCK_UPDATE_OPEN_MARKER: openMarker,
      },
    })

    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`)
    assert.match(readFileSync(oldExecutable, 'utf8'), /echo new/u)
    assert.match(readFileSync(path.join(backupRoot, 'Media Dock.app', 'Contents', 'MacOS', 'Media Dock'), 'utf8'), /echo old/u)
    assert.equal(readFileSync(dataSentinel, 'utf8'), 'preserved')
    assert.equal(readFileSync(openMarker, 'utf8'), 'opened')
  })
})

test('the Windows portable helper replaces the app, preserves Media Dock Data, and keeps the old app backup', {
  skip: process.platform !== 'win32' ? 'requires the native Windows update helper' : false,
}, async () => {
  await withTemporaryDirectory((directory) => {
    const portableRoot = path.join(directory, '中文 Media Dock Portable')
    const dataRoot = path.join(portableRoot, 'Media Dock Data')
    const payloadRoot = path.join(dataRoot, 'updates', 'staged', '3.1.0')
    const backupRoot = path.join(dataRoot, 'updates', 'backups', '3.0.0')
    const helperDirectory = path.join(dataRoot, 'updates', 'helpers')
    const oldExecutable = path.join(portableRoot, 'Media Dock.exe')
    const newExecutable = path.join(payloadRoot, 'Media Dock.exe')
    const dataSentinel = path.join(dataRoot, 'keep-me.txt')
    const systemExecutable = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'where.exe')
    mkdirSync(path.join(portableRoot, 'resources'), { recursive: true })
    mkdirSync(path.join(payloadRoot, 'resources'), { recursive: true })
    copyFileSync(systemExecutable, oldExecutable)
    copyFileSync(systemExecutable, newExecutable)
    appendFileSync(oldExecutable, 'old-version')
    appendFileSync(newExecutable, 'new-version')
    writeFileSync(path.join(portableRoot, 'resources', 'version.txt'), 'old')
    writeFileSync(path.join(payloadRoot, 'resources', 'version.txt'), 'new')
    writeFileSync(dataSentinel, 'preserved')

    const launch = createPortableUpdateLaunch({
      platform: 'win32',
      helperDirectory,
      currentPid: 2_147_483_647,
      payloadRoot,
      portableRoot,
      backupRoot,
    })
    const result = spawnSync(launch.command, [...launch.args], {
      encoding: 'utf8',
      windowsHide: true,
      windowsVerbatimArguments: launch.windowsVerbatimArguments,
      env: { ...process.env, ...launch.env },
    })

    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`)
    assert.equal(readFileSync(path.join(portableRoot, 'resources', 'version.txt'), 'utf8'), 'new')
    assert.equal(readFileSync(path.join(backupRoot, 'resources', 'version.txt'), 'utf8'), 'old')
    assert.equal(readFileSync(dataSentinel, 'utf8'), 'preserved')
    assert.match(readFileSync(newExecutable).subarray(-11).toString('utf8'), /new-version/u)
    assert.match(readFileSync(path.join(backupRoot, 'Media Dock.exe')).subarray(-11).toString('utf8'), /old-version/u)
  })
})
