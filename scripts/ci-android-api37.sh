#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
test "$(adb shell getprop sys.boot_completed | tr -d '\r')" = "1"
adb shell df -h /data
data_available_kib="$(adb shell df -k /data | tr -d '\r' | awk 'NR == 2 { print $4 }')"
if ! test "$data_available_kib" -ge 1048576; then
  echo "::error::The emulator needs at least 1 GiB free for APK installation and instrumentation."
  exit 1
fi
# SurfaceFlinger on the API 37 image can abort (issuetracker 546200928) even
# with the DMA readback override, and init then restarts zygote, so the
# package service disappears for minutes. Wait the restart window out instead
# of racing it.
wait_for_framework() {
  for _ in $(seq 1 48); do
    booted="$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
    package_service="$(adb shell service check package 2>/dev/null | tr -d '\r' || true)"
    if test "$booted" = "1" && test "$package_service" = "Service package: found"; then
      return 0
    fi
    sleep 10
  done
  echo "::error::The Android 17 framework never re-exposed PackageManager after a SurfaceFlinger restart." >&2
  adb logcat -d -v threadtime 2>/dev/null | tail -400 >&2 || true
  return 1
}
install_apk() {
  wait_for_framework
  for attempt in 1 2 3; do
    if adb install -r app/build/outputs/apk/debug/app-debug.apk; then
      return 0
    fi
    echo "APK install attempt $attempt failed; letting the framework recover before retrying." >&2
    wait_for_framework
  done
  echo "::error::The Android 17 APK never installed." >&2
  return 1
}
# A framework restart can also leave the freshly recovered ActivityManager
# without the package's activity index for a while ("Error type 3"), so the
# launch retries until the activity resolves.
launch_app() {
  for attempt in $(seq 1 12); do
    adb shell am force-stop com.lightcodeapp.mobile 2>/dev/null || true
    if adb shell am start -W -n com.lightcodeapp.mobile/com.poracode.app.MainActivity | tee "$RUNNER_TEMP/android-api37-launch.txt" | grep -F 'Status: ok'; then
      return 0
    fi
    echo "App launch attempt $attempt failed; letting the framework settle before retrying." >&2
    wait_for_framework
    sleep 5
  done
  echo "::error::The Android 17 app never launched." >&2
  return 1
}
capability="$(openssl rand -hex 32)"
echo "::add-mask::$capability"
export NATIVE_E2E_CONTROL_CAPABILITY="$capability"
export PORACODE_NATIVE_E2E_SLOT=1
node --experimental-transform-types \
  --import ./scripts/remote-v3-ts-register.mjs \
  --no-warnings=ExperimentalWarning \
  ./tests/native-e2e/harness/cli.ts --mode mock --slot 1 \
  > "$RUNNER_TEMP/android-wire-lab.stdout" \
  2> "$RUNNER_TEMP/android-wire-lab.stderr" &
harness_pid=$!
trap 'kill "$harness_pid" 2>/dev/null || true; wait "$harness_pid" 2>/dev/null || true' EXIT
for attempt in $(seq 1 60); do
  if grep -Fq 'native-e2e mock host ready' "$RUNNER_TEMP/android-wire-lab.stderr"; then
    break
  fi
  if ! kill -0 "$harness_pid" 2>/dev/null; then
    echo "Native wire lab exited before readiness." >&2
    sed -n '1,120p' "$RUNNER_TEMP/android-wire-lab.stderr" >&2
    exit 1
  fi
  sleep 1
done
grep -Fq 'native-e2e mock host ready' "$RUNNER_TEMP/android-wire-lab.stderr"
cd android
test "$(adb shell getprop ro.build.version.release | tr -d '\r')" = "17"
test "$(adb shell getprop ro.build.version.sdk | tr -d '\r')" = "37"
test "$(adb shell getprop ro.build.version.codename | tr -d '\r')" = "REL"
./gradlew assembleDebug --no-daemon --stacktrace
install_apk
adb shell dumpsys package com.lightcodeapp.mobile | grep -F 'minSdk=26'
adb shell dumpsys package com.lightcodeapp.mobile | grep -F 'targetSdk=37'
# Keep a copy of everything logged since boot before the clear, so a
# framework restart during the build stays diagnosable in the artifacts.
adb logcat -d -v threadtime > "$RUNNER_TEMP/android-api37-logcat-before-clear.txt" || true
adb logcat -c
launch_app
sleep 3
test -n "$(adb shell pidof com.lightcodeapp.mobile | tr -d '\r')"
adb logcat -d -v threadtime > "$RUNNER_TEMP/android-api37-logcat.txt"
bash -euo pipefail -c 'if grep -A3 -F "FATAL EXCEPTION" "$RUNNER_TEMP/android-api37-logcat.txt" | grep -F "com.lightcodeapp.mobile"; then echo "Poracode crashed during Android 17 launch." >&2; exit 1; fi'
bash -euo pipefail -c 'mapfile -d "" sources < <(find app/src/androidTest -type f \( -name "*.kt" -o -name "*.java" \) -print0 2>/dev/null); test "${#sources[@]}" -gt 0 || { echo "::error::API 37 androidTest coverage is required; no instrumentation sources exist."; exit 1; }; grep -Eiq "ACCESS_LOCAL_NETWORK|LocalNetworkAccess\.PERMISSION" "${sources[@]}" || { echo "::error::androidTest must exercise ACCESS_LOCAL_NETWORK."; exit 1; }; grep -Eiq "grant(ed)?|allow(ed)?" "${sources[@]}" || { echo "::error::androidTest must exercise the granted local-network path."; exit 1; }; grep -Eiq "den(i|y|ied)|revoke(d)?|not[_ ]?allow" "${sources[@]}" || { echo "::error::androidTest must exercise denial or revocation."; exit 1; }'
wait_for_framework
adb reverse tcp:49160 tcp:49160
adb reverse tcp:49161 tcp:49161
# If SurfaceFlinger aborts mid-run, init restarts the whole framework and the
# test process dies with it. Retry exactly once, and only when a restart
# actually happened, so real failures are never masked.
framework_pid="$(adb shell pidof system_server 2>/dev/null | tr -d '\r' || true)"
if ! ./gradlew connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.capability="$capability" --no-daemon --stacktrace; then
  framework_pid_now="$(adb shell pidof system_server 2>/dev/null | tr -d '\r' || true)"
  if test "$framework_pid_now" = "$framework_pid"; then
    echo "::error::Instrumentation failed without a framework restart; not retrying." >&2
    exit 1
  fi
  echo "SurfaceFlinger restarted the framework during instrumentation; recovering and retrying once." >&2
  wait_for_framework
  ./gradlew connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.capability="$capability" --no-daemon --stacktrace
fi
printf '%s\n' '### Android 17 runtime evidence' '' '- API 37 emulator booted as Android 17 (REL).' '- The targetSdk 37 / minSdk 26 APK installed and launched.' '- The API 37 instrumentation suite passed.' >> "$GITHUB_STEP_SUMMARY"
