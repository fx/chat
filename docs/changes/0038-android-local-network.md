# 0038: Android Local Network

## Summary

Request Android 17's runtime local-network permission so the mobile app can reach endpoints on the local network, and give the development emulator the host keyboard.

**Spec:** [mobile-app](../specs/mobile-app/)
**Status:** complete
**Depends On:** 0021

## Motivation

1. Android 17 (API 37, which the app targets) blocks connections to local-network addresses unless the app holds `ACCESS_LOCAL_NETWORK`. Every request to an endpoint on the LAN failed with reqwest's opaque "error sending request" — including a public host name that split DNS resolves to a LAN ingress — while the same request from a shell or the browser worked.
2. `avdmanager` creates the `fxchat` AVD with `hw.keyboard = no`, so the emulator ignored typing on the host keyboard.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see
[Architecture § Testing](../specs/architecture/index.md#testing)). CI enforces these as merge gates.

### Functional requirements

- The Android manifest declares `android.permission.ACCESS_LOCAL_NETWORK`.
- On API 37 and later, `MainActivity` requests the permission at launch when it is not already granted; earlier versions skip the request.
- `mise run android:setup` sets `hw.keyboard = yes` on the `fxchat` AVD.

## Design

### Decisions

- **Ask at launch.** Endpoints are commonly on the LAN (a home server, or a public name that resolves to one), and a failed request gives no hint that a permission is missing, so the app asks up front rather than on first failure. It asks on each launch until granted; after repeated denials Android stops showing the dialog.
- **Gate on the SDK integer.** The permission constant is referenced by its string and the check uses `Build.VERSION.SDK_INT < 37`, so the code compiles against SDKs that do not name API 37 yet.
- **Keyboard via the AVD config.** The setup script rewrites the `config.ini` line `avdmanager` writes, so recreating the AVD keeps host keyboard input.

### Non-Goals

Detecting a denied permission and explaining it in the UI; iOS or desktop network permissions.

## Tasks

- [x] Manifest: declare `ACCESS_LOCAL_NETWORK`
- [x] `MainActivity`: request it at launch on API 37+
- [x] `scripts/android-setup.sh`: enable `hw.keyboard` on the `fxchat` AVD
