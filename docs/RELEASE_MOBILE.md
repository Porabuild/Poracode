# Native mobile release

Poracode ships two independent native mobile clients:

- `ios/App/App.xcodeproj` is a Swift 6 and SwiftUI application.
- `android/` is a Kotlin and Jetpack Compose application.

Neither app embeds `dist/web`, starts Vite, or runs the React renderer in a
WebView. The hosted PWA has its own release workflow and is not an input to the
native store binaries. Both native apps retain the store identifier
`com.lightcodeapp.mobile`.

Capacitor is fully removed — dependencies, scripts, configuration files, and
both webview shells. It must not be reintroduced; the native projects are
hand-maintained. `pnpm run dev:ios` and `pnpm run dev:android` invoke the native
watch/reload runners; append `-- --once` for a one-shot build/install/launch.

## Supported platform baselines

| Client  | Build toolchain                   | Build target                    | Minimum OS |
| ------- | --------------------------------- | ------------------------------- | ---------- |
| iOS     | Xcode 26.6 with the iOS 26.5 SDK  | Swift 6 / native iPhone archive | iOS 17     |
| Android | JDK 21, AGP 9.3.1, build-tools 37 | Android 17 / API 37             | API 26     |

There is no iOS 26.6 SDK: Xcode 26.6 is intentionally paired with the iOS 26.5
device and simulator SDKs. Android compiles and targets API 37 while retaining
`minSdk = 26`.

## Remote-v3 release status

`protocol/remote/v3/manifest.json` is the canonical cross-client inventory. It
currently declares protocol v3 with 56 HTTP routes, 100 supervisor procedures,
8 client WebSocket messages, and 9 server WebSocket messages.

The generator currently commits these normalized artifacts:

- `protocol/remote/v3/generated/inventory.json`
- `protocol/remote/v3/generated/ir.json`
- `protocol/remote/v3/generated/json-schema.bundle.json`
- `protocol/remote/v3/generated/native/native-bindings.json`
- manifest-listed Swift and Kotlin sources under
  `protocol/remote/v3/generated/native/{swift,kotlin}`

The inventory records protocol version, generator version, binding-format
version, source hash, and manifest hash. Binding format v2 is independent of
wire protocol v3 and must be reviewed and bumped when the generated IR shape
changes.

Both apps compile the manifest-listed generated bundle as production source.
The iOS target uses an Xcode file-system-synchronized source group and bundles
the native manifest for a startup version check. Android adds the generated
Kotlin directory to its main source set and runs a pre-build manifest/version/
membership check. Stable app-owned facades keep hash-derived generated names out
of UI and domain state while validating the HTTP and WebSocket boundaries that
are currently implemented.

The bundle contains roots for all 56 routes, 100 procedures, and 17 WebSocket
message types. The native parity ledger
(`protocol/remote/v3/native-parity.json`) records 200 implemented entries and 1
unsupported-by-wire entry on each platform; `push-config` is the intentional
unsupported entry. A green binding or parity gate proves executable wire-schema
coverage and source freshness, not UI end-to-end proof, so native journey tests
remain the authority for whether an operation is actually user-accessible.

Check the committed contract before a release:

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm run protocol:remote:v3:check
pnpm exec vitest run --configLoader runner protocol/remote/v3
git diff --exit-code -- protocol/remote/v3/generated
```

Only run `pnpm run protocol:remote:v3:generate` after an intentional contract or
generator change. Never maintain a second complete protocol definition by hand
inside either native app.

## Pull-request gates

`.github/workflows/native-ci.yml` is the native pull-request gate. It currently
requires:

- synchronized remote-v3 generated artifacts and contract fixtures;
- 791 Android JVM unit tests, debug APK assembly, and lint against API 37;
- 9 connected instrumentation tests, install, and cold launch on an Android
  17/API 37 emulator;
- iOS `AppTests` (952 tests) on an iOS 26.5 simulator under Xcode 26.6; and
- the host-side native wire lab plus a real production headless-host smoke test.

The Android emulator job runs the native `androidTest` suite, including API 37
`ACCESS_LOCAL_NETWORK` and `POST_NOTIFICATIONS` runtime-permission deny, grant,
and revoke flows and push-extra consumption, then verifies install and cold
launch. These gates consume a fresh checkout of the committed corpus; the
current working tree's native sources are not covered until they are committed.
The native wire lab still does not drive complete SwiftUI or Compose feature
journeys. Treat real-host native UI coverage as a separate release gate.

Useful local equivalents are:

```bash
cd android
./gradlew clean testDebugUnitTest assembleDebug lintDebug --no-daemon --stacktrace

