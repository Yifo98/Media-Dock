# ADR 0034: Separate product version maturity from platform package trust

## Decision

Media Dock reports two independent release states:

1. The product/source version can become final after the domain, privacy, migration, UI, and native package-structure gates pass.
2. Each platform package remains either an **Unsigned Developer Preview** or a **Signed and Trusted Release** according to its own signing and target-machine evidence.

An unsigned package attached to a final source release must contain `Unsigned` in its public filename, lead with the trust limitation in release notes, and never claim Smart App Control, Gatekeeper, Authenticode, Developer ID, notarization, or universal launch compatibility. This decision supersedes the single shared maturity state in ADR 0031 `Build and sign portable ZIPs on native platforms`; its public trust requirements remain mandatory for a Signed and Trusted Release.

The macOS portable container is also an explicit exception to the post-identity assembly prohibition in ADR 0031 `Build and sign portable ZIPs on native platforms`. Electron-builder remains the sole owner of the `Media Dock.app` identity, executable metadata, signing, hardened runtime, and notarization. After electron-builder finishes, the native macOS task may use `ditto` to place the unchanged bundle at `core/Media Dock.app`, add the root `Launch Media Dock.command` and README, and create the final ZIP. It may not edit, rename, thin, or replace files inside the bundle. The verifier must assess the bundle from the final extracted container and, for a trusted release, pass `codesign`, Gatekeeper, and stapler validation there.

## Why

The product can have a stable data contract and user workflow before the maintainer acquires commercial platform credentials, while an unsigned executable still has a materially different trust boundary. Conflating those states either blocks honest source releases indefinitely or encourages an unsafe claim that an unsigned binary is universally runnable.

The single-root macOS launcher is a deliberate portable-product requirement. Treating the outer ZIP as a container assembly step preserves the electron-builder-owned app identity while keeping the visible handoff consistent with Windows.

## Consequences

- `v3.0.0` may be a final source/product release while its public ZIP assets remain clearly labeled unsigned previews.
- GitHub release copy and filenames must keep the package trust limitation visible.
- A future trusted Windows asset still requires Authenticode or Microsoft Trusted Signing and Smart App Control acceptance evidence.
- A future trusted macOS asset still requires Developer ID, Hardened Runtime, notarization, stapling, and verification after final container assembly.
- The unsigned and signed artifacts are different release channels even when they contain the same product version.
