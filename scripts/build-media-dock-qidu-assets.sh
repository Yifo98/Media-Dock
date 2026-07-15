#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/media-dock-qidu-assets.XXXXXX")"
ICONSET_DIR="$TEMP_DIR/MediaDock.iconset"
mkdir -p "$ICONSET_DIR"
trap 'rm -rf "$TEMP_DIR"' EXIT

cd "$ROOT_DIR"
swift scripts/build-media-dock-3-icon.swift

for spec in \
  "16 icon_16x16.png" \
  "32 icon_16x16@2x.png" \
  "32 icon_32x32.png" \
  "64 icon_32x32@2x.png" \
  "128 icon_128x128.png" \
  "256 icon_128x128@2x.png" \
  "256 icon_256x256.png" \
  "512 icon_256x256@2x.png" \
  "512 icon_512x512.png" \
  "1024 icon_512x512@2x.png"; do
  size="${spec%% *}"
  filename="${spec#* }"
  sips -z "$size" "$size" build/icon.png --out "$ICONSET_DIR/$filename" >/dev/null
done

iconutil -c icns "$ICONSET_DIR" -o build/icon.icns
"${PYTHON_BIN:-python3}" scripts/build-media-dock-windows-icon.py
sips -s format png build/readme-hero.svg --out build/readme-hero.png >/dev/null
