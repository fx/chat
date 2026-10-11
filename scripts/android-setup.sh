#!/usr/bin/env bash
# Install the Android SDK pieces Tauri needs into $ANDROID_HOME (set by
# mise.toml to .toolchain/android-sdk) and create the `fxchat` test AVD.
# Idempotent. Run via `mise run android:setup`; pass --no-emulator (CI) to skip
# the emulator, system image and AVD.
set -euo pipefail
WITH_EMULATOR=1
[ "${1:-}" = "--no-emulator" ] && WITH_EMULATOR=0
: "${ANDROID_HOME:?run through mise (mise run android:setup)}"

CMDLINE_TOOLS_URL=https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
SDKMANAGER="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"

if [ ! -x "$SDKMANAGER" ]; then
  tmp=$(mktemp -d)
  curl -sSLo "$tmp/clt.zip" "$CMDLINE_TOOLS_URL"
  unzip -q "$tmp/clt.zip" -d "$tmp"
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  mv "$tmp/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
  rm -rf "$tmp"
fi

yes | "$SDKMANAGER" --licenses >/dev/null || true
"$SDKMANAGER" "platform-tools" "platforms;android-35" "build-tools;35.0.0" "ndk;27.2.12479018"
if [ "$WITH_EMULATOR" = 0 ]; then
  echo "Android SDK ready in $ANDROID_HOME (no emulator)"
  exit 0
fi
"$SDKMANAGER" "emulator" "system-images;android-35;google_apis;x86_64"

if ! "$ANDROID_HOME/emulator/emulator" -list-avds | grep -qx fxchat; then
  mkdir -p "$ANDROID_AVD_HOME"
  echo no | "$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager" create avd \
    -n fxchat -k "system-images;android-35;google_apis;x86_64" -d pixel_7 --force
fi
echo "Android SDK ready in $ANDROID_HOME"
