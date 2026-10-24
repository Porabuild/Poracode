---
name: finalize
description: Finalize the current Poracode worktree with deep-review, manual QA, issue fixes, full verification, commit, push, PR creation or update with screenshots, and merge after checks pass. Use when the user says Finalize or requests the complete workflow. Creating this skill does not invoke it.
---

# Finalize

The user's invocation authorizes this entire workflow, including readiness and merge. Honor narrower instructions.
Stay in the current worktree and keep its existing non-master branch. Preserve unrelated changes and staged work.
If the target or ownership is genuinely ambiguous, resolve it before publication.

1. Read repository instructions and inspect the full intended diff against `origin/master`, including committed,
   staged, unstaged, and untracked work. Record the starting branch, HEAD, and paths.
   Keep a compact record of completed checks, their commands/results, and the tree or affected files they covered.
   Reuse evidence from this session when its inputs are unchanged; committing alone does not invalidate it.
2. Run `deep-review` in fix mode. Validate findings and fix in-scope issues without unrelated cleanup.
3. Use `interactive-testing` for real manual QA of affected app behavior, with an isolated managed session. Add
   `provider-chat-smoke` or `mobile-apps` when applicable. For visible UI changes, capture comparable before/after
   screenshots as required by `pull-request`. Record real interactions and outcomes; tests do not replace manual QA.
   When that pass finishes, delete its smoke session directory, as interactive-testing requires.
   Finish heavy app builds before starting the full test suite; avoid overlapping baseline/branch builds and tests.
   Reuse valid captures and managed builds while their relevant source, fixtures, and runtime inputs are unchanged.
4. Fix confirmed QA issues, then run the full `verify` gate and every applicable conditional gate on the final tree.
   Run the full gate once, then rerun only failed checks or checks invalidated by subsequent changes. A docs-only
   edit requires its applicable format/skill validation, not another app build, UI capture, or product test suite.
   Diagnose failures before retrying. For test failures, rerun the complete failing files after resolving the cause;
   for host contention, stop owned competing work and use supported worker limits without changing test thresholds.
   Preserve and report the original failures and retry results. Repeat the full suite only when changed inputs or
   a failure diagnosis invalidate its broader coverage. Unavailable required QA or an unresolved red gate blocks merge.
5. Use `commit`, push the intended branch, and use `pull-request` to create or update its PR against `master`.
   Finalize requests a ready PR. Include final verification/QA evidence and uploaded before/after screenshots.
6. Monitor checks for the latest pushed SHA. Read failure logs, fix in-scope failures, verify, create follow-up
   commits, push, and refresh the PR description as needed. Every push requires a fresh CI assessment. Confirm
   suspected unrelated failures on unchanged `origin/master`; do not change unrelated code or bypass checks.
   Use CI status/watch operations between meaningful state changes; do not rerun valid local gates while waiting.
7. Read fresh exact-number PR state. Verify the PR head equals the intended pushed commit, all applicable checks
   passed, required reviews are satisfied, and GitHub permits the merge. Empty/pending/cancelled checks are not green.
   Merge with the configured method, `expectedHeadSha` set to the verified SHA, and without admin override. If the
   internal tool lacks that field, use `gh pr merge <number> --<method> --match-head-commit <verifiedSha>`. Read back
   until GitHub confirms `merged`. Missing required UI screenshots also block merge.
8. Refresh Poracode's state with `gh_get_pr` and `git_status` for the same project/worktree. Prefer its internal
   `git_*` and `gh_*` tools throughout. Use CLI only when tools lack an operation, including PR attachment upload
   or title/body edits; follow each with an internal read to synchronize the UI. On older hosts, inspect tool schemas
   and use exact-number CLI readback if the result omits core PR state.

Continue autonomously through ordinary failures. Stop for a concrete external blocker, ambiguous scope, required
human review, or a repair that fails twice without a new diagnosis. State the PR URL, SHA, failing requirement and
next step. Never force-push, weaken tests, skip hooks, or delete the current worktree. Report the confirmed merge
and concise verification/QA evidence; do not claim completion while GitHub only queued the merge.
