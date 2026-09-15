# V4 merge gates — authoritative completion plan

**Approval:** on 2026-09-14 the user explicitly approved **"Use the five merge gates (recommended)"** as the V2→master completion target. This document is the authoritative merge-gate plan from that date forward.

**What the approval keeps:** the original stability and performance requirements, the **24-hour controlled soak + 72-hour candidate observation**, supported-platform/direct/relay/mobile-web coverage, real-provider families and changed-provider behavior, required native contracts/build/tests, and the measured-master comparison requirement.

**What the approval moves:** OPTIONAL V4 optimization breadth becomes **post-merge backlog** — it is no longer required to finish before merge. The 63-step document (`tmp/v4-plan-status/2026-09-14-76d6e2ea3.md`) is the broader roadmap, not the merge requirement.

**Non-negotiable (never deferrable as "optional"):** standalone attachment/custody/zero-client behavior, durable settings authority, known operation/shutdown defects, local renderer global shedding, bounded histories including completed-turn metadata, PWA/upgrade safety, and the actual 120 Hz / UI / latency / resource gates. A confirmed unsafe or unbounded path stays mandatory.

**Ownership and batching:** root owns architecture, boundaries, evidence consolidation, and integration. Work runs in larger batches with parallel lanes and separate file ownership; during authoring each lane runs only the focused regressions needed to prove its change. At a batch boundary the source freezes and one consolidated independent critic plus broad checks plus runtime/manual before/after verification runs once; findings resolve, affected verification reruns, and the verified milestone commits as one complete commit. This document is maintained at freeze boundaries; per-lane evidence lives in the cited batch reports. The tracked roadmap is `docs/V4_MERGE_READINESS_PLAN.md` with execution evidence in `docs/V4_EXECUTION_LOG.md`; the `tmp/v4-plan-status/` snapshots are retained as dated approval-time evidence only.

**Merge verdict today: NOT READY. None of the five gates has passed as a whole.**

## 1. Baseline at approval time

Published HEAD: `poracode/v2` @ `76d6e2ea3` (F7 per-window direct `49f461040` and F8 off-main HTTP `787872f7a` published; Android setup repair `76d6e2ea3` independently passed Android build/unit/lint/API 26+37).

| Check                                         | Result                                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Push CI `34898815077`                         | **Failed** — renderer shard unhandled `window is not defined` (`SubAgentOverlay.test.tsx`) |
| Push Native CI `34898815227`                  | **Failed** — iOS gate                                                                      |
| PR CI `34898823739` / PR Native `34898823746` | Green (synthetic merge SHA, does not waive push failures)                                  |
| Full CI green                                 | **false**                                                                                  |

Open candidates (all uncommitted at approval time):

- **Renderer 2-file fix candidate:** 39 focused tests pass; before/after evidence in `tmp/v4-renderer-ci-fix/REPORT.md`. Combined/live/hosted verification pending.
- **iOS first candidate:** full 1270 + 173 portable passed — proves cleanup amplification only; original 20.5 s CI cause still unknown. Root found failure flags were sampled AFTER joining the task (always finished); correction active (`f974ab4c21e3`) capturing state before cleanup. Reports in `tmp/v4-ios-ci-experiment/`.
- **Large-reply delivery (Phase 3.6), active `89fc5c59b7ae`:** stream 5→6 candidate unverified; actual-client-transport after-evidence pending. No full F9 client-engine claim (scratch paths containing `f9` refer to this reply milestone; plan F9 = off-thread client engine, open).

Published contract generations (recorded, **not assigned here — do not generate new versions from this lane**): host 13, stream 5, facade 11, HTTP bridge 2, remote 12, relay 3. The active reply candidate proposes stream 6.

Older roadmap posture (do not copy stale ledger rows such as "reply execution not started"): phases 0–5 and 7 in progress; phases 6 and 8 pending.

## 1b. Current freeze (2026-09-14, uncommitted — no gate passed as a whole)

Root HEAD and `origin/poracode/v2` match `ffe4f0f898cd705761c67ead9d444313f7dc0d10`; master `0c99e7e136` remains an ancestor. Two upstream merges since the original `76d6e2ea3` base are preserved and are **not** this batch's work: `7e6cd5d06a` (#772 Antigravity credential cache via host secret store) and `ffe4f0f898c` (#773 GroupSummarySection/shimmer cleanup). Worktree candidates below were based on `76d6e2ea3`; none of their touched files overlap the upstream delta (GroupSummarySection/ToolCallGroup, locales, Antigravity), so integration neither downgrades upstream nor claims it.

Published-`ffe4` CI (`tmp/v4-current-batch-ci/STATUS.md`): push core CI, PR core CI, and PR Native CI pass; **push Native CI fails on the Android 17 emulator runtime job** (boot/install/launch/instrumentation step). The failed-job list contains no iOS job — do not carry the old-`76` iOS failure forward as the current failure. Cause is still under read-only diagnosis; no reruns, suppressions, or workflow changes performed.

Frozen authoring candidates (each focused-green, each pending the ONE consolidated critic + broad-check + runtime cycle and the single milestone commit):

