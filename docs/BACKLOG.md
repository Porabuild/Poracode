# Backlog

Open follow-ups carried over from completed V2–V6 plans (archived in git history, removed 2026-10-13). Move items to GitHub issues as they're picked up.

## Release qualification (needs hardware or self-hosted runners)

- **Full reference capacity matrix** — one clean 30-minute mixed-load cell passed on a local M5 Pro; the remaining client, host-mode and reference-device cells need dedicated reference hardware. CI: `v2-perf-qualification.yml` (weekly hosted `sustained` cell).
- **Overnight (≥24 h) soak** — exceeds hosted job limits; enroll the labeled self-hosted macOS ARM64 qualification runner. CI: `v2-perf-qualification.yml` with `mode: soak` (dispatch only).
- **Mirrored-networking Windows 11 + WSL2** — hosted Windows Server cannot run mirrored mode (the hosted NAT + real sshd leg already passes weekly); enroll the labeled self-hosted Windows 11 runner. CI: `windows-wsl-qualification.yml` with `run_mirrored`.
- **Physical iPhone and lower-tier Android journeys** — needs devices attached to the labeled self-hosted runners. CI: `physical-device-qualification.yml` (dispatch only).
- **Physical-device push / background delivery** — not covered by any workflow; `physical-device-qualification.yml` runs pairing and real-peer journeys only.
- **Strict real-provider lifecycle on a dedicated runner** — strict Claude and Codex rows pass locally; repeat on the labeled provider-qualification runner. CI: `provider-n1-qualification.yml` `providers` job.
- **Published N−1 server upgrade** — the first stable v2 release must upgrade from a real published v2 server artifact. Publish one, then run `provider-n1-qualification.yml` `server_n1` (fails closed with `NO_PUBLISHED_SERVER_N1` until then).
- **Hardware GPU/VRAM and private/native-memory profiling** — not measurable on current hosts; no workflow.

## Performance and stability

- **Sustained-run renderer crash** — the 30-minute development/instrumented mixed workload (two chat panes, eight PTY producers, four instrumented clients) lost its renderer after ~8.6 minutes (exit code 5, ~4.7 GiB peak working set); the allocation owner is unattributed. Reproduce on a production build and attribute. CI: `v2-perf-qualification.yml` sustained cell.
- **Portrait iOS Safari coverage** — the lifecycle subset passes (pair, history scroll, online/offline reload, background/foreground, host restart). Still unmeasured: rich message rendering in Safari, live composer/keyboard/stream with a resumable provider, navigation timing, an offline JavaScript error check, and long-session retention. No workflow.
- **Startup and hydration metrics** — define privacy-safe measurements and budgets, then add regressions and reporting. Do not add telemetry just because a counter is available.

## Server and transport hardening

- **SQLite integrity at startup** — run `quick_check`/`integrity_check` on open with quarantine and restore-from-backup; today it runs only on import (`src/backend/ownership/hostImportDatabase.ts`). Document the accepted unflushed-write loss window of `src/host/db/runtimeWriteQueue.ts` alongside it.
- **Relay secret at rest** — document the storage and key-rotation posture for `src/server/headlessRelaySecret.ts`.
- **Port-forward child origins sign-off** — validate wildcard DNS/TLS and proxy behavior for `PORACODE_REMOTE_FORWARD_BASE_URL` / `PORACODE_RELAY_FORWARD_BASE_URL`, add synthetic browser-storage and service-worker isolation probes, and check web/iOS/Android open/copy/reopen against older hosts; current proof is the Node two-host probe (`src/server/relay/forwardOriginTwoHostProbe.test.ts`). See `docs/PORT_FORWARD_ORIGIN_ISOLATION.md`.
- **Desktop-owner attach** — `DESKTOP_OWNER_ATTACH_ADMISSION` in `src/main/backend/standaloneAttach.ts` is `"refuse"`; desktop owners must expose the backend-owned client endpoint before it can flip to `"admit"`.
- **Live SSH end-to-end** — `src/host/ssh/*.integration.test.ts` run only when `PORACODE_SSH_E2E_TARGET`/`_IDENTITY` are set; no CI job provides them.

## Native clients

- **Android orphan pin on superseded pairing** — `PairingCoordinator.pair()` registers the speculative TLS pin before the `isCurrent` check, so a superseded mid-flight pair can leave a stale pin.
- **Android pinned-client cache eviction** — `TlsCertPin` evicts its 8-entry cache in insertion (FIFO) order rather than least-recently-used.
- **Mobile crash diagnostics** — policy decided 2026-11-09; not built. Audit: neither native app captures crash data in-app (no SDK, MetricKit, exit-reason or uncaught-exception capture). Store channels already exist: TestFlight crash reports (iOS) and Play Console vitals (Android, `internal` track by default). Product analytics remain a separate decision. Build in-app capture against these rules:
  - **Sources:** iOS `MXMetricManager` diagnostic payloads (crash, hang, CPU and disk-write exceptions; iOS 17 deployment target). [Apple documents immediate diagnostic delivery on iOS 15 and later](https://developer.apple.com/documentation/metrickit), separately from daily metric payloads; register the subscriber at launch. Android `ActivityManager.getHistoricalProcessExitReasons` (minSdk 34) plus a chained default uncaught-exception handler. No third-party SDK.
  - **Consent and defaults:** capture is on by default but local only; a report leaves the device only through an explicit user share action. The in-app toggle governs local capture; Apple's store-provided crash reports remain governed by Apple's sharing settings.
  - **Scrubbing:** keep timestamps, app version and build, OS version, device model, categorical fields (exception type and code, signal, termination reason, exit reason and status, importance, PSS/RSS), and stack frames (iOS binary image plus offset; Android class, method and line). Drop exception messages, exit descriptions, ANR and native trace streams (`getTraceInputStream`), locale and region, paths, host names, and thread, session and user identifiers.
  - **Retention:** the newest 20 reports, none older than 30 days, in app-private storage excluded from backups. Users can delete all reports; uninstalling removes them.
  - **Symbolication:** off-device, after a user shares a report. `release-mobile.yml` already archives dSYMs; it must also archive the R8 `mapping.txt` (release builds set `isMinifyEnabled = true`).
  - **Kill switch:** a Settings toggle in each app that stops capture and deletes stored reports, plus a build flag that compiles capture out.
  - **Exposure:** a Settings › Diagnostics screen to view, share and delete reports, localized in every app locale. No wire change; sending reports to a paired host would be a separate versioned decision.

## Product

- **Durable offline-send outbox** — the follow-up queue is in-memory host scheduling and clears on supervisor restart; it is not offline delivery. Requires durable idempotency, ambiguous-timeout reconciliation, cancellation, ordering, attachment lifetime, auth revocation and stale-thread handling. Reconnect must never duplicate an agent action; no naive retry queue.
- **Draft resilience** — exercise the versioned draft store under reload, offline/online transitions, quota/write failure, host removal and expired attachments. Change storage only for a demonstrated durability or capacity gap, with migration and platform parity.
- **Onboarding** — confirm first-agent friction in the existing flow; use provider-declared install/auth capabilities and measure successful first turns.
- **Accessibility** — extend automated critical-journey checks with tools that fit the current test stacks, and qualify full keyboard, touch-drag and screen-reader behavior; automation supplements device/manual evidence.

## Code health

- **Swallowed errors** — classify bare `catch` blocks by effect and fix ones that swallow actionable failures; avoid blanket logging that could expose secrets or add noise.
