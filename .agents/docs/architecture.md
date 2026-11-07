# Architecture & Code Organization

## Layers

Desktop and the standalone CLI server compose the same backend model. There is one authoritative owner per host data root, and clients can connect to separate hosts. The React renderer is shared by Electron and web/PWA; iOS and Android are independent native clients. Choose a change's owner from its responsibility and lifetime, not from the client where the request originated.

- `src/main/`: Electron shell (`main.ts`), context-isolated preload (`preload.ts`), native OS integrations, and the backend child-process client. Compatibility re-exports preserve older internal imports.
- `src/host/`: Electron-free database, remote HTTP/WS, SSH, browser bridge, computer-use and host-service modules shared by desktop and standalone compositions.
- `src/backend/`: Shared `BackendHostCore` owns SQLite persistence and a lazily started supervisor. `index.ts` is the desktop backend child-process entry; `BackendDesktopServices` composes remote access and native-service callbacks. `BackendDurableServices` contains services reused by desktop and standalone hosts.
- `src/server/`: Standalone Node CLI and headless host composition, plus the optional relay. The standalone host instantiates the same backend core and remote server without Electron.
- `src/supervisor/`: Forked Node process owning provider runtimes, real PTYs, Git operations, terminal log persistence, agent discovery, and one-shot generation. Entry point: `index.ts`. Provider payload parsing stays inside provider adapters; shared consumers receive normalized contracts.
- `src/renderer/`: React 19 + HeroUI v3 + xterm.js, shared by Electron, desktop web, and mobile web/PWA. `clientRuntime.ts` declares client capabilities; the Electron transport and browser remote bridge adapt host access. Zustand holds presentation state and client projections.
- `ios/` and `android/`: Independent SwiftUI and Compose clients with native transports, lifecycle, and storage. Generated remote bindings and shared fixtures enforce contract semantics; the parity ledger tracks feature coverage.
- `src/shared/`: Zod schemas, TypeScript types, IPC contracts (`ipc.ts`), and pure helpers (ANSI stripping, WSL path utilities, worktree path computation, theme resolution, agent status filtering).

## Choosing where a change belongs

Before writing, trace the existing operation from its client action through transport, authorization, owning service, persistence, and events back to consumers. Identify what is authoritative, what is a client projection or preference, whether work must continue without a connected UI, and which clients are in scope. Use the existing owner and extension points where they fit.

| Responsibility                                                                                  | Usual owner                                                                                               |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Agent processes, PTYs, provider sessions, agent discovery, Git execution                        | `src/supervisor/`; vendor behavior in `agents/<kind>/`                                                    |
| Durable state, settings mutations, schedules, PR Watch, and work that continues without clients | `src/backend/` and domain services in `src/host/`; inspect `BackendHostCore` and `BackendDurableServices` |
| Remote authorization, HTTP/WS endpoints, SSH, and Electron-free host integrations               | `src/host/`; compose through existing backend/server services                                             |
| CLI parsing, server startup/shutdown, install and operational commands                          | `src/server/`; `packages/poracode-cli/` launches the verified server artifact                             |
| Windows, dialogs, tray, updater, and Electron APIs                                              | `src/main/`; expose native operations through the existing shell bridge                                   |
| React UI, navigation, composer drafts, view preferences, and client projections                 | `src/renderer/`; state lifetime follows the existing feature store                                        |
| Native mobile UI, navigation, secure client storage, and app lifecycle                          | `ios/` or `android/`; follow the remote contract and native app patterns                                  |
| Cross-layer schemas, contracts, and reusable pure calculations                                  | `src/shared/`; check the selected module's runtime dependencies before importing it into a client         |

These are responsibility boundaries, not a requirement to put every feature on the server. Rendering calculations and client session behavior can stay in clients. Shared policy and authoritative mutations belong with their host owner so clients agree. A shared host change must be wired in both desktop and standalone compositions without depending on Electron or a mounted renderer; compose the same service rather than copying its logic into both entry points. Keep platform-specific adapters at the edge.

For changes exposed to clients, follow `ClientRuntime` / `HostTransport` and the remote contract registry (`src/shared/remote/contract/`). Declare availability through the existing host/client capabilities and enforce authorization at the host boundary; a hidden control is not an authorization check. Do not infer a host's services from the client platform or enable local authority when a remote host lacks a capability. Regenerate changed remote bindings with `bun run protocol:remote:v3:generate`, then check them with `bun run protocol:remote:v3:check`; do not hand-edit generated artifacts. Native UI is implemented separately, so assess native impact explicitly rather than assuming a React change reaches phones or automatically expanding a platform-only task.

