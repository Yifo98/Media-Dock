---
status: accepted
---

# Require real packaged cross-platform release gates

Media Dock 3.0 reaches Stable only after automated domain, persistence, recovery, scheduling, path, naming, and IPC-contract checks are joined by real macOS and Windows validation of public media acquisition, local processing, authentication-package import, directory actions, managed-runtime activation and rollback, cancellation, adaptive scaling, localization, themes, legacy-data isolation, and diagnostic export. Verification runs against the actual candidate DMG, ZIP, or portable asset and confirms its checksum and embedded version; a successful development build or CI job cannot replace target-machine evidence, authenticated smoke tests keep secrets outside CI, and any unmet gate holds the release at alpha, beta, or release-candidate status.
