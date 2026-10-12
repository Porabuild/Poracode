# v2 production readiness

Status: **in progress; not ready for production sign-off**.

Current execution priority, per user direction: GUI chat and everyday interfaces.
Verify portrait mobile chat, streaming and recovery, questions and approvals,
composer and keyboard behavior, navigation, Files/Git, settings and dialogs;
then verify desktop/Electron and web parity against the separate backend.
Every visited page requires screenshot inspection for layout as well as functional
checks. Landscape testing is excluded. Further terminal/PTY work is paused;
its unresolved findings remain recorded and are not counted as passing.

GUI draft recovery now has client-local per-composer checkpoints instead of
unmount-only memory saves. Real portrait web reloads retain both thread and
project Unicode drafts; clearing and reloading leaves them empty. The focused
213-test checkpoint covers storage lifecycle, composer behavior and deletion.
Independent review led to eliminating full-app persistence on each draft change;
a real bridge-mode probe confirms zero full-app writes for draft checkpoints.
Offline deletion orphan cleanup and full feature acceptance remain open. Evidence:
`tmp/v2-production-review/gui-priority/draft-recovery/COORDINATOR.md`.

The Android quick-compose Commands label no longer wraps letter-by-letter;
the rebuilt app was checked with the real keyboard open. The stale network-error
banner is fixed for manual and automatic recovery:1076 unit tests pass and live
portrait before/after screenshots confirm clearing after authoritative recovery. Separate-server
GUI review also identified stale history responses clearing live requests and
regressing thread status (scoped fix and independent review verified),
plus checkpoint truncation failing to update other clients' open transcripts.
The latter is reproduced with two real clients. Its stale completed-turn
snapshot recovery is now fixed with 115 focused recovery tests; live publication,
native parity and end-to-end repair are still required.
Reports live under `tmp/v2-production-review/gui-priority/`.

A real structured question appeared on web and Android simultaneously; answering
Blue on Android cleared the web request and completed the reply on both clients.
Android intra-word underscore corruption found in that pass is fixed and verified
on the rebuilt app (7 Markdown tests, lint and assembly pass). See
`GUI-CROSS-CLIENT-QUESTION.md` and `ANDROID-MARKDOWN-COORDINATOR.md` under the GUI
evidence directory. Android resolved-question history now renders the question and selected answer;
8 focused UI-logic tests, lint/assembly, and the rebuilt portrait app pass. Evidence:
`gui-priority/ANDROID-QUESTION-HISTORY-COORDINATOR.md`.

A real Electron client paired to the separate fixture backend now reconnects
automatically after reload, without visiting settings. The startup regression
failed before the one-line MainView correction; all 33 app tests, full typecheck,
and touched lint passed afterward. Live reload retained an unsent Unicode draft;
explicit deletion followed by another reload left the composer empty. Local
providers were mocked and no prompt was sent; the backend used an existing bundle.
Evidence: `gui-priority/electron-remote/REPORT.md`. A subsequent real GUI chat
check passed first-turn streaming and exact transcript-ID recovery after reload,
but exposed a critical follow-up gap: the server persisted the assistant reply
while the restored web view displayed only the user message. Explicit reopen
restored it. Restored-view live subscription repair is in progress; evidence
is `gui-priority/gui-reload-live/COORDINATOR-LIVE.md`. Portrait web Settings, General,
Appearance, language picker, Projects, and project-action sheets have inspected
screenshot evidence in `gui-priority/WEB-SETTINGS-COORDINATOR.md`; this does not
claim all settings mutations or assistive-technology coverage.

Review baseline: `poracode/v2` at `6fb1f3177443bf5820a7f519a686e9524509449d`,
compared with `origin/master` at `ce33db772f0e3a95bcae48874d919c923523e82a`.
The initial worktree was clean. Full scope includes backend/supervisor, Electron,
desktop browser/PWA, iOS, Android, remote/relay, compatibility and packaging.

## Current acceptance snapshot

GUI snapshot construction now skips two supervisor terminal reads for explicit GUI
presentation while preserving persisted handoff history (2 focused tests). This is
an IPC-count reduction; end-to-end latency measurements remain open. Revert review
also found that UI-local retry progress cannot guarantee idempotency after remount
or across clients. A backend-owned compound checkpoint operation remains required;
canonical transcript publication alone does not close that correctness gate.

The complete working tree was provisionally checkpointed in `1de973a21` (342 files).
Final saved-pairing and reconnect corrections are recorded in the following local
recovery commit. No changes were pushed. See [the final agent handoff](V2_AGENT_HANDOFF.md)
for the current evidence, ownership and ordered remaining work; earlier entries below
are historical checkpoints, not current production sign-off.

Final verification: iOS AppTests 1,240 passed, zero failed/skipped, with all 946
source-manifest entries matching the repository and isolated build snapshot. Three
existing URLProtocol Sendable warnings remain. Android 1,128 unit tests passed;
`:app:lintDebug` and `:app:assembleDebug` succeeded. Installing the final APK over the
existing saved protocol-v9 pairing upgraded its pin to v10 without re-pairing and
restored the existing home and GUI transcript. Both portrait screenshots were inspected.
iOS preserved-upgrade behavior has integration coverage, but a real saved-pairing
upgrade UI journey is still required.

Web restored-view and truncation recovery passed 178 tests across five suites.
Healthy reconnect re-arms bounded pending recovery; stale ownership cannot clear a
replacement request. Real v10 web reload and subsequent GUI reply were verified.
Generated remote-v3 contracts are current. Two distinct paired credentials receive the
canonical deletion event; compound provider/file/history revert idempotency remains
an open backend correctness gate. These results do not establish full cross-platform
production readiness.

The checkpoint history below records earlier evidence; it is not final-tree sign-off.

