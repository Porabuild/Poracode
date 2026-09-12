# Poracode next iteration — release V2, then complete the wire agenda

Planning baseline: 2026-09-11, `poracode/v2` at merge commit `1d39c76fa`.
Parents: V2 `97d372228` and fetched master `98120c37c`.
Status: local integration complete; candidate qualification and release work remain proposed.
The filename identifies the next planning iteration, not a product or protocol version.

## Objective and scope

Promote the completed V2 work through reproducible CI, upgrade testing, and staged
release evidence. Keep deferred protocol work and new product features out of the
first release candidate unless they fix a demonstrated blocker.

The merged code passes local automated checks and production builds. Production
sign-off remains conditional on hosted CI, the actual release artifacts, live journeys,
and deployment evidence. The previous WS9 device results describe the pre-merge
revision; requalify affected journeys before carrying that evidence forward.

## Completed integration and evidence

| Check                           | Result at the merged baseline                                                                                           | Evidence                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Integrate latest fetched master | Complete, `1d39c76fa`; conflicts reconciled with V2 backend ownership, replay safeguards, and compact layout            | Git merge parents above                                                |
| Full unit suite                 | 1,109 files passed, 5 skipped; 12,639 tests passed, 119 skipped                                                         | `tmp/merge-master/full-test-final.log`                                 |
| Typecheck and lint              | Passed; commit hooks also passed                                                                                        | `tmp/merge-master/typecheck-final.log`, `lint-final.log`, `commit.log` |
| Production builds               | Renderer and Electron builds passed                                                                                     | `tmp/merge-master/build.log`                                           |
| Remote contract freshness       | Passed after commit; regenerated Swift/Kotlin codecs compile and round-trip in the unit suite                           | `tmp/merge-master/post-commit-freshness.log`, full-suite log           |
| Localization                    | Zero missing translations in all 12 non-English catalogs                                                                | `tmp/merge-master/i18n-final.log`                                      |
| Merge review                    | Runtime, remote/composer, and terminal/layout reviews completed; confirmed shortcut and voice/revert interactions fixed | Regressions in `ThreadComposerSection.test.tsx` and `codex.test.ts`    |

These are local results. They do not establish full native app builds, installed PWA
behavior, physical-device push, signing, store release, or hosted CI success. Triage
the skipped tests by the release surfaces they cover; do not count them as passes.
Scratch logs are currently available locally; retain candidate evidence in durable
release records or CI artifacts before promotion.

## What the merge adds to release scope

| Incoming behavior                                          | Integrated state                                                                                                                                 | Next proof needed                                                                                                           |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Follow-up queues and non-interrupting steer                | Desktop/PWA queue UI and host operations integrated; reset clears supervisor-owned queues; host removal clears only that host's projected queues | Live queue/steer/Stop/request/reconnect journeys; native adoption remains open                                              |
| Terminal persistence                                       | Xterm instances survive visible/hidden-host handoff; V2 query suppression and interest-gap recovery retained                                     | Home/thread navigation, splits, compact resize, remote reconnect, and delayed hydration in the real app                     |
| Session-local MCP delivery and opt-in native setup         | Incoming delivery helpers and cwd handling integrated with V2 transport filtering                                                                | Real CLI tool call, cwd/credentials, helper packaging, and explicit native-config install/remove flows; supported WSL paths |
| Experimental desktop live voice                            | Integrated; absolute checkpoint revert drains voice before provider mutation                                                                     | Supported-provider connect/mute/stop, auth failure, thread switch, revert, and teardown; no native/remote voice claim       |
| Handoff budgets and persistent Crossagents fallback routes | Incoming behavior retained in V2's extracted modules                                                                                             | Destination budget limits, fallback inheritance/explicit overrides, and persisted routing reload                            |
| Release version resolution                                 | Stable-tag-based resolver merged                                                                                                                 | Candidate version and channel metadata from the actual release workflow                                                     |

Remote protocol remains **11**. The merged inventory is **63 HTTP routes, 108
procedures, and 16 replayable event types**. The supervisor status cache is **33**,
and its renderer mirror is **30**; previous-parent caches are invalidated. These
are completed compatibility changes, not new tasks to repeat.

