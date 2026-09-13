# V4 execution and evidence ledger

The objective is the full [V4 merge-readiness plan](V4_MERGE_READINESS_PLAN.md),
including every phase item, acceptance scenario, performance budget, and final
qualification gate. A passing focused check does not complete its containing
phase. Native clients remain development clients with shared-contract/build
obligations. No qualification gate has been waived.

## Execution state

| Phase                                | State       | Evidence / next action                                                                                                                                                                                                                                                                       |
| ------------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 — master integration and baselines | In progress | Combined integration is on V2 at `7c0daf676`; compatibility, broad correctness checks and isolated tooling are verified at their recorded revisions. Full smoke exposed F23/F24. Complete instrumentation, comparable master measurements, hosted CI and final manual baselines remain open. |
| 1 — exclusive server ownership       | In progress | Common root ownership/bootstrap and backend settings/routing persistence are in isolated implementation/review. No complete Phase 1 acceptance scenario is yet qualified; stale snapshots, all remaining file writers and credential/lifecycle work remain open.                             |
| 2 — operation safety and lifecycle   | In progress | Admission and shared-renderer feedback are verified focused slices. Joined supervisor shutdown and stale-generation fencing are in review. Full operation identity/concurrency, descendant/process lifetime and recovery acceptance remain open.                                             |
| 3 — off-main bulk transport          | Pending     | All six work items and acceptance scenarios remain open.                                                                                                                                                                                                                                     |
| 4 — off-thread client engine         | Pending     | All ten work items and acceptance scenarios remain open.                                                                                                                                                                                                                                     |
| 5 — server/relay fairness            | Pending     | All seven work items and acceptance scenarios remain open.                                                                                                                                                                                                                                   |
| 6 — bounded payloads                 | Pending     | All seven work items and acceptance scenarios remain open.                                                                                                                                                                                                                                   |
| 7 — browser/mobile-web lifecycle     | Pending     | All five work items and acceptance scenarios remain open.                                                                                                                                                                                                                                    |
| 8 — artifact/upgrade/soak/merge      | Pending     | All seven work items and acceptance scenarios remain open; no final freeze, merge to master, or promotion authorized by evidence yet.                                                                                                                                                        |

## Rules for evidence and commits

- Record before behavior, change, independent critic findings and dispositions,
  after checks, manual evidence, and exact commit/artifact identity for each slice.
- Keep fixes small and commit after their relevant checks and review. A merge
  commit must preserve both parent behaviors and intentional compatibility fences.
- Keep measured runs separate from resource-heavy work, even in another worktree.
  A launch duration or frame sample on a busy host is diagnostic, not a benchmark.
- Do not overwrite historical evidence with a newer pass. Record which revision
  and scenario supersedes a failure and retain the original failure evidence.
- Add newly validated problems to the plan and this ledger and fix them. Record
  speculative or unverified candidates distinctly; do not invent a causal link.
- Only mark a phase verified when its complete acceptance scope is proven. The
  active goal remains unfinished while any plan requirement or final gate is open.

## 2026-09-13 — execution started

Before: clean executable source at `832fc5467`; only the untracked V4 plan existed.
Fetched refs again: master `9a4096ea8`, V2 `832fc5467`. Created isolated worktree
`.tmp/v4-integration` on branch `poracode/v4-integration` from that baseline, then
began a no-commit merge of current master. The 32 conflicts match the earlier
merge-tree preview. The root executable source remains unchanged for live baseline
testing; the master branch is untouched.

Independent plan critic validated and corrected four execution gaps:

1. A new common lock cannot exclude an already-running legacy Electron that does
   not honor it. Added explicit legacy-owner detection/refusal or separate-root
   import and both-startup-order upgrade tests.
2. A copied DB may still run real schedules/PR automation against real project
   paths. Added online backup, disposable project copies, scrubbed credentials,
   and disabled real automation before any benchmark startup.
3. Separate worktrees do not isolate performance resources. Added exclusive
   measurement windows to Phase 0 as well as final qualification.
4. Unattended credential access must be solved before declaring detached server
   restart complete; retaining an already-unsealed key in memory is insufficient.

These are now requirements in the plan. No implementation or acceptance result is
being claimed by this initial documentation checkpoint.

## Checkpoint transport admission — focused correction

Before: a fresh managed real Qwen thread with two harmless marker turns reproduced
the Revert failure. The client sent `operation: revert-checkpoint` on stream v2;
the host closed with code 1008, reason `Invalid renderer transport message`, before
creating any checkpoint journal entry. This isolates admission failure from the
separate operation-journal/concurrency defects in Phase 2.

Before evidence directory:
`/Users/svecherenko/.poracode-smoke/v4-before-832fc5467-1789284600/artifacts/`.
The report, client socket journal, empty operation journal, screenshot, and actual
bundle hashes are retained there. The loaded backend SHA-256 was
`a17f137d6a3c01524a0c2317e43b42e00d9d983909389d649eff9d17734b485f`.

The focused real-WebSocket regression failed as expected with `{closed: 1008}`
instead of a reply; see `tmp/v4-architecture-audit/revert-admission-before.log`.
The fix derives the operation type and admission guard from one runtime vocabulary.
This restores an operation already declared by host v5/stream v2, so no new wire
version is needed for this correction.

After source correction, four targeted suites passed (51 tests), covering renderer
stream admission, protocol request construction, compound checkpoint behavior,
and client transport. Independent critic requested a negative otherwise-valid
unknown-operation request; it was added and closes 1008 without dispatch. Critic
review of the final three-file delta is clean. Fresh manual AFTER remains pending
until a rebuilt candidate repeats the journey; this does not close Phase 2.

The same baseline exposed **F13**, a verified smoke-tooling isolation defect now
added to the plan: the managed runner uses checkout `dist/main` instead of a
session-local runtime. Fix and prove isolation before final qualification; the
baseline was stopped cleanly and its bundles preserved before source changes.

## Checkpoint transport admission — live AFTER at `d7595e93d`

A fresh managed real session rebuilt the candidate and repeated two harmless
Qwen3.8 Flash turns, the actual checkpoint dialog, and a subsequent provider turn.
The renderer received the matching successful reply in 1.621 seconds; its socket
stayed open, local history was truncated, the removed prompt returned to the
composer, and the subsequent marker completed idle. Captured production file
hashes and the complete production patch match committed `d7595e93d` exactly.
The owned session was stopped through its managed owner after capture.

After evidence:
`/Users/svecherenko/.poracode-smoke/v4-after-revert-1789288800/artifacts/AFTER.md`.
The report preserves screenshot paths, source and bundle hashes, request and
operation journals, and the explicit scope limits. This verifies the focused
transport admission correction in development builds; final production/browser
qualification and the rest of Phase 2 remain pending.

The journal reported `completed_local_only`, with provider rollback failed and
no provider anchor. This is **not** successful provider rewind evidence. That
result exposed F14: the renderer showed no partial-outcome warning.

## F14 — disclose local-only checkpoint reverts (in progress)

Before: the real AFTER screenshot above showed the trimmed transcript and
restored draft without explaining that the provider could still use removed
messages. A regression now exercises the real rendered warning in both the
confirmation and skip-confirmation paths. Both cases fail on the prior behavior;
see `tmp/v4-architecture-audit/f14-before-regression.log`.

The focused correction uses the existing persistent HeroUI warning toast and
localizes the existing failed/ambiguous messages. It describes local history and
provider context without guessing whether files changed. Operation keys,
journaling, and concurrency are unchanged. The focused ChatPane, MessageList, and
toast-provider suites pass (118 tests); full typecheck and touched type-aware
lint/format checks pass. All four messages are translated in all 12 non-English
catalogs; a second extraction reports zero missing. Logs are under
`tmp/v4-architecture-audit/f14-*`.

Independent critic review and fresh manual AFTER disclosure evidence remain
required before this slice is marked verified. Native counterpart disclosure
remains development work; Phase 2 remains open.

### Outcome-feedback critic — F15

The primary critic accepted F14's outcome guard, wording, translations, and
rendered-UI coverage. It identified a separate adjacent failure: opting out of
confirmation also hides failed/ambiguous errors because the existing catch only
logs them. Added F15 to the plan and first reproduced both missing visible errors
in `tmp/v4-architecture-audit/f15-before-regression.log` (two failures).