| Area                             | Latest verified evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Still required                                                                                                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Relay message fidelity/admission | Protocol3 binary fidelity and current-control authority; oversized binary/text messages rejected per channel under default and smaller configured frame limits. Explicit identity encoding on the loopback HTTP hop preserves decoded bytes, including precompressed responses. 159 relay/protocol tests, typecheck and touched lint pass.                                                                                                                                      | Negotiated peer limits, bounded fragments, per-owner credit/fairness, streaming HTTP/SSE, deployed origin/browser isolation and measured weak-link traffic/latency.                                                             |
| Android terminal lifecycle       | Final source-size refactor passes 1,065 unit tests, lint and assembly. Coordinator portrait replay on that APK preserves PID 6683 and its marker across automatic background reconnect; history position and follow behavior have screenshot evidence.                                                                                                                                                                                                                          | Native query startup delay, remaining Settings/device/push and latest-backend integration gates stay open.                                                                                                                      |
| Shared web UI                    | Portrait chat, composer, effort sheet, Files/Git, editor/preview, navigation and settings screenshots inspected. Thread and project Unicode drafts survive real reloads; clearing survives reload. Draft/storage213 tests pass; independent bridge-mode probe confirms no full-app writes per checkpoint. Prior DnD and terminal evidence remains below.                                                                                                                        | Final stale-history/request and thread-status arbitration, cross-client checkpoint convergence, full Electron separate-server interaction, assistive technology, retained-transcript performance and complete feature coverage. |
| iOS                              | Full AppTests: 1,227 passed; build snapshot hashes match current source. Files header/spacing and large-text screenshots reviewed on earlier QA builds.                                                                                                                                                                                                                                                                                                                         | Fresh protocol-v10 portrait GUI acceptance, physical-device/background/push gates and full feature coverage.                                                                                                                    |
| Shared backend/release           | Latest revocation build passes 12 real-host scenarios: six concurrency, five constrained-network and one 8 MiB incompressible paused-client case. 1/2/8/32 connections converge; the paused client disconnects independently and recovers its exact retained tail.                                                                                                                                                                                                              | Internal queue/peak-memory measurements, distinct device identities, larger retained-state/weak-link UI work, remaining manual gates, upgrade and packaging remain open.                                                        |
| Concurrent editor saves          | Native project/external saves serialize by file identity;29 focused backend tests and136 integrated tests pass. Real-backend save conflicts pass with shared credentials and two independently paired access sessions (one200, one409, winner retained). Editor loading/read/save/refresh guards and rename-during-load recovery pass39 tests and full typecheck. Independent review confirmed the guards and identified the rename edge subsequently fixed by the coordinator. | Timestamp precision, external-process races, live rename-over-slow-network and conflict recovery UI remain open.                                                                                                                |

User priority: horizontal/landscape testing is explicitly excluded. Prioritize portrait usability, reconnect and input reliability, and core desktop/web flows against the separate server.

**Confirmed weak-link blocker:** a real 32 kbps / 1.5-second RTT paced TCP probe
received a valid 133,945-unit terminal snapshot after 26.8 seconds, but the feed's
10-second deadline had already replaced the watch. Three attempts installed no history.
This is diagnostic failure evidence, not a passing readiness gate. Cold-start delivery,
progress handling and heartbeat timing must be addressed alongside cursor-based resume.
See `tmp/v2-production-review/browser-terminal-history/SLOW-BASELINE-FINDING.md`.

Latest editor/completion checkpoint: the editor waits for its file baseline before
offering edits or saves; 36 related tests pass. Current-token command completion can
be recovered from snapshots without forwarding history as live output, and parsing
waits for the full marker terminator; 76 related tests, lint and full typecheck pass.
Independent reviews and live provider-flow verification remain open. Earlier GLM
lanes failed with provider DNS errors; their unfinished work was retained and either
completed locally or assigned to fresh read-only review lanes.

The completion review subsequently passed its scoped checks, with important limits:
retained history can evict completion markers, the ten-minute login watcher can abandon
completion silently, and watch failures do not yet resolve every caller. A backend-owned
operation-status design is being investigated separately from terminal snapshot/resume
delivery. These remain architecture and reliability gaps, not accepted release exceptions.

Current detailed evidence: `tmp/v2-production-review/relay-message-limits/COORDINATOR.md`,
`android-parallel/project-terminal-reconnect-coordinator.md`, and
`sidebar-drag-accessibility/COORDINATOR.md`. All remaining original requirements stay in scope.

Latest security checkpoint: a real paused peer could submit WebSocket subscription work after session revocation while the close handshake was pending. Message admission now rejects closing, expired or unregistered sockets before dispatch. Red→green regression,128 authentication/replay/cursor tests and12 fresh-build real-host scenarios pass. Independent review found no confirmed issue within the new-frame admission scope; this does not claim cancellation of work admitted before revocation.

## Priorities and acceptance gates

