# Poracode client and remote architecture

## System shape

Poracode has four client surfaces with one authoritative backend model. The two
native mobile apps are independent applications, not hosts for the React
renderer.

```text
 Electron desktop          Browser / installed PWA      iOS app        Android app
 React renderer            React renderer               SwiftUI        Compose
       |                           |                     URLSession       OkHttp
 bounded IPC                    HTTP + WS                HTTP + WS      HTTP + WS
       |                           |                        |               |
 Electron main/backend host      +------------------------+---------------+
       |                                                   |
       +---------------- backend/headless remote host -----+
                              |
                       supervisor runtime
                  provider SDKs, ACPs and real PTYs
```

Electron and browser/PWA clients share `src/renderer` and its provider-agnostic
data model. The SwiftUI project under `ios/` and the Compose project under
`android/` do not import that UI, embed `dist/web`, or execute it in a WebView.
They implement their own navigation, presentation state, lifecycle, secure
storage, and transport adapters while following the same remote-v3 vocabulary
and state transitions.

Shared behavior means protocol and semantic parity, not shared UI/runtime code.
A new native feature must be implemented and tested on each platform.

## Process and authority ownership

### Client presentation processes

Each client owns only presentation and client-side session state: navigation,
host selection, project/thread views, composer state, normalized snapshots,
reconnect state, and platform lifecycle. No React renderer, SwiftUI app, Compose
app, or browser process may spawn an agent or own a PTY.

The Electron renderer accesses local authority through the versioned
`ClientRuntime` IPC contract. The browser/PWA uses
`src/renderer/browser/remoteBridge.ts`. The native apps use platform-native HTTP
and WebSocket clients rather than implementing `ClientRuntime` or loading the
browser bridge.

### Electron main and backend host

Electron main owns the desktop OS boundary: windows, filesystem dialogs, app
lifecycle, updater integration, secure IPC exposure, and the local backend-host
connection. Heavy agent, PTY, Git, SQLite, and provider work must not run on its
window event loop.

The desktop app and `dist/main/server.cjs` share the backend/supervisor model.
The backend host owns persistence and remote authorization. The headless host
can begin serving HTTP and WebSocket traffic before the supervisor is forked;
the supervisor starts lazily on the first operation that needs agent, PTY,
provider, or Git authority and is then reused.

### Supervisor

The supervisor is the sole owner of structured provider processes, ACP
sessions, terminal-native agent CLIs, and real PTYs. It emits normalized events
to the backend host. Every client observes or commands that same authoritative
runtime; none simulates agent state locally.

## Native client layers

The platform implementations are parallel in responsibility, not source code:

| Layer            | iOS                                        | Android                                |
| ---------------- | ------------------------------------------ | -------------------------------------- |
| UI/lifecycle     | SwiftUI, Observation, native app lifecycle | Compose, Material 3, Android lifecycle |
| HTTP/WebSocket   | URLSession                                 | OkHttp                                 |
| Async work       | Swift concurrency                          | Kotlin coroutines                      |
| Credentials      | Keychain-backed storage                    | Android Keystore-backed storage        |
| Durable metadata | Atomic native stores                       | DataStore/native stores                |

Both apps currently implement pairing, persisted hosts, bounded snapshots,
thread history/actions, ordered live events, reconnect, and resynchronization
through generated codecs and app-owned domain models. That is an implemented feature slice,
not evidence of complete protocol coverage.

## Remote-v3 contract boundary

`protocol/remote/v3/manifest.json` is the canonical language-neutral inventory.
The `v3` directory name is retained; the current wire protocol version is 9.
The inventory describes:

- 61 HTTP routes;
- 100 supervisor procedures;
- 8 client-to-server WebSocket messages; and
- 9 server-to-client WebSocket messages.

`pnpm run protocol:remote:v3:generate` derives
`protocol/remote/v3/generated/inventory.json`, `ir.json`,
`json-schema.bundle.json`, and the manifest-listed native bundle under
`protocol/remote/v3/generated/native/`. `pnpm run protocol:remote:v3:check` is
side-effect free and rejects missing, extra, or stale generated artifacts.

The generated inventory carries separate compatibility identities:

- wire `protocolVersion` (currently 10);
- generator and binding-format versions (binding format currently 2); and
- hashes of the source contract and manifest.

The binding format must change when IR layout, schema naming, or omitted-versus-
null representation changes, even when the wire protocol version is unchanged. A native
binding bundle must embed the matching version/hash identity so stale Swift or
Kotlin output cannot silently compile against a newer contract.

