# Windows 安全提示与隐私说明

## 当前为什么可能出现拦截

Media Dock 3.0.0 的 Windows 便携包目前没有 Authenticode 或 Microsoft Trusted Signing 签名。缺少签名并不表示 Microsoft Defender 已检测到病毒；它表示 Windows 无法通过数字证书确认发布者身份，也无法把新文件的信誉稳定关联到后续版本。

当微软云信誉尚不足时，Microsoft Defender SmartScreen 可能显示“Windows 已保护你的电脑”。如果 Windows 11 的 Smart App Control 处于强制模式，它还可能在 Media Dock 启动前直接拦截未知、未签名的 EXE 或 DLL。BAT 不能改变这个结果，因为 BAT 启动的 Electron、yt-dlp、Deno、FFmpeg 和 DLL 仍会被系统策略检查。

签名只影响发布者身份、文件完整性证明和 Windows 信任判断。Windows 允许应用启动后，缺少签名本身不会关闭或限制 Media Dock 的下载、合并、任务、Cookie 导入或诊断功能。

## Media Dock 如何保护隐私

- 媒体任务、缓存、成品索引和网站登录资料保存在解压目录旁的 `Media Dock Data/v3/`。
- MediaCookies 导入的 Cookie 只作为本地认证配置使用；界面、任务数据库和支持日志不显示 Cookie 值。用户主动检查或下载需要登录的来源时，yt-dlp 只会把匹配的 Cookie 发送给对应来源网站完成认证。
- Media Dock 没有自动遥测，也不会把支持日志、任务数据库、Cookie、密码或本地媒体文件上传给 Media Dock 开发者或私有服务器。
- 只有在用户检查来源、下载媒体、检查工具更新或打开明确的外部资源时，应用才连接相应来源网站或官方服务。
- 支持日志必须由用户主动导出；导出前会移除 Cookie、令牌、URL 查询参数、用户主目录、任务标题和媒体路径。
- 清理任务历史与托管缓存不会删除已经交付到保存位置的媒体文件。

## 运行前先做安全核对

1. 只从 [Yifo98/Media-Dock GitHub Releases](https://github.com/Yifo98/Media-Dock/releases) 下载。
2. 完整解压 ZIP，不要只移动 `Media Dock.exe`。
3. 核对 GitHub Release 资产显示的 SHA-256 digest；若某个版本另附 `SHA256SUMS.txt`，也可使用该文件。哈希不一致时不要运行。
4. 保持 Microsoft Defender 实时保护开启，并可在运行前手动扫描 ZIP 或解压目录。
5. 如果文件来自其他网站、网盘、聊天转发或来源无法确认，请删除并重新从官方 Release 下载。

Media Dock 3.0.0 当前官方资产：

- Windows ZIP：`a3ae3290d46a95cc034a5f403c29b4d16a65d6204516a2db6eb7a04443880859`
- macOS ZIP：`ae9c5d42df7b45e7d9aa16388e0be0340d2e6e99cf85cb718ca4bd4152ccad08`

## 遇到拦截时怎么办

先打开“Windows 安全中心 → 保护历史记录”核对提示类型。如果 Defender 明确报告病毒、恶意软件或潜在不受欢迎应用，而不是“未知发布者”或“无法验证信誉”，请停止运行并通过项目 Issue 提交不含隐私信息的截图；不要直接选择允许。

### Microsoft Defender SmartScreen

如果提示是“Windows 已保护你的电脑”，并且页面提供“更多信息”：

1. 先完成上面的官方来源和 SHA-256 核对。
2. 确认显示的文件名来自 Media Dock 官方 Release。
3. 只有在你信任来源且 Defender 扫描没有发现威胁时，点击“更多信息” → “仍要运行”。

企业策略可能隐藏“仍要运行”；这种情况下请联系设备管理员，不要尝试修改组织策略。

### Windows 11 Smart App Control

如果明确提示 Smart App Control 已阻止应用，Microsoft 目前不提供单应用白名单。优先选择以下办法：

1. 保留 Smart App Control，等待带有效签名的 Media Dock Windows 包。
2. 在另一台 Smart App Control 为“评估”或“关闭”的个人测试设备上使用未签名预览。
3. 如果这是你完全控制的个人设备，可在充分理解风险后前往“Windows 安全中心 → 应用和浏览器控制 → 智能应用控制”查看可用设置。关闭它会降低系统对所有未知应用的保护，而不只是 Media Dock；不同 Windows 版本能否重新开启也可能不同。

不要通过注册表、`ExecutionPolicy Bypass`、关闭杀毒软件或修改企业安全策略来强行运行。若无法确认提示来自 SmartScreen、Smart App Control 还是 Defender 威胁检测，请保留截图和 Windows 事件信息，并从 Media Dock 设置页导出脱敏支持日志后再反馈。

## English summary

The current Windows portable build is not Authenticode or Microsoft Trusted Signing signed. Unsigned does not mean that Defender detected malware; it means Windows cannot verify the publisher through a trusted certificate and may not have enough reputation data for this new file.

Once Windows permits the app to start, the missing signature does not disable Media Dock features. However, Smart App Control can block the executable before application code runs, and a BAT wrapper cannot bypass checks applied to Electron, managed tools, and DLLs.

Media Dock keeps tasks, authentication profiles, caches, and indexes in the local `Media Dock Data/v3/` directory. It has no automatic telemetry and does not upload passwords, Cookie values, task databases, media files, or support diagnostics to the Media Dock developer or a private backend. During a user-requested authenticated inspection or download, yt-dlp sends only the matching Cookie to the corresponding source website. Support logs are created only on user request and redact credentials, URL queries, home-directory details, task titles, and media paths.

Download only from the official GitHub Release, compare the SHA-256 digest shown for the asset (or `SHA256SUMS.txt` when provided), keep Defender enabled, and scan the package. If Protection History reports malware or a potentially unwanted application instead of an unknown-publisher warning, stop and report it. For a SmartScreen reputation warning, use “More info” → “Run anyway” only after verification. Smart App Control has no per-app allow option; keep it enabled and wait for a signed build, use a separate controlled test device, or make your own informed decision about the device-wide setting. Do not use registry or execution-policy bypasses.

## Microsoft references

- [Smart App Control FAQ](https://support.microsoft.com/windows/smart-app-control-frequently-asked-questions-285ea03d-fa88-4d56-882e-6698afdb7003)
- [App & browser control in Windows Security](https://support.microsoft.com/windows/windows-security-app-browser-control-8f68fb65-ebb4-3cf7-d5c5-7d4da6889d11)
- [SmartScreen reputation for Windows app developers](https://learn.microsoft.com/windows/apps/package-and-deploy/smartscreen-reputation)
- [Smart App Control signature testing](https://learn.microsoft.com/windows/apps/develop/smart-app-control/test-your-app-with-smart-app-control)
