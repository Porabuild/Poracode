# Architecture & Code Organization

## Layers

- `src/main/`: Electron shell (`main.ts`), context-isolated preload (`preload.ts`), native OS integrations, and the backend child-process client. This directory also contains reusable server modules for database, remote HTTP/WS, SSH, and supervisor transport. Their directory name does not imply that they execute in Electron main.
- `src/backend/`: Shared `BackendHostCore` owns SQLite persistence and a lazily started supervisor. `index.ts` is the desktop backend child-process entry; `BackendDesktopServices` composes remote access and native-service callbacks. `BackendDurableServices` contains services reused by desktop and standalone hosts.
- `src/server/`: Standalone Node CLI and headless host composition, plus the optional relay. The standalone host instantiates the same backend core and remote server without Electron.
- `src/supervisor/`: Forked Node process owning provider runtimes, real PTYs, Git operations, terminal log persistence, agent discovery, and one-shot generation. Entry point: `index.ts`. Provider payload parsing stays inside provider adapters; shared consumers receive normalized contracts.
- `src/renderer/`: React 19 + HeroUI v3 + xterm.js, shared by Electron, desktop web, and mobile web/PWA. `clientRuntime.ts` declares client capabilities; the Electron transport and browser remote bridge adapt host access. Zustand holds presentation state and client projections. Some stores persist through the local backend, others in browser storage.
- `ios/` and `android/`: Independent SwiftUI and Compose clients with native transports, lifecycle, and storage. Generated remote bindings and shared fixtures enforce contract semantics; the parity ledger tracks feature coverage.
- `src/shared/`: Zod schemas, TypeScript types, IPC contracts (`ipc.ts`), and pure helpers (ANSI stripping, WSL path utilities, worktree path computation, theme resolution, agent status filtering).

## Process and transport boundaries

Electron main forks `backendHost.cjs` through `BackendHostClient`; the backend starts `supervisor.cjs` when needed. Standalone `server.cjs` owns the backend core in its own process and starts the same supervisor. Only the supervisor may spawn an agent runtime or own its PTY.

The desktop renderer has an authenticated loopback WebSocket to `BackendRendererStream` for supported requests and live events. Preload IPC remains the bootstrap/native-service boundary and a fallback transport. Backend/main request/reply uses the versioned `backendHostProtocol`; supervisor calls use the typed procedure map in `src/shared/ipc/`. Browser/PWA and native clients use authenticated remote HTTP plus ordered WebSocket events.

The preload bridge (`window.poracode`) exposes typed async methods defined by `PoracodeBridge` in `src/shared/ipc/bridge.ts`. Backend operations validate procedure schemas before dispatch. Every independently updated wire peer must satisfy the compatibility gate documented in [Versioned State & Protocols](versioning.md).

The direct stream does **not yet** establish complete main-process isolation: the desktop backend also forwards interested events through main for IPC consumers, and renderer windows deduplicate sequence-tagged copies. Browser runtime JSON parsing, state reduction, and much persistence still execute on the UI thread. These are current implementation facts; the worker and transport changes in [the V4 merge plan](../../docs/V4_MERGE_READINESS_PLAN.md) are pending work, not performance guarantees. Measure the real clients before claiming a frame-rate or latency budget.

## State Management

Zustand stores in `src/renderer/state/`. Each cross-cutting UI domain owns its own store — do not broaden an existing store to cover a new concern.

| Store                       | Persisted                                     | Purpose                                                                                               |
| --------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `appStore`                  | Backend SQLite locally; localStorage fallback | Client project/thread projections, panes, draft config and runtime view state                         |
| `gitStore`                  | Local                                         | Per-project/per-worktree git status, PR data, branch lists, source info (snapshot restored on launch) |
| `devTerminalStore`          | No                                            | Shell session tabs, active project/worktree, per-tab activity tracking                                |
| `panelStore`                | Local                                         | Settings/project-settings open state, git+files side-panel context, right-panel tab                   |
| `fileEditorStore`           | No                                            | Editor tabs, active path, preview tab, dirty buffers                                                  |
| `projectTreeStore`          | No                                            | File tree expanded/loading paths, directory entries cache, drop target, committed search              |
| `sharedSettingsStore`       | Local                                         | Theme mode, commit/title/conflict generation provider/model/effort                                    |
| `agentStatusesStore`        | Local                                         | Per-environment (Windows/WSL) agent install + auth status                                             |
| `updateStore`               | No                                            | Auto-update phase, version, download progress                                                         |
| `worktreeDeleteStore`       | No                                            | Ephemeral UI state for worktree delete confirmation                                                   |
| `browserPanelStore`         | No                                            | Browser-MCP panel state + pending picker attachments                                                  |
| `loginTerminalStore`        | No                                            | One-shot login terminal session (TUI auth overlay)                                                    |
| `projectRootNamesStore`     | No                                            | Cached top-level entry names per project root (mention/path resolution)                               |
| `providerUsageStore`        | No                                            | Per-provider usage snapshots streamed from the supervisor                                             |
| `pullFromSourceDialogStore` | No                                            | Ephemeral state for the "pull from source branch" dialog                                              |
| `sidebarOverlayStore`       | Local                                         | Sidebar overlay/collapse mode + transition suppression                                                |
| `sidebarUiStore`            | Local                                         | Collapsed projects/worktrees, thread-list limits, inline rename state                                 |
| `threadSubAgentDockStore`   | No                                            | Per-thread dismissed sub-agent dock items                                                             |
| `threadTodoDockStore`       | Backend SQLite locally; localStorage fallback | Thread todo dock placement + collapsed state                                                          |
| `usageLoginStateStore`      | No                                            | Per-provider "login secret stored" flags from the main process                                        |
| `workflowRunStore`          | No                                            | Shared poller for the workflow manifest (sub-agent counters)                                          |