### Current binding status

The generator emits executable Swift and Kotlin roots for every inventoried
route, procedure, and WebSocket union. Both production app targets compile the
manifest-listed language bundle and fail their build on incompatible versions
or source membership drift. Stable native facades validate canonical JSON at
transport boundaries and project it into app-owned domain models; UI state does
not depend directly on hash-derived generated wire types.

Generation coverage is not the same as product availability. The foundation,
push, history, send/interrupt, and known WebSocket boundaries are wired through
the generated codecs. Project, rich-chat, attachment, terminal, settings, and
integration operations are being connected in explicit parity batches. The
native parity ledger must not mark a route or procedure implemented until its
transport, lifecycle/controller behavior, UI, and end-to-end evidence all land.

## Remote transport

Bounded discovery, snapshots, binary fetches/uploads, redirects, and commands
use authenticated HTTP. Ordered live supervisor events use JSON text frames over
WebSocket.

The v3 transport includes:

- one-time pairing credentials exchanged for scoped bearer sessions;
- one-use WebSocket tickets rather than bearer tokens in the upgrade URL;
- monotonically sequenced replayable events and `lastSeenSeq` resume;
- thread-item interest filtering;
- heartbeat/liveness handling and payload/body limits;
- explicit resynchronization when replay is unavailable or sequence state is
  unsafe; and
- terminal cursor-sync negotiation, with snapshot/scrollback recovery for
  non-replayable terminal output.

Clients preserve a configured endpoint base path when appending discovery, API,
and WebSocket paths. They reject unsafe redirects and public cleartext
connections. Direct LAN, VPN, or Tailscale connectivity is the default. A relay
forwards transport traffic; the host still enforces Poracode authorization and
owns project/thread state. The relay terminates visitor HTTP/WebSocket
connections and can read forwarded credentials and payloads. It must be trusted;
the relay framing does not provide end-to-end encryption.

The self-hostable relay transport has its own wire version
(`PORACODE_RELAY_PROTOCOL_VERSION`, currently 3). Protocol 3 preserves binary
WebSocket payloads exactly: they travel between host and relay as binary
control-socket messages framed by `relayBinaryFrame`, while text payloads keep
the unchanged JSON `ws-data` frame. A protocol-2 peer cannot preserve those
semantics, so a v3 host against a v2 relay (or a v3 relay against a v2 host)
fails registration instead of pairing with silent byte corruption. Within a
version, relay frames are added only additively and must be droppable by older
peers (`req-cancel`, introduced in v2 and retained in v3, followed that rule).

The remote host remains the source of truth after reconnect. A client may replay
from its last applied sequence only while the server confirms that replay is
available; otherwise it discards uncertain incremental state and fetches an
authoritative snapshot.

## Pairing and credential lifecycle

Pairing begins with the public environment descriptor and a short-lived,
single-use credential. The credential is carried in a URL fragment or request
body so it is not sent as an HTTP request path/query by normal navigation. After
exchange, clients persist only the scoped session credential in platform-secure
storage and scrub transient pairing material.

The browser removes pairing material from the address bar after exchange. The
native apps parse verified links and the `poracode://pair` development fallback,
validate the endpoint before replacing an existing host, and show a sanitized
host during confirmation.

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
  keyed on `remoteAddress`, which is always loopback behind the relay. The relay
  now mints an opaque per-visitor `clientId` — an HMAC of the visitor's real
  socket address under a per-relay salt, never derived from spoofable visitor
  headers and never a raw address — frames it on `req`/`ws-open`, and the host
  adapter forwards it as the stable `x-forwarded-for` the server keys loopback
  buckets on. The identity is stable across a visitor's requests and WebSockets;
  an earlier draft keyed it on the relay's per-request frame id, which handed
  every request a fresh bucket and silently disabled the limiter. Relays too old
  to send `clientId` share one conservative bucket instead.
- **Headless data-dir lock + host binding (high, stability/bug).** The headless
  CLI takes an exclusive `server.lock` (stale-pid reclaim) so it can't co-open
  the desktop's live data dir with a mismatched secret key; the relay adapter's
  local proxy base is derived from the actual bind host (only `127.0.0.1` for
  wildcard binds), fixing ECONNREFUSED when bound to a Tailscale/VPN IP. SQLite
  uses its package-bundled N-API binary, independent of the launch directory.
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

Production app/universal links require matching association documents at
`https://poracode.com/.well-known/`. Declarations in the native manifests and
generated JSON files are necessary but are not proof that the production origin
is configured correctly.

## Web and PWA delivery

