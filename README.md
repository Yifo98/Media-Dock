# Media Dock

![Media Dock icon](build/icon.png)

Media Dock 是一个本地媒体下载和整理工作台，把链接下载、`cookies.txt` 选择、音视频合并和本地媒体后处理整理到同一个界面里。

## 下载

- [前往 GitHub Releases 下载](https://github.com/Yifo98/YT-DLP-Studio/releases/latest)
- Windows：优先下载 `Media Dock-2.0.2-win.zip`
- macOS：优先下载 `Media Dock-2.0.2-arm64-mac.zip`

当前标准发布包目标就是“解压即用”。

标准 ZIP 解压后请从根目录启动脚本进入：

- Windows：双击 `Launch Media Dock.bat`
- macOS：双击 `Launch Media Dock.command`

核心运行文件放在 `core/` 目录里，普通用户不需要直接打开里面的 `.exe` 或 `.app`。

当前 `macOS` 与 `Windows` 分享包都已经内置：

- `yt-dlp`
- `ffmpeg`
- `ffprobe`
- `deno`

只有当某个发布包明确标注为 `Lite`、`tools not bundled` 或 `UI-only` 时，才需要额外准备环境。

标准包会把默认下载、Cookies、缓存、更新包和自动安装的 Deno 都放在解压目录同级的 `Media Dock Data/` 里，默认不写入 Windows `AppData` 或 macOS `Library`。

Windows 端如果检测到 Bandizip 的 `bz.exe`，会优先用它处理运行时 zip 解压；没有安装 Bandizip 时会自动回退到 PowerShell，不影响使用。

## macOS 使用说明

macOS 标准包优先使用应用包内置工具和同级数据目录里的工具：

1. `core/` 内置运行组件
2. 同级 `Media Dock Data/tools/`

只有运行开发版或 UI-only 版本时，才推荐额外安装：

```bash
brew install yt-dlp ffmpeg deno
```

如果你更习惯 Conda，也可以把这些工具放进同一个环境里，应用会自动尝试从该环境的 `bin/` 目录读取。

### 本地开发启动器

仓库根目录已经保留了一个 macOS 启动器：

- `Launch Media Dock.command`

它会调用 `scripts/launch-mac.sh`，优先复用现有 Conda 环境；如果本机没有这个环境，就自动回退到应用内置工具或系统 `PATH` 做本地核验。

## Windows 使用说明

Windows 标准包提供脚本启动版：

- `Media Dock-2.0.2-win.zip`

解压后双击根目录的 `Launch Media Dock.bat`。运行所需工具已经内置，不需要额外安装 Conda、ffmpeg、yt-dlp 或 Deno。

## 功能概览

- 桌面控制台：批量链接下载、格式选择、4K 画质上限、实时进度
- 媒体工具台：音轨分离、字幕导出、流信息查看、字幕整理、音视频单个或批量合并
- Cookies 管理：导入本地 `cookies.txt` 处理登录态或会员内容

## 2.0.2 亮点

- 更名为 `Media Dock`，公开界面更简短
- 新图标已接入 Windows `.ico` 和 macOS `.icns`
- 标准 ZIP 改为脚本启动结构，根目录放启动脚本，核心运行组件放在 `core/`
- 媒体工具改为主窗口内部工作区，不再弹出额外窗口
- 新增本地音视频单个配对合并和批量文件夹自动配对合并
- 批量合并优先按照媒体时长自动配对，名称只作为兜底辅助
- 合并输出支持自定义文件名，批量任务会自动追加 `01`、`02` 序号避免覆盖
- 默认下载、Cookies、缓存、更新包和 Deno 自动安装都保存在同级 `Media Dock Data/`
- Windows 端可自动调用 Bandizip `bz.exe` 解压运行时 zip，未安装时回退 PowerShell
- 实时信息区域更紧凑，日志和最近任务位置更靠上
- 媒体工具台新增 OpenAI-compatible 字幕整理能力
- 支持模型拉取、连接测试、批量整理、自定义服务保存
- 修复 Windows 下载面板标题乱码，实时任务名称会按本地编码正常显示

## 版本规则

- 小改动或修复 bug：升级 `patch`，例如 `1.0.1 -> 1.0.2`
- 功能增强但不破坏原有主线：升级 `minor`，例如 `1.0.1 -> 1.1.0`
- 桌面架构、核心交互或打包形态发生明显代际变化：升级 `major`，例如 `1.0.1 -> 2.0.0`

本项目当前打包产物名称、`release/<version>/` 目录和发布说明都会跟随 `package.json` 里的版本号自动同步。

常用命令：

```bash
npm run version:patch
npm run version:minor
npm run version:major
```

## Cookies 推荐

如果目标站点需要登录态或会员权限，推荐先在浏览器导出 `cookies.txt` 再放进同级 `Media Dock Data/cookies/` 目录。

推荐浏览器扩展：

- [Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)

## Windows 首次运行提示

当前 Windows 发布包还没有做代码签名，第一次在其他电脑上运行时，可能会看到 SmartScreen 的“Windows 已保护你的电脑”提示。

这时候点击：

1. `更多信息`
2. `仍要运行`

就可以继续启动。

后续会继续完善签名和发布体验。

## 发布说明

更详细的 Win / Mac 发布文案、下载资产命名和环境兜底说明，请看：

- [发布说明 / Release Guide](docs/RELEASES.md)
- [2.0.1 发布文案](docs/release-2.0.1.md)

---

## English

Media Dock is a local media download and cleanup workspace, combining downloads, `cookies.txt` selection, audio/video merge, and local media post-processing in one interface.

## Download

- [Download from GitHub Releases](https://github.com/Yifo98/YT-DLP-Studio/releases/latest)
- Windows: prefer `Media Dock-2.0.2-win.zip`
- macOS: prefer `Media Dock-2.0.2-arm64-mac.zip`

The standard shared builds are now intended to be plug-and-play.

After unzipping the standard zip, launch from the root script:

- Windows: double-click `Launch Media Dock.bat`
- macOS: double-click `Launch Media Dock.command`

Core runtime files live in `core/`; users do not need to open the internal `.exe` or `.app` directly.

Both current `macOS` and `Windows` shared packages already bundle:

- `yt-dlp`
- `ffmpeg`
- `ffprobe`
- `deno`

Only install tools manually when an asset is explicitly labeled as `Lite`, `tools not bundled`, or `UI-only`.

Standard builds keep default downloads, cookies, cache, update zips, and auto-installed Deno files in the sibling `Media Dock Data/` folder. They do not write to Windows `AppData` or macOS `Library` by default.

On Windows, if Bandizip's `bz.exe` is detected, runtime zip extraction uses it automatically; otherwise the app falls back to PowerShell.

## macOS Notes

The standard macOS build prefers bundled tools and sibling data-folder tools:

1. Runtime components inside `core/`
2. The sibling `Media Dock Data/tools/` directory

For local development or a UI-only build on macOS, the recommended extra setup is:

```bash
brew install yt-dlp ffmpeg deno
```

### Local macOS Launcher

The repository root already includes a macOS launcher:

- `Launch Media Dock.command`

It calls `scripts/launch-mac.sh` for local development checks.

## Windows Notes

Windows ships as a script-launched zip:

- `Media Dock-2.0.2-win.zip`

Unzip it and double-click `Launch Media Dock.bat`. Required runtime tools are bundled, so users do not need to install Conda, ffmpeg, yt-dlp, or Deno separately.

## Highlights

- Desktop control room for link-based downloads, job tracking, and quality caps up to 4K
- Media tools workspace for audio extraction, subtitle export, stream inspection, subtitle cleanup, and audio/video merge
- Local `cookies.txt` support for signed-in or member-only content

## 2.0.2 Highlights

- Renamed the public app surface to `Media Dock`
- Added the selected option 3 icon as Windows `.ico` and macOS `.icns`
- Standard zips now use root launch scripts, with runtime components kept in `core/`
- Moved Media Tools into the main window instead of opening a separate window
- Added single-pair and batch-folder local audio/video merge workflows
- Batch merge now prefers duration-based pairing, using names only as a fallback signal
- Merge output supports a custom base name, with `01`, `02` suffixes added automatically for batch jobs
- Default downloads, cookies, cache, update zips, and auto-installed Deno stay in sibling `Media Dock Data/`
- Windows can use Bandizip `bz.exe` for runtime zip extraction, with PowerShell fallback when Bandizip is not installed
- Tightened the telemetry rail so logs and recent jobs stay higher on screen
- Added OpenAI-compatible subtitle cleanup in the media tools window
- Added model fetching, connection testing, batch cleanup, and custom provider presets
- Fixed mojibake in Windows download titles by decoding yt-dlp output with the local code page

## Versioning Rules

- Use `patch` for small fixes, for example `1.0.1 -> 1.0.2`
- Use `minor` for additive feature releases that do not change the main product shape
- Use `major` for large desktop architecture, packaging, or interaction upgrades, for example `1.0.1 -> 2.0.0`

The package version in `package.json` is the single source of truth. Release asset names, `release/<version>/` folders, and generated release notes all follow it automatically.

Common commands:

```bash
npm run version:patch
npm run version:minor
npm run version:major
```

## Cookies Recommendation

If a target site requires a signed-in or member session, export `cookies.txt` from your browser and place it into the sibling `Media Dock Data/cookies/` directory first.

Recommended browser extension:

- [Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)

## Windows First-Run Note

The current Windows builds are not code-signed yet, so SmartScreen may show a warning the first time the app is launched on another PC.

If that happens, click:

1. `More info`
2. `Run anyway`

The app should then start normally.

## Release Guide

For release wording, asset naming, and dependency fallback notes, see:

- [Release Guide](docs/RELEASES.md)
- [2.0.1 Release Copy](docs/release-2.0.1.md)
