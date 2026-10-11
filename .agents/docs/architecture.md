# Architecture & Code Organization

## Layers

- `src/main/`: Electron shell (`main.ts`), context-isolated preload (`preload.ts`), native OS integrations, and the backend child-process client. Compatibility re-exports preserve older internal imports.
- `src/host/`: Electron-free database, remote HTTP/WS, SSH, browser bridge, computer-use and host-service modules shared by desktop and standalone compositions.
- `src/backend/`: Shared `BackendHostCore` owns SQLite persistence and a lazily started supervisor. `index.ts` is the desktop backend child-process entry; `BackendDesktopServices` composes remote access and native-service callbacks. `BackendDurableServices` contains services reused by desktop and standalone hosts.
- `src/server/`: Standalone Node CLI and headless host composition, plus the optional relay. The standalone host instantiates the same backend core and remote server without Electron.
- `src/supervisor/`: Forked Node process owning provider runtimes, real PTYs, Git operations, terminal log persistence, agent discovery, and one-shot generation. Entry point: `index.ts`. Provider payload parsing stays inside provider adapters; shared consumers receive normalized contracts.
- `src/renderer/`: React 19 + HeroUI v3 + xterm.js, shared by Electron, desktop web, and mobile web/PWA. `clientRuntime.ts` declares client capabilities; the Electron transport and browser remote bridge adapt host access. Zustand holds presentation state and client projections. Some stores persist through the local backend, others in browser storage.
- `ios/` and `android/`: Independent SwiftUI and Compose clients with native transports, lifecycle, and storage. Generated remote bindings and shared fixtures enforce contract semantics; the parity ledger tracks feature coverage.
- `src/shared/`: Zod schemas, TypeScript types, IPC contracts (`ipc.ts`), and pure helpers (ANSI stripping, WSL path utilities, worktree path computation, theme resolution, agent status filtering).

## Process and transport boundaries

Electron main forks `backendHost.cjs` through `BackendHostClient`; the backend starts `supervisor.cjs` when needed. Standalone `server.cjs` owns the backend core in its own process and starts the same supervisor. Only the supervisor may spawn an agent runtime or own its PTY.

Both desktop and standalone admission acquire a shared owner lease before opening
the versioned data root. `PORACODE_BASE_DIR` is a profile namespace; the owned
root is its `.host-v1` sibling. Desktop promotion is journaled and resumable,
with cache exclusion, size preflight and optional progress. A private,
authenticated loopback control endpoint supplies `describe` and explicit
`pair --json`; desktop can attach to an existing standalone owner. See
[Host ownership](../../docs/HOST_OWNERSHIP.md).

The renderer holds a `HostTransport` from `src/renderer/hostTransport/`.
Managed desktop requests, supervisor events and terminal bytes use authenticated
loopback HTTP/WebSocket, including TLS-configured hosts. Preload IPC carries
bootstrap and local shell operations; it is not a fallback host data plane.
Attached desktop, browser/PWA and native clients use the remote HTTP/WebSocket
contract. Host-declared capabilities determine service availability; a secondary
paired server does not replace the managed desktop's local capabilities.

Events carry a sequence-space identifier. Deduplication and snapshot recovery
track each space separately, and reconnect resets server-owned cursors before
rebuilding subscribed state. Remote sockets have bounded queues and recover
from gaps with authoritative snapshots. Main still consumes supervisor events
for native state such as sleep blockers, without relaying their bulk content
over preload IPC.

Electron main forks `backendHost.cjs` through the versioned backend protocol;
only the supervisor owns provider processes and PTYs. The client runtime,
IPC procedure map and backend-host vocabulary share `CLIENT_HOST_HOP_VERSION`.
The remote, client-engine and host-control protocols retain their independent
compatibility gates. See [Versioned State & Protocols](versioning.md).

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

SQLite uses `better-sqlite3` directly. `src/host/db.ts` is a barrel; `src/host/db/connection.ts` opens the database and runs the schema migration/validation gate. Domain modules own projects, threads, runtime items/streams, usage, and operation journals. `BackendHostCore` passes supervisor events to persistence before client projection. Runtime stream writes can remain queued until the write window, a reader, or close flushes them; delivery does not prove a disk commit. Electron main uses async backend access, including `BackendStateStore` for prefetched native window state.

`src/renderer/state/dbStorage.ts` maps local app-store persistence to backend row operations and coalesces queued writes. Without a local-backend capability it uses localStorage; remote mutations are performed through the authenticated remote bridge. Cached client state must never become authority after reconnect. Exclusive data-root ownership, shared settings writes, and shutdown ordering are explicit V4 gates; do not infer safe concurrent host ownership from SQLite locking alone.

## Git Integration

`src/supervisor/git.ts` runs git directly via `execFile` (`node:child_process`) — no `simple-git` dependency — with location-aware path resolution (Windows native runs locally; WSL projects route through a bridge client). Operations: status, diff (single + batch), stage/unstage/revert, commit, branch listing, fetch, worktree CRUD.

Commit message generation (`src/supervisor/commitMessageGenerator.ts`) uses the selected provider adapter's one-shot generation path. The adapter can use an SDK/API or CLI, and the generation service owns provider selection and fallback.

Worktree paths are computed within a centralized directory (`~/.poracode/worktrees/<repo-id>/<branch-id>`) via `src/supervisor/git.ts` and `src/shared/worktree.ts`.