## Corrections to the retrospective

| Claim                                          | Refined conclusion                                                                                                                                                                                                                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Branch never pushed; CI never ran              | At this post-merge planning pass, local `HEAD` and `origin/poracode/v2` both resolve to `1d39c76fa`; `origin/master` resolves to `98120c37c`. Do not repeat the earlier “not pushed” assertion. Live PR/CI status still needs inspection; tracking refs alone do not prove current server state. |
| No renderer crash recovery                     | `src/main/window/windowHardening.ts` implements bounded reload through `installRendererReloadGuard`, installed in `createMainWindow.ts`, with tests. Investigate remaining recovery UX only if a reproduction exposes a gap.                                                                     |
| WSL bump completed                             | Bundled `bridge.mjs` remains `2.16.0`; the V2 plan calls for `2.17.0`. Close the discrepancy with an upgrade regression, not just a constant assertion.                                                                                                                                          |
| Durable drafts absent                          | `composerDraftStorage.ts` already persists versioned project/thread drafts in localStorage, with per-composer keys and projected host identity. Audit reload, quota/error behavior, attachment validity, and cleanup; do not plan a second draft store by default.                               |
| Offline cache unversioned                      | IndexedDB is already version 2; individual snapshot rows lack a semantic version. Decide migration/invalidation before changing snapshot meaning. A row field is one possible solution.                                                                                                          |
| Release infrastructure proves deployment       | Workflows show intended behavior. Credentials, successful runs, store availability, and deployed push delivery require separate evidence. Secret absence cannot be inferred from a conditional workflow.                                                                                         |
| All desktop OSes require the same signing gate | Require macOS signing/notarization, Windows Authenticode verification, and Linux artifact integrity/install checks under the distribution policy.                                                                                                                                                |
| Push tests can flip protocol dispositions      | Delivery evidence and wire support are separate. Change `push-config` disposition only when its actual contract and client behavior justify it.                                                                                                                                                  |
| 25–35 days covers the proposal                 | The listed tracks total 35–54 effort-days before external waits. Calendar duration needs staffing, dependencies, and access assumptions.                                                                                                                                                         |

Other retrospective audit findings remain candidates for verification. This refinement
reuses the completed merge checks and reads the current code; it does not claim a
new test run, hosted CI inspection, or access to release secrets.

## Milestone 0 — qualify the merged candidate

Owner role: integration maintainer. The local master-into-V2 merge is complete.
Integrating V2 back into master and promoting a release are separate future actions.
Estimate the remaining work after inspecting hosted checks and live-test access.

1. **Inspect hosted PR/CI state for `1d39c76fa`.** Verify the actual remote SHA,
   existing PR target, required checks, skipped jobs, and failures. Push or update
   only if inspection shows it is necessary. Local tracking refs currently match.
   _Status 2026-09-12: inspected and acted on. PR #725 hosts the branch. Both
   workflows failed on `1d39c76fa`; diagnosis and fixes landed (pushed through
   `3994c561d`): unhandled stdin-EPIPE crashes in one-shots, the codex probe, ssh
   runs, and the WSL bridge relay; the GitHubOperations gates' checkout-name-dependent
   repo-root walk (now marker-based, proven via a renamed-checkout simulation); the
   Android 500-line gate (thread dialogs extracted); the foundation job's missing
   linux node-pty build; stale native-e2e operation pins (222 keys / 108
   procedures). On `3994c561d` the CI workflow is fully green and Native clients
   passes Android build+tests, the API 26 runtime, and contract freshness.
   Remaining red: the foundation job's `sharedHostBackpressure` eviction assertion
   (paused client not closed on the Linux runner — under investigation), the API 37
   emulator boot flake (`5554: Connection refused`; passed at `1d39c76fa`), and one
   timing-sensitive iOS cancellation test (budgets widened; 3×/3× green locally).
   The CLI token cannot re-run failed jobs (no admin rights) — retries ride new
   pushes._
