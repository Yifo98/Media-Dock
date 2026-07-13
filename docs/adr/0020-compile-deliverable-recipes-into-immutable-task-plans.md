---
status: accepted
---

# Compile deliverable recipes into immutable task plans

Media Dock 3.0 asks users to choose an outcome-oriented Deliverable Recipe and compiles it with the inspected Source into a reproducible Task Plan before execution. The plan fixes the source identity, intended deliverables, processing steps, output destination, relevant authentication references, and managed-runtime versions; it remains immutable once execution begins, while changed quality, format, or destination choices create a revised task rather than silently mutating work in flight. Retries may reuse the same plan, the Expert Inspector may apply bounded product-owned overrides before creation, and generated yt-dlp or FFmpeg command lines remain diagnostic execution evidence rather than the product's task model.
