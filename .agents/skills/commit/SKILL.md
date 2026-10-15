---
name: commit
description: Creates a Poracode commit with a Conventional Commits subject, a why-focused body, and deliberately staged paths. Use when asked to "commit", "commit this", "write a commit message", "stage and commit", or to start a branch for a change. Not for opening a pull request (use pull-request) or for the pre-push check gate (use verify).
---

# Commit

Turn finished, reviewed work into one clean commit on the right branch. Commit only when the user asked; finished work is not consent to commit.

An invocation of `finalize` authorizes the commit and its subsequent push/PR/merge workflow. Prefer Poracode's
`git_status`, `git_stage` with explicit paths, and `git_commit` when available. Resolve the current thread's `projectId`
and exact `worktreePath` once and pass both; omitting the path targets the main checkout. Use CLI for missing
operations and read back with `git_status` to synchronize the UI. Inspect live schemas on older hosts.

## Branch

- Never commit to `master`. Keep the current worktree's existing branch and work. For a new branch, fetch `origin/master` and branch from it without resetting existing changes.
- Tied to a GitHub issue: name the branch `<issue>-<short-slug>`, e.g. `123-pending-worktree-identity`.
- No issue: keep the branch the workspace already created (Poracode worktrees start on `poracode/<name>`); otherwise use `<type>/<short-slug>`.

## Stage

Stage explicit paths after reading `git status --short` and the diff: `git add <path>...`. Do not use `git add -A` or `git add .`, because parallel agents and local tooling leave unrelated files in the tree.

Never stage:

- `.env*` files, credentials, tokens, or local config.
- `tmp/`, `.tmp/`, screenshots, logs, or other scratch output.
- `pnpm-lock.yaml` churn the change did not intend (a dependency change is the only reason it moves).
- Unrelated edits that happen to be in the tree; leave them unstaged and mention them.

Check `git diff --cached --stat` before committing.
If unrelated paths were already staged, resolve their ownership before committing; never silently include or unstage them.

## Subject

Format: `type(scope): subject`

- Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`.
- Scope is the area touched, as used in history: `sidebar`, `chat`, `usage`, `devin`, `opencode2`, `i18n`, `remote`, `ios`, `ci`. Omit the scope only when no single area fits.
- Imperative mood, lowercase after the colon, no trailing period, 72 characters or fewer (including any issue prefix).
- Describe the user-visible effect, not the mechanism: `fix(sidebar): show worktree identity while creation is pending`.
- Tied to an issue: put the number first, `#123 fix(sidebar): show worktree identity while pending`. Never invent an issue number.
- Do not add `(#PR)`; GitHub appends it on squash merge.

## Body

Explain why: the problem or goal and anything a reviewer cannot see in the diff (root cause, rejected alternatives, compatibility or migration impact). Wrap near 72 columns. Use bullets when the commit makes several distinct changes. Skip the body only for self-evident one-line changes.

Keep any co-author or attribution trailer the running agent harness supplies; do not invent one.

Pass the message with a heredoc or `-F <file>` so newlines and backticks survive the shell.

## Hooks

`.husky/pre-commit` runs `lint-staged` (`oxlint --type-aware --fix --deny-warnings` and `oxfmt --write` on staged files, see `lint-staged.config.js`) and then `pnpm run typecheck`. It takes a while; let it finish.

- Never use `--no-verify`. If the hook fails, fix the cause and commit again.
- Hook auto-fixes are written to the working tree; re-stage the touched paths and check the diff before retrying.

## History

- Do not amend, rebase, or force-push commits that are already pushed unless the user asks; reviewers lose their place. Add a follow-up commit instead.
- If the user asks to rewrite pushed history, use `git push --force-with-lease`, never plain `--force`.
- Do not use `git stash` in a shared worktree setup; the stash stack is shared across worktrees. Use a temporary WIP commit to set work aside.

## Done when

- The commit exists on a non-`master` branch and contains only intended paths.
- The subject matches the format above and `git log -1` shows the full message as intended.
- The pre-commit hook passed without being bypassed.
- Report the branch, the commit SHA, and the subject. Push only if asked.
