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
  `src/main/supervisor/SupervisorClient.ts`, `src/main/poracodeData.ts`,
  `src/main/sharedSettingsFile.ts` import **zero** Electron APIs.
- `RemoteAccessServer` is already pure dependency-injection: it receives
  `callSupervisor`, `settings`, `browser?`, `dispatchThreadCommand?`,
  `gitSummaries?` as constructor options. Only the **wiring** in `main.ts` is
  Electron-specific.
- The wire protocol (`src/shared/remote/protocol.ts`) is versioned
  (`PORACODE_REMOTE_PROTOCOL_VERSION`), zod-validated, HTTP for control +
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
  server), env-overridable via `PORACODE_SECRET_STORAGE_KEY`.
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

Remaining:

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

- Remote thread **absolute / out-of-project file-open** links and remote tree
  browsing. Project-relative `ChatPane` file links now open in a remote-root
  file editor context backed by the paired server's allowlisted
  `readProjectFile` / `writeProjectFile` bridge; absolute paths remain ignored
  until there is an explicit remote external-file policy.
- **Pair via QR / pairing-URL paste** (the PWA already parses these).

Landed hardening since the first Phase 4 cut:

- Remote thread **approvals / user-input requests** render in the remote overlay
  through the same `ThreadRuntimeRequestPanel` as local GUI threads and resolve
  through the paired server's request API. Sending a follow-up prompt while an
  approval is pending first denies that approval, matching local composer
  behavior.
- Remote thread **checkpoint revert** now routes provider rollback and file
  restore through the paired server's allowlisted git bridge instead of the
  local desktop bridge.

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
  - The headless CLI opts in via `PORACODE_REMOTE_RELAY_URL` (+ a file-backed
    `PORACODE_REMOTE_RELAY_SECRET`); it registers under its `desktopId` and
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
- **Proxy/client hardening.** `remoteHttpRequest` is restricted to `http(s)`,
  aborts stuck requests, and caps streamed responses at 64 MiB
  (scheme/SSRF/timeout/size). The shared `RemoteDesktopClient` applies the same
  timeout and response cap to direct PWA/server requests.
- **WebSocket frame hardening.** The desktop/headless remote server sets an
  explicit inbound client-frame cap (1 MiB default, matching JSON POST bodies).
  The relay also sets explicit host/visitor payload caps sized for its configured
  HTTP body limit, so large frames fail at the `ws` layer instead of relying on
  library defaults. Replayable event sockets also have a bounded outbound queue
  (4 MiB default); a congested client is dropped and must reconnect through
  event replay or snapshot resync rather than accumulating unbounded server
  memory. Relay host/visitor sockets and the host-side relay adapter now apply
  outbound queue caps as well, sized to permit one configured maximum HTTP body
  frame while still bounding memory under slow cloud peers.
- **Relay host timeout hardening.** The host-side relay adapter aborts local
  HTTP proxy requests that do not complete within the request timeout, including
  stalled response bodies. This keeps relay visitor timeouts from leaving stale
  local fetch work behind on the server.
- **WebSocket session-expiry hardening.** Remote WebSocket connections now carry
  the bearer session's expiry timestamp and close themselves when that access
  session expires, matching the lifetime enforced on new HTTP calls and
  WebSocket-ticket consumption.
- **Store correctness.** `removeServer` now closes an open live-chat thread (+
  its socket) belonging to the removed server; `mainProcessFetch` guards
  null-body HTTP statuses (204/205/304/1xx); `RemoteThreadView`'s interrupt
  button reads live turn state from the runtime store, not the open snapshot.
- **Event consumption.** The PWA refreshes its snapshot on
  `remote-projects-changed` (it was broadcast but ignored); the desktop keeps
  remote projects in `remoteServersStore`, so it deliberately ignores the event
  there to avoid clobbering local projects. Desktop-as-client live chat now also
  handles `resync-required` by fetching fresh remote thread history and
  refreshing the remote server snapshot, matching the PWA's replay-expired
  recovery path.
