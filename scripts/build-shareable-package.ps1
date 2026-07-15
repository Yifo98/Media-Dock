$ErrorActionPreference = "Stop"
throw @"
This legacy manual Windows packager has been retired.

Build the portable ZIP on native Windows with:
  npm run dist:win

The native workflow uses electron-builder for executable metadata, icon editing,
optional signing, and final ZIP creation. It does not copy or rename electron.exe.
"@
