# Module boundaries

## Main process

`Media Task Engine` is the sole application-facing module for source inspection, Task Plan creation, task commands, workspace snapshots, recovery, and change subscriptions. Its implementation may use the following internal capabilities without exposing their tool-specific details to the renderer:

- source adapters for network, local media, and collections;
- Task Plan compilation and Deliverable Recipes;
- resource-aware scheduling and execution;
- versioned managed-runtime activation;
- Authentication Profile access;
- SQLite persistence and migrations;
- task staging, delivery, and Deliverable Records;
- structured Problems and sanitized diagnostics.

The engine exposes useful product operations rather than filesystem, yt-dlp, FFmpeg, database, or process wrappers.

## Preload boundary

One versioned Media Dock API validates commands and queries, returns serializable read-only snapshots, and emits revisioned change notifications. It does not expose unrestricted Electron IPC, Node APIs, filesystem handles, child processes, or internal database records.

## Renderer

Renderer modules align with the four product spaces: Workbench, Task Center, Deliverable Library, and System Center. Shared visual primitives implement the Luminous Workshop tokens and accessibility behavior; they do not own task truth or reproduce domain rules already held by the engine.

## Migration

Existing yt-dlp, FFmpeg, filesystem, package, and platform behavior moves behind the new boundaries in tracer-sized slices. New 3.0 surfaces consume only the new contract, while 2.1.2 remains a separate stable generation until the release gate is met.
