# Architecture & Code Organization

## Layers

- `src/main/`: Electron shell (`main.ts`), context-isolated preload (`preload.ts`), native OS integrations, and the backend child-process client. Compatibility re-exports preserve older internal imports.
- `src/host/`: Electron-free database, remote HTTP/WS, SSH, browser bridge, computer-use and host-service modules shared by desktop and standalone compositions.
- `src/backend/`: Shared `BackendHostCore` owns SQLite persistence and a lazily started supervisor. `index.ts` is the desktop backend child-process entry; `BackendDesktopServices` composes remote access and native-service callbacks. `BackendDurableServices` contains services reused by desktop and standalone hosts.
- `src/server/`: Standalone Node CLI and headless host composition, plus the optional relay. The standalone host instantiates the same backend core and remote server without Electron.
- `src/supervisor/`: Forked Node process owning provider runtimes, real PTYs, Git operations, terminal log persistence, agent discovery, and one-shot generation. Entry point: `index.ts`. Provider payload parsing stays inside provider adapters; shared consumers receive normalized contracts.
- `src/renderer/`: React 19 + HeroUI v3 + xterm.js, shared by Electron, desktop web, and mobile web/PWA. `clientRuntime.ts` declares client capabilities; the Electron transport and browser remote bridge adapt host access. Zustand holds presentation state and client projections.
- `ios/` and `android/`: Independent SwiftUI and Compose clients with native transports, lifecycle, and storage. Generated remote bindings and shared fixtures enforce contract semantics; the parity ledger tracks feature coverage.
- `src/shared/`: Zod schemas, TypeScript types, IPC contracts (`ipc.ts`), and pure helpers (ANSI stripping, WSL path utilities, worktree path computation, theme resolution, agent status filtering).

## Process and transport boundaries

Electron main forks `backendHost.cjs` through `BackendHostClient`; the backend starts `supervisor.cjs` when needed. Standalone `server.cjs` owns the backend core in its own process and starts the same supervisor. Only the supervisor may spawn an agent runtime or own its PTY.

Desktop and standalone hosts acquire a shared owner lease before opening the data root, and desktop can attach to an existing standalone owner through an authenticated loopback control endpoint. See [Host ownership](../../docs/HOST_OWNERSHIP.md).

The renderer holds a `HostTransport` from `src/renderer/hostTransport/`. Managed desktop requests, supervisor events, and terminal bytes use authenticated loopback HTTP/WebSocket. Preload IPC carries bootstrap and local shell operations; it is not a fallback host data plane. Attached desktop, browser/PWA, and native clients use the remote HTTP/WebSocket contract. Host-declared capabilities determine service availability; a secondary paired server does not replace the managed desktop's local capabilities.

Events carry a sequence-space identifier. Deduplication and snapshot recovery track each space separately, and reconnect resets server-owned cursors before rebuilding subscribed state. Remote sockets have bounded queues and recover from gaps with authoritative snapshots. Main still consumes supervisor events for native state such as sleep blockers, without relaying their bulk content over preload IPC.

Each of these hops (backend protocol, client-host hop, remote, client-engine, host-control) has its own compatibility version; see [Versioned State & Protocols](versioning.md) before changing any of them.

## State Management

Renderer state is Zustand, one store per UI domain, in `src/renderer/state/*Store.ts` (a few live in subfolders such as `state/remote/`). List that directory to see what exists. Give a new cross-cutting concern its own store rather than broadening an existing one. Persistence varies per store: `appStore` and a few dock stores persist through the local backend via `state/dbStorage.ts` (localStorage when no local backend is available), others use browser storage, and many are ephemeral — check the store itself (`persist` middleware or direct `localStorage` use).

Companion selector modules (`fileEditorSelectors.ts`, `gitSelectors.ts`, `hooks/uiSelectors.ts`) hold derivations cached on store-array identity via `createArrayKeyedMap` in `state/derivations.ts`. Subscription and render-isolation rules are in [Editing & React Patterns](editing-rules.md#store-subscriptions--render-isolation).

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

SQLite uses `better-sqlite3`. Production desktop and standalone hosts offload catalog and transcript reads to two read-only child processes. Each keeps its IPC loop free while SQLite runs in a worker thread, so deadlines and host shutdown can kill native queries. Reads have bounded admission; cursor-bearing transcript reads retain their host-owned thread fence until the worker snapshot completes. The host keeps ownership of ordered writes and migrations. Direct/offline database compositions retain synchronous reads. `src/host/db.ts` is a barrel; `src/host/db/connection.ts` opens the database and runs the schema migration/validation gate. Domain modules own projects, threads, runtime items/streams, usage, and operation journals. `BackendHostCore` passes supervisor events to persistence before client projection. Runtime stream writes can stay queued until the write window, a reader, or close flushes them; delivery does not prove a disk commit. Electron main uses async backend access, including `BackendStateStore` for prefetched native window state.

`src/renderer/state/dbStorage.ts` maps local app-store persistence to backend row operations and coalesces queued writes. Without a local-backend capability it uses localStorage; remote mutations go through the authenticated remote bridge. Cached client state must never become authority after reconnect. Do not infer safe concurrent host ownership from SQLite locking alone — data-root ownership comes from the owner lease.

## Git Integration

`src/supervisor/git.ts` runs git directly via `execFile` (`node:child_process`) — no `simple-git` dependency — with location-aware path resolution (Windows native runs locally; WSL projects route through a bridge client). Operations: status, diff (single + batch), stage/unstage/revert, commit, branch listing, fetch, worktree CRUD.

Commit message generation (`src/supervisor/commitMessageGenerator.ts`) uses the selected provider adapter's one-shot generation path. The adapter can use an SDK/API or CLI, and the generation service owns provider selection and fallback.

Worktree paths are computed within a centralized directory (`~/.poracode/worktrees/<repo-id>/<branch-id>`) via `src/supervisor/git.ts` and `src/shared/worktree.ts`.
