# ADR 0031: Build and sign portable ZIPs on native platforms

## Decision

Media Dock 3 uses electron-builder to create native Windows and macOS ZIP artifacts. Windows packages are built on Windows, macOS packages are built on macOS, and no release script manually copies, renames, or repacks the Electron runtime after identity editing or signing. Unsigned builds carry an explicit developer-preview label; formal releases require platform signing and native trust verification.

## Why

The previous Windows cross-build copied or renamed Electron without applying Media Dock PE resources, leaving Electron/GitHub metadata and an unsigned executable that Smart App Control could block before application startup. Native platform tasks make executable metadata, bundled runtime behavior, code signing, notarization, and final-archive verification observable at the correct boundary.

## Consequences

Windows publication requires Authenticode or Microsoft Trusted Signing plus a Smart App Control-enabled acceptance machine. macOS publication requires Developer ID, Hardened Runtime, notarization, and stapling. The ZIP remains the product format; an installer is not introduced.