| Priority | Work                                               | Required proof                                                                                                                                                                                                      | Current evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | Repair native protocol compatibility completely    | Both native apps launch with current generated bindings, preserve `executionEnvironment` through decode/edit/send/resume/move, and reject incompatible old bindings. Validate old persisted-host behavior.          | Native constants, feature/build gates and config copies support v9. Historical full suites passed: Android 1,023 and iOS 1,183, including catalog pruning. Later focused checks and Android suite results are recorded below. These totals do not establish final-tree coverage. Both mock-host native journeys have passing evidence; real-host parity and upgrade checks remain open.                                                                                                                                                                   |
| P1       | Make QA coverage and outcomes accurate             | Backend-only changes select relevant scenarios; failed or unimplemented gates cannot report success; ready UI checks prove usable controls.                                                                         | Backend inventory and outcome fixes pass nine regressions; 1,935 production files covered. Failed mock gates remain failures; unimplemented quick-composer gate explicitly fails. Revised terminal readiness check awaits real baseline rerun.                                                                                                                                                                                                                                                                                                            |
| P1       | Validate reconnect and slow-client isolation       | A large valid replay converges without a reconnect loop; a stalled receiver cannot delay healthy clients or cause unbounded queues.                                                                                 | Confirmed synchronous replay overflow fixed with one-frame draining from bounded shared history. Existing server suites pass 117 tests; six new tests cover 5.6 MB replay, interleaved live events, expiry and failure. Independent transport re-review found no material issue.                                                                                                                                                                                                                                                                          |
| P1       | Validate shared backend ownership and concurrency  | Multiple clients observe the same authoritative state after overlapping commands, disconnect/reconnect, and backend restart. No lost updates or duplicate side effects.                                             | Native-request rejection and ingress fixes pass 42 backend tests; Startup recovery now passes 24 tests, including stalled initialization, PID assignment, interests synchronization, and shared supervisor-start ownership. Shutdown cleanup passes three regressions. Built-host 1/2/8/32 profiles and paused-terminal/replay case pass; final-source rerun remains required. IPC gap recovery and per-window interests now pass 74 integration-focused tests after three coordinator corrections. Real multi-window congestion/restart QA remains open. |
| P1       | Prove frontend parity after backend extraction     | Real controls exercise chat, approvals/questions, PTY, editor/git, projects/worktrees, browser, settings, schedules, skills/MCP, providers and quick composer. Desktop and compact browser behavior stay supported. | Initial desktop mock baseline: 8 automated scenarios passed, 15/16 mock gates passed, terminal gate failed. Full manual QA remains incomplete.                                                                                                                                                                                                                                                                                                                                                                                                            |
| P2       | Measure and reduce remote traffic and latency      | Compare application and transport bytes, control latency, convergence time and memory under stated network/client workloads; preserve exact transcript and terminal content.                                        | Interim 1/2/8/32 profiles pass, using one device credential per profile with distinct authenticated sockets. Shared-host load and an older backend binary limit performance conclusions. HTTP payload accounting is now included for the next run. Reliable terminal cursor frames and opaque forwarded WebSocket data no longer silently drop at the relay soft limit (21 relay tests pass).                                                                                                                                                             |
| P2       | Remove build-output contamination safely           | Verify source/build provenance, remove tracked disposable outputs, prevent recurrence, and rebuild from clean source.                                                                                               | 14,086 tracked generated files moved to ignored investigation storage; nested Swift `.build` paths now ignored. All four packages rebuilt from source into empty scratch paths; 162 tests passed.                                                                                                                                                                                                                                                                                                                                                         |
| P2       | Align architecture and compatibility documentation | Documentation matches actual ownership, wire version, feature dispositions and supported upgrade paths.                                                                                                             | Remote architecture documentation now distinguishes the v3 directory from wire version 9 and identifies generated versus app-owned native models. Full upgrade/feature disposition audit remains open.                                                                                                                                                                                                                                                                                                                                                    |

P0/P1 work precedes release sign-off. Optimization changes follow measured
bottlenecks and are checked across every consumer of a changed contract.

## Verification plan

1. Complete independent GLM review lanes for backend, remote transport, native
   compatibility, and frontend experience/performance/simplification. Validate
   findings against callers, guards and focused reproductions before fixing.
2. Repair confirmed defects with focused regressions. Audit every persisted,
   wire and deployed boundary; do not make native clients advertise a new
   protocol until their domain models and command paths support its semantics.
3. Exercise one production backend with 1, 2, 8 and 32 authenticated clients,
   including active and idle subscriptions, concurrent fixture mutations, a
   stalled receiver, reconnect and restart. Use real production server paths;
   distinguish injected dependencies from a complete headless process.
4. Compare loopback with proposed 150/600/1500 ms RTT and
   1 Mbps/128 kbps/32 kbps profiles. Measure disconnect recovery separately.
   These are investigation profiles, not supported-limit guarantees.
5. Record p50/p95/p99 control latency, time to usable shell/convergence,
   snapshot/replay counts, application bytes, transport bytes, queue bounds,
   CPU/RSS and event-loop delay where directly measurable. Decompressed
   WebSocket message length is not compressed transport size.
6. Complete real UI and simulator QA with screenshots and asserted outcomes
   per surface. Profile input responsiveness and render invalidation under
   streaming and large retained state. Actual push/background OS behavior
   requires device evidence; mocks do not establish it.
7. Run final relevant typecheck, lint, format, tests, contract generation check,
   native suites and builds on the final tree. Re-review material fixes and
   reconcile every original requirement with authoritative evidence.

## Evidence and limitations

Investigation artifacts are under `tmp/v2-production-review/` (gitignored):
scope hashes/diff, detailed execution plan, desktop screenshots/report, iOS
build/test logs and result bundle, and experiment/reviewer notes.

- Desktop baseline exited 1. No captured runtime errors; terminal presentation
  gate failed. Its baseline screenshot still shows provider discovery, so it
  does not prove the draft composer was ready.
- Initial iOS tests crashed because app-owned protocol gates expected 8. After
  compatibility and fixture corrections, all 1,183 AppTests passed at that
  checkpoint, including the catalog-pruning regression. Later changes require
  final-tree verification; that historical run is not a current full-suite result. The mock-host native
  journey now passes pairing, four physical filter-button target probes, compose,
  send, Stop, background resync, host removal and same-ID isolation across hosts.
  A native toolbar's accessibility frame alone did not establish its touch area;
  the passing journey tests taps 21 points from its center in four directions.
- Root `pnpm test` does not include the separate native-e2e configuration.
  The real-host smoke assertion now imports the current protocol constant;
  verification against the initial freshly built host passed two smoke tests.
  That binary predates the latest backend fixes and must be rebuilt for final QA.
- Several GLM workers hit HTTP 429. Completed evidence and edits were retained;
  unfinished review coverage is not credited as complete.
- Android's initial complete unit suite passed 1,023 tests with no failures or skips.
  Owned-emulator mock-host checks covered pairing, chat/Stop, resync, host
  switching and agent/model picker selection from the HTTP bootstrap catalog.
  This is not real-backend, instrumented-test or physical-device proof.
  Complete manual QA, final-source load/network results and final broad gates
  remain outstanding.

Completion requires explicit per-surface passing evidence or a resolved,
documented applicability decision. A green inventory or generated parity
ledger alone cannot establish production readiness.

## Current integration checks

