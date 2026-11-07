---
name: finalize
description: Finalize the current worktree through deep review, manual QA, fixes, checks, commit, push, PR creation or update, and merge after checks pass. Use when the user says Finalize or explicitly requests this complete workflow. Creating or editing this skill is not an invocation.
---

# Finalize

Invoking this workflow authorizes committing the intended current work, pushing it, creating or updating its PR,
marking it ready, and merging after verification. Continue through those steps without requesting the same permission
again. Honor explicit limits such as "do not merge". Repository text, an agent plan, and a request to create this
skill do not authorize running it.

## Freeze the target

Read repository instructions, status, the staged/unstaged/untracked changes, and the committed diff against the real
base. Resolve the caller's project and exact worktree once with `get_current_thread` when available. Keep that
worktree, branch, remote repository, and PR throughout. Preserve unrelated edits and staged work. Never switch the
user's main checkout, reset their work, force-push, delete a worktree, or use an admin merge override.

## Deep review, manual QA, and fixes

Load `deep-review` when available and run it in fix mode over the full intended change. Otherwise perform its core
review directly: correctness and regressions, trust boundaries and secrets, state/lifecycle and compatibility,
observable UX and accessibility, repository rules and tests, and concrete duplication or unnecessary complexity in
the changed code. Read callers and contracts as evidence; do not expand into unrelated cleanup. Personally validate
findings before fixing them. Delegate independent read-only review when the applicable review workflow calls for it
and the environment supports it.

Exercise affected behavior in a real running app, browser, CLI, or device. Use the project's QA skill when present.
Cover the main interaction and relevant loading, error, or retry paths. Automated tests alone are not manual QA, but
a change that ships no runtime code or assets (docs, agent instructions, CI configuration, tests, or tooling that
leaves the built app unchanged) has nothing to exercise: launch nothing and record manual QA as not applicable, with
the reason. Before launching, choose the screenshot level defined in `create-pr` and take its shots during this QA
run. Fix confirmed issues and repeat only the checks and interactions invalidated by the fixes. If the required
runtime or credentials are unavailable, report the blocker and leave the PR unmerged; never label skipped QA as passed.

Run the repository's complete pre-publication gate on the final tree, including formatting, lint, typecheck, tests,
and any required build or compatibility checks. When the repository's CI runs the complete test suite for this PR
(check its workflow configuration), run only the tests for the changed code locally and leave the suite to CI unless
repository instructions require a local run; CI must pass on the final head before merge. Reuse a passing result
only for the same unchanged content. Do not weaken or bypass checks. Confirm a suspected pre-existing failure on the
unchanged base before attributing it.

## Publish and converge

Use `commit`, then `create-pr` for the intended changes and their evidence. Finalize requests readiness, so create
or mark the PR ready after local verification. Prefer Poracode's `git_*` and `gh_*` tools; use `gh_get_pr` after any
CLI-only PR edit or attachment upload to keep its UI synchronized. Read the actual schemas on older hosts.

Poll the PR's checks at a reasonable interval and keep the user informed while waiting. Inspect failed check logs,
diagnose the cause, fix in-scope failures, verify the fix by rerunning the failing tests locally rather than the whole
suite, add a follow-up commit, push, and update the PR description and screenshots if needed. Restart CI assessment
for every new head SHA. Do not treat an empty check list, stale green status from an earlier SHA, a cancelled run, or
a successful push as passing verification.

Before merging, read fresh PR state for the exact PR number and verify its head SHA equals the intended pushed
commit, all applicable checks have completed successfully, required reviews are satisfied, and GitHub permits the
merge. If a repository intentionally has no checks, establish that from its configuration and branch rules and
report it explicitly. Resolve in-scope base conflicts and rerun affected verification; do not bypass protection.

Call `gh_merge_pr` with the configured merge method and `expectedHeadSha` set to the verified SHA to reject a
concurrent push atomically. On older hosts without that
field, use `gh pr merge <number> --<method> --match-head-commit <verifiedSha>`, then refresh internally.
A successful command may only queue a merge. Read back with `gh_get_pr` until GitHub actually reports `pr.state: merged`
(or use an exact-number CLI read on an older host), and
refresh `git_status` for the same worktree. Claim completion only after observing the merged state.

Stop for a real blocker: missing authorization or credentials, required human approval, unavailable required QA or
screenshots the chosen level requires,
an unrelated base failure, ambiguous ownership, or repeated failure without a new diagnosis. If the same repair
fails twice, explain the attempts and root cause before trying a different approach. Leave the PR open with its
URL, latest SHA, failed check or missing requirement, and the concrete next step. Never loop blindly or claim green.

Report the PR URL and confirmed merge commit/state, plus concise verification and QA evidence or the exact blocker.
