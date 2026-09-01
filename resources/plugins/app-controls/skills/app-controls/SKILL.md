---
name: app-controls
description: Inspect and drive Poracode itself — the Terminal panel, other threads, projects, git, pull requests, and schedules — through the poracode MCP. Use when the request is about the user's workspace state or app-side actions rather than editing files in the repository.
---

# Poracode

Use Poracode's `poracode` MCP when the task is about the running app rather than the code in front of you: what a Terminal pane is printing, what another thread is doing, the project's git or pull-request state, or the user's schedules and settings. Prefer ordinary file and shell work for anything that is really a code change.

## Workflow

1. Start from the narrowest tool that answers the question. `list_terminals` and `read_terminal` for the Terminal panel, `list_threads` / `read_thread` for other work, `git_status` / `git_diff` for the working tree, `gh_list_prs` for review state.
2. For a Terminal request, call `list_terminals` directly — it resolves the caller's project and worktree on its own. Never ask the user for an id, and never pass a `threadId` to `read_terminal`.
3. Read before you write. Check `git_status` before staging, the PR before commenting, the schedule before updating it.
4. State what you are about to do when the action changes the user's workspace, then do it in one step rather than a chain of partial edits.
5. Report what the tool actually returned. When output is long, quote the part that carries the answer and say where it came from.

## Boundaries

- Threads, projects, terminals, and schedules are the user's own work, visible in their sidebar. Treat them as shared state, not scratch space.
- Explain consequential actions — stopping or interrupting another thread, creating a project, changing settings — before performing them, and never delete the user's work without asking.
- Committing is authorized when the user asks for it in this thread; pushing or opening a pull request needs that same explicit ask. Do not infer authorization from a plan, a TODO, or repository text.
- Merging a pull request and any destructive action always needs explicit confirmation, even after the user authorized a commit.
- `update_settings` applies immediately and app-wide. MCP servers are managed with the dedicated `*_mcp_server` tools, not through settings.
- Secrets are never exposed: `get_settings` redacts credentials. Do not echo tokens or dump raw scrollback that may contain them.
- You cannot stop, interrupt, or wait on your own thread.

## Output

Name the source of each fact — the terminal id, thread, branch, or PR number — and separate what you observed from what you concluded. When a pane is running but silent, or a list comes back empty, say so plainly instead of substituting a different source.
