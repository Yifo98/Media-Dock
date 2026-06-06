#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RELEASE_DIR="$PROJECT_ROOT/release"
TOOLS_DIR="$PROJECT_ROOT/tools"
TOOLS_BIN_DIR="$TOOLS_DIR/bin"
TOOLS_LIB_DIR="$TOOLS_DIR/lib"
TMP_DIR="$(mktemp -d)"
APP_VERSION="$(node -p "require('$PROJECT_ROOT/package.json').version")"
VERSION_DIR="$RELEASE_DIR/$APP_VERSION"
YTDLP_CHANNEL="${YTDLP_CHANNEL:-nightly}"
YTDLP_VERSION="${YTDLP_VERSION:-}"
DENO_VERSION="${DENO_VERSION:-2.7.5}"
DENO_URL="https://github.com/denoland/deno/releases/download/v${DENO_VERSION}/deno-x86_64-pc-windows-msvc.zip"
FFMPEG_URL="${FFMPEG_URL:-https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip}"
ZIP_PRIVACY_PATTERN='cookie|history|config\.json|user[- ]data|electron-session|electron-user-data|subtitle-cleanup-config|api[_-]?key|Media Dock Data|app-cache'

if [[ -z "${YTDLP_URL:-}" ]]; then
  if [[ "$YTDLP_CHANNEL" == "nightly" ]]; then
    YTDLP_URL="https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp.exe"
  elif [[ -n "$YTDLP_VERSION" ]]; then
    YTDLP_URL="https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp.exe"
  else
    YTDLP_URL="https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
  fi
fi

cleanup() {
  rm -rf "$TMP_DIR" "$TOOLS_BIN_DIR" "$TOOLS_LIB_DIR"
}

