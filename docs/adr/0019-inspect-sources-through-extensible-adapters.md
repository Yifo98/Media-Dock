---
status: accepted
---

# Inspect sources through extensible adapters

Media Dock 3.0 places a stable, side-effect-free source-inspection interface between Source Dock and source-specific implementations. Network, local-media, and future source adapters determine whether they can handle an input and return a normalized description of its identity, media kind, authentication requirements, compatible deliverables, collection structure, and actionable risks without downloading media, creating tasks, or modifying user files. Collections expand into Task Batches after inspection, unsupported inputs return product-level guidance rather than raw tool errors, and adding a site or source type does not require changes to the Workbench or the Media Task Engine.
