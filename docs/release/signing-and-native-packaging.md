# Native packaging and signing

## Non-negotiable order

For both platforms the order is: stage final resources → edit application identity and icons → sign every required binary → verify signatures → notarize/staple where applicable → create ZIP → verify the exact ZIP → publish checksums.

No file inside a signed application may be changed after signing. A release ZIP must never be produced by copying or renaming an Electron runtime.

## Windows

The supported target is the `electron-builder` ZIP target on a native Windows runner. `signAndEditExecutable` stays enabled for both signed and unsigned builds because it owns the PE icon, ProductName, FileDescription, CompanyName, version resources, requested execution level, and executable identity.

### PFX / Authenticode

GitHub Actions secrets:

- `WIN_CSC_LINK`: base64 data, secure URL, or CI-accessible path for the public code-signing PFX.
- `WIN_CSC_KEY_PASSWORD`: PFX password.

The workflow maps these to electron-builder's `CSC_LINK` and `CSC_KEY_PASSWORD` only for an explicitly requested signed release. A suitable public code-signing certificate is required; a locally generated self-signed certificate does not establish public reputation.

### Microsoft Trusted Signing

Repository or environment variables:

- `MEDIA_DOCK_AZURE_PUBLISHER_NAME`
- `AZURE_TRUSTED_SIGNING_ENDPOINT`
- `AZURE_TRUSTED_SIGNING_ACCOUNT`
- `AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE`
- `MEDIA_DOCK_FFMPEG_WINDOWS_URL`: immutable, versioned FFmpeg shared-build ZIP URL required by a signed build.

Identity secrets for the current service-principal flow:

- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`

An OIDC/federated identity should replace the client secret when the release environment is ready for it. Do not store Azure values in source.

### Windows release gate

- `Media Dock.exe` must have a valid Authenticode signature and timestamp.
- Every packaged EXE/DLL is inventoried; valid vendor signatures are retained and unsigned dependencies are visible as explicit risks.
- Every staged third-party EXE/DLL under `tools` is excluded from Media Dock signing, and its pre-build/final hash must match byte-for-byte so a vendor signature cannot be silently replaced.
- A formal candidate is tested on Smart App Control-enabled Windows 11 after ZIP download/extraction. GitHub-hosted CI alone is not evidence for `VerifiedAndReputableDesktop` acceptance.
- A signed build must use an immutable versioned FFmpeg source URL, not a moving `latest` asset.

## macOS

A public macOS ZIP requires an Apple Developer Program **Developer ID Application** certificate plus notarization credentials.

GitHub Actions secrets:

- `MAC_CSC_LINK`: base64-encoded Developer ID Application P12.
- `MAC_CSC_KEY_PASSWORD`: P12 password.
- `APPLE_API_KEY_BASE64`: base64-encoded App Store Connect API `.p8` key.
- `APPLE_API_KEY_ID`: API key identifier.
- `APPLE_API_ISSUER`: API issuer identifier.

The build enables Hardened Runtime and uses `build/entitlements.mac.plist` plus `build/entitlements.mac.inherit.plist`. electron-builder signs and notarizes before ZIP creation. The native gate then verifies the signature, Gatekeeper assessment, and notarization staple from the extracted final ZIP.

FFmpeg library references are relocated before application signing so the tools remain portable. This invalidates their prior ad-hoc signatures: unsigned arm64 previews receive new ad-hoc signatures for executability, while a formal release receives the final Developer ID signature through electron-builder. Windows runtime files are not rewritten and their existing vendor signatures are preserved and inventoried.

Apple-ID notarization credentials (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`) are supported by electron-builder but the API-key flow is preferred for CI.

## Unsigned Developer Preview

When `MEDIA_DOCK_SIGNED_RELEASE` is not `1`, artifacts are named `Unsigned-Developer-Preview`. They can exercise package structure, metadata, portable writes, runtime probes, and application behavior, but they cannot prove platform trust:

- Smart App Control or enterprise Windows policy may block `Media Dock.exe` before any application code runs.
- Gatekeeper may block an unsigned/unnotarized `.app` on another Mac.
- Do not describe these packages as universally “unzip and run.”
