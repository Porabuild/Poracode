---
name: app-controls
description: Inspect and drive Poracode itself — the Terminal panel, other threads, projects, workspaces, Git, pull requests, schedules, plugins, skills, and MCP servers — through the poracode MCP. Use when the request is about the user's workspace state or app-side actions rather than editing files in the repository.
---

# Poracode

Use Poracode's `poracode` MCP when the task is about the running app rather than the code in front of you: what a Terminal pane is printing, what another thread is doing, the project's git or pull-request state, or the user's schedules and settings. Prefer ordinary file and shell work for anything that is really a code change.

Hot-path tools (`get_current_thread`, `list_threads`, `get_thread`, `read_thread`, `create_thread`, `send_to_thread`, `wait_for_thread`, `update_thread`, `stop_thread`, `list_terminals`, `read_terminal`, `list_projects`, `search`, `git_status`, `git_diff`, `git_stage`, `git_commit`, `git_sync`, `gh_list_prs`, `gh_get_pr`) are advertised directly. Every other operation named below is **not** a bare top-level tool: call `poracode_discover` (by `domain`, `query`, or `operations`) to inspect names and input schemas, then pass that operation name as `operation` to `poracode_read({ operation, params })` (read-only) or `poracode_run({ operation, params })` (mutating).

Schedule results are persistent: use `list_schedule_run_inbox` with `filter`, optional
`search`, and a `cursor` from the last row (`startedAt|id`) to review older results.
Use `mark_schedule_run_read`, `mark_schedule_run_unread`, `archive_schedule_run`,
and `restore_schedule_run` to triage them. `cancel_schedule_run` also cancels
pending retry delays; a thread cannot cancel its own active run.
`create_schedule` and `update_schedule` accept `automation` for heartbeat mode,
bounded retries, missed-run handling, run limits, and an optional completion
condition. Pass `projectId` to choose the target or `null` for Home and pass
`config` for the complete model selection. Heartbeats require a same-project,
same-agent GUI conversation. Use `pr_watch` for PR-watch configuration and
`github_actions` for workflows and runs. Confirm with the user before enabling
automated fixes or merging, or changing a workflow run.

`create_thread` inherits the New thread page's plugin/MCP defaults. Override
`browserMcp`, `crossagentMcp`, `chromeMcp`, `computerUse`, `mcpServerOverrides`,
and `pluginOverrides` inside `config`. These choices are per thread and survive
resume; global hard disables and provider/platform restrictions still apply.
Discover custom server ids with `list_mcp_servers` (pass the target `projectId`)
and installed plugin names with `list_plugins`. Attach files or images to the
first message with `segments: [{kind: "attachment", path, mimeType?}]`; paths
must be absolute files on this host, and image MIME types are inferred from
their extension.

Custom MCP servers are global (shared settings) or belong to one project; a
project server overrides a global one with the same name in that project. The
`*_mcp_server` tools take `scope: "global" | "project"` and `projectId`; project
scope defaults to the calling thread's project, and the Home project has none.
`list_mcp_servers` shows both scopes and marks overrides; `move_mcp_server`
moves a server between them with its secrets. When the user asks for a server
"in this project", use project scope. `authenticate_mcp_server` starts OAuth for
an HTTP/SSE server: give the user the returned `authorizationUrl`, then poll with
`action: "wait"` and the `flowId`. Projects also switch installed Agent Plugins
with `update_project` `plugins` (`null` follows the global state); the thread's
own `plugins` choices still win.

For a marketplace request, use `list_plugins` to check packages already on the
host and `list_plugin_catalogs` with a query to search available packages by
name, description, or category. If any relevant catalog appears in
`unrefreshedCatalogIds`, refresh it with `manage_plugin_catalog` and search
again. Pass the catalog ID and exact entry name to `inspect_plugin_package`.
Describe the source and the included skills and MCP servers to the user, then
pass the reviewed digest to `install_plugin` once they authorize that package.
Use `action: "update"` for an upgrade and inspect again if the digest changes.

