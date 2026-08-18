# Media Dock Workspace Guide

## Daily Use

- `../Launch Media Dock 3 Preview.command`
  - macOS 日常启动入口。它和 `Media Dock Project/` 并排放在外层，双击即可构建并打开当前 3.0 预览。
  - 可恢复副本保存在 `scripts/Launch Media Dock 3 Preview.command`；迁移电脑后可直接运行，也可复制到项目文件夹旁边。
- `Media Dock Project/`
  - 完整开发仓库；源码、测试、构建产物、工具、应用数据和 `.git` 都收在这里。
- `release/win-unpacked/Media Dock.exe`
  - The real built Windows desktop app. Do not move this exe by itself out of `win-unpacked/`.

## Internal Package Testing

- `release/<version>/Media-Dock-<version>-Unsigned-Developer-Preview-x64-win.zip`
  - 只用于受控的 Windows 内部测试；未签名包可能在应用启动前被 Smart App Control 拦截，不能作为公开分享版。
  - 不要增加 BAT 作为“绕过”入口；BAT 启动的 EXE、DLL 与托管运行工具仍会被 App Control 检查。
- `release/<version>/Media-Dock-<version>-Unsigned-Developer-Preview-<arch>-mac.zip`
  - 只用于受控的 macOS 内部测试；未签名、未公证的包不能作为公开分享版。

## Private / Do Not Share

- `cookies/`
  - Private cookie files. Never send these to other people.

## Core Project Files To Keep

- `src/`
- `electron/`
- `scripts/`
- `tools/`
- `public/`
- `package.json`
- `package-lock.json`
- `vite.config.ts`
- `tsconfig*.json`
- `eslint.config.js`
- `index.html`
- `README.md`

## Regeneratable Build Output

These can be recreated by building again, so they do not need special backup:

- `release/win-unpacked/`
- `release/<version>/Media-Dock-<version>-Unsigned-Developer-Preview-x64-win.zip`
- `release/<version>/Media-Dock-<version>-Unsigned-Developer-Preview-<arch>-mac.zip`

## Already Cleaned Up

The following generated clutter was removed:

- `dist/`
- `dist-electron/`
- `release/builder-debug.yml`
- `release/yt-dlp-studio-0.1.0-x64.nsis.7z`

## Finder Layout

外层 `Media-Dock/` 只保留：

- `Launch Media Dock 3 Preview.command`
- `Media Dock Project/`

不要单独移动启动器；它依赖同级的项目总文件夹。

若从 GitHub 重新下载，仓库内的 `scripts/Launch Media Dock 3 Preview.command` 是同一启动器的可恢复副本，不包含任何本机路径或私人数据。
