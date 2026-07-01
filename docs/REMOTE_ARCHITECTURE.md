# Remote Access & PWA Architecture

Status: living document. Tracks the re-architecture of remote access so the
server can run **standalone** (a CLI on any host), devices connect to it
directly (LAN / VPN / Tailscale today, a managed relay later), the desktop app
can act as a **client** of other servers, and projects can be added/removed
**remotely** (from the filesystem or GitHub).

---

## 1. Where we started

Four runtimes, already cleanly separated:

| Runtime          | Location         | Owns                                                                                                                | Electron-coupled?                |
| ---------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| **Renderer**     | `src/renderer`   | Desktop UI; in-memory source of truth for projects/threads (Zustand) persisted to SQLite via `dbSyncAll`; git state | Yes (Chromium)                   |
| **Main**         | `src/main`       | SQLite (`db.ts`), settings file, `RemoteAccessServer`, browser panels, native dialogs, forks the supervisor         | Yes                              |
| **Supervisor**   | `src/supervisor` | Agents, PTY/terminals, git, GitHub, LSP, project tree, file index                                                   | **No** (pure Node, forked child) |
| **PWA / mobile** | `src/mobile`     | Remote client over HTTP+WS; multi-desktop pairing (Dexie)                                                           | No (browser)                     |

Key facts that make this tractable (verified, not assumed):

- `src/supervisor/*`, `src/main/db.ts`, `src/main/remote/*`,
  `src/main/supervisor/SupervisorClient.ts`, `src/main/lightcodeData.ts`,
  `src/main/sharedSettingsFile.ts` import **zero** Electron APIs.
- `RemoteAccessServer` is already pure dependency-injection: it receives
  `callSupervisor`, `settings`, `browser?`, `dispatchThreadCommand?`,
  `gitSummaries?` as constructor options. Only the **wiring** in `main.ts` is
  Electron-specific.
- The wire protocol (`src/shared/remote/protocol.ts`) is versioned
  (`LIGHTCODE_REMOTE_PROTOCOL_VERSION`), zod-validated, HTTP for control +
  WebSocket for the replayable event stream, with scoped bearer-token auth and
  persistent sessions.
- The PWA already models **multiple desktops** (`storage.ts` Dexie schema,
  `DesktopsView`, `useRemoteDesktop`).

## 2. The four gaps vs. the goal

1. **No standalone entry.** The server only boots inside Electron `main.ts`.
2. **Source-of-truth split.** The renderer owns projects/threads in memory and
   pushes to SQLite; `RemoteAccessServer` also writes the DB directly _and_
   dispatches some commands back to the renderer (`dispatchThreadCommand`).
   Without a renderer, renderer-only side effects (e.g. `delete-worktree-group`)
   have nowhere to run.
3. **No remote project CRUD.** Projects are read-only over the wire. Add (folder
   pick), clone (GitHub/URL) and remove all live in the renderer + Electron.
4. **Client is mobile-only and LAN-only.** `RemoteDesktopClient` lives in
   `src/mobile`; the desktop can't be a client, and there is no relay for
   cross-network access.

## 3. Target architecture

```
                 ┌──────────────────────────────────────────┐
                 │            @/shared/remote                │
                 │  protocol (wire types, versioned)         │
                 │  client/  (RemoteDesktopClient, store)    │  ← shared by
                 └──────────────────────────────────────────┘     PWA + desktop
                          ▲                     ▲
                          │ HTTP + WS           │ HTTP + WS
           ┌──────────────┴───────┐   ┌─────────┴───────────────┐
           │  PWA / mobile        │   │  Desktop renderer        │
           │  (src/mobile)        │   │  (src/renderer)          │
           └──────────────────────┘   │  - local workspace       │
                          │            │  - remote workspaces ────┼─┐
                          │            └──────────────────────────┘ │
                          ▼                     ▼                    │
                 ┌──────────────────────────────────────────┐       │
                 │       RemoteAccessServer (pure Node)      │◄──────┘
                 │  HTTP control + WS events + auth          │
                 └──────────────────────────────────────────┘
                    ▲              ▲                  ▲
          callSupervisor   project/thread service   browser? (Electron only)
                    │              │
            ┌───────┴──────┐  ┌────┴───────────────────────────┐
            │  Supervisor  │  │  RemoteHost composition root    │
            │  (forked)    │  │  db + supervisor + settings +   │
            └──────────────┘  │  identity + auth                │
                              └─────────────────────────────────┘
                                 ▲                         ▲
                    ┌────────────┴─────────┐   ┌───────────┴───────────┐
                    │ Electron main.ts     │   │ Headless CLI (src/    │
                    │ (+ browser, renderer │   │ server/cli.ts)        │
                    │  dispatch)           │   │ no Electron           │
                    └──────────────────────┘   └───────────────────────┘
```

