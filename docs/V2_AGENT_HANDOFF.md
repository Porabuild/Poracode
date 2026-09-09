# V2 agent handoff — 2026-09-09

## Status and user direction

**Not ready for production sign-off.** The user requested committing everything,
finishing the recovery work already underway, and stopping with a detailed handoff.
That bounded work is finished. Do not interpret provisional commits as release approval.
No new review lanes were started at shutdown, and nothing was pushed.

Prioritize GUI users: chat, questions/approvals, composer, navigation, Files/Git,
settings and dialogs across Android, iOS, web/PWA and Electron connected to a separate
server. Inspect screenshots for layout on every visited page; node presence is not
visual acceptance. No landscape testing. Further terminal/PTY work is paused.
The earlier request to consider replacing browser forwarding with port forwarding
is a product/architecture decision still needing a scoped comparison; do not remove
browser forwarding merely from that exploratory question.

## Git checkpoint and completed work

Branch: `poracode/v2`. Relevant local commits:

- `1de973a21`: complete provisional checkpoint, 342 files, including backend,
  protocol/generated contracts, relay, native clients and review work.
- `5a57f6d3a`: final saved-pairing compilation/test cleanup and web reconnect recovery.
- `6f95e7c0f`: inactive scroll controls removed from keyboard navigation.
- `065b8dfeb`: bounded database checkpoint deletion with exact removed-turn reporting.
- `e48118dc0`: Android GUI checkpoint synchronization.
- `d32523eb6`: iOS GUI turn recovery and checkpoint application.
- `182e89299`: GUI history avoids unnecessary terminal supervisor reads.

The final documentation commit follows these. Inspect `git log -5` and `git status`
on takeover. Root owns staging/commits; never have concurrent agents mutate the index.
Temporary evidence, native build output and branding exports are ignored, not committed.
The larger historical readiness record is [V2_PRODUCTION_READINESS.md](V2_PRODUCTION_READINESS.md).
Its chronological entries describe past checkpoints; this handoff supersedes stale
statements about the three recovery fixes below.

## Finished recovery fixes

### Android preserved pairing upgrade

The installed v10 app previously rejected saved v9 credentials before contacting a
compatible host. It now preserves v9 credentials while a discarded API client checks
current protocol and host identity, then performs an authenticated snapshot read.
Only that successful proof permits a journaled pin update. Public environment metadata
alone cannot authenticate a saved token. Future/unknown bindings remain rejected.

Key files under `android/app/src/main/kotlin/com/poracode/app/`:
`storage/StoredProtocolUpgrade.kt`, `storage/LegacyHostImport.kt`,
`storage/HostCatalogCredentialRepository.kt`, `storage/HostCatalog.kt`,
`session/StoredPairingUpgrade.kt`, `session/SessionBootstrapController.kt`,
`session/AppSessionLifecycleCoordinator.kt`, `session/HostSessionController.kt`,
`session/SessionStateTransitions.kt`, and `AppSession.kt`.

Ownership, complete profile and token are rechecked before durable mutation. Connection
identity, token, selection and timestamps survive. A secondary old binding cannot gain
live authority through warm-up or selection. Authentication expiry, incompatible host,
transport failure and local persistence failure have distinct outcomes. Foreground
retries a parked old binding; no unverified client is installed.

Tests: `StoredPairingUpgradeTest.kt` and `LegacyProtocolUpgradeTest.kt`, including actual
RemoteApiClient/MockWebServer public-200/protected-401 behavior, removal/background races,
legacy imports, future-version rejection and journal recovery.

Final full verification: **1,128 tests, zero failures/errors/skips**, 233 XML suites;
Gradle unit tests, lint and debug assembly succeeded. Final APK SHA-256:
`910cd3d0e520bdb33c9207022f61fbcd290b8b2675783210e55ba029fd78c44a`.
Live `install -r` over the existing pairing restored two threads without clearing data
or re-pairing. Registry went from one host/pin9 to one host/pin10. Opening the existing
GUI thread displayed `GUI_V10_AFTER_RELOAD_OK` and the composer. Home and thread portrait
screenshots were inspected: header/composer fit; large per-message truncation rows remain
a density concern, not a claimed polished layout.

### iOS preserved pairing upgrade

Key files under `ios/App/`: `App/Features/Session/PreservedPairingUpgradeController.swift`,
`App/Features/Session/LiveConnectionController.swift`, session credential types/repository,
and `AppTests/AppSessionCompositionTests.swift` (use `rg --files` to resolve exact roots).
The Xcode project registers the extracted controller.

Only known v9 saved pairings are probed. Public compatibility/identity and protected
snapshot proof precede persistence. Full record/token and operation identity fence the
commit. Unauthorized credentials expire without rewriting; offline/background probes
park without installing authority. Foreground restarts bootstrap. Cancellation after a
successful durable commit abandons installation safely without undoing persisted state.

