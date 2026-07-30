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
#   ./scripts/run-ios.sh --live     # live reload: hot-reload web edits on a device
#
# --live starts `ng serve` and points the app's WebView at it, so web/UI edits
# hot-reload instantly WITHOUT rebuilding & reinstalling the app each time.
# Capacitor builds/installs/launches the app once (pointed at your machine's LAN
# IP) then watches the dev server. Combine with --dev for the local-API build.
# Press Ctrl-C to stop; it tears the dev server down. (Normal `cap sync` + Run ▶
# only updates the bundled assets — the simulator keeps running the old build
# until you rebuild, which is why plain re-launching never shows web changes.)

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
DO_LIVE=false

for arg in "$@"; do
  case "$arg" in
    --dev)     CONFIG="native-dev" ;;
    --clean)   DO_CLEAN=true ;;
    --no-open) DO_OPEN=false ;;
    --live)    DO_LIVE=true ;;
    -h|--help)
      grep '^#' "$SELF" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "Unknown option: $arg (see --help)" >&2; exit 1 ;;
  esac
done

if [ "$DO_LIVE" = true ]; then
  SERVE_CONFIG="development"
  [ "$CONFIG" = "native-dev" ] && SERVE_CONFIG="native-dev"

  # The iOS Simulator shares the Mac's network, so it reaches the dev server at
  # localhost. For a physical iPhone, swap this for your Mac's LAN IP (and make
  # sure the phone is on the same Wi-Fi).
  LIVE_HOST="localhost"
  LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo '<your-mac-LAN-IP>')"
  echo "ℹ [ios][live] using host '$LIVE_HOST' (Simulator). For a physical iPhone, use $LAN_IP instead."

  echo "==> [ios][live] starting dev server on 0.0.0.0:4200 (configuration: $SERVE_CONFIG)"
  npx ng serve --host 0.0.0.0 --port 4200 --configuration "$SERVE_CONFIG" &
  NG_PID=$!
  trap 'kill "$NG_PID" 2>/dev/null || true' EXIT INT TERM

  echo "==> [ios][live] waiting for the dev server to come up..."
  until curl -sf "http://localhost:4200" >/dev/null 2>&1; do
    kill -0 "$NG_PID" 2>/dev/null || { echo "dev server exited early" >&2; exit 1; }
    sleep 1
  done

  echo "==> [ios][live] building, installing & launching with live reload (Ctrl-C to stop)"
  npx cap run ios --live-reload --host "$LIVE_HOST" --port 4200
  exit 0
fi

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
