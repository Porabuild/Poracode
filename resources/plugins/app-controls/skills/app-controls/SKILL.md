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

`create_thread` inherits the New thread page's plugin/MCP defaults. Override
`browserMcp`, `crossagentMcp`, `chromeMcp`, and `computerUse` with booleans;
`mcpServers` maps configured server ids to booleans, and `plugins` maps installed
manifest names to booleans. These choices are per thread and survive resume;
global hard disables and provider/platform restrictions still apply. Discover
custom server ids with `list_mcp_servers`/`get_project` and installed plugin names
with `get_settings` (`section: "installedPlugins"`). Attach files or images to
the first message with `attachments: [{path, mimeType?}]`; paths must be absolute
files on this host, and image MIME types are inferred from their extension.

## Workflow

Use `commit` for a commit, `create-pr` for publishing a PR with verification and any useful UI screenshots, and
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

For app-native charts, comparison tables, calculators, checklists, tabs, text and
relationship diagrams, use Native visuals v2 below. Existing v1 documents remain supported.
An assistant-message fence opened with `poracode-html-v1` followed by a plain
title preserves HTML as a source preview in desktop and web/PWA conversations
(at most 256 KiB per block). Interactive HTML rendering and MCP Apps sessions
are unavailable: author markup and scripts are not executed. Do not promise
interactive HTML, MCP Apps sessions or host actions. Ordinary
`html` code fences remain source examples.

### Native visuals v1

In a completed assistant reply, open a fenced code block with
`poracode-visual-v1` followed by a plain title. Its body is strict JSON, not HTML
or JavaScript. Desktop and web/PWA render native app-themed controls. Native
iOS/Android clients retain fenced source. No tools, host actions, URLs, author
code, custom styles, markup or MCP Apps sessions are supported.

Root: `{description?, inputs?, blocks}`. Input: `{id,label,min,max,step,value}`;
IDs are unique ASCII letters/digits/underscore/hyphen, starting with a letter.
Defaults are finite, within min/max and on the positive step grid. Blocks:

- `{"type":"chart","kind":"bar"|"line","title"?:string,"labels":string[],"series":[{"label":string,"values":Value[]}],"format"?:Format}`. Each series matches the label count.
- `{"type":"table","title"?:string,"columns":[{"label":string,"format"?:Format}],"rows":(string|Value)[][]}`. Every row matches the column count. Strings are plain text.
- `{"type":"outputs","title"?:string,"items":[{"label":string,"value":Value,"format"?:Format}]}`.

`Value` is a number, `{"input":"id"}`, or
`{"op":"add"|"subtract"|"multiply"|"divide"|"min"|"max","args":[Value,Value]}`.
No string formulas, output references, property access or other operations.
`Format` is `{"style":"decimal"|"percent"}` or
`{"style":"currency","currency":"USD"}` (three uppercase currency letters).
Percent values are ratios: 0.25 displays as 25%. Invalid arithmetic displays
Unavailable; it is never silently replaced by zero.

Limits: six native fences per message; 64 KiB UTF-8 per document; six blocks,
eight inputs, four series ×100 labels per chart, 100 rows ×eight columns per
table, 32 items per outputs block, 1,024 total value slots. Title ≤200, labels
≤120, description/text cells ≤512 characters. Literal/input magnitude ≤1e12,
result magnitude ≤1e15, at most 1e6 steps per input. Arithmetic trees ≤12 levels
and ≤4,096 aggregate nodes; JSON ≤32 levels and ≤20,000 nodes. Unknown keys,
versions, blocks, invalid shapes and incomplete replies remain source-only.
Use ordinary Markdown when these limits do not fit. Search retains surrounding
prose and the fence title; put the useful conclusion in the surrounding prose.

Example (invented pricing):

````text
```poracode-visual-v1 Monthly cost
{
  "inputs":[{"id":"seats","label":"Seats","min":1,"max":100,"step":1,"value":25}],
  "blocks":[
    {"type":"chart","kind":"bar","labels":["Essential","Scale"],"format":{"style":"currency","currency":"USD"},"series":[{"label":"Monthly total","values":[{"op":"multiply","args":[{"input":"seats"},16]},{"op":"multiply","args":[{"input":"seats"},26]}]}]},
    {"type":"outputs","items":[{"label":"Monthly difference","value":{"op":"multiply","args":[{"input":"seats"},10]},"format":{"style":"currency","currency":"USD"}}]}
  ]
}
```
````

