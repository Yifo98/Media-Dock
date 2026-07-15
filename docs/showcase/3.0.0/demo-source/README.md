# Media Dock 3 demo source

This directory contains the minimal HyperFrames source and local, privacy-safe fixture screenshots used to render the 16-second Media Dock 3.0.0 demo. It is release media source, not part of the Electron application runtime.

```bash
npm run check
npm run render -- --output ../Media-Dock-3.0.0-demo.mp4 --fps 30 --quality high --resolution landscape --strict-all
```

The composition is intentionally silent so it can be reused on GitHub, X, and event submission pages without replacing the viewer's audio.
