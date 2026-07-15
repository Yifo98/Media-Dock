---
status: accepted
---

# Retain Electron and React and rebuild around deep modules

Media Dock 3.0 retains the current Electron, React, TypeScript, and Vite stack and invests the redesign in domain boundaries, the main-process Media Task Engine, a versioned preload contract, and an original product design system rather than migrating to another desktop framework. Existing platform integration, packaging, and media-tool behavior may move incrementally behind deep modules while the 2.1.2 generation remains intact; the project avoids both a big-bang rewrite and a proliferation of shallow pass-through packages. A large visual component framework does not define the product, although narrowly scoped unstyled accessibility primitives may be added when they materially improve focus, keyboard, or overlay behavior.