Final **1,240 AppTests passed, zero failures/skips**. All **946** source-manifest entries
match both repository and isolated snapshot. Three existing URLProtocol Sendable warnings
remain in ProjectWorkspaceTestSupport, SettingsTestSupport and SettingsTransportTests.
The earlier 50-test composition run also passed; final full run includes the capture-warning
cleanup. Real iOS saved-v9-to-v10 UI upgrade and multi-host journeys remain unverified.

### Web restored history and pending truncation recovery

Key files: `src/renderer/state/remoteServersStore.ts`,
`src/renderer/state/remote/truncateRecovery.ts`, remote snapshot installation/sync,
`src/renderer/hooks/useRestoredRemoteThreadLifecycle.ts`, and their tests.

Suppression uses the authoritative history actually installed for each thread, not the
global resume cursor or a list snapshot. Epoch/token leases prevent old completion from
clearing replacement work. Pending sequence and a bounded three-attempt budget survive
failed catch-up; unknown checkpoints fetch authoritative history instead of speculative
deletion. Healthy reconnect re-arms pending recovery only for still-subscribed current
threads. A failed recovery parks rather than creating a request storm. Removed/re-paired
servers and retired sockets cannot install history or steal focus.

Final **178 tests in five suites passed**: remoteServersStore, truncateRecovery,
applySnapshotInstall, useRestoredRemoteThreadLifecycle and app. Real portrait web reload
then a GUI follow-up reply displayed `GUI_V10_AFTER_RELOAD_OK` without reopening the thread.
A fault-injected real UI reconnect with missing checkpoint is still a separate acceptance
step; deferred store tests are the current race evidence.

## Verification and evidence

All paths below are local ignored artifacts under `tmp/v2-production-review/`;
they will not exist in a fresh clone unless deliberately transferred with secrets removed.

| Evidence                                     | Path                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Android final gates                          | `gui-priority/android-upgrade-final-gates.log`                                             |
| Android live upgrade screenshots             | `gui-priority/android-upgrade-recovery/home-after-upgrade.png`, `thread-after-upgrade.png` |
| iOS final native result bundle               | `gui-priority/ios-upgrade-recovery/native-upgrade-full.xcresult`                           |
| iOS source provenance                        | `gui-priority/ios-truncate-consumer/native-source-manifest.json` and `native-snapshot/`    |
| Web final tests                              | `gui-priority/gui-reload-live/final-reconnect-coordinator.log`                             |
| Contract generation check                    | `gui-priority/final-protocol-check.log`                                                    |
| Web visual recovery                          | `gui-priority/web-v10-after-reload.png`, `web-v10-current-ready.png`                       |
| Two distinct paired clients, canonical event | `gui-priority/truncate-sync/two-device-truncate-current.log`                               |

Both source commits passed commit hooks: touched-file type-aware oxlint with warnings
rejected, oxfmt, and whole-tree TypeScript checking. The large checkpoint covered 249
JS/TS files through these hooks. `pnpm protocol:remote:v3:check` reports generated files
up to date. This is not a claim that the entire branch's complete test/UI matrix passed.

Useful commands (do not rerun unchanged successful checks without a reason):

```sh
pnpm exec vitest run src/renderer/state/remoteServersStore.test.ts src/renderer/state/remote/truncateRecovery.test.ts src/renderer/state/remote/applySnapshotInstall.test.ts src/renderer/hooks/useRestoredRemoteThreadLifecycle.test.tsx src/renderer/app.test.tsx
JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./android/gradlew --no-daemon -p android :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
pnpm protocol:remote:v3:check
pnpm run typecheck
```

Use pnpm 12.3.4 and Node >=24.10.0. Prefer XcodeBuildMCP for native builds; verify session
defaults first. Last profile `ios-gui-revert-root`: App/Debug, isolated snapshot project,
owned simulator below, `CODE_SIGNING_ALLOWED=NO`. Full run used `-only-testing:AppTests`
and `-parallel-testing-enabled NO`. Builds are complete; there is no outstanding build slot.

## Ordered next work and acceptance gates

1. **Compound checkpoint revert correctness.** Trace provider rollback, file checkpoint
   restore and DB truncation as one operation. UI mount-local retry refs are not durable
   across reload or clients. A provider's relative rollback may succeed before its receipt
   persists; retry can roll back an earlier turn. A journal alone, or freezing numTurns,
   does not solve this ambiguous crash window. Design an absolute capability-shaped
   checkpoint or explicit ambiguity gate with authoritative reconciliation, plus concurrent
   request/active-turn ownership. Test failures between every external and durable step,
   reload, two clients, retries and new turns. The candidate
   `gui-priority/truncate-sync/COMPOUND-OPERATION-PLAN.md` is **not approved** and contains
   superseded assumptions; validate every claim. Avoid provider-name branches in shared code.
2. **Fresh v10 GUI acceptance in parallel by platform.** Assign non-overlapping iOS,
   Android, web/PWA and Electron lanes against the same separate backend, with separate
   credentials/resources. Test streaming, reload, reconnect, questions/permissions,
   stop/steer, model changes, attachments, Files/Git, settings and dialogs. Capture and
   inspect portrait layouts, keyboard overlap, title placement and spacing. In particular
   revisit the user's iOS Files header/gaps and Android wrapped Manage projects header.
   Android saved upgrade has live proof; iOS upgrade and both native multi-host transitions
   need it. Complete checkpoint convergence after the compound operation is safe.
