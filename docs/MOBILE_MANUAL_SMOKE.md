# Mobile Manual Smoke Test (PWA / iOS / Android)

Fast, deterministic manual smoke suite covering **every screen, modal/sheet, page, and key state** across all three Poracode mobile clients on **shared smoke data**.

- **Source of truth (`source main`)**: **Compact Mobile PWA** (`src/renderer` at viewport `<= 767px`).
- **Cross-platform rule**: iOS (SwiftUI) and Android (Jetpack Compose) execute the **exact same blocks and stages** against the **same running smoke host** (`WireLab`). Differences are noted only where native idioms or explicit parity dispositions apply.
- **Target pass time**: **~5–8 minutes per platform** (or **~12 minutes** running all 3 side-by-side per stage). Zero real AI turns, zero git/PR setup, zero external credentials.

---

## Quick Start (30 seconds)

Start the shared deterministic smoke host (and optionally the PWA dev server in one command):

```sh
# Option A: Smoke host + PWA dev server together (port 3101)
bun run smoke:mobile -- --with-pwa

# Option B: Smoke host only (if `bun run dev:web` is already running on 3101)
bun run smoke:mobile
```

On startup, the host immediately seeds the **`base` golden smoke snapshot** and prints **three simultaneous one-time pairing URLs**:

1. **PWA (source)**: Open the printed `http://127.0.0.1:3101/?host=...#token=...` URL in mobile viewport (e.g. iOS Safari Simulator, Android Chrome, or DevTools `390x844` touch emulation).
2. **iOS**: In the `smoke>` prompt, type `open ios` (runs `xcrun simctl openurl booted ...` on the booted Simulator with `bun run dev:ios -- --once`), or paste the `poracode://pair?...` URL.
3. **Android**: In the `smoke>` prompt, type `open android` (runs `adb reverse` + `adb shell am start` on the emulator/device with `bun run dev:android -- --once`), or paste the `poracode://pair?...` URL.

> **Speed tip (side-by-side mode):** Keep PWA, iOS Simulator, and Android Emulator open next to each other. Type a stage name once in `smoke>` (e.g. `tools`, `live`, `approval`) and verify all 3 clients in one glance before advancing.

---

## Stage Reference (`smoke>` prompt)

| Command                                                                                                                                   | Purpose                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `base`                                                                                                                                    | Golden baseline (auto-applied on boot; clears faults).                                          |
| `tools` / `patch` / `same-file` / `code` / `table` / `media` / `video` / `pdf` / `files` / `source-link` / `visuals` / `mcp-app` / `find` | Instant transcript state switches on the active fixture thread.                                 |
| `handoff` / `bg-progress` / `bg-drain`                                                                                                    | Provider switch/handoff and background tasks roster cycling.                                    |
| `live` / `live-done`                                                                                                                      | Stream live assistant turn + tool activity + pending steer + notifications.                     |
| `approval` / `question` / `elicitation` / `resolve`                                                                                       | Open and resolve interactive permission, question, and MCP elicitation prompts.                 |
| `sidechat`                                                                                                                                | Open Side Chat context and push a parent-thread update.                                         |
| `terminal`                                                                                                                                | Switch fixture thread to terminal mode and stream PTY output.                                   |
| `pr`                                                                                                                                      | Seed Pull Request creation, metadata, and AI PR guide.                                          |
| `workflow` / `workflow-waiting` / `workflow-failed` / `workflow-done`                                                                     | Cycle GitHub Actions / Workflow viewer states.                                                  |
| `keyboard` / `multihost`                                                                                                                  | Seed keyboard shortcuts workspace or start second host (`collision-b`; use `pair collision-b`). |
| `fault-error` / `fault-offline` / `fault-clear`                                                                                           | Inject changelog error, drop sockets / delay reconnect, then recover cleanly.                   |
| `pair` / `reset` / `status`                                                                                                               | Mint fresh tokens, reset to `base`, or inspect connected clients & active faults.               |

---

## Topological Walkthrough (PWA = Source of Truth)

Walk the blocks **in order** to avoid backtracking. Every step defines the canonical **PWA** check first, followed by **iOS / Android** parity notes only when chrome or behavior differs.