cd ../ios/App
xcodebuild test \
  -project App.xcodeproj \
  -scheme App \
  -destination 'platform=iOS Simulator,name=iPhone 17,OS=latest' \
  -parallel-testing-enabled NO
```

## Final native release evidence

The final iOS run used Xcode 26.6 build 17F113 and an iOS 26.5 simulator, with
the deployment floor still at iOS 17. The complete `AppTests` run executed 952
tests: 952 passed, 0 failed, and 0 skipped. A separate generic iOS device build
with signing disabled succeeded; this was a compile/build check, not a physical-
device test. The secure real-SwiftUI journey ran one XCUITest in 63.5 seconds:
1 passed, 0 failed, and 0 skipped. Across two harness hosts it recorded exactly
one send and one interrupt, 3 snapshots, 3 histories, WebSocket cursors
`1 -> 4 -> 5`, and one `resync-required`; the second host recorded 8 operations
and no send or interrupt. Secret scans were clean.

The final Android run used an Android 17/API 37 emulator, with `minSdk = 26`.
The complete JVM suite executed 791 tests: 791 passed, 0 failed, and 0 skipped.
`compileDebugKotlin`, `compileDebugAndroidTestKotlin`, and `lintDebug` passed.
Connected instrumentation executed 9 tests: 9 passed, 0 failed, and 0 skipped.
The real native journey recorded exactly one send, one interrupt, 3 snapshots,
4 histories, and 3 WebSocket connections with cursors `0 -> 8 -> 8`; it
observed one `resync-required` and no collision-host operations. The journey
exercised real `ACCESS_LOCAL_NETWORK` denial, grant, and **Try again** handling,
plus background reconnect, resynchronization, notification channels, and
disconnect. This is emulator evidence, not a physical-device result.

The host-side native harness passed 96 of 96 tests across 34 files. The principal
reproduction commands are:

```bash
pnpm run native:e2e
node scripts/native-e2e.mjs ios-ui

cd ios/App
xcodebuild build \
  -project App.xcodeproj \
  -scheme App \
  -destination 'generic/platform=iOS' \
  CODE_SIGNING_ALLOWED=NO

cd ../../android
./gradlew connectedDebugAndroidTest --no-daemon --stacktrace
```

These local simulator, emulator, and harness results do not establish physical-
device coverage, publication to either store, or delivery of untracked or
otherwise unpublished working-tree artifacts.

## Native release workflow

`.github/workflows/release-mobile.yml` builds the native projects directly. It
does not run a web build. A `mobile-vX.Y.Z` tag selects
both platforms and uses `X.Y.Z` as the store version. A manual dispatch can
select Android, iOS, or both and uses `package.json#version`. The workflow
derives a monotonic build number from the GitHub run number and attempt.

### Android

The `mobile-android` environment:

1. installs Android 17/API 37 and checks `compileSdk = 37`, `targetSdk = 37`, and
   `minSdk = 26`;
2. runs the 791 JVM unit tests and release lint;
3. builds a signed release AAB (the PR gate separately assembles a debug APK)
   and SHA-256 checksum; and
4. uploads the bundle as release evidence for 30 days.

Required signing secrets are:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

