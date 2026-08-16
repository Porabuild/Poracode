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
through handwritten remote-v3 models. That is an implemented feature slice,
not evidence of complete protocol coverage.

## Remote-v3 contract boundary

`protocol/remote/v3/manifest.json` is the canonical language-neutral inventory.
Protocol v3 currently describes:

- 56 HTTP routes;
- 100 supervisor procedures;
- 8 client-to-server WebSocket messages; and
- 9 server-to-client WebSocket messages.

`pnpm run protocol:remote:v3:generate` derives
`protocol/remote/v3/generated/inventory.json`, `ir.json`,
`json-schema.bundle.json`, and the manifest-listed native bundle under
`protocol/remote/v3/generated/native/`. `pnpm run protocol:remote:v3:check` is
side-effect free and rejects missing, extra, or stale generated artifacts.

The generated inventory carries separate compatibility identities:

- wire `protocolVersion` (currently 3);
- generator and binding-format versions (binding format currently 2); and
- hashes of the source contract and manifest.

The binding format must change when IR layout, schema naming, or omitted-versus-
null representation changes, even when the wire protocol stays at v3. A native
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
is only a transport tunnel: it does not terminate Poracode authorization or own
project/thread state.

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