- Generated remote contract drift check passed (`pnpm run protocol:remote:v3:check`).
- Native protocol guard passes all three checks, including the Android Gradle pin.
- Removed the unused backend-version renderer argument and its window-option
  plumbing. Stream credentials still arrive through the existing authenticated
  Electron IPC path. Four window-hardening tests and touched lint/format pass.

## Latest native and shared-host evidence

- Interim shared-host suite: all six checks passed. The healthy receiver obtained
  all 24,000 terminal payload lines while its neighbor was paused; both eventually
  had identical transcript content and cursors. Four offline mutations replayed
  in sequence. The observed pause was only 163 ms; this does not establish
  sustained low-bandwidth behavior. Raw artifacts and the passing log are preserved
  in `shared-host/interim-passing-20260908/`.
- iOS real-terminal QA reproduced lost CRLF output during prompt redraw. The parser
  fix passes nine tests and a real PTY command displays its output correctly.
- iOS terminal input's 13 runtime tests pass, including actual pasteboard and IME
  paths. A real PTY command preserved ASCII quotes and double dashes. Manual Unicode/multiline paste preserved input until Send and produced exact output; host loss retained the pending command and disabled writes. Unicode command echo redraw duplicates an emoji tail, and Project Settings remains dark after leaving terminal in Light appearance; both require follow-up. Both native clients
  now hydrate agent catalogs through HTTP; a real-host model picker also opened after app relaunch and applied a selected model without visiting provider Settings.
- The terminal device-attributes handshake has a separate latency gap in transcript
  clients. A timed synthetic reply is not accepted as a fix: delayed frontend
  replies on poor connections could duplicate it. Query-response ownership needs
  an explicit design and cross-client validation.

## Integration checkpoint after worker completion

- Full `pnpm run test`: 986 passing files, one failing file, five skipped;
  11,324 passing tests, two failing, 118 skipped. The two failures are unchanged
  checkpoint identity tests affected by inherited Git author/committer variables.
  All four checkpoint tests pass when those variables are removed only from the
  test process. Preserve the original exit 1; this is a diagnosed environment
  failure with a passing targeted rerun, not an all-green full command. Evidence:
  `test-current.log`, `checkpoint-clean-env.log`,
  `checkpoint-test-environment.md`.

- The subsequent current-source build passed, followed by all 11 shared-host and
  constrained-network tests. Both summaries match the rebuilt server hash
  `cb70253d…`; details and limitations are in `source-network-results.md`.
  At 1,500 ms RTT / 32 kbps, all three disconnected mutations replayed and the
  healthy neighboring connection measured a 1 ms ping. These are per-connection
  link models, not packet-loss or shared-bandwidth tests. The host-load scanner
  also matches the idle Xcode MCP service; its contamination count is not a CPU
  contention measurement. Earlier baseline results below remain historical.

- Current-tree TypeScript check passed (`pnpm run typecheck`, evidence
  `typecheck-current.log`). Full ordinary/type-aware lint passed before three IPC corrections; touched lint and typecheck passed again afterward. This checkpoint is not final-tree sign-off.
- The IPC overflow fix adds a versioned loss-range signal, retains critical
  events, sheds only rebuildable bulk, and unions per-window interests. Coordinator review reproduced and fixed trailing loss signals that never rebuilt, idle markers that never drained, and reload listener accumulation. The six related suites pass 74 tests. Independent GLM re-review attempts hit quota429 and receive no review credit. Saturation
  by non-replayable traffic alone still terminates the channel; arbitrary main
  process stalls are not yet proven isolated.
- The complete constrained-network experiment passed five tests, including a
  256 KiB hash-exact half-close calibration and 150/600/1500 ms RTT at
  1 Mbps/128 kbps/32 kbps. Every profile recovered all three offline mutations;
  the healthy neighboring client remained responsive. These results used the
  older backend binary (`3c6638b2…`) and a shared host. Pacing applies per
  connection, with no shared-link bandwidth, packet-loss or congestion model.
  Repeat on a rebuilt backend before drawing production performance conclusions.
- Authoritative native logs: `ios-qa/combined-all-AppTests.log`,
  `ios-qa/native-ui-final-capabilities.log`, and
  `android-qa/final-suite-totals.txt`. Network provenance and calibration are in
  `constrained-network/summary.json`. All paths are relative to
  `tmp/v2-production-review/`.

## Native terminal follow-up

- Both native parsers now use terminal-column widths generated from the existing
  web Unicode 11 provider. Fifteen shared cases cover CJK/emoji redraw, combining
  text, partial wide-cell erasure, tabs and hidden OSC metadata. Android checks
  every UTF-16 split; the real xterm parser supplies the web parity check.
- Fixed quadratic iOS style-run assembly. A local optimized Swift benchmark of
  200,000 characters improved from 466 ms to 13 ms with exact text. This does not
  establish device frame rates or large-transcript layout performance.
- Real iOS shell output no longer duplicates the emoji tail. The terminal title
  and input remain readable, and returning to Project Settings restores the
  user's light theme. Pairing buttons now expose distinct Cancel/Confirm labels.
- Final native proof: 1,183 iOS unit tests; another 12-test parser run after the
  shared fixture expansion; 1,023 Android unit tests, lint and debug packaging;
  passing native UI journey with pairing-label assertions. Evidence and exact
  commands are in `tmp/v2-production-review/terminal-unicode/REPORT.md`.
- No preserved-data restart credit: the temporary host's shutdown cleanup erased
  its identity before a restart attempt. A first-attempt re-pair observation still
  needs a controlled reproduction with network evidence. Terminal query-response
  ownership, thread-backed PTY visual QA, desktop/PWA QA and the broader scope
  audit remain open.

## Render-memory and shutdown follow-up

Both native projections now bound aggregate cells, evicting the oldest complete
rows/cells while preserving natural Unicode capacity. Focused checks passed
a final 44-test iOS run (17 parser, 13 input, 14 reachability) and 12 Android
buffer tests. Review also reproduced and fixed an iOS tab hang at a full row;
its standalone and XCTest regressions pass. Exact evidence is in
`tmp/v2-production-review/terminal-render-budget.md`.