## Dependency boundaries

Shared backend roots (`src/host/`, `src/backend/`, `src/server/`, `src/supervisor/`, and `src/shared/`) must not import `src/main/` at runtime, including through compatibility re-exports or barrels. Only `src/main/` may depend on `electron` at runtime. Keep renderer access behind client transports and platform adapters; directory names such as `shared` do not make every module browser-safe.

Check existing consumers before moving code: `node scripts/architecture-imports.mjs consumers <module path>`. Run `bun run architecture:check` after changing module boundaries or cross-layer imports. The audit's rules are in `scripts/architecture-imports/audit.mjs`; it checks import boundaries, not whether a feature has the correct state owner or works in every host composition.

## Process and transport boundaries

Electron main forks `backendHost.cjs` through `BackendHostClient`; the backend starts `supervisor.cjs` when needed. Standalone `server.cjs` owns the backend core in its own process and starts the same supervisor. Only the supervisor may spawn an agent runtime or own its PTY.

Desktop and standalone hosts acquire a shared owner lease before opening the data root, and desktop can attach to an existing standalone owner through an authenticated loopback control endpoint. See [Host ownership](../../docs/HOST_OWNERSHIP.md).

The renderer holds a `HostTransport` from `src/renderer/hostTransport/`. Managed desktop requests, supervisor events, and terminal bytes use authenticated loopback HTTP/WebSocket. Preload IPC carries bootstrap and local shell operations; it is not a fallback host data plane. Attached desktop, browser/PWA, and native clients use the remote HTTP/WebSocket contract. Host-declared capabilities determine service availability; a secondary paired server does not replace the managed desktop's local capabilities.

Events carry a sequence-space identifier. Deduplication and snapshot recovery track each space separately, and reconnect resets server-owned cursors before rebuilding subscribed state. Remote sockets have bounded queues and recover from gaps with authoritative snapshots. Main still consumes supervisor events for native state such as sleep blockers, without relaying their bulk content over preload IPC.

The client-runtime facade, IPC procedure map, and backend-host protocol share `CLIENT_HOST_HOP_VERSION` in `src/shared/clientHostHop.ts`. Remote, client-engine, and host-control protocols have separate compatibility identities. See [Versioned State & Protocols](versioning.md) before changing a boundary; use the source constants rather than copying current version numbers into guidance.

## State Management

Host-owned state is mutated through its owning service. Settings writes go through the composition's settings authority (`src/backend/settings/SettingsAuthority.ts`), including supervisor-originated edits; a renderer cache or whole-snapshot file write must not bypass it. Preserve per-host and per-thread identity when applying async replies or events, and reject stale results after a switch or reconnect. Client drafts, navigation, and view preferences keep their own lifetimes and persistence choices.

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

## Verification by boundary

Use the [verify skill](../skills/verify/SKILL.md) for commands and conditional gates. Test a shared service through its desktop and standalone wiring, including operation without a renderer when its lifetime requires that. For changes to shared mutations or event delivery, cover the relevant concurrent-client, host/thread-switch, reconnect/snapshot, and restart cases; do not treat successful delivery as proof of a disk commit. Check affected native contracts and the coverage recorded in `protocol/remote/v3/native-parity.json`; generated bindings alone do not prove a native feature works. Run only the checks that apply to the changed behavior, and report which host/client paths were actually exercised.

Detailed subsystem references: [client and remote architecture](../../docs/REMOTE_ARCHITECTURE.md), [host ownership and local control](../../docs/HOST_OWNERSHIP.md), and [standalone server operation and packaging](../../docs/STANDALONE_SERVER.md). Read these when changing their boundaries, and verify implementation-sensitive claims against the current composition roots and protocol constants.

## Git Integration

`src/supervisor/git.ts` runs git directly via `execFile` (`node:child_process`) — no `simple-git` dependency — with location-aware path resolution (Windows native runs locally; WSL projects route through a bridge client). Operations: status, diff (single + batch), stage/unstage/revert, commit, branch listing, fetch, worktree CRUD.

Commit message generation (`src/supervisor/commitMessageGenerator.ts`) uses the selected provider adapter's one-shot generation path. The adapter can use an SDK/API or CLI, and the generation service owns provider selection and fallback.

Worktree paths are computed within a centralized directory (`~/.poracode/worktrees/<repo-id>/<branch-id>`) via `src/supervisor/git.ts` and `src/shared/worktree.ts`.
