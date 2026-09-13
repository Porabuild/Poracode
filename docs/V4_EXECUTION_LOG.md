# V4 execution and evidence ledger

The objective is the full [V4 merge-readiness plan](V4_MERGE_READINESS_PLAN.md),
including every phase item, acceptance scenario, performance budget, and final
qualification gate. A passing focused check does not complete its containing
phase. Native clients remain development clients with shared-contract/build
obligations. No qualification gate has been waived.

## Execution state

| Phase                                | State       | Evidence / next action                                                                                                                                                                                                                                                         |
| ------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0 — master integration and baselines | In progress | Root V2 `832fc5467`; fetched master `9a4096ea8`; isolated `poracode/v4-integration` worktree has the expected 32 merge conflicts. Resolve semantic conflicts, native replacement deltas, and compatibility generations; capture live before evidence on unchanged root source. |
| 1 — exclusive server ownership       | Pending     | All seven work items and acceptance scenarios remain open.                                                                                                                                                                                                                     |
| 2 — operation safety and lifecycle   | In progress | Transport admission and shared-renderer outcome feedback are verified focused slices. All eight full work items and their acceptance scenarios remain open.                                                                                                                    |
| 3 — off-main bulk transport          | Pending     | All six work items and acceptance scenarios remain open.                                                                                                                                                                                                                       |
| 4 — off-thread client engine         | Pending     | All ten work items and acceptance scenarios remain open.                                                                                                                                                                                                                       |
| 5 — server/relay fairness            | Pending     | All seven work items and acceptance scenarios remain open.                                                                                                                                                                                                                     |
| 6 — bounded payloads                 | Pending     | All seven work items and acceptance scenarios remain open.                                                                                                                                                                                                                     |
| 7 — browser/mobile-web lifecycle     | Pending     | All five work items and acceptance scenarios remain open.                                                                                                                                                                                                                      |
| 8 — artifact/upgrade/soak/merge      | Pending     | All seven work items and acceptance scenarios remain open; no final freeze, merge to master, or promotion authorized by evidence yet.                                                                                                                                          |

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