- **Snapshot cost.** Shell snapshots now read batched runtime summaries from
  SQLite (item count, latest item metadata, context usage) instead of loading
  and decoding every persisted runtime item payload for every visible thread on
  each `/api/snapshot` refresh.
- **Clone-name parsing** strips query/fragment + trailing slashes.

Accepted as-is (documented, not bugs): the bearer token persists in renderer
localStorage (mirrors the PWA; server can revoke); `storeSync` reused from
`src/mobile` is renderer-only and relocating it is tracked Phase-4 polish.

### Second review & hardening pass

A follow-up multi-agent adversarial review (74 agents: 10 file-scoped finders +
per-finding refuters) over the full remote/PWA/desktop-client surface raised 48
candidates; 38 survived verification and were fixed here (6 high-severity, incl.
two remote-exploitable security holes). Grouped by area:

- **Clone RCE (high, security).** `applyRemoteProjectCommand` now validates a
  clone `url` against an allowlist of safe transports (https/http/ssh/git/ftp(s)
  - scp-style `user@host:path`) and rejects git remote-helper transports
    (`ext::` runs an arbitrary shell command), `file:`, and leading-`-` argument
    injection — closing an RCE reachable with only the `projects:manage` scope.
- **Relay serverId hijack (high, security).** The relay now keeps a durable
  `serverId → secret` binding independent of the live control socket (TTL-based
  reclamation), so an attacker who knows a public serverId can no longer claim
  it — and intercept forwarded bearer tokens — during a host's brief
  disconnect.
- **Absolute-file read scope (high, security).** `readAbsoluteFile` moved from
  `session:read` to `projects:manage` (matching `browseHostDirectory`), so a
  minimal read token can no longer read `~/.ssh/id_rsa` etc. off the host.
- **Rate-limit key behind relay (medium, security).** The pairing rate limiter
  keyed on `remoteAddress`, which is always loopback behind the relay; the relay
  host adapter now forwards a per-visitor `x-forwarded-for` and the server keys
  the bucket on it for loopback hops, restoring per-client throttling.
- **Headless data-dir lock + host binding (high, stability/bug).** The headless
  CLI takes an exclusive `server.lock` (stale-pid reclaim) so it can't co-open
  the desktop's live data dir with a mismatched secret key; the relay adapter's
  local proxy base is derived from the actual bind host (only `127.0.0.1` for
  wildcard binds), fixing ECONNREFUSED when bound to a Tailscale/VPN IP. The
  prepared Node-ABI sqlite binding is also resolved relative to `__dirname`
  (not `cwd`) so systemd/launchd/cron launches find it.
- **Desktop-as-client event scoping (high, bug).** The open-remote-thread socket
  now filters events before dispatch: desktop-global events (agent statuses, git
  summaries) are dropped and runtime batches are scoped to the open thread, so a
  remote server can no longer clobber the local desktop's detected-agent list or
  accumulate unrelated threads' runtime items. Store refreshes are per-desktop
  debounced + ordered (stale snapshots ignored, `snapshotSeq` clamped with
  `Math.max`), `pairServer` starts its event stream directly, `sendRemotePrompt`
  uses the latest thread config, and the sidebar/overlay remote actions catch
  their own rejections (a routine offline server no longer triggers the global
  crash screen).
- **PWA state-layer correctness (high→low).** A late `refresh()` from a
  previously-active desktop can no longer clobber a just-switched session; a
  failed pair no longer sticks connection in `pairing`; `openThread` no longer
  destructively restarts a live run from a stale cached status; forgetting a
  non-active desktop no longer wipes the active session; a client-side WS
  health-ping detects half-open sockets; event-driven refreshes no longer
  re-download the whole selected-thread history (or agent-statuses/settings) on
  every unrelated thread's event; the snapshot guard accepts a legitimately
  shrunk server transcript; queued runtime deltas flush before a snapshot
  replace (no duplicated text); and orphaned Dexie thread-snapshot rows are
  pruned.
