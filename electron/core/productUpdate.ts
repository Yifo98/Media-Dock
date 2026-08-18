import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export type ProductUpdatePlatform = 'darwin' | 'win32'

export function resolveProductApplicationRoot(executablePath: string, platform: ProductUpdatePlatform) {
  const platformPath = platform === 'win32' ? path.win32 : path.posix
  if (!platformPath.isAbsolute(executablePath)) {
    throw new Error('Product update executable path must be absolute.')
  }
  if (platform === 'win32') return platformPath.dirname(executablePath)

  const appBundleDirectory = platformPath.dirname(
    platformPath.dirname(platformPath.dirname(executablePath)),
  )
  if (platformPath.basename(appBundleDirectory) !== 'Media Dock.app') {
    throw new Error('Product update could not resolve the packaged Media Dock.app root.')
  }
  return platformPath.dirname(appBundleDirectory)
}

export async function verifyProductUpdateAsset(
  filePath: string,
  expected: Readonly<{ expectedSize: number; expectedDigest: string }>,
) {
  if (!Number.isSafeInteger(expected.expectedSize) || expected.expectedSize <= 0) {
    throw new Error('Product update asset size is missing or invalid.')
  }
  const digestMatch = /^sha256:([a-f0-9]{64})$/iu.exec(expected.expectedDigest.trim())
  if (!digestMatch?.[1]) {
    throw new Error('Product update asset does not provide a valid SHA-256 digest.')
  }
  const actualSize = statSync(filePath).size
  if (actualSize !== expected.expectedSize) {
    throw new Error(`Product update asset size did not match: expected ${expected.expectedSize}, received ${actualSize}.`)
  }

  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) hash.update(chunk)
  const actualDigest = hash.digest('hex')
  if (actualDigest.toLowerCase() !== digestMatch[1].toLowerCase()) {
    throw new Error('Product update asset digest did not match the GitHub Release metadata.')
  }
  return Object.freeze({ size: actualSize, sha256: actualDigest })
}

function requireFile(filePath: string, label: string) {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    throw new Error(`Product update is missing ${label}.`)
  }
}

function requireDirectory(directory: string, label: string) {
  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    throw new Error(`Product update is missing ${label}.`)
  }
}

export function resolvePortableUpdatePayload(extractedRoot: string, platform: ProductUpdatePlatform) {
  const payloadRoot = platform === 'darwin' ? path.join(extractedRoot, 'core') : extractedRoot
  requireDirectory(payloadRoot, 'its platform payload directory')
  if (existsSync(path.join(payloadRoot, 'Media Dock Data'))) {
    throw new Error('Product update payload must not contain Media Dock Data.')
  }

  if (platform === 'darwin') {
    requireFile(
      path.join(payloadRoot, 'Media Dock.app', 'Contents', 'MacOS', 'Media Dock'),
      'Media Dock.app',
    )
  } else {
    requireFile(path.join(payloadRoot, 'Media Dock.exe'), 'Media Dock.exe')
    requireDirectory(path.join(payloadRoot, 'resources'), 'the application resources directory')
  }
  return payloadRoot
}

function macPortableUpdateHelper() {
  return `#!/bin/zsh
set -u

UPDATE_PID="$1"
PAYLOAD_ROOT="$2"
TARGET_ROOT="$3"
BACKUP_ROOT="$4"
typeset -a INSTALLED_NAMES

while kill -0 "$UPDATE_PID" 2>/dev/null; do
  sleep 1
done

rollback() {
  local name item
  for name in $INSTALLED_NAMES; do
    [[ ! -e "$TARGET_ROOT/$name" ]] || rm -rf -- "$TARGET_ROOT/$name"
  done
  for item in "$BACKUP_ROOT"/*(DN); do
    mv -- "$item" "$TARGET_ROOT/" 2>/dev/null || true
  done
}

fail_update() {
  rollback
  exit 1
}

[[ -x "$PAYLOAD_ROOT/Media Dock.app/Contents/MacOS/Media Dock" ]] || exit 2
[[ ! -e "$PAYLOAD_ROOT/Media Dock Data" ]] || exit 3
mkdir -p -- "$BACKUP_ROOT" || exit 4

for item in "$PAYLOAD_ROOT"/*(DN); do
  name="${'${item:t}'}"
  [[ "$name" != "Media Dock Data" ]] || fail_update
  if [[ -e "$TARGET_ROOT/$name" ]]; then
    mv -- "$TARGET_ROOT/$name" "$BACKUP_ROOT/" || fail_update
  fi
done

for item in "$PAYLOAD_ROOT"/*(DN); do
  name="${'${item:t}'}"
  mv -- "$item" "$TARGET_ROOT/" || fail_update
  INSTALLED_NAMES+=("$name")
done

open "$TARGET_ROOT/Media Dock.app" || fail_update
exit 0
`
}

