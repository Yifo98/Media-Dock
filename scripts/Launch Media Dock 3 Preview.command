#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

find_project_root() {
  local candidate
  for candidate in \
    "$SCRIPT_DIR" \
    "$SCRIPT_DIR/.." \
    "$SCRIPT_DIR/Media Dock Project" \
    "$SCRIPT_DIR/Media-Dock" \
    "$SCRIPT_DIR/Media-Dock-main"
  do
    if [[ -f "$candidate/package.json" && -f "$candidate/scripts/launch-mac-v3-preview.sh" ]]; then
      (cd "$candidate" && pwd)
      return 0
    fi
  done
  return 1
}

PROJECT_ROOT="$(find_project_root || true)"
if [[ -z "$PROJECT_ROOT" ]]; then
  print -u2 "找不到 Media Dock 项目文件。"
  print -u2 "请把启动器放在项目目录内，或放在 Media Dock Project / Media-Dock 文件夹旁边。"
  read -r "?按回车键关闭…"
  exit 1
fi

exec "$PROJECT_ROOT/scripts/launch-mac-v3-preview.sh"
