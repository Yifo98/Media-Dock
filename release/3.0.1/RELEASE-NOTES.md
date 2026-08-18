# Media Dock 3.0.1

Media Dock 3.0.1 is a maintenance release focused on trustworthy product updates, clearer authentication recovery, and download-size estimates that follow the formats yt-dlp will actually select.

## Product updates

- Settings now provides a complete “check → download and verify → restart and upgrade” product-update flow on Windows and macOS.
- The downloaded platform ZIP must match both the byte size and SHA-256 digest published by GitHub Releases before it can be installed.
- The portable updater waits for Media Dock to exit, keeps an old-version backup, rolls back a failed replacement, and never replaces or packages `Media Dock Data`.
- Queued or running Media Tasks block installation until the work is finished or cancelled.

## Authentication recovery

- Explicit yt-dlp evidence that Cookies are expired or no longer valid now becomes the structured Problem `authentication.cookies-expired`.
- Simplified Chinese and English interfaces explain the recovery and link directly to the MediaCookies import settings.
- An ordinary HTTP 403 remains a generic acquisition failure and is not misclassified as expired authentication.

## Download-size estimates

- Quality Preview follows yt-dlp's preference order instead of choosing the largest same-height video and audio candidates.
- When the selected format lacks reliable size or bitrate metadata, Media Dock reports that no reliable estimate is available instead of reusing a misleading value from another format.

## Packaging and platform trust

- Native Windows and macOS workflows build and verify the final portable ZIP, bundled runtimes, startup probes, Unicode and spaced data paths, and release checksums.
- macOS unsigned previews keep a structurally valid ad-hoc bundle signature while preserving independently verified runtime signatures.
- Public binaries remain explicitly labeled **Unsigned Developer Preview** because the repository has no Windows Authenticode / Microsoft Trusted Signing credential or Apple Developer ID / notarization credential. Smart App Control or Gatekeeper may block them before launch; they must not be represented as universally trusted platform packages.
