# 0049: Android Release APK

## Summary

Every GitHub release now carries the Android reference app (`apps/mobile`) as a signed, installable APK. The release workflow gains an `android` job that builds the release APK from the release tag, signs it with a key held in repository secrets, checks the signature and version, and attaches it to the release as `fx-chat-<version>.apk`. release-please now versions the app alongside the libraries, so each APK's `versionName` is the release version and its `versionCode` rises with every release.

**Spec:** [mobile-app](../specs/mobile-app/)
**Status:** complete
**Depends On:** 0021, 0047

## Motivation

1. The only APK CI produced was the debug build, uploaded as a workflow artifact: unsigned for distribution, x86_64 + arm64, under the `.debug` app id, and gone after the artifact expired.
2. The app's version (`tauri.conf.json`, `Cargo.toml`) stayed at `0.1.0` while releases moved on, so `versionName`/`versionCode` said nothing about which release an install came from, and a newer build could not be told apart from an older one.
3. Installing on a phone meant building locally and signing by hand with the debug keystore, so each machine produced a differently signed APK that could not upgrade another's install.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see
[Architecture § Testing](../specs/architecture/index.md#testing)). CI enforces these as merge gates.

### Functional requirements

- `apps/mobile/src-tauri/gen/android/app/build.gradle.kts` reads the gitignored `apps/mobile/src-tauri/gen/android/keystore.properties` when it exists (keys `storeFile` — absolute, or relative to that file's directory — `password`, `keyAlias`, and optional `keyPassword` defaulting to `password`) and signs the `release` build type with it. Without the file the release build is left unsigned rather than failing. A file missing a required key fails the build with the key's name. The debug build is unchanged.
- `release-please-config.json` `extra-files` set the app's version in `apps/mobile/src-tauri/tauri.conf.json` (`$.version`), `apps/mobile/src-tauri/Cargo.toml` (`$.package.version`) and `apps/mobile/src-tauri/Cargo.lock` (`$.package[?(@.name.value=='fx-chat')].version`). All three are set to the current release, `0.1.1`.
- `mise run android:release` builds the release APK for real phones: `bunx tauri android build --apk --target aarch64 armv7`, producing `app/build/outputs/apk/universal/release/app-universal-release.apk`.
- `.github/workflows/release.yml` gains an `android` job, gated like `publish` on a created release. It checks out the release tag, installs the toolchain through mise, fails with the secret's name if `ANDROID_KEYSTORE_BASE64` or `ANDROID_KEYSTORE_PASSWORD` is empty, writes the keystore to `$RUNNER_TEMP` and `keystore.properties` beside the Gradle project, runs `mise run android:release`, verifies the APK with `apksigner verify` and checks that its `versionName` equals the tag without its `v`, then uploads it as `fx-chat-<version>.apk` with `gh release upload --clobber`.
- The README's releases section tells users how to install the APK.

## Design

### Decisions

- **Signing config in the Gradle file, key outside the repository.** `keystore.properties` beside the Gradle project is the location Tauri documents for Android signing and is already gitignored there. The release job writes it from secrets; a maintainer can write it by hand for a local signed build. Making the signing config conditional keeps `tauri android build` working for anyone without the key.
- **One key for every release.** Android only installs an APK over an existing install when both are signed by the same key, so the key is generated once and kept in secrets; losing it means users must uninstall to move to a release signed by a new key. The keystore is PKCS12 with alias `fx-chat`, whose store and key passwords are identical, so only one password secret is needed.
- **Version from release-please.** Tauri derives the Android version from `tauri.conf.json`'s `version` and writes it into the generated `tauri.properties`: `versionName` is the version string and `versionCode` is `major * 1000000 + minor * 1000 + patch` (0.1.1 → 1001). Keeping the version on the release version therefore gives every release a higher `versionCode` than the last. `Cargo.toml` and `Cargo.lock` are bumped with it so the crate version matches and the lock file never drifts after a release.
- **Cargo.lock through the TOML updater.** release-please's `toml` updater evaluates the JSONPath with `jsonpath-plus` over a parse tree whose scalar values are wrapped objects holding the parsed value under `.value`, so the filter compares `@.name.value`, not `@.name`. This was checked against release-please 17.11.2 (the action uses `^17.6.1`): the filter changes exactly the `fx-chat` package's `version` line and nothing else, while `@.name=='fx-chat'` matches nothing.
- **Universal APK for arm64 and armv7.** One asset installs on every real phone. The x86_64 emulator target stays on the debug build; per-ABI splits are left out.
- **Checked before upload.** The job runs `apksigner verify` and compares the APK's `versionName` with the tag, so a missing signature or a release-please bump that missed `tauri.conf.json` fails the job instead of shipping. The password is rejected if it contains a backslash, which a Java properties file would read as an escape.
- **Cleartext stays allowed.** Release builds keep `usesCleartextTraffic`, because users point the app at model servers on their own network over plain HTTP (see the comment in `build.gradle.kts`).

### One-time bootstrap

The maintainer adds two repository secrets (Settings → Secrets and variables → Actions) before the next release:

1. `ANDROID_KEYSTORE_BASE64` — the release keystore (PKCS12), base64-encoded on one line (`base64 -w0 fx-chat-release.jks`).
2. `ANDROID_KEYSTORE_PASSWORD` — the keystore password, which is also the key password.

The key alias is fixed to `fx-chat` in the workflow. Keep an offline backup of the keystore and password: every future release must be signed with them.

### Non-Goals

Per-ABI split APKs; an Android App Bundle or Play Store publishing; changes to the debug build or `android.yml`; iOS or desktop bundles; attaching APKs to releases that already exist.

## Tasks

- [x] Release signing config in `build.gradle.kts`, fed by the gitignored `keystore.properties`
- [x] release-please `extra-files` for `tauri.conf.json`, `Cargo.toml` and `Cargo.lock`; app version set to `0.1.1`
- [x] `mise run android:release` task; AGENTS.md task list
- [x] `android` job in `release.yml` (signing key from secrets, `apksigner` and `versionName` checks, `gh release upload`)
- [x] README install note, mobile-app and architecture specs, this change document and indexes
