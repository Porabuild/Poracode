# V2 production plan — deep review results and path to release

Date: 2026-09-09. Baseline: branch `poracode/v2` at `fa9469abb`, clean tree, nothing pushed.
Method: 13 parallel read-only GLM review lanes (deep-review R1–R4 routing) over the full v2
surface, plus fresh verification runs on the current tree. No source files were modified by
this review; every finding below carries `file:line` evidence and was spot-validated by the
coordinator (the four release-blocking mechanisms were re-verified by hand against the code).

Companion docs: [V2_AGENT_HANDOFF.md](V2_AGENT_HANDOFF.md) (recovery evidence, QA resource
ownership) and [V2_PRODUCTION_READINESS.md](V2_PRODUCTION_READINESS.md) (historical
checkpoints). This plan supersedes their "ordered next work" lists.

## Status update — 2026-09-09 (later same day)

- **WS1 hotfix batch: DONE, committed** (`fix(backend): harden checkpoint
reverts, event caps, and receipt recovery`). Findings P0-1/2/4/7 closed.
- **WS2 stages 1–2: DONE, committed in the same commit.** Backend-owned
  `revertCheckpoint` with `checkpoint_revert_operations` journal (migration 45),
  working/launching refusal, per-thread revert lock, frozen server-derived turn
  counts, at-most-once provider rollback, key replay/resume, retention purge.
  11 fault-injection tests cover the crash/retry/two-client/concurrency matrix
  (W1–W8 subset). Combined `src/backend` + `src/main/db` + `src/main/remote`:
  689 tests / 66 files green; typecheck exit 0. Remaining for full P0-3 closure:
  stage 3 (absolute provider anchors), stage 4 (compound wire route + renderer
  one-call swap + iOS migration).