If `PLAY_SERVICE_ACCOUNT_JSON` is configured, the workflow also publishes the
AAB to the Google Play track in `PLAY_TRACK`, defaulting to `internal`. Without
that optional credential, the signed AAB remains a downloadable workflow
artifact and must be uploaded separately.

### iOS

The `mobile-ios` environment:

1. selects Xcode 26.6 and verifies both iOS 26.5 SDKs plus the iOS 17 deployment
   floor;
2. runs the 952 `AppTests` on an iOS 26.5 simulator;
3. archives and exports the native `App` scheme with automatic signing;
4. uploads the IPA, checksum, and dSYMs as release evidence; and
5. uploads the IPA to TestFlight.

Required secrets are:

- `APP_STORE_CONNECT_ISSUER_ID`
- `APP_STORE_CONNECT_KEY_ID`
- `APP_STORE_CONNECT_PRIVATE_KEY`
- `PORACODE_MOBILE_APPLE_TEAM_ID` (or the fallback `APPLE_TEAM_ID`)

The workflow deletes decoded Android and Apple signing material from its runner
after use.

## Verified links and hosted PWA

The native apps claim verified `https://poracode.com/`, `/pair`, and `/app`
links. `poracode://pair` remains a development fallback. Production verification
requires the matching Digital Asset Links and Apple app-site-association JSON to
be served without redirects from `https://poracode.com/.well-known/`.

The web build can generate those JSON documents from:

| Setting                                            | Purpose                           |
| -------------------------------------------------- | --------------------------------- |
| `PORACODE_MOBILE_APPLE_TEAM_ID`                    | Apple Developer Team ID           |
| `PORACODE_MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS` | Play signing SHA-256 fingerprints |
| `PORACODE_MOBILE_APP_ID`                           | Optional package ID override      |

Generating files in `dist/web` or deploying the PWA does not by itself prove
that the `poracode.com` origin serves the correct production documents. Verify
both URLs and OS-level link routing before release.

`.github/workflows/release-pwa.yml` and
`.github/workflows/deploy-nightly-pwa.yml` own the separately installable React
PWA. PWA success is not a substitute for a native build, test, or store release.

## Capabilities that must not be inferred from configuration

The iOS project has associated-domain/APNs entitlements, native APNs
registration and routing, and an ActivityKit extension. The Android project
includes `firebase-bom`/`firebase-messaging`, `PushRuntime` FCM token
registration, `PoracodeFirebaseMessagingService` native FCM routing, and API 37
notification/local-network runtime-permission instrumentation. These facts do
not establish end-to-end native push delivery. Likewise, the existence of
app-link declarations does not establish production domain verification. Do not
advertise native push, Live Activity updates, or verified links as complete
until device-level registration, delivery, tap routing, revocation, and
permission tests pass on release builds.

## Promotion checklist

Before promoting either native client:

1. Require the native CI gate and the selected release job to pass without
   skipped required work.
2. Confirm the contract inventory and every generated native binding bundle are
   current, version-compatible, and compiled into the app.
3. Exercise manual pairing, verified-link pairing, replacement confirmation,
   token exchange, reconnect, replay/resync, and explicit unpair against a real
   production host.
4. Exercise every remote-v3 capability exposed by the release, including real
   PTY and structured-provider paths. Do not describe unintegrated manifest
   entries as shipped features.
5. Test cold launch, background/foreground restoration, network changes, and
   long-running reconnect churn on the minimum and current OS versions.
6. Test phone/tablet layouts, rotation, Dynamic Type/font scaling,
   VoiceOver/TalkBack, keyboard navigation, and reduced-motion behavior.
7. Verify `poracode.com` association responses and installed-app routing with
   the production signing identities.
8. Verify store metadata, version/build numbers, signing identity, checksums,
   symbol upload, staged rollout settings, and rollback ownership.
9. Treat native push and Live Activities as separate release gates until
   device-level registration, delivery, tap-routing, and revocation evidence
   exists.

See `docs/MOBILE_DEV.md` for local development and
`docs/REMOTE_ARCHITECTURE.md` for transport and ownership boundaries.
