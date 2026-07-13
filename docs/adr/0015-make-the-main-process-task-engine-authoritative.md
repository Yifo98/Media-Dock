---
status: accepted
---

# Make the main-process task engine authoritative

Media Dock 3.0 places one deep media-task module in the Electron main process as the authoritative owner of task batches, states, stages, persistence, scheduling, recovery, deliverables, and runtime execution. The renderer crosses one narrow seam to inspect sources, create work, issue task commands, read workspace snapshots, and subscribe to changes; React no longer mirrors queue truth or persists task history in local storage, while existing yt-dlp, ffmpeg, filesystem, and platform logic moves behind the module without requiring an all-at-once rewrite.
