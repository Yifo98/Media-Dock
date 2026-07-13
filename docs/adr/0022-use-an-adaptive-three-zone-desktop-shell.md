---
status: accepted
---

# Use an adaptive three-zone desktop shell

Media Dock 3.0 replaces the fixed `1280x840` minimum layout with an adaptive desktop shell whose navigation, main canvas, and contextual Expert Inspector respond independently to available space. Wide windows may pin all three zones, medium windows open the inspector as a right drawer, and compact windows collapse navigation and present the inspector as a full-height surface; primary task actions remain reachable in every mode, the root never requires horizontal scrolling, and long paths or diagnostics manage their own overflow. The app defaults near `1280x800`, supports a normal compact target near `900x640` with a lower runtime safety floor for heavily scaled displays, restores saved bounds only after clamping them to the current display work area, and treats Windows 100%, 125%, 150%, and 200% scaling as release checks.
