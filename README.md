# Media Dock

![Media Dock](build/readme-hero.png)

Media Dock 是一个本地媒体下载和整理工作台，把链接下载、`cookies.txt` 选择、音视频合并和本地媒体后处理整理到同一个界面里。

## 下载

- [前往 GitHub Releases 下载](https://github.com/Yifo98/Media-Dock/releases/latest)
- Windows：优先下载 `Media.Dock-2.0.11-win.zip`
- macOS：优先下载 `Media.Dock-2.0.11-arm64-mac.zip`

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

- `Media.Dock-2.0.11-win.zip`

解压后双击根目录的 `Launch Media Dock.bat`。运行所需工具已经内置，不需要额外安装 Conda、ffmpeg、yt-dlp 或 Deno。

## 功能概览

- 桌面控制台：批量链接下载、格式选择、4K 画质上限、实时进度
- 媒体工具台：音轨分离、字幕导出、流信息查看、字幕整理、音视频单个或批量合并
- Cookies 管理：导入本地 `cookies.txt` 处理登录态或会员内容

## 2.0.11 亮点

- Windows / macOS 分享包都内置当前 MediaCookies 插件包，解压后可直接加载插件 ZIP
- 标准 ZIP 改为脚本启动结构，根目录放启动脚本，核心运行组件放在 `core/`
- 媒体工具改为主窗口内部工作区，不再弹出额外窗口
- 新增本地音视频单个配对合并和批量文件夹自动配对合并
- 多文件合并优先按媒体流类型和时长配对，不再依赖文件名相似度
- 下载任务支持并发队列、任务编号、任务日志复制和导出
- 下载任务按“进行中 / 已完成 / 异常”分组，避免状态混在一起
- 抖音 / TikTok 链接会提前检查，减少把推荐流入口误当成具体视频下载
- 默认避免展开播放列表，减少误下载整组列表的情况
- 本地 MOV / DaVinci 输出会显示更明确的合并进度和处理日志
- 合并输出支持自定义文件名，批量任务会自动追加 `01`、`02` 序号避免覆盖
- Cookie 选择和导入逻辑会提示过期、临期和来源匹配状态，减少误选失效登录态
- 默认下载、Cookies、缓存、更新包和 Deno 自动安装都保存在同级 `Media Dock Data/`
- Windows 端可自动调用 Bandizip `bz.exe` 解压运行时 zip，未安装时回退 PowerShell
- 自动更新和 Deno 缺失修复会下载到同级数据目录，不写入系统用户目录

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

如果目标站点需要登录态或会员权限，推荐先用内置浏览器扩展导出 Cookie ZIP，再在主界面 Cookies 区点击“导入 Cookie ZIP”。手动整理时，也可以把导出的文件夹放进同级 `Media Dock Data/cookies/` 目录。

推荐使用随桌面分享包附带的 MediaCookies 插件包：

- Windows / macOS 分享 ZIP 里的 `extensions/media-dock-cookie-exporter-*.zip`
- 如需本地开发插件，请在独立插件项目里维护源码，再把构建好的插件 ZIP 放到本项目的 `release/extensions/`，打包脚本会自动随桌面包带上

这个插件只导出用户选择的 Cookie，不读取密码，不上传网络。遇到登录态或会员内容时，建议先在同一个浏览器确认账号状态和目标内容可访问，再预览是否缺少关键登录标记。插件默认会先按 [yt-dlp 官方 supported sites](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md) 筛出当前浏览器里可能用于下载的 Cookie 来源；用户也可以主动切换到“全部 Cookie”高级模式。官方支持列表代表 extractor 存在，不等于所有链接都稳定可下，仍可能受站点加密、会员权限、验证码和风控影响。

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

- [Download from GitHub Releases](https://github.com/Yifo98/Media-Dock/releases/latest)
- Windows: prefer `Media.Dock-2.0.11-win.zip`
- macOS: prefer `Media.Dock-2.0.11-arm64-mac.zip`

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

- `Media.Dock-2.0.11-win.zip`

Unzip it and double-click `Launch Media Dock.bat`. Required runtime tools are bundled, so users do not need to install Conda, ffmpeg, yt-dlp, or Deno separately.

## Highlights

- Desktop control room for link-based downloads, job tracking, and quality caps up to 4K
- Media tools workspace for audio extraction, subtitle export, stream inspection, subtitle cleanup, and audio/video merge
- Local `cookies.txt` support for signed-in or member-only content

## 2.0.11 Highlights

- Windows and macOS share packages both include the current MediaCookies extension ZIP
- Standard zips now use root launch scripts, with runtime components kept in `core/`
- Moved Media Tools into the main window instead of opening a separate window
- Added single-pair and batch-folder local audio/video merge workflows
- Multi-file merge now pairs by stream type and duration instead of filename similarity
- Download tasks now support concurrent queues, task numbers, and per-task log copy/export
- Download tasks are grouped into Active / Done / Issues views
- Douyin / TikTok links are checked early to avoid treating feed pages as concrete video URLs
- Playlist expansion is disabled by default to reduce accidental full-list downloads
- Local MOV / DaVinci output now reports clearer merge progress and processing logs
- Merge output supports a custom base name, with `01`, `02` suffixes added automatically for batch jobs
- Cookie selection and import now warn about expiry, soon-expiry, and source matching state
- Default downloads, cookies, cache, update zips, and auto-installed Deno stay in sibling `Media Dock Data/`
- Windows can use Bandizip `bz.exe` for runtime zip extraction, with PowerShell fallback when Bandizip is not installed
- Update downloads and Deno repair files stay in the sibling data folder instead of system user folders

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

If a target site requires a signed-in or member session, export a cookie ZIP with the bundled browser extension, then import it from the Cookies area in the main UI. Manual imports can still be placed in the sibling `Media Dock Data/cookies/` directory.

Recommended bundled MediaCookies extension package:

- `extensions/media-dock-cookie-exporter-*.zip` inside the Windows / macOS share ZIP
- If the extension needs local development, keep its source in a separate extension project, then copy the built extension ZIP into this repo's `release/extensions/`; the desktop packaging scripts will include it automatically

The extension exports only user-selected cookies. It does not read passwords or upload data. For signed-in or member-only content, confirm the account state and target content in the same browser profile before previewing key login markers. By default, the extension filters the browser cookie list against the [official yt-dlp supported sites](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md); users can explicitly switch to an advanced all-cookie mode. yt-dlp listing support does not guarantee every URL will download successfully.

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
