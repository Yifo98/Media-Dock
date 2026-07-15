---
status: accepted
---

# Isolate task staging and recover interrupted work explicitly

Media Dock 3.0 gives each Media Task a private Task Staging Area for partial downloads, intermediate media, and unverified deliverables, placing large staging on the selected destination volume when necessary and exposing only verified final names during delivery. Cancellation first requests graceful shutdown, then terminates the complete process tree after a timeout, and reaches Cancelled only after execution has stopped. Startup converts abandoned Running executions to Needs Attention without silently resuming; recoverable staging is retained for seven days by default with explicit resume, restart, and removal actions, while completed and confirmed-cancelled work is safely cleaned. Storage cleanup reports its scope and can never delete a delivered user file.
