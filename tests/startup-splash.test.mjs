import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  createStartupSplashDocument,
  createStartupSplashProgressScript,
  normalizeStartupProgress,
  STARTUP_SPLASH_COMPLETE_HOLD_MS,
  STARTUP_SPLASH_FADE_OUT_MS,
  STARTUP_SPLASH_MIN_VISIBLE_MS,
  STARTUP_SPLASH_TOTAL_STEPS,
} from '../dist-electron/core/startupSplash.js'

const mainSource = readFileSync(new URL('../electron/main.ts', import.meta.url), 'utf8')

test('startup splash exposes exact step progress and respects reduced motion', () => {
  const document = createStartupSplashDocument('data:image/png;base64,YWJj')
  assert.match(document, /role="status"/u)
  assert.match(document, /role="progressbar"/u)
  assert.match(document, /Media Dock 正在启动/u)
  assert.match(document, />0%<\/strong>/u)
  assert.match(document, new RegExp(`>0 / ${STARTUP_SPLASH_TOTAL_STEPS}<\\/span>`, 'u'))
  assert.match(document, /prefers-reduced-motion: reduce/u)
  assert.match(document, /body\.leaving/u)
  assert.match(document, /src="data:image\/png;base64,YWJj"/u)
  assert.doesNotMatch(document, /@keyframes sail|animation: sail/u)
  assert.equal(STARTUP_SPLASH_TOTAL_STEPS, 7)
  assert.ok(STARTUP_SPLASH_MIN_VISIBLE_MS >= 400)
  assert.ok(STARTUP_SPLASH_MIN_VISIBLE_MS <= 1_000)
  assert.ok(STARTUP_SPLASH_COMPLETE_HOLD_MS >= 150)
  assert.ok(STARTUP_SPLASH_COMPLETE_HOLD_MS <= 400)
  assert.ok(STARTUP_SPLASH_FADE_OUT_MS >= 150)
  assert.ok(STARTUP_SPLASH_FADE_OUT_MS <= 400)
})

test('startup progress derives its percentage from completed gates only', () => {
  assert.deepEqual(normalizeStartupProgress(3, 7, 'FFmpeg 检查完成'), {
    completed: 3,
    total: 7,
    percent: 43,
    message: 'FFmpeg 检查完成',
  })
  assert.deepEqual(normalizeStartupProgress(99, 7, '启动完成'), {
    completed: 7,
    total: 7,
    percent: 100,
    message: '启动完成',
  })
  const script = createStartupSplashProgressScript(4, 7, 'yt-dlp 检查完成')
  assert.match(script, /"completed":4/u)
  assert.match(script, /"percent":57/u)
  assert.match(script, /aria-valuenow/u)
})

test('startup splash appears before runtime probes and yields to a ready main window', () => {
  assert.match(
    mainSource,
    /createStartupSplashWindow\(\)\s+await initializeV3TaskEngine\(\)\s+createWindow\(\)/u,
  )
  assert.match(mainSource, /show: !isV3Window/u)
  assert.match(mainSource, /once\('ready-to-show',[\s\S]*?revealMainWindowAfterStartup/u)
  assert.match(mainSource, /skipTaskbar: true/u)
  assert.match(mainSource, /focusable: false/u)
  assert.match(mainSource, /updateStartupSplashProgress\(1, '应用数据已就绪/u)
  assert.match(mainSource, /trackStartupRuntimeProbe\('FFmpeg'/u)
  assert.match(mainSource, /trackStartupRuntimeProbe\('FFprobe'/u)
  assert.match(mainSource, /trackStartupRuntimeProbe\('yt-dlp'/u)
  assert.match(mainSource, /trackStartupRuntimeProbe\('Deno'/u)
  assert.match(mainSource, /updateStartupSplashProgress\(6, '任务工作区已就绪/u)
  assert.match(
    mainSource,
    /function revealMainWindowAfterStartup[\s\S]*?updateStartupSplashProgress\(STARTUP_SPLASH_TOTAL_STEPS, '启动完成'\)/u,
  )
  assert.match(mainSource, /destroyStartupSplashWindow\(\)[\s\S]*?showErrorBox/u)
})
