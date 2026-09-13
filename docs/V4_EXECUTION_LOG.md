# V4 execution and evidence ledger

The objective is the full [V4 merge-readiness plan](V4_MERGE_READINESS_PLAN.md),
including every phase item, acceptance scenario, performance budget, and final
qualification gate. A passing focused check does not complete its containing
phase. Native clients remain development clients with shared-contract/build
obligations. No qualification gate has been waived.

## Execution state

| Phase                                | State       | Evidence / next action                                                                                                                                                                                                                                                         |
| ------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0 — master integration and baselines | In progress | Root V2 `832fc5467`; fetched master `9a4096ea8`; isolated `poracode/v4-integration` worktree has the expected 32 merge conflicts. Resolve semantic conflicts, native replacement deltas, and compatibility generations; capture live before evidence on unchanged root source. |
| 1 — exclusive server ownership       | Pending     | All seven work items and acceptance scenarios remain open.                                                                                                                                                                                                                     |
| 2 — operation safety and lifecycle   | Pending     | All eight work items and acceptance scenarios remain open.                                                                                                                                                                                                                     |
| 3 — off-main bulk transport          | Pending     | All six work items and acceptance scenarios remain open.                                                                                                                                                                                                                       |
| 4 — off-thread client engine         | Pending     | All ten work items and acceptance scenarios remain open.                                                                                                                                                                                                                       |
| 5 — server/relay fairness            | Pending     | All seven work items and acceptance scenarios remain open.                                                                                                                                                                                                                     |
| 6 — bounded payloads                 | Pending     | All seven work items and acceptance scenarios remain open.                                                                                                                                                                                                                     |
| 7 — browser/mobile-web lifecycle     | Pending     | All five work items and acceptance scenarios remain open.                                                                                                                                                                                                                      |
| 8 — artifact/upgrade/soak/merge      | Pending     | All seven work items and acceptance scenarios remain open; no final freeze, merge to master, or promotion authorized by evidence yet.                                                                                                                                          |

## Rules for evidence and commits

- Record before behavior, change, independent critic findings and dispositions,
  after checks, manual evidence, and exact commit/artifact identity for each slice.
- Keep fixes small and commit after their relevant checks and review. A merge
  commit must preserve both parent behaviors and intentional compatibility fences.
- Keep measured runs separate from resource-heavy work, even in another worktree.
  A launch duration or frame sample on a busy host is diagnostic, not a benchmark.
- Do not overwrite historical evidence with a newer pass. Record which revision
  and scenario supersedes a failure and retain the original failure evidence.
- Add newly validated problems to the plan and this ledger and fix them. Record
  speculative or unverified candidates distinctly; do not invent a causal link.
- Only mark a phase verified when its complete acceptance scope is proven. The
  active goal remains unfinished while any plan requirement or final gate is open.

## 2026-09-13 — execution started

Before: clean executable source at `832fc5467`; only the untracked V4 plan existed.
Fetched refs again: master `9a4096ea8`, V2 `832fc5467`. Created isolated worktree
`.tmp/v4-integration` on branch `poracode/v4-integration` from that baseline, then
began a no-commit merge of current master. The 32 conflicts match the earlier
merge-tree preview. The root executable source remains unchanged for live baseline
testing; the master branch is untouched.

Independent plan critic validated and corrected four execution gaps:

1. A new common lock cannot exclude an already-running legacy Electron that does
   not honor it. Added explicit legacy-owner detection/refusal or separate-root
   import and both-startup-order upgrade tests.
2. A copied DB may still run real schedules/PR automation against real project
   paths. Added online backup, disposable project copies, scrubbed credentials,
   and disabled real automation before any benchmark startup.
3. Separate worktrees do not isolate performance resources. Added exclusive
   measurement windows to Phase 0 as well as final qualification.
4. Unattended credential access must be solved before declaring detached server
   restart complete; retaining an already-unsealed key in memory is insufficient.

These are now requirements in the plan. No implementation or acceptance result is
being claimed by this initial documentation checkpoint.