The hosted React client remains a supported, separate surface.
`pnpm run build:web` produces `dist/web`; its root-scoped manifest and service
worker make it installable. Hashed assets are cache-first, navigations are
network-first with a cached shell fallback, and cross-origin remote-host HTTP
and WebSocket traffic is not intercepted.

- **Connectivity (now):** direct connection remains the default (LAN / VPN /
  Tailscale), and the self-hostable relay transport is available for
  cross-network deployments. The managed cloud subscription layer is outside
  this repo and can sit on top of the relay protocol.
- **Headless runtime:** plain-Node CLI. The composition root is runtime-agnostic;
  packaging the N-API prebuilds of `better-sqlite3` / `node-pty` lets Node and
  Electron use the same native packages.
- **Source of truth (headless):** the SQLite DB. No renderer, so
  `dispatchThreadCommand` is absent and the DB-path handlers apply.

`app.poracode.com/` is the stable PWA origin and
`app-nightly.poracode.com/` is the nightly origin. Legacy `/app`, `/desktop`,
`/pair`, and `/mobile.html` paths redirect to `/`. These deployments do not
build, package, or update the SwiftUI and Compose apps.

Responsive layout rules in `src/renderer` apply only to Electron and the
browser/PWA. Native adaptive layouts are implemented independently with SwiftUI
and Compose platform APIs.

## Performance and lifecycle invariants

1. Only the supervisor owns agent and terminal processes.
2. Clients receive bounded normalized snapshots/events and must not accumulate
   unbounded queues.
3. Slow or disconnected clients recover through replay/resync, never by
   back-pressuring agent processes indefinitely.
4. Snapshot construction avoids loading full transcript payloads for unrelated
   threads; native clients hydrate only the active interests they need.
5. Rotation, resize, split-screen, and background/foreground changes do not
   restart agent sessions.
6. Each native session/task is tied to host identity and lifecycle generation so
   stale work cannot commit state after a host switch or unpair.
7. Credentials remain in secure storage and are removed transactionally when a
   session is invalidated.

## Compatibility boundaries

Review and version every change to:

- `ClientRuntime` and Electron IPC;
- remote protocol payloads, manifest, binding IR, or native generated bundles;
- persisted host/session documents and secure-storage envelopes;
- WebSocket replay/cursor state and pairing URLs;
- service-worker cache identity; and
- deployed host/helper/plugin manifests.

An old artifact that cannot be used safely must be migrated or deliberately
invalidated. Protocol v3 and binding format v2 are separate boundaries; updating
one does not implicitly update the other.

## Evidence and remaining gaps

The current native CI proves contract artifact consistency, native compilation,
iOS unit tests, Android unit/lint checks, Android 17/API 37 install and launch,
and a real production headless-host pairing/socket smoke path. It does not yet
prove:

- transport/controller/UI availability for every generated manifest entry;
- complete feature parity with Electron/PWA;
- end-to-end SwiftUI and Compose UI flows against a real host;
- production universal/app-link association;
- native APNs/FCM registration, delivery, tap routing, and revocation; or
- sustained native performance, memory, network, and battery behavior under
  multi-agent output.

Architecture work is complete only when runtime evidence covers Electron,
desktop browser/PWA, SwiftUI, and Compose independently; pairing and credential
cleanup; reconnect/replay/resync; minimum/current OS lifecycle and accessibility;
a real PTY; and a real structured-provider/ACP turn. Static, unit, schema, mock,
and host-wire tests establish important contracts but do not replace those
client proofs.

- **Native SQLite binding:** better-sqlite3 13 bundles N-API prebuilds shared
  by Node and Electron. Both desktop and headless startup use the package's
  platform/architecture selection. Old `dist/server-native` binaries are ignored
  automatically so an upgrade cannot load a previous-generation SQLite addon.
  - `pnpm run prepare:server-native` copies the current N-API prebuild into
    `dist/server-native/better_sqlite3.node` for callers that need a standalone file.
  - Operators can explicitly select a compatible SQLite 13 binary with
    `PORACODE_BETTER_SQLITE3_NATIVE_BINDING`.

- **HTTP-server boot is independent of native modules.** `RemoteAccessServer`
  binds and serves even if the supervisor (which needs `node-pty`) is degraded;
  `createHeadlessRemoteHost.test.ts` proves a real ephemeral-port bind with the
  DB stubbed.
- `wsl-helpers` resolution mirrors `main.ts` (packaged vs. dev). On non-Windows
  servers WSL is irrelevant; the path is still passed for parity.