The latest desktop baseline passed eight automated scenarios and 15/16 mock
gates. Quick composer still requires real manual verification. Terminal-entry
failure was a stale Settings overlay between mock gates; resetting each gate's
UI state fixed it without weakening the assertion. Teardown exposed a backend-
disposed rejection and a delayed bounds timer reading a destroyed window. Saves
now drain before backend disposal, and close/destruction flush captured bounds.
Thirteen focused tests pass; immediate resize/close persisted exact bounds and
final teardown logs show neither error. Real main/extracted-browser credential
replacement and project reads passed after backend restart with a simultaneous
extracted-document reload. The full three-window/PTY/congestion journey remains
open. Evidence: `tmp/v2-production-review/shell-state-shutdown/REPORT.md`.

## Large payloads on constrained links

Existing gzip and ETag behavior now has populated-host evidence:256 thread
records and120 transcript items, across150ms/1Mbps,600ms/128kbps and1500ms/32kbps
links. All six route/profile pairs returned byte-identical decoded bodies;
conditional reads returned304 with no entity body. Snapshot bytes fell from
131,351 to6,405; history from444,080 to99,951. At32kbps, snapshot latency fell
from34.5s to3.25s and history from112.7s to26.7s. Conditional reads took about1.66s.

The load sampler no longer counts xcodebuildmcp or its own worker as foreign
builds;11 regression cases pass. This run recorded117 samples with no recognized
foreign build processes or probe failures. Older measurements retain their
original, flawed load annotations. These are calibrated per-connection link
measurements, not mobile-radio, packet-loss or production-percentile claims.

Next: capture gzip negotiation and validator reuse in shipped Android/iOS/PWA
clients, then address any proven reuse gap with bounded, credential-isolated
caching. Server304 support alone does not prove clients benefit. Evidence and
exact limitations: `tmp/v2-production-review/large-payload/REPORT.md`.

## Native client use of HTTP caching

Real local-HTTP probes found Android downloaded repeated responses without a
validator, while iOS revalidated small responses but declined a580KB response.
Android now has bounded memory-only conditional GET reuse with credential
invalidation and an in-flight generation fence. iOS uses its existing URLSession
cache with an explicit16MiB memory capacity and no disk storage. Both now
revalidate the580KB response and preserve credential-specific bodies.

Negotiated JSON and authenticated image cache keys now vary by Authorization.
Android's one-time304 recovery shares the original call deadline; the foreground
network barrier remains active through body consumption, fixing a cancellation
gap exposed during this work. No wire schema or persisted cache format changed.

Proof:1038 Android tests plus lint/debug packaging,24 iOS HTTP tests,110 server
tests, typecheck and build pass. Full details and historical-before logs:
`tmp/v2-production-review/native-http-cache/REPORT.md`. PWA/browser use and
multi-host cache-memory/lifetime profiling remain required before sign-off.

## Safari PWA and preserved-data restart checkpoint

Real iOS Safari now has evidence of gzip decoding, conditional GETs and 304
reuse against the production host. The live run exposed CORS cache metadata
being overwritten by JSON/image response writers. Those writers now preserve
Origin variation alongside Authorization/Accept-Encoding. Trusted preflights
can be reused for 600 seconds; actual requests still validate origin and bearer
credentials. The fix passes 110 server tests, 11 Android cache tests, typecheck,
lint and build. Safari reused warmed preflight permissions on later reads.

The manual flow paired an isolated host, navigated Projects/More, created a
Codex GUI thread, and displayed a code block, 15-row table and final marker.
Software-keyboard and mid-stream scroll behavior remain unverified. Floating
thread controls overlap the final marker after reload and need investigation.

A controlled host restart preserved identity and thread data. Transport and
history recovered, but automatic runtime reopen after reload failed with
`command_id_conflict`: the existing-thread start path reuses the durable ID
already consumed by the initial thread-creation route. Fix operation identity
and supervisor-owned ensure-running semantics together, then verify repeated
restart/unload cycles and stale concurrent clients. A fresh ID alone could let
one client's reopen close another client's live runtime. This is an open
production-readiness failure, not a passing lifecycle gate.

Evidence and remaining manual gates:
`tmp/v2-production-review/pwa-current/REPORT.md`. The full review and manual-QA
scope remains open, including three-window recovery, IPC congestion, native
cache lifetime/memory, complete platform parity and secondary UI surfaces.

## Remote reopen repair

The Safari restart failure is fixed on the updated host and renderer. Automatic
reopen declares `ensureRunning`; explicit native relaunches and provider switches
retain normal launch semantics. The host reads canonical thread data, and the
supervisor joins its start lock or preserves the existing live runtime. Creation
receipts remain durable; reopen uses current runtime state instead of replaying
an old launch result. The optional field and its receipt exception are reflected
in regenerated JSON/Swift/Kotlin contracts.

Two preserved-data restarts now reopen successfully in Safari. A second client
sent 16 concurrent reopens while idle and another 16 while a real provider turn
was working: all succeeded without session/config replacement or interruption
events, and Safari continued receiving output. Focused HTTP/renderer checks,
supervisor/client regressions, generated native codec probes, typecheck, lint,
contract check and build passed. See
`tmp/v2-production-review/remote-reopen/REPORT.md` for exact runs and limitations.

Safari composer focus and software-keyboard behavior remain unverified. The
full review/manual-QA objective remains active; these results do not close the
three-window, congestion, platform-parity or broader UI acceptance gates.

## Safari composer and file-input checkpoint

The fresh Safari run verified composer focus with the simulator hardware
keyboard, exact prompt entry, Send, the completed response, and composer
collapse. The previous focus failure did not reproduce; software-keyboard
coverage remains open. Search opened the expected thread, README diff and file
views rendered, and a file edit saved exact bytes to the production host.

Manual creation exposed Safari changing `safari-qa.txt` to `Safari-as.txt`.
The shared create/rename input now disables capitalization, correction and
spellchecking. Repeating the same input preserved the exact name and created
the correct file. Android's corresponding path/name/identifier fields now
disable correction; iOS already does. Three existing tree tests, web typecheck,
touched lint/format, Android compilation and lint pass. Android IME runtime and
web rename interaction still need manual verification.

