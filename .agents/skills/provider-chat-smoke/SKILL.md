---
name: provider-chat-smoke
description: Smoke test real Poracode provider chat threads and ACP sessions end to end. Use when validating Qwen Code, Kimi Code, or another structured/ACP provider; testing chat turn handling, steer, Stop, question or permission tools, live model changes, session resume, ACP handshake/capabilities, or provider-chat regressions.
---

# Provider Chat Smoke

Use this skill with `interactive-testing`. Run the ordinary isolated-app workflow from that skill first; use real provider credentials only for the safe live gates below. Keep the scope to a disposable project, never approve a write, and preserve the smoke profile for inspection.

## Plan coverage before launch

1. Inspect the diff, generate the integration smoke plan, and record every provider/presentation surface in scope.
2. Separate gates into **live** (an authenticated provider and its real ACP server) and **deterministic** (mock/unit coverage for protocol branches that cannot safely be driven against an external provider).
3. Create a fresh thread per provider. Use short marker prompts such as `QWEN_SMOKE_OK` and `KIMI_SMOKE_OK`; never use repository-changing prompts.
4. Capture screenshots, runtime items, final thread state, and the first three console/runtime errors. Do not call the suite successful while a required gate is unresolved.

## Required live chat matrix

Run each applicable row for every requested provider. Retry a timing-sensitive row with a longer harmless response if the provider finishes before the control can be used.

| Gate                      | Drive through the real UI                                                                                                                                             | Required evidence                                                                                                                                                                                                                                                                             |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Launch and first turn     | Choose the provider/model, submit a marker prompt, and wait for idle.                                                                                                 | User row, matching assistant marker, no error state.                                                                                                                                                                                                                                          |
| Image attachment turn     | Paste/attach an image in the composer of the first turn (marker prompt referencing it), wait for idle.                                                                | Image chip on the user row, the assistant actually reads/acknowledges the image content (providers with `readsImageAttachmentsFromHost: false` read the localized file via their own tools), and no media-rejection error state.                                                              |
| Commands, skills, plugins | Type `/` in the composer: provider-native slash commands, skills, and plugin contributions must appear.                                                               | Provider-declared commands/skills render (from the `slashCommands` capability or a provider-owned catalog via `reportsSkillCatalog`); picking one submits its invocation. If the provider exposes none, report that with the capability snapshot — do not accept a bare generic list as PASS. |
| Sub-agent rendering       | Trigger a sub-agent run (a prompt that spawns subtasks, e.g. parallel research), wait for completion.                                                                 | `subagent_*`/Task-style tool calls render as sub-agent rows in the composer and the thread panel (never as plain tool rows), and child activity stays inside the agent row/overlay instead of flooding the main timeline.                                                                     |
| Follow-up                 | Send a second marker in the same thread.                                                                                                                              | Ordered second user/assistant pair.                                                                                                                                                                                                                                                           |
| Structured question       | Ask the agent to invoke its question tool with two choices; submit a benign answer.                                                                                   | Question dock, selected answer, turn resumes and completes. Submit must be disabled until every question is answered — an empty submit must never reach the supervisor.                                                                                                                       |
| Permission                | Ask for exactly `pwd` (or another read-only command), wait for the approval dock, then choose **Reject/Deny**.                                                        | Approval details, declined tool/command item, agent confirms it did not run (for filesystem-verifiable actions, check the file was not created).                                                                                                                                              |
| Steer                     | Start a long harmless response; while status is working, send a replacement instruction with a marker.                                                                | Working state, pending-steer strip or equivalent, original turn cancels, replacement marker completes.                                                                                                                                                                                        |
| Stop                      | Start a long harmless response, press **Stop response** promptly, and wait for terminal state.                                                                        | Stop control accepted, no endlessly-working thread, cancellation/idle/error outcome recorded.                                                                                                                                                                                                 |
| Mid-thread model change   | Between completed turns, change to a different model offered by the same provider, then send a marker prompt.                                                         | Picker shows the new model, follow-up completes, persisted thread config has the new model.                                                                                                                                                                                                   |
| Provider switch           | Build source history on another provider (include an image turn), then use the thread header's **Continue in another provider** to switch in place and send a marker. | Thread continues on the target provider, prior context transfers, no route/`sessionInUse` error. The in-thread model picker is provider-locked on active threads — switching goes through the header control.                                                                                 |
| Reopen/resume             | Leave the thread (close the pane), reopen it, and send one more harmless prompt.                                                                                      | Existing transcript is not duplicated, session reference remains usable, reply completes. A thread that sits "working" for minutes with no item activity and no error is a **hang — FAIL**, not slowness.                                                                                     |

Do not substitute a successful completion for Stop: a response that ends before the Stop click is **not tested**. Do not silently claim a provider supports questions, permissions, or model changes when its capabilities did not expose them; report those as not applicable with the advertised capability snapshot.

## ACP connection analysis

