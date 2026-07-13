---
status: accepted
---

# Manage local Cookie packages as authentication profiles

Media Dock 3.0 keeps local package handoff from MediaCookies and imports validated Cookie ZIP contents by copy into its isolated v3 data area, where one source may have multiple named Authentication Profiles. Creator View automatically selects a recent healthy match and asks only when authentication is missing, unhealthy, or ambiguous; Task Plans reference profile identifiers rather than copying secret values, and SQLite, renderer snapshots, history, diagnostics, and exported logs never contain Cookie values. Profile removal affects only the v3 copy, while revealing the advanced authentication directory is a validated main-process action restricted to an existing local filesystem path so a malformed renderer value cannot crash the UI through `shell.openPath`.
