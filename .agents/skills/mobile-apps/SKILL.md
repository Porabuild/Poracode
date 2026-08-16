---
name: mobile-apps
description: Develop Poracode's mobile clients — the adaptive mobile web/PWA layout in the renderer, the native iOS SwiftUI app, and the native Android Compose app. Use whenever a task mentions mobile, iOS, Android, PWA, compact layout, SwiftUI, Jetpack Compose, pairing, push notifications, Live Activities, the remote-v3 contract, or changing UI that must stay in parity across mobile platforms. Explains the three-surface architecture, mobile-vs-desktop web scoping, per-platform design languages, the enforced parity ledger, contract codegen, dev runners, and verification.
---

# Mobile Apps — Poracode

Poracode ships **three mobile client surfaces**. They share behavior, feature vocabulary, and the remote-v3 wire contract — but **not** UI code:

| Surface          | Stack                                  | Location                                                    | Design language                    |
| ---------------- | -------------------------------------- | ----------------------------------------------------------- | ---------------------------------- |
| Mobile web / PWA | React, same renderer as desktop        | `src/renderer` (compact layout)                             | Poracode PWA patterns + HeroUI v3  |
| iOS app          | Swift 6 / SwiftUI, native (no WebView) | `ios/App` (`App`, `AppTests`, `PoracodeActivities` targets) | Apple HIG, native SwiftUI controls |
| Android app      | Kotlin / Jetpack Compose               | `android/`                                                  | Material 3                         |

The native apps **do not embed the web renderer**. They are independent native applications speaking the remote-v3 protocol to a desktop/headless host. The mobile web client is a _behavior and interaction reference_ for them, never a code source.

Authoritative runbook: **`docs/MOBILE_DEV.md`** (toolchains, runners, pairing, dev host). Release: **`docs/RELEASE_MOBILE.md`**. System shape: **`docs/REMOTE_ARCHITECTURE.md`**.

## Scope discipline: "mobile web" is not "web"

One renderer serves Electron desktop, desktop browsers, and mobile. There is **no separate mobile app tree** (the old `src/mobile` is gone). Mobile layout is the _compact_ presentation of the shared tree:

- **TSX:** gate with `useCompactLayout()` from `src/renderer/adaptiveLayout.ts` (viewport ≤ 767px, web clients only).
- **CSS:** gate with `html[data-compact-layout]`, `[data-coarse-input]` (touch), `[data-mobile-standalone]` (installed PWA) in `src/renderer/styles.css`.
- Electron desktop **never** enters compact layout (`window.poracodeHost` is set there), but it _does_ share every component you touch.

Rules:

- Task scoped to _mobile_: change only compact-gated branches and compact CSS blocks. Do not restyle or restructure the shared/desktop path of a component as a side effect.
- Task scoped to the _web client as a whole_: shared changes are in scope, but verify both presentations (resize across the 767px boundary) before finishing.
- Mobile-specific building blocks live in `src/renderer/components/mobileComposer/`; PWA plumbing (install, push, service worker, device id, port forward) in `src/renderer/pwa/`; remote-browser bridge and offline cache in `src/renderer/browser/`; pairing UI in `src/renderer/views/MainView/parts/BrowserConnectionPage/`.

## Per-platform design languages

Behavior and layout logic stay in parity; **visual expression is idiomatic per platform**. Never port web CSS to native, never clone iOS styling on Android, never introduce Material patterns on iOS.

- **iOS:** follow the Human Interface Guidelines. Use native SwiftUI navigation, sheets, context menus, SF Symbols, system typography/spacing, and platform conventions (swipe actions, haptics). Feature modules live in `ios/App/App/Features/<Name>/`.
- **iOS menu color:** keep ordinary menu and drawer actions neutral. Use plain button styling plus primary text and secondary symbols; setting label foreground styles alone does not reliably override SwiftUI's default blue `Button` tint. Keep destructive actions semantically destructive, with red text and a neutral secondary symbol unless the product design explicitly calls for a red symbol. Use accent color only when it communicates an intentional semantic state, such as a selected checkmark, not as the default menu treatment.
- **iOS drawers:** use native `.sheet` surfaces with `.insetGrouped` lists through `poracodeDrawerListStyle()` in `Features/Components/GlassHelpers.swift`. Let SwiftUI own presentation backgrounds, safe areas, and sheet corner treatment; do not add transparent presentation backgrounds or nested rounded surface containers. The shared modifier owns standard scroll-content margins, including bottom clearance. Size compact detents so every section plus that clearance is visible. Use `NavigationLink` inside one `NavigationStack` for drawer sublevels so they get native push/back animation instead of stacking another sheet or replacing content without a transition.
- **Android:** follow Material 3 with Compose. Theme lives in `android/app/src/main/kotlin/com/poracode/app/ui/theme/`; feature packages in `.../ui/<name>/`.
- **Mobile web:** follow the existing compact-layout patterns in `styles.css` and HeroUI v3 (load the `heroui-react` skill first). Reuse established shared components and visual recipes; do not invent bespoke one-off treatments.

