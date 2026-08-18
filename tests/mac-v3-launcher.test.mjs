import assert from 'node:assert/strict'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const projectRoot = path.resolve(import.meta.dirname, '..')
const launcherScript = path.join(projectRoot, 'scripts', 'launch-mac-v3-preview.sh')
test('the macOS 3.0 preview launcher resolves the project-local Electron runtime in dry-run mode', {
  skip: process.platform !== 'darwin',
}, () => {
  assert.equal(existsSync(launcherScript), true)

  const syntax = spawnSync('/bin/zsh', ['-n', launcherScript], { encoding: 'utf8' })
  assert.equal(syntax.status, 0, syntax.stderr)

  const result = spawnSync('/bin/zsh', [launcherScript], {
    cwd: '/',
    encoding: 'utf8',
    env: {
      ...process.env,
      MEDIA_DOCK_LAUNCHER_DRY_RUN: '1',
      MEDIA_DOCK_SKIP_BUILD: '1',
    },
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  assert.equal(result.status, 0, output)
  assert.match(output, /Media Dock 3 Preview launcher is ready\./u)
  assert.match(output, new RegExp(projectRoot.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'))
  assert.match(output, /node_modules[/\\]\.bin[/\\]electron/u)
})

test('the macOS 3.0 preview launcher rejects an incomplete Electron runtime before declaring readiness', {
  skip: process.platform !== 'darwin',
}, (t) => {
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'media-dock-launcher-'))
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }))

  const fixtureLauncher = path.join(fixtureRoot, 'scripts', 'launch-mac-v3-preview.sh')
  const electronShim = path.join(fixtureRoot, 'node_modules', '.bin', 'electron')
  mkdirSync(path.dirname(fixtureLauncher), { recursive: true })
  mkdirSync(path.dirname(electronShim), { recursive: true })
  mkdirSync(path.join(fixtureRoot, 'node_modules', 'electron'), { recursive: true })
  mkdirSync(path.join(fixtureRoot, 'dist'), { recursive: true })
  mkdirSync(path.join(fixtureRoot, 'dist-electron'), { recursive: true })

  copyFileSync(launcherScript, fixtureLauncher)
  writeFileSync(path.join(fixtureRoot, 'package.json'), '{}\n')
  writeFileSync(path.join(fixtureRoot, 'dist', 'index.html'), '<!doctype html>\n')
  writeFileSync(path.join(fixtureRoot, 'dist-electron', 'main.js'), '')
  writeFileSync(electronShim, '#!/bin/zsh\nexit 0\n')
  chmodSync(electronShim, 0o755)
  writeFileSync(
    path.join(fixtureRoot, 'node_modules', 'electron', 'path.txt'),
    'Electron.app/Contents/MacOS/Electron',
  )

  const result = spawnSync('/bin/zsh', [fixtureLauncher], {
    cwd: '/',
    encoding: 'utf8',
    env: {
      ...process.env,
      MEDIA_DOCK_LAUNCHER_DRY_RUN: '1',
      MEDIA_DOCK_SKIP_BUILD: '1',
    },
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  assert.notEqual(result.status, 0, output)
  assert.match(output, /Electron runtime is incomplete/u)
  assert.match(output, /npm rebuild electron/u)
  assert.doesNotMatch(output, /Media Dock 3 Preview launcher is ready\./u)
})
