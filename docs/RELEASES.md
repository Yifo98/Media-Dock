# Media Dock release guide

Media Dock 2.1.2 remains the stable line. Media Dock 3 candidates are opt-in previews until the platform-native gates and signing requirements below pass.

## Package shape

- Windows: `Media-Dock-<version>-<arch>-win.zip`; run the single root entry `Media Dock.exe`. A BAT launcher is intentionally not included.
- macOS: `Media-Dock-<version>-<arch>-mac.zip`; open `Media Dock.app` from the extracted ZIP.
- Portable state lives in the sibling `Media Dock Data/` directory. A real write probe runs before the UI starts.
- `yt-dlp`, Deno, FFmpeg, FFprobe, and required shared libraries are bundled under application resources.
- No package is manually reconstructed after executable editing, signing, or notarization.

Unsigned artifacts include `Unsigned-Developer-Preview` in the filename. They are internal test assets, not public releases. Windows Smart App Control may block them before launch, and macOS Gatekeeper may reject them.

A BAT file is not a Windows trust workaround. App Control does not directly evaluate commands interpreted by `cmd.exe`, but child EXE and DLL files are still evaluated when the BAT starts them. Replacing `Media Dock.exe` with a BAT that launches the same unsigned Electron runtime therefore preserves the block instead of fixing it. Public Windows packages still require Authenticode or Microsoft Trusted Signing and Smart App Control acceptance evidence.

The user-facing explanation and supported recovery choices are maintained in [Windows security and privacy](release/windows-security-and-privacy.md). Every unsigned Windows package also embeds the concise version in `README-windows.txt` beside the executable.

## Native build commands

```bash
# Native macOS only
npm run dist:mac

# Native Windows only
npm run dist:win
```

`npm run dist:win` refuses to run outside Windows. `npm run dist:mac` refuses to run outside macOS. Use the matching workflow in `.github/workflows/` for repeatable CI builds.

## Windows gate

The native Windows workflow:

1. Downloads and fingerprints the bundled runtimes. A signed candidate reads an immutable FFmpeg ZIP URL from `MEDIA_DOCK_FFMPEG_WINDOWS_URL`.
2. Builds the ZIP with `electron-builder` and `signAndEditExecutable: true`.
3. Checks `ProductName`, `FileDescription`, `CompanyName`, product/file version, icon-owned executable name, and absence of the old `electron.exe` identity.
4. Records `Get-AuthenticodeSignature` results for every packaged EXE and DLL in `WINDOWS-SIGNATURES.json`.
5. Runs all four version probes.
6. Starts the final application with a Chinese-and-space portable path, verifies the write probe, and verifies a blocked data path fails.
7. Writes `SHA256SUMS.txt` only after all checks pass.

Manual native verification uses PowerShell normally; no execution-policy bypass is required:

```powershell
./scripts/verify-windows-package.ps1 `
  -PackagePath "release/<version>/Media-Dock-<version>-Unsigned-Developer-Preview-x64-win.zip" `
  -RuntimeManifestPath "release/<version>/WINDOWS-RUNTIMES.json" `
  -SignatureReportPath "release/<version>/WINDOWS-SIGNATURES.json" `
  -ExpectedVersion "<version>" `
  -ChecksumPath "release/<version>/SHA256SUMS.txt" `
  -WriteChecksum
```

GitHub-hosted Windows verification does not prove acceptance by `VerifiedAndReputableDesktop`. A formal public release still requires a signed candidate tested on a real Windows 11 machine or VM with Smart App Control enabled.

## macOS gate

The native macOS workflow builds with Hardened Runtime and the project entitlements. The final ZIP is checked for bundle identity, runtime inventory, all four version probes, portable writes, and invalid-path failure. A signed release additionally requires:

```text
codesign --verify --deep --strict
spctl --assess --type execute
xcrun stapler validate
```

The final ZIP is created only after the application has been signed and notarized. Nothing inside the app is rewritten afterward.

## Signing

Credential names, CI variables, and the exact trust sequence are documented in [signing-and-native-packaging.md](release/signing-and-native-packaging.md). Credentials never belong in source, package manifests, logs, or release archives.