## Feature and layout-logic parity (the default, not an option)

When you add or change a feature, screen, flow, or interaction rule on one platform, the same capability must land on the other two mobile surfaces — expressed in each platform's native idiom. Concretely:

1. **Feature modules mirror by name** across `ios/App/App/Features/<Name>` ↔ `android/.../ui/<name>` (+ matching `Transport`/`transport` layers) ↔ the renderer's compact surfaces. Put counterpart code in the mirrored module.
2. **The parity ledger is enforced.** `protocol/remote/v3/native-parity.json` records a disposition (`implemented` / `planned` / `desktop-only` / `unsupported-by-wire`) with evidence file paths for every HTTP route and socket event, per platform. `native-parity.test.ts` fails when it drifts. Any wire-facing change must update the ledger in the same change.
3. If the user explicitly scopes work to one platform, deliver that platform, mark the others `planned` in the ledger (when wire-facing), and **name the parity gap explicitly in your final report** so it is a visible follow-up, not a silent divergence.
4. Genuine platform-capability differences are allowed but must be _recorded_, not silently skipped — e.g. Live Activities exist only on iOS (`ios/App/PoracodeActivities/`); Android push is plain FCM notification messages. Express such gaps as ledger dispositions (`desktop-only` / `unsupported-by-wire`) or an explicit note.
5. Parity includes **localization**: web via Lingui (12 non-English catalogs — follow the i18n section of `CLAUDE.md`), iOS via `.xcstrings` catalogs (`ios/App/App/Resources/` and per-feature files), Android via `values-<locale>/strings.xml`. A user-facing string added on any platform is localized on that platform in the same change, across the same locale set.

## Transcript rendering: one definition per tool call, never four

All clients must render the chat transcript the same way (same items, same grouping, same information per tool call — expressed in each platform's widgets). The layering that makes this possible without reimplementing every tool on every platform:

1. **Normalization is already single-source.** Provider adapters (`src/supervisor/agents/*/canonicalMapping.ts`) translate provider-native payloads into the canonical vocabulary of `src/shared/contracts/runtimeEvent.ts` once, host-side. Clients only ever see canonical items. Never move provider- or tool-specific interpretation into a client.
2. **Reducers/grouping are per-platform but fixture-pinned.** `runtimeEventReducer.ts` (renderer), `RuntimeEventReducer.swift`, and `RuntimeEventReducer.kt` are three hand-written implementations whose behavior is locked to the shared fixtures in `protocol/remote/v3/fixtures/` (`rich-*.json`, `runtime-events.json`), loaded by all three test suites directly from the repo. Any change to decoding, nesting, hiding, grouping, or text-extraction semantics starts with a fixture change, then updates all three reducers until all three suites are green. Never change one reducer alone.
3. **Per-tool-kind presentation logic must not be forked into Swift/Kotlin.** The renderer's per-tool branches (`ChatPane/parts/items/toolDisplay.ts`, `toolCallCategorization.ts`, dedicated cards like `FileChange`, `CommandExecution`) are the reference semantics. The native apps deliberately render a generic activity card instead of cloning that table. When closing this richness gap, the direction is **host-computed presentation**: derive a small, closed vocabulary of generic presentation blocks (title, icon token, category, and sections such as diff / terminal output / key-value args / markdown / table / image) once in shared TS, ship it over the wire, and have each client implement only the closed block vocabulary. Then a new tool call is one host-side mapping, zero client changes.
4. **Adding a new tool-call kind** therefore means: map it in the supervisor's canonical mapping; give it display metadata in the shared/host-side presentation layer (renderer's `toolDisplay.ts`/categorization today); add a shared fixture item so all platforms' reducer tests cover it. It must **not** mean writing a bespoke Swift or Kotlin card for that specific tool — if a client can't express it, extend the generic block vocabulary (a rare, parity-gated, fixture-pinned change across all three clients), not the per-tool code.

## Shared remote-v3 contract (the only shared code boundary)

- Canonical contract source: `src/shared/remote/contract/` (TypeScript). Fixtures, the contract inventory (`manifest.json`), parity ledger, and **committed** generated artifacts: `protocol/remote/v3/`.
- Generated Swift lives in `ios/App/App/Protocol/Generated*.swift`; generated Kotlin in `android/.../protocol/Generated*.kt`. **Never hand-write or fork protocol types in either native app.**
- After an _intentional_ contract edit: `pnpm run protocol:remote:v3:generate`, then always `pnpm run protocol:remote:v3:check` and `pnpm exec vitest run --configLoader runner protocol/remote/v3`.
- The wire protocol is a versioned compatibility boundary — apply the checklist in `.agents/docs/versioning.md`. Native apps version/hash-check their committed bindings at startup, and old installed mobile apps keep talking to new hosts.

