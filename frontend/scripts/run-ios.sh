#!/usr/bin/env bash
#
# Build the web app, sync it into the native iOS project, and open Xcode. This
# is the local dev entry point for the mobile app — the native build (.app/.ipa)
# is produced by Xcode (Run ▶) or by the CI workflow
# .github/workflows/mobile-build.yml, never committed to the repo.
#
# Requires macOS with Xcode + CocoaPods installed.
#
# Usage:
#   ./scripts/run-ios.sh            # production web build, sync, open Xcode
#   ./scripts/run-ios.sh --dev      # native-dev web build (talks to local API)
#   ./scripts/run-ios.sh --clean    # also wipe stale build output first
#   ./scripts/run-ios.sh --no-open  # build + sync only, don't open Xcode

set -euo pipefail

if [ "$(uname)" != "Darwin" ]; then
  echo "iOS builds require macOS with Xcode installed." >&2
  exit 1
fi

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

echo "==> [ios] web build (configuration: $CONFIG)"
npx ng build --configuration "$CONFIG"

if [ "$DO_CLEAN" = true ]; then
  echo "==> [ios] clearing stale build output"
  rm -rf ios/App/build ios/App/DerivedData
fi

echo "==> [ios] cap sync"
npx cap sync ios

if [ "$DO_OPEN" = true ]; then
  echo "==> [ios] opening Xcode — press Run ▶ to build & launch on a simulator/device"
  npx cap open ios
else
  echo "==> [ios] done (skipped opening Xcode)"
fi
