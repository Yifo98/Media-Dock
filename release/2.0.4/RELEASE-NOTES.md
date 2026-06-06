# Media Dock 2.0.4

## 中文说明

本次发布主要刷新了桌面分享包，重点补强了本地媒体合并、主界面交互、自动更新和隐私打包边界。

## 包含内容

- `Media Dock-2.0.4-arm64-mac.zip`
- `Media Dock-2.0.4-win.zip`
- `Launch Media Dock.bat` Windows ZIP 根目录启动脚本
- `README-windows.txt`
- `Launch Media Dock.command` macOS ZIP 根目录启动脚本
- `README-mac.txt`

## 主要更新

- 媒体工具改为主窗口内部工作区，不再从主界面弹出额外窗口
- 新增本地音视频单个配对合并和批量文件夹自动配对合并
- 多文件合并优先按照媒体流类型和时长配对，不再依赖文件名相似度
- 修复 B 站 / IDM 分离文件中 `_2.m4s` 这类尾号文件无法稳定识别配对的问题
- 合并页选择待识别文件后会立即刷新流信息，直接显示音频流或视频流
- 合并输出支持自定义文件名，批量任务会自动追加 01 02 序号避免覆盖
- Cookie 选择会提示过期和临期状态，减少误选失效登录态
- 默认下载、cookies、缓存、更新包和 Deno 自动安装都保存在同级 `Media Dock Data` 目录
- 刷新 3 号图标为新的桌面应用图标
- 压缩主界面实时信息区域，让日志和最近任务更靠上
- 修复长路径在顶部卡片和启动自检区域溢出重叠的问题
- 增加启动自动检查更新，发现旧版本时可直接下载最新 ZIP
- 增加 Deno 缺失时的一键自动下载和同级目录安装
- Windows 端检测到 Bandizip 的 `bz.exe` 时，会优先用于 zip 解压；未安装时自动回退 PowerShell
- Windows ZIP 根目录内置 `Launch Media Dock.bat`，核心运行文件放在 `core` 目录
- macOS ZIP 根目录内置 `Launch Media Dock.command`，核心运行文件放在 `core` 目录
- 标准分享包继续内置 `yt-dlp` `ffmpeg` `ffprobe` 和 `deno`

## 打包与隐私

- 分享包目标仍然是解压即用
- 打包脚本会在构建前删除旧版本目录，只保留当前最新版本
- 打包脚本会校验压缩包中不包含 cookies 历史记录 本地会话 字幕清理配置 API Key 等隐私文件
- 目前 macOS 与 Windows 版本都还是未签名状态，首次运行可能会看到系统安全提示

## English

## Summary

This release refreshes the shared desktop package with local media merge support, smoother in-window navigation, update checks, and stricter privacy packaging boundaries.

## Included artifacts

- `Media Dock-2.0.4-arm64-mac.zip`
- `Media Dock-2.0.4-win.zip`
- `Launch Media Dock.bat` at the Windows zip root
- `README-windows.txt`
- `Launch Media Dock.command` at the macOS zip root
- `README-mac.txt`

## Highlights

- Moved Media Tools into an in-window workspace instead of opening an extra window from the main UI
- Added single-pair and batch-folder local audio/video merge workflows
- Multi-file merge now pairs by stream type and duration instead of filename similarity
- Fixed unstable pairing for Bilibili / IDM separated files such as `_2.m4s`
- Refresh stream inspection immediately after choosing a merge input so audio/video detection is visible
- Merge output supports a custom base name, with 01 02 suffixes added automatically for batch jobs
- Cookie selection now warns about expired and soon-to-expire files to reduce bad login-state choices
- Default downloads, cookies, cache, update zips, and auto-installed Deno stay in the sibling `Media Dock Data` folder
- Refreshed the desktop app icon with option 3
- Tightened the main telemetry rail so logs and recent jobs stay higher on screen
- Fixed long runtime paths overflowing the hero status cards and startup self-check area
- Added startup update checks and direct latest zip download support
- Added one-click local Deno download and sibling-folder install when Deno is missing
- Windows uses Bandizip `bz.exe` for zip extraction when detected, falling back to PowerShell when it is not installed
- Added `Launch Media Dock.bat` at the Windows zip root, with runtime files kept in `core`
- Added `Launch Media Dock.command` at the macOS zip root, with runtime files kept in `core`
- Added `README-mac.txt` inside the macOS zip with first-run guidance
- Kept bundled `yt-dlp`, `ffmpeg`, `ffprobe`, and `deno` inside the standard shared builds

## Packaging and privacy

- Shared builds are intended to be unpack-and-run
- Packaging scripts now delete old version folders before building, leaving only the latest version
- Packaging scripts verify that cookies, history, local session files, subtitle cleanup configs, API keys, and similar private files are not included in release archives
- macOS and Windows builds are currently unsigned, so first-run security prompts are expected