function windowsPortableUpdateHelper() {
  return `@echo off\r
setlocal EnableExtensions DisableDelayedExpansion\r
set "UPDATE_PID=%~1"\r
set "PAYLOAD_ROOT=%~2"\r
set "TARGET_ROOT=%~3"\r
set "BACKUP_ROOT=%~4"\r
set "ENTRY_LIST=%~f0.entries"\r
\r
:wait_for_exit\r
tasklist /FI "PID eq %UPDATE_PID%" /NH 2>NUL | findstr /R /C:"[ ]%UPDATE_PID%[ ]" >NUL\r
if not errorlevel 1 (\r
  timeout /T 1 /NOBREAK >NUL\r
  goto wait_for_exit\r
)\r
\r
if not exist "%PAYLOAD_ROOT%\\Media Dock.exe" exit /B 2\r
if exist "%PAYLOAD_ROOT%\\Media Dock Data" exit /B 3\r
if not exist "%BACKUP_ROOT%" mkdir "%BACKUP_ROOT%" || exit /B 4\r
dir /B /A "%PAYLOAD_ROOT%" > "%ENTRY_LIST%" || exit /B 5\r
\r
for /F "usebackq delims=" %%I in ("%ENTRY_LIST%") do call :backup_entry "%%I"\r
if errorlevel 1 goto rollback\r
for /F "usebackq delims=" %%I in ("%ENTRY_LIST%") do call :install_entry "%%I"\r
if errorlevel 1 goto rollback\r
\r
start "" "%TARGET_ROOT%\\Media Dock.exe"\r
if errorlevel 1 goto rollback\r
del /F /Q "%ENTRY_LIST%" >NUL 2>NUL\r
exit /B 0\r
\r
:backup_entry\r
if /I "%~1"=="Media Dock Data" exit /B 90\r
if exist "%TARGET_ROOT%\\%~1" move /Y "%TARGET_ROOT%\\%~1" "%BACKUP_ROOT%\\" >NUL || exit /B 1\r
exit /B 0\r
\r
:install_entry\r
move /Y "%PAYLOAD_ROOT%\\%~1" "%TARGET_ROOT%\\" >NUL || exit /B 1\r
exit /B 0\r
\r
:rollback\r
if exist "%ENTRY_LIST%" for /F "usebackq delims=" %%I in ("%ENTRY_LIST%") do call :remove_installed "%%I"\r
if exist "%BACKUP_ROOT%" for /F "delims=" %%I in ('dir /B /A "%BACKUP_ROOT%"') do move /Y "%BACKUP_ROOT%\\%%I" "%TARGET_ROOT%\\" >NUL\r
exit /B 1\r
\r
:remove_installed\r
if exist "%TARGET_ROOT%\\%~1\\NUL" (rmdir /S /Q "%TARGET_ROOT%\\%~1") else if exist "%TARGET_ROOT%\\%~1" del /F /Q "%TARGET_ROOT%\\%~1"\r
exit /B 0\r
`
}

export function createPortableUpdateLaunch(options: Readonly<{
  platform: ProductUpdatePlatform
  helperDirectory: string
  currentPid: number
  payloadRoot: string
  portableRoot: string
  backupRoot: string
}>) {
  if (!Number.isInteger(options.currentPid) || options.currentPid <= 0) {
    throw new Error('Product update requires a valid application process id.')
  }
  const platformPath = options.platform === 'win32' ? path.win32 : path.posix
  for (const [label, value] of [
    ['payload root', options.payloadRoot],
    ['portable root', options.portableRoot],
    ['backup root', options.backupRoot],
  ] as const) {
    if (!platformPath.isAbsolute(value)) throw new Error(`Product update ${label} must be absolute.`)
  }
  mkdirSync(options.helperDirectory, { recursive: true })
  const extension = options.platform === 'darwin' ? 'command' : 'cmd'
  const helperPath = path.join(options.helperDirectory, `apply-media-dock-update-${randomUUID()}.${extension}`)
  writeFileSync(
    helperPath,
    options.platform === 'darwin' ? macPortableUpdateHelper() : windowsPortableUpdateHelper(),
    { encoding: 'utf8', mode: 0o700, flag: 'wx' },
  )

  const updateArguments = [
    String(options.currentPid),
    options.payloadRoot,
    options.portableRoot,
    options.backupRoot,
  ]
  return Object.freeze(options.platform === 'darwin'
    ? { command: '/bin/zsh', args: Object.freeze([helperPath, ...updateArguments]), helperPath }
    : { command: 'cmd.exe', args: Object.freeze(['/d', '/s', '/c', helperPath, ...updateArguments]), helperPath })
}
