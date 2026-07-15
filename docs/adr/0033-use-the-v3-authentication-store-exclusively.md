---
status: accepted
---

# Use the v3 authentication store exclusively

Media Dock 3.0 uses `Media Dock Data/v3/authentication-profiles/` as its only Cookie-package store and no longer imports or creates the 2.1-era `Media Dock Data/cookies/` directory during startup. Users add or update sign-in data only by importing a MediaCookies ZIP; every successful import becomes the newest profile used for matching future network sources, while older profiles remain available to tasks that already pinned them. The renderer may show service identifiers and Cookie-entry counts derived from Netscape rows, but never Cookie names, values, domains, paths, or source-package locations. This decision supersedes the automatic Cookie-import allowance in ADR 0017 without deleting or mutating any existing legacy data.