Use `configure_plugin` for plugin and contribution switches on this host, and
`update_project` for a project-wide override. For a plugin's OAuth connection,
call `manage_plugin_accounts` with `action: "begin"`, the declared server name,
and the user’s account label. Give the user the authorization URL and poll
with `action: "wait"`. Use `remove_plugin_package` only with authorization to
remove both its files and service accounts. On older hosts, check the live
MCP tool list before offering marketplace actions.

Use `list_skill_marketplace` and `install_marketplace_skill` for marketplace
skills. Use `import_skill` to copy or link a skill from disk, and
`remove_skill` only for mutable skills the user authorized removing.
Use `discover_mcp_servers` to find external editor or agent configurations and
`import_mcp_server` to import a reviewed candidate into Poracode. Continue to
use `list_mcp_servers` for configurations already saved in Poracode.

`create_project` registers an existing folder. The separate
`create_project_directory` and `clone_project` tools create a folder or checkout.
`relocate_project` retargets an existing project. `remove_project` removes saved
project data, including threads, and must run from another project or Home.
`remove_workspace` removes a grouping, leaving the projects and threads unfiled.

To launch in the same worktree as the caller, call `get_current_thread` and pass
its `projectId` and `worktreePath` as `existingWorktreePath`. Use
`list_worktrees` to choose another registered checkout. If you pass
`worktreeBranch` with an existing path, the host verifies that the branch
still matches.

For a new worktree pass `worktreeIsNewBranch: true`. You may choose
`worktreeBranch`, `worktreeBaseBranch`, and `worktreeTransferUncommitted`.
The transfer option copies changes and keeps them in the source checkout.
Check `changesTransferred` when the user requests a copy. Older hosts use
`worktree: {enabled: true, branch?}`. The launcher assigns the checkout
before the agent starts. Use the returned `worktreePath` for Git operations
and tell the agent to work in its assigned checkout.

Use `presentationMode` and `config` for the same launch choices as the
composer. A composer config with no mode uses the host's saved preference or
a supported mode. Legacy flat choices are also accepted. Use `send_to_thread`
with `prompt`, `segments`, and optional `config` for structured input. Pass
`questionAnswer` when relaying the user's reply to a form.
`get_thread` reports the saved composer config, the live runtime config,
and any session options or slash commands advertised by the provider.
`get_project` reports `lastDraftConfig`. Use `set_project_draft_config`
to replace or clear the project’s saved composer choices. Use
`list_installed_agents` with `projectId` and `includeComposerOptions: true`
to discover supported models and options for that project's environment.
Pass `presentationMode` to inspect Chat or Terminal specifically.
`read_thread` returns message `itemId` values for `fork_thread`'s optional
`throughItemId`. A fork starts inactive in the source checkout. Before
`delete_thread`, confirm which thread and whether to remove its last-owned
worktree. Use `removeOwnedWorktree: false` to keep the checkout.

Use `delete_worktree_group` for the sidebar action that removes the checkout
and every linked conversation. List the project's threads and confirm the
exact checkout and complete set of thread IDs with the user. Include archived
threads. If the host reports a membership change, refresh the list and get
authorization for the updated set before retrying.

Use `move_thread_to_worktree` for a saved thread in its project's main
checkout. Confirm the move with the user and set `withChanges: true` only if
they want its uncommitted changes moved out of the source checkout. Use a
unique `operationKey` and reuse it to reconcile a missing response. A
`checkout_created` result gives the path of a checkout kept for recovery.
If `changesTransferred` is false, inspect the checkout and git stash before
working there. If reopening is unconfirmed, inspect `get_thread` before
reopening again.

Use `handoff_thread` for Continue in another provider. Pass the target
provider, presentation and composer `config`. Choose `intent: "fork"` to
keep the source open or `intent: "switch"` to continue it. A Chat-to-Chat
switch keeps the same thread. A switch involving Terminal opens a replacement
and marks the source done after the new launch and source exit are confirmed.
The host chooses transcript access or transfers context using the app's
handoff rules. If context preparation fails, ask before continuing with
`withoutContext: true`. Reuse the same `operationKey` after a lost response.

