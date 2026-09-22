#!/usr/bin/env bash
set -euo pipefail

harness_pid=""
cleanup() {
  runtime_status=$?
  adb logcat -d -t 2000 -v threadtime >> "$RUNNER_TEMP/android-api37-logcat.txt" 2>&1 || true
  if [ -n "$harness_pid" ]; then
    kill "$harness_pid" 2>/dev/null || true
    wait "$harness_pid" 2>/dev/null || true
  fi
  exit "$runtime_status"
}
trap cleanup EXIT

cd "$(dirname "${BASH_SOURCE[0]}")/../android"
adb wait-for-device shell 'while [ "$(getprop sys.boot_completed | tr -d "\r")" != "1" ]; do sleep 5; done'
test "$(adb shell getprop sys.boot_completed | tr -d '\r')" = "1"
test "$(adb shell getprop ro.build.version.release | tr -d '\r')" = "17"
test "$(adb shell getprop ro.build.version.sdk | tr -d '\r')" = "37"
test "$(adb shell getprop ro.build.version.codename | tr -d '\r')" = "REL"

# sys.boot_completed alone races the framework services: early `pm`/`am` calls
# can still fail while boot flags are already set. Ping both services until they
# answer before installing (bounded; the emulator-runner boot poll already
# absorbs the transient `adb: device offline` seen on the first polls).
for attempt in $(seq 1 60); do
  if adb shell pm path android >/dev/null 2>&1 && adb shell am get-current-user >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 60 ]; then
    echo "::error::Package manager / activity manager did not become ready after boot." >&2
    exit 1
  fi
  sleep 2
done

adb shell df -h /data
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell dumpsys package com.lightcodeapp.mobile | grep -F 'minSdk=34'
adb shell dumpsys package com.lightcodeapp.mobile | grep -F 'targetSdk=37'
adb logcat -c
# Cold-launch hardening. Measured cold launches on the API 37 emulator take
# 6.5-11.4 s (first-run dexopt/profile install + software rendering), and the
# `am start -W` completion handshake starves out at ~10.8-11.2 s ("Status:
# timeout", LaunchState UNKNOWN) even though the activity comes up moments
# later. Verify the activity by process + window focus instead of trusting the
# single-shot status line, and force-stop + retry once if it truly never rose.
launch_ok=0
for launch_attempt in 1 2; do
  adb shell am force-stop com.lightcodeapp.mobile
  adb shell am start -W -n com.lightcodeapp.mobile/com.poracode.app.MainActivity \
    | tee "$RUNNER_TEMP/android-api37-launch.txt"
  for wait_attempt in $(seq 1 30); do
    app_pid="$(adb shell pidof com.lightcodeapp.mobile | tr -d '\r')"
    if [ -n "$app_pid" ] && adb shell dumpsys activity activities 2>/dev/null \
        | grep -iF "resumedactivity" | grep -qF "com.poracode.app.MainActivity"; then
      launch_ok=1
      break
    fi
    sleep 2
  done
  if [ "$launch_ok" -eq 1 ]; then
    break
  fi
  if [ "$launch_attempt" -eq 2 ]; then
    echo "::error::MainActivity never reached the foreground (launch evidence in android-api37-launch.txt)." >&2
    exit 1
  fi
  echo "::warning::Launch attempt 1 did not come up; retrying after a force-stop."
done
sleep 3
test -n "$(adb shell pidof com.lightcodeapp.mobile | tr -d '\r')"
adb logcat -d -v threadtime > "$RUNNER_TEMP/android-api37-logcat.txt"
if grep -A3 -F "FATAL EXCEPTION" "$RUNNER_TEMP/android-api37-logcat.txt" | grep -F "com.lightcodeapp.mobile"; then
  echo "Poracode crashed during Android 17 launch." >&2
  exit 1
fi

sources=()
while IFS= read -r -d '' source; do
  sources+=("$source")
done < <(find app/src/androidTest -type f \( -name '*.kt' -o -name '*.java' \) -print0)
test "${#sources[@]}" -gt 0 || { echo "::error::API 37 androidTest coverage is required; no instrumentation sources exist."; exit 1; }
grep -Eiq 'ACCESS_LOCAL_NETWORK|LocalNetworkAccess\.PERMISSION' "${sources[@]}" || { echo "::error::androidTest must exercise ACCESS_LOCAL_NETWORK."; exit 1; }
grep -Eiq 'grant(ed)?|allow(ed)?' "${sources[@]}" || { echo "::error::androidTest must exercise the granted local-network path."; exit 1; }
grep -Eiq 'den(i|y|ied)|revoke(d)?|not[_ ]?allow' "${sources[@]}" || { echo "::error::androidTest must exercise denial or revocation."; exit 1; }

# Keep one shell responsible for the capability and the complete harness lifetime.
# Start after the APK build; instrumentation can exceed the CLI's two-minute default.
capability="$(openssl rand -hex 32)"
export NATIVE_E2E_CONTROL_CAPABILITY="$capability"
export PORACODE_NATIVE_E2E_SLOT=1
export NATIVE_E2E_TEST_TIMEOUT_MS=1800000
cd ..
node --experimental-transform-types \
  --import ./scripts/remote-v3-ts-register.mjs \
  --no-warnings=ExperimentalWarning \
  ./tests/native-e2e/harness/cli.ts --mode mock --slot 1 \
  > "$RUNNER_TEMP/android-wire-lab.stdout" \
  2> "$RUNNER_TEMP/android-wire-lab.stderr" &
harness_pid=$!
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
adb reverse tcp:49160 tcp:49160
adb reverse tcp:49161 tcp:49161
./gradlew connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.capability="$capability" --no-daemon --stacktrace
printf '%s\n' '### Android 17 runtime evidence' '' '- API 37 emulator booted as Android 17 (REL).' '- The targetSdk 37 / minSdk 34 APK installed and launched.' '- The API 37 instrumentation suite passed.' >> "$GITHUB_STEP_SUMMARY"
