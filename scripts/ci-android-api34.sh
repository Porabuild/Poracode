#!/usr/bin/env bash
# Android 14 (API 34) minimum-supported runtime lane, run inside the emulator
# runner from `android/`. The APKs are built before boot; this script only
# installs and runs the two required minimum-floor instrumentation classes.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Written only when the Gradle instrumentation run (install plus tests) failed
# while adb still saw the emulator. That is treated as a real failure and never
# retried. Every other failure (a boot that never completed, unresponsive
# framework services, a device lost mid-run) is infrastructure, and the
# workflow retries it once on a fresh emulator.
test_failure_marker="$repo_root/android/build/ci/api34-test-failure"
rm -f "$test_failure_marker"
cd "$repo_root/android"

timeout 300 adb wait-for-device shell 'while [ "$(getprop sys.boot_completed | tr -d "\r")" != "1" ]; do sleep 5; done'
test "$(adb shell getprop ro.build.version.release | tr -d '\r')" = "14"
test "$(adb shell getprop ro.build.version.sdk | tr -d '\r')" = "34"
test "$(adb shell getprop ro.build.version.codename | tr -d '\r')" = "REL"

# sys.boot_completed alone races the framework services; ping the package and
# activity managers until both answer before Gradle installs the APKs.
for attempt in $(seq 1 60); do
  if adb shell pm path android >/dev/null 2>&1 && adb shell am get-current-user >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 60 ]; then
    echo "::warning::Package manager / activity manager did not become ready after boot." >&2
    exit 1
  fi
  sleep 2
done

if ! ./gradlew connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=com.poracode.app.MinimumSdkLaunchInstrumentedTest,com.poracode.app.transport.TlsPinPairingInstrumentedTest --no-daemon --stacktrace; then
  if [ "$(adb get-state 2>/dev/null | tr -d '\r')" = "device" ]; then
    mkdir -p "$(dirname "$test_failure_marker")"
    : > "$test_failure_marker"
  else
    echo "::warning::The Android 14 emulator went offline during instrumentation."
  fi
  exit 1
fi

printf '%s\n' '### Android 14 minimum-supported runtime evidence' '' '- API 34 emulator booted as Android 14 (REL).' '- The minSdk 34 APK launched and exposed the pairing entry point.' '- The minimum-SDK launch and TLS pin pairing tests passed.' >> "$GITHUB_STEP_SUMMARY"
