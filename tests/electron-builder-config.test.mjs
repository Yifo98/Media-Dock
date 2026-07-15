import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const require = createRequire(import.meta.url)
const build = require('../electron-builder.config.cjs')
const windowsWorkflow = readFileSync(
  new URL('../.github/workflows/windows-package-gate.yml', import.meta.url),
  'utf8',
)
const macosWorkflow = readFileSync(
  new URL('../.github/workflows/macos-package-gate.yml', import.meta.url),
  'utf8',
)
const windowsBuildScript = readFileSync(
  new URL('../scripts/build-windows-native.mjs', import.meta.url),
  'utf8',
)

test('electron-builder owns the Windows executable identity and ZIP target', () => {
  assert.equal(build.appId, 'com.yifo.mediadock')
  assert.equal(build.productName, 'Media Dock')
  assert.equal(packageJson.author?.name, 'Yifo')
  assert.match(build.copyright, /Yifo/)
  assert.equal(build.win.executableName, 'Media Dock')
  assert.equal(build.win.signAndEditExecutable, true)
  assert.ok(build.win.signExts.includes('!yt-dlp.exe'))
  assert.ok(build.win.signExts.includes('!deno.exe'))
  assert.ok(build.win.signExts.includes('!ffmpeg.exe'))
  assert.ok(build.win.signExts.includes('!ffprobe.exe'))
  assert.equal(build.win.target, 'zip')
  assert.match(build.win.artifactName, /^Media-Dock-/)
  assert.match(build.win.artifactName, /Unsigned-Developer-Preview/)
  assert.equal(build.mac.target, 'zip')
  assert.equal(build.mac.hardenedRuntime, true)
  assert.equal(build.mac.entitlements, 'build/entitlements.mac.plist')
  assert.match(build.mac.artifactName, /Unsigned-Developer-Preview/)
})

test('the macOS candidate is built and verified on a native macOS runner', () => {
  assert.match(macosWorkflow, /build_candidate:[\s\S]*?runs-on:\s*macos-/)
  assert.match(macosWorkflow, /verify-macos-package\.sh/)
  assert.match(macosWorkflow, /APPLE_API_KEY_BASE64/)
  assert.match(macosWorkflow, /MAC_CSC_LINK/)
})

test('the Windows candidate is built and verified on a native Windows runner', () => {
  assert.doesNotMatch(
    windowsWorkflow,
    /build_candidate:[\s\S]*?runs-on:\s*macos-/,
    'Windows candidates must not be cross-built on macOS',
  )
  assert.match(windowsWorkflow, /build_candidate:[\s\S]*?runs-on:\s*windows-/)
  assert.match(windowsWorkflow, /Get-AuthenticodeSignature/)
  assert.match(windowsWorkflow, /ProductName/)
  assert.match(windowsWorkflow, /MEDIA_DOCK_FFMPEG_WINDOWS_URL/)
  assert.doesNotMatch(windowsBuildScript, /run\(['"](?:npm|npx)\.cmd['"]/u)
  assert.match(windowsBuildScript, /run\(process\.execPath/u)
})