The focused follow-up adds the existing danger-toast pattern with `friendlyError`
to that catch. Tests require visible feedback, retained history, no rescued draft
on failure, and one request only. No automatic retry or journal change is added.
The preliminary manual session was stopped before any provider prompt; final
source checks, delta re-review, and fresh F14 disclosure evidence remain pending.

### F14/F15 — verified focused feedback slice

The final primary critic review accepted both corrections with no further
production changes requested. The three focused ChatPane, MessageList, and
toast-provider suites pass all 120 tests. The tests render the actual warning in
both confirmation modes and the actual failed/ambiguous error toast when
confirmation is disabled; they preserve history/draft behavior and assert one
request. Full typecheck, touched type-aware lint, format, and diff checks pass.
Extraction reports zero missing translations in all 12 non-English catalogs.
Final logs are `tmp/v4-architecture-audit/f14-f15-*` and
`tmp/v4-architecture-audit/f14-i18n-final.log`. F15's injected failure evidence is
deterministic rendered-UI coverage, not a live provider failure reproduction.

Fresh real Electron evidence is retained at
`/Users/svecherenko/.poracode-smoke/v4-feedback-after-1789291800/artifacts/FEEDBACK.md`.
This managed session rebuilt from `d7595e93d` plus the recorded feedback patch;
the complete production diff and all changed source hashes were captured before
interaction and matched again after teardown. The MessageList SHA-256 was
`fe0c0ff6740e7b4ec6eb2efa03c8d1b3a83c99a17d50f663abddc80828ab7238`.

Two harmless Qwen3.8 Flash turns followed by the actual Revert dialog produced
`completed_local_only` with provider rollback failed and local phases completed.
The exact warning appeared, the removed prompt returned to the composer, and
the warning persisted beyond 39 seconds until dismissed through the actual Close
control. A subsequent turn completed idle after answering a provider question
caused by the test helper inserting text before the restored draft; that input
mistake is recorded in the report. The session captured no window errors,
unhandled rejections, console warnings, or socket closes during the interaction.
The fixture project stayed clean, and managed reset/stop completed successfully.

This proves the focused shared-renderer disclosure behavior in a development
Electron build. It does not prove provider rewind, native disclosure, production
artifact qualification, browser/mobile-web manual coverage, or any remaining
Phase 2 identity, concurrency, recovery, and crash guarantees. Those gates remain
open. The smoke-tooling artifact-isolation defect F13 also remains open.

## Master integration — compatibility and critic evidence (in progress)

The isolated `poracode/v4-integration` branch combines original V2 `832fc5467`
with `origin/master` `9a4096ea8`. The 32 textual conflicts have been resolved in
the worktree; the merge is not yet committed. Independent review accepted the
pane/accessibility, welcome, provider settings, package, and database resolutions.
It found F16: first PTY output arriving during scrollback hydration skipped the
launch resize retry. The existing normal-output case passed and the new hydration
case failed before the fix. Moving live-output detection before buffering passed
both cases, and the critic closed the finding. The full XTerm suite also passed.

Fresh compatibility generations are remote protocol 12, local host protocol 6,
direct renderer stream 3, supervisor status cache 35, and renderer status cache 32. SSH runtime manifest 2 preserves master's dependency-aware format. Generated
remote bindings and the native operation map are rebuilt. Actual old cache
rehydration tests failed with the previous V2 cache constants and pass with the
new constants; old local wire frames are rejected before dispatch. Current
architecture docs now describe the backend child, headless composition, direct
stream, and remaining main/UI-thread work.

Both native reducer paths implement authoritative replacement streams. Shared
fixtures cover append/replace/empty replacement, separate streams, payload and
completion preservation, malformed flags, and stale replay after history load.
The saved-pairing upgrade gate explicitly reviews disk versions 9, 10, and 11;
an authenticated read of a current host is required before rebinding. Old live
hosts remain incompatible. Native red/green evidence is under the integration
worktree's `tmp/v4-native-replacement/`.

The subsequent broad native run passed Android 1,170/1,170 JVM tests plus
assembleDebug/lintDebug, iOS AppTests 1,269/1,269, and 73 shared contract tests.
Neither native run skipped tests. Results, logs, and the iOS result bundle are
under the integration worktree's `tmp/v4-native-broad/`; the owned simulator was
shut down. Portable Swift package pin auditing remains in progress.

The first full JavaScript run passed 12,979 tests and exposed the deliberately
failing F16 regression, stale v11 parity-test pins, and F17's inherited Git
identity. The parity pins and test isolation are corrected; the affected real
checkpoint/ledger suites pass 9/9. A final full run is still required. F17 changes
only fixture environment isolation. These checks are correctness evidence during
concurrent build/test work; they are not latency, frame-rate, or resource metrics.

All Phase 0 measurement, comparable master, artifact, deployment, and final
manual gates remain open. The complete Phase 1–8 plan remains pending beyond the
focused checkpoint admission and feedback fixes already recorded.

Follow-up compatibility verification exposed F18: four portable Swift harnesses
still pinned protocol 9. Their generated metadata gate failed real route
canonicalization tests before the four pins were updated to 12. Full portable
suites passed 173/173 afterward, and primary review accepted the four-line change.
Aggregate evidence is `tmp/v4-native-broad/verification-summary.json` in the
integration worktree. AppTests, Android, generated app bindings, and production
native sources were unchanged during this portable verification.

The second full JavaScript run passed 12,986 tests but failed the real settings
watcher test on its first atomic replacement. That failure remains under
investigation; no timeout increase or flaky-test dismissal is accepted as a fix.
Full typecheck and type-aware lint pass. Production desktop and canonical web
builds pass; the latter finalized the service worker and embedded SSH runtime.
These artifact builds do not substitute for the required real-client journeys.

## Phase 0 memory accounting — verified focused correction

`ProcessMemorySampler` overwrote its single root-PID map entry on every probe;
the summary therefore reported the last own-process RSS as the peak. The focused
regression failed with 100 KB instead of the earlier 400 KB. A scalar maximum now
retains that peak independently of the summed descendant peak. Three tests cover
the two peaks, unrelated processes, process exit/probe failure, and unknown data.
Reports carry `samplerVersion: 2` so unversioned old own-process peaks cannot be
mistaken for corrected measurements. Focused tests and touched type-aware lint
pass; independent critic review accepted the accounting, regressions, report
version, and limits of the controlled-child evidence.

A controlled child-process check ran old and new samplers against the same
allocation/release sequence. Python mmap RSS fell from 113,232 KB to 14,928 KB;
the old sampler reported 14,928 KB as its own peak and the corrected sampler
retained 113,232 KB. The child was stopped and joined. Evidence and the exact
driver are under `tmp/v4-architecture-audit/memory-peak-*`. An earlier Node Buffer
attempt did not release resident memory, failed the driver's evidence assertion,
and is retained as `memory-peak-real-node-no-release.json`; it is not a successful
before/after result. This validates accounting only, not app memory budgets,
process CPU, event-loop latency, or the remaining Phase 0 instrumentation.

F19's settings registration gaps are also corrected in the integration worktree:
three regressions failed before and 27 focused tests pass after. Two real-file gap
probes now read the current value immediately, 200 atomic transitions pass, and
a 10,000-read healthy-cache probe performs zero filesystem calls. Primary review
accepted the change; full typecheck/lint/format pass. The original full-suite
watcher failure is preserved with its cause explicitly unproven. The final full
integration suite is running after this correction.

The final integration run after F19 passed 12,990 tests across 1,143 suites;
120 tests in five suites remain skipped by the existing configuration. Full
typecheck, both lint modes, and full format check pass. The docs critic corrected
claims about persistence-before-delivery, CLI-vs-desktop locking, SQLite required
at startup, iOS startup compatibility checks, current N-API dependencies, and
configured CI versus actual candidate evidence. No application performance
qualification is implied by these correctness checks.

## Integration commits and controlled CI (in progress)

Master integration is committed as `42afd21c4` on `poracode/v4-integration`, with
both original parents retained. Root V2 now contains the admission correction
`d7595e93d`, feedback correction `7b5d3dbf8`, and corrected memory accounting
`ea40ffb3b`. Combining those with integration required one semantic test conflict:
keep both admitted request operations and current stream version 3 while retaining
the old-version refusal cases. The seven affected backend/renderer suites pass
174 tests, full typecheck passes, and extraction reports zero missing in all
12 non-English catalogs. The remaining phases and manual qualification stay open.

