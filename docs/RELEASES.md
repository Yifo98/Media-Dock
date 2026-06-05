# Media Dock Releases

中文 | [English](#english)

## 下载入口

- [GitHub Releases 页面](https://github.com/Yifo98/YT-DLP-Studio/releases)
- [最新版本下载](https://github.com/Yifo98/YT-DLP-Studio/releases/latest)

## 当前推荐资产

- `Media Dock-2.0.2-win.zip`
  说明：Windows 推荐下载，解压后双击 `Launch Media Dock.bat`
- macOS 资产
  说明：推荐发布 `Media Dock-2.0.2-arm64-mac.zip`，解压后双击 `Launch Media Dock.command`

## 2.0.2 更新摘要

- 公开应用名改为 `Media Dock`，界面和包名更简短
- 3 号图标已接入 Windows `.ico` 和 macOS `.icns`
- 标准 ZIP 改为脚本启动结构，根目录放 `.bat` / `.command`，核心运行组件放在 `core/`
- 标准包继续内置 `yt-dlp`、`ffmpeg`、`ffprobe`、`deno`
- 默认下载、cookies、缓存、更新包和自动安装的 Deno 都保存在同级 `Media Dock Data/`
- Windows 端可自动调用 Bandizip `bz.exe` 做运行时 zip 解压，未安装时回退 PowerShell
- 打包流程会剔除 cookies、用户配置、缓存和字幕整理 API 配置，避免把本机敏感信息带进分享包
- 新增本地音视频单个配对合并和批量文件夹自动配对合并
- 批量合并优先按照媒体时长配对，名称只作为兜底辅助
- 合并输出支持自定义文件名，批量任务会自动追加 `01`、`02` 序号避免覆盖
- 本地媒体工具台新增字幕整理能力，支持 OpenAI-compatible 接口、模型拉取、连接测试、批量清洗和停止任务
- 桌面控制台压缩实时信息区域，日志和最近任务不再被挤到最底部
- 修复 Windows 下载标题乱码，下载任务与实时信息会按本地编码正常显示

## 版本规则

- `patch`：小修复，例如 `1.0.1 -> 1.0.2`
- `minor`：新增功能但不改变产品主形态，例如 `1.0.1 -> 1.1.0`
- `major`：桌面架构、主交互、打包形态发生明显代际变化，例如 `1.0.1 -> 2.0.0`

版本号唯一来源是 `package.json`。当前打包脚本会自动使用这个版本号来生成：

- 发布包文件名
- `release/<version>/` 目录
- 版本发布说明

## 推荐发布文案

### 中文模板

```text
Media Dock vX.Y.Z

- Windows 压缩包：解压即用
- macOS 压缩包：解压后双击 Launch Media Dock.command

默认情况下不需要额外安装 ffmpeg、ffprobe、yt-dlp 或 Conda。
核心运行文件放在 core 目录，用户只需要点根目录启动脚本。
程序默认会把下载、cookies、缓存、更新包和自动安装的 Deno 放在同级 Media Dock Data 目录。
Windows 端如果装了 Bandizip，可自动调用 bz.exe 解压运行时 zip；没装也会回退 PowerShell。
如果某个资产明确标注为 Lite、tools not bundled 或 UI-only，请按说明先准备对应环境。

Windows 首次运行时，可能会看到系统安全提示。
点击“更多信息”后选择“仍要运行”即可继续启动。
```

## 环境兜底说明

默认目标是开盖即用，不要求用户先手动部署 Conda、`ffmpeg`、`ffprobe` 或 `yt-dlp`。

只有在某个发布包明确标注以下情况时，才需要补环境：

- `Lite`
- `tools not bundled`
- `UI-only`

这时可以补一句：

> 如果当前发布资产未内置 `yt-dlp`、`ffmpeg` 或 `ffprobe`，建议先使用 Conda 创建环境并安装对应工具后再运行。

## Windows 首次运行提示

当前 Windows 版本还没有代码签名，因此在其他电脑上第一次运行时，可能会触发 SmartScreen 的安全提示。

给用户的推荐说法：

> 如果首次启动看到“Windows 已保护你的电脑”，点击“更多信息”后选择“仍要运行”即可。

## 资产命名建议

- `Media Dock-2.0.2-win.zip`
- `Media Dock-2.0.2-arm64-mac.zip`

## English

## Download Links

- [GitHub Releases page](https://github.com/Yifo98/YT-DLP-Studio/releases)
- [Latest release](https://github.com/Yifo98/YT-DLP-Studio/releases/latest)

## Recommended Asset

- `Media Dock-2.0.2-win.zip`
  Notes: recommended Windows build, unzip and run `Launch Media Dock.bat`
- macOS assets
  Notes: prefer `Media Dock-2.0.2-arm64-mac.zip`, unzip and run `Launch Media Dock.command`

## Recommended Release Copy

### English Template

```text
Media Dock vX.Y.Z

- Windows zip: unzip and use
- macOS zip: unzip and run Launch Media Dock.command

No extra setup is required by default.
Core runtime files live in core; users should launch from the root script.
Default downloads, cookies, cache, update zips, and auto-installed Deno files stay in the sibling Media Dock Data folder.
On Windows, Bandizip bz.exe is used for runtime zip extraction when detected, with PowerShell fallback.
If an asset is labeled Lite, tools-not-bundled, or UI-only, please install the required tools first.

Windows may show a first-run security prompt on unsigned builds.
Click "More info" and then "Run anyway" to continue.
```

## Dependency Fallback

The default expectation is plug-and-play. Users should not need to install Conda, `ffmpeg`, `ffprobe`, or `yt-dlp` for the standard release asset.

Only mention extra setup when an asset is explicitly labeled as:

- `Lite`
- `tools not bundled`
- `UI-only`

Suggested fallback note:

> If this release asset does not bundle `yt-dlp`, `ffmpeg`, or `ffprobe`, create a Conda environment and install the required tools before launching the app.

## Windows First-Run Note

The current Windows release is not code-signed yet, so SmartScreen may warn users on first launch on another PC.

Recommended wording:

> If Windows shows a security warning on first launch, click "More info" and then "Run anyway" to continue.

## Versioning Rules

- `patch`: small fixes such as `1.0.1 -> 1.0.2`
- `minor`: additive feature releases that do not change the product shape
- `major`: large desktop architecture, packaging, or interaction upgrades such as `1.0.1 -> 2.0.0`

`package.json` is the single source of truth. The packaging scripts derive release asset names, version folders, and generated release notes from that version automatically.
