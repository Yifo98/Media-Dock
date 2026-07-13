---
status: accepted
---

# Persist tasks and require confirmation to resume

Media tasks are persisted before execution so that normal shutdowns, crashes, and operating-system restarts cannot erase their history or recovery context. Work that was running becomes interrupted and offers continue, restart, or abandon actions after partial-output inspection; Media Dock does not silently resume network, CPU, or disk activity at launch, and completed members of a task batch are never repeated when another member is recovered.
