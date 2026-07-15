# Localization

## Supported languages

- Media Dock 3.0 ships with complete Simplified Chinese and English product copy.
- First launch defaults to Simplified Chinese.
- Language changes only through an explicit user action and the choice is remembered.
- Browser, operating-system, and regional settings do not silently change the product language.

## Content boundaries

- Product navigation, task states, processing stages, dialogs, errors, repair guidance, and notifications use shared localization keys.
- Source titles, filenames, filesystem paths, generated commands, and raw third-party tool output remain unchanged.
- Expert Inspector places a localized problem summary and suggested action above raw diagnostics.
- Runtime values use named interpolation; translated copy is never assembled from language-specific sentence fragments.

## Verification

- Simplified Chinese and English share the same state model and information hierarchy.
- Both languages are included in overflow, truncation, keyboard navigation, and adaptive-shell checks.
- UI source files do not contain user-facing literals outside the localization catalog and deliberate diagnostics fixtures.