Two composition roots, one server. The Electron host injects the browser
gateway and renderer-dispatch; the headless host injects neither and treats the
**DB as the source of truth**.

## 4. Staged plan

### Phase 1 — Headless composition root + CLI ✅ (this change)

- `src/server/createHeadlessRemoteHost.ts`: host-agnostic factory that opens the
  DB, forks the supervisor, reads identity/auth/settings, and constructs
  `RemoteAccessServer` with no Electron dependencies.
- `src/server/cli.ts`: standalone entry (`node dist/main/server.cjs`) that boots
  the host, prints the pairing URL, and shuts down cleanly on signals.
- `src/server/headlessSecretKey.ts`: file-backed secret key (no OS keychain on a
  server), env-overridable via `LIGHTCODE_SECRET_STORAGE_KEY`.
- New `server` tsdown entry + `pnpm run server` script.
- **`main.ts` is untouched** — the desktop app's behavior is unchanged. The
  headless host reuses the existing, already-DI'd server.

### Phase 2 — Process-agnostic project/thread service

- Lift thread-metadata writes out of "renderer owns it" into a service the
  server already mostly implements (`applyRemoteThreadCommand`). Make the DB the
  authority; the renderer becomes a subscriber that reflects DB/event state.
- Replace the last renderer-only command paths (`delete-worktree-group`) with
  supervisor procedures so headless is fully functional.

### Phase 3 — Remote project CRUD (filesystem + GitHub) 🟡 (backend landed)

Landed in this change:

- Protocol: a `projects:manage` scope and a `remoteProjectCommand` union —
  `add-existing` (register a server path), `create` (mkdir + register), `clone`
  (github/url via the supervisor), `remove`. Plus a `remote-projects-changed`
  WS event so clients refresh their snapshot.
- Server: `POST /api/projects/command` (scope-gated) + a pure, unit-tested
  `applyRemoteProjectCommand` handler (`src/main/remote/projectCommands.ts`).
  The DB is the source of truth; clone is driven through the supervisor.
- Client: `RemoteDesktopClient.projectCommand()` transport.

Also landed:

- **PWA UI:** a `/more/projects` screen (`ManageProjectsView`) with add-folder /
  clone-URL / remove, wired through `useRemoteDesktop.manageProject()`.
- **Desktop UI:** the Settings → Remote Servers panel does the same against any
  connected server.

Deferred (next):

- Wire the `remote-projects-changed` event into `useRemoteDesktop` for live
  push refresh (today the client re-fetches after its own command).
- **Renderer-dispatched edits** (rename, disable, relocate, reorder) — these
  need the renderer store's `sortOrder`/cascade semantics, so they ride Phase 2
  rather than the DB-direct path.
- **`browseDirectory`** — letting a client navigate the server's filesystem to
  pick a parent path. Deliberately omitted: exposing the directory tree over the
  network is its own security decision. For now clients pass an explicit path.

### Phase 4 — Desktop as a client 🟡 (connect + manage landed)

Landed in this change:

