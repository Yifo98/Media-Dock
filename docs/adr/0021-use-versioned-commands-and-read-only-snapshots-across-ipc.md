---
status: accepted
---

# Use versioned commands and read-only snapshots across IPC

Media Dock 3.0 exposes one versioned preload API through which the renderer submits validated intents, queries read-only workspace snapshots, and subscribes to revisioned change notifications. The main-process Media Task Engine remains authoritative: React does not infer task truth from log lines or replay incremental mutations, stale revisions cannot overwrite newer state, and a reload or missed notification recovers by fetching a fresh snapshot. High-frequency execution progress is throttled into task projections while bounded raw diagnostics are read separately on demand, and the renderer receives neither unrestricted `ipcRenderer` access nor direct filesystem and process-execution capabilities.
