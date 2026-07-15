#!/bin/zsh

set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "macOS packages must be built on a native macOS runner or Mac."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RELEASE_DIR="$PROJECT_ROOT/release"
TOOLS_DIR="$PROJECT_ROOT/tools"
TOOLS_BIN_DIR="$TOOLS_DIR/bin"
TOOLS_LIB_DIR="$TOOLS_DIR/lib"
APP_VERSION="$(node -p "require('$PROJECT_ROOT/package.json').version")"
VERSION_DIR="$RELEASE_DIR/$APP_VERSION"
ENV_ROOT="${YTDLP_ENV_ROOT:-$HOME/.conda/envs/yt-dlp}"
ARCH_NAME="$(uname -m)"
YTDLP_VERSION="${YTDLP_VERSION:-}"
DENO_VERSION="${DENO_VERSION:-2.9.2}"
FFMPEG_SOURCE="${FFMPEG_SOURCE:-native macOS FFmpeg runtime supplied by the build environment}"

case "$ARCH_NAME" in
  arm64)
    DENO_ARCHIVE_NAME="deno-aarch64-apple-darwin.zip"
    BUILDER_ARCH_FLAG="--arm64"
    BUILDER_ARTIFACT_ARCH="arm64"
    ;;
  x86_64)
    DENO_ARCHIVE_NAME="deno-x86_64-apple-darwin.zip"
    BUILDER_ARCH_FLAG="--x64"
    BUILDER_ARTIFACT_ARCH="x64"
    ;;
  *)
    echo "Unsupported macOS architecture: $ARCH_NAME"
    exit 1
    ;;
esac

if [[ -z "${YTDLP_URL:-}" ]]; then
  if [[ -n "$YTDLP_VERSION" ]]; then
    YTDLP_URL="https://github.com/yt-dlp/yt-dlp/releases/download/$YTDLP_VERSION/yt-dlp"
  else
    YTDLP_URL="https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp"
  fi
fi
DENO_URL="${DENO_URL:-https://github.com/denoland/deno/releases/download/v${DENO_VERSION}/${DENO_ARCHIVE_NAME}}"
ZIP_PRIVACY_PATTERN='(^|/)(cookies?|Media Dock Data|app-cache)(/|$)|\.cookies\.txt|cookies\.txt|history|config\.json|user[- ]data|electron-session|subtitle-cleanup-config|api[_-]?key'

download_file() {
  curl --fail --location --retry 4 --retry-delay 2 --retry-all-errors \
    --connect-timeout 20 --speed-time 60 --speed-limit 1024 --max-time 900 \
    "$1" -o "$2"
}

cleanup() {
  rm -rf "$TOOLS_DIR"
}
trap cleanup EXIT

if [[ ! -x "$ENV_ROOT/bin/ffmpeg" || ! -x "$ENV_ROOT/bin/ffprobe" ]]; then
  echo "Missing native ffmpeg/ffprobe in $ENV_ROOT/bin. Set YTDLP_ENV_ROOT to a native macOS runtime prefix."
  exit 1
fi

rm -rf "$TOOLS_DIR" "$RELEASE_DIR/mac" "$RELEASE_DIR/mac-arm64" "$RELEASE_DIR/mac-universal"
mkdir -p "$TOOLS_BIN_DIR" "$TOOLS_LIB_DIR" "$VERSION_DIR"
rm -f "$RELEASE_DIR"/Media-Dock-"$APP_VERSION"*-mac.zip(N)
rm -f "$VERSION_DIR"/Media-Dock-"$APP_VERSION"*-mac.zip(N) "$VERSION_DIR/MACOS-RUNTIMES.json" "$VERSION_DIR/SHA256SUMS-mac.txt"

download_file "$YTDLP_URL" "$TOOLS_BIN_DIR/yt-dlp"
chmod +x "$TOOLS_BIN_DIR/yt-dlp"

TMP_DENO_DIR="$(mktemp -d)"
download_file "$DENO_URL" "$TMP_DENO_DIR/$DENO_ARCHIVE_NAME"
ditto -x -k "$TMP_DENO_DIR/$DENO_ARCHIVE_NAME" "$TMP_DENO_DIR/unpacked"
mv "$TMP_DENO_DIR/unpacked/deno" "$TOOLS_BIN_DIR/deno"
chmod +x "$TOOLS_BIN_DIR/deno"
rm -rf "$TMP_DENO_DIR"

cp "$ENV_ROOT/bin/ffmpeg" "$TOOLS_BIN_DIR/ffmpeg"
cp "$ENV_ROOT/bin/ffprobe" "$TOOLS_BIN_DIR/ffprobe"
chmod +x "$TOOLS_BIN_DIR/ffmpeg" "$TOOLS_BIN_DIR/ffprobe"

python3 - "$ENV_ROOT" "$TOOLS_LIB_DIR" "$TOOLS_BIN_DIR/ffmpeg" "$TOOLS_BIN_DIR/ffprobe" <<'PY'
import shutil
import subprocess
import sys
from pathlib import Path

env_root = Path(sys.argv[1])
lib_dir = Path(sys.argv[2])
targets = [Path(arg) for arg in sys.argv[3:]]
search_dirs = [env_root / "lib", Path("/opt/homebrew/lib"), Path("/usr/local/lib")]
copied: dict[Path, Path] = {}
queue = list(targets)