CI qualification is committed independently at `c760152bb`. Nightly publication
requires the exact current trusted master SHA, successful latest core/native
workflow attempts, and their successful aggregate jobs; manual dispatch uses the
same gate. The workflow rechecks before upload and alias changes and preserves
the existing `mobile-web` environment. Core/native checks now trigger for V2 and
integration branches, and native CI includes the four portable Swift contract
suites. Primary critic review and 14 local policy/workflow regressions pass,
including executing the actual aggregate and portable-suite shell gates against
failures. No workflow was dispatched or deployment performed. Source configuration
is not current-head hosted evidence. Details are in
`.tmp/v4-ci-gates/tmp/v4-ci-gates/EVIDENCE.md`.

During those checks, F20's shared-dependency symlink error rewrote root package
links. The confirmed symlink alone was removed, a frozen ignore-scripts install
restored the root links, and package resolution/native loading checks passed.
The package/lockfile diff remained empty; root metric tests also passed again
after repair. Before/after evidence is retained in the CI worktree. The no-shared-
`node_modules` rule is added to the plan and the isolated testing skill.

## F13 — isolated runtime tooling integrated

F13 is fixed in `410197bd9` and merged with the controlled CI change into the
combined V2 source at `7c0daf676`. The runner snapshots main/backend/supervisor,
preload/workers, frozen development renderer, resources and the complete declared
production dependency closure. Native helpers use a private Cargo target and the
copied native modules pass Electron validation before artifact hashing. The
previous ABI-swap hypothesis was rejected: current native modules use N-API;
missing preparation/validation was the actual omission.

Two isolated live sessions retained their own runtime hashes through a checkout
rebuild, a throwing checkout sentinel and an owned backend restart. Stopping one
left the other ready. Forced build cancellation and normal teardown joined all
verified owned groups and closed their ports. Both independent critics accepted
the final source; 21 CDP-tool tests and eight isolation/process fixtures passed.
CI's 14 policy tests and the three memory-peak tests also passed after combination.
Details and cleanup evidence are retained in
`.tmp/v4-smoke-isolation/tmp/f13-evidence/REPORT.md` and `cleanup.json`.

This closes the reproduced macOS development-runtime isolation defect. It does
not qualify a packaged artifact, Windows teardown, application performance, or
every existing smoke scenario against the new frozen renderer. The observed
window-bounds write failure on process-group teardown is retained separately;
normal app-quit behavior must be tested independently.

## Combined full smoke — `7c0daf676`, failed with two coverage gaps

A fresh managed full mock run built clean `7c0daf676` into its own runtime. The
source hash was `95076d3378c903c440e491eb77a4b660e3bd703e5954a11664b06725648aa8a1`
and artifact hash `377b11c2020d1026481683d8d87dbf304a5fdd4af1dd0586ca3bafff3c70ca83`.
The retained session and report are under
`/Users/svecherenko/.poracode-smoke/v4-integration-7c0daf676-full-01/`.

Welcome dismissal, baseline, all 23 Settings sections, control geometry,
schedules, GitHub Actions, search and browser scenarios passed. Fifteen of the
seventeen deterministic mock gates passed; their report explicitly records the
limited mocked assertions. The primary visually inspected the baseline, About
and browser fixture screenshots. The interaction captured zero renderer console
errors or runtime exceptions. Mock gates are not proof of real providers,
speech/microphone use, PTY operation, authentication or remote-client journeys.

The full run failed F23's voice source-URL import and F24's absent Quick Composer
mock check. Both are now mandatory tooling follow-ups in the plan. The session
owner completed teardown and marked schema-2 session state `stopped`; its runtime
was removed. The process-group teardown again logged the main window-bounds write
warning after backend exit. It does not establish that normal `app.quit()` has
the same race. The full smoke is not green and must be repeated after the fixes.

## F21 — asynchronous resource probes, verified focused slice

Both existing helpers synchronously executed `ps` on the Node test client's event
loop. A controlled wrapper added a 150 ms delay before a real system process
probe. The original memory and host-load helpers produced maximum heartbeat gaps
of 547.2 ms and 278.8 ms. After asynchronous serialized probes and awaited stop,
the same driver recorded 12.2 ms and 13.5 ms gaps; starting the samplers returned
in under 0.05 ms. Raw intervals and source hashes are in
`tmp/v4-architecture-audit/sampler-delay-{before,after}.json` with the driver.
Concurrent machine load differed between runs, so these numbers demonstrate the
blocking boundary only and are not a controlled performance comparison.

Seventeen initial focused helper tests passed, including a held probe with progressing
client work, no overlap, stop/join, restart, failure accounting and retained peak
memory semantics. Memory report version 3 and host-load version 2 distinguish
this observer from prior reports. All four profile callers await pending probes
before serializing their final summaries. Process CPU and the rest of Phase 0
instrumentation remain open.

The independent critic found that per-scenario windows could still serialize
before a pending probe finished. Both a failed external probe and a controlled
successful delayed probe showed zero samples/zero contamination before joining,
then one contaminated sample afterward. Those records are retained under the
owner worktree's `.tmp/v4-owner/sampler-window-join*`. Windows and summaries now
capture their endpoint first and await the pending probe; the critic's repeated
real-helper check confirmed the sample is included without extending that end.
Two tests cover delayed successful and failed probe serialization.

The primary then verified that raw per-client metric arrays could change after
aggregate capture. A regression failed before copying them. Metrics version 2
now freezes those arrays, and profile metrics are captured before awaiting the
resource observer. The asynchronous wait cannot expand their measurement window.
All 26 tests in the four helper suites pass; full typecheck, touched type-aware
lint, format and diff checks pass. The independent critic accepted the final
snapshot and window ordering. Final logs are `async-sampling-*-final.log` under
`tmp/v4-architecture-audit/`; all new red evidence is preserved alongside the
original observer-stall result. No application performance budget is qualified.

## Phase 1 and Phase 2 ownership work started

Three isolated lanes at the combined integration base are implementing the
common root lease/bootstrap, backend settings/routing ownership, and supervisor
join/fencing. The root design separates the legacy import source from a canonical
host-owned sibling, holds an external kernel lease before mutation, and stages
verified imports without activating copied automation. Desktop crypto remains
native while key-file I/O belongs to the leased backend. The unattended-key and
complete activation/migration requirements remain open.

The first settings slice moves persistence and routing acknowledgement into the
backend for both Electron and headless composition. Review exposed F22's false
failure after a notification exception; red tests and the correction are in the
same lane. Complete settings authority must include the supervisor ACP registry
and CLI-hook-support writers, and reject conflicting stale client snapshots.

The shutdown slice joins supervisor process/channel closure and already-owned
checkpoint continuations before closing SQLite, and fences replaced-child
messages. Its real final-IPC test covers POSIX; Windows currently uses forced
process-tree termination. Descendant joins, graceful Windows shutdown, backend
parent timeout and the remaining request drains must still be completed. None of
these first slices closes its phase or establishes final merge readiness.

## Reviewed ownership slices integrated

`1941434fa` moves Electron settings commands and common headless routing
persistence into the backend and fixes F22. Its 133 focused tests, full typecheck,
both lint modes and independent critic passed. In a frozen isolated Electron
session, real Appearance controls changed the theme; real IPC created/updated a
profile with synthetic secrets. Backend reads, disk inspection and renderer
reload agreed, and no plaintext secret was persisted. Selected smoke scenarios
passed before and after reload with zero renderer/runtime errors. The owned
session was stopped. Evidence is
`.tmp/v4-settings-owner/tmp/v4-settings-owner/EVIDENCE.md`.

`07e0ccfdc` adds joined supervisor shutdown and stale-child fencing, including
the owned checkpoint continuation barrier. Its 76 focused tests, full typecheck,
lint and primary review passed. Real disposable POSIX children prove delayed
final IPC reaches SQLite before closure and an unresponsive leader is escalated
and joined. The real SIGTERM fixture explicitly skips Windows; descendant joins,
Windows graceful shutdown, parent quit deadlines and full request drains remain
open. Evidence is `.tmp/v4-shutdown/tmp/f11-evidence/REPORT.md`. The two slices
were combined with sampler correction `952aa83e1`; root `0354a0c68` passed 153
tests across 18 affected suites and full typecheck. Host protocol is now 7;
renderer stream 3 and remote 12 are unchanged.

