# Architecture & Code Organization

## Layers

- `src/main/`: Electron shell (`main.ts`), context-isolated preload bridge (`preload.ts`), SQLite database (`db.ts`, `db.schema.ts` via Drizzle ORM + better-sqlite3).
- `src/supervisor/`: Forked Node process owning all agent PTY sessions, git operations, terminal log persistence, agent status caching, and commit message generation. Entry point: `index.ts` (IPC dispatcher with Zod-validated payloads).
- `src/renderer/`: React 19 + HeroUI v3 + xterm.js. Zustand stores for state, persisted to SQLite via the preload bridge.
- `src/shared/`: Zod schemas, TypeScript types, IPC contracts (`ipc.ts`), and pure helpers (ANSI stripping, WSL path utilities, worktree path computation, theme resolution, agent status filtering).

## IPC Architecture

The main process forks the supervisor as a child process. Communication is UUID-keyed request/reply over `process.send()` + `process.on("message")`. The supervisor also emits fire-and-forget events (thread output, state changes, agent statuses) that the main process forwards to the renderer via `ipcRenderer`.

The preload bridge (`window.lightcode`) wraps all IPC into typed async methods defined by the `LightcodeBridge` interface in `src/shared/ipc.ts`.

## State Management

Five Zustand stores in `src/renderer/state/`:

| Store | Persisted | Purpose |
|-------|-----------|---------|
| `appStore` | SQLite | Projects, threads, panes, agent statuses, pending server requests, draft config |
| `gitStore` | No | Per-project git status, worktree info, branch lists |
| `devTerminalStore` | SQLite | Shell session tabs, active project, activity tracking |
| `sharedSettingsStore` | SQLite | Theme mode, commit generation provider/model/effort |
| `updateStore` | No | Auto-update phase, version, download progress |

Components connect to stores directly — avoid prop drilling.

## Build Pipeline

| Target | Tool | Entry | Output | Format |
|--------|------|-------|--------|--------|
| Renderer | Vite 8 (Rolldown) | `src/renderer/main.tsx` | `dist/renderer/` | ESM, manual chunks (xterm, git-diff, ui, framework, vendor) |
| Main process | tsdown | `src/main/main.ts` | `dist/main/main.cjs` | CJS, Node 24 |
| Preload | tsdown | `src/main/preload.ts` | `dist/main/preload.cjs` | CJS, Node 24 |
| Supervisor | tsdown | `src/supervisor/index.ts` | `dist/main/supervisor.cjs` | CJS, Node 24 |
| Distribution | electron-builder | — | `release/` | NSIS (Win), AppImage+deb (Linux), DMG (macOS) |

Native modules (`node-pty`, `better-sqlite3`, `electron`) are excluded from bundling and unpacked from ASAR.

## Database

SQLite via Drizzle ORM (`src/main/db.ts`). Tables: `projects`, `threads`, `appState`. The renderer reads/writes through preload bridge methods (`dbGetProjects`, `dbUpsertThread`, `dbSyncAll`, etc.). Zustand persistence uses a custom `dbStorage` backend.

## Git Integration

`src/supervisor/git.ts` wraps `simple-git` with location-aware path resolution (Windows native vs WSL UNC paths). Operations: status, diff (single + batch), stage/unstage/revert, commit, branch listing, fetch, worktree CRUD.

Commit message generation (`src/supervisor/commitMessageGenerator.ts`) spawns a one-shot agent CLI call with a conventional-commits prompt piped to stdin. Falls back across providers if the preferred one fails.

Worktree paths are computed as siblings to the project directory (`<project>-<sanitized-branch>`) via `src/shared/worktree.ts`.
