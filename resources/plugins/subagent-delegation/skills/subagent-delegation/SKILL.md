---
name: subagent-delegation
description: Delegate independent, bounded work to the best available Poracode agents and consolidate verified results. Use for parallel research, independent reviews, specialist work, or non-overlapping implementation; do not delegate trivial, sequential, tightly coupled, or context-heavy work.
---

# Crossagents

Use the `crossagents` MCP only after the user explicitly requests delegation in this thread; that authorization persists. The coordinator owns integration and the final result. Resolve tool names against this server's actual catalog.

## Assign complete work

Delegate only when independent work can run alongside useful local work, or a specialist or independent review materially helps. Keep trivial, tightly coupled or context-heavy work local. Do not repeat a worker's investigation in the parent while it is running.

Give each worker a self-contained objective, relevant files/resources, exact write ownership (or read-only scope), constraints, acceptance checks and deliverable. Prefer worker-owned investigate → implement → focused verification → concise outcome over returning each phase to the coordinator. Never overlap writes, including shared generated files. Reserve integration and git operations for one owner. Child permissions do not expand user authorization.

Target results of at most 500 words: outcome, changed files or artifact references, exact checks/results, all critical findings and unresolved risks. Link detailed evidence instead of copying logs; never omit a critical finding to meet the target. Progress belongs in the UI/logs, not repeated parent narration.

## Route and launch

1. Classify with 1–5 concise task tags. Use `list_agents` when selection matters and `get_agent` only for needed model, reasoning, Fast or permissions details. Pass the same tags to `spawn_agent`.
2. Honor user-selected provider/model/reasoning/Fast; otherwise omit these fields for configured and learned routing. Persist routing preferences only on clear user intent.
3. Set a specific task `name`. Submit independent tasks together in one `spawn_agent` call with `tasks`. Maximum: 16 active children per parent. `list_runs` with `include_capacity=true` gives a snapshot, not a reservation.
4. Foreground spawn waits by default. Use `background=true` when useful independent work remains before synchronization. Background completion does not inject a parent message; the coordinator must collect required results.
5. Fallbacks retry startup failures by default. `retry_on="any-failure"` can repeat dispatched writes and needs explicit justification and authority. A wait timeout is not a startup failure.

## Let workers report and the host coordinate

When the live spawn schema advertises `result_mode`, set `result_mode="compact"`. Poracode adds the final-report contract to the worker prompt. The worker prepares its own summary, changes, checks, findings, risks and evidence references; the parent does not summarize its transcript. Default wait/status reads return the validated report and control state. `result_error` means missing/invalid evidence, not success. Reports are worker claims: inspect the relevant changes and verify integration. Use `full_output=true` for complete retained transcript evidence or `output_mode="progress"` for the legacy tail. Compact reads keep transcript cursors unread.

For known dependent tasks, prefer one `run_workflow` call over parent-managed stage handoffs. Each task has a unique `id`, `prompt`, exact project-relative `write_scope` (`[]` for read-only), optional `depends_on` IDs and normal selection fields. Root provider/model/reasoning/Fast/permissions are defaults; task values override them. All stages use compact results and startup-only retries. The host validates the graph, queues for capacity, and passes compact dependency reports directly to downstream workers.

The host checks declared write-scope conflicts within/across active workflows; these declarations are not filesystem sandboxes. Coordinate ownership with standalone runs yourself. A failed, missing or blocked report, important finding or failed/unrun listed check blocks descendants. Do not add unconditional repair loops or publishing stages. Independent stages may still complete.

`run_workflow` starts and waits by default. Use `background=true` only with useful independent work, then `action="wait"` with `workflow_id`. Waits return on completion, approvals, a newly blocked stage or transport timeout. Repeated waits do not wake for an already-reported blocker. Other actions are `status`, `list`, and `cancel`. Running snapshots include blocking reports when attention is needed; successful reports appear at settlement for sink stages, with other stages available through `get_status` using their `run_id`. No automatic parent-message injection. Host-managed workflows currently require native macOS or Linux execution; Windows and WSL workflows are rejected before launch because worker shutdown cannot yet guarantee write ownership release. Standalone compact `spawn_agent` runs remain available. Limits: 16 tasks/workflow, 4 active workflows/parent, 16 active workers total. Workflows are memory-only, stop on parent close and do not recover after app restart. Compact workflows retain 50 settled records/parent; full transcripts retain the existing 50-run window. Save durable evidence in owned files when needed.

If the live catalog lacks these options/tools, use existing spawn/wait with concise worker outcomes; do not claim host-managed scheduling or compact delivery is available.

## Synchronize economically

Batch required `run_ids` in `wait_for_agent` at real dependency points. Waits default to 120 seconds and cap at 240 for transport safety. A `running` result leaves the worker active: continue bounded waits for required results, without intervening status polls. Never cancel or abandon work merely because time elapsed. Cancel only on user request or when the work is no longer needed for reasons unrelated to elapsed time. Runs survive parent-turn interruption but stop when the parent thread closes.

When the live tool schema advertises `output_mode`, use `"quiet"` for routine spawn/wait/status monitoring. It suppresses only running narration, preserves the unread cursor, and retains errors and pending request counts. Handle requests through the host UI; settled evidence is unchanged. `full_output=true` overrides quiet. Quiet reduces response payload, not parent model wakeups. Older installed/running MCP servers may lack this option until app upgrade/restart: omit it there and use existing incremental reads.

Pass each returned `total_output_chars` as the next `after_output_chars`, or use `after_output_chars_by_run` for batches. Quiet running reads preserve that offset so later evidence remains unread. Default progress output clips running/settled tails at 1000/16000 characters; use `full_output=true` when omitted evidence is needed. For `wait_mode="any"`, remove settled IDs before the next wait. Use `get_status` for a concrete diagnostic need, not a polling loop. Steer only for new evidence, constraints or ownership conflicts.

## Verify and integrate

Validate worker claims against artifacts and focused evidence. Reuse passing checks only when their inputs and relevant dependencies are unchanged; test integrated changes. Do not rerun identical checks merely to narrate another stage.

Use one independent, risk-based review wave with read-only ownership and distinct lenses. Validate every finding, fix confirmed issues, then review only a correction delta when it changes meaningful behavior or boundaries. Avoid repeated full review rounds. Report the consolidated result, checks and remaining limitations.
