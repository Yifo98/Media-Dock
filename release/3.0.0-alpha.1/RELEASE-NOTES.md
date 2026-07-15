# Media Dock 3.0.0 Alpha 1

Media Dock 3 is a new opt-in product generation. This Pre-release keeps the published 2.1.2 line intact and stores its data under the isolated `Media Dock Data/v3/` namespace.

## 中文

### 这次有什么不同

- 全新的四区工作台：处理、音画合并、任务、设置。
- 在下载前识别来源、登录状态、剧集结构、可用画质和估算大小。
- B 站剧集、YouTube 合集自动分组；所有条目默认不勾选，可按组全选。
- 支持“剧集 / 合集”和“多单链接”两种批量方式。
- 以 1 / 2 / 3 三档并发运行任务，并保持任务、来源和认证资料的有界调度。
- 导入 MediaCookies 本地 ZIP，明确显示是否使用登录资料和当前画质上限。
- 独立音频与视频一次多选，按媒体流、时长和时间轴匹配，不依赖文件名相似度。
- 任务中心显示获取、后处理、交付和文件位置；清理历史不会删除已交付媒体。
- 设置中可检查 yt-dlp / Deno，并导出经过脱敏的 TXT 支持日志。
- 新的 Media Berth 图标、简体中文 / English 手动切换，以及更适合长列表的固定导航和分组栏。

### 隐私

- Cookie 值不会进入界面、SQLite 任务数据或支持日志。
- 支持日志会移除凭证、Cookie、完整链接参数、用户主目录、任务标题和媒体路径。
- 支持日志只保存到用户主动选择的位置，不会自动上传。
- 3.0 只复制兼容的旧数据，不移动、删除或回写 2.1.2 数据。

### 下载与首次运行

- macOS Apple Silicon：`Media Dock-3.0.0-alpha.1-arm64-mac.zip`
- Windows x64：`Media Dock-3.0.0-alpha.1-win.zip`（只有通过 Windows 原生运行时门禁后才附加）

解压后从根目录启动脚本进入，核心文件位于 `core/`。当前包尚未签名，首次运行可能遇到 macOS Gatekeeper 或 Windows SmartScreen 提示。

### 已知边界

- 这是 Alpha，不会取代 2.1.2 Stable。
- 当前只支持取消尚未开始的排队任务；运行中任务的安全停止和完整进程树终止仍在后续门禁中。
- Windows 目录、中文路径、运行时和缩放必须以附加的 Windows 候选包及其门禁结果为准。
- 站点可用性仍受登录权限、会员等级、验证码、风控和上游 extractor 变化影响。
- 不包含自动应用升级；应用包更新和 yt-dlp / Deno 运行时更新是两个独立流程。

## English

### Highlights

- A new four-space workspace for processing, audio/video merge, tasks, and settings.
- Inspect the source, authentication state, collection structure, available quality, and estimated size before creating work.
- Group Bilibili seasons and YouTube playlists while keeping every entry unselected by default.
- Support both collection parsing and batches of unrelated single links.
- Run bounded 1 / 2 / 3 task concurrency without turning one source or Authentication Profile into an unbounded lane.
- Import a local MediaCookies ZIP and report whether authentication and a quality ceiling are in use.
- Pair separate audio/video inputs by stream type, duration, and timeline rather than filename similarity.
- Track acquisition, post-processing, delivery, and file location in Task Center.
- Check yt-dlp / Deno and export a sanitized support TXT from Settings.
- Ship the new Media Berth identity, explicit Simplified Chinese / English switching, pinned navigation, and sticky collection controls.

### Privacy

- Cookie values never enter the renderer, SQLite task metadata, or support log.
- Exported diagnostics remove credentials, Cookie values, full URL queries, home-directory details, task titles, and media paths.
- Diagnostic files are saved only after a user action and are never uploaded automatically.
- Media Dock 3 copies compatible legacy data into an isolated namespace and never rewrites 2.1.2 data.

### Known limits

- This Alpha does not replace the 2.1.2 Stable release.
- Only queued work can currently be cancelled. Safe cancellation of running work and its complete process tree remains a later release gate.
- Site availability still depends on account entitlements, verification challenges, risk controls, and upstream extractor changes.
- App updates and managed yt-dlp / Deno runtime updates remain separate flows.

### Verification

- Automated build, lint, IPC, persistence, scheduler, naming, runtime, renderer, and diagnostic-redaction checks pass.
- The real macOS preview launcher, source flow, merge flow, task center, and native diagnostic save dialog were exercised.
- Stable promotion remains blocked until every item in [`3.0-release-gates.md`](3.0-release-gates.md) has repeatable target-machine evidence.
