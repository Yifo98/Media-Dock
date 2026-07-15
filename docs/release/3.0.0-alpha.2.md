# Media Dock 3.0.0 Alpha 2 — native packaging repair

This candidate repairs the packaging layer that left the Windows executable identified as an unsigned Electron runtime.

## What changed

- Windows and macOS now use `electron-builder` as the owner of the final ZIP.
- Windows PE metadata, icon, executable name, application identity, and version resources are edited before optional signing.
- Windows packages are built and verified on native Windows; macOS packages are built and verified on native macOS.
- Unsigned artifacts are explicitly labeled `Unsigned-Developer-Preview` and are internal-test assets only.
- The application validates that its sibling `Media Dock Data/` directory is writable before rendering.
- ZIP imports and runtime updates use in-process guarded extraction; the PowerShell execution-policy bypass fallback has been removed.
- Package gates inventory all Windows EXE/DLL files and run yt-dlp, Deno, FFmpeg, and FFprobe version probes.
- Application shutdown now cancels legacy work and active Media Dock 3 runtime process trees, then waits for task operations before the database closes.

## Known limitation

This repository does not contain signing credentials. An unsigned Windows preview can still be blocked before launch by Smart App Control Event 3077 / `VerifiedAndReputableDesktop`; an unsigned macOS preview can still be blocked by Gatekeeper. Passing functional CI does not change that trust boundary.

Media Dock 2.1.2 remains the stable release and is not modified by this candidate.
