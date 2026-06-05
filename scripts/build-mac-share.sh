#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RELEASE_DIR="$PROJECT_ROOT/release"
TOOLS_DIR="$PROJECT_ROOT/tools"
TOOLS_BIN_DIR="$TOOLS_DIR/bin"
TOOLS_LIB_DIR="$TOOLS_DIR/lib"
APP_VERSION="$(node -p "require('$PROJECT_ROOT/package.json').version")"
VERSION_DIR="$RELEASE_DIR/$APP_VERSION"
README_PATH="$VERSION_DIR/README-mac.txt"
DEFAULT_ENV_ROOT="$HOME/.conda/envs/yt-dlp"
ENV_ROOT="${YTDLP_ENV_ROOT:-$DEFAULT_ENV_ROOT}"
ARCH_NAME="$(uname -m)"
YTDLP_CHANNEL="${YTDLP_CHANNEL:-nightly}"
YTDLP_VERSION="${YTDLP_VERSION:-}"
DENO_VERSION="${DENO_VERSION:-2.7.5}"

case "$ARCH_NAME" in
  arm64)
    DENO_ARCHIVE_NAME="deno-aarch64-apple-darwin.zip"
    BUILDER_ARCH_FLAG="--arm64"
    ;;
  x86_64)
    DENO_ARCHIVE_NAME="deno-x86_64-apple-darwin.zip"
    BUILDER_ARCH_FLAG="--x64"
    ;;
  *)
    echo "Unsupported macOS architecture: $ARCH_NAME"
    exit 1
    ;;
esac

DENO_URL="https://github.com/denoland/deno/releases/download/v${DENO_VERSION}/${DENO_ARCHIVE_NAME}"
ZIP_PRIVACY_PATTERN='cookie|history|config\.json|user[- ]data|electron-session|electron-user-data|subtitle-cleanup-config|api[_-]?key|Media Dock Data|app-cache'

if [[ -z "${YTDLP_URL:-}" ]]; then
  if [[ "$YTDLP_CHANNEL" == "nightly" ]]; then
    YTDLP_URL="https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp"
  elif [[ -n "$YTDLP_VERSION" ]]; then
    YTDLP_URL="https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp"
  else
    YTDLP_URL="https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp"
  fi
fi

cleanup_tools() {
  rm -rf "$TOOLS_BIN_DIR" "$TOOLS_LIB_DIR"
}