prepare_release_dir() {
  mkdir -p "$RELEASE_DIR" "$VERSION_DIR"
  for release_version_dir in "$RELEASE_DIR"/*(/N); do
    if [[ "$(basename "$release_version_dir")" != "$APP_VERSION" ]]; then
      rm -rf "$release_version_dir"
    fi
  done
  rm -rf "$RELEASE_DIR"/win-unpacked
  rm -f "$RELEASE_DIR"/.DS_Store(N) "$VERSION_DIR"/.DS_Store(N)
  rm -f "$RELEASE_DIR"/*win*.zip(N) "$RELEASE_DIR"/*.exe(N) "$RELEASE_DIR"/*win*.zip.blockmap(N) "$RELEASE_DIR"/builder-debug.yml(N) "$RELEASE_DIR"/builder-effective-config.yaml(N)
  rm -f "$VERSION_DIR"/*win*.zip(N) "$VERSION_DIR"/*.exe(N)
}

repack_windows_launcher_zip() {
  local archive="$1"
  local unpack_dir="$TMP_DIR/win-unpacked-zip"
  local package_name="Media Dock-$APP_VERSION-win"
  local package_dir="$TMP_DIR/$package_name"
  rm -rf "$unpack_dir" "$package_dir"
  mkdir -p "$unpack_dir" "$package_dir/core"
  unzip -q "$archive" -d "$unpack_dir"
  cp -R "$unpack_dir"/. "$package_dir/core/"
  cat > "$package_dir/Launch Media Dock.bat" <<'EOF'
@echo off
setlocal
cd /d "%~dp0"
set "MEDIA_DOCK_PORTABLE_ROOT=%~dp0"
start "" "%~dp0core\Media Dock.exe"
EOF
  cat > "$package_dir/README-windows.txt" <<'EOF'
Media Dock for Windows

Double-click "Launch Media Dock.bat" after unzipping this folder.
The actual runtime files are kept inside the "core" folder.
yt-dlp, ffmpeg, ffprobe, and deno are bundled with the program.

Runtime data stays next to this launcher in "Media Dock Data".
That folder contains downloads, cookies, cache, update zips, and any
auto-installed Deno runtime files.

If Bandizip is installed, Windows runtime zip extraction may use Bandizip's
bz.exe automatically. If it is not installed, the app falls back to the
built-in PowerShell extraction path.
EOF
  rm -f "$archive"
  (cd "$TMP_DIR" && zip -qr "$archive" "$package_name")
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
- 多文件合并优先按照媒体流类型和时长配对，不再依赖文件名相似度
- 修复 B 站 / IDM 分离文件中 \`_2.m4s\` 这类尾号文件无法稳定识别配对的问题
- 合并页选择待识别文件后会立即刷新流信息，直接显示音频流或视频流
- 合并输出支持自定义文件名，批量任务会自动追加 01 02 序号避免覆盖
- Cookie 选择会提示过期和临期状态，减少误选失效登录态
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
- Multi-file merge now pairs by stream type and duration instead of filename similarity
- Fixed unstable pairing for Bilibili / IDM separated files such as \`_2.m4s\`
- Refresh stream inspection immediately after choosing a merge input so audio/video detection is visible
- Merge output supports a custom base name, with 01 02 suffixes added automatically for batch jobs
- Cookie selection now warns about expired and soon-to-expire files to reduce bad login-state choices
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

trap cleanup EXIT

prepare_release_dir
mkdir -p "$TOOLS_BIN_DIR" "$TOOLS_LIB_DIR"
rm -rf "$TOOLS_BIN_DIR" "$TOOLS_LIB_DIR"
mkdir -p "$TOOLS_BIN_DIR" "$TOOLS_LIB_DIR"

cd "$PROJECT_ROOT"

curl -L "$YTDLP_URL" -o "$TOOLS_BIN_DIR/yt-dlp.exe"
curl -L "$DENO_URL" -o "$TMP_DIR/deno-win.zip"
unzip -q "$TMP_DIR/deno-win.zip" -d "$TMP_DIR/deno"
cp "$TMP_DIR/deno/deno.exe" "$TOOLS_BIN_DIR/deno.exe"

curl -L "$FFMPEG_URL" -o "$TMP_DIR/ffmpeg-win.zip"
unzip -q "$TMP_DIR/ffmpeg-win.zip" -d "$TMP_DIR/ffmpeg"
FFMPEG_EXE="$(find "$TMP_DIR/ffmpeg" -type f -name 'ffmpeg.exe' | head -n 1)"
FFPROBE_EXE="$(find "$TMP_DIR/ffmpeg" -type f -name 'ffprobe.exe' | head -n 1)"

if [[ -z "$FFMPEG_EXE" || -z "$FFPROBE_EXE" ]]; then
  echo "Failed to locate ffmpeg.exe or ffprobe.exe inside Windows FFmpeg archive."
  exit 1
fi

cp "$FFMPEG_EXE" "$TOOLS_BIN_DIR/ffmpeg.exe"
cp "$FFPROBE_EXE" "$TOOLS_BIN_DIR/ffprobe.exe"

npm run build
npx electron-builder --win zip --x64

WIN_ZIP="$(find "$RELEASE_DIR" -maxdepth 1 -type f -name '*win*.zip' | head -n 1)"

if [[ -z "$WIN_ZIP" ]]; then
  echo "Windows build artifacts were not created as expected."
  exit 1
fi

repack_windows_launcher_zip "$WIN_ZIP"

if unzip -l "$WIN_ZIP" | grep -Eiq "$ZIP_PRIVACY_PATTERN"; then
  echo "Sensitive files were detected inside the Windows zip artifact."
  exit 1
fi

mv "$WIN_ZIP" "$VERSION_DIR/"
rm -rf "$RELEASE_DIR"/win-unpacked
rm -f "$RELEASE_DIR"/builder-debug.yml(N) "$RELEASE_DIR"/builder-effective-config.yaml(N)
write_release_notes

echo "Windows zip artifact:"
echo "$VERSION_DIR/$(basename "$WIN_ZIP")"