Use `thread_transfer` for Move to another machine from the desktop that owns
the source thread. List `destinations` for its paired projects, then
`preview` the selected project. Confirm the destination and any interruption
with the user before `move`. Choose a provider and model from the preview and
pass the target provider's composer settings
and an optional `continuePrompt`. Use `stopFirst: true` only when the user
authorized interrupting the current run. Reuse the same `operationKey` after
a lost response. The retry checks the original destination for the saved
thread and returns its ID when confirmed. A recovered result reports
whether the source is archived. Check the destination conversation before
repeating any follow-up prompt.

Use `reorder_project` and `reorder_thread` for the sidebar's manual order.
Pass the row to move, the reference row and where to place it, `before` or
`after`. For a group or worktree block, pass its thread IDs and use the first
as `threadId`. Use `scope: "catalog"` to place one thread in the flat list
across projects. Reuse the same `operationKey` after a lost response so a
completed move is replayed from its receipt.

Use `reopen_thread` to resume a thread with an empty initial prompt.
`thread_follow_ups` manages the composer queue and `thread_goal` reports or
changes the provider's latest goal. Use `thread_session_actions` to discover
provider-advertised actions and `thread_background_tasks` for live work.
Use `read_thread_history` to inspect structured transcript rows and turn
timings. For older pages, reuse the returned item cursor as `beforePosition`
or the completed-turn cursor as `cursor`. Use `action: "detail"` and the
row's `itemId` for stored bodies and streams. Report any `runtimeNotice`
when relying on the history.

Use `thread_context` for saved context or token usage, a handoff transcript,
or provider extraction from the thread’s saved session. Pass the source
model selection when the user chooses it. `cancel` requests cancellation.
`requests` reports pending approval or reply prompts so you can relay them
to the user.

Use `list_importable_sessions` for the app's CLI conversation discovery.
Filter by provider, original folder, or text. Confirm the chosen session and
destination with the user, then pass the exact path, provider ID and session
ID to `import_session` with a supported model, title, and registered project
ID. When the session's original folder still exists, use its project or
register it first. When the folder is missing, use the user's fallback
project. An imported conversation opens as an inactive Chat thread and an
already saved conversation returns its existing thread ID.

To restore files and conversation together, list
`list_thread_checkpoints`, confirm the checkpoint with the user, and reuse the
same `operationKey` on retries of `restore_thread_checkpoint`.

Use `review_manage` with the exact account and repository from
`review_repository` for the app’s review controls. List eligible labels and
reviewers before changing them. Use viewed-file fingerprints from
`viewed_files`, the original body for comment edits, and the reviewed head
commit for inline reviews. Carry the same operation key across retries of
one authorized mutation.
Use `review_list_prs` with `state` to find open, closed, or merged reviews
through the same source account.

Use `git_repository` to initialize Git or add a remote to a registered
project. Use `git_branch` with `delete` to remove an exact local or remote
branch after authorization. A local deletion uses Git's non-forcing
behavior unless the user chooses `force: true`.

Use `project_action` to list or invoke a project's saved scripts. Select the
checkout and action ID, and reuse the run's operation key after an uncertain
reply. Use the returned terminal ID to inspect status or output, or to stop
the run. An exit code of zero means the script succeeded. The owning host
tracks these runs without depending on an open terminal panel.

Use `create_worktree` to create a checkout before starting a thread. An
explicit `path` overrides the host's placement. Confirm with the user
before moving uncommitted changes and pass `keepChangesInSource: true` to
copy the edits instead. If `changesTransferred` is false, inspect the
checkout and stash before retrying. Use the returned path as
`existingWorktreePath` in `create_thread`.

Use `remove_worktree` for a registered checkout without open threads.
Confirm its path and branch, then pass `expectedBranch` from `list_worktrees`.
Choose `force` and `deleteBranch` only when the user requests those effects.
`branchDeleted` reports the observed branch outcome when deletion was requested.

Use `git_sync` with `sync` or `sync_rebase` for the Git panel's combined
operation. Both can publish commits. Inspect `pulled` and `pushed` in the
result. For a pull or pull with rebase, `preserveLocalChanges: true` uses
the app's Stash & Pull behavior.