prepare_release_dir() {
  mkdir -p "$RELEASE_DIR" "$VERSION_DIR"
  for release_version_dir in "$RELEASE_DIR"/*(/N); do
    if [[ "$(basename "$release_version_dir")" != "$APP_VERSION" ]]; then
      rm -rf "$release_version_dir"
    fi
  done
  rm -rf "$RELEASE_DIR"/win-unpacked "$RELEASE_DIR"/mac-unpacked "$RELEASE_DIR"/mac-arm64
  rm -f "$RELEASE_DIR"/.DS_Store(N) "$VERSION_DIR"/.DS_Store(N)
  rm -f "$RELEASE_DIR"/*mac*.zip(N) "$RELEASE_DIR"/*mac*.zip.blockmap(N) "$RELEASE_DIR"/*.txt(N) "$RELEASE_DIR"/latest-mac.yml(N) "$RELEASE_DIR"/builder-debug.yml(N) "$RELEASE_DIR"/builder-effective-config.yaml(N)
  rm -f "$VERSION_DIR"/*mac*.zip(N) "$VERSION_DIR"/*.txt(N) "$VERSION_DIR"/latest-mac.yml(N)
}

repack_macos_launcher_zip() {
  local archive="$1"
  local unpack_dir
  local package_parent
  local package_name
  local package_dir
  local app_path
  unpack_dir="$(mktemp -d)"
  package_parent="$(mktemp -d)"
  package_name="$(basename "$archive" .zip)"
  package_dir="$package_parent/$package_name"
  mkdir -p "$package_dir/core"
  unzip -q "$archive" -d "$unpack_dir"
  app_path="$(find "$unpack_dir" -maxdepth 2 -name 'Media Dock.app' -type d | head -n 1)"
  if [[ -z "$app_path" ]]; then
    echo "Media Dock.app was not found inside macOS zip artifact."
    exit 1
  fi
  mv "$app_path" "$package_dir/core/Media Dock.app"
  cp "$README_PATH" "$package_dir/README-mac.txt"
  cat > "$package_dir/Launch Media Dock.command" <<'EOF'
#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_PATH="$SCRIPT_DIR/core/Media Dock.app"
EXECUTABLE="$APP_PATH/Contents/MacOS/Media Dock"

if [[ ! -x "$EXECUTABLE" ]]; then
  echo "Media Dock runtime was not found:"
  echo "$EXECUTABLE"
  echo
  echo "Keep this launcher next to the core folder after unzipping."
  read -r "?Press Enter to close..."
  exit 1
fi

export MEDIA_DOCK_PORTABLE_ROOT="$SCRIPT_DIR"
nohup "$EXECUTABLE" >/dev/null 2>&1 &
EOF
  chmod +x "$package_dir/Launch Media Dock.command"
  rm -f "$archive"
  (cd "$package_parent" && COPYFILE_DISABLE=1 ditto -c -k --norsrc --keepParent "$package_name" "$archive")
  rm -rf "$unpack_dir" "$package_parent"
}

write_release_notes() {
  cat > "$VERSION_DIR/RELEASE-NOTES.md" <<EOF
# Media Dock $APP_VERSION

## 中文说明

本次发布主要刷新了桌面分享包，重点补强了本地媒体合并、主界面交互、自动更新和隐私打包边界。

## 包含内容

- \`Media Dock-$APP_VERSION-arm64-mac.zip\`
- \`Media Dock-$APP_VERSION-win.zip\`
- \`Launch Media Dock.bat\` Windows ZIP 根目录启动脚本
- \`README-windows.txt\`
- \`Launch Media Dock.command\` macOS ZIP 根目录启动脚本
- \`README-mac.txt\`

## 主要更新

- 媒体工具改为主窗口内部工作区，不再从主界面弹出额外窗口
- 新增本地音视频单个配对合并和批量文件夹自动配对合并
- 批量合并优先按照媒体时长自动配对，名称只作为兜底辅助
- 修复 B 站 / IDM 分离文件中 \`_2.m4s\` 这类尾号文件无法稳定识别配对的问题
- 合并页选择待识别文件后会立即刷新流信息，直接显示音频流或视频流
- 合并输出支持自定义文件名，批量任务会自动追加 01 02 序号避免覆盖
- 默认下载、cookies、缓存、更新包和 Deno 自动安装都保存在同级 \`Media Dock Data\` 目录
- 刷新 3 号图标为新的桌面应用图标
- 压缩主界面实时信息区域，让日志和最近任务更靠上
- 修复长路径在顶部卡片和启动自检区域溢出重叠的问题
- 增加启动自动检查更新，发现旧版本时可直接下载最新 ZIP
- 增加 Deno 缺失时的一键自动下载和同级目录安装
- Windows 端检测到 Bandizip 的 \`bz.exe\` 时，会优先用于 zip 解压；未安装时自动回退 PowerShell
- Windows ZIP 根目录内置 \`Launch Media Dock.bat\`，核心运行文件放在 \`core\` 目录
- macOS ZIP 根目录内置 \`Launch Media Dock.command\`，核心运行文件放在 \`core\` 目录
- 标准分享包继续内置 \`yt-dlp\` \`ffmpeg\` \`ffprobe\` 和 \`deno\`

## 打包与隐私

- 分享包目标仍然是解压即用
- 打包脚本会在构建前删除旧版本目录，只保留当前最新版本
- 打包脚本会校验压缩包中不包含 cookies 历史记录 本地会话 字幕清理配置 API Key 等隐私文件
- 目前 macOS 与 Windows 版本都还是未签名状态，首次运行可能会看到系统安全提示

## English

## Summary

This release refreshes the shared desktop package with local media merge support, smoother in-window navigation, update checks, and stricter privacy packaging boundaries.

## Included artifacts

- \`Media Dock-$APP_VERSION-arm64-mac.zip\`
- \`Media Dock-$APP_VERSION-win.zip\`
- \`Launch Media Dock.bat\` at the Windows zip root
- \`README-windows.txt\`
- \`Launch Media Dock.command\` at the macOS zip root
- \`README-mac.txt\`

## Highlights

- Moved Media Tools into an in-window workspace instead of opening an extra window from the main UI
- Added single-pair and batch-folder local audio/video merge workflows
- Batch merge now prefers duration-based pairing, using names only as a fallback signal
- Fixed unstable pairing for Bilibili / IDM separated files such as \`_2.m4s\`
- Refresh stream inspection immediately after choosing a merge input so audio/video detection is visible
- Merge output supports a custom base name, with 01 02 suffixes added automatically for batch jobs
- Default downloads, cookies, cache, update zips, and auto-installed Deno stay in the sibling \`Media Dock Data\` folder
- Refreshed the desktop app icon with option 3
- Tightened the main telemetry rail so logs and recent jobs stay higher on screen
- Fixed long runtime paths overflowing the hero status cards and startup self-check area
- Added startup update checks and direct latest zip download support
- Added one-click local Deno download and sibling-folder install when Deno is missing
- Windows uses Bandizip \`bz.exe\` for zip extraction when detected, falling back to PowerShell when it is not installed
- Added \`Launch Media Dock.bat\` at the Windows zip root, with runtime files kept in \`core\`
- Added \`Launch Media Dock.command\` at the macOS zip root, with runtime files kept in \`core\`
- Added \`README-mac.txt\` inside the macOS zip with first-run guidance
- Kept bundled \`yt-dlp\`, \`ffmpeg\`, \`ffprobe\`, and \`deno\` inside the standard shared builds

## Packaging and privacy

- Shared builds are intended to be unpack-and-run
- Packaging scripts now delete old version folders before building, leaving only the latest version
- Packaging scripts verify that cookies, history, local session files, subtitle cleanup configs, API keys, and similar private files are not included in release archives
- macOS and Windows builds are currently unsigned, so first-run security prompts are expected
EOF
}

trap cleanup_tools EXIT

mkdir -p "$TOOLS_DIR"
cleanup_tools
mkdir -p "$TOOLS_BIN_DIR" "$TOOLS_LIB_DIR"
prepare_release_dir

cd "$PROJECT_ROOT"

if [[ ! -d "$ENV_ROOT" ]]; then
  echo "Missing yt-dlp Conda environment: $ENV_ROOT"
  exit 1
fi

if [[ ! -x "$ENV_ROOT/bin/ffmpeg" || ! -x "$ENV_ROOT/bin/ffprobe" ]]; then
  echo "Missing ffmpeg/ffprobe in $ENV_ROOT/bin"
  exit 1
fi

curl -L "$YTDLP_URL" -o "$TOOLS_BIN_DIR/yt-dlp"
chmod +x "$TOOLS_BIN_DIR/yt-dlp"

TMP_DENO_DIR="$(mktemp -d)"
curl -L "$DENO_URL" -o "$TMP_DENO_DIR/$DENO_ARCHIVE_NAME"
unzip -q "$TMP_DENO_DIR/$DENO_ARCHIVE_NAME" -d "$TMP_DENO_DIR"
mv "$TMP_DENO_DIR/deno" "$TOOLS_BIN_DIR/deno"
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
search_dirs = [
    env_root / "lib",
    Path("/opt/homebrew/lib"),
    Path("/usr/local/lib"),
]

copied: set[Path] = set()
queue = list(targets)

def deps_for(path: Path) -> list[str]:
    output = subprocess.check_output(["otool", "-L", str(path)], text=True)
    deps = []
    for line in output.splitlines()[1:]:
        line = line.strip()
        if not line:
            continue
        deps.append(line.split(" (compatibility version", 1)[0])
    return deps

def resolve_dep(dep: str) -> Path | None:
    if dep.startswith("/System/") or dep.startswith("/usr/lib/"):
      return None
    if dep.startswith("@rpath/"):
      base = dep.split("/", 1)[1]
      for search_dir in search_dirs:
        candidate = search_dir / base
        if candidate.exists():
          return candidate
      return None
    candidate = Path(dep)
    return candidate if candidate.exists() else None

while queue:
    current = queue.pop(0)
    for dep in deps_for(current):
        resolved = resolve_dep(dep)
        if resolved is None or resolved in copied:
            continue
        destination = lib_dir / resolved.name
        if not destination.exists():
            shutil.copy2(resolved, destination)
        copied.add(resolved)
        queue.append(destination)
PY

for executable in "$TOOLS_BIN_DIR/ffmpeg" "$TOOLS_BIN_DIR/ffprobe"; do
  install_name_tool -add_rpath "@executable_path/../lib" "$executable" 2>/dev/null || true
done

for dylib in "$TOOLS_LIB_DIR"/*.dylib(N); do
  install_name_tool -add_rpath "@loader_path" "$dylib" 2>/dev/null || true
done

npm run build
npx electron-builder --mac zip "$BUILDER_ARCH_FLAG"

MAC_ZIP="$(find "$RELEASE_DIR" -maxdepth 1 -type f -name '*mac.zip' | head -n 1)"
if [[ -z "$MAC_ZIP" ]]; then
  echo "macOS zip artifact was not created as expected."
  exit 1
fi

cat > "$README_PATH" <<'EOF'
Media Dock for macOS

This build is a script-launched portable folder packaged as a zip.
Double-click "Launch Media Dock.command" from the unzipped folder.
The actual runtime files are kept inside the "core" folder.
yt-dlp, ffmpeg, ffprobe, and deno are bundled with the program.
Runtime data stays next to this launcher in "Media Dock Data".
That folder contains downloads, cookies, cache, update zips, and any
auto-installed Deno runtime files.

Before first use on another Mac:
1. Unzip the archive.
2. Double-click "Launch Media Dock.command".

If Gatekeeper blocks the first launch, right-click "Launch Media Dock.command"
and choose "Open", or allow it from System Settings.
EOF

repack_macos_launcher_zip "$MAC_ZIP"

if unzip -l "$MAC_ZIP" | grep -Eiq "$ZIP_PRIVACY_PATTERN"; then
  echo "Sensitive files were detected inside the macOS zip artifact."
  exit 1
fi

mv "$MAC_ZIP" "$VERSION_DIR/"
rm -f "$RELEASE_DIR"/*mac*.zip.blockmap(N) "$RELEASE_DIR"/latest-mac.yml(N) "$RELEASE_DIR"/builder-debug.yml(N) "$RELEASE_DIR"/builder-effective-config.yaml(N)
rm -rf "$RELEASE_DIR"/mac-arm64
write_release_notes

echo "macOS zip artifact:"
echo "$VERSION_DIR/$(basename "$MAC_ZIP")"
echo
echo "Share notes:"
echo "$README_PATH"
