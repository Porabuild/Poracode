---
name: provider-chat-smoke
description: Smoke tests real provider chat threads and ACP sessions end to end in the Poracode app, as an extension of interactive-testing. Use when validating a structured or ACP provider (for example Qwen Code or Kimi Code), or testing chat turns, steer, Stop, question or permission tools, live model changes, session resume, ACP handshake and capabilities, or provider-chat regressions.
---

# Provider Chat Smoke

This skill adds provider-chat gates on top of `interactive-testing`. Launch,
drive, screenshot, and tear down exactly as that skill describes, using a
managed `--mode real` session for live gates. Keep the work in the disposable
fixture project, never approve a write, and delete the smoke session directory
when the run finishes. Copy cited screenshots and reports into `tmp/` first.

## Plan

1. From the diff and the integration smoke plan, list every provider and
   presentation surface in scope. For provider additions and updates,
   complete [native steering qualification](#native-steering-qualification)
   before choosing or retaining interrupt-and-resend. Derive other applicable
   gates from the [provider integration lessons](../../docs/provider-integration-lessons.md).
2. Split gates into **live** (an authenticated provider and its real server) and
   **deterministic** (mock/unit coverage for protocol branches that cannot be
   driven safely against an external provider).
3. Use a fresh thread per provider and short marker prompts (e.g.
   `QWEN_SMOKE_OK`); never use prompts that change the repository.
4. Capture screenshots, runtime items, final thread state, and the first three
   console/runtime errors. The suite is not successful while a required gate is
   unresolved.

## Native Steering Qualification

Required for every provider addition and version/capability update, including an existing adapter with no native steering wired. This is the shared qualification gate for [add-provider](../add-provider/SKILL.md) and [supported-version-update](../supported-version-update/SKILL.md); keep its detailed steering procedure here rather than duplicating it.

1. **Trace the current path.** Record the exact executable/runtime version and execution target (native, WSL, profile, or cloud). Trace a GUI submit while working through the authoritative supervisor session: does it use `steerTurn` / ACP `promptSteering`, or cancel-and-resend? A queue UI, hidden `steerContext`, a stale probe cache, or the absence of an adapter method does not prove native user steering support or lack of support.
2. **Check current and newer contracts.** Inspect the provider's current documentation/source and actual SDK or negotiated protocol payloads; record the exact capability location, request method/metadata, and response lifecycle. When authorized, check current supported release notes for native steering introduced after the installed version. Qualify a newer candidate in an isolated fixture, never silently update the user's CLI/profile or restart active work. Do not infer a capability from a guessed RPC name, flag, version number, or one failed probe. If access or evidence is missing, mark it unverified rather than unsupported.
3. **Prefer qualified native delivery.** If supported, use an existing `steerTurn` seam or provider-owned ACP `promptSteering` declaration; prefer runtime capability negotiation over a hard-coded version check. Keep vendor keys/parsers inside the provider folder. Preserve compatible behavior for older/missing/malformed capability responses. Interrupt-and-resend is a fallback only after documenting why the tested version cannot use native steering; do not treat an old fallback as permanent when a newer supported version can avoid cancellation.
4. **Prove preservation during real work.** In a fresh managed fixture thread, start a harmless long-running subagent using a profile that actually has the required execution tools. Wait for an actual running child tool/runtime item and record its identity; do not match words in a command catalog or count a steer sent before the original prompt or after completion. Send a marker through the real composer while that child runs. Native delivery must apply the marker without `session/cancel`, process/session replacement, or child cancellation/relaunch, and the same child must finish successfully. If the provider has no subagent surface, document that with evidence and still prove an in-flight native steer; do not invent support.
5. **Keep Stop and accounting separate.** Exercise explicit Stop during actual activity and prove it cancels; normal completion before the click is not a pass. Qualify repeated steers, rejected/racing requests, and non-text/attachment behavior without silently dropping or duplicating input. Capture whether accepted prompt replies repeat usage for one native turn; repeated consumption samples must not be counted twice, and genuinely separate samples must remain separate.
6. **Lock the contract down.** Add deterministic tests for qualified native delivery without cancel when supported, the old/absent/malformed handshake fallback, same-child preservation where applicable, rejected/racing steer delivery, explicit Stop with no replay, and usage identity/fallback when replies repeat usage. Report the tested version(s), capability snapshot, actual steering path, live evidence, newer-version findings, and any fallback limitations. Separate verified-native, evidence-backed unsupported-at-version, and blocked/unverified outcomes; a skipped native check is never a pass.

## Live chat matrix

Run each applicable row for every requested provider through the real UI. If a
provider finishes before a timing-sensitive control can be used, retry with a
longer harmless response.

| Gate                      | Drive                                                                                                                                     | Required evidence                                                                                                                                                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Launch and first turn     | Choose provider/model, submit a marker, wait for idle.                                                                                    | User row, matching assistant marker, no error state.                                                                                                                                                                                                                     |
| Image attachment          | Attach an image to a marker prompt that references it; wait for idle.                                                                     | Image chip on the user row, the assistant describes the image content, no media-rejection error. Providers with `readsImageAttachmentsFromHost: false` read the localized file with their own tools.                                                                     |
| Commands, skills, plugins | Type `/` in the composer.                                                                                                                 | Provider-declared commands/skills render (from the `slashCommands` capability or a provider catalog via `reportsSkillCatalog`) and picking one submits its invocation. If none are exposed, report that with the capability snapshot; a bare generic list is not a PASS. |
| Sub-agent rendering       | Prompt for work that spawns subtasks; wait for completion.                                                                                | Sub-agent tool calls render as sub-agent rows in the composer and thread panel, not plain tool rows, and child activity stays inside the agent row/overlay.                                                                                                              |
| Follow-up                 | Send a second marker in the same thread.                                                                                                  | Ordered second user/assistant pair.                                                                                                                                                                                                                                      |
| Structured question       | Ask the agent to use its question tool with two choices; submit a benign answer.                                                          | Question dock, selected answer, turn resumes and completes. Submit stays disabled until every question is answered; an empty submit never reaches the supervisor.                                                                                                        |
| Permission                | Ask for exactly `pwd` (or another read-only command); at the approval dock choose Reject/Deny.                                            | Approval details, declined tool/command item, agent confirms it did not run (for file-creating actions, check the file does not exist).                                                                                                                                  |
| Steer (native)            | After native qualification, start long harmless work (with a running child when supported); send a marker while working.                  | Original work is not cancelled/restarted; marker is applied, the same child completes without relaunch, and no cancel/process replacement occurs. See Native Steering Qualification.                                                                                     |
| Steer (fallback only)     | On a version qualified as lacking native delivery, send a replacement marker while working.                                               | Version/capability evidence and fallback reason recorded; cancellation and replacement complete as documented. Record any interrupted-child limitation; this is not a native-steering PASS.                                                                              |
| Stop                      | Start a long harmless response, press Stop response promptly, wait for a terminal state.                                                  | Stop accepted, thread does not stay working, cancellation/idle/error outcome recorded.                                                                                                                                                                                   |
| Mid-thread model change   | Between completed turns, pick another model from the same provider, then send a marker.                                                   | Picker shows the new model, follow-up completes, persisted thread config has the new model.                                                                                                                                                                              |
| Provider switch           | Build history on another provider (including an image turn), then use the thread header's Continue in another provider and send a marker. | Thread continues on the target provider with prior context and no route or `sessionInUse` error. The in-thread model picker is provider-locked on active threads; switching goes through the header control.                                                             |
| Reopen/resume             | Close the pane, reopen the thread, send one more harmless prompt.                                                                         | Transcript not duplicated, session reference still usable, reply completes. A thread "working" for minutes with no item activity and no error is a hang (FAIL), not slowness.                                                                                            |

A response that ends before the Stop click leaves Stop untested; do not count a
normal completion instead. When a provider's capabilities do not expose
questions, permissions, or model changes, report those gates as not applicable
with the advertised capability snapshot rather than claiming support.

## ACP connection analysis

For a real ACP provider, prove the path, not just the rendered reply:

1. Record availability/authentication and the probed capabilities: models,
   modes, effort tiers, approval policies, slash commands, presentation modes.
2. `createStructuredSession()` succeeds and `session/new` or `session/load`
   yields a stable session reference. For providers that discover their session
   id after launch (example: Kimi's delayed session-file discovery), verify the
   discovered `providerSessionId` is persisted.
3. `session/update` messages produce the expected canonical runtime items: user
   message, reasoning, assistant message, tool call, and tool/command result.
4. Each blocking request gets exactly one `request.resolved` outcome:
   `answered`, `declined`, or `cancelled`.
5. A model change reached the live ACP session config, not just the picker: the
   persisted thread config changed and the next turn uses it.
6. Reopening does not duplicate Poracode's persisted chat items with replayed
   ACP history.

Capture session identity and configs without copying credentials, bearer
tokens, or sensitive environment values into artifacts.

## Deterministic ACP branch matrix

Cover each branch with focused tests or mocks when the live provider cannot
safely expose it, and keep a production scenario mapping for any new provider
surface.

| Area              | Branches                                                                                                                                                                                                                                                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Handshake         | spawn failure, initialize/protocol mismatch, capability probe timeout, authenticated/missing auth, `session/new`, `session/load`.                                                                                                                                                                                                             |
| Session lifecycle | GUI vs terminal resume gating, known/discovered session refs, invalid/expired session recovery, process exit/connection loss, dispose, no duplicate history on replay. A failed restart/resume (e.g. a `sessionInUse` lock error) must settle the submitted turn with a visible error item and errored thread state, never strand it working. |
| WSL execution     | When a provider's server runs inside WSL for a Windows project, dispose must kill the surviving Linux-side process, not only the Windows wrapper (example: Muse's MSP host tags its process with a host cookie so teardown can find it), so no orphan holds provider-side session locks after thread or app stop.                             |
| Provider routing  | When the protocol routes models internally (example: Muse `session/start.providerId`), launch params carry the catalog-resolved route rather than the server default; routes can differ in capability, such as accepting media in retained history.                                                                                           |
| Updates           | assistant text, reasoning, tool call/update/result, plan/file-change updates, malformed/noise filtering, provider-specific transforms, empty-response error rewriting.                                                                                                                                                                        |
| Config sync       | model, mode, effort/thought-level changes via config options; explicit response vs later notification; unsupported/unstable-model fallback; rejected/timeout config updates.                                                                                                                                                                  |
| Prompts           | normal completion, RPC error, agent-visible error, cancellation before acceptance and after activity, pending-steer replacement, Stop watchdog, stale interrupt immunity after restart, image delivery per `readsImageAttachmentsFromHost` (inline image vs `@path` mention after execution-location rewrite).                                |
| Steering          | Native supported vs old/absent/malformed capability responses, no cancel on native delivery, same-child preservation, repeated and rejected/racing steers, non-text fallback, explicit Stop with no replay, and repeated usage sample identity. See Native Steering Qualification.                                                            |
| Requests          | permission accept/deny/cancel, question options/custom answer/skip (unanswered questions never submit; the supervisor rejects empty answers), `createElicitation`, `completeElicitation`, resolution after teardown, synthetic auto-approval only where the policy permits.                                                                   |
| Client services   | client-hosted terminal create/write/output/wait/release, read/write resource path validation, MCP config/launch gating. Test writes only against the fixture repository.                                                                                                                                                                      |

## Classifying live failures

Some rejections come from the provider's own routing, not Poracode. Classify
before writing a verdict:

- **Route rejects media in history** (example message: `provider-private history
  is incompatible with the active route: retained media history is unsupported`):
  Poracode delivered an image the route cannot take. Fix delivery (path mention
  plus `readsImageAttachmentsFromHost: false`), not error handling.
- **Session already in use** (`sessionInUse`): another live host holds the
  provider-side session lock, typically an orphaned WSL host that teardown
  missed. Poracode must surface this as a turn error, never hang.
- **Slow resume vs hang:** a large session resuming slowly still streams runtime
  records; a hang is "working" with no item activity and no records.

## Report

Give a verdict per provider and per gate: PASS, FAIL, SKIPPED, or NOT
APPLICABLE, with connection/capability evidence, session-reference continuity,
error count with the first three errors, and screenshot/report paths under `tmp/`. Keep real
provider evidence separate from mocked protocol coverage.

For providers whose server runs in WSL, teardown hygiene is part of the verdict:
after stopping a thread and after stopping the app, check the distro for
surviving provider processes (`ps aux | grep <binary>`); a survivor holds
provider-side locks and breaks the next resume.
