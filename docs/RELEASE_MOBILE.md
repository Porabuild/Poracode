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

`protocol/remote/v3/generated/manifest.json` is the canonical cross-client
inventory, generated from the contract registry
(`src/shared/remote/contract/`). It currently declares protocol version 12 with
67 HTTP routes, 108 supervisor procedures, 9 client WebSocket messages, 11
server WebSocket messages (including the admission-gated desktop-event
stream), and 16 replayable event types. (The `remote/v3` path
names the contract family; the protocol version inside the manifest is
authoritative and has moved past 3.)

The generator currently commits these normalized artifacts:

- `protocol/remote/v3/generated/manifest.json`
- `protocol/remote/v3/generated/inventory.json`
- `protocol/remote/v3/generated/ir.json`
- `protocol/remote/v3/generated/json-schema.bundle.json`
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

Pairing is generated (V5 item 5.2): the pairing state machine — deep-link
intent and confirmation, one-shot candidate fingerprinting and duplicate
policies, failure-phase recovery, and the scope-request guard — is rendered
from the single declarative spec
(`src/shared/remote/contract/pairingMachineSpec.ts`) into
`native/swift/PairingMachine.swift` and `native/kotlin/PairingMachine.kt` by
the same pipeline as the wire contract, byte-stable and CI-gated. The native
apps keep only thin facades; `native-bindings.json` formatVersion 2 declares
the machine, and older readers refuse it. The renderer pairing flow now
consumes the same spec executor (`shared/remote/contract/pairingMachine.ts`,
browser-safe since the fingerprint digest moved to the shared pure-TS
SHA-256): the web deep-link intake applies the executor's consumed-set
duplicate policy, and the connection-page and mobile-settings sheets drive
their direct in-app candidate decisions (candidate → begin pair →
commit/failure) through the executor's transition table.

The terminal-cursor reconciliation machine completes the 5.2 slice: the
baseline/output arbitration rules — stale watches, range validation,
pre-baseline buffering (units AND frame count), generation changes, gaps,
overlaps, and the bounded transcript tail — are declared once in
`terminalCursorMachineSpec.ts` and rendered into
`native/swift/TerminalCursorMachine.swift` and
`native/kotlin/TerminalCursorMachine.kt`. The hand-written iOS/Android
reconcilers are deleted; only the per-platform JSON frame decoders stay
hand-written. `native-bindings.json` formatVersion 3 declares both machines
(`counts.stateMachines: 2`); all four manifest pins moved with the bump
(iOS `GeneratedRemoteV3Contract`, the gradle `verifyRemoteV3NativeBindings`
pin, `GeneratedRemoteV3ManifestTest`, and `generate.test.ts`), and a v2
manifest is refused fail-closed.

mDNS discovery (V5 item P4) ships on the same bundle: a TLS-configured `lan`
or `tailnet` listener advertises `_poracode._tcp.local` with the certificate
fingerprint in its TXT record (off in loopback mode by default,
`PORACODE_REMOTE_MDNS` overrides). The native pairing screens list discovered
hosts behind explicit affordances (Android: Other-ways sheet; iOS: Add-host
"Nearby hosts") and fill the manual endpoint from a selection — discovery
never replaces the one-time credential. See the mDNS discovery section of
`REMOTE_ARCHITECTURE.md` for the decision table and the recorded follow-up
(enforcing the discovered fingerprint at the native TLS handshake).

The bundle contains roots for all 67 routes, 108 procedures, and 19 WebSocket
message types, and embeds each route's registry scopes in its
`RemoteRouteDescriptor`. The native parity ledger
(`protocol/remote/v3/native-parity.json`, format version 2) records two
independent claims per platform for every feature — never one blended
"parity" claim:

- `wire` — the native platform implements the protocol: the operation is
  encoded/decoded through the generated bindings and crosses the real HTTP or
  WebSocket transport. Dispositions: `implemented`, `planned`, `desktop-only`,
  `unsupported-by-wire`, each with production source evidence.
