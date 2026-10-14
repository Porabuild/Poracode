---
name: mobile-apps
description: Guides changes to Poracode's mobile clients — the compact mobile web/PWA layout, the native SwiftUI iOS app, and the native Jetpack Compose Android app. Use when a task mentions mobile, iOS, Android, PWA, compact layout, SwiftUI, Compose, pairing, push notifications, Live Activities, the remote-v3 contract, or UI that must stay in parity across mobile platforms.
---

# Mobile Apps — Poracode

Poracode has three mobile client surfaces. They share behavior, feature
vocabulary, and the remote-v3 wire contract, but not UI code:

| Surface          | Stack                                | Location                                                    | Design language                   |
| ---------------- | ------------------------------------ | ----------------------------------------------------------- | --------------------------------- |
| Mobile web / PWA | React, same renderer as desktop      | `src/renderer` (compact layout)                             | Poracode PWA patterns + HeroUI v3 |
| iOS app          | Swift / SwiftUI, native (no WebView) | `ios/App` (`App`, `AppTests`, `PoracodeActivities` targets) | Apple HIG                         |
| Android app      | Kotlin / Jetpack Compose             | `android/`                                                  | Material 3                        |

The native apps do not embed the web renderer; they are independent apps
speaking remote-v3 to a desktop or headless host. The mobile web client is a
behavior and interaction reference for them, never a code source.

Runbooks: `docs/MOBILE_DEV.md` (toolchains and required versions, runners,
pairing, dev host), `docs/RELEASE_MOBILE.md` (release), and
`docs/REMOTE_ARCHITECTURE.md` (system shape).

## Scope: "mobile web" is not "web"

One renderer serves Electron desktop, desktop browsers, and mobile; there is no
separate mobile app tree. Mobile is the compact presentation of the shared tree:

- TSX: gate with `useCompactLayout()` from `src/renderer/adaptiveLayout.ts`
  (viewport ≤ 767px, web clients only).
- CSS: gate with `html[data-compact-layout]`, `[data-coarse-input]` (touch), and
  `[data-mobile-standalone]` (installed PWA) in `src/renderer/styles.css`.
- Electron desktop never enters compact layout (`window.poracodeHost` is set),
  but it shares every component you touch.

A task scoped to mobile changes only compact-gated branches and compact CSS;
do not restyle or restructure the shared/desktop path as a side effect. A task
scoped to the web client as a whole may change shared code, but verify both
presentations across the 767px boundary.

Mobile building blocks: `src/renderer/components/mobileComposer/`; PWA plumbing
(install, push, service worker, device id, port forward):
`src/renderer/pwa/`; remote-browser bridge and offline cache:
`src/renderer/browser/`; pairing UI:
`src/renderer/views/MainView/parts/BrowserConnectionPage/`.

## Platform design languages

Behavior and layout logic stay in parity; visual expression is idiomatic per
platform. Never port web CSS to native, clone iOS styling on Android, or bring
Material patterns to iOS. Before styling, read
[references/design.md](references/design.md) for the per-platform rules
(neutral icon and menu color, bottom thumb-reachable actions and the shared
components that implement them, drawers, tabs, density, and visual
verification).

## Feature parity is the default

When you add or change a feature, screen, flow, or interaction rule on one
platform, the same capability lands on the other two mobile surfaces in each
platform's idiom.

1. Feature modules mirror by name: `ios/App/App/Features/<Name>` ↔
   `android/.../ui/<name>` (plus matching `Transport`/`transport` layers) ↔ the
   renderer's compact surfaces.
2. The parity ledger is enforced: `protocol/remote/v3/native-parity.json`
   records a disposition (`implemented` / `planned` / `desktop-only` /
   `unsupported-by-wire`) with evidence paths for every HTTP route and socket
   event per platform, and `native-parity.test.ts` fails on drift. Any
   wire-facing change updates the ledger in the same change.
3. If the user scopes work to one platform, deliver that platform, mark the
   others `planned` when wire-facing, and name the parity gap in the final
   report.
4. Genuine platform differences are recorded, not skipped — e.g. Live
   Activities exist only on iOS (`ios/App/PoracodeActivities/`); Android push is
   plain FCM notification messages. Use ledger dispositions or an explicit note.
5. Parity includes localization: web via Lingui (see
   `.agents/docs/i18n.md`), iOS via `.xcstrings` catalogs
   (`ios/App/App/Resources/` and per-feature files), Android via
   `values-<locale>/strings.xml`. A user-facing string added on any platform is
   localized there in the same change, across the same locale set.

## Transcript rendering: one definition per tool call

All clients render the transcript the same way (same items, grouping, and
information per tool call) in their own widgets.

1. **Normalization is single-source.** Provider adapters
   (`src/supervisor/agents/*/canonicalMapping*`) translate provider payloads into
   the canonical vocabulary of `src/shared/contracts/runtimeEvent.ts`, host-side.
   Never move provider- or tool-specific interpretation into a client.
2. **Reducers are per-platform but fixture-pinned.**
   `src/renderer/state/slices/runtimeEventReducer.ts`,
   `ios/App/App/Protocol/RuntimeEventReducer.swift`, and
   `android/.../protocol/RuntimeEventReducer.kt` are locked to the shared
   fixtures in `protocol/remote/v3/fixtures/` (`rich-*.json`,
   `runtime-events.json`), which all three suites load directly. A change to
   decoding, nesting, hiding, grouping, or text extraction starts with a fixture
   change, then updates all three reducers until all three suites pass. Never
   change one reducer alone.