Lease/path helper `86c4d50ef` and its F25 correction `2adbbe58e` were integrated
together as `7ab21fa43`. They remain unwired. Nineteen tests passed on root,
including concurrent desktop/headless acquisition, crash recovery, replacement
of the owned data directory, symlink-alias refusal, future-format refusal and
three repeated same-process attempts followed by actual child contenders. The
initial helper's six alias/metadata failures and F25 lock-loss failure are
retained in the owner worktree. These tests qualify the helper, not startup
ownership or safe import/activation as a whole.

## Process CPU instrumentation — verified counter-accounting slice

The two existing load profiles now also sample cumulative CPU counters for the
root and its observed descendants, without retaining command lines. Accounting
uses matching PID/start identities and monotonic sample intervals, preserves
counter precision, and records lost exit tails, missing/replaced roots, counter
regressions and a 4,096 historical-metric limit. The latest tree is separately
bounded by the 8 MiB probe-output cap. This is partial observation; quantization
can overstate a short interval, so it is not a strict lower bound. Unsupported
platforms cannot report a valid zero.

A disposable Node parent/child fixture reported 599.581 ms and 799.948 ms of CPU
work via `process.cpuUsage`. Eleven external probes recorded 600 ms and 800 ms,
with zero probe failures; both children were joined and their PIDs no longer
existed. Raw data, source hashes and exact drivers are under
`tmp/v4-architecture-audit/process-cpu-real*` and `cpu-fixture.mjs`. This is a
counter-accounting check, not application performance qualification. Short-lived
processes, exit tails, same-second PID reuse and probe timing/quantization remain
explicit limitations. The independent critic accepted the accounting/stop wiring
and corrected the lower-bound/retention wording above. In-process CPU/event-loop/
GC, command/event correlation, queue metrics, compositor/input traces and
controlled master comparisons remain open. Fourteen targeted tests, full
typecheck and touched type-aware lint/format pass; logs are `process-cpu-*-final`
under the same evidence directory. The final source differs from the real probe's
recorded sampler hash only by the critic's correction of its lower-bound comment;
the executed accounting code is unchanged. Linux formatting has parser coverage
and was checked against the upstream procps manual; actual child evidence here
is macOS. No Linux or Windows runtime measurement is claimed.

## Further smoke findings in progress

The F23 frozen voice loader now executes through bundled DEV imports. One full
run passed its voice checks; a later full run failed at draft-button state and
is being investigated, so stable full-suite voice coverage is not yet claimed.
The Quick Composer native query confirmed actual hide/show transitions while DOM
visibility stayed `visible`. Without granted OS focus, the renderer remained in
`closing`; this is F26, now added to the plan for a native-show-driven reset.
The QA driver will not fabricate focus/visibility events or acknowledge the
remaining real shortcut, dragging, visual motion and provider manual gates.

## Offline import and credential foundations integrated

Reviewed staging commit `f1ce72f8d` and credential commit `21943324f` are now
integrated. Root passed 65 lease/import/manifest/physical-identity tests and 34
credential tests plus full typecheck. Import operates only on an explicitly
offline backup and produces an inactive staged root; activation, path/session
conversion, automation fencing and legacy roots missing SQLite still need their
required recovery paths. No live startup uses these helpers yet.

Credential provenance version 1 distinguishes OS-sealed, headless file, injected
environment and session-only modes. The reviewed helpers preserve corrupt,
replaced or mismatched keys, reject late/missing native generations, and reject
blank environment injection before coalescing. The persistence capability rejects
new durable encrypted secrets under a session-only key. The tests establish the
helper guard; enforcement by actual settings/usage writers remains part of wiring.
Original red evidence and the old-helper/new-helper key-rotation experiment are
retained under `.tmp/v4-owner/.tmp/v4-owner/`.

Settings authority foundation `a5a57cfa6` is also integrated but inactive. The
primary and independent critic reviewed subject revisions, canonical migration,
unknown-field preservation, credential classification, and the lease/commit
barrier. Review reproduced ordinary plaintext becoming newly sensitive, or newly
designated as a driver's credential, bypassing the original equality exemption.
The corrected exemption requires the previous slot to have been classified as
secret. Existing explicit plaintext declassification and unchanged legacy values
remain supported. The paired regressions and unknown-key sanitizer correction
pass in the 65-test agent run. Evidence is
`.tmp/v4-settings-owner/tmp/v4-settings-owner/AUTHORITY_FOUNDATION_EVIDENCE.md`.
Queue admission bounds, ordered snapshots/results, all-writer conversion and
protocol/native activation remain open; this does not close F2.

## Audited master build identity recorded

Detached, clean master `9a4096ea8` has its own frozen-lockfile dependency install
and passed native preparation, Codex protocol generation, desktop build and its
canonical `build:mobile`. The final mobile command rebuilt Electron; hashes were
recorded afterward. Toolchain is Node 24.20.0, pnpm 12.3.4 and Electron package
44.0.0 on macOS 26.6.2 / arm64 / Mac17,8, with 18 logical CPUs and 48 GiB RAM.
Master's remote protocol is 10, read from its actual source; it predates V2's
contract-manifest layout. An initial provenance-script path assumption failed
before writing a record and was corrected without changing master source/builds.

`tmp/v4-architecture-audit/master-baseline-provenance.json` records 3,239 `dist`
files totaling 142,673,349 bytes and manifest hash
`3189df5b0ed633f30dac746213cdb42930a3788d6f071784f12f1e4dfc5ec7ef`.
Build logs and exact recorder are beside it. This is an observed checkout build,
not a packaged/installed artifact or complete immutable runtime closure. No app
launch, cold/warm comparison, frame/input timing or soak is claimed for it.

## Additional native and instrumentation findings

F27 and F28 are added to the plan. F27 is the no-project selector render loop
found by the real-component regression; F28 was reproduced in a frozen native
window with a local iframe and a held Quick Composer handoff. Their fixes and
fresh full smoke are under review in the smoke-coverage lane.

F29 was caught before the new diagnostics were enabled in a real app. The first
owned Node fixture's 100 ms loop consumed approximately 102 ms CPU, yet its
post-reset delay maximum was 1.28 ms. Node 24.20.0 source confirms histogram reset
clears the prior timestamp used by `RecordDelta`. Raw before/after JSON and the
initial failed test are `in-process-stall-{before,after}.json` and
`in-process-initial-tests.log` under `tmp/v4-architecture-audit/`. The corrected
sampler keeps a separate timestamp and records completed timer intervals plus
the unfinished tail. These are interval-based observations, including the timer
period; they are not interchangeable with Node's newer iteration-based mode.
Installed Electron 44.0.0 embeds Node 24.18.1, which lacks that newer option;
the actual built-in function was captured in `electron-perf-api.json`.

F30 was then reproduced while wiring the actual owned headless factory: disposing
PrWatch during an awaited lookup still permitted store reads/deletion and a
mocked merge. The red test uses only synthetic service dependencies, with evidence
in `.tmp/v4-owner/.tmp/v4-owner/durable-prwatch-close-before.log`. Owner-lane work
now includes a coherent durable ingress/PR/schedule admission and join barrier;
the wider F11 process/descendant/request work remains assigned separately.

## Bounded in-process diagnostics — reviewed and exercised

The opt-in format-1 recorder is wired to desktop main, backend, supervisor,
standalone server and relay entrypoints. It retains four pending records at most,
serializes file appends, caps output bytes, and adds at most 500 ms of diagnostic
grace to normal shutdown. Disabled startup creates no observer or writer. The
independent critic accepted observation scope, bounded output, privacy and
shutdown behavior; its log is `node-diagnostics-independent-critic.log` under
`tmp/v4-architecture-audit/`. Fifteen final focused tests, full typecheck, both
touched lint modes, format and the smoke inventory audit pass. Initial test-only
typing/lint failures and the F29 measurement failure remain in their first logs.