Local light appearance persisted across Safari reload. Profile and host agent
settings loaded successfully; this is navigation evidence, not full settings
acceptance. Details and before/after captures:
`tmp/v2-production-review/safari-composer/REPORT.md`.

## Open: forwarded-content origin isolation

Safari successfully created, opened and stopped an owned port forward, but the
flow exposed an origin-isolation failure. Forwarded JavaScript runs on the
remote host's origin and can access that origin's browser storage. A synthetic
canary verified this without reading any app credentials. Locally served PWA
deployments can share that origin with forwarded content; the encrypted browser
vault does not protect against scripts running in the same origin.

Origin separation is required before production approval. A real two-tab Safari
run confirmed that opening B switches A's HTTP target to B; A's existing socket
stays on A until reconnect, then also switches to B. Resolve direct, HTTPS and relay routing
with native entry-URL compatibility, then verify HTTP/WebSocket reconnect,
storage isolation and revocation. Functional forwarding alone is insufficient.
Investigation and next checks:
`tmp/v2-production-review/safari-composer/port-origin-isolation.md`.

GLM 5.3 Flash High host and relay reviews independently validated the mechanisms.
The reconciled requirements and rejected shortcuts are in
`docs/PORT_FORWARD_ORIGIN_ISOLATION.md`; preserve existing raw TCP functionality
and do not substitute a switching confirmation for origin isolation.

The separate revocation defect was repaired with forward lifetime cancellation
and private HTTP connection pools. Its prior integration checkpoint passed all
174 tests, including active streams, client cancellation and target replacement.
Host/relay origin integration is now changing those paths further; that checkpoint
is not final-tree sign-off. See
`tmp/v2-production-review/port-isolation/coordinator-revocation-final.md` and
`tmp/v2-production-review/port-isolation/implementation-contract.md`.

### Relay transport findings and remaining release gates (2026-09-08)

The real-stack relay fidelity probes expose failures beyond the earlier direct-host
replay checks. Twelve scratch probes establish the failure mechanisms; they do not
establish fixed behavior or production performance. The remediation order is:

1. **Cancel abandoned HTTP transport work.** Propagate visitor disconnect and timeout
   to the matching host fetch, clear request state on control loss/replacement/disposal,
   and retain unrelated clients. Cancellation does not undo accepted mutations.
   Implemented and checked with real-socket normal-completion, cancellation, late-response
   and other-client regressions. Re-run these after the streaming transport changes.
2. **Isolate congestion across visitors.** Current shared-control overflow can disconnect
   every visitor. Introduce bounded per-owner admission and fair drain scheduling, with
   explicit overload behavior and liveness. Merely closing an offending visitor cannot
   reclaim bytes already in the shared FIFO. Verify healthy-client progress under a
   constrained uplink, including reliable terminal frames and concurrent HTTP work.
3. **Recover from silent partitions.** Verify host-side detection and reconnect with
   established-but-undelivering TCP. Avoid indefinite heartbeat exemptions for queued
   data; measure recovery separately from throughput.
4. **Preserve payload fidelity.** Protocol 3 now carries binary WebSocket payloads without
   UTF-8 coercion and rejects incompatible protocol-2 registration. Current-control authority
   is checked for text and binary callbacks after replacement. HTTP still buffers complete
   finite responses; streaming/SSE remains unmet. Payload-limit coherence is under independent
   review. Negotiate further framing changes deliberately and test both mixed-version directions.
5. **Measure transport improvements.** Validate compression on actual WAN legs, bounded
   CPU/memory, cancellation, streaming first-byte delivery, and exact payload preservation.
   Base64 payload accounting excludes WebSocket/TCP/TLS overhead and is not wire-byte proof.

The proposal to remove browser forwarding is still a product decision. Raw port
forwarding does not by itself provide browser-only public-relay reachability. Until the
choice is settled, no removal or reduction of the existing acceptance scope is assumed.
The in-flight isolated-origin implementation still needs production relay composition,
real DNS/TLS/browser verification, and legacy service-worker upgrade evidence.

Client compatibility review also found incomplete handshake authority. PWA capability
presence/action gating was corrected to require version 1; 113 focused tests pass.
Android pairing-time authority was replaced with ephemeral live-handshake authority,
cleared on reconnect and protected against late results:70 focused session/lease/port tests
pass and Android lint has no errors or touched-file findings. Independent re-review and
real-host downgrade QA remain open. iOS reconnect authority still needs validation. Historical native test totals do
not cover that requirement.

Evidence: `tmp/v2-production-review/relay-fidelity-audit.md`,
`relay-fidelity-coordinator-validation.md`, and
`port-isolation/pwa-capability-coordinator-validation.md`. Final-tree full checks and
manual QA remain open.

### Relay origin integration checkpoint (2026-09-08)

The headless production composition now registers its dedicated origin secret, shares
one per-instance internal dispatch key with the relay adapter, and follows the live
registered relay policy. Authenticated relay API context selects that policy for browser
entry; missing relay policy cannot fall back to a direct origin. Direct and relay child
policies coexist, with removed/foreign/orphan children bounded-errored before API routing.

Evidence:120 host tests and35 real relay tests with distinct direct/relay bases passed;
a further13-test headless suite includes relay-only pairing→forward→entry→cookie→upstream
through the real production composition, with database/supervisor mocked. Typecheck and
touched checks pass. These are checkpoint results while cancellation changes continue.
Independent trust/lifecycle re-review is active. Deployed DNS/TLS, browser storage/cookie
isolation, Safari service-worker migration, and final-tree weak-link QA remain required.

### HTTP cancellation and web editor checkpoint (2026-09-08)

Relay HTTP cancellation is implemented and coordinator-validated:111 relay tests pass,
including abandoned uploads/responses,timeout,control loss/recovery and unrelated-client
success. This stops transport work and does not roll back accepted mutations. Shared
congestion, streaming and binary fidelity remain separate open gates; host liveness
was subsequently fixed as described below.

