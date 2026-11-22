---
name: app-controls-parity
description: Add or update Poracode MCP tools that mirror app actions. Use when comparing MCP with the UI, changing thread launch or worktree options, or updating the app-controls catalog.
---

# App-controls parity

Trace the UI action from its submitted values to the owner that applies the
effect. Check desktop, browser/PWA, iOS, and Android counterparts for host-owned
changes. Separate the command's user inputs from UI navigation, generated
identities, and transport metadata.

- Reuse the shared command schema, defaults, and owning service. The MCP adapter
  may resolve omitted values, translate an existing tool format, or fill in a
  host-owned identity. Keep scope and capability checks at the owner.
- Use `defineAppControlTool` in `src/host/app-controls/mcp/defineTools.ts` to
  derive both the MCP JSON schema and dispatch validator. Use `pick`, `omit`,
  and `extend` to adapt the shared public schema at the tool boundary.
- Register the tool in its `DOMAIN_ENTRIES` domain in
  `src/host/app-controls/mcp/toolRegistry.ts` and in
  `BUILT_IN_MCP_SERVER_TOOL_NAMES` for the app's permission controls. Only
  high-frequency hot-path operations belong in `DIRECT_TOOL_NAMES`; all other
  operations are discovered via `poracode_discover` and dispatched through
  `poracode_read` (read-only) or `poracode_run` (mutating). Shared nested
  sub-schemas (composer config, selection bindings, segments, forge accounts)
  are compacted centrally in `src/host/app-controls/mcp/wireSchemas.ts`. Update
  the shipped `app-controls` skill and follow the
  [bundled plugin versioning rule](../../docs/versioning.md#bundled-plugin-versions)
  when the catalog or guidance changes.
- Add its effect to `src/host/app-controls/mcp/toolAnnotations.ts`. MCP
  advertises hints for the whole schema. For a multi-action tool, inspect
  every action and advertise the strongest potential effect.
- Prove discovery and effects. Check `tools/list`, the actual handler, false
  values and omitted defaults, older requests, and one matching app action.
  Exercise both host compositions when the action is host-owned.
  When a client caches an editable view, verify that it can observe external
  changes and that a stale save cannot overwrite a newer host edit.
- Give agents the relevant scope, supported options, and continuation fields
  in the tool schema and description. Keep shared workflow guidance in the
  shipped skill. For large read results, offer a bounded page and preserve the
  existing response when callers omit the new inputs.

## Thread entry points

| App action                                                    | MCP entry point                                        | Shared boundary                                                                                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Start in project, new worktree, or existing worktree          | `create_thread`                                        | Thread composer config, worktree creation options, registered checkout validation, supervisor launch, and host worktree preparation |
| Submit a message                                              | `send_to_thread`                                       | Thread input and prompt segments plus host resume when needed                                                                       |
| Rename, group, mark done, pin, archive, or file a Home thread | `update_thread`                                        | Thread metadata commands                                                                                                            |
| Reopen, manage follow-ups or edit a goal                      | `reopen_thread`, `thread_follow_ups`, `thread_goal`    | Host reopen and live provider runtime procedures                                                                                    |
| Inspect or restore file and conversation checkpoints          | `list_thread_checkpoints`, `restore_thread_checkpoint` | Backend compound checkpoint journal                                                                                                 |
| Page structured transcript items, item details, or turns      | `read_thread_history`                                  | Fenced host readers, exact continuation cursors, byte budgets, and durable history notices                                          |
| Fork or delete a conversation                                 | `fork_thread`, `delete_thread`                         | Durable thread commands used by interactive clients                                                                                 |
| Remove a checkout and its linked conversations                | `delete_worktree_group`                                | Complete group membership check, thread custody, cleanup scripts, and Git worktree removal                                          |
| Move a thread into a new worktree                             | `move_thread_to_worktree`                              | Confirmed retirement, Git checkout and optional change transfer, catalog assignment, and host reopen                                |
| Continue in another provider                                  | `handoff_thread`                                       | Shared handoff strategy and context formatting, host provider switch and replacement launch                                         |
| Move a thread to another machine                              | `thread_transfer`                                      | Existing paired desktop client selects and streams to the destination. The source host confirms archive after commit                |
| Reorder projects, threads and thread blocks                   | `reorder_project`, `reorder_thread`                    | Relative catalog transactions and bounded membership publication                                                                    |
| Unload a runtime                                              | `stop_thread`                                          | Supervisor close. Pane dismissal is owned by the interactive client                                                                 |

CLI conversation discovery and import use `list_importable_sessions` and
`import_session` with the app's filters, project selection, and transcript
replay. The owning host checks the provider's store and coalesces overlapping
imports.

`thread_context` uses the host’s usage reads, handoff transcript formatting,
provider extraction and cancellation. Pending request previews reuse the app’s
snapshot recovery parser and report user prompts with the thread’s live status.
Detailed previews use the same form parsers as the thread panel and expose
the visible question and field contracts.
Live replies bind the parent thread and request incarnation before dispatch.
Forwarded prompts reuse the subagent run's owner and request routing.

Project Notes use `get_project_notes` and `update_project_notes`. Desktop,
web/PWA, iOS, and Android share the host revision check. Once a project has a
guarded save, older clients may read it and cannot replace it without a revision.

`manage_memory` uses Memory Settings entry fields and the paired catalog's
host validation. MCP requires a verified calling thread, binds project
operations to its scope, and preserves incognito mode.
The same tool uses the Memory Settings Dream and undo commands, the composer's
thread mode command, and the Skills panel's suggestion actions. Dream runs
coalesce across entry points, and suggestion decisions use exact pending IDs.
Memory sync delegates to the desktop client that owns the existing paired
grants and uses the same sync function as **Sync now**.

`manage_experiment` uses the owning desktop's experiment authority for reads,
rename, and manual crown selection. Mutations preserve the store-wide revision
check and notify the desktop projection. Stats use the stored candidate checkout
and base commit.
Launch, judge, merge, publication, and cleanup use the desktop's existing
workflows after private-port admission. The host claims an operation receipt
before dispatch. Judge cancellation uses the existing supervisor procedure.

`list_local_ports`, `open_local_port`, and `close_local_port` use the owning
desktop's Ports panel service. Close retains exact process identity validation.

Model routing and account controls use the existing supervisor operations.
`manage_model_providers` forwards revision-checked edits, preserves a stored
endpoint when an edit omits it, and keeps credentials write-only.
`manage_provider_credentials` exposes display accounts and exact removal IDs.
`manage_provider_plugins` uses provider-native package management and requires
an exact package target for changes.
`manage_provider_auth` uses the supervisor's sign-in and sign-out procedures.
Terminal sign-in opens the owning desktop's login overlay for the user.
Provider installation and hooks use the supervisor's existing registry,
updater and hook operations.
Provider profiles use the settings owner's guarded writes, the app's
environment sealing and dependency validation, and atomic removal of
profile-scoped settings.

Project composer settings use `get_project` and `set_project_draft_config`
over the host's narrow catalog command. `list_installed_agents` projects
provider options with the same presentation and project-environment helpers
as the New Thread composer.

Integrated workspace shells use `manage_terminal`. Launch reuses the app's
supervisor shell start. Other actions bind the checkout at the supervisor
before accessing the PTY. Tab focus and layout belong to the client.
`project_action` launches saved scripts through the same supervisor PTY.
Host-started action runs expose their terminal identity, output, exit status
and confirmed close independently of a client window.

`git_sync` uses the same supervisor fetch, pull, push, and compound sync
operations as the Git panel. `merge_worktree` accepts the panel's
stash preservation and recovery inputs for a registered checkout.
`git_repository` and `git_branch` reuse Git initialization, remote
registration, and branch commands. `create_worktree` reuses the supervisor
checkout and the project's host placement and copy settings.
`git_file_content` reads the Git panel's HEAD, index, or working-tree
comparison through the existing host procedure. Each side pages independently.
`generate_commit_message` and `generate_pr_summary` use the app's one-shot
generators with the same project scope, explicit model selection, language,
and branch-range inputs.
`review_manage` reuses the account-scoped forge commands for labels,
reviewer assignments, viewed files, comment edits, reactions, and inline
reviews. Writes use command receipts through the owning host.
`remove_worktree` checks the selected registration and open threads before
passing the app's force and branch-deletion choices to the Git supervisor.

Thread transfer uses established desktop client grants for both hosts. The
standalone host does not own the browser's paired connections. Native clients
can open transferred threads through their existing paired catalog.
Window placement, pane focus, and local draft editing are client actions.