3. **Bound iOS loading buffers.** Inspect `bufferedBatches` while authoritative history is
   delayed. Android has a 512 bound; iOS still has an unbounded loading path. Prove bounded
   memory and correct resync with long delay, cancellation and ownership replacement.
4. **Weak-network responsiveness and server load.** A 32 kbps/1.5-second RTT cold baseline
   can take 26.8 seconds against a 10-second deadline. Resolve without masking dead hosts.
   Measure per-owner fairness, queue bounds and peak heap, not just connection counts.
   Historical 1/2/8/32 connection and 8 MiB slow-client tests are not full UI acceptance.
   Network return while a parked native upgrade stays foreground is not yet proven.
5. **Relay deployment gates.** Finish streaming HTTP/SSE, negotiated framing limits,
   bounded fragments, fairness/backpressure and origin isolation. Historical relay tests
   do not establish deployed compatibility or safe slow-client behavior.
6. **Editor and GUI polish.** Validate coarse-timestamp/external-process save races and
   real conflict/rename flows under a weak link. Review Android automatic follow-new-message
   behavior (initial scroll alone may be insufficient), large truncation rows, and web
   transcript footer spacing. Preserve existing shared UI patterns; avoid cosmetic scope creep.
7. **Provider and release matrix.** Real structured-provider capabilities, accessibility,
   retained-history performance, physical-device lifecycle/push, signing, packaging and
   upgrades remain gates. Existing terminal issues remain recorded but paused.

Do not claim a completion percentage without a fixed, weighted acceptance checklist.
The correct present status is finished recovery checkpoint, incomplete production review.

## Resource ownership and safe continuation

Revalidate every PID/port/session before use; recorded identifiers are not permanent.
Leave user resources and the live C6 simulator untouched. Do not clear native app data,
forget pairings or replace credentials to make an upgrade test pass.

- Root-owned backend: port **63048**, runtime
  `tmp/v2-production-review/web-parallel/runtime-v10/server.cjs`, data directory
  `tmp/v2-production-review/web-parallel/data`. Its public environment endpoint is
  `http://127.0.0.1:63048/.well-known/poracode/environment` (protocol10).
  Private server log can contain pairing tokens: never print or commit it. Old v9 runtime
  and private pre-upgrade SQLite backup remain locally for recovery.
- Web Vite: **63049**. Browser session **poracode-gui-v10**, profile
  `tmp/v2-production-review/web-parallel/chrome-profile`, portrait390×844.
  CLI available at `/Users/svecherenko/.npm/_npx/6de2aa2fded2970c/node_modules/.bin/agent-browser`.
  Current GUI thread `e06011ae-2f61-4caa-b2f2-bba052ac6d2d`; latest provider was idle and
  draft empty. Use ordinary interactions, never force-click to claim usability.
- Android: **emulator-5554**, AVD **poracode-wsq-api37**, portrait1080×2424,
  activity `com.lightcodeapp.mobile/com.poracode.app.MainActivity`. Final APK is installed,
  existing GUI thread open. SDK adb lives under
  `/opt/homebrew/share/android-commandlinetools/platform-tools/adb`.
- iOS owned simulator: **1105C4D6-9D73-4663-B7E1-D4354A9C3EC2**, `poracode-tcf-ci`.
  Isolated DerivedData is under `gui-priority/ios-truncate-consumer/DerivedData`.
  **C6 was untouched and must remain so.**
- Electron QA session was stopped; last record
  `/Users/svecherenko/.poracode-smoke/gui-remote-root-20260908-2/session.json` had null appPid.
  Its earlier ports60830/60831 are not assumed available or owned now.

These QA services are retained for handoff. Stop only verified owned processes when
finished; no broad process kills. Evidence and profiles may contain private data.

## Delegation and interpretation rules

User selected Z.ai GLM 5.3 Flash high (`claude:z-ai`, `glm-5.3-flash[1m]`); quota429 was
encountered. Authorized backup is OpenCode Go Muse 1.3 Contributor xHigh
(`opencode`, `opencode-go/muse-spark-1.3-contributor`, `xhigh`) until GLM recovers.
Use actual available routing metadata. This session's hard capacity was four total
agents including coordinator, despite a user allowance of up to16. Respect the runtime
cap, give exclusive file ownership, and serialize shared native builds. Current workers
have finished; do not resume old write scopes blindly.

Treat worker reports as claims and inspect artifacts. An empty worker response may still
have edited files. Public environment success is not authentication; two sockets are not
two devices; a journal is not proof of exactly-once external effects. Empty deletion
anchors do not automatically mean no-op. Replaying a truncate after new items arrive
requires a sequence-aware baseline. An isolated passing test does not disprove suite
pollution. Keep generated boundaries versioned intentionally and localized UI complete.
