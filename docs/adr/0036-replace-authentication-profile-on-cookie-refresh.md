---
status: accepted
---

# Replace the current Authentication Profile on Cookie refresh

Media Dock treats the System Center "Update Cookies" action as replacement, not accumulation. It validates and copies the new MediaCookies package into a new private directory before changing SQLite; only after that preparation succeeds does one database transaction replace all prior Authentication Profile rows with the new current profile. Old profile directories are then removed. An invalid or incomplete new package leaves the current profile and its files untouched.

Replacement is refused while a queued or running Media Task is pinned to an existing Authentication Profile. This prevents an in-flight task from losing its authentication material. Terminal task history may retain a non-secret historical profile identifier, but Media Dock does not retain old Cookie values merely for history reproducibility. This decision supersedes the multi-profile retention behavior in ADR 0023 and ADR 0033.
