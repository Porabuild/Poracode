---
name: terminal-inspection
description: "Read what the user's Terminal panel is actually printing and report the evidence."
---

# Terminal

The user is pointing at the integrated Terminal panel they opened for this worktree — a dev server, a test run, a build. Not your own TUI, not an agent thread, not a chat transcript, not a file with that name.

## Find the pane

Call `list_terminals` and nothing else. It resolves the caller's project and worktree on its own, so there is no id to
ask the user for and no reason to call `get_current_thread`, `list_threads`, or `read_thread` first.

Panes come back oldest to newest. One pane: read it. Several: start with the newest that has `outputLength > 0`, then
go older only if the evidence you need is missing. `outputLength` counts what that live shell has emitted — it is not
the content and not a quality signal.

## Read it

Call `read_terminal` with a `terminalId` returned by the list. Never pass a `threadId`.

Read for the answer, not for volume. A failing run usually has one first real error and a long tail of consequences —
find the first one. A dev server usually answers "is it up, on which port, with what warnings".

## When there is nothing

No panes: say no running Terminal panel is attached to this worktree. Do not fall back to the agent's own scrollback or
a chat transcript and present that as the terminal.

Zero output: say the pane is running but has not printed anything yet. That is a real answer.

## Report

Quote the lines that carry the answer and name the `terminalId` they came from. Separate what the pane printed from
what you concluded. Never echo tokens, keys, or connection strings that scrolled past, and do not paste the entire
scrollback when a dozen lines settle the question.
