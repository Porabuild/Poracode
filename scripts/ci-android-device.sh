#!/usr/bin/env bash
set -euo pipefail

# Physical-device qualification for the Android real-peer family journey.
# Unlike scripts/ci-android-api37.sh this lane makes NO emulator assumptions:
# no AVD, no KVM, no emulator boot, no 10.0.2.2 alias. The attached physical
# device is pinned through ANDROID_SERIAL (exported here; adb and the Gradle
# connected tests both honor it) and must report API >= 34, the app's
# maintained minSdk floor — not an exact release, because physical devices
# legitimately run different maintenance builds. The real-peer family journey
# itself lives in scripts/native-e2e.mjs (android-real): this script verifies
# the device, proves the shipped build launches on it, and hands off.

harness_pid=""
cleanup() {
  runtime_status=$?
  adb -s "$ANDROID_SERIAL" logcat -d -t 2000 -v threadtime \
    >> "$RUNNER_TEMP/android-device-logcat.txt" 2>&1 || true
  if [ -n "$harness_pid" ]; then
    kill "$harness_pid" 2>/dev/null || true
    wait "$harness_pid" 2>/dev/null || true
  fi
  exit "$runtime_status"
}
trap cleanup EXIT

if [ -z "${RUNNER_TEMP:-}" ]; then
  RUNNER_TEMP="$(mktemp -d)"
  export RUNNER_TEMP
fi

if [ -z "${ANDROID_SERIAL:-}" ]; then
  echo "::error::ANDROID_SERIAL is required: export the attached physical device serial (first column of the platform-tools device listing)." >&2
  exit 1
fi
export ANDROID_SERIAL

cd "$(dirname "${BASH_SOURCE[0]}")/../android"

if ! adb -s "$ANDROID_SERIAL" get-state | grep -q '^device$'; then
  echo "::error::ANDROID_SERIAL=$ANDROID_SERIAL is not an attached, responsive device." >&2
  exit 1
fi

# A just-plugged device can still be booting; wait for the boot flag like the
# emulator lane does.
boot_completed=""
for attempt in $(seq 1 60); do
  boot_completed="$(adb -s "$ANDROID_SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
  if [ "$boot_completed" = "1" ]; then
    break
  fi
  if [ "$attempt" -eq 60 ]; then
    echo "::error::$ANDROID_SERIAL never completed boot." >&2
    exit 1
  fi
  sleep 2
done

device_sdk="$(adb -s "$ANDROID_SERIAL" shell getprop ro.build.version.sdk | tr -d '\r')"
case "$device_sdk" in
  ''|*[!0-9]*)
    echo "::error::$ANDROID_SERIAL reported a non-numeric SDK level: '$device_sdk'." >&2
    exit 1;;
esac
if [ "$device_sdk" -lt 34 ]; then
  echo "::error::Physical-device qualification requires API >= 34; $ANDROID_SERIAL reports API $device_sdk." >&2
  exit 1
fi
echo "Physical device $ANDROID_SERIAL: API $device_sdk ($(adb -s "$ANDROID_SERIAL" shell getprop ro.build.version.release | tr -d '\r'))"

# sys.boot_completed alone races the framework services (same as the emulator
# lane): early `pm`/`am` calls can still fail while boot flags are already
# set. Ping both services until they answer before installing.
for attempt in $(seq 1 60); do
  if adb -s "$ANDROID_SERIAL" shell pm path android >/dev/null 2>&1 \
      && adb -s "$ANDROID_SERIAL" shell am get-current-user >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 60 ]; then
    echo "::error::Package manager / activity manager did not become ready after boot." >&2
    exit 1
  fi
  sleep 2
done

adb -s "$ANDROID_SERIAL" shell df -h /data
adb -s "$ANDROID_SERIAL" install -r app/build/outputs/apk/debug/app-debug.apk
adb -s "$ANDROID_SERIAL" shell dumpsys package com.lightcodeapp.mobile | grep -F 'minSdk=34'
adb -s "$ANDROID_SERIAL" shell dumpsys package com.lightcodeapp.mobile | grep -F 'targetSdk=37'
adb -s "$ANDROID_SERIAL" logcat -c

# Launch gate: prove the shipped build actually starts on this physical
# device before spending instrumentation minutes. `am start -W` can starve
# out on slow devices even though the activity comes up moments later, so
# verify by process presence and retry once after a force-stop.
launch_ok=0
for launch_attempt in 1 2; do
  adb -s "$ANDROID_SERIAL" shell am force-stop com.lightcodeapp.mobile
  adb -s "$ANDROID_SERIAL" shell am start -W -n com.lightcodeapp.mobile/com.poracode.app.MainActivity \
    | tee "$RUNNER_TEMP/android-device-launch.txt"
  for wait_attempt in $(seq 1 30); do
    app_pid="$(adb -s "$ANDROID_SERIAL" shell pidof com.lightcodeapp.mobile | tr -d '\r')"
    if [ -n "$app_pid" ]; then
      launch_ok=1
      break
    fi
    sleep 2
  done
  if [ "$launch_ok" = "1" ]; then
    break
  fi
  if [ "$launch_attempt" = "2" ]; then
    echo "::error::MainActivity never reached the foreground (launch evidence in android-device-launch.txt)." >&2
    exit 1
  fi
  echo "::warning::Launch attempt 1 did not come up; retrying after a force-stop."
done
sleep 3
test -n "$(adb -s "$ANDROID_SERIAL" shell pidof com.lightcodeapp.mobile | tr -d '\r')"
adb -s "$ANDROID_SERIAL" logcat -d -v threadtime > "$RUNNER_TEMP/android-device-logcat.txt"
if grep -A3 -F "FATAL EXCEPTION" "$RUNNER_TEMP/android-device-logcat.txt" | grep -F "com.lightcodeapp.mobile"; then
  echo "Poracode crashed during physical-device launch." >&2
  exit 1
fi

# The android-real journey owns the rest end to end: real-mode harness start,
# the harness-minted pairing credential, adb reverse of the control and
# production ports (works over USB), and the family class with peerMode=real.
# ANDROID_SERIAL stays exported: adb and the Gradle connected tests pin to
# this device. Its own timers bound individual phases in addition to the
# workflow deadline.
cd ..
node scripts/native-e2e.mjs android-real

printf '%s\n' '### Android physical-device evidence' '' \
  "- Device $ANDROID_SERIAL (API $device_sdk) booted, installed, and launched." \
  '- The real-peer family journey (terminal keystroke + git stage) ran against the production host.' \
  >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
