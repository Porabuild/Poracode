---
name: provider-chat-smoke
description: Smoke tests real provider chat threads and ACP sessions end to end in the Poracode app, as an extension of interactive-testing. Use when validating a structured or ACP provider (for example Qwen Code or Kimi Code), or testing chat turns, steer, Stop, question or permission tools, live model changes, session resume, ACP handshake and capabilities, or provider-chat regressions.
---

# Provider Chat Smoke

This skill adds provider-chat gates on top of `interactive-testing`. Launch,
drive, screenshot, and tear down exactly as that skill describes, using a
managed `--mode real` session for live gates. Keep the work in the disposable
fixture project, never approve a write, and leave the smoke profile for
inspection.

## Plan

1. From the diff and the integration smoke plan, list every provider and
   presentation surface in scope.
2. Split gates into **live** (an authenticated provider and its real server) and
   **deterministic** (mock/unit coverage for protocol branches that cannot be
   driven safely against an external provider).
3. Use a fresh thread per provider and short marker prompts (e.g.
   `QWEN_SMOKE_OK`); never use prompts that change the repository.
4. Capture screenshots, runtime items, final thread state, and the first three
   console/runtime errors. The suite is not successful while a required gate is
   unresolved.

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
| Steer                     | Start a long harmless response; while working, send a replacement instruction with a marker.                                              | Working state, pending-steer strip or equivalent, original turn cancels, replacement marker completes.                                                                                                                                                                   |
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
error count with the first three errors, and screenshot/report paths. Keep real
provider evidence separate from mocked protocol coverage.

For providers whose server runs in WSL, teardown hygiene is part of the verdict:
after stopping a thread and after stopping the app, check the distro for
surviving provider processes (`ps aux | grep <binary>`); a survivor holds
provider-side locks and breaks the next resume.