2. **Close the WSL helper upgrade discrepancy before V2-to-master integration or
   release.** `bridge.mjs` still advertises `2.16.0`. Audit deployed copies/readers,
   select the next valid version (planned `2.17.0`), and prove replacement of an
   already-deployed/running `2.16.0` helper plus symlink rejection.
   _Status 2026-09-12: DONE — constant bumped to `2.17.0` (staged copy regenerated by
   every packaging path), with a cached-mismatch eviction regression (running `2.16.0`
   respawned as `2.17.0`) and a source-constant pin; symlink rejection remains pinned by
   the Linux-CI bridge suite._
3. **Run the merge-specific live matrix below.** Use the interactive-testing,
   provider-chat-smoke, and mobile test skills when executing their surfaces.
   Reuse prior WS9 evidence only where the changed-path analysis supports it.
4. **Complete actual platform/CI checks.** Require native app compilation and
   suites, canonical PWA build, contract freshness, helper/package asset checks,
   and required PR checks at the final candidate SHA. Desktop renderer build and
   generated-codec tests do not substitute for these.
5. **Reconcile release docs and review the candidate delta.** Update current
   protocol/inventory references and feature claims, preserving dated evidence.
   Record native queue gaps and experimental voice scope. After fixes, rerun
   affected checks; require the normal integration gates on the final revision.
6. **Integrate V2 into master only after qualification.** Validate the resulting
   integration revision before release promotion. Do not schedule another merge
   of the same fetched master revision into V2.

| Live scenario                            | Required outcome                                                                                                                                                                                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Queue and steer on desktop + PWA         | Normal send, queue, opposite-mode shortcut, edit/reorder/remove, pause/resume, and Stop retain distinct semantics; queueing during approval does not implicitly approve/deny; no duplicate turns                                                          |
| Queue reset/reconnect and host isolation | Same-supervisor reconnect restores the current queue; supervisor restart clears it; delayed history cannot undo newer queue events; unpair/re-pair cannot expose another host's entries                                                                   |
| Terminal lifecycle                       | Navigate Home/back and between threads, resize desktop/compact panes, and reconnect during delayed hydration; preserve terminal modes/content without duplicate output, stale query replies, or leaked subscriptions                                      |
| MCP delivery and native setup            | A real provider invokes the selected tools with correct cwd; credentials stay out of argv/logs; supported helpers are packaged/deployed; native setup requires the existing explicit install action and preserves unrelated/user-edited config on removal |
| Voice and checkpoint revert              | Voice stops before absolute revert/fork and on teardown; failures release audio resources; restored conversation and provider thread remain aligned                                                                                                       |
| Handoff and fallback routing             | Context respects the destination budget across delivery paths; explicit selections override inherited routes; startup fallback remains distinct from retry after side effects                                                                             |

Exit: final candidate has no unresolved correctness/upgrade blockers, required
hosted checks pass, and affected live journeys have recorded evidence. The local
merge is done; this milestone is not yet closed.

## Milestone 1 — release candidate and promotion

Owner roles: release maintainer and platform QA. First inventory external access:
Windows signing identity, Apple/Google credentials, physical devices, production
association domains, and push service access. Assign named owners before execution.

