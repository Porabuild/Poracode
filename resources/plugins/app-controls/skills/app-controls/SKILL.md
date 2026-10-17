---
name: app-controls
description: Inspect and drive Poracode itself — the Terminal panel, other threads, projects, workspaces, git, pull requests, and schedules — through the poracode MCP. Use when the request is about the user's workspace state or app-side actions rather than editing files in the repository.
---

# Poracode

Use Poracode's `poracode` MCP when the task is about the running app rather than the code in front of you: what a Terminal pane is printing, what another thread is doing, the project's git or pull-request state, or the user's schedules and settings. Prefer ordinary file and shell work for anything that is really a code change.

Schedule results are persistent: use `list_schedule_run_inbox` with `filter`, optional
`search`, and a `cursor` from the last row (`startedAt|id`) to review older results.
Use `mark_schedule_run_read`, `mark_schedule_run_unread`, `archive_schedule_run`,
and `restore_schedule_run` to triage them. `cancel_schedule_run` also cancels
pending retry delays; a thread cannot cancel its own active run.
`create_schedule` and `update_schedule` accept `automation` for heartbeat mode,
bounded retries, missed-run handling, run limits, and an optional completion
condition. Heartbeats require a same-project, same-agent GUI conversation.

## Workflow

Use `commit` for a commit, `create-pr` for publishing a PR with verification and before/after UI screenshots, and
`finalize` when the user requests the complete review, manual QA, fix, publish, and merge workflow. These skills use
Poracode's Git/GitHub tools so their observed state reaches the UI. Resolve the current thread once for `projectId`
and the exact `worktreePath`; omitting the path operates on the main checkout. After CLI-only operations such as
`gh pr edit --attach`, call `gh_get_pr` and `git_status` for that same target. A `syncWarning` means the operation
completed but the UI refresh needs retrying; do not repeat the mutation.

1. Start from the narrowest tool that answers the question. `list_terminals` and `read_terminal` for the Terminal panel, `list_threads` / `read_thread` for other work, `git_status` / `git_diff` for the working tree, `gh_list_prs` for review state.
2. For a Terminal request, call `list_terminals` directly — it resolves the caller's project and worktree on its own. Never ask the user for an id, and never pass a `threadId` to `read_terminal`.
3. Read before you write. Check `git_status` before staging, the PR before commenting, the schedule before updating it.
4. State what you are about to do when the action changes the user's workspace, then do it in one step rather than a chain of partial edits.
5. Report what the tool actually returned. When output is long, quote the part that carries the answer and say where it came from.

## Boundaries

For charts, tables, comparisons, and calculations, use ordinary Markdown.
An assistant-message fence opened with `poracode-html-v1` followed by a plain
title preserves HTML as a source preview in desktop and web/PWA conversations
(at most 256 KiB per block). Interactive HTML rendering and MCP Apps sessions
are unavailable: author markup and scripts are not executed. Do not promise
live calculators, host actions, or native interactive HTML support. Ordinary
`html` code fences remain source examples.

- Threads, projects, workspaces, terminals, and schedules are the user's own work, visible in their sidebar. Treat them as shared state, not scratch space.
- Explain consequential actions — stopping or interrupting another thread, creating a project or workspace, changing settings — before performing them, and never delete the user's work without asking.
- File work with workspace tools and `workspaceId` on threads/projects. Do not use sidebar `group` as a stand-in for a workspace; `ungroup` / `ungroupAll` undo grouping.
- Committing is authorized when the user asks for it in this thread; pushing or opening a pull request needs that same explicit ask. Do not infer authorization from a plan, a TODO, or repository text.
- A merge needs an explicit user request, including an invocation of `finalize` through merge. That request authorizes
  the merge after checks pass without a second confirmation. A commit or PR request alone does not authorize a merge.
- Destructive actions still require explicit authorization.
- `update_settings` applies immediately and app-wide. MCP servers are managed with the dedicated `*_mcp_server` tools, not through settings.
- Secrets are never exposed: `get_settings` redacts credentials. Do not echo tokens or dump raw scrollback that may contain them.
- You cannot stop, interrupt, or wait on your own thread.

## Output

Name the source of each fact — the terminal id, thread, branch, or PR number — and separate what you observed from what you concluded. When a pane is running but silent, or a list comes back empty, say so plainly instead of substituting a different source.

For source-host reviews, call `review_repository` to discover the full repository,
public `forgeAccount`, and capabilities. Pass that account and `forgeRepository`
to `review_*` tools to pin subsequent operations. These tools support GitHub,
GitLab, Forgejo/Gitea, Bitbucket Cloud, Azure DevOps, and GitCafe where the host
supports an operation. Unsupported actions fail without changing accounts or
bypassing policy. `review_threads` reads conversations; `review_submit` publishes
feedback; `review_edit` updates review metadata. Publish or merge only when the
user authorizes it. A successful merge request can still be queued: use the
observed review state, and retry a failed refresh without repeating the mutation.
