#!/bin/zsh

set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "macOS package verification requires a native Mac."
  exit 1
fi
if (( $# < 4 )); then
  echo "Usage: verify-macos-package.sh <zip> <runtime-manifest> <checksum-output> <expected-version>"
  exit 1
fi

PACKAGE_PATH="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
MANIFEST_PATH="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
CHECKSUM_PATH="$(cd "$(dirname "$3")" && pwd)/$(basename "$3")"
EXPECTED_VERSION="$4"
REQUIRE_SIGNED="${MEDIA_DOCK_REQUIRE_SIGNING:-0}"
INSPECT_DIR="$(mktemp -d -t 'Media Dock 验证')"

cleanup() {
  rm -rf "$INSPECT_DIR"
}
trap cleanup EXIT

rm -f "$CHECKSUM_PATH"
ditto -x -k "$PACKAGE_PATH" "$INSPECT_DIR"
APP_PATH="$(find "$INSPECT_DIR" -maxdepth 2 -name 'Media Dock.app' -type d | head -n 1)"
if [[ -z "$APP_PATH" ]]; then
  echo "Expected exactly one Media Dock.app in the final ZIP."
  exit 1
fi

PLIST="$APP_PATH/Contents/Info.plist"
IDENTIFIER="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$PLIST")"
DISPLAY_NAME="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleName' "$PLIST")"
SHORT_VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$PLIST")"
[[ "$IDENTIFIER" == "com.yifo.mediadock" ]] || { echo "Unexpected app identifier: $IDENTIFIER"; exit 1; }
[[ "$DISPLAY_NAME" == "Media Dock" ]] || { echo "Unexpected app name: $DISPLAY_NAME"; exit 1; }
[[ "$SHORT_VERSION" == "$EXPECTED_VERSION" ]] || { echo "Unexpected app version: $SHORT_VERSION (expected $EXPECTED_VERSION)"; exit 1; }
echo "[OK] macOS bundle identity"

if [[ "$REQUIRE_SIGNED" == "1" ]]; then
  [[ "$(basename "$PACKAGE_PATH")" != *Unsigned-Developer-Preview* ]] || { echo "Signed package carries unsigned label."; exit 1; }
  codesign --verify --deep --strict --verbose=2 "$APP_PATH"
  spctl --assess --type execute --verbose=2 "$APP_PATH"
  xcrun stapler validate "$APP_PATH"
  echo "[OK] Developer ID signature, Gatekeeper assessment, notarization staple"
else
  [[ "$(basename "$PACKAGE_PATH")" == *Unsigned-Developer-Preview* ]] || { echo "Unsigned package lacks preview label."; exit 1; }
  echo "[INFO] Unsigned Developer Preview: Gatekeeper trust is intentionally not claimed."
fi

TOOLS_ROOT="$APP_PATH/Contents/Resources/tools"
node - "$MANIFEST_PATH" "$TOOLS_ROOT" <<'NODE'
const { createHash } = require('node:crypto')
const { readdirSync, readFileSync, statSync } = require('node:fs')
const path = require('node:path')
const manifest = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const root = process.argv[3]
const actual = {}
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const filePath = path.join(directory, entry.name)
    if (entry.isDirectory()) walk(filePath)
    else if (entry.isFile()) {
      actual[path.relative(root, filePath).split(path.sep).join('/')] = {
        size: statSync(filePath).size,
        sha256: createHash('sha256').update(readFileSync(filePath)).digest('hex'),
      }
    }
  }
}
walk(root)
if (JSON.stringify(actual) !== JSON.stringify(manifest.files)) {
  throw new Error('Packaged macOS runtime inventory does not match MACOS-RUNTIMES.json.')
}
NODE

RUNTIME_BIN="$TOOLS_ROOT/bin"
"$RUNTIME_BIN/yt-dlp" --version
"$RUNTIME_BIN/deno" --version
DYLD_LIBRARY_PATH="$TOOLS_ROOT/lib" "$RUNTIME_BIN/ffmpeg" -version | head -n 1
DYLD_LIBRARY_PATH="$TOOLS_ROOT/lib" "$RUNTIME_BIN/ffprobe" -version | head -n 1
echo "[OK] yt-dlp, Deno, ffmpeg, and ffprobe version probes"

WRITABLE_ROOT="$INSPECT_DIR/便携 数据 测试"
mkdir -p "$WRITABLE_ROOT"
MEDIA_DOCK_PORTABLE_ROOT="$WRITABLE_ROOT" MEDIA_DOCK_STARTUP_PROBE=1 "$APP_PATH/Contents/MacOS/Media Dock"
[[ -f "$WRITABLE_ROOT/Media Dock Data/startup-probe.json" ]] || { echo "Portable startup probe was not written."; exit 1; }

EXIT_ROOT="$INSPECT_DIR/退出 清理 测试"
mkdir -p "$EXIT_ROOT"
MEDIA_DOCK_PORTABLE_ROOT="$EXIT_ROOT" MEDIA_DOCK_EXIT_PROBE=1 "$APP_PATH/Contents/MacOS/Media Dock"
[[ -f "$EXIT_ROOT/Media Dock Data/exit-probe.json" ]] || { echo "Exit cleanup probe was not written."; exit 1; }
grep -q '"taskEngineClosed": true' "$EXIT_ROOT/Media Dock Data/exit-probe.json" || { echo "Task engine did not close during exit probe."; exit 1; }
grep -q '"ipcUnregistered": true' "$EXIT_ROOT/Media Dock Data/exit-probe.json" || { echo "IPC did not unregister during exit probe."; exit 1; }

BLOCKED_ROOT="$INSPECT_DIR/只读 数据 测试"
mkdir -p "$BLOCKED_ROOT"
chmod 500 "$BLOCKED_ROOT"
set +e
MEDIA_DOCK_PORTABLE_ROOT="$BLOCKED_ROOT" MEDIA_DOCK_STARTUP_PROBE=1 "$APP_PATH/Contents/MacOS/Media Dock"
BLOCKED_EXIT=$?
set -e
chmod 700 "$BLOCKED_ROOT"
[[ "$BLOCKED_EXIT" -ne 0 ]] || { echo "Invalid portable data path did not fail."; exit 1; }
echo "[OK] Startup, exit cleanup, portable writes, and invalid-path failure"

(
  cd "$(dirname "$PACKAGE_PATH")"
  shasum -a 256 "$(basename "$PACKAGE_PATH")" "$(basename "$MANIFEST_PATH")" > "$CHECKSUM_PATH"
)
echo "macOS package verification passed: $PACKAGE_PATH"
