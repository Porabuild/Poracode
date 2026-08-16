# Live Activities & Dynamic Island for the native mobile apps

> Superseded by the native SwiftUI implementation (`ios/App/PoracodeActivities/`); the Capacitor approach below is historical.

**Date:** 2026-07-02
**Status:** Draft
**Depends on:** Capacitor native shells (`capacitor.config.json`, `docs/RELEASE_MOBILE.md`), remote access protocol (`docs/REMOTE_ARCHITECTURE.md`)

## Goal

Show running conversations on the iOS lock screen and Dynamic Island: a live
card with the thread title, project, status (`Running` / `Needs input` /
`Done`), and elapsed time — updated in real time while the phone is locked and
the app is not running. This also delivers the P0 backlog item from
`docs/REMOTE_ARCHITECTURE.md` (background push on turn complete / needs input),
because Live Activity updates and plain push notifications share all the same
plumbing.

**Non-goal:** any of this for the hosted/installed PWA. WebKit exposes no
ActivityKit surface to web apps; the PWA ceiling is Web Push (tracked
separately). Live Activities require the Capacitor iOS app.

## Why the architecture already fits

- Live Activities are **updated entirely via APNs** (`liveactivity` push type)
  — the app does not need to run. Since iOS 17.2 they can also be **started**
  via push (`push-to-start`), so a conversation launched on the desktop can
  appear on the lock screen without the phone's app ever being opened.
- The supervisor is already the single emitter of `thread-state` transitions
  (`src/supervisor/runtime/threadSessionManager.ts`,
  `threadOutputPipeline.ts` → `ThreadStatus` / `ThreadAttention` in
  `src/shared/contracts/common.ts`). Those are exactly the Live Activity
  events; nothing new must be observed, only routed.
- The pairing/bearer-token model in `RemoteAccessServer` gives us an
  authenticated per-device channel to register push tokens against.

## Components

### 1. iOS widget extension (new Swift target)

Live Activity UI is always SwiftUI — even in a Capacitor app the lock-screen
card and Dynamic Island presentations cannot be web-rendered.