### Block 0 — Cold Launch, Onboarding & Pairing (`base`)

| #   | Screen / Modal / State             | PWA (Source Main)                                                                                                                    | iOS / Android Delta                                                   |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| 0.1 | **Cold launch / Unpaired state**   | Open `http://127.0.0.1:3101/` without token. Pairing page renders cleanly with no crash/blank screen and proper portrait safe areas. | Same on native Onboarding screen.                                     |
| 0.2 | **Validation / Invalid URL error** | Paste `not-a-url` and submit → inline validation error appears, no crash.                                                            | Same; Android also covers Local Network permission dialog when shown. |
| 0.3 | **Other ways / QR modal**          | Open QR / camera scan sheet or manual entry toggle → opens and dismisses cleanly.                                                    | iOS: "Nearby hosts" / QR sheet. Android: "Other ways" sheet.          |
| 0.4 | **Loopback 1-click pair**          | Open printed PWA pairing URL → pairs cleanly without error and lands on Home with `Fixture Project` & `thread-fixture-001`.          | `open ios` / `open android` auto-pairs loopback without consent stop. |

---

### Block 1 — Home Shell, Thread List, Filters, Search & Quick Compose (`base`)

| #   | Screen / Modal / State           | PWA (Source Main)                                                                                                                                                                                                                                                          | iOS / Android Delta                                                                        |
| --- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1.1 | **Home thread list**             | Flat cross-project list renders with project tag, status/timing badge, worktree badge, and floating bottom compose dock.                                                                                                                                                   | Same; check no overlap with top bar or bottom safe area.                                   |
| 1.2 | **Filter sheet & Empty states**  | Open Project/Status filter sheet → switch `Active` ↔ `Done` → verify Done empty/populated state → filter to a project → verify filtered empty state if no match → clear filter & close.                                                                                    | iOS: `Filter projects/threads` sheet + Done. Android: filter bottom sheet.                 |
| 1.3 | **Search / Command palette**     | Tap Search button → type fixture title → result matches → type `zzzzz` → empty-search state → dismiss.                                                                                                                                                                     | Same; verify keyboard opens and dismisses cleanly.                                         |
| 1.4 | **Thread context menu & Modals** | Long-press a thread row → verify action sheet opens. Check: **Rename** (inline/modal), **Star**, **Mark Done**, **Fork dialog** (open & cancel), **Move/Transfer dialog** (open & cancel), **Archive**, **Delete confirmation** (open & cancel).                           | Native context menu / bottom sheet; verify every destructive confirmation cancels cleanly. |
| 1.5 | **Quick Compose dock / sheet**   | Tap bottom compose dock to expand → verify **News banner** (from `news-ready`) → open & close **Project picker**, **Agent/Model/Effort/Permission pickers**, **Crews picker**, **Worktree toggle**, **Attachment/Camera sheet**, **Voice button** → collapse dock cleanly. | iOS/Android: Quick Compose sheet; verify keyboard lift and no bar overlap.                 |

---

### Block 2 — Thread Chat, Rich Transcript, Live Stream, Requests & Side Chat

Tap `thread-fixture-001` to open the Thread screen. Stay on this screen while stepping through the fast transcript stages in `smoke>`:

| #    | Stage                                  | Screen / Modal / State                 | PWA (Source Main)                                                                                                                                                                                                                                         | iOS / Android Delta                                                            |
| ---- | -------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 2.1  | `base`                                 | **History & Composer**                 | Authoritative history loads cleanly. Expand collapsed composer pill → type a message → send → composer collapses cleanly.                                                                                                                                 | Same; verify keyboard lift & bottom safe area.                                 |
| 2.2  | `tools`                                | **Tool cards & Disclosure**            | Command execution, file change, and tool cards render; expand/collapse tool disclosure details.                                                                                                                                                           | Native generic activity cards from canonical `toolPresentation` blocks.        |
| 2.3  | `patch` / `same-file`                  | **Multi-file patch & Same-file edits** | Multi-file patch (`patch`) and grouped same-file edits (`same-file`) render with readable diff hunks.                                                                                                                                                     | Same.                                                                          |
| 2.4  | `code`                                 | **Code blocks**                        | Syntax-highlighted fenced code block renders; copy button works.                                                                                                                                                                                          | Same.                                                                          |
| 2.5  | `table`                                | **Wide Markdown table**                | Wide table scrolls horizontally without breaking viewport width.                                                                                                                                                                                          | Same.                                                                          |
| 2.6  | `media` / `video` / `pdf`              | **Image, Video & PDF**                 | Inline image gallery + lightbox (`media`), video playback card (`video`), and PDF card/preview (`pdf`) open and dismiss cleanly.                                                                                                                          | Native media codecs/viewer may differ; confirm no crash or broken placeholder. |
| 2.7  | `files` / `source-link`                | **Editable files & Source links**      | Editable file citation (`files`) and clickable source file/line link (`source-link`) open preview/editor and return cleanly.                                                                                                                              | Same.                                                                          |
| 2.8  | `visuals` / `mcp-app`                  | **HTML visual & MCP App card**         | Embedded HTML visual (`visuals`) and MCP App card (`mcp-app`) render without layout overflow or console error.                                                                                                                                            | Native renders supported card / fallback cleanly.                              |
| 2.9  | `find`                                 | **Long reply, Find & Scroll**          | Scroll up → jump-to-bottom pill appears and works. Open in-thread **Find** → search match highlights & navigates → close Find.                                                                                                                            | Same.                                                                          |
| 2.10 | `live` → `live-done`                   | **Live stream, Steer & Notifications** | `live`: Active working indicator, streaming text/tool activity, pending steer chip, attention notification, and Stop control appear. Scroll up preserves reading position. `live-done`: settles to finished state, clears steer, shows done notification. | iOS: verify Live Activity / banner if enabled on device.                       |
| 2.11 | `approval`                             | **Long Approval modal/card**           | Scrollable permission approval prompt appears with long details; Approve/Deny controls remain reachable.                                                                                                                                                  | Same.                                                                          |
| 2.12 | `question`                             | **Question form**                      | Multi-question form (`Fixture color` options + `Fixture caption` text) renders; select option, type text, submit.                                                                                                                                         | Same.                                                                          |
| 2.13 | `elicitation` → `resolve`              | **MCP Elicitation form**               | Structured elicitation form (`Reading mode`: Brief/Detailed) renders; run `resolve` (or submit) → clears cleanly.                                                                                                                                         | Same.                                                                          |
| 2.14 | `sidechat`                             | **Side Chat sheet/drawer**             | Open Side Chat from thread → shows side-chat conversation and parent-context update banner → close Side Chat.                                                                                                                                             | Same.                                                                          |
| 2.15 | `handoff` / `bg-progress` → `bg-drain` | **Composer extras & Background tasks** | Check follow-up queue pill, provider switch/handoff (`handoff`), voice input sheet, and background tasks badge/drawer (`bg-progress` running → `bg-drain` cleared).                                                                                       | Same.                                                                          |

---

### Block 3 — Terminal Surface (`terminal`)

| #   | Screen / Modal / State    | PWA (Source Main)                                                                                                       | iOS / Android Delta                                                                     |
| --- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 3.1 | **Terminal thread**       | Run `terminal` → open fixture thread → PTY output renders, no blank screen.                                             | Same.                                                                                   |
| 3.2 | **Input & Accessory bar** | Type command / tap key accessory (`Ctrl+C`, `Esc`, `Tab`, arrows) → dispatches cleanly without overlapping system bars. | Native uses command input + Ctrl-modifier key row (plus hardware keyboard passthrough). |
| 3.3 | **Return to Home**        | Navigate back to Home cleanly; switch stage back to `base`.                                                             | Same.                                                                                   |

---

### Block 4 — Workspace: Git Changes/Diff & Project Files (`base` → `pr`)

Open the project Workspace page (from thread header or project actions):