For a real ACP provider, prove the full path rather than only the rendered reply:

1. Record availability/authentication and the probed capabilities: models, modes, effort tiers, approval policies, slash commands, and presentation modes.
2. Confirm `createStructuredSession()` succeeds and that `session/new` or `session/load` yields a stable session reference. For Kimi, verify its discovered `providerSessionId` is persisted after its delayed session-file discovery.
3. Confirm `session/update` messages produce the expected canonical runtime items: user message, reasoning, assistant message, tool call, and tool result/command result when applicable.
4. Confirm each blocking request receives exactly one `request.resolved` outcome: `answered` for a question, `declined` for a rejected approval, or `cancelled` for an abandoned request.
5. For the model gate, prove the update reached the live ACP session config (not merely the picker): inspect the persisted thread config and ensure the next turn uses it.
6. Reopen the session and verify replayed ACP history does not duplicate Poracode’s persisted chat items.

Capture session identity and configs without copying credentials, bearer tokens, or raw sensitive environment values into artifacts.

## Deterministic ACP branch matrix

Cover every branch below with focused tests/mocks when the live provider does not safely expose it. Add or keep a production scenario mapping for any new provider surface.

| Area              | Branches to cover                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Handshake         | spawn failure, initialize/protocol mismatch, capability probe timeout, authenticated/missing auth, `session/new`, and `session/load`.                                                                                                                                                                                                                                                                                              |
| Session lifecycle | GUI resume versus terminal resume gating, known/discovered session refs, invalid/expired session recovery, process exit/connection loss, dispose, no duplicate history on replay, and **failed restart settles the submitted turn** (a restart/resume failure — e.g. a `sessionInUse`-style lock error — must append a visible error item and errored thread state; it must never strand the thread "working" with the send lost). |
| WSL execution     | For providers executing through WSL (`windowsProjectExecution: "wsl"`): the Linux-side host must not survive teardown — killing the Windows wrapper is not enough, so dispose kills the surviving Linux process (host-cookie environ sweep via the bridge) and no orphan host is left holding provider-side session locks after thread stop or app stop.                                                                           |
| Provider routing  | When the provider protocol has internal model/provider routing (e.g. Muse `session/start.providerId`), launch params must carry the catalog-resolved route rather than the server default — defaults can differ in capability (one Muse route rejects media in retained history, the catalog route accepts it).                                                                                                                    |
| Updates           | assistant text, reasoning, tool call/update/result, plan/file-change updates, malformed/noise filtering, provider-specific transforms, and empty-response error rewriting.                                                                                                                                                                                                                                                         |
| Config sync       | model, mode, effort/thought-level changes through config options; explicit response versus later notification; unsupported/unstable-model fallback; rejected/timeout config updates.                                                                                                                                                                                                                                               |
| Prompts           | normal completion, RPC error, agent-visible error, cancellation before prompt acceptance, cancellation after activity, pending-steer replacement semantics, Stop watchdog, stale interrupt immunity after restart, and image-attachment delivery per `readsImageAttachmentsFromHost` (inline image content versus `@path` mention after execution-location rewrite).                                                               |
| Requests          | permission accept/deny/cancel, question options/custom answer/skip (the question form must not submit unanswered questions — the supervisor rejects empty answers), `createElicitation`, `completeElicitation`, request resolution after teardown, and synthetic auto-approval only where the configured policy permits it.                                                                                                        |
| Client services   | client-hosted terminal create/write/output/wait/release, read/write resource path validation, and MCP config/launch gating. Test writes only with the fixture repository.                                                                                                                                                                                                                                                          |

### Provider-route failure signatures

When a live turn fails, classify the error before writing the verdict — some
rejections come from the provider's own model routing, not from Poracode:

- `provider-private history is incompatible with the active route: retained
media history is unsupported …` — the provider's model route refused media in
  the conversation history. Poracode delivered an image the route cannot take;
  fix delivery (path mention + `readsImageAttachmentsFromHost: false`), not the
  error handling.
- `session … is already in use` (`sessionInUse`) — another live host holds the
  provider-side session lock, typically an orphaned WSL host that teardown
  failed to kill. Poracode must surface this as a turn error, never hang.
- A slow resume of a large session is provider-side while runtime records keep
  streaming; a hang is "working" with **no** item activity and **no** records.

## Reporting and teardown

Report a verdict per provider and per gate: PASS, FAIL, SKIPPED, or NOT APPLICABLE. Include connection/capability evidence, session-reference continuity, error count with the first three errors, and screenshot/report paths. Distinguish real provider evidence from mocked protocol coverage.

For WSL-executing providers, teardown hygiene is part of the verdict: after stopping a thread and after stopping the app, check the distro for surviving provider host processes (`ps aux | grep <binary>`) — a survivor holds provider-side locks and breaks the next resume.

Reset the isolated profile and stop only the process launched for this run. Leave the smoke directory intact unless cleanup is requested.
