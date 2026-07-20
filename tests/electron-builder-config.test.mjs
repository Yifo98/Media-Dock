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
const afterPackScript = readFileSync(new URL('../scripts/after-pack.cjs', import.meta.url), 'utf8')
const macBuildScript = readFileSync(new URL('../scripts/build-mac-share.sh', import.meta.url), 'utf8')
const macVerifyScript = readFileSync(new URL('../scripts/verify-macos-package.sh', import.meta.url), 'utf8')
const windowsVerifyScript = readFileSync(new URL('../scripts/verify-windows-package.ps1', import.meta.url), 'utf8')
const electronMainSource = readFileSync(new URL('../electron/main.ts', import.meta.url), 'utf8')

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
  assert.equal(build.mac.hardenedRuntime, false, 'unsigned ad-hoc builds have no Team ID for hardened library validation')
  assert.equal(build.mac.entitlements, 'build/entitlements.mac.plist')
  assert.equal(build.mac.identity, '-', 'unsigned arm64 packages still require a valid ad-hoc bundle signature')
  assert.match(
    build.mac.signIgnore,
    /Contents.*Resources.*tools/u,
    'unsigned managed runtimes keep their independently verified signatures instead of inheriting hardened-runtime flags',
  )
  assert.match(build.mac.artifactName, /Unsigned-Developer-Preview/)
})

test('the macOS candidate is built and verified on a native macOS runner', () => {
  assert.match(macosWorkflow, /build_candidate:[\s\S]*?runs-on:\s*macos-/)
  assert.match(macosWorkflow, /verify-macos-package\.sh/)
  assert.match(macosWorkflow, /APPLE_API_KEY_BASE64/)
  assert.match(macosWorkflow, /MAC_CSC_LINK/)
  const signatureVerificationIndex = macVerifyScript.indexOf(
    'codesign --verify --deep --strict --verbose=2 "$APP_PATH"',
  )
  const trustedReleaseBranchIndex = macVerifyScript.indexOf('if [[ "$REQUIRE_SIGNED" == "1" ]]')
  assert.ok(signatureVerificationIndex >= 0 && signatureVerificationIndex < trustedReleaseBranchIndex,
    'the final extracted bundle must pass structural code-signature verification even when it is an unsigned preview')
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

test('3.0 packages expose exactly one platform-appropriate launcher', () => {
  assert.doesNotMatch(afterPackScript, /Launch Media Dock\.bat/u)
  assert.match(windowsVerifyScript, /Launch Media Dock\.bat/u)
  assert.match(windowsVerifyScript, /must not be present/u)
  assert.match(macBuildScript, /Launch Media Dock\.command/u)
  assert.match(macBuildScript, /core\/Media Dock\.app/u)
  assert.match(macVerifyScript, /Launch Media Dock\.command/u)
  assert.match(macVerifyScript, /core\/Media Dock\.app/u)
})

test('3.0 startup uses only the v3 Authentication Profile store', () => {
  assert.doesNotMatch(electronMainSource, /importLatestLegacyAuthenticationPackage\(v3TaskEngine, getCookiesDir\(\)\)/u)
})