| Work package             | Required evidence                                                                                                                                                                                                                                                                                                                                                                | Release dependency                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Windows signing          | Wire existing signing configuration into packaging; signed binaries/installer, expected identity and timestamp verified in CI; install/update smoke on Windows. Production packaging fails closed on signing failure.                                                                                                                                                            | Windows promotion                                 |
| macOS/Linux artifacts    | Existing macOS signing/notarization verification passes; Linux checksums and install/launch pass. Test supported architectures.                                                                                                                                                                                                                                                  | Respective platform promotion                     |
| Upgrade and update       | Upgrade from the last public release with real saved state; verify migrations, WSL helper refresh, pairing, reconnect, and one terminal plus one structured-provider journey. Exercise updater metadata/channel selection and installed update.                                                                                                                                  | Every promoted affected surface                   |
| Native distribution      | Decide native queue adoption versus an explicitly documented limited native release before promotion; no blanket parity claim while queue entries remain planned. Signed release builds install/launch; minimum/current OS journeys and production verified links pass. Record TestFlight/Play submission or manual-upload receipt separately from successful artifact creation. | Native promotion                                  |
| Push and Live Activities | Runtime route tests for auth/scope, malformed input, delivery failure, stale registration, and revocation; release-build device evidence for registration, delivery, tap routing, permission denial/revocation, and iOS Live Activity lifecycle. Check PWA counterpart behavior.                                                                                                 | Advertising/enabling the corresponding capability |
| Accessibility            | Execute existing release checklist on critical journeys: keyboard, VoiceOver/TalkBack, scaling, contrast, and reduced motion. Fix blockers. Add targeted automation where it verifies a real failure mode.                                                                                                                                                                       | Affected surface promotion                        |
| Rollout operations       | Changelog via release-notes workflow; immutable candidate SHA/artifact hashes; rollout stages, observation window, named incident owner, stop criteria, and recovery procedure.                                                                                                                                                                                                  | Any public promotion                              |

Push-dependent promotion may wait while an independently qualified desktop surface
ships. Any narrower release must explicitly exclude unsupported/unverified capabilities
and keep their claims disabled; do not silently waive an existing release gate.

Android R8/minification is a separate optimization unless size/performance requirements
make it a blocker. If enabled, test the minified release artifact, reflection/serialization,
push routing, and mapping-file retention; debug assembly is insufficient evidence.

Recovery must account for irreversible database migrations and independently updated
hosts, relays, PWAs, and store clients. Specify when rollback is safe and when a forward
fix is required. Keep the previous artifacts and stop promotion on data loss, duplicate
actions, broken pairing/updates, or repeated launch failures.

Exit: each promoted surface has its own completed evidence checklist; external gates
remain visibly blocked until evidence arrives. Release completion is not inferred from
workflow configuration or from another platform passing.

## Milestone 2 — deferred protocol completion

Start from the merged baseline on separate changes. Freeze the first release
candidate after Milestone 0; subsequent protocol work does not enter it without a
release-blocking justification.

The parity ledger now contains **12 planned entries on iOS and 11 on Android**:
**nine queue entries each** (eight procedures plus `thread-follow-up-queue`), two
cursor-sync v2 entries each, and `background_tasks.changed` on iOS. Both retain the
intentional `push-config` unsupported-by-wire entry. Generated bindings alone do
not close these UI/transport gaps.

| Order           | Work package                                                       | Acceptance evidence                                                                                                                                                                                                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supporting lane | Canonical native protocol policy and shared pairing fixtures       | Generate invariant paths/scopes/policy or fixture-pin them across TS/Swift/Kotlin; document legitimate platform differences. Pairing fixtures cover valid/invalid URLs, encoding, duplicate parameters, credentials, and origin checks.                                                                                                                       |
| 1               | Native follow-up queues                                            | Implement queue/steer choice and list actions idiomatically on iOS and Android using the existing host contract; preserve cancellation, approval, reconnect, stale-history, and restart semantics. Update all nine entries per platform with real UI/transport evidence and localized strings. This does not require a new wire revision merely for adoption. |
| 2               | Native cursor-sync v2, including the iOS background-task event gap | Both natives pass chunked-baseline, ACK credit, resume, duplicate/gap, interrupted baseline, bounded-memory, and reconnect scenarios. Shared fixtures and parity ledger updated in the same change.                                                                                                                                                           |
| 3               | Relay HTTP streaming                                               | Document negotiated frames and buffered fallback, cancellation, ordering, errors before/after headers, end-of-stream, header/origin policy, bounded queues, slow-consumer backpressure, and idle/resource limits. Test long-running responses, disconnect cleanup, and 32 kbps constrained links on both hops.                                                |
| 4               | Measured payload reduction                                         | Baseline small and many-thread/long-history hosts first. Record bytes, p50/p95 readiness, memory and CPU. Set numeric budgets before implementation; page completed turns and slim rows only where measured benefit justifies the change.                                                                                                                     |

