# Media Dock 2.0.12

## 中文说明

本次发布是 2.0 系列的 macOS 启动体验修复版。

## 主要修复

- macOS 开发启动时会主动设置 Dock 图标，减少显示 Electron 默认图标的问题。
- 双击 `Launch Media Dock.command` 启动开发版时，不再默认弹出独立 DevTools 窗口。
- 如需调试窗口，可在启动前设置 `MEDIA_DOCK_OPEN_DEVTOOLS=1`。

## 注意

- 这一版不改下载逻辑，也不引入 B 站批量选集功能。
- B 站番剧/合集批量解析会放到 2.1 本地测试版继续完善。

## English

This patch release fixes the macOS launch experience for the 2.0 line.

## Fixes

- Applies the Media Dock icon to the macOS Dock during development launch.
- Stops opening a detached DevTools window by default when launched from `Launch Media Dock.command`.
- Developers can still enable DevTools with `MEDIA_DOCK_OPEN_DEVTOOLS=1`.

## Notes

- Download behavior is unchanged in this release.
- Bilibili season/collection episode selection is being prepared separately for the local 2.1 test build.
