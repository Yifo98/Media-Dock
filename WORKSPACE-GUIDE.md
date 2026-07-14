# Media Dock Workspace Guide

## Daily Use

- `../Launch Media Dock 3 Preview.command`
  - macOS 日常启动入口。它和 `Media Dock Project/` 并排放在外层，双击即可构建并打开当前 3.0 预览。
- `Media Dock Project/`
  - 完整开发仓库；源码、测试、构建产物、工具、应用数据和 `.git` 都收在这里。
- `release/win-unpacked/Media Dock.exe`
  - The real built Windows desktop app. Do not move this exe by itself out of `win-unpacked/`.

## Share With Others

- `release/<version>/Media Dock-<version>-win.zip`
  - Share this file with friends.
- `release/share/`
  - Expanded share package output.

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
- `release/share/`
- `release/<version>/Media Dock-<version>-win.zip`

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
