---
name: parallel-review
description: "Get independent reviews of the same work from several agents, then reconcile their findings into one verified verdict."
---

# Parallel Review

Follow the subagent-delegation core skill, including explicit user authorization and live tool availability. Use one risk-based independent review wave. Select only useful lenses: correctness/lifecycle, security/trust, tests/compatibility, or simplification/performance. Merge adjacent lenses for small changes.

Assign each reviewer exact read-only files/resources and a distinct lens; overlap only for meaningful cross-boundary risks. Give the intent, relevant diff and acceptance criteria without another reviewer's conclusions. Require file:line, a concrete failure or cost, severity, evidence and the smallest fix. Target at most 500 words, retaining every critical finding and linking longer evidence. Reviewers own investigation and focused proof, not edits or a narrated search log.

Submit independent lanes together through `spawn_agent` with `tasks`, review tags and specific names. Use background runs only while useful independent work remains. At synchronization, batch `run_ids` in `wait_for_agent`. A transport-bounded wait returning `running` is not a stall: continue waiting for required results, without extra status polling or timeout cancellation. Use quiet output only when advertised by the live schema; otherwise use incremental cursors. Completion never injects a parent message automatically.

Validate every returned claim against real code and guards. Agreement is not proof. Resolve disagreements by checking the execution path. Fix confirmed findings, test the integrated changes, and reuse passing checks only for unchanged inputs and dependencies. Request only a correction-delta review when fixes change meaningful behavior or boundaries; do not restart the full wave.

Return one ranked list of verified findings with file references and evidence, or state no findings. Include covered dimensions, actual verification and remaining limits.