def dependencies(path: Path) -> list[str]:
    output = subprocess.check_output(["otool", "-L", str(path)], text=True)
    return [line.strip().split(" (compatibility version", 1)[0] for line in output.splitlines()[1:] if line.strip()]

def resolve_dependency(value: str) -> Path | None:
    if value.startswith("/System/") or value.startswith("/usr/lib/"):
        return None
    if value.startswith("@rpath/"):
        name = value.split("/", 1)[1]
        return next((directory / name for directory in search_dirs if (directory / name).exists()), None)
    candidate = Path(value)
    return candidate if candidate.exists() else None

while queue:
    current = queue.pop(0)
    for dependency in dependencies(current):
        resolved = resolve_dependency(dependency)
        if resolved is None or resolved in copied:
            continue
        destination = lib_dir / resolved.name
        if destination.exists() and destination.stat().st_size != resolved.stat().st_size:
            raise RuntimeError(f"Conflicting dylib basename while staging: {resolved.name}")
        if not destination.exists():
            shutil.copy2(resolved, destination, follow_symlinks=True)
        copied[resolved] = destination
        queue.append(destination)

all_targets = targets + list(copied.values())
for target in all_targets:
    for dependency in dependencies(target):
        resolved = resolve_dependency(dependency)
        if resolved is None:
            continue
        destination = copied.get(resolved)
        if destination is None:
            destination = next((value for source, value in copied.items() if source.name == resolved.name), None)
        if destination is not None:
            subprocess.run(["install_name_tool", "-change", dependency, f"@rpath/{destination.name}", str(target)], check=True)
    if target.parent == lib_dir:
        subprocess.run(["install_name_tool", "-id", f"@rpath/{target.name}", str(target)], check=True)
    subprocess.run(["install_name_tool", "-add_rpath", "@loader_path/../lib" if target.parent.name == "bin" else "@loader_path", str(target)], check=False)
PY

# Relocation edits invalidate the original ad-hoc signatures on the staged
# FFmpeg binaries. A formal build is signed later by electron-builder with the
# Developer ID identity; an unsigned arm64 preview still needs valid ad-hoc
# signatures so macOS can execute the relocated code.
if [[ "${MEDIA_DOCK_SIGNED_RELEASE:-0}" != "1" ]]; then
  for binary in "$TOOLS_LIB_DIR"/*.dylib(N) "$TOOLS_BIN_DIR/ffmpeg" "$TOOLS_BIN_DIR/ffprobe"; do
    codesign --force --sign - --timestamp=none "$binary"
  done
fi

cd "$PROJECT_ROOT"
npm run build
npx electron-builder --config electron-builder.config.cjs --mac zip "$BUILDER_ARCH_FLAG" --publish never

MAC_ARTIFACTS=("$RELEASE_DIR"/Media-Dock-"$APP_VERSION"*-"$BUILDER_ARTIFACT_ARCH"-mac.zip(N))
if (( ${#MAC_ARTIFACTS[@]} != 1 )); then
  echo "Expected exactly one native macOS ZIP; found ${#MAC_ARTIFACTS[@]}."
  exit 1
fi
MAC_ZIP="${MAC_ARTIFACTS[1]}"

if unzip -l "$MAC_ZIP" | grep -Eiq "$ZIP_PRIVACY_PATTERN"; then
  echo "Sensitive files were detected inside the macOS ZIP artifact."
  exit 1
fi

mv "$MAC_ZIP" "$VERSION_DIR/"
FINAL_MAC_ZIP="$VERSION_DIR/$(basename "$MAC_ZIP")"
MANIFEST_INSPECT_DIR="$(mktemp -d)"
ditto -x -k "$FINAL_MAC_ZIP" "$MANIFEST_INSPECT_DIR"
PACKAGED_APP="$(find "$MANIFEST_INSPECT_DIR" -maxdepth 2 -name 'Media Dock.app' -type d | head -n 1)"
if [[ -z "$PACKAGED_APP" ]]; then
  echo "Media Dock.app was not found in the final ZIP."
  exit 1
fi
node "$SCRIPT_DIR/record-runtime-manifest.mjs" \
  --platform macos \
  --runtime-dir "$PACKAGED_APP/Contents/Resources/tools" \
  --output "$VERSION_DIR/MACOS-RUNTIMES.json" \
  --source "yt-dlp=$YTDLP_URL" \
  --source "deno=$DENO_URL" \
  --source "ffmpeg=$FFMPEG_SOURCE"
rm -rf "$MANIFEST_INSPECT_DIR"

if [[ -f "$PROJECT_ROOT/docs/release/$APP_VERSION.md" ]]; then
  cp "$PROJECT_ROOT/docs/release/$APP_VERSION.md" "$VERSION_DIR/RELEASE-NOTES.md"
fi
rm -rf "$RELEASE_DIR/mac" "$RELEASE_DIR/mac-arm64" "$RELEASE_DIR/mac-universal"
rm -f "$RELEASE_DIR"/Media-Dock-"$APP_VERSION"*-mac.zip.blockmap(N) \
  "$RELEASE_DIR/latest-mac.yml" "$RELEASE_DIR/builder-debug.yml" "$RELEASE_DIR/builder-effective-config.yaml"

echo "Native macOS package candidate: $VERSION_DIR/$(basename "$MAC_ZIP")"
