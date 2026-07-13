# Delivery naming

## Defaults

- Network media: `{title} [{sourceId}].{extension}`.
- Local derived media: `{originalName} - {deliverableRole}.{extension}`.
- The planned name is visible before task creation and expert naming templates remain bounded by the same safety policy.

## Safety

- Preserve meaningful Unicode and normalize consistently.
- Remove or replace control characters and platform-prohibited filename characters.
- Guard Windows reserved device names, trailing spaces, and trailing dots.
- Apply a destination-aware path budget, shortening the title before stable identity or extension.
- Resolve and validate the destination in the main process as a writable filesystem location.

## Collisions and retries

- Never silently overwrite an existing user file.
- Use a stable numeric suffix for automatic collision handling.
- Require explicit confirmation for replacement.
- Reuse an existing path only when the same task can verify that it already delivered the expected artifact.