- `ui` — a user-visible native surface actually reaches the operation.
  Dispositions: `implemented`, plus `partial` (reachable in part only; the
  `note` must name the precise gap), `planned` (wire present, no UI surface
  yet), and `desktop-only` / `unsupported-by-wire` mirroring the wire claim.

The columns are maintained separately: flipping one must not flip the other.
The format-2 migration (2026-09-18, V5 plan item 5.4) kept every format-1
claim as the wire claim unchanged and seeded `ui` by mirroring it, with the
UI-surface subset of each evidence list as ui evidence; the committed
`migrationNote` in the ledger records this provenance, and
`native-parity.test.ts` enforces the column invariants (a UI claim cannot
outlive its wire claim, a `partial` claim must name its gap) plus a regression
migration of the previous format-1 shape. Do not read a green `wire` column as
"users can do this in the app": `thread-list` paging and `local-image-ticket`,
for example, are wire-`planned` on both natives, and wire-`implemented`
protocol plumbing (ping/pong, cursor acks, resync frames) has no UI of its
own.

Interactive terminal (V5 plan item 5.1): the `terminal-write`/`terminal-resize`
ui claims on both platforms cite the raw hardware-keyboard passthrough
(`TerminalRawKeyInput.swift`, `TerminalKeyAccessory.kt`) and carry a note that
on-screen (touch) typing remains line-buffered through the command field plus
the Ctrl-modifier key row (Ctrl+C, Ctrl+D, Ctrl+L, Esc, Tab, arrows). That is
the deliberate mobile compromise, not silent desktop parity.

The terminal cursor-sync v2 pair (`terminal-watch-baseline-ack`/`-chunk`) and
`background_tasks.changed` (session-scoped reduce, replace/drain semantics)
are wire-implemented on both natives (2026-09-12) with transport/runtime
evidence. The merged follow-up queue is fully adopted on both natives
(2026-09-12, `b142c8bc7`/`af5820991`): all eight queue procedures and the
`thread-follow-up-queue` replayable event are wire-implemented with
transport/runtime evidence and localized strings. Desktop live voice remains
experimental and has no native or remote surface: do not advertise voice
outside the experimental desktop toggle.

LAN discovery (mDNS/Bonjour pairing) remains out of scope until TLS for direct
connections lands (V5 batch 4 item 4.2): advertising unauthenticated hosts over
multicast before the transport can be pinned would widen the exact
first-pairing MITM window the Gate 6 work closes. Revisit discovery together
with the TLS fingerprint-pairing flow.

A green binding or parity gate proves executable wire-schema coverage, source
freshness, and the ledger's column invariants — not UI end-to-end proof. The
native journey tests below remain the authority for whether an operation is
actually user-accessible.

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
- Android JVM unit tests, debug APK assembly, and lint against API 37 —
  including the per-family journey tests in
  `android/app/src/test/kotlin/com/poracode/app/transport/NativeFamilyJourneyTransportTest.kt`
  (pair, thread steer, permission resolve, terminal write with the 5.1 raw-key
  sequences, git), which drive the production transports and generated bindings
  against a loopback HTTP peer;
- 9 connected instrumentation tests, install, and cold launch on an Android
  17/API 37 emulator — the wire-lab UI journey covering pairing, thread
  send/stop, resync, notifications, and disconnect;
- a dedicated minimum-SDK launch test on an Android 8/API 26 emulator;
- iOS `AppTests` on an iOS 26.5 simulator under Xcode 26.6 — including
  `TerminalRawKeyInputTests` for the interactive-terminal key encoding — plus
  the portable Swift contract suites;
- the `ios_ui` job: the real-SwiftUI pairing journey
  (`node scripts/native-e2e.mjs ios-ui`) on an iOS 26.5 simulator under the
  same Xcode 26.6 pin — it boots the mock wire lab, drives the fixed
  "Poracode Native E2E" simulator through pairing, thread send/interrupt, and
  resync against the control plane, and uploads the result bundle; and
