# Crossagents compact results and workflows

This follows the quiet-monitoring work at `9bf9804fb`. Plugin **1.4.0** adds worker-authored reports and one host scheduling tool. The separate production-review work is outside this change.

## Behavior

- `spawn_agent(result_mode="compact")` asks the worker to prepare a fenced `crossagents-result` v1 report: outcome, summary, changes, checks, findings, risks and evidence references. Single and batch requests support it. The host validates the report once; no extra summarizer model runs.
- Default compact reads return that report while leaving transcript evidence unread. `full_output=true` retrieves retained evidence, and `output_mode="progress"` restores legacy narration. Missing, malformed or oversized reports surface an explicit `result_error`; failures and pending requests remain visible. Existing default spawn behavior is unchanged.
- `run_workflow` supports `start`, `status`, `wait`, `cancel` and `list`. A start validates the whole graph and provider selections before launch, then passes compact dependency reports directly between workers. Prefer foreground execution for short dependent tasks; background execution is for useful independent parent work.
- Each stage declares `write_scope` (empty for read-only work). Overlapping unordered stages and conflicting active workflows are rejected. Reports with failed/unrun checks, important findings, blocked outcomes or invalid structure block descendants. Independent stages continue. Running snapshots expose blockers; settled snapshots include sink reports. Intermediate evidence remains addressable by run ID.
- Limits: 16 stages/workflow, 4 active workflows/parent, 16 occupied child slots, 50 retained settled workflows/parent. Waits default to 120 seconds, capped at 240. Timeouts do not cancel work. Records are memory-only; parent close cancels owned work. There is no automatic parent-message injection, durable notification, restart recovery or automatic publication.
- Automatic workflows currently require native macOS/Linux execution. Windows/WSL retain standalone spawn/wait and compact reports. Declared scopes are scheduler coordination, not a filesystem sandbox; standalone runs and external editors are not covered by workflow scope checks.

Bundled core/review skills teach worker-owned investigation → implementation → focused verification → concise report, exact ownership, independent review, incremental evidence and reuse of checks only for unchanged inputs. The only custom user skill updated is `~/.poracode/skills/glm-flash-delegation/SKILL.md`; its GLM routing remains intact. No global core/review copies were recreated and no signed application bundle was modified.

## Measured small experiment

A deterministic harness uses the real run manager with two fake structured worker sessions, each producing 56,262 transcript characters and the same valid report. Comparison is against legacy progress results, not an authenticated model run.

| Measurement                                          |    Legacy |    Compact/workflow |
| ---------------------------------------------------- | --------: | ------------------: |
| One settled MCP response, serialized bytes           |    16,347 | 539 (96.7% smaller) |
| Two-stage parent responses, serialized bytes         |    32,694 | 874 (97.3% smaller) |
| Foreground MCP calls for the short two-stage fixture |         2 |                   1 |
| Complete retained transcript retrieval               | available |       exactly equal |

Costs are explicit: the compact prompt adds 1,595 characters per worker. The JSON tool catalog grows from 16,399 to 22,225 characters; initialization guidance grows from 2,524 to 3,113. At the rough `ceil(chars/4)` estimate, those are 399 worker-prompt tokens, catalog 4,100 → 5,557 and initialization 631 → 779. These are character-based estimates, not tokenizer counts, billing or quota measurements. Core/review skill sizes grow from 4,837/2,058 to 7,758/2,342 characters to document the new contract.

Long results benefit most; short jobs may not recover the added setup cost. A bounded wait can still wake the parent repeatedly on long work. Quiet monitoring itself does not reduce wakeup count. Deterministic fixtures establish payload reduction and tested evidence preservation, not universal model quality parity or absence of bugs. No live GLM/fallback-provider quota or end-to-end model-quality experiment was performed; Crossagents tools were unavailable in this session, so native independent agents reviewed the changes.

## Safety review and verification

Independent review covered parsing/evidence, scheduler permissions and ownership, MCP compatibility and cost, then correction deltas. Validated findings fixed include absolute-path scope bypass, premature slot/scope release during teardown, pruned live cleanup handles, missing report boundaries, hidden running blockers, late startup resources, delayed OpenCode dispatch after disposal and failed Cursor startup cleanup ownership.

Shutdown now awaits owned process/group exit or authoritative pooled-session idle confirmation. Cleanup failure retains handles and scheduler ownership for retry. This required focused changes to structured runtime disposal as well as the Crossagents runner. Native subprocess tests exercise graceful exit, forced termination and surviving process-group descendants. Provider transport tests use deterministic fixtures; WSL and authenticated provider execution were not smoke-tested.

Final validation: **867 passed, 6 existing platform/optional-runtime skips across 29 files**. This includes Crossagents single/batch, cursor/full evidence, authorization/ownership, approvals, legacy behavior, graph/cancellation races, plugin/skill resolution and all touched provider disposal suites. Full `pnpm run typecheck`, touched-file regular/type-aware lint and format, `git diff --check`, and `pnpm run build:electron` pass. Reproduction inputs and logs are retained locally under ignored `tmp/crossagents-workflows/`, including `measurement.test.ts`, `measurements.json`, `final-tests.log`, and lint/typecheck logs.

## Compatibility audit

The plugin manifest advances **1.3.0 → 1.4.0**. Bundled core-skill discovery imports it directly; MCP server identity now uses that manifest version. The shared MCP tool-name catalog and ingress permission alias include `run_workflow`, with mutating annotations. Desktop packaging carries `resources/plugins`; no signed installed bundle is patched. Existing installed servers require an app build/upgrade and restart, plus fresh tool discovery. Skills feature-detect the new APIs.

The MCP request additions are opt-in and workflows have no persisted state. Compact envelopes explicitly validate version 1. No database or external MCP protocol-date migration is required. Provider worker wire shapes, deployed hook plugins and WSL bridge behavior did not change, so their independent protocol/plugin versions remain valid.