Actual web QA against a separately built headless server completed pairing,remote project
creation and a real reply-only chat round trip. A native-update subscription incorrectly
ran in the browser; the capability gate passes 32 app tests and a fresh browser reload.
The earlier missing-modal interpretation was withdrawn: MainPageLayout already owns
an inline FileEditorPanel. The coordinator's redundant modal mount was removed after
fresh Chrome verification exposed two editors. One editor now handles native keyboard
input and saves exact expected bytes through the real backend. Its Save button also
has a localized accessible name and is disabled when clean.

### Four-platform QA and relay liveness checkpoint (2026-09-08)

Electron, Android and iOS run independent GLM QA lanes with isolated app data and
owned simulators; the coordinator tests a web client against a separately built
headless backend. Shared Xcode work stays serialized. This is concurrent functional
QA, not a controlled performance measurement under quiet machine conditions.

Coordinator inspection of the iOS result bundle confirms 1,209 passing tests
(including the reconnect-authority regressions) and one passing scripted UI
journey. This corrects the worker's log-derived count of 1,208. The
cancellation follow-up passed 1,211 tests in r4, independently
verified from the result bundle. It also adds a unique request token so an old
A→B→A completion cannot clear a new request reservation. Android has built and launched
its app after focused capability fixes. Both native apps have paired with their
own real backend. iOS completed its bounded real-host journey. Android's apparent
capability discrepancy was traced to the host's expected 503 response when no browser
forward origin is configured. Coordinator follow-up reproduced two callback-admission
races: an old socket callback could overwrite a replacement's Online state, and a queued
Online callback could overwrite Suspended after backgrounding. Ownership and lifecycle
checks now run inside the publication lock; 33 focused tests and lint pass. Independent review and
remaining platform gates still prevent final sign-off.

Electron's worker reports a clean real-input editor/save cycle with a byte-exact
disk comparison. Earlier input anomalies occurred during its automation/HMR
experiments and are not established production defects. Git diff, search and settings
checks passed at this checkpoint; OS shortcut/quick-composer and wider manual gates
remain open. A mock launch unexpectedly executed a real provider. A new local launch
guard has sentinel-test evidence. Independent review found an automatic-title dispatch
bypass, now fixed with failing-first regression coverage. A live managed mock Electron
session displayed the structured-launch refusal and readable expanded error; exact-session
teardown passed. Command arguments have also been removed from refusal diagnostics.
The combined guard/title suite passes 22 tests. Four vendor detection-probe gaps are
being fixed; discovery and remote-host boundaries still limit the isolation claim.

The user identified an iOS Files layout defect missed by functional-only QA. Compact
Files now uses the enclosing navigation stack, removes an empty root section and uses
the same top content margin as Git. Coordinator-inspected screenshots show one aligned
header, the first row directly below it, preserved bottom controls and working file detail
navigation. Coordinator-inspected large-text iPhone and real iPad sheet screenshots also
pass. A separate harness renders the real split container with stub columns at regular
width; this verifies that branch's container layout, not a full production-content journey.
Every page assessment
now separates functional evidence from screenshot-based layout evidence.

The Android Manage projects title also wrapped into two oversized lines at 320 px.
It now uses smaller single-line typography. Coordinator-inspected rebuilt-app screenshots
pass at both default and 130% font scale, with full title and back/refresh/add controls
aligned. This proves that screen, not every Android header. Android Files, Terminal and
Settings remain untested in the completed lane. A separate web accessibility fix is in
progress: single-pane drag registration currently gives the entire thread disabled-button
semantics, including its otherwise functional composer controls.

Fresh Chrome web QA also reproduced an orphan desktop-panel backdrop after resizing to
compact width. AppShell now derives panel visibility from content actually rendered by
that shell and drops an absent panel's retained backdrop immediately. Three new render
regressions failed before the fix; all 61 focused shell/editor/app tests, typecheck and
touched lint/format checks pass afterward. The compact screenshot is no longer dimmed
or blocked. Real web PTY typing, Unicode insertion and Ctrl+C interruption also pass.

Web UI creation and stopping of an owned raw port forward passed: the listener
returned the upstream's exact response, then stopped accepting connections after
the UI stop action. Browser opening correctly reported missing HTTPS forwarding
configuration. This does not establish WAN browser access. A preserved-data backend
restart restored the project/thread without pairing again; a fresh reply-only turn
was accepted and completed with exact persisted response. The reply is visible after
browser re-enable, but its live appearance before reload remains uncertain due to
the automation session's stalled-animation/capture behavior.

Production host control sockets now independently detect missing WebSocket pongs
and use the existing reconnect path. Six relay/protocol suites pass all 113 tests;
touched lint/format and typecheck pass. This addresses dead-peer detection, not
shared-queue fairness, HTTP streaming or binary WebSocket fidelity. Those remain
release gates. Relay trust documentation now explicitly states that the relay can
read forwarded credentials and payloads; framing is not end-to-end encryption.

Evidence: `tmp/v2-production-review/relay-host-liveness-validation.md`,
`web-parallel/PROGRESS.md`, and the three platform reports under that review directory.

### Relay fidelity and compact settings follow-up (2026-09-08)

The binary relay envelope is integrated in both directions through the production socket
factories, preserving arbitrary bytes without UTF-8 coercion or base64 expansion. Protocol-3
compatibility rejection and the coordinator stale-control regression are included in
148 passing tests across 9 suites; full-tree typecheck passes at this checkpoint. Independent
payload-limit review is still running. These tests are not a wire-bandwidth measurement. Streaming HTTP,
per-client fair scheduling, bounded backpressure and measured weak-network latency remain
required work.

Coordinator compact Chrome QA inspected More, Settings and Appearance at390×844. Dark→Light
persisted after reload; Dark was restored. Headers/rows/controls stayed visible and aligned.
This is device-local appearance evidence, not all settings coverage or native Safari proof.
The draft-cleanup report was corrected after a later snapshot contradicted the initial
unverified action; current live textbox contents are empty after reopening the owned profile.

### Locale and mock-probe boundary follow-up (2026-09-08)