Use `generate_commit_message` and `generate_pr_summary` to draft text from
Git changes using the host's saved Git-text preset. Pass `agentKind`,
`selection`, or `language` to choose those inputs explicitly. Automatic
selection tries available one-shot providers in the checkout's environment.
Review the resulting text before using it in a commit or pull request.

Use `merge_worktree` with `pull_from_source` and `preserveLocalChanges: true`
to carry local edits through a pull from the source branch. If a conflict
leaves a `stashCommit`, carry it as `reapplyStashCommit` when finishing or
aborting the merge after the user selects the outcome. Pass the same value
to `git_commit` when committing the merge with an explicit message.

The app's built-in MCP server and tool permission switches are user-managed
Settings controls. Use `list_mcp_servers` and `update_mcp_server` for ordinary
custom-server configuration.

Use `get_project_notes` for the full Notes document, to-dos, and revision.
Use that revision as `baseRevision` in `update_project_notes`. Keep unrelated
content in the replacement. A conflict returns the latest notes. Reconcile
the requested edit with the saved content before trying again. For a file
write, use `read_project_file` and pass its `modifiedAtMs` as
`baseModifiedAtMs` to `manage_project_file`. To inspect a small section, pass
`startLine` and `endLine` to `read_project_file`. Continue with `nextOffset`,
the same range, and the first page's `modifiedAtMs` as `expectedModifiedAtMs`.
Use `git_file_content` to read both sides of the Git panel's text comparison.
Each side has its own offset. Keep file actions in the intended project or
worktree.

For an already assigned worktree, confirm it with `get_current_thread` and
`git rev-parse --show-toplevel` before edits. Check or update a stale base in
place. Requests to work independently or "in your own new worktree" are already
satisfied by the assigned checkout. Create or switch to a different task
checkout only when the user explicitly requests a different one. If no worktree
is assigned, follow the task's request for checkout isolation. Disposable test
fixture worktrees do not replace the task checkout.

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

For large lists, pass `limit` to `list_threads`, `list_projects`, or
`list_project_files`. Continue with `nextOffset` as `offset` and keep the
same filters. Each page reflects the host's current list order.

Use `search_memory` to find a saved memory by text. Use `manage_memory` to
check status, browse saved memories, or save, edit, and delete an entry at the
user's request. A project entry defaults to the calling thread's project.
Use `includeBody: true` only when the summary is insufficient, and pass the
exact saved ID for edits or deletions.

Use `thread-mode` to change the calling thread's memory mode at the user's
request. Incognito threads stay private. Dream consolidates across the host.
Run `dream` at the user's request and pass the latest `runId` to `undo`.
Use `suggestions` with `includeBody: true` to review a proposed skill before
using `suggestion` to approve it. Approval writes the skill to disk.
Use `manage_memory` with `action: "sync"` for the desktop's **Sync now**.
It requires the owning desktop window and enabled memory sync, and uses the
desktop's existing permissions for its online paired hosts.

Use `manage_experiment` on the experiment's owning desktop. List by
`projectId` or get an exact `experimentId` to see candidates and the current
`revision`. Pass that revision to `rename` or `select_winner`. Winner
selection records a manual crown for review. Use `candidate_stats` with a
candidate's thread ID to compare its owned checkout against the experiment base.
Use `launch` with the composer prompt, local base branch and candidate
configurations. Use `judge` to compare changes or responses, and
`cancel_judge` to stop a judge. `merge_winner`, `create_pr`,
`retry_cleanup`, and `discard` mirror the desktop's actions. Obtain the
user's authorization before publishing, merging, or discarding. Supply a fresh
`operationKey` for each workflow and reuse it for a retry. If a workflow
reports failure or uncertainty, check the experiment and its Git state before
starting another operation.

Use `list_local_ports` for the desktop's listening sockets. Pass the row's
address and port to `open_local_port`. At the user's request,
`close_local_port` takes the exact address, port, PID, and process start token
from a fresh row with `canClose: true`. Stopping the process can close its
other listeners too.

