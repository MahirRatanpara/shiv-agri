#!/usr/bin/env bash
#
# Build the web app, sync it into the native Android project, and open Android
# Studio. This is the local dev entry point for the mobile app — the native
# build (APK/AAB) is produced by Android Studio (Run ▶) or by the CI workflow
# .github/workflows/mobile-build.yml, never committed to the repo.
#
# Usage:
#   ./scripts/run-android.sh            # production web build, sync, open Studio
#   ./scripts/run-android.sh --dev      # native-dev web build (talks to local API)
#   ./scripts/run-android.sh --clean    # also wipe stale Gradle/build caches first
#   ./scripts/run-android.sh --no-open  # build + sync only, don't open Studio
#
# --clean fixes the "Error loading build artifacts ... redirect.txt" error, which
# happens when Android Studio's run config references a build/ output that was
# cleaned away. It removes the stale caches so the next Run does a fresh build.

set -euo pipefail

# Resolve the frontend/ dir (parent of this script's dir) regardless of cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SELF="$SCRIPT_DIR/$(basename "${BASH_SOURCE[0]}")"
FRONTEND_DIR="$(dirname "$SCRIPT_DIR")"
cd "$FRONTEND_DIR"

CONFIG="production"
DO_CLEAN=false
DO_OPEN=true

for arg in "$@"; do
  case "$arg" in
    --dev)     CONFIG="native-dev" ;;
    --clean)   DO_CLEAN=true ;;
    --no-open) DO_OPEN=false ;;
    -h|--help)
      grep '^#' "$SELF" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "Unknown option: $arg (see --help)" >&2; exit 1 ;;
  esac
done

echo "==> [android] web build (configuration: $CONFIG)"
npx ng build --configuration "$CONFIG"

if [ "$DO_CLEAN" = true ]; then
  echo "==> [android] clearing stale Gradle/build caches (fixes redirect.txt errors)"
  rm -rf android/.gradle android/app/build android/build android/capacitor-cordova-android-plugins/build
fi

echo "==> [android] cap sync"
npx cap sync android

if [ "$DO_OPEN" = true ]; then
  echo "==> [android] opening Android Studio — press Run ▶ to build & launch on a device/emulator"
  npx cap open android
else
  echo "==> [android] done (skipped opening Android Studio)"
fi
