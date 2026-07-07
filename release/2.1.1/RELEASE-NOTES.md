# Media Dock 2.1.1

## 中文说明

这是一个视觉与分享包刷新版本，主要统一桌面应用图标和 GitHub 展示资源，并重新打包 macOS / Windows 分享包。

## 包含内容

- `Media Dock-2.1.1-arm64-mac.zip`
- `Media Dock-2.1.1-win.zip`
- `SHA256SUMS.txt`

## 主要更新

- 刷新桌面应用图标，更新 macOS `.icns`、Windows `.ico`、主 PNG、favicon 和 GitHub README 顶部展示图。
- 重新打包 macOS 与 Windows 分享包，包内继续内置 `yt-dlp 2026.07.04`、`Deno 2.9.1`、`ffmpeg`、`ffprobe`。
- Windows 分享包改用官方 FFmpeg GPL shared 构建，并随包复制所需 DLL，在保持功能的同时减少包体积。
- 打包脚本的下载步骤增加失败检测、超时和自动重试，避免网络连接卡死。
- 分享包仍不内置 MediaCookies 插件，用户可从 Google 应用商店或 GitHub 下载/安装。
- 打包过程继续检查隐私文件，避免 cookies、历史记录、本地会话、API Key 等进入压缩包。

## 注意

- macOS 和 Windows 包仍未签名，首次打开可能看到系统安全提示。
- Windows 包内的 FFmpeg DLL 需要和 `ffmpeg.exe`、`ffprobe.exe` 保持在同一目录，不要单独移动工具文件。

## English

This is a visual and packaging refresh release.

- Refreshed the desktop app icon, macOS `.icns`, Windows `.ico`, PNG icon, favicon, and GitHub README hero.
- Rebuilt both macOS and Windows shared packages with bundled `yt-dlp 2026.07.04`, `Deno 2.9.1`, `ffmpeg`, and `ffprobe`.
- Switched the Windows package to the official FFmpeg GPL shared build and bundled the required DLL files to reduce package size while keeping FFmpeg functional.
- Added failure detection, timeouts, and retries to packaging downloads.
- MediaCookies is still distributed separately through the Chrome Web Store or GitHub.
- Packaging still checks release archives for private files such as cookies, history, local sessions, and API keys.
- Builds are unsigned; first-run OS security prompts are expected.
