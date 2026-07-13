---
status: accepted
---

# Use built-in SQLite for task metadata

Media Dock 3.0 stores task batches, task lifecycle state, recovery context, bounded diagnostic evidence, deliverable records, and non-sensitive preferences in a versioned SQLite database under the portable data area. The task engine owns this local-substitutable implementation behind its external interface, using a file-backed database in production and an in-memory database in tests; media contents, Cookie values, API keys, and high-frequency progress ticks are excluded, migrations run transactionally with backup, and Electron's built-in `node:sqlite` avoids a separately packaged native database dependency.
