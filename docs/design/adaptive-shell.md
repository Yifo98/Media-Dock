# Adaptive desktop shell

## Layout modes

| Mode | Navigation | Main canvas | Expert Inspector |
| --- | --- | --- | --- |
| Wide | Expanded rail | Full working canvas | Pinned when opened |
| Medium | Compact rail | Full working canvas | Right-side drawer |
| Compact | Collapsed navigation | Single-column canvas | Full-height surface |

The implementation chooses modes from available content space rather than operating-system names or device-pixel ratios. `900x640` is the normal compact design target; a lower safety floor must remain usable on small work areas and Windows displays scaled to 200%.

## Invariants

- Source Dock and the current primary action remain reachable without horizontal scrolling.
- Paths use middle truncation where the filename or final directory matters.
- Logs scroll inside their diagnostic surface and never determine window width.
- Drawers and full-height surfaces restore focus to their trigger when closed.
- Saved window bounds are clamped to the active display before the window is shown.
- Layout is checked at Windows 100%, 125%, 150%, and 200% scaling as well as macOS Retina rendering.