- New extension target `PoracodeActivities`. The `ios/` project is not
  committed (it's generated via `npx cap add`), so the extension's Swift
  sources live in-repo under `native/ios/PoracodeActivities/`;
  `scripts/configure-mobile-native.mjs` copies them into the generated
  project, and creating the extension target is a documented one-time Xcode
  step (`docs/RELEASE_MOBILE.md`) — pbxproj target injection via regex is
  too fragile to automate.
- One `ActivityAttributes` type:

  ```swift
  struct DesktopSessionAttributes: ActivityAttributes {
    // fixed at start
    let desktopId: String
    let desktopName: String        // e.g. hostname, shown as the card header

    struct ContentState: Codable, Hashable {
      var runningCount: Int
      var threads: [ThreadRow]     // top ~3, most-recently-active first
      struct ThreadRow: Codable, Hashable {
        var threadId: String
        var title: String
        var project: String
        var status: String         // "working" | "needs_approval" | "needs_reply" | "idle" | "finished" | "error"
        var startedAt: Date        // drives the elapsed timer via timerInterval
      }
    }
  }
  ```

- **One activity per paired desktop, not per thread.** This matches the
  mock ("1 conversation running" + thread rows), avoids iOS's activity-count
  ceiling, and means concurrent threads don't fight over the Dynamic Island.
  The content state carries up to ~3 thread rows plus a total count
  (APNs payload cap is 4 KB).
- Presentations: compact = app glyph + status dot (green working / amber
  attention); minimal = status dot; expanded & lock screen = header row
  (`desktopName`, running count) + thread rows with status and
  `Text(timerInterval:)` elapsed timers, exactly the mock's layout.

### 2. Capacitor plugin `@poracode/activity-bridge` (local plugin)

Thin Swift bridge between the web layer and ActivityKit. Lives in the repo
(local Capacitor plugin), no behavior on Android/web (no-op stubs).

API surface (JS side, consumed from the canonical renderer's native adapter):

- `getPushToStartToken(): Promise<string | null>` — iOS 17.2+; observes
  `Activity<DesktopSessionAttributes>.pushToStartTokenUpdates`.
- `startActivity(attributes, contentState): Promise<{ activityId }>` —
  fallback path when push-to-start is unavailable (16.2–17.1) and the app is
  foregrounded when a thread starts.
- `onActivityTokenUpdate(cb)` — streams per-activity update tokens
  (`activity.pushTokenUpdates`); these are distinct from the regular device
  token and rotate.
- `endActivity(activityId, finalState)`.
- Plus the standard `@capacitor/push-notifications` plugin for ordinary
  alert pushes (APNs device token) — same registration flow below.

### 3. Token registration on the desktop (`RemoteAccessServer`)

New authenticated endpoints (bearer session, gated on the existing
`session:operate` scope — a new scope would strand already-paired devices,
which were issued the standard scope set at pairing time):

- `POST /api/push/register` — body: `{ platform: "ios", deviceToken?,
pushToStartToken?, activityTokens?: Record<activityId, token> }`.
  Upserts into a per-paired-device record persisted in settings
  (keyed by the pairing's device identity, surviving token rotation).
- `DELETE /api/push/register` — on sign-out/unpair; also pruned when APNs
  reports `410 Unregistered`.

The iOS native shell re-registers on launch and whenever ActivityKit rotates a
token (tokens rotate; treat registration as idempotent upsert).

### 4. `PushCoordinator` (new module, `src/main/remote/push/`)

Subscribes to the same supervisor `thread-state` stream the remote WS fans
out, and maps transitions to pushes per registered device:

| Transition                              | Action                                                                                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| first thread → `working`                | start desktop-session activity (push-to-start token, `event: "start"`)                                                                                              |
| any thread state change while ≥1 active | `event: "update"` with rebuilt `content-state`                                                                                                                      |
| `needs_approval` / `needs_reply`        | update with APNs priority 10 + `alert` in the Live Activity payload (breaks through immediately); also send a normal alert push for devices without a live activity |
| thread `finished` / `error`             | update; regular alert push ("Run v0.3.7 release check finished")                                                                                                    |
| last active thread ends                 | `event: "end"` with `dismissal-date` ~15 min out                                                                                                                    |

Debounce updates (coalesce to ≤1 update per activity per few seconds, use
APNs priority 5 for non-urgent ticks) — Live Activities have a per-app update
budget and iOS throttles abusers.

Provider-agnostic: the coordinator consumes only `ThreadStatus` /
`ThreadAttention` — no provider-specific branching.

### 5. Push gateway (small hosted service — the one genuinely new piece)

The desktop app cannot talk to APNs directly: that requires the team's APNs
auth key (`.p8`), which is a secret and cannot ship inside the desktop app.
So a minimal stateless gateway, operated alongside the hosted PWA
(same Vercel project), holds the key:

- `POST /v1/push` — body: `{ token, pushType: "liveactivity" | "alert",
payload, priority }`. Signs the APNs JWT, forwards to
  `api.push.apple.com`, relays the status (so the desktop can prune `410`s).
- No accounts: possession of a valid APNs token _is_ the capability (tokens
  are device-generated, unguessable, and useless for any other app id).
  Rate-limit per token and per IP; reject payloads > 4 KB.
- The relay (`relayProtocol.ts`) stays untouched — it remains a dumb tunnel,
  and self-hosted relay users still get push because the desktop calls the
  gateway directly (outbound HTTPS), independent of how the canonical client
  reaches the desktop.

Privacy: content states carry thread titles and project names through the
gateway and APNs. Add a desktop setting **"Redact remote notification
content"** that replaces titles with generic text ("A conversation needs
input") in push payloads; the WS-connected foreground app still shows full
detail.

## Delivery phases

1. **Phase 0 — plain push (ships the P0 backlog item on its own):**
   gateway + `POST /api/push/register` + `PushCoordinator` sending `alert`
   pushes via `@capacitor/push-notifications` on `finished` /
   `needs_attention`. No Swift beyond the standard plugin. Testable
   end-to-end with TestFlight.
2. **Phase 1 — Live Activities, app-started:** widget extension +
   `activity-bridge` plugin; activities started from the foregrounded app,
   updated/ended via push. Covers iOS 16.2+.
3. **Phase 2 — push-to-start + polish:** 17.2+ remote start, coalescing/
   budget tuning, Dynamic Island expanded layout, redaction setting.
4. **Phase 3 — Android (simplified; user-confirmed 2026-07-02):** no native
   Android code. The desktop sends FCM **notification** messages
   (auto-rendered by the OS; delivered in-app when foregrounded, so no
   double-notify) with `collapse_key` + notification `tag` = threadId, so
   successive status pushes for a thread replace each other in the tray —
   an evolving one-notification status card ("Running" → "Needs your
   input" → "Finished"). A true ongoing live card (custom
   `FirebaseMessagingService`, Android 16 Live Updates `ProgressStyle`)
   remains a possible later increment; it was cut because it is the one
   genuinely fragile piece (dual FCM services, uncommitted `android/`
   project) for ~10% additional value.

## Constraints & risks

- **Duration caps:** 8 h Dynamic Island / 12 h lock screen per activity.
  Long-running sessions: end + re-start the activity via push-to-start when
  nearing the cap (17.2+), else let it lapse into a regular notification.
- **Update budget:** heavy-update activities get throttled; the debounce in
  `PushCoordinator` is load-bearing, not cosmetic.
- **iOS floors:** Live Activities 16.2+, push-to-start 17.2+ — set the
  Capacitor deployment target accordingly and gate the bridge at runtime.
- **Apple accounts/ops:** APNs `.p8` key in release secrets; widget extension
  needs its own provisioning; `finalize-web-build.mjs` /
  `configure-mobile-native.mjs` grow steps for the extension target.
- **Desktop offline:** if the desktop dies mid-run no `end` push arrives;
  set `staleDate` on every update so iOS visually marks the activity stale,
  and have the gateway reject nothing — recovery is desktop-side on
  reconnect.