- **PWA view fixes.** One-tap "Remove project" now confirms before cascade-
  deleting threads; per-thread "Delete Worktree" includes sibling threads that
  share the worktree; `TerminalView` remounts on target change (no stale
  PTY/cwd); a stale `/thread/:id` deep link no longer shows an unrelated thread's
  header/actions; the always-empty "Archived Threads" section states honestly
  that archived threads are managed on the desktop.
- **Protocol/client robustness.** Server-advertised scopes parse leniently
  (a newer server's unknown scope no longer throws and burns the one-time
  pairing credential); protocol-version mismatch and response-schema failures
  surface as typed, readable `RemoteClientError`s instead of raw ZodError JSON;
  long-running git ops (clone/push/PR) get a 5-minute deadline instead of the
  flat 60s; `lastSeenSeq=0` is sent (replay-from-start) instead of omitted; a
  restarted server whose `seq` regressed below a reconnecting client's cursor
  now sends `resync-required`; only remotely-consumed supervisor event types are
  buffered/broadcast (chatty `lsp-message`/`git-changed`/`project-tree-changed`
  are dropped); the `startMirrorSession` CDP listener leak on a failed
  screencast start is cleaned up; and desktop-as-client sessions register with a
  `desktop` device type.

Verified end-to-end in the running app: enabled Remote Access on a desktop bound
to an isolated data dir, paired the PWA (`mobile.html`) over real LAN sockets,
and walked threads → more → manage-projects (add-existing via the host folder
picker over the wire) → remove-confirm → settings → archived-threads → new-thread
with **zero console errors** on both the PWA and the desktop.

## 5. Decisions

- **Connectivity (now):** direct connection remains the default (LAN / VPN /
  Tailscale), and the self-hostable relay transport is available for
  cross-network deployments. The managed cloud subscription layer is outside
  this repo and can sit on top of the relay protocol.
- **Headless runtime:** plain-Node CLI. The composition root is runtime-agnostic;
  packaging the Node-ABI builds of `better-sqlite3` / `node-pty` (alongside the
  Electron-ABI builds the desktop uses) is a packaging task, tracked below.
- **Source of truth (headless):** the SQLite DB. No renderer, so
  `dispatchThreadCommand` is absent and the DB-path handlers apply.

## 6. Open packaging tasks (Phase 1 follow-ups)

- **Native ABI.** The desktop rebuilds `better-sqlite3` / `node-pty` for the
  **Electron** ABI via `electron-rebuild` (`pnpm run setup:native`). A headless
  server runs under **plain Node**, so it needs a Node-ABI SQLite binding
  instead of the Electron one. If the default package binding is Electron-built,
  `new Database()` fails with:

  ```
  The module 'better_sqlite3.node' was compiled against a different Node.js
  version using NODE_MODULE_VERSION 145 [Electron]. This version of Node.js
  requires NODE_MODULE_VERSION 137 [Node].
  ```

  This is a build-output mismatch, not a protocol/runtime issue. The headless
  server now supports a separate Node-ABI `better_sqlite3.node` without
  disturbing the desktop's Electron-ABI build:
  - `pnpm run prepare:server-native` builds a Node-ABI binding into
    `dist/server-native/better_sqlite3.node`.
  - `src/server/cli.ts` marks the process as headless, and `src/main/db.ts`
    automatically uses that prepared binding when present.
  - Operators can override the binding path explicitly with
    `PORACODE_BETTER_SQLITE3_NATIVE_BINDING`.

  Verified against the built production CLI: with the prepared binding,
  `node dist/main/server.cjs` starts on an isolated data dir, serves the
  environment descriptor, exchanges the pairing token, returns an authenticated
  snapshot, and shuts down cleanly on SIGTERM.

- **HTTP-server boot is independent of native modules.** `RemoteAccessServer`
  binds and serves even if the supervisor (which needs `node-pty`) is degraded;
  `createHeadlessRemoteHost.test.ts` proves a real ephemeral-port bind with the
  DB stubbed.
- `wsl-helpers` resolution mirrors `main.ts` (packaged vs. dev). On non-Windows
  servers WSL is irrelevant; the path is still passed for parity.
