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
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell dumpsys package com.lightcodeapp.mobile | grep -F 'minSdk=26'
adb shell dumpsys package com.lightcodeapp.mobile | grep -F 'targetSdk=37'
adb logcat -c
adb shell am force-stop com.lightcodeapp.mobile
adb shell am start -W -n com.lightcodeapp.mobile/com.poracode.app.MainActivity | tee "$RUNNER_TEMP/android-api37-launch.txt"
grep -F 'Status: ok' "$RUNNER_TEMP/android-api37-launch.txt"
sleep 3
test -n "$(adb shell pidof com.lightcodeapp.mobile | tr -d '\r')"
adb logcat -d -v threadtime > "$RUNNER_TEMP/android-api37-logcat.txt"
bash -euo pipefail -c 'if grep -A3 -F "FATAL EXCEPTION" "$RUNNER_TEMP/android-api37-logcat.txt" | grep -F "com.lightcodeapp.mobile"; then echo "Poracode crashed during Android 17 launch." >&2; exit 1; fi'
bash -euo pipefail -c 'mapfile -d "" sources < <(find app/src/androidTest -type f \( -name "*.kt" -o -name "*.java" \) -print0 2>/dev/null); test "${#sources[@]}" -gt 0 || { echo "::error::API 37 androidTest coverage is required; no instrumentation sources exist."; exit 1; }; grep -Eiq "ACCESS_LOCAL_NETWORK|LocalNetworkAccess\.PERMISSION" "${sources[@]}" || { echo "::error::androidTest must exercise ACCESS_LOCAL_NETWORK."; exit 1; }; grep -Eiq "grant(ed)?|allow(ed)?" "${sources[@]}" || { echo "::error::androidTest must exercise the granted local-network path."; exit 1; }; grep -Eiq "den(i|y|ied)|revoke(d)?|not[_ ]?allow" "${sources[@]}" || { echo "::error::androidTest must exercise denial or revocation."; exit 1; }'
adb reverse tcp:49160 tcp:49160
adb reverse tcp:49161 tcp:49161
./gradlew connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.capability="$capability" --no-daemon --stacktrace
printf '%s\n' '### Android 17 runtime evidence' '' '- API 37 emulator booted as Android 17 (REL).' '- The targetSdk 37 / minSdk 26 APK installed and launched.' '- The API 37 instrumentation suite passed.' >> "$GITHUB_STEP_SUMMARY"
