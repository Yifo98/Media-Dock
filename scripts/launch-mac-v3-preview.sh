#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ELECTRON_BIN="$PROJECT_ROOT/node_modules/.bin/electron"

fail() {
  print -u2 "Media Dock 3 Preview launcher could not start."
  print -u2 "$1"
  exit 1
}

[[ "$(uname -s)" == "Darwin" ]] || fail "This launcher is for macOS."
[[ -f "$PROJECT_ROOT/package.json" ]] || fail "package.json was not found at $PROJECT_ROOT"
[[ -x "$ELECTRON_BIN" ]] || fail "Project dependencies are missing. Run npm install in $PROJECT_ROOT first."

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export MEDIA_DOCK_V3_PREVIEW="1"

if [[ "${MEDIA_DOCK_SKIP_BUILD:-0}" != "1" ]]; then
  command -v npm >/dev/null 2>&1 || fail "npm is required to build the local preview."
  cd "$PROJECT_ROOT"
  print "Building the current Media Dock 3 Preview branch..."
  npm run build
fi

[[ -f "$PROJECT_ROOT/dist/index.html" ]] || fail "The web build is missing. Run npm run build first."
[[ -f "$PROJECT_ROOT/dist-electron/main.js" ]] || fail "The Electron build is missing. Run npm run build first."

print "Media Dock 3 Preview launcher is ready."
print "Project root: $PROJECT_ROOT"
print "Electron: $ELECTRON_BIN"
print "Data boundary: Media Dock Data/v3"

if [[ "${MEDIA_DOCK_LAUNCHER_DRY_RUN:-0}" == "1" ]]; then
  exit 0
fi

cd "$PROJECT_ROOT"
exec "$ELECTRON_BIN" "$PROJECT_ROOT"
