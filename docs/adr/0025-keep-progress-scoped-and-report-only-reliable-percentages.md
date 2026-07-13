---
status: accepted
---

# Keep progress scoped and report only reliable percentages

Media Dock 3.0 gives every Media Task and System Operation its own identity, lifecycle, progress projection, and diagnostics instead of allowing the latest runtime event to overwrite one global status. Structured execution events, not parsed log lines, drive UI state; determinate percentages appear only when a trustworthy total exists, otherwise the product reports the current stage or step without fabricating progress. Acquisition reaching 100 percent advances a task into later processing or delivery stages rather than marking it complete, and Completed is reached only after expected deliverables are placed, verified, and indexed. Runtime maintenance stays in System Center while media progress stays with its task in Workbench and Task Center.
