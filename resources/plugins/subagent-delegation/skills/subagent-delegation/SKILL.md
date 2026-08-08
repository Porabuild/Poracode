---
name: subagent-delegation
description: Delegate independent, bounded work to the best available Poracode agents and consolidate verified results. Use for parallel research, independent reviews, specialist work, or non-overlapping implementation; do not delegate trivial, sequential, tightly coupled, or context-heavy work.
---

# Subagent Delegation

Use Poracode's `crossagents` MCP when independent, bounded work can run in parallel or a specialist or independent second opinion will materially improve the result. The coordinator remains responsible for understanding the problem, protecting shared state, and validating the final answer.

## Decide whether to delegate

Delegate when at least one of these is true:

- two or more subtasks can run independently;
- a distinct provider or specialist perspective is valuable;
- an independent review reduces correctness or security risk;
- a bounded search, test, or implementation lane can return a concrete artifact.

Do not delegate a trivial task, a sequence whose next step depends on the previous result, overlapping edits, or work that would require copying most of the conversation. Do not delegate merely to avoid understanding the task.

## Workflow

1. Classify the work with one to five concise task tags. Use `list_agents` when selection matters; call `get_agent` only when you need a provider's detailed models, reasoning choices, Fast support, or permission information.
2. Omit provider, model, reasoning, and Fast unless the user chose them or the task requires a deliberate override. Let Crossagents apply learned and configured routing.
3. Split the work into concrete subtasks with clear deliverables and non-overlapping edit scope. Every prompt must be self-contained and include relevant context, constraints, authority, expected output, and verification.
4. For one short task, call `spawn_agent` in the foreground. Set `background=true` only when the coordinator has useful independent work to do before synchronization. Submit independent tasks together through one `tasks` call for actual parallelism.
5. At the next real synchronization point, wait once for every required background result. Do not repeatedly poll. Cancel or continue without a stalled optional run.
6. Inspect returned evidence and changes, resolve disagreements or shared-worktree conflicts, and verify the combined result against the original request.

## Safety and retries

- Child agents have powerful permissions. Their prompt must not authorize actions beyond the user's request.
- Use startup-only fallback retries by default. `any-failure` can repeat writes or external side effects and requires explicit justification and authority.
- Do not allow multiple agents to edit the same files concurrently. Assign exact ownership or make review lanes read-only.
- Treat a confident child response as a claim, not proof. Check the relevant files, commands, tests, sources, or runtime state yourself.

## Output

Lead with the consolidated result. Mention delegated lanes only when it helps explain evidence, disagreement, limitations, or provider diversity. State what was verified and what remains uncertain.
