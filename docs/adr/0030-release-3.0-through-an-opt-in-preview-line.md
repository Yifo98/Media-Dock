---
status: accepted
---

# Release 3.0 through an opt-in preview line

Media Dock 2.1.2 remains the stable maintenance generation and never automatically upgrades into 3.0. The new generation is built on an isolated development line and progresses through `3.0.0-alpha`, beta, release-candidate, and stable GitHub releases; all pre-stable releases are opt-in Pre-releases, while application update checks may open the matching release page but do not replace the running portable app in place. Application packages and managed-runtime updates remain separate systems, macOS and Windows assets include SHA-256 checksums and compatibility notes, and automatic application updating is deferred until signed distribution and a reliable installer justify a new decision.