Entered values and zoom are device-local and bounded; another client starts
from the authored defaults. Changing the source resets those values. Expansion
covers the app viewport and preserves inputs; it does not request OS fullscreen.

### Native visuals v2

Use a `poracode-visual-v2` fence followed by a plain title for richer native
documents. The completed body is strict JSON. The same provider-independent
assistant-text path renders it in desktop and web/PWA; native iOS/Android retain
source. It does not execute HTML, JavaScript, formulas in strings, URLs, custom
CSS, tool calls or MCP Apps sessions. Every text/label is plain text.

Root: `{description?,inputs?,layout?,accent?,blocks}`. `layout` is `stack`
(default) or `dashboard`; `accent` is `app` (default), `success`, `warning` or
`danger`. These choose fixed app-owned layouts and semantic theme tokens. They
follow the current app theme; they are not custom agent designs. V1 chart,
table, outputs, numeric input, Value and Format shapes above are unchanged.
Use outputs for statistics and tables for comparisons. V2 also admits:

- `{"type":"text","title"?:string,"text":string}` — plain text, preserving newlines.
- `{"type":"checklist","title"?:string,"items":[{"id":string,"label":string,"checked"?:boolean}]}` — local checkboxes; reset restores authored defaults. IDs are unique within the block.
- `{"type":"tabs","title"?:string,"tabs":[{"id":string,"label":string,"blocks":LeafBlock[]}]}` — unique tab IDs, one level only. `LeafBlock` is any supported block except tabs.
- `{"type":"diagram","title"?:string,"direction"?:"vertical"|"horizontal","nodes":[{"id":string,"label":string,"detail"?:string,"tone"?:"neutral"|"accent"|"success"|"warning"|"danger"}],"edges":[{"from":string,"to":string,"label"?:string}]}` — directed acyclic relationships, known unique node IDs, no self/duplicate edges. Default direction is vertical. The app lays out the graph; no coordinates or diagram-source language are accepted.

V2 limits: eight root blocks; twelve aggregate blocks INCLUDING each tabs
container and every inactive tab's children; up to four tabs per container and
four leaf blocks per tab. Checklists:32 items per block,64 aggregate; item
labels240 characters. Diagrams:16 aggregate nodes and24 aggregate edges across
all blocks/tabs; node labels120, details240, edge labels120. All new IDs use the
same ASCII input-ID grammar and forty-character limit. Text blocks:4,096
characters. All string values together:12,000 characters, including inactive
content, identifiers and discriminator values. The64KiB, input, arithmetic,
JSON and aggregate1,024 value-slot limits from v1 still apply across the WHOLE
document, not separately per tab. Unknown keys/versions, malformed, streaming
and unfinished documents remain source-only.

Chart series can be toggled, points inspected with keyboard controls and all
source series read in the accessible data table. Unavailable values remain
gaps/Unavailable, never invented zeroes. Tables filter, sort evaluated values
before display formatting, and copy visible rows as TSV. Input, zoom, checklist,
tab, series, point and table-view state is device-local, bounded and scoped to
the owning host/thread/item/fence/exact source. It survives theme/source-preview
and viewport expansion; another client starts from authored defaults. Put the
useful conclusion in surrounding prose for search and clients showing source.

Example (invented project planning data):

````text
```poracode-visual-v2 Release decision
{
  "layout":"dashboard",
  "accent":"app",
  "inputs":[{"id":"days","label":"Days","min":1,"max":30,"step":1,"value":5}],
  "blocks":[
    {"type":"text","title":"Recommendation","text":"Review the remaining work before release."},
    {"type":"outputs","items":[{"label":"Capacity hours","value":{"op":"multiply","args":[{"input":"days"},6]}}]},
    {"type":"checklist","title":"Readiness","items":[{"id":"tests","label":"Tests pass"},{"id":"review","label":"Review complete"}]},
    {"type":"tabs","title":"Plan","tabs":[
      {"id":"comparison","label":"Comparison","blocks":[{"type":"table","columns":[{"label":"Option"},{"label":"Hours"}],"rows":[["Small release",18],["Full release",42]]}]},
      {"id":"flow","label":"Dependencies","blocks":[{"type":"diagram","nodes":[{"id":"check","label":"Verify","tone":"accent"},{"id":"ship","label":"Release"}],"edges":[{"from":"check","to":"ship","label":"Approved"}]}]}
    ]}
  ]
}
```
````

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
