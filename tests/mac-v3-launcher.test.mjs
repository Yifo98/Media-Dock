import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const projectRoot = path.resolve(import.meta.dirname, '..')
const launcherScript = path.join(projectRoot, 'scripts', 'launch-mac-v3-preview.sh')
const launcherCommand = path.join(projectRoot, 'Launch Media Dock 3 Preview.command')

test('the macOS 3.0 preview launcher resolves the project-local Electron runtime in dry-run mode', {
  skip: process.platform !== 'darwin',
}, () => {
  assert.equal(existsSync(launcherScript), true)
  assert.equal(existsSync(launcherCommand), true)
  assert.match(readFileSync(launcherCommand, 'utf8'), /launch-mac-v3-preview\.sh/u)

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