- the host-side native wire lab plus a real production headless-host smoke test.

The Android emulator jobs run the native `androidTest` suite, including API 37
`ACCESS_LOCAL_NETWORK` and `POST_NOTIFICATIONS` runtime-permission deny, grant,
and revoke flows and push-extra consumption, plus a separate API 26 pairing-entry
launch test. They verify install and cold launch. These gates consume a fresh checkout of the committed corpus; the
current working tree's native sources are not covered until they are committed.
The native wire lab still does not drive complete SwiftUI or Compose feature
journeys. Treat real-host native UI coverage as a separate release gate.

Useful local equivalents are:

```bash
cd android
./gradlew clean testDebugUnitTest assembleDebug lintDebug --no-daemon --stacktrace

cd ..
xcodebuild test \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -destination 'platform=iOS Simulator,name=iPhone 17,OS=latest' \
  -derivedDataPath .tmp/ios-app-derived-data \
  -resultBundlePath .tmp/ios-app-tests.xcresult \
  -parallel-testing-enabled NO
```

## Final native release evidence

The final iOS run used Xcode 26.6 build 17F113 and an iOS 26.5 simulator, with
the deployment floor still at iOS 17. The complete `AppTests` run executed 1,149
tests: 1,148 passed, 0 failed, and 1 skipped. A separate generic iOS device build
with signing disabled succeeded; this was a compile/build check, not a physical-
device test. The secure real-SwiftUI journey ran one XCUITest in 63.5 seconds:
1 passed, 0 failed, and 0 skipped. Across two harness hosts it recorded exactly
one send and one interrupt, 3 snapshots, 3 histories, WebSocket cursors
`1 -> 4 -> 5`, and one `resync-required`; the second host recorded 8 operations
and no send or interrupt. Secret scans were clean.

The final Android run used an Android 17/API 37 emulator, with `minSdk = 26`.
The complete JVM suite executed 910 tests: 910 passed, 0 failed, and 0 skipped.
`compileDebugKotlin`, `compileDebugAndroidTestKotlin`, and `lintDebug` passed.
Connected instrumentation executed 9 tests: 9 passed, 0 failed, and 0 skipped.
The separate Android 8/API 26 minimum-SDK launch test also passed: 1 passed,
0 failed, and 0 skipped.
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

xcodebuild build \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -destination 'generic/platform=iOS' \
  -derivedDataPath .tmp/ios-generic-derived-data \
  CODE_SIGNING_ALLOWED=NO

cd android
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

1. installs Android 17/API 37, validates the Firebase client for
   `com.lightcodeapp.mobile`, and checks `compileSdk = 37`, `targetSdk = 37`, and
   `minSdk = 26`;
2. runs the 910 JVM unit tests and release lint;
3. builds a signed release AAB (the PR gate separately assembles a debug APK)
   and SHA-256 checksum; and
4. uploads the bundle as release evidence for 30 days.

Required Android release secrets are:

- `ANDROID_GOOGLE_SERVICES_JSON_BASE64`
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
2. runs the `AppTests` suite on an iOS 26.5 simulator (1,148 passed and 1 skipped
   in the final local evidence run);
3. archives and exports the native `App` scheme with automatic signing;
4. uploads the IPA, checksum, and dSYMs as release evidence; and
5. uploads the IPA to TestFlight.

Required secrets are:

- `APP_STORE_CONNECT_ISSUER_ID`
- `APP_STORE_CONNECT_KEY_ID`
- `APP_STORE_CONNECT_PRIVATE_KEY`
- `PORACODE_MOBILE_APPLE_TEAM_ID` (or the fallback `APPLE_TEAM_ID`)

The workflow deletes the decoded Android Firebase configuration, Android
keystore, and Apple signing material from its runner after use.

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
