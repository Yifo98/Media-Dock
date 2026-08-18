# ADR 0031: Build and sign portable ZIPs on native platforms

## Decision

Media Dock 3 uses electron-builder to create native Windows and macOS ZIP artifacts. Windows packages are built on Windows, macOS packages are built on macOS, and no release script manually copies, renames, or repacks the Electron runtime after identity editing or signing. Unsigned builds carry an explicit developer-preview label; formal releases require platform signing and native trust verification.

Windows keeps `Media Dock.exe` as its single root launcher. A BAT wrapper is not a trust-boundary workaround: commands interpreted by `cmd.exe` may not be checked as a standalone script, but every executable and DLL they load remains subject to App Control. The project therefore does not replace the application executable with a BAT or claim that an unsigned package becomes generally runnable through a script wrapper.

## Why

The previous Windows cross-build copied or renamed Electron without applying Media Dock PE resources, leaving Electron/GitHub metadata and an unsigned executable that Smart App Control could block before application startup. Native platform tasks make executable metadata, bundled runtime behavior, code signing, notarization, and final-archive verification observable at the correct boundary.

The original Electron Windows runtime is not an acceptable escape hatch either: leaving it unedited loses Media Dock identity, and its trust status does not establish trust for the application code or the separately executed yt-dlp, Deno, FFmpeg, FFprobe, and shared libraries. Microsoft documents that anything launched by a batch file remains subject to App Control even though `cmd.exe`-interpreted batch commands are not directly controlled. See [Smart App Control overview](https://learn.microsoft.com/windows/apps/develop/smart-app-control/overview) and [App Control script enforcement](https://learn.microsoft.com/windows/security/application-security/application-control/app-control-for-business/design/script-enforcement).

## Consequences

Windows publication requires Authenticode or Microsoft Trusted Signing plus a Smart App Control-enabled acceptance machine. macOS publication requires Developer ID, Hardened Runtime, notarization, and stapling. The ZIP remains the product format; an installer is not introduced.
