# Progress presentation

## Media tasks

- Lead with the current processing stage and its plain-language activity.
- Show percent, bytes, speed, or remaining time only when the responsible step reports a trustworthy total.
- Prefer `Stage 2 of 4` or an indeterminate indicator when an overall weighted estimate is unavailable.
- Treat acquisition, processing, and delivery as distinct progress scopes; one step reaching 100 percent does not imply task completion.
- Mark work Completed only after deliverable verification and indexing.

## System operations

- Each managed-runtime install, update, verification, or rollback keeps its own stable card and operation identifier in System Center.
- Concurrent operations never replace one another's title, percentage, controls, or logs.
- Creator View may show a quiet system-health notice, but it does not reuse system-operation progress as task status.

## Diagnostics

Logs may explain progress but never calculate it. Structured events from the owning engine update the revisioned read-only snapshot; bounded raw output remains independently scrollable in Expert Inspector.
