# Issue tracker: GitHub

本仓库的需求和 tickets 存放在 `Yifo98/Media-Dock` 的 GitHub Issues，使用 `gh` CLI 操作。

## Conventions

- 创建、读取、评论、标记和关闭工作都通过 `gh issue` 完成。
- 技能要求“发布到 tracker”时，创建一个 GitHub Issue。
- 技能要求读取 ticket 时，读取 issue 正文、评论和标签。
- PR 不作为 triage 请求入口。
- Ticket 优先使用 GitHub 原生 issue dependencies 表示阻塞关系；不可用时，在正文中写明 `Blocked by: #...`。
- 所有可由 agent 独立执行的 tickets 使用 `ready-for-agent` 标签。