The corrected CPU/stall/GC fixture also runs on Electron 44's actual embedded
Node 24.18.1, with raw data in `electron-in-process-stall-after.json`. The final
production-mode main-process build passed. Its compiled standalone server and
relay each reached readiness on loopback with a disposable profile/home, recorded
four samples with zero dropped records or output errors, and exited normally
after a leader-only SIGTERM with complete end markers. Their entry hashes were
unchanged during execution; `diagnostic-entrypoints.json` records the exact
artifacts, fixture directories and output. The first successful callback-shape
build remains separately recorded as `diagnostic-entrypoints-initial.json`.

These are instrumentation and shutdown-output checks. The live Electron-main,
backend and supervisor combination still needs the final integrated smoke; the
embedded-Node fixture alone does not prove those hooks in a running GUI. Enabled
versus disabled observer overhead, correlated commands/events, queue byte/age
metrics, frame/input traces, controlled master comparisons and final production
qualification remain open. No app latency, throughput, resource or 120 Hz gate is
qualified by this slice.

## Native smoke follow-up accepted in its own branch

Product commit `3fc2c7ee5` fixes F26/F27/F28 and advertises actual preload peer 8.
Tooling commit `194c7ea09` fixes F23/F24 and shares the CLI's validated pointer
actions with Quick Composer. Primary source review and an independent F26 critic
accepted the product changes. The pointer extraction adds 14 functional refusal/
dispatch fixtures; 30 focused tooling checks passed.

Frozen05 passed 9 automated scenarios and all 17 mock gates with zero captured
runtime errors, source `aed79eb2e17d519c8eb2fe8d93af48ebf147eb922d5ae7e3a846faa4c64a97cf`
and artifact `56e7742bd67ead573d60cbc5c2c5984168c263349cc33366f9485ecd4197b237`.
The exact iframe before/after probe delivered the second submission without an
injected ready acknowledgment. The actual no-project view/action also passed.
Primary inspected ready-to-submit, main handoff, no-project and preserved voice-
draft screenshots. Frozen06 then passed the Quick Composer gate with the final
shared pointer helper, source
`2422bacd23568a9d6459fddcc15398bcf3d0a6b66c8ec14c38a53e8aa3bded62` and artifact
`ecfbdaf3524775b9fc1d764ecbaf7c399ec016a23a834bac20b5f7667366cd3c`.
All six owned sessions were stopped and their runtime directories removed.

Details are `.tmp/v4-smoke-coverage/tmp/f23-f24-evidence/REPORT.md`. The single
dev02 voice draft timeout remains unexplained, despite passing repeats. Real
shortcut/tray, dragging, motion, provider execution and the final combined build
are not claimed by these mock results. The product source differs from frozen05
by the documented stale-comment correction; frozen06 is a separate targeted
tooling run, not another full-suite result.

## Settings admission and publication ordering integrated

Reviewed inactive slice `dc24042bf` is merged as `e99a8e67d`. It bounds active plus
queued settings transactions to 128 requests / 4 MiB, with a 1 MiB individual
request ceiling, and publishes authority/sequence and affected ancestor revisions.
These limits have held-persistence regression coverage; they are not measured
throughput or heap budgets. The primary review reproduced an older pending read
being accepted after a known publication gap. The corrected connection-scoped
guard retains the highest observed sequence and returns explicit resync/reconnect
decisions. Older connections cannot restore prior authority state.

The author reports 81 tests / nine suites and full checks. The primary verified
all ten frozen file hashes and independently ran 52 tests / seven relevant suites;
the root combination with diagnostics then passed 95 tests / 13 suites and full
typecheck. Logs are `authority-admission-primary-tests.log` in the settings
worktree and `integrated-settings-diagnostics-{tests,typecheck}.log` under
`tmp/v4-architecture-audit/`. No client writer is activated by this slice.

## Combined Electron diagnostics and mock coverage

Clean `78b387fea` was frozen into session
`/Users/svecherenko/.poracode-smoke/v4-integrated-diagnostics-NlbiOW/session.json`.
Source hash is `27096a52961dd59f44d5eb9ecabc57edfbfbb49370bf7b2c28960d85503e0ac0`;
artifact hash is `85e24754b44b84869c8ee79a017a184ed1be475103ae3b7ff8160d5929d82c9e`.
The full mock run passed nine automated scenarios and all 17 mock gates with
zero captured runtime errors. Primary inspected Quick Composer input/handoff and
preserved voice-draft screenshots. Runtime verification passed before teardown;
the managed owner reported stopped and removed its runtime directory.

Opt-in diagnostics ran in the actual desktop main, backend and supervisor.
The retained files contain respectively 974, 973 and 973 contiguous samples and
complete end records, with zero dropped records or writer errors. Exact headers,
hashes, permissions, counts and teardown state are in
`tmp/v4-architecture-audit/integrated-diagnostics-recording.json`; the raw NDJSON
and screenshots remain in the session directory. Concurrent development work and
the frozen development build disqualify this run from performance acceptance.