Components connect to stores directly — avoid prop drilling. Subscriptions must be **narrow and primitive-returning** (see `editing-rules.md` → Store Subscriptions & Render Isolation). Per-entity boolean/string hooks (`useIsTabActive(path)`, `usePrState(key)`, `useIsPathExpanded(path)`) are the default pattern; whole-object subscriptions are banned on hot paths.

Companion selector modules (`fileEditorSelectors.ts`, `gitSelectors.ts`, `hooks/uiSelectors.ts`) house derivations keyed on store-array identity via the `createArrayKeyedMap` helper in `state/derivations.ts` — first caller builds O(N), subsequent callers are O(1) until the store replaces the array (the underlying `WeakMap` releases memory automatically).

## Build Pipeline

| Target            | Tool                               | Entry                     | Output                      | Format                                                                     |
| ----------------- | ---------------------------------- | ------------------------- | --------------------------- | -------------------------------------------------------------------------- |
| Renderer          | Vite 8 (Rolldown)                  | `src/renderer/main.tsx`   | `dist/renderer/`            | ESM, manual chunks (xterm, git-diff, monaco, shiki, ui, framework, vendor) |
| Main process      | tsdown                             | `src/main/main.ts`        | `dist/main/main.cjs`        | CJS, Node 24                                                               |
| Backend host      | tsdown                             | `src/backend/index.ts`    | `dist/main/backendHost.cjs` | CJS, Node 24                                                               |
| Preload           | tsdown                             | `src/main/preload.ts`     | `dist/main/preload.cjs`     | CJS, Node 24                                                               |
| Supervisor        | tsdown                             | `src/supervisor/index.ts` | `dist/main/supervisor.cjs`  | CJS, Node 24                                                               |
| Standalone server | tsdown                             | `src/server/cli.ts`       | `dist/main/server.cjs`      | CJS, Node 24                                                               |
| Relay             | tsdown                             | `src/server/relay/cli.ts` | `dist/main/relay.cjs`       | CJS, Node 24                                                               |
| Browser/PWA       | Vite (`PORACODE_BUILD_TARGET=web`) | `src/renderer/main.tsx`   | `dist/web/`                 | ESM + service worker                                                       |
| Distribution      | electron-builder                   | —                         | `release/`                  | NSIS (Win), AppImage+deb (Linux), DMG (macOS)                              |

Native modules are external to the JavaScript bundles. Current SQLite and PTY packages use N-API; staging must still select valid binaries for the platform/architecture and preserve the full dependency closure and asset paths. See `scripts/ensure-native-deps.mjs`, `scripts/prepare-server-native.mjs`, and the SSH runtime manifest.

## Database

SQLite uses `better-sqlite3` directly. `src/main/db.ts` is a barrel; `src/main/db/connection.ts` opens the database and runs the schema migration/validation gate. Domain modules own projects, threads, runtime items/streams, usage, and operation journals. `BackendHostCore` passes supervisor events to persistence before client projection. Runtime stream writes can remain queued until the write window, a reader, or close flushes them; delivery does not prove a disk commit. Electron main uses async backend access, including `BackendStateStore` for prefetched native window state.

`src/renderer/state/dbStorage.ts` maps local app-store persistence to backend row operations and coalesces queued writes. Without a local-backend capability it uses localStorage; remote mutations are performed through the authenticated remote bridge. Cached client state must never become authority after reconnect. Exclusive data-root ownership, shared settings writes, and shutdown ordering are explicit V4 gates; do not infer safe concurrent host ownership from SQLite locking alone.

## Git Integration

`src/supervisor/git.ts` runs git directly via `execFile` (`node:child_process`) — no `simple-git` dependency — with location-aware path resolution (Windows native runs locally; WSL projects route through a bridge client). Operations: status, diff (single + batch), stage/unstage/revert, commit, branch listing, fetch, worktree CRUD.

Commit message generation (`src/supervisor/commitMessageGenerator.ts`) uses the selected provider adapter's one-shot generation path. The adapter can use an SDK/API or CLI, and the generation service owns provider selection and fallback.

Worktree paths are computed within a centralized directory (`~/.poracode/worktrees/<repo-id>/<branch-id>`) via `src/supervisor/git.ts` and `src/shared/worktree.ts`.