- **WS3 quick wins: DONE, committed** (`perf(remote): cut weak-link wire cost…`).
  Implemented: broadcast-path delta coalescing (RuntimeEventBuffer.flush, 5
  tests), WS deflate window cap removed (30–50% on large frames), bounded ETag
  revalidation cache in RemoteDesktopClient (3 tests — also neutralizes most of
  the launch poll loop's cost, deferring A1's event-wait redesign). 190/190
  combined suites, typecheck clean. Still open in WS3: cursor-sync v2 (#1),
  snapshot scrollback omission (#2), agent-statuses slimming (the measured
  39.4 KB cold-start culprit), waterfall parallelization (#6/#8).
- **WS5-1: DONE, committed** (`fix(supervisor): shed terminal output…`).
  Supervisor→backend overflow now sheds only terminal-output batches with a
  merged-thread-id recovery signal (desktop: renderer-stream resync-required →
  scrollback rebuild from the supervisor; headless: remote resync-required);
  the fatal 30s backpressure timer is disabled. 5 regression tests; full
  supervisor suite 4604 green. **WS7 Android races: DONE, committed** —
  @Volatile seq fields + synchronized HostStateCache buffer; full Android
  suite + lintDebug green.
- **Manual QA additions:** Electron isolated smoke PASS (0 console errors);
  W-Rel-2 executed — server-side truncate converged live on a second client;
  45 s partition produced no crash and eventual recovery. 32 kbps cold-start
  projection: ~17–19 s vs the 10 s deadline, dominated by the 39.4 KB
  agent-statuses payload (WS3 fix list confirmed). Shaped-radio UI measurement
  remains the final acceptance step.
- **Manual QA executed** against the live stack (web paired client, Android
  emulator, iOS simulator). Records + 20 screenshots:
  `tmp/v2-production-review/qa-ws1/QA-EXECUTION-RECORD.md`. Highlights: web
  pairing, streaming, draft-survives-reload, restored-view live follow-up (the
  historic bug — confirmed fixed), git/diff, thread actions all PASS; Android
  two-client live convergence PASS. New findings: **stop control hit-target
  renders below the fold at 390×844 (P1, web composer — fold into WS6)**;
  iOS simulator launch lands in a correct, well-rendered "Repair required"
  fail-safe because the simulator Keychain lost the saved credential (environment;
  real saved-pairing restore journey still requires a fresh install + repair-free
  simulator).

---

## 1. Verdict

The v2 architecture is sound: one authoritative backend (SQLite + supervisor + remote host)
with four thin clients, gap-correct replay/resync on the remote path, journaled v9→v10
pairing upgrades on both natives, per-connection backpressure on remote sockets, and a
transcript lane in the renderer that is among the most disciplined store designs in the
codebase. Provider isolation holds in every hot path.

It is **not** production-ready yet. The review confirmed the handoff's open gates and found
new release blockers:

1. A backend restart permanently bricks retried commands (`in_progress` receipts never
   recover) — and deterministic client command ids guarantee the field will hit it.
2. The desktop renderer stream has no event-size cap; one large tool/image event
   disconnect-storms every Electron window.
3. The compound checkpoint revert is client-orchestrated with relative counts and
   mount-local retry refs; retry after an ambiguous failure silently rolls back _earlier_
   turns (destructive, does not self-heal). iOS runs its own copy of the same anti-pattern.
4. `src/main/remote` has one deterministic test failure on the current tree (PWA
   checkpoint-revert server test, 403 scope mismatch introduced in `1de973a21`) — the
   branch does not currently pass its own full remote suite.
5. The relay still has no per-owner fairness; one slow visitor can kill the shared control
   socket and disconnect every visitor of that host.
6. The measured 32 kbps / 1.5 s RTT cold-start blocker (26.8 s vs a 10 s deadline) is
   structural: the terminal retained tail crosses the wire twice per attach and cursor
   resume is designed but unimplemented.

The plan below sequences all of it into nine workstreams with acceptance gates.

---

## 2. Evidence base

| Lane                     | Reviewer ownership                                                | Highlights                                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend concurrency (R1) | `src/backend`, `src/server` (non-relay), `src/main/remote/server` | 4 Important (restart brick, stale-row restore, desktop stream cap, replay boundary), 3 nits; core model verified sound                              |
| Relay transport (R1)     | `src/server/relay/**` + integration                               | 5 Important (shared-socket kill, zombie channels, buffering, framing, admission), streaming design sketch                                           |
| Protocol wire (R1+R4)    | `protocol/remote/v3` + producers/consumers                        | 10 ranked data-minimization wins; cursor-resume verified unimplemented; no dead protocol surface                                                    |
| Renderer perf (R4+R1)    | `src/renderer/state/**` + chat pipeline                           | 5 Important (whole-store persistence, identity churn, loss-rebuild scope, stringify compares, IDB prune); transcript lane verified strong           |
| FE/BE parity (R3)        | capability × 4-client matrix                                      | 3 Electron-as-remote-client divergences (settings, schedules, ports); stale `native-parity.json`; iOS buffer + checkpoint gaps confirmed            |
| iOS (R1)                 | `ios/App/**`                                                      | Unbounded buffers confirmed at **3 sites**; parked-upgrade never retries in foreground; `lastSeenSeq=0` replay duplication                          |
| Android (R1)             | `android/app/**`                                                  | `HostStateCache` thread race (rare crash); missing `@Volatile`; per-delta markdown re-parse; per-host OkHttp clients                                |
| Compound checkpoint (R1) | full participant map                                              | 11 failure windows enumerated; absolute-anchor + journal design; 6-stage plan (14–22 d); superseded assumptions in the old plan doc identified      |
| Supervisor fairness (R1) | `src/supervisor` event production                                 | No shed policy on supervisor→backend sender (overflow kills all agents); PTY pause back-pressures agents; double serialization; `start()` race      |
| Simplification (R4)      | cross-surface duplication, slop, boundaries                       | Provider-isolation violations at 4 declaration sites; native constants + pairing URL triplicated; 2 god files; no dead code from the BE move        |
| UX states (R2)           | remote-mode observable states                                     | Offline bridge calls park forever with no timeout; false "No messages yet" on remote open; no stale/offline labeling; 2 raw-placeholder i18n misses |
| Versioning (R3)          | 19 compatibility boundaries                                       | 18 OK; 1 gap (WSL bridge behavior change without `BRIDGE_VERSION` bump); 6 doc-vs-constant drifts                                                   |
| QA/proof (R3)            | gates, coverage, manual matrix                                    | Exact numbers below; 1 deterministic red test; coverage-vs-acceptance matrix; executable manual QA matrix                                           |

Reviewer claims were treated as claims: the four release-blocking mechanisms (receipt brick,
no shed policy, uncoalesced deltas, missing stream cap) were re-verified by the coordinator
with direct reads; the failing test was reproduced in isolation by the QA lane.

---

## 3. Current-tree verification (2026-09-09)

| Check                                                                                                               | Result                                                                        |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `pnpm run typecheck`                                                                                                | PASS (exit 0)                                                                 |
| `pnpm protocol:remote:v3:check`                                                                                     | PASS — generated artifacts up to date                                         |
| Five web suites (remoteServersStore, truncateRecovery, applySnapshotInstall, useRestoredRemoteThreadLifecycle, app) | **178/178 passed** (handoff claim reproduced exactly)                         |
| `pnpm exec vitest run src/backend`                                                                                  | **60/60 passed** (8 files)                                                    |
| `pnpm exec vitest run src/main/remote`                                                                              | **1 failed / 493 passed** (42 files) — deterministic, reproduces in isolation |
| Retained QA backend `http://127.0.0.1:63048`                                                                        | ALIVE, advertises `protocolVersion: 10`                                       |

**The red test:** `src/main/remote/RemoteAccessServer.test.ts > "truncates durable remote
runtime history during a PWA checkpoint revert"` requests its access token with scopes
`["session:operate"]` only (`RemoteAccessServer.test.ts:3564`) while `issueWebSocketTicket`
requires `session:read` (`src/main/remote/auth.ts:263`) → 403 on the ticket call. Introduced
in the provisional checkpoint `1de973a21`. This is the _only_ server-side test exercising the
PWA truncate broadcast — fix it before any checkpoint work re-runs against it.

---

## 4. Findings register

Severity: **P0** = release-blocking correctness/data loss; **P1** = reliability/perf/
parity that ships user-visible damage; **P2** = improvement. Confidence: high / medium / low.

### 4.1 Release-blocking correctness (P0)

| ID   | Finding                                                                                                                                                                                                                                                                                                     | Evidence                                                                                                                                                                                                                                                                                            |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-1 | Stale `in_progress` command receipts permanently 409 after a backend restart. Deterministic client ids (`thread-start:${threadId}`) guarantee the natural retry is the locked one; nothing in renderer/shared handles `command_in_progress`.                                                                | `src/main/db/remoteCommandReceipts.ts:25`; purge only removes >30 d rows (`src/main/db/connection.ts:290-291`). Fix: purge `in_progress` at boot.                                                                                                                                                   |
| P0-2 | No per-event size cap on the desktop renderer stream. One multi-MB runtime event closes every Electron window; on reconnect the replay re-sends it → disconnect loop until 8 MB of churn evicts it. The remote path already solved this (`eventSizeGuard`).                                                 | `src/backend/BackendRendererStream.ts:104-136,325-351`; remote precedent `src/main/remote/server/eventSizeGuard.ts:14-16`, applied at `RemoteAccessServer.ts:649-654`.                                                                                                                              |
| P0-3 | Compound checkpoint revert: relative `numTurns` recomputed on retry; provider rollback executed before receipt can persist; retry silently rolls back earlier turns (Claude rewinds again, Codex forks earlier, OpenCode reverts further). Progress lives in `useRef` only. Same pattern duplicated in iOS. | `src/renderer/components/thread/ChatPane/parts/MessageList.tsx:176-184,353-397`; `src/supervisor/agents/claude/sdkSession.ts:400-424`; `codex/acp.ts:973-1006`; `opencode/sdkSession.ts:546-565`; iOS `RichChatConversationController.swift:217-244`. Full failure-window table + design in §5 WS2. |
| P0-4 | Red server test on the truncate broadcast path (§3).                                                                                                                                                                                                                                                        | `src/main/remote/RemoteAccessServer.test.ts:3564` vs `src/main/remote/auth.ts:263`.                                                                                                                                                                                                                 |
| P0-5 | Truncate route has no idempotency key: a retried ambiguous truncate re-executes and deletes turns appended since the first call.                                                                                                                                                                            | `src/shared/remote/contract/routes/threads.ts:80-92`; `src/shared/remote/client.ts:739-747`; `src/main/remote/server/httpRouter.ts:1011-1026`.                                                                                                                                                      |
| P0-6 | Failed provider switch restores a stale full-thread row captured before a multi-second await: concurrent metadata edits are reverted and a concurrent delete is resurrected as a ghost row.                                                                                                                 | `src/main/remote/server/threadCommands.ts:536-570,608-609`.                                                                                                                                                                                                                                         |
| P0-7 | WSL bridge gained symlink-rejection behavior without the mandated `BRIDGE_VERSION` bump — deployed bridges silently keep the unhardened behavior.                                                                                                                                                           | `src/supervisor/wsl/bridge/bridge.mjs:52-56` vs commit `8aff2709a`; rule at `.agents/docs/versioning.md:74`.                                                                                                                                                                                        |
| P0-8 | Offline PWA bridge calls park forever with no timeout: composer send, approvals, revert, file ops block on `waitForClient()`; composer looks accepted, `isSubmitting` stays true, message lands minutes later or never.                                                                                     | `src/renderer/browser/remoteBridge.ts:85-89,125-134,441-448`; store gating `src/renderer/state/remoteServersStore.ts:199-216,270-277`.                                                                                                                                                              |

### 4.2 Reliability, multi-client responsiveness (P1)

| ID    | Finding                                                                                                                                                                                                                                                                                               | Evidence                                                                                                                                                                                                                             |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1-1  | Supervisor→backend IPC sender has **no shed policy** and fails fatal on overflow (4096 msgs / 16 MB). 8 streaming agents fill it in ~250 ms of backend-host stall → supervisor exits → **all agent processes die**. The backend-host sender already has the shed policy; the symmetric link does not. | `src/supervisor/supervisorIpcSender.ts:204-213`; `src/supervisor/index.ts:30-48`; working precedent `src/backend/index.ts:53-88`.                                                                                                    |
| P1-2  | IPC backpressure pauses PTYs, blocking agent processes up to 30 s then killing the supervisor — violating the "never back-pressure agents" invariant. The downstream flow-control wire (`setOutputBackpressured`) has zero production callers.                                                        | `src/supervisor/runtime/threadSession/ptyLifecycle.ts:118-131`; `src/main/supervisor/SupervisorClient.ts:223-241`.                                                                                                                   |
| P1-3  | `SupervisorClient.start()` unconditionally stops a running child: lazy first-touch autostart racing the boot start kills a live supervisor and rejects in-flight requests.                                                                                                                            | `src/main/supervisor/SupervisorClient.ts:154-156,252`; `src/backend/BackendHostCore.ts:212-214`; gate ordering `BackendHostClient.ts:568-580`.                                                                                       |
| P1-4  | Empty-replay-buffer boundary drops the newest event silently on the desktop stream (remote path is gap-correct).                                                                                                                                                                                      | `src/backend/BackendRendererStream.ts:290-303`; correct precedent `src/main/remote/server/eventReplay.ts:26-34`.                                                                                                                     |
| P1-5  | Relay: only backpressure is kill-the-shared-socket (≈86 MB threshold) → one slow/chatty visitor disconnects all visitors of a host. Per-channel accounting, fair drain, admission caps absent. Forwarded channels and the visitor→host direction have no soft cap.                                    | `src/server/relay/relayHost.ts:236-237`; `relayServer.ts:683-771,191-197`; soft cap only for `/ws` events `relayHost.ts:117,161-164,419`.                                                                                            |
| P1-6  | Relay: visitor terminated mid-forward never notifies the host → zombie local sockets + channel entries leak per slow visitor.                                                                                                                                                                         | `src/server/relay/relayServer.ts:502-505,584-586,700-708`; host keeps entry `relayHost.ts:473`.                                                                                                                                      |
| P1-7  | Relay: HTTP `req`/`res` frames are not pre-measured against `controlFrameLimit` (only `ws-data` is) — a near-max body + headers can kill the shared socket.                                                                                                                                           | `src/server/relay/relayServer.ts:369-378`; `relayHost.ts:383-391`; measured precedent `relayServer.ts:691-698`.                                                                                                                      |
| P1-8  | Relay: no per-owner admission caps — one clientId can hold unbounded concurrent requests (each buffering up to 64 MB + 64 MB) and unbounded channels.                                                                                                                                                 | `src/server/relay/relayServer.ts:163-165,350,653,128-132`.                                                                                                                                                                           |
| P1-9  | Remote replay window (8 MB / 500 entries) rolls over in seconds under 8-agent streaming → every reconnect during heavy load degrades to full HTTP resync (3 supervisor round-trips + transcript read on the shared loop).                                                                             | `src/main/remote/server/eventSizeGuard.ts:39`; `RemoteAccessServer.ts:87,643-667`; snapshot cost `snapshots.ts:145-195`.                                                                                                             |
| P1-10 | Renderer loss-range rebuild wipes **every** subscribed transcript and never re-hydrates from local DB (`hydratedThreadRuntimeIds` not cleared); rebuild is not scoped to the gap's threads.                                                                                                           | `src/renderer/electronBackendTransport.ts:216-223`; `app.tsx:254-259`; `chatRuntimePersister.ts:137`.                                                                                                                                |
| P1-11 | Whole-store persistence: any single row change ships ALL projects+threads over IPC and upserts every row; PWA falls back to synchronous full-state `JSON.stringify` + localStorage on the main thread.                                                                                                | `src/renderer/state/dbStorage.ts:247-289,72-79`; `src/main/db/sync.ts:27-60`.                                                                                                                                                        |
| P1-12 | Every mirrored thread row gets fresh object identity on any refresh → all sidebar/header/composer subscribers re-render each 600 ms debounce.                                                                                                                                                         | `src/renderer/state/remoteServers/appRows.ts:109-117,158-166`; `useThread.ts:35-37`.                                                                                                                                                 |
| P1-13 | Per-row `JSON.stringify` compares + full server snapshot GET on every debounced refresh (cost ∝ total host threads, not changed rows).                                                                                                                                                                | `src/renderer/state/remoteServersStore.ts:130-141,1785-1804`; event triggers `eventRouting.ts:3-24`.                                                                                                                                 |
| P1-14 | iOS: unbounded `bufferedBatches` (plus 2 more unbounded buffers) while history loads; the only time bound is a 60 s _idle_ timer that per-chunk resets; resource timeout is a no-op vs the 7-day default. Growth is @MainActor.                                                                       | `ios/App/App/Features/RichChat/Controllers/RichChatTranscriptController.swift:58,181-189`; `ProtocolConstants.swift:49`; `BoundedHTTPBody.swift:100-104`; also `SessionCoordinators.swift:49-61`, `HostSnapshotInstall.swift:43-51`. |
| P1-15 | iOS: parked preserved-upgrade never retries while foregrounded (no `NWPathMonitor`, no timer) → indefinite "connecting" after offline first launch until manual bg/fg.                                                                                                                                | `ios/App/App/Features/Session/PreservedPairingUpgradeController.swift:313-334`.                                                                                                                                                      |
| P1-16 | iOS: generic-error recovery resets `lastSeenSeq` to 0 even when authoritative state exists → full replay re-applied onto live transcript (duplicated deltas).                                                                                                                                         | `ios/App/App/Features/Session/LiveConnectionController.swift:353-362`.                                                                                                                                                               |
| P1-17 | Android: `pendingAgentBaseTransitions` is an unsynchronized list appended from the OkHttp reader thread and iterated on Main → `ConcurrentModificationException` (crash) or silently lost transition.                                                                                                 | `android/.../session/replay/HostStateCache.kt:62-113`; feeder `SequencedReplayController.kt:16-33`.                                                                                                                                  |
| P1-18 | Android: `lastSeenSeq` / `lastSeededSnapshotSeq` are plain fields written from the reader thread and read on Main without happens-before → duplicated deltas or spurious resync. Fix: `@Volatile`.                                                                                                    | `android/.../session/LiveConnectionController.kt:47`; `SessionEventRouter.kt:59,65-136`.                                                                                                                                             |
| P1-19 | Android/iOS streaming jank: markdown re-parsed per delta with no `remember` (Android); full-timeline `project()` recomputed per delta + per-item JSON decode on every projection (iOS).                                                                                                               | `android/.../ui/richchat/RichMarkdownView.kt:35,189`; `RichTimelineView.kt:61`; `ios/.../RichChatTranscriptController.swift:28-30`; `RichTimeline.swift:216-231`.                                                                    |
| P1-20 | No truncate working-status/ownership check host-side: send racing a revert truncates a live turn's items mid-write; no per-thread revert lock anywhere (two clients can double-rollback).                                                                                                             | `src/backend/BackendHostCore.ts:188-210`; `httpRouter.ts:1012-1025`; only provider rollback checks status (`threadSessionManager.ts:807-809`).                                                                                       |
| P1-21 | Provider-rollback failure on a _capable_ provider silently degrades to `local_only` — DB/files reverted, provider keeps the turns → permanent divergence with no user signal.                                                                                                                         | `src/renderer/components/thread/ChatPane/parts/MessageList.tsx:392-397` (contract pinned by `ChatPane.test.tsx:2432`).                                                                                                               |
| P1-22 | Composer prompt rescue is renderer-memory between truncate and restore → renderer death in that window permanently loses the user's prompt text.                                                                                                                                                      | `MessageList.tsx:357-365,407-410`; `revertedPrompt.ts:12-24`.                                                                                                                                                                        |

### 4.3 Weak-network / latency protocol program (the investment area)

Verified from code — the two structural cold-start costs and the ranked wins:

| #   | Win                                                                                                                                                                                                           | Mechanism / cost today                                                                                                                           | Saving                                                                                                                 | Compatibility                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | **Cursor-sync v2 for terminal watches** (chunked baseline + `resume:{generation,cursor}`; design exists at `tmp/v2-production-review/browser-terminal-history/RESUME-V2-DESIGN.md`, zero implementation hits) | Every watch/reconnect re-downloads ≤200 k units even when 0 new bytes; mechanism 3 of the measured 26.8 s failure                                | ~100% of baseline bytes on steady-state reconnect                                                                      | Additive capability; v1 untouched (`terminalCapabilities.ts:26-35` machinery exists)  |
| 2   | **Stop sending the tail twice**: `terminalScrollback` is inlined into thread snapshots _and_ re-delivered by the watch baseline which replaces the display                                                    | 2 × retained tail per cold attach (~50 s of airtime at 32 kbps)                                                                                  | ~50% of terminal cold-start bytes                                                                                      | Additive `omitScrollback` flag for cursor-sync clients                                |
| 3   | **Coalesce consecutive `content.delta` in `RuntimeEventBuffer.flush()`** — helper exists (`src/shared/coalesce.ts:20-33`) and is applied at persistence and client reduce, never on the broadcast path        | ~250–300 B envelope per ~6 B token delta; 15–24 kB/s of envelope alone at stream rate — larger than a 32 kbps link; sub-1 KB frames skip deflate | 30–70% of streaming frame bytes; slows replay-buffer fill                                                              | None — reducers already merge identical-shape deltas                                  |
| 4   | **ETag revalidation cache in `RemoteDesktopClient`** (Electron desktop-as-client never sends `If-None-Match`; undici has no cache; PWA/iOS/Android already revalidate)                                        | Full shell snapshot re-downloaded on every debounced refresh + reconnect                                                                         | ~100% of no-op refresh bytes on desktop-as-client                                                                      | Client-only; the 304-as-error branch becomes the success path (`client.ts:1074-1080`) |
| 5   | **Replace the launch poll loop** (`launchRemoteThread` polls the full snapshot up to 20× at 250 ms)                                                                                                           | Up to 21+ round-trips to learn a thread started; the start response already returns `threadId` and WS events already carry the row               | ~90% of launch-path requests                                                                                           | Client-only (event wait with poll as socket-down fallback)                            |
| 6   | **Parallelize `environment()` with the first snapshot**; fold capabilities into the snapshot                                                                                                                  | 4 serial RTTs before sidebar, 5 before chat usable (~3 s wasted at 1.5 s RTT)                                                                    | 1–2 RTTs per cold connect                                                                                              | Additive schema field                                                                 |
| 7   | **Drop `serverMaxWindowBits: 10`** in WS deflate config                                                                                                                                                       | 1 KB window costs ~30–50% on the large frames that matter                                                                                        | 30–50% on large WS frames (PWA/Android/Electron; iOS has no permessage-deflate at all — which is why 1–3 outrank this) | Negotiation detail only                                                               |
| 8   | Parallelize `resyncOpenThread` history fetches (currently `for...await` per thread)                                                                                                                           | N serial transfers on server-restart resync                                                                                                      | N−1 RTTs                                                                                                               | Client-only                                                                           |
| 9   | Capability-gated batched replay frames (`event-batch`)                                                                                                                                                        | One frame + deflate restart per event, ≤500 per catch-up                                                                                         | ~5–10% replay bytes, 25× fewer deflate restarts                                                                        | Additive + capability gate (old clients would silently drop, hence gate)              |
| 10  | Page `completedTurns`; slim shell-snapshot thread rows; strip inner `threadId` (v11)                                                                                                                          | O(total turns) per open; ~25+ verbose fields × all threads per refresh                                                                           | 80–95% on many-thread hosts                                                                                            | Wire v11 + binding regen — defer                                                      |

Relay streaming (blocks forwarded apps, not chat): HTTP is fully buffered on both hops with
a 60 s total deadline — `relayServer.ts:298-311,345-349,389-390`, `relayHost.ts:359-362,390`.
Minimal additive v3 design (capability-advertised `res-open`/`res-chunk` frames, idle-based
timer, host pauses upstream read on control backpressure) sketched in the relay lane; ~M
effort; chat/terminal traffic already streams per-message over `/ws` and is unaffected.

### 4.4 Parity, UX states, simplification, versioning

**Parity (Electron-as-remote-client diverges from the other three clients):**

- Host settings unreachable — remote settings writes hit the _local_ desktop (`remoteProcedureRoutes.ts:113-114`; hydration early-return `remoteServersStore.ts:248`).
- Schedules view lists the local device's schedules for mirrored projects (`SchedulesView.tsx:308-312`).
- Ports panel browser-only despite live routes (`ProjectAuxiliaryPanel.tsx:115` vs manifest `:310-336`).
- Experiments silently unrunnable on mirrored projects — dialog fills, then per-candidate failures (`experimentActions.ts:209-230`).
- Voice input hidden on remote with no hint (`ThreadComposerSection.tsx:240-241`).
- `native-parity.json` stale in both directions (`runtime.truncated` marked `planned` while both natives implement it, `native-parity.json:4050-4057`; Android MCP UI marked planned while citing its implementation as evidence, `:414-441`).
- Find-in-chat: loaded-items-only everywhere, absent on mobile; no server chat-search procedure.

**UX states (weak link is first-class):**

- False "No messages yet" during/after failed remote thread open; no loading/retry state (`ChatPane.tsx:328,382,436-444`; connecting footer keyed only to local launches `launchSlice.ts:107-113`).
- Checkpoint revert has no in-progress indicator; second press is a silent no-op (`MessageList.tsx:342-344,450-467`).
- Truncate-recovery exhaustion is silent — transcript can permanently disagree with the server with no resync affordance (`truncateRecovery.ts:133-139`; `remoteServersStore.ts:794-807`).
- No stale/offline labeling of the transcript; a 6 px status dot is the only cue (`ChatPane.tsx:436-453`; `RemoteServerStatusDot.tsx:24-29`).
- Approvals vanish optimistically while resolution parks offline (§ P0-8) with no "resolving…" chip (`ThreadRuntimeRequestPanel.tsx:70-88`).
- i18n misses: raw `placeholder="3000"` (`PortsPanel.tsx:577`), raw `placeholder="https://github.com/owner/repo.git"` (`MobileRemoteProjectsSheet.tsx:166`); raw `error.message` passed to toasts/dialogs in 3 places.

**Simplification / provider isolation:**

- Live kind-branches in shared code: `agentKind === "qwen"` retired-model migration (`src/shared/settings.ts:869,958`); vendor regexes in `src/shared/modelLabels.ts:55,84,91`; provider-named shadow home `src/shared/agents/**`; provider settings UI outside `components/providers/` (CursorProviderSettings etc.). Fix pattern: provider-registered declarations (registry), zero shared-file changes per new provider.
- Triplicated with no parity guard: native `ProtocolConstants` scopes/paths/socket policy (Swift `ProtocolConstants.swift:9-58` + Kotlin `:14-53` vs `src/shared/remote/protocol.ts:26-41`, `socketPolicy.ts:4-9`) — generator should own them; pairing-URL grammar implemented 3× (675 lines) with no cross-surface fixture.
- God files: `src/supervisor/skills/SkillsService.ts` (2326), `src/renderer/state/remoteServersStore.ts` (2133, +853 in this range), `src/supervisor/agents/acp/session.ts` (2129), `spawnPipeline.ts` (1577) — extraction paths identified in the lane report.
- Good news: no dead code from the BE move; no AI-slop markers beyond 12 bare `catch {}` in one file; the transcript lane and persistence funnel verified well-engineered.

**Versioning:** 18 of 19 boundaries OK with documented constants, migrations, and tests
(wire 10 with graceful 409 on old clients incl. cached PWAs; backend-host v4 loud skew;
relay v3 mixed-version matrix; binding format 2 build-fail path; journaled 9→10 native
upgrades; DB migrations 42–44 all O(1)). One gap: P0-7 (WSL bridge). One hardening: add a
row version to the new offline IDB cache before its first shape change
(`offlineThreadCache.ts:9-12`).

**Doc drift (fix all in one pass):** `REMOTE_ARCHITECTURE.md:88` "wire 9" (actual 10);
`PORT_FORWARD_ORIGIN_ISOLATION.md:100-103` "relay 2 / wire 9"; `V2_PRODUCTION_READINESS.md:140,147` v9
references; `RELEASE_MOBILE.md:46` wire-version phrasing; `versioning.md:42` store version row.

---

## 5. The plan — workstreams, stages, acceptance gates

Ordering principle: correctness hotfixes first (cheap, independent), the compound
checkpoint operation as its own program, the low-bandwidth protocol program as the flagship
investment, then responsiveness, parity, and QA closure. Stages within a workstream ship
independently unless noted.

### WS1 — Correctness hotfix batch (P0s that stand alone) — ~4–6 d

1. Purge `in_progress` receipts at boot + regression test (P0-1).
2. Apply `capBroadcastEvent` in `BackendRendererStream.publish` + oversize-advance/resync parity with the remote path (P0-2, also fixes P1-4).
3. Fix the red test's token scopes (P0-4); add `session:read` or request the right scopes — then assert `pnpm exec vitest run src/main/remote` green.
4. `command-id-header` idempotency on the truncate route + client header + receipts (P0-5; behavior-preserving for keyless callers).
5. Stale-restore fix: re-read the thread row before restore; write only switch-owned columns; skip if deleted (P0-6).
6. Bump `BRIDGE_VERSION` to 2.17.0 + symlink rejection regression (P0-7).
7. `waitForClient()` rejection timeout wired to server-online state so existing catch/restore paths run (P0-8).
8. Truncate/restore join a working-status check + host-side per-thread lock (part of P1-20; the rest lands in WS2 stage 2).

**Gate:** all of `src/main/remote`, `src/backend`, five web suites green; new regression per fix; typecheck/lint green.

### WS2 — Compound checkpoint operation (the P0 program) — ~14–22 d

Full design from the review lane (failure windows W1–W11 mapped, old plan's superseded
assumptions identified — "freeze numTurns" rejected, native consumers now shipped):

- **Stage 1** = WS1 items 4+8 (ships alone, closes W8/W6/W7 partially).
- **Stage 2** — journal table (migration 44→45) + `BackendHostCore.revertCheckpoint`: frozen server-derived plan, per-thread revert locks, single-flight per `(threadId, operationKey)`, phase-written-before-side-effect, startup reconciliation; prompt text persisted in the journal (closes W9).
- **Stage 3** — capability-shaped provider hooks `createRevertAnchor` / `restoreToRevertAnchor` (idempotent absolute restore) in the base session surface; Claude/Codex/OpenCode implementations (each already computes an absolute target internally); ACP family declares absence → existing `local_only` gating. No provider names in shared code.
- **Stage 4** — backend-host protocol 4→5 + compound remote route `POST /api/threads/{id}/checkpoint-revert` (`command-id-header`); renderer one-call swap (delete `revertingRef`/`revertProgressRef`); iOS migrates off its three-call replica.
- **Stage 5** — protocol regen (manifest/IR/schema/Swift/Kotlin), `native-parity.json` update, Android adoption.
- **Stage 6** — the 13-scenario fault-injection matrix (crash between every external and durable step × reload × two clients × retry × new turn × version mixing), docs updated.

**Gate:** every W1–W11 window has a failing-before/passing-after test; the ambiguity gate
reconciles instead of blind-replaying; `local_only` contract preserved for capability-less
providers; no provider branch in shared files.

### WS3 — Low-bandwidth protocol program (flagship investment) — ~10–14 d

Implement §4.3 wins in ranked order; every change additive or client-only; zero quality
degradation (lossless merges, authoritative supersets, negotiated capabilities):

**Status 2026-09-09 (2): cursor-sync v2 server + web clients LANDED** (commit `cd9505310`,
per `RESUME-V2-DESIGN.md`): wire-v2 chunked baseline (envelope-byte budget, code-point
aligned, ACK credit window, control-frame bypass, per-connection stream caps,
round-robin drain), resume from the retained cache cursor, idle-based deadline resets,
and explicit `unsupported-version` downgrade. Renderer capabilities pick the newest
advertised version per connection. 32 new/updated tests; full protocol + remote suites
(968) green. **WS3 #2 snapshot scrollback omission — LANDED** (commit `4aa5b80af`): `thread-history`
accepts `omitScrollback=1`; the renderer tracks which desktops negotiated cursor-sync v2
and skips the inlined tail on hydration/resync so the watch baseline is the single copy.
v1 clients unchanged. **Measured on a real host + real PTY** (`tests/native-e2e/cursorSyncV2.test.ts`,
evidence `tmp/v2-production-review/shared-host/cursor-sync-v2-*.json`): through the
design-worst shape (32 kbps, 1.5 s RTT, 131,072-unit window) the v1 probe measured
3 attempts / 0 installed / first error at 10.0 s; v2 installs exactly once, zero
watch errors, 36 chunks + 36 ACKs, wire 110,262 B, completion in a single 42.2 s
transfer — and a reconnecting v2 client then receives only the uncovered suffix
(660 units vs the full window). **Heartbeat coexistence proven** (design §12.2): with the production
`RemoteSocketHealthMonitor` (5 s deadline) probing on the production cadence while a
full v2 baseline streams through the 32 kbps / 1.5 s RTT shape, all three probes fired
mid-stream and the worst pong RTT was 2,302 ms — no false death, socket stayed open
(`tmp/v2-production-review/shared-host/cursor-sync-v2-heartbeat.json`). Remaining in
this lane: native iOS/Android adoption of v2 (ledger entries are `planned`).

**WS3-A: agent-statuses payload split — IMPLEMENTED (commit 23d145e0c).**
Measured breakdown of `GET /api/agent-statuses` (230 KB raw / 39.4 KB gzipped, 15
detected agents on the QA host): `capabilities.slashCommands` dominates (28.6 KB for
Claude alone — 55 skill definitions embedding full SKILL.md descriptions in `label`);
`settingDefs` ~0.9 KB per agent; model catalogs are tiny (367 B). The fat fields are
consumed only by the renderer's "/" menu and settings surfaces; native clients
consumer model lists, auth states, and versions. Shipped (additive, wire-v10
compatible, no quality change):

1. ~~Manifest: add optional query param `slashCommands` to the `agent-statuses` route~~
   — done: `slashCommands` 0-or-1 codec on `agent-statuses` + new route
   `GET /api/agents/{kind}/slash-commands` (62 routes); artifacts regenerated;
   native-parity ledger + operation-map updated (additive → binding format unchanged).
2. ~~Server: drop the field when flagged; new route serves one agent's catalog~~ — done
   (`buildAgentStatuses({omitSlashCommands})`, `buildAgentSlashCommands`, 404
   `agent_not_found` for unknown kinds).
3. ~~Renderer: request the slim payload; lazily fetch the open thread's catalog~~ — done:
   desktop store + browser bridge request `slashCommands=0` and splice cached catalogs
   (`slashCommandCatalogs.ts`: per-(endpoint, kind) cache, in-flight coalescing, failures
   not cached); opening a thread fetches that thread's agent catalog on first use.
   Client `GET`s gained a bounded ETag revalidation cache (32 entries) benefiting every
   route, including the new catalog route.
4. Natives: adopt later or never — absent optional field decodes fine; without the
   flag they keep today's fat payload.
   Cold-start effect at 1500 ms/32 kbps: agent-statuses drops from ~39 KB to ~4–6 KB
   gzipped, removing ~9 s of the projected 17–19 s cold start.

5. Delta coalescing at flush (#3, one line) + desktop ETag cache (#4) + launch-event wait (#5) — quick wins first.
6. Cursor-sync v2 (#1) + snapshot scrollback omission (#2) — the measured-blocker fix; include the design's byte-budgeted chunked baseline with credit window and idle/progress-based baseline deadline replacing the flat 10 s.
7. ~~Waterfall work (#6, #8) + deflate window (#7)~~ — DONE (commits `5af17eef8`,
   `7edd2ef1e`): deflate window removed; `connectServer` overlaps the environment probe
   with the first snapshot refresh; `resyncOpenThread` fetches interested threads'
   histories concurrently and applies in original order.
8. Relay streaming HTTP/SSE (additive v3 capability frames) — pairs with WS4.
9. Then measure: re-run the calibrated shaper harness (`tests/native-e2e/constrainedNetwork.test.ts`, profiles incl. `rtt1500ms-32kbps`) against the real UI cold-start; record p50/p95 time-to-interactive and bytes before/after. Deferred v11 items (#10) stay deferred.

**Gate:** 32 kbps / 1.5 s RTT GUI cold start converges inside the 10 s budget (or the
deadline is explicitly redesigned with evidence); transcript/terminal content byte-exact;
`protocol:remote:v3:check` + native suites green.

### WS4 — Relay hardening (multi-client safety through the relay) — ~6–9 d

1. Per-channel outbound byte accounting on the shared control socket; channel-only eviction (`ws-close` per channel) with shared-socket kill demoted to last resort (P1-5).
2. Notify host on relay-side visitor termination (`ws-close` in both failure branches) (P1-6).
3. Pre-measure `req`/`res` frames against `controlFrameLimit`; fail that request only (P1-7).
4. Per-clientId admission caps (16 pending / 32 channels) + global pending cap, 429/1013 (P1-8).
5. Nits: generic 502 bodies, 1013-vs-1012 reason, relay CLI env tuning.

**Gate:** one paused visitor + one chatty visitor + one healthy visitor on one host: healthy
visitor converges, paused visitor isolated, no unbounded queues (extend `relayServer.test.ts`
slow-client suite); streaming design from WS3.4 lands behind the capability gate.

### WS5 — Multi-client responsiveness (supervisor + backend) — ~5–8 d

1. Shed policy for `thread-output`/bulk runtime batches on the supervisor→backend sender + `backpressureTimeoutMs: null` (P1-1).
2. Serialize once: pre-serialized string reused for sizing; project image refs at backend ingest instead of post-IPC (supervisor lane finding 1, ~50–250 ms stalls per multi-MB event today).
3. Wire backend-host pressure into `setOutputBackpressured`; replace PTY pause for rebuildable terminal bytes with bounded buffer + drop-with-resync (P1-2).
4. Make `SupervisorClient.start()` idempotent (P1-3).
5. Adaptive/remote replay-window sizing or delta exclusion so reconnect-under-load doesn't force full resync (P1-9).

**Gate:** 8 concurrent streaming agents + 4 active GUI clients with one stalled client:
no agent death, no >1-frame stall on healthy clients, stop/steer latency bounded; memory
bounds recorded (extends `sharedHostConcurrency`/`sharedHostBackpressure` harnesses).

### WS6 — Renderer performance + UX states — ~6–9 d

Perf: row-scoped persistence replacing `dbSyncAll` (P1-11); identity-preserving projection
cache (P1-12); fingerprint compares instead of `JSON.stringify` (P1-13); scoped loss-range
rebuild + un-hydrate/rehydrate from local DB (P1-10); IDB prune index (P1-11b); offline
cache prune index.
UX: remote-open loading/error/retry state replacing false "No messages yet"; revert
in-progress indicator; truncate-recovery exhaustion banner; offline/stale transcript
labeling; "resolving…" chip for approvals; the 2 i18n placeholder fixes + raw
`error.message` toasts; stale `remote/sync.ts:70-71` comment.

**Gate:** 1k-thread host + streaming: no main-thread stall >1 frame on row changes
(before/after profile); every priority surface has loading/empty/error/offline/disabled
states with localized strings; 12 catalogs 0 missing.

### WS7 — Native clients — ~5–8 d

iOS: 512-cap all three buffers + `requiresAuthoritativeRefresh` (P1-14); foreground retry
for parked upgrades (P1-15); conditional `lastSeenSeq=0` (P1-16); memoized timeline
projection (P1-19); real resource timeout on streaming bodies.
Android: `synchronized` HostStateCache buffer (P1-17); `@Volatile` seq fields (P1-18);
`remember` markdown parse (P1-19); shared base OkHttpClient (finding 5); secondary-socket
seq capture (finding 6).

**Gate:** both full native suites green + new tests for each bound/fence; weak-link manual
items from the QA matrix (I-Stream-3, I-Up-1, A/I-MH-1) executed with evidence.

### WS8 — Parity completion + simplification — ~6–10 d

Parity: Electron-as-remote-client host settings, schedules, ports panel, experiment gating
(+hints for voice-input/MCP drops); refresh `native-parity.json` dispositions + negative
assertion that "planned" entries have no implementation grep; decide find-in-chat (server
search procedure vs honest labeling).
Simplification: provider-registered retired-model migration + vendor label formatters;
generate (or fixture-pin) native `ProtocolConstants` + pairing-URL fixtures; split
`remoteServersStore.ts` (socket lifecycle → `remoteServers/`) and `SkillsService.ts`;
provider settings UI under `components/providers/`.

**Gate:** parity matrix re-audit green for the priority surfaces; provider-isolation grep
clean in shared runtime; no behavior change from pure moves (tests green unchanged).

### WS9 — QA execution — continuous, gates at the end

Run the manual QA matrix (§7) against the retained live stack (backend :63048 protocol 10,
web :63049, emulator-5554, iOS sim 1105C4D6 — all verified alive/available). The matrix's
evidence-gap items (iOS saved-v9→v10 UI upgrade, multi-host transitions, iOS delayed-history
bound, 32 kbps UI cold start, fault-injected web reconnect) map 1:1 to the acceptance gates
above and are the sign-off blockers. Add the two missing automated bounds (Android 512,
iOS cap) as unit tests when WS7 lands. Release matrix items (physical device push, signing,
packaging, accessibility automation) are post-code-block gates per the handoff.

---

## 6. Sequencing and release gate

```text
WS1 (hotfixes, 4–6d) ──► WS2 (compound checkpoint, 14–22d) ──┐
   └──────────────► WS3 (low-bandwidth program, 10–14d) ──────┤
   └──────────────► WS4 (relay, 6–9d) ────────────────────────┼──► WS9 (QA closure)
   └──────────────► WS5 (responsiveness, 5–8d) ───────────────┤    (manual matrix +
   └──────────────► WS6 (renderer, 6–9d) ─────────────────────┤     release matrix)
   └──────────────► WS7 (natives, 5–8d) ──────────────────────┘
                      WS8 (parity/simplify, 6–10d, parallel)
```

WS1 unblocks everything and should land first and alone. WS2/WS3/WS4 are the three
release-blocking programs (data correctness, the user's low-connection investment, and
multi-client safety through the relay). WS5–WS8 can run in parallel lanes after WS1.
Critical path ≈ 30–40 working days of focused work across parallel lanes.

**Production sign-off requires, with evidence:** WS1–WS4 gates green; WS5 load profile
green; per-platform manual matrix executed including the five evidence-gap items; the
§4.4 doc-drift list fixed; final-tree typecheck/lint/full test matrix green (including
`src/main/remote`); native suites + builds green; `protocol:remote:v3:check` green.

## 7. Manual QA execution matrix

The full executable matrix (per-platform steps, expected outcomes, evidence, pass criteria,
automation mapping) was produced by the QA lane and is the working checklist for WS9.
Summary — priority order, portrait only, screenshot inspection mandatory, never clear app
data or touch the C6 simulator:

1. **Pairing/preserved upgrade** — web pair to :63048; fresh Electron smoke; Android existing-v10 connect; iOS existing pairing; **I-Up-1 iOS v9→v10 UI upgrade (no evidence yet — top gap)**; multi-host transitions on both natives.
2. **GUI chat streaming** — count-to-30 turn on all four clients (incremental render, no flicker, Stop ~1 s, no dupes); Stop→follow-up; mid-thread model change; attachments; **I-Stream-3 delayed-history bounded memory**.
3. **Questions/approvals** — question card render/answer; approve+deny; pending question survives client restart; cross-client resolution.
4. **Composer/drafts** — multi-line draft across bg/fg and thread switch; draft survives reload; typing during stream (no lag/occlusion).
5. **Reload/reconnect** — W-Rel-1 reload-then-follow-up continuity; **W-Rel-2 fault-injected missing-checkpoint reconnect (deferred acceptance step)**; A/I-Rel-1 force-stop relaunch; **32 kbps/1.5 s cold start vs 10 s deadline**.
6. **Checkpoints** — revert on all four surfaces; new turn after revert; **two-client convergence (treat anomalies as release blockers until WS2 lands)**.
7. **Files/Git** — tree + file open (iOS header re-check, Android wrapping re-check); external-modify conflict; stage/commit/diff accuracy.
8. **Settings/dialogs/ports** — every section portrait-safe, toggles persist; confirm/destructive/error dialogs; port forward open/close + origin isolation.

## 8. Rejected / superseded assumptions (recorded to prevent re-litigation)

- "Freezing `numTurns` (or a journal alone) closes the checkpoint retry hazard" — rejected:
  a frozen relative count replayed after an executed-but-unrecorded provider rollback still
  re-executes the destructive action. Only an absolute anchor or explicit ambiguity gate
  closes it (WS2 stages 3–4).
- `COMPOUND-OPERATION-PLAN.md` §2.4 ("natives drop `runtime.truncated` at decode") is
  stale — both natives now consume it, and iOS runs its own three-call compound that must
  migrate to the backend-owned operation.
- "Send fewer bytes" alone cannot fix first-attach cold start (resume design §1), and
  resume alone cannot fix reconnect re-sends — WS3 must land items 1+2 together.
- Removing browser forwarding remains a product decision, out of scope for this plan.

## 9. Deferred (explicitly)

Wire-v11 payload reshaping (inner `threadId` strip, completedTurns paging, slim snapshot
rows) — real savings on many-thread hosts but requires binding regen; do after the v10
fleet stabilizes. Pre-existing full-`.all()` normalize migrations (e.g. 41) — memory-heavy
on huge DBs but not a v2-range regression. Landscape testing — excluded by user instruction.
