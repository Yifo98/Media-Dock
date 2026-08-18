---
status: accepted
---

# Separate runtime checks from verified download sources

System Center checks yt-dlp and Deno versions without installing anything. Only when an update or repair is available does Media Dock offer a second explicit action: download from the official GitHub Release URL or through an HTTPS GitHub mirror. The mirror has a product default and remains user-editable so a fixed third-party endpoint is not a permanent dependency.

GitHub's official API remains the source of release versions, asset sizes, and SHA-256 digests. A mirror may relay only the official Release asset URL; it cannot supply trusted metadata or bypass size, checksum, executable-version, staging, and atomic-activation checks. Custom mirror URLs require HTTPS and cannot contain credentials, queries, or fragments. This extends ADR 0018 without weakening its managed-runtime trust boundary.
