---
name: subagent-delegation
description: Coordinate explicitly requested delegation through research, scoped execution and verification with minimal parent overhead.
---

# Crossagents

Delegate only after an explicit user request in this thread; that authorization persists. Honor the user's provider, model, reasoning and scope. Child permissions do not expand it.

## Start once

Use the skill path or ID already in context; avoid rediscovering it. Resolve server-qualified tool names and only the schemas needed next in one pass. Reuse loaded instructions, tool bindings and results. When supported, batch independent setup calls in one code execution and print only decision-relevant fields, errors and requested evidence.

Known provider/model IDs can go straight to `spawn_agent`; the host validates them. For an unfamiliar selection, call `get_agent` directly when the provider ID is known (`model` narrows its response on supported hosts). Use `list_agents` only to choose or identify a provider. Omit unspecified selection fields to use configured routing; persist preferences only when the user asks. Never print the entire tool catalog or reload descriptions between stages.

## Coordinate complete assignments

As coordinator, delegate research, implementation and verification; own architecture, dependencies, evidence checks and integration. For shared unknowns, collect read-only research first, settle decisions, then launch dependent execution. Parallelize independent questions and non-overlapping work. Avoid duplicating worker investigation or implementing its task while waiting.

Each brief needs an objective, settled decisions/references, exact write ownership (or read-only scope), constraints, acceptance checks and a concise outcome. Workers choose routine details and run focused checks before reporting. No nested delegation unless explicitly assigned. Review a completed candidate; consolidate corrections. Keep review proportional to risk and reuse passing checks when their inputs are unchanged. Have each lane owner load its specialized implementation/review instructions; the parent loads them only when it owns that work.

## Run and collect

Set a descriptive `name` and 1–5 task `tags`; select `result_mode="compact"` when advertised. Launch independent tasks together with `tasks`. For known dependencies, `run_workflow` schedules the graph and forwards compact reports; give each stage `id`, `write_scope` and any `depends_on`. Declared scopes are not sandboxes. Failed/unrun checks, important findings and invalid reports block descendants; research requirements belong in summary/evidence, not defect findings. Workflow support is native macOS/Linux only.

Spawn, workflow and steer calls wait by default. Use `background=true` only with useful independent work, then join all required results before ending the turn. Workers survive parent-turn interruption but stop on parent close; completion never injects a parent message.

Waits default to 480 seconds (eight minutes, also the cap) and return as soon as required work finishes or needs input; omit routine timeout overrides. Keep required joins in the same pending code execution where supported, returning for completion, a blocker/error or a request needing attention. If the harness yields, resume that same call using its longest allowed wait, rather than a short interval by habit. Respect caller responsiveness limits. UI progress needs no status query. Continue waiting for required running work; elapsed time alone never justifies steering, cancellation or abandonment.

Default quiet reads preserve unread output and expose control state/errors. Keep compact reports; treat them as claims and verify relevant evidence. Use `get_status` or `full_output=true` only for a specific missing fact. With progress reads, carry returned cursors; after `wait_mode="any"`, join only remaining runs. Save durable evidence within assigned ownership: runs/workflows are memory-only and retained histories are bounded.

## Correct and reuse

After the complete result, send one consolidated correction through `steer_agent`. Supported completed workers resume the same provider session/context; use the returned new `run_id` and `continued_from`. Old reports/workflows stay unchanged; coordinate write ownership before this standalone follow-up. `continued_by` identifies a later receipt. Failed pre-dispatch startup permits an explicit retry from the original receipt after cleanup; dispatched failures do not.

Active steering is rare: a changed requirement, verified invalid assumption or ownership conflict that cannot wait. Batch known corrections, then wait for the full result. Another active steer needs a new material fact. Never send reminders, progress requests or speculative suggestions. `accepted`/`can_steer` indicate input availability, not that an earlier message was processed. A running result calls for waiting, not resending.

Use the live schema on older hosts: unsupported compact/workflow/reuse options require concise standalone tasks; delivery-only steering requires a subsequent wait. Honor the live host cap; older hosts may allow only 240 seconds. Startup retries are the default; replaying dispatched work requires explicit justification and authority.
