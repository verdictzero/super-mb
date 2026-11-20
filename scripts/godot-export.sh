#!/usr/bin/env bash
# Exports the Godot project for Linux, Windows, macOS and Web and zips each build into release/.
# Usage: GODOT=/path/to/godot scripts/godot-export.sh   (needs the matching export templates installed)
set -euo pipefail
cd "$(dirname "$0")/.."
GODOT="${GODOT:-godot}"
VERSION="$(grep -oP 'config/version="\K[^"]+' godot/project.godot)"
rm -rf build/godot && mkdir -p build/godot/{linux,windows,web,macos,android} release
"$GODOT" --headless --path godot --import >/dev/null 2>&1 || true
# Android needs the Android SDK and a JDK set in Godot's editor settings, and a signing key:
#   GODOT_ANDROID_KEYSTORE_RELEASE_PATH / _USER / _PASSWORD. It is skipped when no key is given.
PRESETS="Linux Windows Web macOS"
[ -n "${GODOT_ANDROID_KEYSTORE_RELEASE_PATH:-}" ] && PRESETS="$PRESETS Android"
for preset in $PRESETS; do
  echo "== exporting $preset"
  "$GODOT" --headless --path godot --export-release "$preset" 2>&1 | grep -E "ERROR|WARNING: .*export|savepack" || true
done
(cd build/godot/linux && chmod +x super-mb.x86_64 && zip -q -9 "../../../release/super-mb-$VERSION-linux.zip" super-mb.x86_64)
(cd build/godot/windows && zip -q -9 "../../../release/super-mb-$VERSION-windows.zip" super-mb.exe)
(cd build/godot/web && zip -q -9 -r "../../../release/super-mb-$VERSION-web.zip" .)
[ -f build/godot/macos/super-mb-macos.zip ] && cp build/godot/macos/super-mb-macos.zip "release/super-mb-$VERSION-macos.zip"
[ -f build/godot/android/super-mb.apk ] && cp build/godot/android/super-mb.apk "release/super-mb-$VERSION-android.apk"
ls -la release