| #   | Screen / Modal / State       | PWA (Source Main)                                                                                                                        | iOS / Android Delta |
| --- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| 4.1 | **Git Changes tab**          | Modified/staged/untracked file list renders; tap a file → diff viewer opens cleanly; stage/unstage toggle updates state.                 | Same.               |
| 4.2 | **Commit & Branch sheets**   | Open commit input / branch actions (pull/push/sync) → keyboard lifts cleanly, no overlap.                                                | Same.               |
| 4.3 | **PR Creation modal (`pr`)** | Run `pr` → open Create PR modal → title/body/AI guide controls render → cancel cleanly.                                                  | Same.               |
| 4.4 | **Files tab & File Editor**  | Switch bottom tab to `Files` → browse directory tree → open a file → edit text & save → check Markdown preview if `.md` → navigate back. | Same.               |

---

### Block 5 — More Sheet & Utility Pages (`base` → `workflow*`)

From Home, tap **More (`...`)** to open the More bottom sheet, then visit each utility page once:

| #   | Screen / Modal / State          | PWA (Source Main)                                                                                                                                                           | iOS / Android Delta                                                                               |
| --- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 5.1 | **More bottom sheet**           | All entries visible (Profile, Usage, Connections, Projects, Browser, Ports, Notes, Shortcuts, Settings). Refresh works cleanly.                                             | iOS/Android also include **Terminal** and **Refresh**; Android includes **Disconnect** at bottom. |
| 5.2 | **Projects & Project Settings** | Open **Projects** → project list renders → open Project Settings → verify **Notes**, **Actions**, **Worktree** sections; open & cancel Add/Clone project modals.            | Same.                                                                                             |
| 5.3 | **Notes page**                  | Open **Notes** → pre-seeded note loads (`Notes from the paired desktop`) → edit & save → switch project picker if multiple.                                                 | Same.                                                                                             |
| 5.4 | **Pull Requests page & Detail** | Open **Pull Requests** → PR list loads → open PR detail overlay → check **Description**, **Activity/Comments** + reactions, **Changes/Diff** tabs → close.                  | Same.                                                                                             |
| 5.5 | **GitHub Actions / Workflows**  | Open **GitHub Actions** → run `workflow` (active run), `workflow-waiting`, `workflow-failed`, `workflow-done` → verify status badges and run viewer update cleanly → close. | Same.                                                                                             |
| 5.6 | **Schedules page & Editor**     | Open **Schedules** → schedule list loads → open Schedule Editor modal → inspect fields & cancel.                                                                            | Same.                                                                                             |
| 5.7 | **Ports page**                  | Open **Ports** → forwarded ports list renders (empty or active state) → open forward action & return.                                                                       | Same.                                                                                             |
| 5.8 | **Browser Mirror**              | Open **Browser** → remote browser mirror surface loads (or graceful unavailable/empty state), URL bar & host picker work, return cleanly.                                   | Same.                                                                                             |
| 5.9 | **Profile & Usage pages**       | Open **Profile** (identity/stats) and **Usage** (provider usage meters & host bar) → render cleanly with no overflow.                                                       | Same.                                                                                             |

---

### Block 6 — Settings (Device + Desktop), Themes & Multi-Host (`base` → `multihost` → `fault-error`)

Open **Settings** from the More sheet:

| #   | Screen / Modal / State                      | PWA (Source Main)                                                                                                                                                                                                                                                                                                                                                                                                      | iOS / Android Delta                                                                                                |
| --- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 6.1 | **Device Settings index**                   | Index lists **General**, **Appearance**, **Audio**, **Notifications**, **Terminal**, **Desktop Settings**, **Privacy Policy**, **Support**.                                                                                                                                                                                                                                                                            | iOS/Android also expose **Changelog**, **Worktrees**, **Shortcuts**, **Search settings**; iOS has **Diagnostics**. |
| 6.2 | **Appearance & Themes**                     | Open **Appearance** → toggle `Light` ↔ `Dark` ↔ `System` → verify contrast & surfaces update immediately → adjust font size.                                                                                                                                                                                                                                                                                           | Native: also check Custom Theme picker if shown.                                                                   |
| 6.3 | **General, Audio, Notifications, Terminal** | Quick-open each page → verify controls render & toggle cleanly without crash → back.                                                                                                                                                                                                                                                                                                                                   | iOS/Android: check push permission status card.                                                                    |
| 6.4 | **Changelog / What's New states**           | Open **Changelog** → verify loaded release notes (`changelog-good`) → run `fault-error` → refresh/reopen → verify **error + retry state** → run `fault-clear` → retry recovers.                                                                                                                                                                                                                                        | Same.                                                                                                              |
| 6.5 | **Desktop Settings (Host-scoped)**          | Open **Desktop Settings** → verify host bar & walk rows: **Profile**, **Provider Usage**, **Schedules**, **AI Helpers**, **Memory** (open Memory catalog modal & close), **MCP Servers**, **Agents** (check enabled agents, **Agent Discovery** overlay, **Model Visibility**, **Provider Order**), **Crews**, **Import sessions**, **Git**, **Archived Threads** (restore/delete state), **Environments/Workspaces**. | Verify host-scoped edits show feedback banner without crashing.                                                    |
| 6.6 | **Connections / Multi-Host (`multihost`)**  | Run `multihost` → run `pair collision-b` → open **Connections** → verify host list, Add/Re-pair host modal/sheet, switch active host, and verify Disconnect confirmation cancels cleanly.                                                                                                                                                                                                                              | Same; iOS/Android keep multiple desktops connected simultaneously.                                                 |

---

### Block 7 — Faults, Offline, Reconnect & Lifecycle (`fault-offline` → `fault-clear`)

| #   | Screen / Modal / State           | PWA (Source Main)                                                                                                                                        | iOS / Android Delta |
| --- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| 7.1 | **Offline / Reconnecting state** | Run `fault-offline` → socket drops & reconnect delays → verify offline/reconnecting banner appears and app stays responsive (no crash, no blank screen). | Same.               |
| 7.2 | **Automatic Recovery**           | Run `fault-clear` → connection automatically recovers to online state and live updates resume.                                                           | Same.               |
| 7.3 | **Reload / Resume Lifecycle**    | Reload Safari/browser tab (PWA) or background/foreground + cold relaunch (iOS/Android) → paired session rehydrates cleanly with threads visible.         | Same.               |

---

## Known Platform Differences (Do Not Flag as Regressions)

- **PWA-only**: Install prompt / standalone mode (`data-mobile-standalone`), service worker cache, Web Push subscription, browser URL bar collapse (`100lvh`/`svh`).
- **iOS-only**: Live Activities / Dynamic Island (`PoracodeActivities`), Apple HIG inset-grouped lists & native sheets, Diagnostics view, "Nearby hosts" mDNS sheet.
- **Android-only**: Material 3 / Poracode Compose chrome, predictive back gestures, FCM push notifications, Local Network permission dialog, "Other ways" pairing sheet, Disconnect in More sheet.
- **Native-only (iOS + Android)**: **Advanced Operations** screen (raw procedure runner in Settings) and hardware keyboard shortcuts workspace (`keyboard` stage).
- **Wire / UI parity ledger**: Authoritative per-operation status lives in `protocol/remote/v3/native-parity.json`. Any `planned` or `desktop-only` item there is expected not to have a native UI surface yet.

---

## Fast Pass Scoreboard (Copy & Fill)

```text
Date / Commit:
Tester:
Smoke Host: bun run smoke:mobile (slot 0)

| Block | PWA (Source) | iOS | Android | Notes / First Error |
| --- | --- | --- | --- | --- |
| 0. Cold / Onboarding / Pair | [ ] | [ ] | [ ] | |
| 1. Home / Filter / Search / Quick Compose | [ ] | [ ] | [ ] | |
| 2. Thread / Rich / Live / Requests / SideChat | [ ] | [ ] | [ ] | |
| 3. Terminal | [ ] | [ ] | [ ] | |
| 4. Workspace (Git / Diff / PR / Files) | [ ] | [ ] | [ ] | |
| 5. More & Utility Pages (PR / Actions / Ports / Mirror) | [ ] | [ ] | [ ] | |
| 6. Settings (Device / Desktop / Themes / Multi-host) | [ ] | [ ] | [ ] | |
| 7. Faults / Offline / Reconnect / Reload | [ ] | [ ] | [ ] | |
```