- **Large-reply delivery (stream 6):** bounded framed transfer complete incl. the verified drain-phase ACK-spin defect/fix (drain loop awaited the immediately-resolving credit gate → infinite microtask storm, no transfer ever completed; fixed with a dedicated pend-for-next-ACK waiter). Evidence: `tmp/v4-reply-delivery-implementation/REPORT.md`.
- **Renderer unmount fix:** ChatScrollControls `pinRaf` leak, fails-before/passes-after, 19 + 20 (SubAgentOverlay) focused passes. Evidence: `tmp/v4-renderer-ci-fix/REPORT.md`.
- **iOS diagnostics correction:** state captured at timeout before release/cancel/join (prior read-after-join always showed finished). Corrected target + 50-suite evidence applies to the corrected blob (`bd17e3a89024`); the earlier full-1270 AppTests + 173 contracts belong to the prior blob. The original 20.5 s CI cause remains **unknown** — never call it fixed. Evidence: `tmp/v4-ios-ci-experiment/correction/00-correction.md`.
- **Slow-renderer isolation (F10):** removed global supervisor terminal shedding from single-renderer congestion; per-client bounds + local recovery preserved. Evidence: `tmp/v4-renderer-isolation-batch/REPORT.md`.
- **Standalone attach (Gate 2 slice, integrated this freeze):** Electron as client of an already-running headless owner — decision before lease/fork/key init, authenticated describe, OAuth pairing via the real `RemoteDesktopClient`, fail-closed refusal/quit; 27 focused + 70 adjacent + 11 pair-subset passes; no version bumps. Evidence: `tmp/v4-standalone-attach-batch/REPORT.md`.
- **Checkpoint identity (Gate 3 slice, integrated this freeze):** fixes the verified destructive same-ID supersede defect (same-ID retry after another client's turn became a second destructive revert on local-direct, while HTTP replayed a stale outer receipt so deliberate second actions went stale) — fresh user-intent IDs, pending same-ID retries, exact settled replay with no superseding, explicit-location validation, HTTP outer-receipt coherence; 25 domain + 86 ChatPane focused passes; no version/storage bump. Evidence: `tmp/v4-checkpoint-integrity-batch/REPORT.md`.
- **Review state:** critic `c32` ended empty with no REPORT/findings — no completed review exists. The combined freeze report is `tmp/v4-combined-foundation-batch/REPORT.md` (exact manifest, hashes, identities, pending gates).

## 1c. Consolidated status (2026-09-15, uncommitted — no gate passed as a whole)

> Historical: §1c records the initial 47-path cycle, superseded the same day by the corrected 50-path
> cycle in §1d. Its open failure rows no longer describe the candidate; current truth is §1e.

Identity unchanged from §1b: HEAD `ffe4f0f898cd705761c67ead9d444313f7dc0d10` == `origin/poracode/v2`, master `0c99e7e136` ancestor; 47 paths (25 tracked-modified + 22 untracked-new) + foreign `.poracode/` excluded; index clean. Freeze manifest `tmp/v4-foundation-qualification/FREEZE.json` (`candidate_sha256 b12666aeb5…`). The candidate is uncommitted, so no CI SHA exists for it and no current-candidate CI green can be claimed.

ONE broad-check + runtime cycle ran at the frozen SHA (`tmp/v4-foundation-qualification/REPORT.md`); ONE independent findings-only critic ran read-only (`tmp/v4-foundation-review/REPORT.md`); the coordinator reconciliation (`tmp/v4-orchestration/FOUNDATION_REVIEW_RECONCILIATION.md`) overrides unsupported critic reasoning.

| Check (frozen SHA)                             | Result                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `typecheck`                                    | **FAIL — 13 errors**: attach lane 9 (`standaloneAttach.test.ts` 2, `main.ts` 5, `clientRuntime.standaloneAttach.test.ts` 1, `remoteServersStore.standaloneAttach.test.ts` 1) + checkpoint lane 4 (`ChatPane.test.tsx` narrow `{threadId}` mocks cast to `{operationKey}`; corrected in this batch, other-lane errors remain in their lane) |
| `lint` (plain + type-aware, `--deny-warnings`) | **PASS**                                                                                                                                                                                                                                                                                                                                   |
| `fmt:check`                                    | **FAIL — 3 files** (`.agents/docs/versioning.md`, `docs/V4_MERGE_GATES.md`, `docs/V4_MERGE_READINESS_PLAN.md`; formatted in this batch, content unchanged)                                                                                                                                                                                 |
| `protocol:remote:v3:check`                     | **PASS**                                                                                                                                                                                                                                                                                                                                   |
| `test` (full vitest)                           | **FAIL — 3 tests** in `src/backend/supervisorEventRelay.test.ts` (composed-with-real-ownership trio, stream-message timeouts; possible isolation + stream-6 interaction; owner diagnosis required, not a limit change)                                                                                                                     |
| `build`, `build:web`, `prepare:server-native`  | **PASS** (chunk-size warnings only on web)                                                                                                                                                                                                                                                                                                 |
| `native:e2e`                                   | **FAIL — 2 tests** (`cursorSyncV2` + `sharedHostLoadProfile` warmup markers never appeared; PTY env contamination suspected but **not proven** — recorded as failures, 176 pass)                                                                                                                                                           |

Runtime: mock baseline PASS (5 automated + 5 mock smoke gates, 0 console/runtime errors); large-reply AFTER PASS on the production `ElectronBackendTransport` — same-case 3,313,837 B (`sha256 2dc684a2…`) byte-identical to the BEFORE identity, plus 32 MiB-class 29,495,405 B hash-verified. NOT proven: second real window with failed-direct + barriers, cancel/navigation/close cleanup, no-replay/no-fallback-after-admission proof, frame/credit bounds, zero steady-state bulk main IPC with instrumentation. Outstanding: full baseline, multiwindow/IPC probes, real attach, checkpoint dialogs, mobile web.

Review: critic F1 (unreachable-owner refuse blocks post-crash launch) is the ONE milestone-blocking correction — accepted within the reconciliation's bounds: stale readable discovery + dead owner must reach the existing acquire-before-mutations path, never infer authority from connection failure; a live lock-holder still blocks takeover; incompatible/non-ready/invalid-auth/stale-generation/mismatched-root stay refusals; phantom opt-in-flag comments removed; lease-free crash test + real kill/relaunch proof required. Crash-recovery/dataRoot continuity stays under investigation — no blind managed-takeover claim. F2 rationale is invalidated by token persistence (persistent auth store restores unexpired sessions; the same bearer authenticates in a new store): only the pairing-time/describe generation bound is currently proved; the ongoing generation contract remains Gate 2 lifecycle work. F3 (wire or delete the unused attach DB guards; credit handler-absence, not guards), F4 (invalid attach info must not select the managed renderer runtime as fallback; keep older managed-preload compat; no unlocalized strings) ride the same single correction batch. F5 doc-format leftovers are fixed in this batch.

Native CI: the original Android-17 emulator runtime failure and the iOS 20.5 s stall causes remain UNKNOWN; diagnostics are not fixes.

**Merge verdict today: NOT READY. No entire Gate 1/2/3/4/5 pass and no current-candidate CI green.** Milestone-commit preconditions are the collected corrections (attach crash-recovery + guard/bootstrap disclosure, remaining type errors, stream-trio diagnosis, native-e2e env isolation) plus the unmet live harnesses above.

## 1d. Corrected verification (2026-09-15, uncommitted — no gate passed as a whole)

Identity unchanged from §1b: HEAD `ffe4f0f898cd705761c67ead9d444313f7dc0d10` == `origin/poracode/v2`;
master `0c99e7e136` is the last-known ancestor (publication rechecks it later — never call it current
latest); index clean; foreign `.poracode/` excluded. Corrected freeze
`tmp/v4-foundation-corrected-verification/FREEZE.json` (`candidate_sha256 1da58db4…7754`): 50 paths —
the 47 plus exactly the 18 correction paths (15 changed + 3 new:
`supervisorEventRelay.test.ts`, `electronBootstrap.standaloneAttach.test.ts`, `realHostProcess.ts`).
The 32 unchanged paths reuse prior review/qualification evidence without reopening; the corrected report
reused that evidence and reviewed only the 18 correction paths — it is not a second full architecture
review. The candidate is uncommitted, so no candidate exact-SHA CI exists; the published-`ffe4` CI below
is NOT candidate CI and local checks never substitute for it.

| Check (corrected freeze)                       | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `typecheck`                                    | **PASS** — prior 13 errors gone (stream-test canonical version, typed checkpoint mocks, attach bootstrap/types)                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `lint` (plain + type-aware, `--deny-warnings`) | **PASS**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `fmt:check`                                    | **PASS** — prior 3 files fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `test` (full vitest)                           | **2 failed / 13,973 passed / 119 skipped** — prior stream trio FIXED (stale v5 literals now send canonical version 6; stale-version rejections untouched). The 2 failures are `PortsPanel.test.tsx` + `PrWatchControls.test.tsx`, outside freeze/correction scope, diagnosed as test synchronization races; a two-line TEST-ONLY patch is prepared but NOT integrated (`tmp/v4-ui-test-correction/REPORT.md`, `ui-test-correction.patch`; isolated focused 25/25 pass, no full suite with the patch yet). Candidate pending integration + final full test — never full-suite green |
| `native:e2e`                                   | **PASS — 54 files / 178 tests, 1 skipped** (prior 2 warmup failures fixed: harness answers the interactive-shell problem with child-local `bash`/`sh` + UTF-8 locale; no relaxed timeouts/assertions)                                                                                                                                                                                                                                                                                                                                                                              |
| `build`, `build:web`, `prepare:server-native`  | **PASS** each, sequenced                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `protocol:remote:v3:check`                     | **PASS reused** — zero modified files under `src/shared/remote/`, contract inputs unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

Corrections folded into this freeze (`tmp/v4-foundation-test-correction/REPORT.md`,
`tmp/v4-foundation-cleanup/REPORT.md`, `tmp/v4-attach-correction/REPORT.md`): stream-test literals use the
canonical version; the native harness pins child-local shell/locale; checkpoint mocks are accurately typed
with formatting fixed; attach has strict owner bootstrap, types, and cleanup. Stream version is 5 → 6;
host 13 / facade 11 / bridge 2 / remote 12 / relay 3 unchanged; no protocol/persistence shape change from
these corrections. Bounded scope, no expansion: reply framing/admission plus the ACK-drain fix
(`tmp/v4-reply-delivery-implementation/REPORT.md`), congestion isolation
(`tmp/v4-renderer-isolation-batch/REPORT.md`), fresh deliberate operation UUIDs vs retained retry
identity/journal replay (`tmp/v4-checkpoint-integrity-batch/REPORT.md`). No universal at-most-once claim;
no full Gate 3 claim.

Attachment reconciliation is SETTLED (`tmp/v4-orchestration/FOUNDATION_REVIEW_RECONCILIATION.md`,
`tmp/v4-attach-recovery-decision/REPORT.md`): headless `.host-v1` data and canonical desktop data are
DIFFERENT mappings despite the shared owner lease — never route a headless crash to the managed desktop
fallback merely because the lease is free. Headless stale/unreachable fails closed; only
connection-level unreachable DESKTOP-mapping evidence may defer to the managed path, with lease admission
before writes. Automatic same-root headless recovery remains Gate 2 lifecycle work. The original critic's
blanket fallback remedy is rejected, as is the claim that bearer invalidation already pins owner
continuously (verified source evidence: unexpired persisted remote auth sessions survive owner restart —
the current guarantee is describe/pairing generation checks, not continuous dataplane owner-generation
pinning). Corrected optional standalone getter: a missing optional getter or explicit null permits
managed; `undefined`/malformed/rejection from a PRESENT getter fails closed. Phantom fallback comments and
unused guard helpers removed.

iOS diagnostic correction (`tmp/v4-ios-ci-experiment/correction/00-correction.md`): the final snapshot is
captured BEFORE cleanup; the current final blob carries only targeted + 50-suite evidence, while the
earlier full 1270 AppTests + 173 contracts applied to a prior blob. The original CI timing cause remains
unknown. Android diagnostic (`tmp/v4-android17-timeout-diagnostic/REPORT.md`,
`tmp/v4-current-batch-ci/android17/REPORT.md`): only phase-5 local state capture on the existing 2 s
interrupt-wait timeout; assertions and the 9-test count preserved; JDK 21 AndroidTest Kotlin compile PASS.
Diagnosis only — the underlying Android CI issue is not claimed fixed.

Published-`ffe4` CI (`tmp/v4-current-batch-ci/STATUS.md`), NOT candidate CI: push core `34905657229` PASS;
PR core `34905662070` PASS; PR native `34905662046` PASS; push native `34905657228` FAIL (Android 17
phase-5 timeout, 8/9 pass; the aggregate gate follows). Never declare CI green based on local checks.

Payload evidence stays bounded: the actual-Electron evidence is the same 3,313,837-byte data hash and the
29,495,405-byte (~28.1 MiB) data hash delivered via actual `window.poracode`/`ElectronBackendTransport` —
payload identity only, NOT proof of 120 fps or the whole performance envelope.

Live qualification was pending at this freeze; it completed later the same day against later freezes of
the same HEAD — final per-case results and verdicts are in §1e. The block above is the accurate
record of what §1d knew at its own freeze boundary.

**Merge verdict today: NOT READY. No entire Gate 1/2/3/4/5 pass and no current-candidate CI green.**

## 1e. Final runtime/test/publication results (filled 2026-09-15 — coordinator)

**Candidate progression after §1d** (all at HEAD `ffe4f0f898cd`, uncommitted): corrected-50 (§1d) → 59-path native-attach correction freeze (`tmp/v4-foundation-muse-freeze/FREEZE.json`, candidate `4037470e…`) → 62-path (real updater actions, shared quick-composer lifecycle wiring, strict attach preload getter; `tmp/v4-attached-native-freeze/FREEZE.json`, candidate `40b400578e…`) → **final 66-path** (`tmp/v4-attached-native-freeze/FREEZE-66.json`, candidate `54168a10bf7bfaec…`): the 62 plus the checkpoint command-id/anchoring correction (previously-clean `src/shared/contracts/thread.ts` + `src/shared/remote/client.ts`, new `checkpointRevertIdentity.ts` + its test, updated `MessageList.tsx` + `ChatPane.test.tsx`). Set-math: 66 = 54 unchanged prior-59 + 5 changed prior-59 + 3 newly included (`quickComposerLifecycle.ts`/`.test.ts`, `preload.standaloneAttach.test.ts`) + 4 correction paths; nothing dropped.

**Broad checks** ran once at the 59-path freeze and are reused for unchanged inputs (no source beneath them changed later): all 9 commands green — typecheck, lint (plain + type-aware, `--deny-warnings`), `fmt:check`, `protocol:remote:v3:check`, `build`, `build:web`, `prepare:server-native`, full vitest **13,986 pass / 119 skip**, `native:e2e` **178 pass / 1 skip** (`tmp/v4-foundation-muse-checks/`). Later correction deltas were verified with focused suites per the batching rules: 105 focused (native-attach correction), 22 + 53 nearby (updater/quick-composer/preload), **115/115** (command-id/anchoring: new `checkpointRevertIdentity` tests 9/9 incl. worst-case projected-id header fit, ChatPane 86/86, revert + HTTP-coherence 20/20), each with typecheck + touched-file lint/format green. Final artifacts rebuilt at the 66-path candidate: `dist/main/server.cjs` `468db805…`, `dist/main/main.cjs` `e7a4cdd5…`, renderer dist rebuilt with the fix (`tmp/v4-native-final-live-qualification/BUILD-66.json`).

**Live qualification final** (`tmp/v4-native-final-live-qualification/REPORT.md`, §§1–6):

- **Stream (frozen build): 17/17 PASS** — qualifying run `~/.poracode-stream-harness/run62-1789490959`, incl. R4b destroy/capacity-recovery with a real subscribed data event (`eventsSeen=1`, `heldAcks=4`, true destroy), R9 with a real socket close → genuine `"Backend renderer transport disconnected."` rejection, main-process observer delta 0, exactly-once (32→30 exact keep-tail), both windows bound, control/bulk/perf baselines exact-hash. The three earlier stream FAILs were **harness staging defects** (pause inverted the fire order so the request landed outside the suppression window; `Network.emulateNetworkConditions` does not suppress an established WebSocket; idle-window bracket accounting could never close) — independently adjudicated harness-side by two lanes, fixed with strengthened assertions (dispatch-observed gating, real send-hook socket close), and re-qualified on the unchanged frozen build.
- **Standalone attached: 8/8 PASS on the corrected build** (`~/.poracode-standalone-harness/final66d-1789497848`): attach pinned to owner generation with local authority refused, app-originated command + settings write/persist/restore, native quick-composer toggle/inspect, checkpoint API retry semantics (same-ID replay preserves later work, new-ID acts, conflict rejected), attached checkpoint dialog full journey (Confirm closes the dialog, journal `ckpt-revert.<uuid>` `completed_local_only` with files+truncate completed, file restore, skip pref persists, skip leg no-dialog), quit + crash drill (owner serves after quit; SIGKILL → loud refusal, custody unchanged, no restart).
- **Desktop-web Chrome: PASS** (`web62-1789498064`) — pairing → fixture row → dialog → Cancel zero-side-effects → Confirm `200 completed_local_only`, owner truncates, skip pref persists.
- **iOS Safari (real simulator, idb-driven): PASS** (`final66b-1789498593-safari`) — full confirm/skip journey incl. journal row, file restore, skip leg.
- **Bounded real BigPickle chat (Dev app, real composer): PASS via the symlink-free control path** (`tracereal-1789504857`) — real model picker → Big Pickle → real Launch click → assistant reply rendered, status idle, `lastTurnStartedAt` +4.5 s. The earlier stalls (`bp62-*`, `bp66d-*`) are a **pre-existing product defect outside this candidate**: the opencode V1 adapter's SSE event hub routes events by exact directory string match while the opencode server reports realpath'd directories, so any project path containing a symlinked segment (macOS `/var/folders` tmpdirs) silently drops every event — no error surfaced, thread stuck "working", turn output never persisted (trace: `sdkEventHub.ts:224-227` discard vs `sdkClient.ts` lexical `resolveOpenCodeSessionDirectory`; runs `trace66-1789502673` candidate, `tracehead-1789504044` HEAD-clean identical stall, defect from July `c8d2944b4`/`31523adee`, zero candidate files under `src/supervisor/`). Follow-up fix tracked (realpath canonicalization + regression test); until then provider smoke harnesses must use a symlink-free scratch base.
- **Two product defects found by this qualification and fixed in the final candidate:** (1) checkpoint revert command-id overflow — the UI minted the operation key from the projected thread id (127-char key; +18 prefix = 145–153 > the 128 router gate) so every attached/web confirm was rejected `400 invalid_command_id`; fixed with bounded `ckpt-revert.<uuid>` keys and a schema max derived from the router budget (`thread.ts`), the prefix constant shared via `client.ts`; (2) checkpoint revert anchor mismatch — the revert UI targeted the nearest assistant row while capture anchors the closing turn's last visible item; reconciled in `checkpointRevertIdentity.ts`. Both re-proven live on all three surfaces above (one defect, three surfaces: attached Electron, desktop-web, iOS Safari).
- **Environment incidents during qualification** (recorded; none affect the evidence): an Xcode auto-update left `/usr/bin/git`, `cc`, and `simctl` license-blocked 12:21Z–14:18Z (failures in that window are not product evidence); two agent-turn infrastructure deaths (provider-handoff teardown 07:56Z; provider network failures 15:52Z) were resumed with evidence preserved; provider-side 502/rate-limit/socket errors were absorbed by retries.

**Final full `test` with the integrated `tmp/v4-ui-test-correction/ui-test-correction.patch`: NOT run.** The two races (`PortsPanel`, `PrWatchControls`) are outside freeze scope; the prepared test-only patch remains unintegrated and must be integrated in the next full-suite cycle. It does not gate this milestone's focused-verified claims.

**Publication:** milestone commit + non-force push to `origin/poracode/v2` executing after this fill; exact-SHA push/PR CI results for the published candidate will be appended below when available.

- Publication recheck (root HEAD, `origin/poracode/v2`, master ancestor, candidate CI SHA): _pending at fill time — appended after push._
- Merge verdict: **NOT READY.** No entire Gate 1/2/3/4/5 pass; candidate CI pending at the published SHA; 24 h soak + 72 h observation remain. This § records a verified milestone, not a gate pass.

## 2. The five gates

Numeric targets below are **targets, not measured passes** (source: readiness plan §7). The master comparison allows **no more than 10% deterioration in p95 latency or peak resources**, with an absolute noise allowance fixed from repeated baselines; V2-only journeys must pass absolute gates.

### Gate 1 — Close current work and stabilize CI

Required result: reviewed large-reply delivery, reviewed CI corrections, clean intentional protocol generations, exact published candidate checks green. No new protocol/codec project.

Pass conditions (all must hold on one exact candidate SHA):

1. Phase 3.6 reply candidate frozen, independently source-reviewed, with before/after evidence on the **actual client transport**: payload identity (incl. 32 MiB-class and the 3,313,927-byte before-case class), no replay, receiver credit/cancellation, multiple windows, zero steady-state main bulk, cleanup.
2. Renderer cleanup correction verified: new unmount regression fails before / passes after, 39 focused tests pass, touched lint/format pass, **combined** verification plus live UI closure plus hosted CI at the candidate SHA.
3. iOS gate cause resolved or appropriately bounded with evidence: corrected diagnostics (state captured **before** cleanup), reproduced-or-bounded original 20.5 s stall, required native checks green at the candidate SHA. A rerun, skip, or higher timeout is not a fix.
4. Compatibility inventory complete for the candidate: every generation bump intentional and consumed everywhere (incl. native reducers); generated-contract checks pass; no stale "Electron main owns the database" descriptions.
5. Exact-candidate push CI **and** PR CI fully green at the published SHA; merge-triggered PWA deployment gated/staged so a master merge cannot publish an unqualified client.
6. Result committed as **one complete milestone** (fewer milestone commits per user request).

Current position: consolidated review + broad checks + full live qualification completed 2026-09-15 on the final 66-path candidate (§1e): stream 17/17, standalone 8/8, desktop-web and iOS Safari journeys PASS, two product defects found and fixed in-candidate with three-surface live re-proof, BigPickle chat PASS via symlink-free control (pre-existing out-of-scope defect recorded with fix plan). Full suite 13,986 green at the 59-path freeze with unchanged inputs reused; the two out-of-scope UI-race tests' patch awaits the next full-suite cycle. Remaining for Gate 1: exact-candidate push + PR CI at the published SHA (executing with the milestone commit, §1e). **Gate 1: not passed — pending published-SHA CI.**

### Gate 2 — Complete standalone ownership

Required result: Electron discovers/attaches/starts one authority; settings and durable work belong to it; safe credential migration and unattended restart; zero-client operation; independently installable server. Reuse existing host/remote foundations.

Pass conditions:

1. Both launch orders proven with concurrent-launch evidence: exactly one writer per data root (common lease enforced, incl. legacy-version coexistence and stale-owner protection); second client attaches to the healthy owner and rejects incompatible owners without starting a second authority.
2. Explicit server stop semantics implemented and proven: closing every client leaves accepted provider work and schedules alive (standalone mode).
3. Settings authority closed: all remaining writers moved, stale full-state replacement rejected, concurrent-edit evidence; device-only preferences stay local.
4. All durable event effects verified with **no mounted renderer**; remaining main-handler audit complete.
5. Real credential custody/migration proven: server restart accesses authorized credentials with **no Electron client present** (in-memory-only unsealed key is insufficient).
6. Standalone server installed **outside the checkout** on supported targets without Electron/dev dependencies: ABI/assets, data paths, service startup, health, diagnostics, backup, upgrade, recovery + runbook.

Current position: common lease, owner status, backend settings slices exist; connected external-headless attach candidate frozen and integrated (decision-before-lease, authenticated describe, OAuth pairing, real-client bootstrap, fail-closed; 27 focused + 70 adjacent + 11 pair-subset green; no version bumps) reviewed and corrected in the 50-path freeze (§1d: mapping-split refuse/defer,
phantom-flag deletion, truthful generation memo; same-root headless restart stays Gate 2 lifecycle work);
**live-proven on the final candidate (§1e): real attach pinned to owner generation with local authority refused, settings write/persist/restore through the attached app, app-originated commands, native quick-composer, owner serves after client quit, SIGKILL loud-refusal with custody unchanged.**
Full lifecycle, credentials, install qualification remain. **Gate 2: not passed.**

### Gate 3 — Close operation and lifecycle defects

Required result: no duplicate external action after response loss/retry; canonical checkpoint identity; incompatible mutations coordinated; late callbacks fenced; admitted work joined before DB closure.

Pass conditions (each demonstrated through the **real consuming transports**):

1. Checkpoint disconnect repair re-proven through final production artifacts and all required transports (prior dev-Electron slice is not sufficient).
2. Operation identity: same-ID retries always reference the original frozen action after another client adds work; each deliberate new action gets a new ID — proven with a two-client conflicting-action scenario.
3. Journal authority complete: authority/target/fingerprint/revision binding, response-loss reconciliation (accepted mutation + lost response + later work), crash-boundary evidence.
4. Mutation races closed: delete/transcript replacement, worktree coordination, held-phase races; unrelated threads and Stop stay responsive.
5. Truthful-outcome matrix complete across transports (running/retryable/completed/ambiguous, no-replay), with visible disclosure on the shared Electron/web renderer; no automatic external retries. Native UI disclosure remains separate development work (native clients stay development clients); native shared-contract compatibility, compilation, and relevant reducer/transport tests must remain valid.
6. Shutdown complete: provider descendants, Windows/outer-process deadlines, late continuations fenced, **no post-close writes**; kill-at-boundary evidence (process kills, shutdown under work, subsequent healthy provider turn).
7. Supervisor generations fenced across supported lifecycles/platforms (replacement/crash/late-reply).
8. Durability budgets proven: durable receipts precede durable acceptance ACKs; canonical-history vs recent-terminal loss quantified under process crash and machine/power failure.

Current position: several fixes implemented with scoped evidence; checkpoint-identity slice frozen and integrated (fresh user-intent IDs, pending same-ID retries, exact settled replay/no superseding, explicit-location validation, HTTP outer-receipt coherence; 25 domain + 86 ChatPane focused green) reviewed and corrected in the 50-path freeze (§1d; no
universal at-most-once claimed); **the qualification then found two further checkpoint-revert defects (projected-id command-id overflow rejected by the router gate on every remote surface; revert anchor mismatched capture identity) — fixed in the final candidate and live-proven on attached Electron, desktop-web, and real iOS Safari incl. dialog/cancel/skip-pref/file-restore/journal journeys (§1e); admitted destructive request with suppressed reply delivery proven rejected-on-disconnect with zero fallback redispatch through the real stream transport.**
Broader crash/reconciliation/descendant evidence remains. **Gate 3: not passed.**

### Gate 4 — Meet the supported performance envelope

Required result: eight producers, four active clients plus one stalled client; bounded queues and histories; healthy-client isolation; main bulk bypass; UI and latency budgets; no material regression against measured master.

Fixed workload (all measurements): 8 active producer sessions, 4 active clients + 1 stalled client, up to 1,000 stored threads, 4,000-item active history served as bounded tail; scaling points 1/2/8/32 connections; stress fixtures 10,000 threads / 20,000 items; multiple real credentials. Record exact data/build/hardware/toolchain; freeze sampling method; keep performance runs isolated from builds and heavy work. Report p50/p95/p99/worst with sample counts.

Pass conditions:

1. **Main bulk bypass** re-proven in the full matrix (≥2 real windows, one failed direct connection, 8 producers, large histories/transfers, continuous input/resize/native-menu use): zero steady-state main bulk, no leaks/duplicates.
2. **Client off-thread outcome** (flexible scope, fixed measurement): either the comprehensive shared worker-engine redesign **or a smaller off-thread extraction** — whichever is built must pass the same measured gates: decode/validation/sequence/index/history/persistence off the UI thread; one budgeted drain per view with canonical order, meaningful ACKs, explicit overflow resync; worker-owned persistence with draft/cache migration and recovery.
3. **Bounds:** every queue has owner + byte/count/age/concurrency limits + recovery evidence end to end; per-client and global budgets for history/Git/image/transfer with deadlines, coalesced reads, revision-aware caching (fairness demonstrated, not just limits counted); bounded histories **by bytes incl. completed-turn metadata**, paged with lazy large bodies (bounded item count alone is insufficient); terminal hydration/parsing bounded with exact final output after delay/freeze without pausing the real PTY.
4. **Isolation:** one congested local renderer causes **no** global supervisor terminal shedding (recovery local to the affected subscription/client); stalled peer causes no healthy-client close/resync and healthy latency stays within its gate, both relay directions over a shared bottleneck; Stop/approvals/control have reserved capacity and priority under saturation without invalid ordering.
5. **Measured budgets pass** (targets, §7): 120 Hz (≥99% on-time opportunities, p95 UI work/frame ≤6 ms, no stream-attributable task >50 ms, compositor traces incl. React/layout/paint/GC); UI patch p95 ≤2 ms; input→visual p95 ≤50 ms / p99 ≤100 ms under streams; local command accept p95 ≤50 ms / p99 ≤100 ms; remote ack p95 ≤ RTT+100 ms (≤ RTT+250 ms under defined saturation); state propagation p95 ≤50 ms local / remote excess ≤100 ms with correlated spans; host loop p95 <10 ms / p99 <25 ms; small fixtures within V3 limits (60-thread shell ≤60 KB decoded/6 KB wire; 40-item history ≤60 KB/8 KB) plus realistic-content companions; large-history tail byte budget independent of retained total; 32 kbps cached-shell snapshot p95 ≤4 s / history p95 ≤5 s; cold/warm readiness with no material regression vs measured master; memory (preserve 512 MB host-tree ceiling for its original small fixture; separate idle/normal/stress per-process budgets); soak queue/memory behavior (see Gate 5).
6. **Master comparison:** identical production builds/data/hardware/network fixtures, repeated runs, ≤10% p95/peak deterioration with fixed noise allowance.
7. Fix every observed bottleneck and every known unbounded path — no deferring a measured failure as "optional".

Current position: transport and queue slices exist; local-renderer congestion-isolation candidate frozen and integrated (reviewed in the 50-path freeze,
§1d); worker hot paths and complete measurements remain. **Gate 4: not passed.**

### Gate 5 — Qualify the release candidate

Required result: supported Electron/standalone artifacts, desktop web/mobile web/PWA journeys, required native checks, installed upgrades/recovery, controlled PWA deployment, soak and observation.

Pass conditions on **one frozen candidate** (source/bundle hashes, toolchain, environment, fixtures, raw results recorded; a fix changes candidate identity and reruns affected evidence):

1. Every required check and fault scenario executed at the frozen SHA and recorded with actual scenarios (not just commands with opt-in skips): `typecheck`, `lint`, `fmt:check`, `test`, `protocol:remote:v3:check`, `build:web`, `build:electron`, `prepare:server-native`, `native:e2e` (with scenario inventory — opt-in scenarios actually run), plus real-host fault scenarios.
2. Installed desktop/server artifacts qualified outside the checkout (macOS, Windows, Linux Electron + supported standalone targets): real product journeys and failure recovery.
3. Upgrade/recovery qualified: public master, current master, prior V2 data and credentials, pairings, drafts, worktrees, history, settings, helpers; interrupted migration, restart, next provider turn, future-schema rejection, backup/rollback.
4. Browser/device journeys on real supported surfaces: desktop browsers, iOS Safari + installed iOS PWA, Android Chrome + installed Android PWA (IME/keyboard, safe areas, rotation, attachments, terminal paste/resize, background, network transitions, server restart, host switching); LAN/VPN and real TLS relay incl. revocation/expired tickets/repair/stale cache/host-identity collisions; draft-safe old-PWA upgrade with actual deployed asset retention; no cross-host mixing; no duplicate/stale terminal state after wake.
5. Real-provider families exercised incl. any behavior changed by master integration (PTY + structured runtimes, ACP and SDK/process adapters, approvals/questions/MCP, resume/handoff/queue/checkpoint).
6. **24-hour controlled mixed soak** (with faults; queue/memory/latency trends) **plus 72-hour candidate normal use** completed and recorded. Compatible qualification work may run alongside; elapsed time may not be claimed early. Extend if intermittent defects remain.
7. Merge decision: evidence ledger closed, current-master behavior preserved, actual merge SHA/artifacts validated, checks invalidated by integration rerun, nightly PWA rollout controlled and monitored.

Current position: final candidate not frozen; earlier scoped smoke/build/native evidence exists but is not final-artifact qualification. **Gate 5: not passed.**

Stop conditions (halt and fix, do not merge): data loss, duplicate external action, cross-host state mixing, one client breaking shared control, unbounded memory, repeated launch failure, material regression against master.

## 3. Execution order

1. **Close Gate 1 first.** Collect existing assignments (reply implementation, renderer candidate, iOS diagnostic correction, slow-renderer isolation, standalone-attach and checkpoint-identity slices); one consolidated correction round; verify at a coherent source revision; land **one complete milestone commit**.
2. **Freeze shared contracts, then open two lanes.** Server ownership/operation lane owns Gates 2–3; client hotpath/fairness lane owns Gate 4. Declare ownership of shared transport/store boundaries before parallel writes so the lanes never edit overlapping sources. Reuse existing audit evidence; investigate only unresolved implementation decisions.
3. **One qualification owner + one critic.** Lane owners run meaningful focused checks only. The combined frozen candidate gets the broad checks once, repeated only for relevant changes or failures. No repeated full test/build runs from every small lane.
4. **Freeze once for Gate 5.** Artifact, upgrade, and observation work may proceed in parallel only where it does not contaminate performance measurements or shared state.
5. **Merge only after all five gates pass.** Deferred V4 work ships as an explicit post-merge backlog — never as a claim that the 63-step roadmap was completed.

## 4. Disposition of all 63 roadmap items

Reading key: **M-Gn** = mandatory to pass Gate n. **C-Gn** = conditional pre-merge work: do it only if required to pass Gate n (measured need, observed bottleneck, or failed budget). **Post** = post-merge optional backlog. "Flexible scope" (worker engine) means the _measured outcome_ is mandatory while the _implementation size_ may shrink — a smaller off-thread extraction may replace the comprehensive redesign **only if it passes the same Gate 4 measurements**.

### Phase 0 — integration, compatibility, baselines (6)

| Step | Item                                              | Disp. | Rationale                                                                                                                                                                     |
| ---- | ------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1  | Integrate current master + V2                     | M-G1  | Clean integration is a Gate 1 pass condition; recheck heads at final freeze                                                                                                   |
| 0.2  | Audit compatibility boundaries                    | M-G1  | Intentional generations + full consumer reconciliation required by Gate 1                                                                                                     |
| 0.3  | Regenerate contracts, reconcile arch docs         | M-G1  | Generated checks green + no stale ownership descriptions                                                                                                                      |
| 0.4  | Complete trustworthy instrumentation              | C-G4  | Mandatory **scoped**: real frame/input traces, queue byte/age counters, correlated spans, host-delay measurement — only what Gates 4–5 verify; broader instrumentation defers |
| 0.5  | Compare exact master and V2 builds                | M-G4  | Measured-master comparison is retained; identical builds/hardware/isolated windows                                                                                            |
| 0.6  | Keep CI green, control merge-triggered PWA deploy | M-G1  | Exact-candidate push+PR CI green; staging/gating of nightly PWA rollout                                                                                                       |

### Phase 1 — standalone server ownership (7)

| Step | Item                                       | Disp. | Rationale                                                 |
| ---- | ------------------------------------------ | ----- | --------------------------------------------------------- |
| 1.1  | One shared data-root lease                 | M-G2  | Launch orders, stale-owner, legacy-coexistence protection |
| 1.2  | Electron discovers/attaches/starts server  | M-G2  | Attachment is explicitly non-deferrable                   |
| 1.3  | Managed vs external lifecycle              | M-G2  | Zero-client continuity is explicitly non-deferrable       |
| 1.4  | Centralize host settings/profile mutations | M-G2  | Durable settings authority is explicitly non-deferrable   |
| 1.5  | Move durable event effects out of main     | M-G2  | Zero-client durable behavior                              |
| 1.6  | Credential migration + unattended restart  | M-G2  | Credential custody is explicitly non-deferrable           |
| 1.7  | Ship/install standalone server             | M-G2  | Independently installable server is the Gate 2 result     |

### Phase 2 — operation integrity, crash/shutdown (8)

| Step | Item                                         | Disp. | Rationale                                                                                                                                                    |
| ---- | -------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2.1  | Checkpoint disconnect repair                 | M-G3  | Final-artifact, all-transport re-proof required (dev slice insufficient)                                                                                     |
| 2.2  | Fresh stable operation IDs                   | M-G3  | Duplicate-action prevention after response loss/retry                                                                                                        |
| 2.3  | Authoritative journal + lost-reply reconcile | M-G3  | Canonical identity + crash-boundary evidence                                                                                                                 |
| 2.4  | Coordinate incompatible mutations            | M-G3  | Two-client conflicting-action proof                                                                                                                          |
| 2.5  | Truthful outcomes, no auto external retries  | M-G3  | Confirmed-correctness matrix across transports + shared-renderer disclosure (native UI disclosure is development work; native contract/build/tests required) |
| 2.6  | Drain/join shutdown before DB close          | M-G3  | Known shutdown defects (descendants, deadlines, late continuations, no post-close writes)                                                                    |
| 2.7  | Fence old supervisor generations             | M-G3  | Late-callback fencing across lifecycles/platforms                                                                                                            |
| 2.8  | Durable ack + loss budgets                   | M-G3  | Receipt-before-ACK ordering; crash/power loss quantification                                                                                                 |

### Phase 3 — bulk transport bypasses main (6)

| Step | Item                                              | Disp. | Rationale                                                                                                                                                            |
| ---- | ------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1  | Direct delivery per window/generation             | M-G4  | Full-matrix re-proof (F7 slice alone does not close it)                                                                                                              |
| 3.2  | Main restricted to shell/native + owned fallback  | M-G4  | Zero steady-state main bulk in full matrix                                                                                                                           |
| 3.3  | Failed-direct recovery without permanent fallback | M-G4  | Failed-connection case inside Gate 4 matrix                                                                                                                          |
| 3.4  | Remote HTTP/binary out of main                    | M-G4  | Endpoint/origin/credential/redirect restrictions close pre-merge                                                                                                     |
| 3.5  | Identity/cancellation, bounded binary streaming   | M-G4  | Credit bounds + cleanup; remaining close scenarios in wider acceptance                                                                                               |
| 3.6  | Large replies within explicit budgets             | M-G1  | Current-milestone work: fragment ≤64 MiB logical, encoded frames ≤64 KiB, receiver credit, transfer/execution limits, cancellation cleanup, no post-admission replay |

### Phase 4 — client processing off UI thread (10)

| Step | Item                                    | Disp.     | Rationale                                                                                                                                                                             |
| ---- | --------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1  | Shared worker-owned client engine       | M-G4 flex | **Outcome mandatory, scope flexible:** full redesign defers only if a smaller off-thread extraction passes the same Gate 4 measurements; otherwise the larger extraction is pre-merge |
| 4.2  | Validate once, incremental indexes      | C-G4      | Pre-merge only as far as measured patch/drain budgets require                                                                                                                         |
| 4.3  | Unify local/remote scheduling           | C-G4      | Pre-merge only as far as ordering/latency gates require                                                                                                                               |
| 4.4  | Bounded entity/visible-range patches    | M-G4 flex | Same flexibility as 4.1: no full-transcript copy per token on the measured path                                                                                                       |
| 4.5  | Time/byte budget per UI drain           | M-G4      | p95 ≤2 ms patch + per-drain budget are explicit gates                                                                                                                                 |
| 4.6  | Large persistence out of sync storage   | M-G4 flex | Same flexibility as 4.1: worker-owned persistence with migration/recovery must exist in some passing form                                                                             |
| 4.7  | Bound history/markdown/smoothing        | C-G4      | Pre-merge up to measured frame/input budgets incl. huge single message                                                                                                                |
| 4.8  | Bound terminal hydration/live parsing   | M-G4      | Bounded xterm work + exact output after freeze is an explicit envelope behavior                                                                                                       |
| 4.9  | Suspend hidden-view presentation safely | C-G4      | Pre-merge up to measured budgets + fast resume                                                                                                                                        |
| 4.10 | Usable shell before slow dependencies   | M-G4      | Cold/warm readiness gate; cached navigation exposes freshness, mutations gated on current authority                                                                                   |

### Phase 5 — server/relay fairness (7)

| Step | Item                                           | Disp. | Rationale                                                                                                           |
| ---- | ---------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------- |
| 5.1  | Inventory every queue + overflow/cancel policy | M-G4  | Explicit bounds + recovery evidence end to end within supported envelope                                            |
| 5.2  | Bound expensive work per client + globally     | M-G4  | Fairness demonstrated under the fixed workload, not just limits counted                                             |
| 5.3  | Reserve capacity for Stop/approvals/control    | M-G4  | Priority under saturation is an explicit gate                                                                       |
| 5.4  | Isolate local renderer congestion              | M-G4  | Global shedding from one slow renderer is explicitly non-deferrable                                                 |
| 5.5  | Fair relay scheduling both directions          | M-G4  | Weighted scheduling + reserved control capacity over shared bottleneck                                              |
| 5.6  | Unify HTTP/WS resource/cancel across hops      | M-G4  | Deadlines, cancellation, malformed/oversized frames, old-relay fallback, each-hop qualification                     |
| 5.7  | Profile/bound synchronous host work            | C-G4  | Worker offload pre-merge only where host-loop budgets require; durable-before-publish ordering preserved either way |

### Phase 6 — bounded payloads, measured protocol (7)

| Step | Item                                             | Disp. | Rationale                                                                                            |
| ---- | ------------------------------------------------ | ----- | ---------------------------------------------------------------------------------------------------- |
| 6.1  | Transport responsibilities + codec-need decision | M-G4  | The **decision** is mandatory; codec migration only with measured need                               |
| 6.2  | Realistic payload fixtures                       | M-G4  | 60/1,000-thread shells, 40/400/4,000-item histories with realistic content + completed-turn metadata |
| 6.3  | Bound histories by bytes + item count            | M-G4  | Bounded histories incl. completed-turn metadata explicitly non-deferrable                            |
| 6.4  | Remove irrelevant subscription traffic           | C-G4  | Pre-merge only where traffic measurements or weak-link gates require; preserve replay/compat         |
| 6.5  | Reduce terminal/binary encoding overhead         | C-G4  | Codec/frame change only with measured hot-path need; keep old clients/native peers safe              |
| 6.6  | Adapt chunk quanta to time + link capacity       | M-G4  | 32 kbps usability gate retained; bulk must not delay controls on weak links                          |
| 6.7  | Qualify compression under concurrency            | C-G4  | Adopt only measured net wins; broad compression project defers                                       |

### Phase 7 — browser / mobile-web / PWA lifecycle (5)

| Step | Item                                          | Disp.       | Rationale                                                                                                                                                                  |
| ---- | --------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7.1  | Visibility/network/endpoint recovery          | M-G5        | No duplicate/stale terminal state after wake on real surfaces                                                                                                              |
| 7.2  | Offline drafts, host identity, truthful state | M-G5        | No cross-host mixing; never auto-resend ambiguous external actions                                                                                                         |
| 7.3  | Old-document/new-worker upgrades safe         | M-G5        | PWA/upgrade safety explicitly non-deferrable; actual asset retention + installed-upgrade journeys                                                                          |
| 7.4  | Complete browser/device UX matrix             | M-G5 scoped | **Supported core journeys mandatory** (desktop browsers, iOS Safari + installed PWA, Android Chrome + installed PWA; direct + deployed relay); extra polish/devices → Post |
| 7.5  | Direct + deployed relay connectivity          | M-G5        | LAN/VPN, real TLS relay, revocation/expiry/repair/stale-cache/identity-collision rules                                                                                     |

### Phase 8 — artifacts, upgrades, soak, merge (7)

| Step | Item                                        | Disp. | Rationale                                                                                                                       |
| ---- | ------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------- |
| 8.1  | Freeze exact candidate + artifact identity  | M-G5  | Hashes, toolchain, env, fixtures, raw results; perf runs isolated                                                               |
| 8.2  | Every required check + fault scenario       | M-G5  | Full required-command + real-host matrix at frozen SHA; no opt-in skips                                                         |
| 8.3  | Installed desktop/server artifacts          | M-G5  | Supported installed-platform coverage retained                                                                                  |
| 8.4  | Upgrade + recovery paths                    | M-G5  | Master/V2 data + credentials, pairings, drafts, worktrees, helpers; interrupted-migration/restart/schema-rejection/backup rules |
| 8.5  | Sustained load + candidate observation      | M-G5  | **24 h controlled soak + 72 h observation**, faults + trends; extend on intermittents; never claim elapsed time early           |
| 8.6  | Merge decision + merge-result qualification | M-G5  | Ledger close, master-behavior preservation, merge-SHA validation, controlled nightly PWA rollout                                |
| 8.7  | Promote verified artifacts                  | Post  | Signing/notarization/installed-update/Linux-integrity as applicable; native store completion stays separate                     |

### Disposition counts

| Disposition                                   | Count        | Steps                                                                                                                                                                                                                      |
| --------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mandatory Gate 1                              | 6            | 0.1, 0.2, 0.3, 0.6, 3.6 (+ Gate 1 item: consolidated milestone commit, §2)                                                                                                                                                 |
| Mandatory Gate 2                              | 7            | 1.1–1.7                                                                                                                                                                                                                    |
| Mandatory Gate 3                              | 8            | 2.1–2.8                                                                                                                                                                                                                    |
| Mandatory Gate 4 (incl. 3 flex-scope)         | 21           | 0.5, 3.1–3.5, 4.1, 4.4, 4.5, 4.6, 4.8, 4.10, 5.1–5.6, 6.1, 6.2, 6.3, 6.6                                                                                                                                                   |
| Mandatory Gate 5 (7.4 scoped to core)         | 11           | 7.1–7.5, 8.1–8.6                                                                                                                                                                                                           |
| Conditional pre-merge (only on measured need) | 9            | 0.4-scope-remainder, 4.2, 4.3, 4.7, 4.9, 5.7, 6.4, 6.5, 6.7                                                                                                                                                                |
| Post-merge optional                           | 1 (+breadth) | 8.7, plus: broad codec/compression projects, exhaustive stress beyond the supported envelope, instrumentation beyond gate needs, general refactoring/docs expansion, unrelated cleanup, native feature/UX/store completion |

Totals: 63 numbered roadmap items mapped (6+7+8+6+10+7+7+5+7). Mandatory-or-conditional pre-merge: 62 items (53 mandatory incl. 3 flex-scope, 9 conditional); fully post-merge: step 8.7 plus the breadth remainder. Conditional items become pre-merge work **only** when a gate measurement requires them; post-merge breadth may never be used to waive a failed gate.

## 5. Source references

- Tracked roadmap: `docs/V4_MERGE_READINESS_PLAN.md` — authoritative requirements, budgets (§7), qualification matrix (§8), merge decision (§9).
- Execution ledger: `docs/V4_EXECUTION_LOG.md` — per-slice before/change/review/after evidence and artifact identity.
- Approved shortcut: `tmp/v4-plan-status/short-merge-route.md` (five gates, execution shape, non-promises; retained as dated evidence).
- Approval-time 63-step status: `tmp/v4-plan-status/2026-09-14-76d6e2ea3.md` (broader roadmap snapshot; per-step evidence/limits).
- Corrected 50-path verification: `tmp/v4-foundation-corrected-verification/REPORT.md` (current check table; reuses 32 unchanged-path evidences, reviews 18 correction paths only).
- UI test races (TEST-ONLY patch, NOT integrated): `tmp/v4-ui-test-correction/REPORT.md`, `tmp/v4-ui-test-correction/ui-test-correction.patch`.
- Settled attachment reconciliation: `tmp/v4-orchestration/FOUNDATION_REVIEW_RECONCILIATION.md`, `tmp/v4-attach-recovery-decision/REPORT.md`; corrections: `tmp/v4-foundation-test-correction/REPORT.md`, `tmp/v4-foundation-cleanup/REPORT.md`, `tmp/v4-attach-correction/REPORT.md`.
- iOS snapshot-before-cleanup correction: `tmp/v4-ios-ci-experiment/correction/00-correction.md`; Android phase-5 state capture: `tmp/v4-android17-timeout-diagnostic/REPORT.md`, `tmp/v4-current-batch-ci/android17/REPORT.md`; published-`ffe4` CI (not candidate CI): `tmp/v4-current-batch-ci/STATUS.md`.
- Live qualification (pending owner): verifier run `d2f45851eeb1`, `tmp/v4-foundation-live-qualification/REPORT.md` (not final).
- Current-freeze evidence: `tmp/v4-current-batch-ci/STATUS.md` (published-`ffe4` CI), `tmp/v4-combined-foundation-batch/REPORT.md` (integration manifest/hashes/pending gates), `tmp/v4-foundation-qualification/REPORT.md` (ONE broad-check + runtime cycle at the frozen SHA), `tmp/v4-foundation-review/REPORT.md` (independent findings-only critic), `tmp/v4-orchestration/FOUNDATION_REVIEW_RECONCILIATION.md` (coordinator reconciliation overriding unsupported critic reasoning), `tmp/v4-reply-delivery-implementation/REPORT.md`, `tmp/v4-renderer-ci-fix/REPORT.md`, `tmp/v4-ios-ci-experiment/correction/00-correction.md`, `tmp/v4-renderer-isolation-batch/REPORT.md`, `tmp/v4-standalone-attach-batch/REPORT.md`, `tmp/v4-checkpoint-integrity-batch/REPORT.md`, plus the older research/before reports cited in §1.

## 6. Open facts (not blockers on this document)

1. Exact frozen shared transport/store contract names and file-ownership split for the two Gate 2–4 lanes are declared by root at lane kickoff (this plan requires the freeze; it does not invent the contract list).
2. Absolute cold/warm readiness targets are set after Phase 0 baselines (§7) — until then the gate is "no material regression vs measured master".
3. Separate idle/normal/stress per-process memory budgets are set alongside baselines (only the 512 MB small-fixture ceiling pre-exists).