Use `manage_model_providers` for a supported agent's model routes. Pass its
exact `agentKind` and `env`. List first and reuse the returned `revision`
when saving or removing a route. Omit the endpoint and API key when an edit
should preserve those values. Use `manage_provider_credentials` to list
connected accounts and sign out by exact credential ID at the user's request.
Use `manage_provider_plugins` to manage packages installed in an agent's
native plugin system.
Use `manage_provider_auth` to discover sign-in methods, start sign-in, or
sign out at the user's request. Complete desktop terminal sign-in in the
app's private login panel. Use `status` to check the result.
Use `manage_provider_installation` to search the ACP Registry, inspect saved
installations, or use the app's provider updater. Registry removal applies
across environments and stops the provider's threads. Use
`manage_provider_hooks` to inspect the bundled hooks or install or uninstall
them in a specific native or WSL environment.
Use `manage_provider_profiles` to manage saved profiles. List or get a
profile before making changes and pass its current revision. Environment
edits take only changed values and names to remove.

For a pending prompt, use `thread_context` with `action: "requests"`. Pass
the exact `requestId` and `includeDetails: true` to inspect its questions,
form fields or plan preview. Complete browser and secret prompts in the app.
To relay a user's explicit answer, read `live_requests` first. Pass that
request's `requestId` and `requestToken` to `reply`, along with the user's
option choices, question answers or form values. Inspect the live request
again after a stale-token refusal.
Forwarded subagent prompts appear on their parent thread and use the same
single-use reply tokens.

Use `manage_terminal` when the user asks to start or operate a workspace
shell, or inspect a shell in a different checkout. Omit the target to use the
calling thread's checkout. Set `projectId` to select another project's root,
or pass a registered `worktreePath` to select a worktree. Set
`worktreePath: null` to use the calling project's root. Use the shell ID from
`start` or `list` for `read`, `write`, `resize`, and `close`. Writing
sends input verbatim. Include Enter only when submitting input on the user's
behalf. Obtain authorization before submitting commands to or closing
their shell. A started shell runs on the host and can be controlled through
MCP. The user’s client manages its own Terminal tabs.

## Boundaries

For app-native charts, comparison tables, calculators, checklists, tabs, text and
relationship diagrams, use Native visuals v2 below. Existing v1 documents remain supported.
Use an HTML page (below) only for content native visuals cannot express.
Configured MCP Apps servers can supply interactive cards in GUI chat through
declared `ui://` resources and the host-managed sandbox. Do not promise app tools
or host actions from authored HTML or native visual fences. Ordinary `html`
code fences remain source examples.

### HTML pages

In a completed assistant reply, open a fenced code block with `poracode-html-v1`
followed by a plain title. Its body is one self-contained HTML document or
fragment. Desktop, web/PWA and native iOS/Android render it in a sandboxed frame
inside the conversation. Streaming, unfinished and unknown-version blocks stay
source, and viewers can always switch to the source or copy it.

- Scripts and inline styles run. The page has no access to the app, session,
  storage, cookies or host API: it cannot call tools, send messages or read the
  conversation.
- Scripts, styles, fonts, images and media load only from
  `https://cdn.jsdelivr.net`, `https://cdnjs.cloudflare.com` and
  `https://unpkg.com`. fetch/XHR/WebSocket, other hosts, frames, form submission
  and navigation are blocked; inline anything else (images as `data:` URLs).
  Submit events still fire, so handle forms in script.
- Clicked http(s) links open like other chat links; mobile asks first. Fragment
  links scroll within the page; nothing else navigates it.
- Use the app theme variables instead of fixed colors: `--background`,
  `--foreground`, `--surface`, `--surface-secondary`, `--muted` (secondary
  text), `--border`, `--accent`, `--accent-foreground`, `--success`, `--warning`,
  `--danger`, `--font-sans` and `--font-mono`. Pages follow the viewer's light or
  dark theme; leave the page background to the app.
- Height follows the content up to 2,000 px, after which the page scrolls. Do not
  size `html` or `body` with vh units or `height: 100%`.
- At most 248 KiB of UTF-8 per block and four previews per message; larger or
  later blocks show source. Search keeps only the surrounding prose and the
  title, so put the useful conclusion in the prose.

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