An attempted normal-close probe used HTML `window.close()`. It removed the main
target but left the other window/processes alive. Electron 44's sandboxed renderer
does not install the native-close override in
[`window-setup.ts`](https://raw.githubusercontent.com/electron/electron/v44.0.0/lib/renderer/window-setup.ts);
its native source routes WebContents destruction to immediate window destruction.
Independent source review agrees this probe does not prove a native-close bug.
The exact-app native automation request subsequently timed out. Final cleanup used
the managed process-group stop, so those end records are not normal-quit evidence.

QA bridge version 2 adds guarded calls to the actual `BrowserWindow.close()` and
`app.quit()` methods. The two missing-action regressions are retained in
`native-shutdown-controls-before.log`; the final 37 tests / four suites,
typecheck, touched lint and inventory audit pass. An independent trust/lifecycle/
R4 critic also passed 15 tests / three suites. This boundary remains development,
unpackaged, mock-only and restricted to the current main window's top frame;
version-1 peers are rejected. Fresh native shutdown evidence is still pending.

## F32 — retained ownership and first-open liveness

The owner lane reproduced a live process losing its kernel lease after its last
JavaScript lease reference was abandoned and explicit GC ran. A real second child
then acquired the same namespace. `HostOwnerLease` now retains successfully
acquired leases until explicit release; failed acquisition is never retained.
Normal release closes SQLite and removes the retained entry. The real child
regression verifies continued exclusion after GC and successor acquisition after
the actual holder exits.

The broader lease run also caught simultaneous first-open attempts both refusing
ownership. A thirty-pair real-process probe reproduced five such liveness failures
and no dual-owner outcome. Enabling retained locking before the exclusive
transaction can retain each connection's schema-read shared lock during upgrade.
The transaction now acquires first and only then enables retention across commit.
The same thirty-pair probe subsequently admitted one owner per pair. No random
sleep, PID authority or raw read/open of an existing lease inode was added.

Evidence is under `.tmp/v4-owner/.tmp/v4-owner/`: `owner-lease-gc-before.log`,
`owner-lease-gc-after.log` (the first-open failure remains in that broader run),
`lease-first-open-before.json`, `lease-first-open-reordered.json`, and
`owner-lease-gc-and-first-open-after.log`. All twenty lease tests pass, as do full
typecheck and touched lint/format. Independent and primary review each repeated
the twenty-test lease suite successfully. The initial unsupported Vitest repeat
flag and probe-loader path errors remain as failed tooling attempts, not runtime
evidence.

This bounded correction changes neither lease format 1 nor owner metadata format 1.
Actual headless/bootstrap wiring is a separate uncommitted candidate and must wait
for confirmed ingress/request drains before claiming safe lease release. All roots
and processes here were disposable; Linux/Windows, installed upgrades, real profiles
and full Phase 1 acceptance remain open.

## Joined durable services and native credential codec integrated

F30 commit `0fa3dfb93` closes PR-watch, schedule, Git-state and app-controls
admission and joins admitted continuations. Headless composition begins HTTP,
durable and supervisor shutdown together, rather than leaving automation active
while waiting for HTTP close. A failed participant cannot skip other stops or
reach SQLite close. Schedule launch/configuration continuations are joined
separately from interrupted task-completion promises, avoiding a whole-turn wait.

The primary review found and required the headless ordering and Git-state fixes;
their real/synthetic held-work reds remain in the owner lane. The final author
run passed 152 tests / 14 suites; the independent proof/compatibility/R4 critic
passed 127 tests / 12 suites. Full typecheck and touched checks passed. Broader
HTTP-handler, proxy, provider-descendant, Windows and outer-process shutdown still
belong to F11. In particular, the existing five-second HTTP disposal timeout
does not yet prove that its admitted handler work has completed.

`db53f2a4c` adds the separately reviewed, inactive native key codec: current-owner
generation, canonical bounded key bytes, OS-backed storage availability, and
fixed error messages. It reads/writes no files. Primary and independent review
accepted it; 46 credential tests / three suites passed independently. Root
consolidation `ad7143d53` passed 476 tests / 49 suites and full typecheck before
the following frozen app run. Main's actual custody conversion remains pending.

The four-file inactive preference/credential adapter `77bad9b67` is separately
merged as `caa76fa4d`. It rejects the reproduced profile-driver credential-guard
bypass, scopes dedicated commands, checks persistent custody before sealing, and
rechecks CAS inside the authority. Intentional deletion and explicit plaintext
storage remain possible. The author passed 145 tests / 12 suites; primary passed
30 policy/command tests and verified all four frozen hashes; the independent
custody/R4 critic passed 52 tests / three suites. No legacy writer is removed or
production authority activated by that commit.

## Real native-close path on the combined development build

Clean `ad7143d53` was frozen into
`/Users/svecherenko/.poracode-smoke/v4-native-close-P8dcer/session.json`, source
`60834c7eb18b3367895d56d0f96e290e303470facdefd01796d211c5ca50995b`, artifact
`ebfa6c201d87ba1610352c83d6e05c740703a439c869233c9dfe0eca5e0b685d`.
The full mock suite again passed nine automated scenarios and 17 mock gates with
zero captured renderer/runtime errors. Primary inspected handoff/draft screenshots
and verified the complete runtime hash before closing.

The test confirmed native QA peer 2 and the persisted fixture close-to-tray value
of false, then invoked the actual `BrowserWindow.close()` through the guarded
bridge. The main, backend and supervisor processes exited; the managed owner
completed teardown and removed its runtime. Their files contain respectively
285, 284 and 284 contiguous samples with complete end markers, zero drops and
zero writer errors. `native-close-combined-recording.json` and companion logs in
`tmp/v4-architecture-audit/` pin raw-file identities, pre-close PIDs and subsequent
absence. A redundant stop command after the owner had finished refused the
already-inactive session; that log is retained and is not a teardown failure.

Native stderr retains two Chromium WidgetHost rejection lines during the run and
two macOS task-policy lines during close; their causes are not assigned by this
test. The script's zero captured-error count is not a claim of empty stderr.
This is an idle mock native-close check, not OS-menu/shortcut coverage, active
provider/held-request shutdown, production performance, or completion of F11.

The final root combination of F32 and the scoped settings adapter passed 507 tests
/ 51 suites and full typecheck (`lease-command-final-combined-*` logs). The only
merge conflict was concurrent execution-log additions; both records are retained.

## Bounded IPC queue observations and recorder lifetime

The opt-in Node evidence envelope is now format 2, declaring the unchanged
process-sample format 1 and the new queue-sample format 1. It observes the main to
backend, backend to main, and supervisor to host application waiting queues.
Admission byte estimates, oldest age, high-water values, adapter attempts,
in-flight count and shedding are separate measurements. Replacement senders have
fresh random observation identities; absent/error/untimed observations cannot
masquerade as measured zero. Registration and serialization use a closed schema
without message content. Native IPC buffer bytes, terminal coalescer bytes/ages,
other queues and peer processing acknowledgments are not covered.

Initial sender-observation regressions failed three cases against the previous
implementation (`ipc-queue-diagnostics-before.log`). During review, a new lifecycle
flaw was also reproduced: stopping the recorder left per-message timestamp and
counter work running. Its one failing real recorder-stop regression is retained
as `ipc-queue-capture-lifetime-before.log`. The correction shares a recorder-owned
capture lifetime with existing and replacement senders; every stop reason ends
collection while application delivery continues. This was caught before this
diagnostic slice was committed or used for a performance qualification.

The final primary run passed 75 tests / seven suites, full typecheck, both touched
lint modes, formatting and the production Electron/main build. The built
`ipcQueuePressure.mjs` fixture then exercised actual child IPC on Node 24.20.0 and
Electron 44 / embedded Node 24.18.1. Each controlled blocked receiver produced 122
waiting messages / 4,007,114 estimated bytes and an observed oldest age above
250 ms. Releasing the fixture gate delivered all 128 synthetic messages; waiting
and in-flight counts reached zero and each owned child closed normally. Both
format-2 recordings have complete end markers, zero writer drops/errors, and no
synthetic payload marker. Raw final evidence is
`tmp/v4-architecture-audit/ipc-queue-lifetime-real-{node,electron}.json` with its
referenced NDJSON; earlier runs remain separately retained.

The independent critic passed 66 tests / five suites after the lifetime fix and
verified all 19 frozen source, compiled fixture and raw-evidence hashes with zero
mismatches (`ipc-queue-independent-lifetime-rereview.log`). No Important finding
remained in this bounded scope.

These are measurement and output-lifetime checks. The new queue registrations in
an actual GUI session, enabled/disabled observer overhead, complete transport
coverage, correlated command/event latency, frame/input traces, controlled master
comparisons and final load/soak qualification remain open. A blocked synthetic
receiver is not an application performance benchmark.

## F11 HTTP and shared MCP drain prerequisite

The isolated `poracode/v4-request-drain` branch starts at reviewed consolidation
`ad7143d53`. Four real loopback/SQLite regressions first proved premature database
close after the HTTP deadline or client abort, duplicate startup pairing state,
and a listener bound after disposal. Two real forwarded-stream fixtures also
failed against the original proxy implementation, which returned while the
streams were open. Three shared-MCP regressions proved early tool disposal,
orphaned concurrent listeners and publication after an immediate stop.

The candidate joins one listener lifecycle, closes admission synchronously and
tracks actual HTTP/WS/tool continuations independently of sockets. The existing
five-second HTTP grace now closes owned transports; it does not resolve the work
barrier. Proxy requests and upgrades join their outgoing streams. Shared MCP
uses the same work/socket helpers and AppControls awaits its disposal; remaining
batch entries and a reentrant pre-call hook cannot start a tool after stop.
No remote, renderer, backend-host, MCP or persisted shape changes; existing wire
versions remain valid and shutdown uses the existing error response envelopes.

The HTTP/controller group passed 156 tests across seven suites; the MCP/native
facade group passed 41 tests across six separate suites. Full typecheck and both
touched lint modes pass. The MCP test-only cleanup refactor was checked again
with its five lifecycle cases. Details and exact commands are in
`.tmp/v4-request-drain/tmp/f11-request-drain/REPORT.md`; all network peers and
SQLite files in these checks are disposable fixtures. Self-review caught two
introduced startup-cache regressions: retaining a failed listen and returning
an obsolete pairing token after rotation. Both were corrected, with separate
reds; the final ten HTTP lifecycle cases also validate a successful real token
exchange after rotation. These are not attributed to the original defects.

The independent ingress critic passed 24 tests across five suites plus the final
real pairing-token exchange regression, with no remaining Important finding.
The primary review also passed its 25 targeted cases and verified all 17 frozen
file hashes. Both reviews accepted this prerequisite; integration remains pending.
This is not complete F11
qualification: private backend request draining, main/native facade joins, parent
timeouts, provider/PTY descendants, Windows graceful stop and the native-e2e stop
harness remain assigned. A handler which cannot be canceled keeps its join
pending; the later process escalation must prove termination rather than release
the owner lease while that handler can still run. No GUI/performance claim is
made from these ingress fixtures.

Root integrated `c0471f27a` with queue diagnostics `73792f1fb`. The combined remote,
MCP, app-controls, backend-client and diagnostic checks passed 740 tests / 61
suites plus full typecheck (`queue-f11-combined-*` logs under
`tmp/v4-architecture-audit/`). Only concurrent documentation additions conflicted;
both sides' findings and evidence are retained. A fresh isolated GUI recording is
the next integration check, not implied by these tests.

## F34 — visible Browser coverage repaired during the real queue recording

Clean `d31c836bc` was frozen into
`/Users/svecherenko/.poracode-smoke/v4-queue-f11-IGagAM/session.json`: source
`c7d98bbe0636a03677af6f06d66388d4ba340827c00a1cc5a82ddec2fa01f548`, artifact
`9a8c3b161d2533feaa4cc1279cc1cf4f3f4ab4b6f82578fe473b30439237fd45`.
The first full mock report passed nine automated scenarios and 17 mock gates,
with zero captured errors. Primary image inspection nevertheless found that its
Browser navigation screenshot displayed GitHub Actions. That Browser PASS is
not accepted as visible-surface evidence.

The preceding scenario left a fullscreen overlay open. The Browser driver used
synthetic DOM clicks behind it and accepted an existing, enabled URL input without
checking occlusion. The added actual pointer assertion failed with `occluded`;
the recorded live state had both GitHub Actions and Browser open with the input
covered by the overlay header. The correction returns through the visible UI,
uses the shared pointer guard for label actions, scopes Settings controls, and
requires Settings and screenshot evidence. Optional means an absent control,
never permission to ignore an occluded/disabled/ambiguous one. The driver also
waits finite transitions and frames before capture, gives its synthetic page a
legible foreground/background, and constructs its default output path portably.

Stricter selection caught two local locator failures while refining the fix:
three matching Browser roles, and two Open Browser buttons including Sidebar's
invisible sizing copy. Both failed safely and remain in separate logs. The final
selectors target the Settings overlay and exclude that precise sizing copy.
Primary and independent critics inspected the final screenshots. Seventeen shared
pointer/label tests pass independently; primary's helper/inventory group passes
20 tests. Normal lint, syntax, formatting, diff checks and the 2,139-file coverage
inventory audit pass. There is no product UI or wire/schema change in this fix.

The final full replay passed nine automated scenarios and 17 mock gates with zero
captured errors. Its separate report and visible Browser screenshots are under
`artifacts/visibility-sidebar-fixed/` in that same frozen app session. The app
artifact stayed unchanged; the harness script revision changed during these
before/after checks. Logs under `tmp/v4-architecture-audit/` include
`browser-visible-before*`, the failed `browser-visible-after.log` and
`queue-gui-full-smoke-visibility-fixed.log`, and final
`queue-gui-full-smoke-visibility-sidebar-fixed.log`. Earlier artifacts were not
overwritten to conceal the false positive or the locator failures.

The exact runtime was verified before native close. After resetting driven state,
the test confirmed native QA peer 2 and persisted close-to-tray false, then invoked
the actual native window close. Main, backend, supervisor and the managed owner
exited; both assigned ports refused connections and the owner removed its runtime.
No managed stop command caused that exit. Format-2 recording files contain 2,687
main, 2,686 backend and 2,686 supervisor samples with contiguous sequences,
complete end markers, zero drops and zero writer errors. All three actual queue
hooks were observed; one main sample explicitly reports an unavailable sender.
`queue-gui-recording.json` and `queue-gui-processes-after.json` retain the evidence.

Native stderr also retains four macOS task-policy errors plus mock-provider
refusals and ACP installation failures; their presence is distinct from the
runner's zero captured renderer/runtime-error count. These results prove the
development/mock queue hooks, the corrected visible Browser flow and this idle
native-close path. Real providers/devices, active request/process shutdown,
observer overhead, controlled master comparisons, latency/rendering budgets and
full load/soak qualification remain open.

## F11 private backend and direct-renderer work join

The follow-up starts from clean consolidation `d31c836bc`. Four entrypoint tests
first failed with synthetic runtime dependencies: database-close ownership ended
while an IPC service, direct-renderer service, initializer or reverse-native
continuation was still pending. Five real loopback stream tests separately
reproduced premature handler disposal, concurrent-start refusal, an unjoined
partial upgrade socket and a pre-listen shutdown hang. Logs and exact evidence
limits are in `.tmp/v4-request-drain/tmp/f11-backend-drain/REPORT.md`.

Normal backend admission now closes before the work barrier. Startup is joined
before runtime handles are collected; producer cancellation starts before waiting
for calls that require it to settle. Service references and SQLite stay installed
through the join, with the F30 failure guard preserved. Native replies bypass
normal admission, and the extracted reverse-request owner drains cleanup work
after all producers/calls settle. Signals cancel backend waits without claiming
the native action itself has stopped. The direct renderer listener tracks actual
handlers and uses the shared HTTP socket owner, including partial upgrades.
Existing protocol and disk versions remain compatible.

Self-review traced the actual parent and caught its disposed guard dropping
required native replies. Three additional red regressions prove missing success
and failure replies during disposal, and an old completion sent to a replacement
child. The narrow parent fix preserves reverse replies to the originating child
during drain and fences replaced generations. It does not join native execution
or change the outer timeout/tree policy.

The independent critic additionally reproduced a synchronous native callback
exception escaping IPC without a failure reply, matching main's browser-watch
startup path. Its retained actual-client probe and the added red regression led
to a promise-contained invocation, with origin checks before deferred work and
before reply. A late old-child result is tested after callback admission; a
different case refuses deferred work if its child already exited.

The final combined run passed 97 tests / nine suites, full typecheck and both touched
lint modes. The independent critic verified all eight source hashes, passed 53
tests across four suites, and reran its actual-client exception probe successfully.
Its original red log remains; the generic JSON was overwritten by the rerun and
is not cited as retained red evidence. No Important remains in the independent
scope. The primary critic also verified all eight frozen hashes and independently
passed 97 tests across nine suites, then approved the coherent ten-file slice.
Tests use
synthetic entrypoint dependencies and real disposable loopback
peers, with no GUI or provider action. Full F11 is open: owner startup cancellation
wiring, outer deadlines, main/native facade joins, descendants, Windows shutdown
and the native-e2e process-stop harness remain required before final qualification.

Root merged the separately reviewed startup-cancellation primitive `dde3951eb`
as `bc57d3b62`, then joined the backend drain candidate `70457542b`. Cancelling
startup closes admission and abandons native byte-transform waits while retaining
the data-root lease and initialized credential capability. Only the caller's
final close releases ownership after runtime work and SQLite have drained.
The actual child-contender and held-backup tests cover that distinction; production
owner activation remains a separate candidate. Root's combined ownership,
backend/native request, stream, HTTP/work tracker and diagnostic checks passed
119 tests across ten suites, plus full typecheck. The exact logs are
`tmp/v4-architecture-audit/owner-backend-combined-tests.log` and
`owner-backend-combined-typecheck.log`. Merge conflicts were concurrent evidence
additions; the final documents retain F34 and both F11 records without duplicating
the existing F32 section.

## F42 — push gateway body ownership

Root's actual loopback HTTP regressions reproduced three independent failures:
the public-key request stayed pending after its timeout once headers had arrived,
a 32 KiB JSON config was accepted, and a successful push response kept its unused
body open. `tmp/v4-architecture-audit/push-gateway-body-before.log` retains all
three failures. The peers, credentials and payloads were synthetic; no hosted
gateway or external push was contacted.

The corrected private transport keeps one deadline through response consumption
and cancellation. Config parsing reuses the existing bounded body reader with a
16 KiB ceiling, and delivery responses release unused bodies after status is
read. The private fetch injection now uses actual `Response` objects, with the
same `SendPush` signature and result shapes. Config failures still clear the
cached promise; successful concurrent reads share it. Twelve tests across two
suites pass, including real held-body timeout/retry, declared/chunked overflow,
exact-limit success/cache reuse and unused-body close. Both touched lint modes
pass. The retained final test log is `push-gateway-body-final-tests.log` in the
same audit directory. The independent critic matched all three frozen source
identities, repeated all twelve tests and found no Important issue. Root merged
the separately reviewed shared push lifetime/token correction `cf89df25a` as
`bcf4be8d7`; its combined push/Desktop candidate group passed 123 tests across
thirteen suites and full typecheck. The Desktop composition still has its own
review and real-app gate. These checks do not qualify the complete process
shutdown or performance gates.

## F37/F39 — shared push lifetime and Desktop retirement

The shared push correction `cf89df25a`, merged as `bcf4be8d7`, retains active
delivery continuations and clears both platform debounce timers when admission
closes. Disposal returns the same join promise, including when a gateway callback
re-enters disposal; parallel delivery branches are all joined after a sibling
fails. Exact registration identity and the token or web subscription actually
sent now guard pruning after an unregistered response. The independent critic
matched all seven frozen source files and passed 56 tests across five suites.
The actual headless stale-token probe preserved its replacement registration
after the fix. Push registration format 2 and gateway wire/result shapes remain
compatible; these changes do not cancel a delivery already accepted remotely.

Root's Desktop composition then reproduced four premature-settlement cases with
the actual coordinator and disposable registration files: final stop, disable
followed by final stop, restart, and HTTP failure while push remained pending.
The gateway, database reads and HTTP server were synthetic. Typed before evidence
is retained in `tmp/v4-architecture-audit/desktop-push-before-typed.log`.

Desktop now stops coordinators before dropping their references, retains all
retiring generations and their failures, waits for retirement before opening a
replacement, and joins startup plus current and previously disabled HTTP/push
work on final disposal. A single lazy registration store serves the controller's
generations. The extracted lifecycle module owns the retirement barrier and
preserves the existing server-start cleanup. Tailscale teardown remains joined
on ordinary disable/restart; final application shutdown preserves its historical
Serve configuration behavior.

The final focused group passes 27 tests across two suites, including held HTTP
work from a disabled generation and a failed retirement whose promise had already
settled. Root's broader combined push group passes 123 tests across thirteen
suites, full typecheck and both touched lint modes. The independent critic
matched all four frozen Desktop hashes before and after its own 27-test run and
found no Important or material simplification issue. Its evidence is
`desktop-push-independent-critic.log` beside the frozen manifest and tracked diff.
No wire, settings or registration format changes were needed. This qualifies the
controller and shared push scope only: real Electron integration, headless
activation, main/native execution, outer deadlines and the complete shutdown and
performance gates remain open.

## Headless ownership and authenticated local control candidate

The owner lane now builds on `dde3951eb`, whose separately reviewed two-file
controller change adds `cancelStartup()` without releasing a live lease. Primary,
independent and author checks each passed its 12 controller cases. The two retained
pre-split failures showed that using final close merely to cancel native startup
invalidated the generation before a runtime shutdown barrier. Held native and real
SQLite backup cases now retain exclusion until final close.

The next uncommitted candidate wires only the standalone entry. It maps a profile
namespace once, initializes credentials under the lease and composes required
private runtime state before database/services. Startup and partial-construction
cleanup are joined; disposal closes ingress/producer admission together and waits
for concurrent start and actual work before SQLite/controller close. Four initial
ownership regressions, two partial-construction regressions, a held-start regression
and two outer-CLI unconfirmed-cleanup regressions are retained. Application DB and
supervisor adapters are mocked in the factory suite; the lease and loopback remote
server are real. The initial CLI tests intercept exit; the F40 correction below
also runs actual owned Node children with synthetic application services.

Local control/discovery format 1 supports only describe and explicit issue-pairing.
It retains a private MAC key, uses fresh request nonces and authenticates exact
request/response bytes and status before parsing replies. F33's real wrong-listener
regression failed against the bearer draft before activation. Request/body/header
limits, absolute input deadlines, connection/admission bounds, bounded mutation
receipts, lost replies, expired retries and held callbacks have real loopback tests.
The existing pair --json result shape is preserved; ordinary serve and relay logs
carry no automatic pairing URL, and the old PID/SIGUSR2 request path is removed.
F36's real two-client exchange caught use of the displayed-QR rotation method:
the first of two successful control replies carried an already revoked credential
and OAuth returned 401. Owner control now issues independent one-time credentials;
the first receipt replays the same still-usable URL, both credentials exchange,
and existing desktop QR rotation and consumed-token replay refusal remain covered.

F35's real child reproduced pending disposal plus an unhandled EACCES after a
read-only directory blocked discovery removal. The same child now resolves with
no unhandled error; its private record remains. A realfs test proves the stopped
port refuses calls and stopped/successor generations refuse that stale record.
Only post-join metadata cleanup is best effort; listener/work failures are not.

Compatibility review found the native-e2e harness still seeded the namespace
itself. Its real SQLite regression failed with `load-fixture` and `state.sqlite`
in the legacy namespace. Fixture setup now acquires a temporary owner, initializes
a fixed synthetic key, seeds the mapped root and closes SQLite before release.
The server receives that synthetic key rather than an inherited operator key.
The unchanged load fixture remains 60 threads, with ten 40-item histories; this
root correction does not improve or qualify its performance workload. Existing
consumer `baseDir` remains the actual data root, while pairing/restart use the
separate namespace and cleanup tracks the sibling paths. The old F11 harness
stop/deadline logic is deliberately still assigned to the lifecycle lane.

Evidence is retained under `.tmp/v4-owner/.tmp/v4-owner/`:
`headless-ownership-consolidated-before.log`, `headless-construction-before.log`,
`headless-start-join-before.log`, `headless-cli-startup-close-before.log`,
`host-control-peer-proof-before.log`, `host-control-cleanup-{before,after}.json`,
`owner-control-concurrent-pair-before.log`, and `headless-load-root-before.log`.
The original frozen production/ownership/SSH/control
check passed 388 tests across 25 suites; fixture preparation and the harness
line count gate passed four tests across two suites. Full typecheck and both touched
lint modes pass. Early stale-option typecheck failures, missing mock types, and
a cleanup-test error-message expectation mismatch remain in their original logs;
they are not attributed to production defects.

This candidate awaits primary/independent review and a fresh built-CLI smoke.
SSH manifest 3 rejects cold predecessor 1/2 artifacts; the settings lane's warm
cache/source-declaration work and final combined manifest 5 remain required before
deployment. No remote/native/renderer wire changes are made here. Existing-profile
activation, settings/key-without-DB recovery, desktop discover/attach and custody,
provider/PTY descendants, Windows/Linux packaged shutdown and performance/120 Hz
qualification remain open. No real user profile was imported or initialized.

## Headless push and early-signal review corrections

Independent review of the original 48-file headless candidate established three
additional lifecycle defects before activation. F37's actual factory/lease/store
probe allowed successor acquisition before an old push returned 410 and overwrote
the successor's registrations. F39's same-owner probe showed that a refreshed
credential was also removed by the old request. F40 found no signal handlers
while factory/listener startup was pending; actual Node SIGINT/SIGTERM fixtures
then reproduced process exit before startup cancellation.

The shared push correction is separately reviewed and committed as `cf89df25a`.
Primary and independent checks each passed 56 tests across five suites, and the
independent original F39 probe is green. It provides one permanent coordinator
stop/join, cancels both platform timer sets and joins held siblings after delivery
failure. Exact sent-token/subscription and registration comparison preserves
refreshes without changing the file or remote protocol format. Its seven-file
manifest/diff and `SHARED_PUSH_EVIDENCE.md` remain under the owner scratch directory.
The original factory F37 probe alone was not qualified by this helper commit.

The headless correction now includes that actual push barrier before SQLite and
lease release. The early CLI signal handler cancels factory admission and starts
available host disposal while joining actual startup. Confirmed stop alone exits
successfully; failed joins keep signal handling and the owner alive. Three actual
factory regressions (pre-cancelled roots, held port resolution and held push) failed
before the wiring. Two signal-registration cases and five real-child cases also
failed before the correction. The child fixture bundles the actual CLI/signal
helper and uses a real disposable kernel lease, with only application services
and diagnostics replaced. It does not launch a provider or qualify descendants.

Retained evidence: `headless-push-cancellation-before.log`,
`cli-startup-signals-before.log`, `cli-os-signals-before.log`, and
`headless-push-cancellation-first-after.log` (42 tests/four suites passed).
The initial esbuild fixture regex failure is separately retained in
`cli-os-signals-fixture-build-failure.log` and is not counted as a product failure.
The corrected combined run passed 398 tests across 26 suites, and the real-host
fixture/line-count checks passed four tests across two suites. Full typecheck and
both touched lint modes passed. Rereview and fresh built-CLI evidence are still
required before committing the remaining headless/control candidate. Root owns
separate Electron push integration and F42
gateway body-lifetime correction; neither is claimed complete by this owner slice.
