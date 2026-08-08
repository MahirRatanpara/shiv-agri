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
#   ./scripts/run-android.sh --live     # live reload: hot-reload web edits on device
#
# --clean fixes the "Error loading build artifacts ... redirect.txt" error, which
# happens when Android Studio's run config references a build/ output that was
# cleaned away. It removes the stale caches so the next Run does a fresh build.
#
# --live starts `ng serve` and points the app's WebView at it, so web/UI edits
# hot-reload instantly WITHOUT rebuilding & reinstalling the APK each time.
# Capacitor builds/installs/launches the app once (pointed at your machine's LAN
# IP) then watches the dev server. Combine with --dev for the local-API build.
# Press Ctrl-C to stop; it tears the dev server down. (Normal `cap sync` + Run ▶
# only updates the bundled assets — the emulator keeps running the old APK until
# you rebuild, which is why plain re-launching never shows web changes.)

set -euo pipefail

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

# Ensure a JDK 21+ is active — `cap run` (live reload) drives Gradle from the
# CLI, and AGP 8.13 fails with "invalid source release: 21" on older JDKs.
# Android Studio's own build is unaffected (it uses its bundled JBR).
ensure_jdk21() {
  local jbr="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
  local major=""
  if [ -n "${JAVA_HOME:-}" ] && [ -x "$JAVA_HOME/bin/java" ]; then
    major="$("$JAVA_HOME/bin/java" -version 2>&1 | sed -n 's/.*version "\([0-9]*\).*/\1/p' | head -1)"
  fi
  if [ -n "$major" ] && [ "$major" -ge 21 ] 2>/dev/null; then
    return
  fi
  if [ -x "$jbr/bin/java" ]; then
    export JAVA_HOME="$jbr"
    echo "==> [android] using Android Studio's bundled JDK 21: $JAVA_HOME"
  else
    echo "⚠ No JDK 21 found. If Gradle fails with 'invalid source release: 21'," >&2
    echo "  set JAVA_HOME to a JDK 21 (e.g. Android Studio's bundled JBR)." >&2
  fi
}

if [ "$DO_LIVE" = true ]; then
  ensure_jdk21
  SERVE_CONFIG="development"
  [ "$CONFIG" = "native-dev" ] && SERVE_CONFIG="native-dev"

  # Pick the host the device uses to reach this machine's dev server:
  #  - Emulator: 10.0.2.2 is the special alias to the host loopback, and it's
  #    already cleartext-permitted in network_security_config.xml.
  #  - Physical device: the machine's LAN IP — which must be added to the
  #    cleartext whitelist in network_security_config.xml or the WebView blocks
  #    the http dev server (net::ERR_CLEARTEXT_NOT_PERMITTED).
  ADB="$(command -v adb || echo "${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}/platform-tools/adb")"
  SERIAL="$("$ADB" devices 2>/dev/null | awk 'NR>1 && $2=="device"{print $1; exit}')"
  if [ -z "$SERIAL" ]; then
    echo "No running Android device/emulator found — boot an emulator or plug in a device first." >&2
    exit 1
  fi
  if [[ "$SERIAL" == emulator-* ]]; then
    LIVE_HOST="10.0.2.2"
  else
    LIVE_HOST="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo localhost)"
    echo "⚠ Physical device ($SERIAL): add $LIVE_HOST to cleartextTrafficPermitted in"
    echo "  android/app/src/main/res/xml/network_security_config.xml or the dev server is blocked."
  fi

  echo "==> [android][live] dev server on 0.0.0.0:4200 (device loads http://$LIVE_HOST:4200, configuration: $SERVE_CONFIG)"
  npx ng serve --host 0.0.0.0 --port 4200 --configuration "$SERVE_CONFIG" &
  NG_PID=$!
  trap 'kill "$NG_PID" 2>/dev/null || true' EXIT INT TERM

  echo "==> [android][live] waiting for the dev server to come up..."
  until curl -sf "http://localhost:4200" >/dev/null 2>&1; do
    kill -0 "$NG_PID" 2>/dev/null || { echo "dev server exited early" >&2; exit 1; }
    sleep 1
  done

  echo "==> [android][live] building, installing & launching with live reload (Ctrl-C to stop)"
  npx cap run android --live-reload --host "$LIVE_HOST" --port 4200 --target "$SERIAL"
  exit 0
fi

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