- **Client extracted to shared.** `RemoteDesktopClient` moved
  `src/mobile/remoteClient.ts` → `@/shared/remote/client.ts` (dropped its lone
  renderer-i18n dependency); `src/mobile/remoteClient.ts` is now a re-export, so
  the PWA is untouched (all 89 mobile tests green).
- **Desktop remote-servers engine.** `src/renderer/state/remoteServersStore.ts`
  — a persisted Zustand store (localStorage) that pairs with other servers,
  fetches their snapshots, and runs project commands against them. Client
  factory is injectable; fully unit-tested.
- **Settings → Remote Servers** panel: connect by endpoint + token, see each
  server's status + projects, and add-folder / clone-URL / remove projects on
  the remote (reusing Phase 3's `projects:manage`).

Also landed:

- **Main sidebar integration** — `SidebarRemoteServers` lists every connected
  server's projects **and their threads** under a "Remote servers" section in
  the desktop's left sidebar. Persisted servers reconnect on app start.
- **Remote thread operation (interrupt / close)** — running agents on a remote
  server can be interrupted or torn down directly from the sidebar
  (`remoteServersStore.interruptThread` / `closeThread`).
- **Main-process HTTP proxy (CORS fix).** Interactive testing against a live
  loopback server surfaced that the desktop renderer's origin is **not** in the
  remote server's CORS allowlist, so renderer `fetch` to a remote server is
  browser-blocked. Fixed by routing remote requests through a new main-local IPC
  (`remoteHttpRequest`) — the main process isn't subject to CORS. The shared
  `RemoteDesktopClient` now accepts an injectable `RemoteFetch`; the PWA keeps
  the browser `fetch`, the desktop injects the main-process proxy.

Verified end-to-end in the running app (interactive-testing skill): enabled this
desktop's Remote Access, connected the same desktop to its loopback server via
the Remote Servers panel, and confirmed the server + its projects render in both
the panel and the sidebar, the connection persists to localStorage with the full
scope set (incl. `projects:manage`), and **zero console errors** throughout.

- **Live chat for remote threads.** `remoteServersStore.openRemoteThread` fetches
  a remote thread's history via the client and hydrates it into the shared,
  `threadId`-keyed runtime store (`storeSync.applyThreadSnapshot`), then opens a
  WebSocket and forwards events (`dispatchRemoteSupervisorEvent`) so the desktop
  reuses its own `ChatPane` to render the conversation live. A `RemoteThreadView`
  overlay (mounted in `AppOverlays`) adds a composer + interrupt wired to the
  remote client (`sendRemotePrompt`). Opened from the sidebar's remote thread
  rows. The runtime store is keyed by `threadId`, so a remote thread coexists
  with local ones without interference. WS handle + factories are injectable for
  tests.

Deferred (next):

- Remote thread **approvals / checkpoints / file-open** in the reused `ChatPane`
  still target the local actions context (which is `null` for the remote view,
  so they no-op rather than misfire); routing those to the remote client is the
  remaining polish.
- **Pair via QR / pairing-URL paste** (the PWA already parses these).

### Phase 5 — Cloud connectivity 🟡 (self-hostable transport landed)

- Direct connection stays the default (LAN / VPN / Tailscale).
- **Relay transport landed.** A self-hostable relay (`pnpm run relay`,
  `src/server/relay/`) lets a server behind NAT dial out and register a server
  id; a device reaches it at `<relay>/s/<serverId>/`. The relay is a dumb HTTP +
  WebSocket tunnel (`relayProtocol.ts`): visitor traffic is framed over one
  control socket to the host, and the **host adapter just proxies each frame to
  the server's own loopback port** — so `RemoteAccessServer` and the client are
  unchanged (the client only swaps its endpoint for the relay URL). Auth stays
  end-to-end; the relay binds a server id to its first registrant's secret to
  prevent hijacking. Verified end-to-end over real sockets
  (`relayServer.test.ts`): HTTP control plane (descriptor + pairing exchange +
  WS-ticket) and the WebSocket event stream both tunnel correctly.
  - The headless CLI opts in via `LIGHTCODE_REMOTE_RELAY_URL` (+ a file-backed
    `LIGHTCODE_REMOTE_RELAY_SECRET`); it registers under its `desktopId` and
    prints its public relay URL.

  Still external (the deferred "managed cloud subscription"): hosting the relay,
  mapping accounts → server ids, and billing. That SaaS layer sits on top of this
  transport and is out of repo scope; the transport is what makes cross-network
  "connect from different devices" actually work today.

### Review & hardening pass

A multi-agent adversarial review (39 agents) over the whole change set raised 33
findings; 23 survived verification. Fixed in this pass:

- **`dispose()` race (critical).** `RemoteAccessServer.dispose()` now awaits the
  HTTP server close (dropping idle keep-alives, grace timeout for in-flight
  requests) so the headless host tears the DB down _after_ requests finish.
- **Path-traversal hardening (critical).** `projectCommands` rejects `..`
  segments in add/create/clone paths. `projects:manage` still grants explicit
  absolute-path access (that's the "add a project from the system" capability);
  the scope grant is the trust boundary, but traversal-disguise is forbidden.
- **Proxy hardening.** `remoteHttpRequest` is restricted to `http(s)` and caps
  the response at 64 MiB (scheme/SSRF/size).
- **Store correctness.** `removeServer` now closes an open live-chat thread (+
  its socket) belonging to the removed server; `mainProcessFetch` guards
  null-body HTTP statuses (204/205/304/1xx); `RemoteThreadView`'s interrupt
  button reads live turn state from the runtime store, not the open snapshot.
- **Event consumption.** The PWA refreshes its snapshot on
  `remote-projects-changed` (it was broadcast but ignored); the desktop keeps
  remote projects in `remoteServersStore`, so it deliberately ignores the event
  there to avoid clobbering local projects.
- **Clone-name parsing** strips query/fragment + trailing slashes.

Accepted as-is (documented, not bugs): the bearer token persists in renderer
localStorage (mirrors the PWA; server can revoke); `storeSync` reused from
`src/mobile` is renderer-only and relocating it is tracked Phase-4 polish.

## 5. Decisions

- **Connectivity (now):** direct connection only; relay is Phase 5.
- **Headless runtime:** plain-Node CLI. The composition root is runtime-agnostic;
  packaging the Node-ABI builds of `better-sqlite3` / `node-pty` (alongside the
  Electron-ABI builds the desktop uses) is a packaging task, tracked below.
- **Source of truth (headless):** the SQLite DB. No renderer, so
  `dispatchThreadCommand` is absent and the DB-path handlers apply.

## 6. Open packaging tasks (Phase 1 follow-ups)

- **Native ABI.** The desktop rebuilds `better-sqlite3` / `node-pty` for the
  **Electron** ABI via `electron-rebuild` (`pnpm run setup:native`). Running the
  CLI under **plain Node** then fails when `new Database()` loads the native
  binding:

  ```
  The module 'better_sqlite3.node' was compiled against a different Node.js
  version using NODE_MODULE_VERSION 145 [Electron]. This version of Node.js
  requires NODE_MODULE_VERSION 137 [Node].
  ```

  This is purely a build-output mismatch, not a code issue — the CLI builds,
  boots, writes its data dir + secret key, and surfaces this exact error. The
  fix is to provide Node-ABI native modules for the server runtime, e.g. a
  Docker image that `npm rebuild`s under the target Node, or a dedicated install
  prefix. Tracked separately so it doesn't disturb the desktop's Electron-ABI
  build in the shared `node_modules`.

- **HTTP-server boot is independent of native modules.** `RemoteAccessServer`
  binds and serves even if the supervisor (which needs `node-pty`) is degraded;
  `createHeadlessRemoteHost.test.ts` proves a real ephemeral-port bind with the
  DB stubbed.
- `wsl-helpers` resolution mirrors `main.ts` (packaged vs. dev). On non-Windows
  servers WSL is irrelevant; the path is still passed for parity.
