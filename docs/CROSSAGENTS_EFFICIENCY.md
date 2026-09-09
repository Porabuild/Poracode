# Crossagents efficiency verification — 2026-09-09

Implementation: `46767c260` on `poracode/v2`, based on `fa9469abb`. This is the bounded Crossagents handoff, not the paused production-review goal. No push or signed application-bundle modification.

## Delivered behavior

Optional `output_mode: "quiet" | "progress"` on `spawn_agent`, `wait_for_agent` and `get_status`. Omission retains released behavior. Quiet suppresses running narration, preserves the unread cursor, exposes pending request counts and retains errors. `full_output` wins; settled output and its existing clipping remain unchanged. Invalid modes fail before spawning or entering a batch wait. Authentication, ownership, retry and worker lifetime policies are unchanged.

Core and parallel-review skills now assign complete worker-owned investigation, implementation and focused verification; exact resource ownership; concise evidence-backed outcomes; batched synchronization; steering only for new information; reuse of unchanged passing checks; and one independent review wave plus necessary correction review. Transport wait expiry is explicitly not a stall.

## Small deterministic before/after tests

Actual `SubagentRunManager` with the existing fake structured-session fixture: two workers each emit `"Investigating the owned change. ".repeat(100)` (3,200 characters). Compare legacy progress and quiet reads at cursor zero, then complete both turns. Size is UTF-8 bytes of `JSON.stringify(jsonResult(value))`, including the MCP content wrapper and stable-length run IDs, excluding HTTP/JSON-RPC framing.

| Response         | Progress |   Quiet |          Reduction |
| ---------------- | -------: | ------: | -----------------: |
| One running run  |  1,241 B |   154 B |              87.6% |
| Two running runs |  2,476 B |   302 B |              87.8% |
| Two settled runs |  6,712 B | 6,712 B | 0%; exact equality |

An open approval remains visible (`pending_requests: 1`; 182 B single quiet response). Both quiet cursors stay at zero until settlement. Each settled response contains all 3,200 characters. These comparisons use legacy progress on the updated runtime; the unchanged legacy regression suite also passes. They are not live model quality or quota experiments.

Static text comparison loads the actual catalog exports before (`fa9469abb`) and after:

| Text                        | Before characters | After characters | Approximate tokens before → after |
| --------------------------- | ----------------: | ---------------: | --------------------------------: |
| MCP initialization guidance |             5,720 |            2,524 |                       1,430 → 631 |
| JSON tool catalog           |            15,547 |           16,399 |                     3,887 → 4,100 |
| Guidance + catalog          |            21,267 |           18,923 |                     5,317 → 4,731 |
| Core skill                  |             3,155 |            4,837 |                       789 → 1,210 |
| Parallel-review skill       |             2,184 |            2,058 |                         546 → 515 |

Token estimates are `ceil(characters / 4)`, not tokenizer counts, billable tokens or quota. Initialization guidance shrinks 55.9%; guidance plus catalog shrinks 11.0%. The catalog grows to describe the new option, and the core skill grows to establish complete workflow and compatibility rules. Including one load of both skills, total text falls from 26,606 to 25,818 characters (3.0%). Quiet does not reduce parent wakeups; behavioral savings from fewer handoffs/repeated investigations remain unmeasured.

## Verification and review

- Handoff RED evidence: 1 failed, 67 passed in the manager suite before runtime implementation.
- Final command: `pnpm exec vitest run src/supervisor/crossagentMcp src/supervisor/skills/SkillsService.test.ts src/supervisor/plugins/conformance.test.ts src/shared/plugins/builtInCoreSkills.test.ts` — **271 passed, 1 skipped, 9 files**. Skip: existing Windows namespace/Volume GUID skill-path test on macOS.
- Coverage includes single/batch dispatch, wait-any, cursor/full-output, pending requests, failures/ownership, legacy paths, HTTP ingress authentication, plugin conformance and skill precedence.
- `pnpm run typecheck`, touched-file `oxlint --deny-warnings`, type-aware lint with `.oxlintrc.type-aware.json`, `oxfmt --check`, and `git diff --check` passed. Commit hooks also passed.
- Two independent read-only reviewers owned runtime/trust and MCP/compatibility/simplification. One validated nit was fixed: invalid batch wait-any modes now reject before waiting. Correction review found no further issues. Crossagents was absent from this session's callable catalog, so available native review agents were used; no live GLM/fallback-provider measurement is claimed.
- Two additional temporary tests passed: deterministic measurements and actual installed-skill resolution. Local scripts, JSON results and logs remain in ignored `tmp/crossagents-efficiency/`.

## Version and installation audit

Plugin package advances **1.2.1 → 1.3.0** for changed shipped skills. `builtInCoreSkills.ts` imports that manifest directly; `build-desktop-artifact.mjs` packages `resources/plugins`. No duplicate Crossagents package version needs updating. MCP remains an additive tool contract: old requests are valid, no persisted run shape changed, and no MCP protocol-date or database migration is needed.

Updated global files:

- `~/.agents/skills/subagent-delegation/SKILL.md`
- `~/.agents/skills/parallel-review/SKILL.md`

Backup: `~/.poracode/backups/crossagents-efficiency/20260909-092845/`. Poracode discovers valid user copies. A real `SkillsService.scan` with the Codex adapter and installed application plugin **1.2.1** resolves both effective IDs to `global:agents:<name>:on`; contents exactly match repository files. A committed previous-package fixture protects precedence, not deployment itself.

The signed `/Applications/Poracode Nightly.app` remains unchanged. New app builds carry the updated MCP; existing servers need an app upgrade/restart, and sessions may need fresh tool discovery. Global skill instructions feature-detect the live schema and omit quiet on older servers. Global overrides must be kept in sync with future bundled skill changes.

Durable notifications, host-managed pipeline stages and goal-pause races remain follow-ups. This work proves smaller monitoring payloads with preserved tested evidence, not universal task-quality parity or a billing reduction.
