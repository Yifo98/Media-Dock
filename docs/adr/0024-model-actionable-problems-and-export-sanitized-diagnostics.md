---
status: accepted
---

# Model actionable problems and export sanitized diagnostics

Media Dock 3.0 represents source, authentication, network, storage, permission, managed-runtime, media-processing, and internal failures as structured Problems with stable codes, affected stages, localized summaries, suggested actions, and correlated diagnostic evidence. Recoverable work moves to Needs Attention instead of deriving state from raw log text; commands, exit codes, and bounded tool output remain available in Expert Inspector, while runtime maintenance and media-task logs keep separate operation identities. Renderer failure uses a recoverable shell that can reload the UI or export diagnostics. User-initiated diagnostic packages disclose their contents before saving, redact secrets, Cookie data, home-directory details, and URL query information by default, and are never uploaded automatically.
