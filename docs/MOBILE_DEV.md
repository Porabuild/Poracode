# Native iOS and Android development

Poracode has two independent mobile applications:

- `ios/App/App.xcodeproj` is a Swift 6 / SwiftUI application with the `App`,
  `AppTests`, and `PoracodeActivities` targets.
- `android/` is a Kotlin / Jetpack Compose application built with the checked-in
  Gradle wrapper.

They do not embed the web renderer and do not share UI or runtime code. They do
share the remote-v3 wire contract, feature boundaries, model vocabulary, and
state-flow conventions. The canonical contract and fixtures live under
`protocol/remote/v3/`; the mobile web client under `src/renderer` is a behavior
and interaction reference, not a native application entry point.

Capacitor is fully removed from this repository — dependencies, scripts,
configuration files, and both webview shells. Do not reintroduce it. The native
projects are hand-maintained: edit `ios/App/App.xcodeproj` and `android/`
directly. The `pnpm run dev:ios` and `pnpm run dev:android` scripts are
native-only runners.

For the PWA backed by an already-running desktop app, start only the browser
client:

```bash
pnpm run dev:web
```

This command serves only the PWA on port `3101`; it does not build or launch a
standalone remote server, and it leaves the desktop development renderer on
port `3100` untouched. When a separate headless development server is
intentionally needed, run `pnpm run dev:web:server` in its own terminal. That
server advertises the PWA at port `3101` by default.

## Required toolchains

- Node.js 24.10 or newer and the repository-pinned pnpm 11.2.2 for the remote
  host, contract generator, and foundation harness.
- Xcode 26.6. It contains the iOS 26.5 SDK; there is no iOS 26.6 SDK. The app's
  deployment target remains iOS 17.
- JDK 21 plus Android Studio / command-line tools with Android 17
  `platforms;android-37.0` and `build-tools;37.0.0`. The app's minimum SDK
  remains API 26.

Install the Android platform from the command line when needed:

```bash
sdkmanager "platforms;android-37.0" "build-tools;37.0.0"
```

The local Android 17 emulator convention is `poracode-pixel9-api37`. A physical
device is also supported.

## Check the shared remote contract

Generated remote-v3 artifacts are committed. Regenerate them only when the
contract changes, and reject stale output everywhere else:

```bash
pnpm install --frozen-lockfile
pnpm run protocol:remote:v3:generate  # only after an intentional contract edit
pnpm run protocol:remote:v3:check
pnpm exec vitest run --configLoader runner protocol/remote/v3
```

Never maintain a second hand-written protocol definition inside either mobile
project. Unknown forward-compatible fields are handled at the contract boundary;
security-sensitive discriminators remain strict.

## Run the native iOS app

From the repository root, build, install, and launch on an iOS 26.5 simulator:

```bash
pnpm run dev:ios
```

The runner stays open and watches the native app, Activity extension, Xcode
project, and generated Swift contract. On the first watch run it downloads and
checksum-verifies the pinned MIT-licensed InjectionNext helper into `.tmp/`.
Changes inside existing Swift function and SwiftUI `body` implementations are
compiled and loaded into the running simulator app. The app PID, `AppSession`,
navigation, and compatible SwiftUI state remain in place. The helper exits with
the runner when you press `Ctrl+C`.

Edits that change stored properties, type layout, function signatures, project
membership, resources, generated bindings, or the Activity extension cannot be
safely patched. The same command detects those cases (or a failed injection) and
automatically falls back to an incremental Xcode build, signed reinstall, and
relaunch without clearing Keychain or application data. A failed build leaves
the last working app installed and waits for the next change. Use
`pnpm run dev:ios -- --once` for one normal build/install/launch without the
watch helper.

The runner keeps simulator signing enabled because the app requires Keychain
entitlements. Alternatively, open `ios/App/App.xcodeproj`, select the `App`
scheme and an iOS 26.5 simulator, then Run. The command-line test gate is:

```bash
xcodebuild -version                         # Xcode 26.6
xcrun --sdk iphonesimulator --show-sdk-version  # 26.5

cd ios/App
xcodebuild test \
  -project App.xcodeproj \
  -scheme App \
  -destination 'platform=iOS Simulator,name=iPhone 17,OS=latest' \
  -parallel-testing-enabled NO
```

The app uses native SwiftUI lifecycle, navigation, Observation state, URLSession,
WebSocket transport, Keychain storage, and ActivityKit surfaces. Xcode owns app
installation and launch; no Vite server or WebView is involved.

## Run the native Android app

From the repository root, select or start an API 37 emulator, then build,
install, and launch the Compose application:

```bash
pnpm run dev:android
```

The runner stays open and watches the main Android source set, Gradle/Firebase
configuration, and generated Kotlin contract. Kotlin-only saves use Gradle's
incremental compiler and the pinned Google APK deployer to apply changed DEX
method bodies to the running ART process. Compose's Apply Changes integration
then invalidates the affected groups, so compatible UI edits render with the
same process and state. No Android Studio window or commercial plugin is
required; the deployer artifact is downloaded once through the normal Gradle
cache.

Changes to class structure, fields, signatures, inheritance, manifests,
resources, native libraries, build configuration, or generated contract shape
fall back automatically to an incremental debug APK install and activity
relaunch without clearing app data. A failed build waits for the next change.
Press `Ctrl+C` to stop, or use `pnpm run dev:android -- --once` for one normal
run.

The equivalent manual build, test, lint, install, and launch commands are:

```bash
emulator -avd poracode-pixel9-api37

cd android
./gradlew clean testDebugUnitTest assembleDebug lintDebug --no-daemon
./gradlew installDebug --no-daemon
adb shell am start \
  -n com.lightcodeapp.mobile/com.poracode.app.MainActivity
```

