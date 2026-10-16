---
name: commit
description: Create a deliberately staged commit from the current worktree with a clear subject and why-focused body. Use when asked to commit or stage and commit. Does not push or open a PR unless those actions were also requested.
---

# Commit

Read the repository's instructions, current status, staged and unstaged diffs, and recent commit messages before
staging. Keep the current worktree and its branch. If it is the default branch, create a branch before committing;
do not move existing work to another checkout or reset it to the base.

## Use Poracode's Git tools

When available, resolve the caller once with `get_current_thread` and use its `projectId` and exact `worktreePath`
for `git_status`, `git_diff`, `git_stage`, and `git_commit`. Omitting `worktreePath` targets the main checkout.
Inspect the live tool schema on older hosts. If these tools are unavailable, use the repository's CLI workflow.
After a CLI mutation, call `git_status` for that same target when available so Poracode refreshes its UI.

## Stage and verify

- Stage explicit intended paths with `git_stage.paths`; leave `all` and `addAll` false. Preserve unrelated changes,
  including anything already staged by the user. If unrelated staged work would be included, resolve that scope
  before committing; do not silently include or unstage it.
- Exclude secrets, local configuration, generated scratch output, and screenshots unless the task explicitly needs
  an appropriate tracked asset. Read the staged diff and stat before committing.
- Run the repository's required checks and tests covering changed behavior. Use its verification skill when present.
- Keep hooks and signing enabled. Diagnose failures, apply focused fixes, inspect hook edits, and restage only the
  intended paths before retrying. Never weaken checks to obtain a commit.

## Message

Follow repository conventions. When none exist, use `type(scope): imperative subject`, lowercase after the colon,
without a trailing period and at most 72 characters. Describe the resulting behavior. Add an issue prefix only when
the repository requires it and a real issue is linked. Do not invent issue numbers or attribution trailers.

Explain why the change is needed in the body: the problem, cause, and material tradeoff or compatibility impact.
Pass the full message as the `git_commit.message` string. For CLI fallback, use a message file to preserve newlines
and shell metacharacters. Prefer follow-up commits over rewriting published history.

Read back the commit, its paths, and status. Report its SHA and subject. Push only when the user's request includes
publication, such as Create PR or Finalize.