## Dev workflows

- `pnpm run dev:ios` — builds, installs, launches on the iOS 26.5 simulator and stays watching; Swift function/`body` edits hot-inject into the running app (InjectionNext, auto-fetched into `.tmp/`).
- When InjectionNext is already running, do not rebuild/relaunch after every eligible Swift or SwiftUI body edit. Save the change, allow injection to apply, then verify against the live app. Rebuild only for structural changes InjectionNext cannot load, an injection failure, or an explicit/final compile check.
- `pnpm run dev:android` — same for the `poracode-pixel9-api37` emulator; Kotlin-only saves hot-apply via ART Apply Changes, structural changes fall back to incremental APK install. `-- --once` for a single run.
- `pnpm run dev:web` — serves only the PWA on port **3101** against an already-running desktop app (desktop dev renderer stays on 3100). `pnpm run dev:web:server` — separate headless remote host when needed.
- Toolchains: Xcode 26.6 (iOS 26.5 SDK; deployment target iOS 17); JDK 21 + `platforms;android-37.0` / `build-tools;37.0.0` (minSdk 26). Pairing, deep links, and dev-host env vars: see `docs/MOBILE_DEV.md`.
- **Capacitor is fully removed** (dependencies, `cap:*` scripts, configs, shell code). Never reintroduce `@capacitor/*` packages or shell-era workflows. The one intentional legacy reference is the `capacitor://`/`ionic://` origin allowlist in `src/main/remote/server/security.ts`, kept only so already-installed shell builds keep pairing — leave it alone.

## Verification

- Cross-platform E2E: `pnpm run native:e2e` (config `tests/native-e2e/`), with `native:e2e:mock-host` / `native:e2e:real-host` harnesses.
- Contract + parity: `pnpm exec vitest run --configLoader runner protocol/remote/v3`.
- Android: `cd android && ./gradlew testDebugUnitTest lintDebug --no-daemon` (wrapper is checked in; needs JAVA_HOME/ANDROID_HOME).
- iOS: `AppTests` target; `NativeE2ETests` for the E2E harness.
- Mobile web: normal `pnpm exec vitest run` on touched files, plus the `interactive-testing` skill for renderer surfaces. For simulator-level web checks, `xcrun simctl` screenshots and `idb` touch injection work headless.
- CI: `.github/workflows/native-ci.yml` is the required PR gate for native changes (iOS AppTests on simulator, Android unit + lint + instrumentation on API 37, headless-host smoke).

## Releases

- Native apps: `.github/workflows/release-mobile.yml`, triggered by a `mobile-vX.Y.Z` tag or manual dispatch; builds and signs both apps directly — no web build involved. Process and evidence requirements: `docs/RELEASE_MOBILE.md`.
- Hosted PWA (`app.poracode.com`, nightly `app-nightly.poracode.com`): separate `release-pwa.yml` / `deploy-nightly-pwa.yml` workflows; not an input to native store builds.
- Do not claim push, Live Activities, or universal links work from configuration alone — `docs/RELEASE_MOBILE.md` requires device-tested evidence.

## Platform gotchas worth knowing up front

- **iOS web viewport:** in Safari browser mode, only _document-level_ scrolling collapses the toolbar; inner `overflow` scrollers letterbox forever, `position: fixed` roots clip at the dynamic-viewport line, and `env(safe-area-inset-*)` is 0 by design. The compact CSS in `styles.css` already encodes these lessons (`100lvh`/`svh` math, `data-mobile-standalone` gating) — extend the existing blocks rather than fighting them.
- **Android WebView quirks are history** — the Android app is fully native now; do not resurrect Capacitor-era workarounds.
- **Live Activities** (`ios/App/PoracodeActivities/`) and push (`src/main/remote/push/` host side, `src/renderer/pwa/push/` web side, native per-platform registrations) are per-platform feature surfaces: a push/notification change is a three-surface parity change plus the host.

## Checklist before finishing mobile work

- [ ] Change is gated at the right layer (compact-only vs shared vs native) — desktop web untouched unless in scope.
- [ ] Counterparts implemented on the other mobile surfaces, or the gap is recorded (`planned` in `native-parity.json` when wire-facing) and called out in the final report.
- [ ] Contract regenerated + `protocol:remote:v3:check` green if the contract changed; no hand-written protocol types added.
- [ ] Every new user-facing string localized on each touched platform (Lingui catalogs / `.xcstrings` / `values-*`).
- [ ] Visuals follow the platform's design language (PWA patterns + HeroUI / HIG / Material 3).
- [ ] No per-tool-call presentation logic added to a single client: tool semantics live in the shared canonical/presentation layer; transcript semantics changes came with a shared fixture and all three reducer suites green.
- [ ] Relevant suites run: platform unit tests, `protocol/remote/v3` vitest, `native:e2e` when the wire or session flows changed.
