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

| Gate                    | Drive through the real UI                                                                                      | Required evidence                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Launch and first turn   | Choose the provider/model, submit a marker prompt, and wait for idle.                                          | User row, matching assistant marker, no error state.                                                   |
| Follow-up               | Send a second marker in the same thread.                                                                       | Ordered second user/assistant pair.                                                                    |
| Structured question     | Ask the agent to invoke its question tool with two choices; submit a benign answer.                            | Question dock, selected answer, turn resumes and completes.                                            |
| Permission              | Ask for exactly `pwd` (or another read-only command), wait for the approval dock, then choose **Reject/Deny**. | Approval details, declined tool/command item, agent confirms it did not run.                           |
| Steer                   | Start a long harmless response; while status is working, send a replacement instruction with a marker.         | Working state, pending-steer strip or equivalent, original turn cancels, replacement marker completes. |
| Stop                    | Start a long harmless response, press **Stop response** promptly, and wait for terminal state.                 | Stop control accepted, no endlessly-working thread, cancellation/idle/error outcome recorded.          |
| Mid-thread model change | Between completed turns, change to a different model offered by the same provider, then send a marker prompt.  | Picker shows the new model, follow-up completes, persisted thread config has the new model.            |
| Reopen/resume           | Leave the thread, reopen it, and send one more harmless prompt.                                                | Existing transcript is not duplicated, session reference remains usable, reply completes.              |

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

| Area              | Branches to cover                                                                                                                                                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Handshake         | spawn failure, initialize/protocol mismatch, capability probe timeout, authenticated/missing auth, `session/new`, and `session/load`.                                                                                       |
| Session lifecycle | GUI resume versus terminal resume gating, known/discovered session refs, invalid/expired session recovery, process exit/connection loss, dispose, and no duplicate history on replay.                                       |
| Updates           | assistant text, reasoning, tool call/update/result, plan/file-change updates, malformed/noise filtering, provider-specific transforms, and empty-response error rewriting.                                                  |
| Config sync       | model, mode, effort/thought-level changes through config options; explicit response versus later notification; unsupported/unstable-model fallback; rejected/timeout config updates.                                        |
| Prompts           | normal completion, RPC error, agent-visible error, cancellation before prompt acceptance, cancellation after activity, pending-steer replacement semantics, Stop watchdog, and stale interrupt immunity after restart.      |
| Requests          | permission accept/deny/cancel, question options/custom answer/skip, `createElicitation`, `completeElicitation`, request resolution after teardown, and synthetic auto-approval only where the configured policy permits it. |
| Client services   | client-hosted terminal create/write/output/wait/release, read/write resource path validation, and MCP config/launch gating. Test writes only with the fixture repository.                                                   |

## Reporting and teardown

Report a verdict per provider and per gate: PASS, FAIL, SKIPPED, or NOT APPLICABLE. Include connection/capability evidence, session-reference continuity, error count with the first three errors, and screenshot/report paths. Distinguish real provider evidence from mocked protocol coverage.

Reset the isolated profile and stop only the process launched for this run. Leave the smoke directory intact unless cleanup is requested.
