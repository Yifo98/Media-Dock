---
status: accepted
---

# Activate versioned managed runtimes atomically

Media Dock 3.0 keeps bundled tools as an immutable last-known baseline and stores downloaded yt-dlp, Deno, FFmpeg, and related managed runtimes in versioned directories under `Media Dock Data/v3/tools/versions/`. Each update is serialized, downloaded into staging, checked for expected size and checksum when available, smoke-tested for its reported version, and only then activated by an atomic manifest switch; the active executable is never overwritten in place, the previous known-good version remains available for rollback, and a failed activation leaves the current version untouched. Media tasks record the runtime versions they use, while detailed repair, update, and rollback controls live in System Center rather than the creator-facing Workbench.