Queue adoption and cursor-sync adoption can proceed independently. Protocol-policy
and pairing-fixture work should accompany affected paths, not block unrelated native
UI adoption. Prioritize queue parity because it is a new user-visible divergence;
retain measured weak-link performance as the cursor-sync acceptance criterion.

Every wire change includes an old/new host × client × relay compatibility matrix,
negotiation or explicit upgrade rejection, generated bindings, and previous-version
regression coverage. Do not preassign “v11” without checking the version at execution.
Snapshot migration/invalidation must land before or with the first incompatible shape
change. Native store rollout lag must not silently break installed clients.

Exit: scoped parity entries implemented with executable evidence; remaining exceptions
have rationale and owners. Constrained-link results use the same workload/profile
before and after, and preserve the established V2 correctness and resource bounds.

## Follow-on backlog — independently prioritized

| Item                                        | Refined scope and trigger                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider isolation                          | Validate reported shared vendor branches, then move behavior behind provider declarations. Preserve historical persisted migrations. Prove isolation through relevant capability tests; avoid a synthetic provider drill that cannot establish the broad claim.                                                                                                                                                                                                  |
| Large modules and bare catches              | Extract by responsibility when touching the affected code. Classify catches by effect; fix swallowed actionable failures. File length and catch count alone are not defects, and blanket logging can expose secrets or create noise.                                                                                                                                                                                                                             |
| Mobile crash reporting and privacy controls | Audit existing collection first; decide crash diagnostics and analytics separately. Define consent/defaults, persistence, scrubbing, retention, symbolication, and disabling queued/new delivery across all affected surfaces before adding SDKs.                                                                                                                                                                                                                |
| Performance metrics                         | Define privacy-safe measurements and budgets, then add startup/hydration regressions and reporting. No new telemetry solely because a counter can be collected.                                                                                                                                                                                                                                                                                                  |
| Draft resilience                            | Verify the existing versioned store under reload, offline/online transitions, quota/write failure, host removal, and expired attachments. Change storage only for a demonstrated durability or capacity requirement; include migration and per-platform parity where behavior changes.                                                                                                                                                                           |
| Durable offline-send outbox                 | The merged follow-up queue is in-memory host scheduling after an accepted request; it is not offline delivery and is cleared on supervisor restart. Design separately from that queue and drafts: durable idempotency, ambiguous timeout reconciliation, cancellation, ordering, attachment lifetime, auth revocation, and stale-thread handling are prerequisites. Prove reconnect cannot duplicate an agent action; do not ship a naive automatic retry queue. |
| Onboarding                                  | Confirm the first-agent friction through the existing flow; use provider-declared installation/auth capabilities and measure successful first turns.                                                                                                                                                                                                                                                                                                             |
| Accessibility automation expansion          | Extend critical-journey coverage with tools compatible with the current test stacks. Automated checks supplement device/manual evidence.                                                                                                                                                                                                                                                                                                                         |

## Execution and evidence rules

- Assign an owner and dependency to each work package. Release preparation can overlap
  CI diagnosis; only promotion depends on the final qualified candidate.
- Use small reviewable changes. Keep broad refactors, wire changes, and optional product
  features separate from release stabilization.
- Record status as proposed, in progress, blocked, verified, or released. Each verified
  entry includes revision, command/workflow, environment, result, and evidence path/link.
- Use focused checks during development and required full gates for integration/release.
  New renderer text requires Lingui extraction with zero missing translations; native
  changes require counterpart parity and platform catalogs.
- Store temporary captures under `tmp/` or `.tmp/`; retain durable release evidence in
  the established release documentation or CI artifacts with suitable retention.
- Re-estimate after Milestone 0 and the external-access inventory. Do not promise a
  combined calendar date for release, protocol completion, and the optional backlog.

Immediate execution slice: inspect hosted checks for `1d39c76fa`, close the WSL
helper upgrade gap, and run the merge-specific live matrix. Native queue parity is
the first follow-on feature task. This update changes the plan only; it does not
start implementation, publish, integrate V2 into master, or promote a release.
