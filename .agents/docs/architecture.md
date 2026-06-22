# Architecture & Code Organization

## Layers

- `src/main/`: Electron shell (`main.ts`), context-isolated preload bridge (`preload.ts`), SQLite database (`db.ts`, `db.schema.ts` via Drizzle ORM + better-sqlite3).
- `src/supervisor/`: Forked Node process owning all agent PTY sessions, git operations, terminal log persistence, agent status caching, and commit message generation. Entry point: `index.ts` (IPC dispatcher that trusts pre-validated payloads — Zod validation runs caller-side in the main process before dispatch, not in the supervisor).
- `src/renderer/`: React 19 + HeroUI v3 + xterm.js. Zustand stores for state; a couple persist to SQLite via the preload bridge (`appStore`, `threadTodoDockStore`), several persist to `localStorage`, and many are ephemeral — see the State Management table for the per-store breakdown.
- `src/shared/`: Zod schemas, TypeScript types, IPC contracts (`ipc.ts`), and pure helpers (ANSI stripping, WSL path utilities, worktree path computation, theme resolution, agent status filtering).

## IPC Architecture

The main process forks the supervisor as a child process. Communication is UUID-keyed request/reply over `process.send()` + `process.on("message")`. The supervisor also emits fire-and-forget events (thread output, state changes, agent statuses) that the main process forwards to the renderer via `webContents.send` (received in the renderer through `ipcRenderer.on`).

The preload bridge (`window.lightcode`) wraps all IPC into typed async methods defined by the `LightcodeBridge` type, declared in `src/shared/ipc/bridge.ts` and re-exported via the `src/shared/ipc.ts` barrel.

## State Management

Zustand stores in `src/renderer/state/`. Each cross-cutting UI domain owns its own store — do not broaden an existing store to cover a new concern.

| Store                       | Persisted | Purpose                                                                                               |
| --------------------------- | --------- | ----------------------------------------------------------------------------------------------------- |
| `appStore`                  | SQLite    | Projects, threads, panes, agent statuses, pending server requests, draft config                       |
| `gitStore`                  | Local     | Per-project/per-worktree git status, PR data, branch lists, source info (snapshot restored on launch) |
| `devTerminalStore`          | No        | Shell session tabs, active project/worktree, per-tab activity tracking                                |
| `panelStore`                | Local     | Settings/project-settings open state, git+files side-panel context, right-panel tab                   |
| `fileEditorStore`           | No        | Editor tabs, active path, preview tab, dirty buffers                                                  |
| `projectTreeStore`          | No        | File tree expanded/loading paths, directory entries cache, drop target, committed search              |
| `sharedSettingsStore`       | Local     | Theme mode, commit/title/conflict generation provider/model/effort                                    |
| `agentStatusesStore`        | Local     | Per-environment (Windows/WSL) agent install + auth status                                             |
| `updateStore`               | No        | Auto-update phase, version, download progress                                                         |
| `worktreeDeleteStore`       | No        | Ephemeral UI state for worktree delete confirmation                                                   |
| `browserPanelStore`         | No        | Browser-MCP panel state + pending picker attachments                                                  |
| `loginTerminalStore`        | No        | One-shot login terminal session (TUI auth overlay)                                                    |
| `projectRootNamesStore`     | No        | Cached top-level entry names per project root (mention/path resolution)                               |
| `providerUsageStore`        | No        | Per-provider usage snapshots streamed from the supervisor                                             |
| `pullFromSourceDialogStore` | No        | Ephemeral state for the "pull from source branch" dialog                                              |
| `sidebarOverlayStore`       | Local     | Sidebar overlay/collapse mode + transition suppression                                                |
| `sidebarUiStore`            | Local     | Collapsed projects/worktrees, thread-list limits, inline rename state                                 |
| `threadSubAgentDockStore`   | No        | Per-thread dismissed sub-agent dock items                                                             |
| `threadTodoDockStore`       | SQLite    | Thread todo dock placement + collapsed state                                                          |
| `usageLoginStateStore`      | No        | Per-provider "login secret stored" flags from the main process                                        |
| `workflowRunStore`          | No        | Shared poller for the workflow manifest (sub-agent counters)                                          |

Components connect to stores directly — avoid prop drilling. Subscriptions must be **narrow and primitive-returning** (see `editing-rules.md` → Store Subscriptions & Render Isolation). Per-entity boolean/string hooks (`useIsTabActive(path)`, `usePrState(key)`, `useIsPathExpanded(path)`) are the default pattern; whole-object subscriptions are banned on hot paths.

Companion selector modules (`fileEditorSelectors.ts`, `gitSelectors.ts`, `hooks/uiSelectors.ts`) house derivations keyed on store-array identity via the `createArrayKeyedMap` helper in `state/derivations.ts` — first caller builds O(N), subsequent callers are O(1) until the store replaces the array (the underlying `WeakMap` releases memory automatically).

## Build Pipeline

| Target       | Tool              | Entry                     | Output                     | Format                                                                     |
| ------------ | ----------------- | ------------------------- | -------------------------- | -------------------------------------------------------------------------- |
| Renderer     | Vite 8 (Rolldown) | `src/renderer/main.tsx`   | `dist/renderer/`           | ESM, manual chunks (xterm, git-diff, monaco, shiki, ui, framework, vendor) |
| Main process | tsdown            | `src/main/main.ts`        | `dist/main/main.cjs`       | CJS, Node 24                                                               |
| Preload      | tsdown            | `src/main/preload.ts`     | `dist/main/preload.cjs`    | CJS, Node 24                                                               |
| Supervisor   | tsdown            | `src/supervisor/index.ts` | `dist/main/supervisor.cjs` | CJS, Node 24                                                               |
| Distribution | electron-builder  | —                         | `release/`                 | NSIS (Win), AppImage+deb (Linux), DMG (macOS)                              |

Native modules (`node-pty`, `better-sqlite3`, `electron`) are excluded from bundling and unpacked from ASAR.

## Database

SQLite via Drizzle ORM (`src/main/db.ts`, `db.schema.ts`). Drizzle tables: `projects`, `threads`, `appState`, `projectNotes`, `threadRuntimeItems`, `threadContextUsage`, `threadCompletedTurns`. Plus `usage_events`, created via raw `CREATE TABLE` DDL in `db.ts` rather than the Drizzle schema. The renderer reads/writes through preload bridge methods (`dbGetProjects`, `dbUpsertThread`, `dbSyncAll`, etc.). Zustand persistence uses a custom `dbStorage` backend.

## Git Integration

`src/supervisor/git.ts` runs git directly via `execFile` (`node:child_process`) — no `simple-git` dependency — with location-aware path resolution (Windows native runs locally; WSL projects route through a bridge client). Operations: status, diff (single + batch), stage/unstage/revert, commit, branch listing, fetch, worktree CRUD.

Commit message generation (`src/supervisor/commitMessageGenerator.ts`) spawns a one-shot agent CLI call with a conventional-commits prompt piped to stdin. Falls back across providers if the preferred one fails.

Worktree paths are computed within a centralized directory (`~/.lightcode/worktrees/<repo-id>/<branch-id>`) via `src/supervisor/git.ts` and `src/shared/worktree.ts`.