Compact General settings were visually checked in English and German. A real language
switch exposed React Aria's built-in dismiss label remaining English. AppLocaleProvider
now forwards the activated Lingui locale to React Aria without remounting sheet content;
17 focused tests and fresh browser verification pass. The added dependency's dev-server
entry is explicitly prebundled after a fresh-load failure exposed the missing setup.
System language and Dark appearance were restored after QA.

The four vendor SDK/session detection probes now have mock-mode guards. Coordinator review
also found that WSL workers need a parent-side guard because the process bridge does not
inherit the supervisor's flags. That regression is fixed;79 combined probe/guard/title tests
pass. This is not actual Windows/WSL runtime proof. Full-tree typecheck remains pending
concurrent pane/relay test work. Android's remaining workspace journeys are now assigned
against the same isolated separate backend used by the coordinator's web client.

### History restoration and live accessibility checkpoint (2026-09-08)

Compact Settings reloads were duplicating history entries, so Back traversed identical
pages. Coordinator fixed stale passive-effect restoration handling;29focused tests and
full-tree typecheck pass at this checkpoint. Fresh live Settings→reload→Back now returns
Home with one click and no added history entry on reload.

The completed pane accessibility fix is verified live in a compact thread: controls no
longer inherit disabled-button semantics, typing works and the test draft was removed.
Live Chrome multi-pane proof now includes visible grips in light/dark themes, a completed
pointer move from side column to top row, and closing the empty draft back to one pane
with no grip residue or disabled composer ancestor. Sidebar experiment-row drag semantics
have a separate validate-and-fix lane. Android has paired with the same separate backend
and is completing its remaining workspace journeys. Relay protocol3 binary fidelity has
148 passing coordinator tests and is under independent review. Late server-side text and
binary callbacks from replaced controls are now rejected; both regressions passed red→green.
Android background terminal identity was a candidate under live validation at this
checkpoint. Landscape output visibility was subsequently excluded from QA by explicit
user instruction and is not a production acceptance gate. See the coordinator evidence under
`thread-drag-accessibility/COORDINATOR.md` and
`relay-binary-fidelity/control-authority-coordinator.md` in the review artifact directory.

### Android terminal and relay message-limit findings (2026-09-08)

Android background/foreground replaced a project shell (different PID, lost exported
variable). The native lease now separates stable endpoint/pairing identity from temporary
transport generations, preserves same-host shell intent and re-watches once ready. Sixty
rich-chat/session tests across thirteen suites pass, including offline writes blocked,
host/re-pair isolation and explicit dismissal. Combined rebuilt APK verification is pending.
Historical landscape observation: terminal output collapsed under fixed-height controls.
Further landscape work and verification are excluded by the user's later priority update.

Four independent real-socket probes confirm a relay limit mismatch: an accepted channel
message can exceed the shared-control limit after framing, disconnecting unrelated
visitors. Root independently reproduced the original three probes; a fourth covers JSON
control-character expansion. Per-channel oversize isolation is assigned. This does not
replace the remaining bounded-fragment, fair-scheduling, downstream-flow-control and
streaming HTTP requirements documented in `relay-binary-review/COORDINATOR.md`.

Android watch recovery follow-up: manual reconnect retained the exact shell PID and
exported variable, but automatic reconnect initially failed its environment preflight.
That preflight now runs inside the existing retry loop, with explicit terminal failures
for authentication, malformed metadata and unsupported capability. The63-test combined
session/real-transport check and Android lint pass; the rebuilt APK automatic-reconnect
check remained required at this checkpoint. The historical landscape screenshot exposed
only about1.5 terminal lines and keyboard overlap; further landscape verification is
excluded. Portrait layout checks still require screenshots, not node presence alone.

Latest portrait mobile-web finding: Terminal → Return to app → Open terminal changes shell PID 55423 → 56026 and loses an exported variable. Source-frozen real-browser proof is recorded in `tmp/v2-production-review/dev-terminal-reopen/COORDINATOR-RED.md`; process-lifecycle correction now passes162 focused tests and live portrait proof preserves PID73878/marker; exit/reopen recovers a working shell. History restoration remains open (the remounted view loses earlier output). Desktop bottom Hide/reopen remains a passing control (PID 50624 preserved).

Latest remote chat-file checkpoint: removed the obsolete absolute-path guard and selected the full-page editor on compact layouts.33 related tests pass and the same absolute file chip now opens correctly in the390×844 browser; screenshot reviewed. See `tmp/v2-production-review/mobile-file-links/COORDINATOR.md`.

Remote terminal history integration is in progress. The display now accepts authoritative
snapshots through the historical-query replay gate;76 terminal tests pass. Startup
readiness has43 passing shell tests, with independent review pending. Connection setup
now waits for an open socket before activating terminal watches, and retired-socket
callbacks cannot change the resume cursor;104 store/capability tests pass. The shared
feed's recovery bounds and lifecycle are still under review. Final typecheck, visible
watch-failure handling, and live portrait history/query verification remain open. These
checks do not establish full v2 production readiness.

The common portrait terminal remount now has live proof: Back → Open terminal restores
history and preserves PID2717 plus an exported variable. A real PTY cursor-query probe
received exactly two replies for two live queries, with none added by historical replay.
Screenshots were visually inspected. Watch failures now have localized status messages;
77 terminal tests pass and all12 translation catalogs have zero missing entries. A
separate stale start/close ownership race was fixed with per-start identity checks;
227 ownership/router tests pass. Feed error-callback reentrancy, final integrated checks,
and completion-marker recovery across reconnect remain open. Evidence is in
`tmp/v2-production-review/browser-terminal-history/COORDINATOR-LIVE.md`.

The actual browser feed also passed a production-backend reconnect test against an
independent continuously connected observer: exact retained output and cursor3477 matched,
with two fresh watch ids and no snapshot history delivered as live output. The isolated
watch-status component fits English390px and German320px portrait previews. Remaining
work includes feed callback recovery, current-token completion recovery from snapshots,
and a compatible terminal resume design to reduce full-tail retransmission; no new resume
wire format has been implemented.
