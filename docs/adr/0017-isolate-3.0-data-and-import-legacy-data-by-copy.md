---
status: accepted
---

# Isolate 3.0 data and import legacy data by copy

Media Dock 3.0 owns a versioned data namespace under `Media Dock Data/v3/` for its database, Cookie copies, managed runtimes, internal caches, temporary files, and backups, while the 2.1 data layout remains untouched and usable. Large task-owned media staging may use a guarded area on the selected destination volume to avoid exhausting the application volume or duplicating cross-volume transfers, but it remains isolated by task and managed only through 3.0 records. First launch may copy compatible preferences, Cookie packages, and verifiable history into 3.0, but never moves, deletes, or rewrites legacy data; old caches and managed tools are not imported, and no automatic downgrade writes 3.0 state back into the 2.1 format.