The application uses Compose and Material 3, coroutines, OkHttp, Android
Keystore, and DataStore directly. Gradle builds native APK/AAB artifacts; it
does not copy `dist/web`.

## Previews versus the running app

Xcode Preview and Android Studio Compose Preview are design-time renderers, not
the hot-update mechanism used by these commands. Xcode does not expose the app
target's Preview canvas as a supported standalone console service. Android's
`android studio render-compose-preview` CLI similarly delegates to an already
running Android Studio instance. Poracode's console runners instead patch the
real app on the selected simulator/emulator, which exercises actual navigation,
session state, networking, and platform integration. Preview-specific workflows
can still be used in either IDE when an isolated component canvas is preferable.

## Start a development remote host

The apps connect to the same production remote server used by desktop clients.
Use an isolated data directory so the development server cannot contend with a
running desktop app:

```bash
pnpm install --frozen-lockfile
pnpm run build:electron
pnpm run prepare:server-native

PORACODE_BASE_DIR="$PWD/.tmp/poracode-native-dev" \
PORACODE_REMOTE_ACCESS_HOST=127.0.0.1 \
PORACODE_REMOTE_ACCESS_ADVERTISED_HOST=127.0.0.1 \
PORACODE_REMOTE_ACCESS_PORT=49152 \
node dist/main/server.cjs
```

The iOS simulator can reach the Mac loopback endpoint directly. For an Android
emulator, forward that same port before pairing:

```bash
adb reverse tcp:49152 tcp:49152
```

For a physical device, bind to `0.0.0.0`, advertise the Mac's reachable LAN or
VPN address, and allow the port through the local firewall:

```bash
PORACODE_BASE_DIR="$PWD/.tmp/poracode-native-dev" \
PORACODE_REMOTE_ACCESS_HOST=0.0.0.0 \
PORACODE_REMOTE_ACCESS_ADVERTISED_HOST=192.168.1.20 \
PORACODE_REMOTE_ACCESS_PORT=49152 \
node dist/main/server.cjs
```

Use HTTPS or a trusted VPN outside a private development network. The native
clients intentionally reject unsafe public cleartext endpoints.

## Pairing and deep links

The server prints a one-time pairing URL. Paste the complete URL into the native
onboarding screen. While that server remains running, a fresh machine-readable
link can be requested without parsing log output:

```bash
PORACODE_BASE_DIR="$PWD/.tmp/poracode-native-dev" \
node dist/main/server.cjs pair --json
```

Supported installed-app entry points are:

- verified `https://poracode.com/`, `/pair`, and `/app` links;
- the development fallback
  `poracode://pair?host=<percent-encoded-endpoint>&token=<one-time-token>`.

Open a prepared development link in the currently booted simulator/emulator:

```bash
xcrun simctl openurl booted "$PORACODE_PAIRING_URL"
adb shell am start -a android.intent.action.VIEW -d "$PORACODE_PAIRING_URL"
```

Do not commit, log, or attach pairing URLs: the token is a one-time credential.
External links are validated before an existing session is replaced, and the
native confirmation UI displays only a sanitized host.

Production universal/app links require the matching Apple associated-domain and
Android Digital Asset Links files at `poracode.com`. The custom scheme is a
development fallback, not proof that verified links are configured correctly.

## Foundation remote-host verification

The host-side native foundation suite covers the remote-v3 wire lab and a real
production headless host. Build the host first so the real-host smoke cannot be
silently skipped:

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm run codex-protocol:gen
pnpm run build:electron
pnpm run prepare:server-native
test -f dist/main/server.cjs
pnpm run native:e2e
```

This suite is transport evidence, not simulator/emulator UI evidence. A feature
is not complete until its native screen, lifecycle transitions, reconnect,
accessibility, and real remote-host flow have also been exercised on each OS.

## CI and releases

`.github/workflows/native-ci.yml` is the pull-request gate. It verifies committed
remote-v3 artifacts, runs AppTests on the iOS 26.5 simulator, and runs Android
unit tests, APK assembly, and lint against Android 17 / API 37. A required API 37
emulator lane then installs and launches the targetSdk 37 APK and requires
`connectedDebugAndroidTest` to pass. An empty or missing `androidTest` source set
is a failure, not a skipped success. The API 37 manifest declares
`ACCESS_LOCAL_NETWORK`; its native request/rationale/denial instrumentation is
part of this required platform gate. CI also builds `dist/main/server.cjs`
before the required foundation harness and rejects a skipped
real-production-host smoke.

`.github/workflows/release-mobile.yml` archives the SwiftUI app and builds the
Compose AAB directly. It never runs a web build.
Every tag/manual release first calls the complete required native CI workflow;
store jobs cannot start after a stale contract, failed real-host smoke, failed
AppTests, or failed API 37 gate. Release signing material is supplied only
through the protected `mobile-ios`/`mobile-android` GitHub environments and is
removed from the runner after use.

Before promoting a native release, verify at minimum:

1. Cold launch, foreground/background transitions, and restoration.
2. Manual pairing, verified-link pairing, replacement confirmation, reconnect,
   replay, and explicit unpair.
3. Every remote-v3 capability exposed by the app against a real host, including
   terminal and structured-provider paths.
4. Dynamic Type/font scaling, VoiceOver/TalkBack, keyboard navigation, rotation,
   and adaptive phone/tablet layouts.
5. Long-running foreground and background behavior for reconnect churn, CPU,
   memory, network use, and battery impact.

See `docs/REMOTE_ARCHITECTURE.md` for server and transport ownership.