3. **Per-tool presentation is not forked into Swift/Kotlin.** The renderer's
   per-tool branches (`ChatPane/parts/items/toolDisplay.ts`,
   `toolCallCategorization.ts`, cards like `FileChange` and
   `CommandExecution`) are the reference semantics; native apps render a generic
   activity card. To close that gap, compute presentation on the host: a small,
   closed vocabulary of generic blocks (title, icon token, category, and
   sections such as diff, terminal output, key-value args, markdown, table,
   image) derived once in shared TS and sent over the wire, so each client
   implements only the block vocabulary.
4. **A new tool-call kind** means: map it in the supervisor's canonical mapping,
   give it display metadata in the shared presentation layer, and add a shared
   fixture item. It never means a bespoke Swift or Kotlin card; if a client
   cannot express it, extend the generic block vocabulary (a parity-gated,
   fixture-pinned change across all three clients).

## Remote-v3 contract

- Source of truth: `src/shared/remote/contract/` (TypeScript). Fixtures, the
  contract inventory (`manifest.json`), the parity ledger, and committed
  generated artifacts live in `protocol/remote/v3/`.
- Generated Swift: `ios/App/App/Protocol/Generated*.swift`; generated Kotlin:
  `android/.../protocol/Generated*.kt`. Never hand-write or fork protocol types
  in either app.
- After an intentional contract edit: `pnpm run protocol:remote:v3:generate`,
  then `pnpm run protocol:remote:v3:check` and
  `pnpm exec vitest run --configLoader runner protocol/remote/v3`.
- The wire protocol is a versioned compatibility boundary; apply
  `.agents/docs/versioning.md`. Native apps check their committed bindings at
  startup, and old installed apps must keep working with new hosts.

## Dev workflows

- `pnpm run dev:ios` builds, installs, and launches on the required iOS
  simulator and keeps watching; Swift function/`body` edits hot-inject through
  InjectionNext (fetched into `.tmp/`). While injection is running, save and
  verify against the live app instead of rebuilding; rebuild only for
  structural changes, an injection failure, or a final compile check.
- `pnpm run dev:android` does the same on the project emulator; Kotlin-only
  saves hot-apply via ART Apply Changes and structural changes fall back to an
  incremental APK install. `-- --once` runs once.
- `pnpm run dev:web` serves only the PWA (port 3101) against an already running
  desktop app, whose dev renderer stays on 3100. `pnpm run dev:web:server` runs
  a separate headless remote host when needed.
- Required Xcode, SDK, JDK, and Android SDK versions are enforced by
  `scripts/native-dev-ios.mjs` / `scripts/native-dev-android.mjs` and listed in
  `docs/MOBILE_DEV.md`.
- Capacitor is fully removed; never reintroduce `@capacitor/*` packages or
  shell-era workflows, and do not resurrect Android WebView workarounds. The one
  intentional legacy reference is the `capacitor://` / `ionic://` origin
  allowlist in `src/host/remote/server/security.ts`, kept so already-installed
  shell builds keep pairing — leave it alone.

## Verification

- Cross-platform E2E: `pnpm run native:e2e` (config `tests/native-e2e/`), with
  `native:e2e:mock-host` / `native:e2e:real-host` harnesses. Run it when the
  wire or session flows change.
- Contract and parity: `pnpm exec vitest run --configLoader runner protocol/remote/v3`.
- Android: `cd android && ./gradlew testDebugUnitTest lintDebug --no-daemon`
  (needs `JAVA_HOME`/`ANDROID_HOME`).
- iOS: the `AppTests` target; `NativeE2ETests` for the E2E harness.
- Mobile web: `pnpm exec vitest run` on touched files plus the
  `interactive-testing` skill for renderer surfaces. For simulator-level web
  checks, `xcrun simctl` screenshots and `idb` touch injection work headless.
- CI: `.github/workflows/native-ci.yml` is the required PR gate for native
  changes (iOS AppTests, Android unit + lint + instrumentation, headless-host
  smoke).

## Releases

- Native apps: `.github/workflows/release-mobile.yml`, triggered by a
  `mobile-vX.Y.Z` tag or manual dispatch; builds and signs both apps with no web
  build. Process and evidence: `docs/RELEASE_MOBILE.md`.
- Hosted PWA: separate `release-pwa.yml` / `deploy-nightly-pwa.yml` workflows;
  not an input to native store builds.
- Do not claim push, Live Activities, or universal links work from
  configuration alone; `docs/RELEASE_MOBILE.md` requires device-tested
  evidence.

## Platform gotchas

- **iOS Safari viewport:** in browser mode only document-level scrolling
  collapses the toolbar; inner `overflow` scrollers letterbox, `position: fixed`
  roots clip at the dynamic-viewport line, and `env(safe-area-inset-*)` is 0 by
  design. The compact CSS in `styles.css` already encodes this (`100lvh`/`svh`
  math, `data-mobile-standalone` gating); extend those blocks rather than
  fighting them.
- **Push and Live Activities** are per-platform surfaces: host side in
  `src/host/remote/push/`, web side in `src/renderer/pwa/push/`, plus native
  registrations. A push/notification change is a three-surface parity change
  plus the host.
