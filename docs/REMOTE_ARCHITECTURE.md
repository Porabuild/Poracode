# Poracode client and remote architecture

## Final shape

Poracode is one application with multiple hosts, not a desktop app plus a
mobile companion app.

```text
                           one React renderer
                    src/renderer/bootstrap.ts
                              |
                 ClientRuntime + window.poracode
                   /                       \
        Electron native adapter       Browser remote adapter
        bounded IPC procedures        authenticated HTTP + WS
                   |                       |
        Electron main process      desktop/headless remote host
                   \                       /
                     supervisor runtime
                agent SDKs, ACPs and real PTYs
```

Electron, Chrome, an installed PWA, and Capacitor all load the same `index.html`,
React tree, stores, actions, and view components. Layout changes are responsive;
transport and native authority change only at the runtime adapter boundary.

## Process ownership

### Renderer

The renderer owns presentation state, navigation, project/thread views,
composer state, normalized remote snapshots, and adaptive layout. It never
spawns an agent or owns a PTY.

### Electron main

Electron main owns the local OS boundary: windows, filesystem dialogs, app
lifecycle, updater integration, secure IPC exposure, and the connection to the
backend host. It must remain responsive and must not execute heavy agent work on
its event loop.

### Backend host and supervisor

The backend host owns persistence and orchestrates the supervisor. The
supervisor owns every structured provider process, ACP session, agent CLI, and
PTY. Expensive parsing, process I/O, SQLite work, and provider traffic stay
outside the renderer and Electron window process.

The desktop app and the headless server use the same backend/supervisor
protocol. A browser therefore reaches the same authoritative runtime that the
Electron renderer reaches; it does not run an agent in the browser.

The headless host starts its HTTP and WebSocket transport without spawning the
supervisor. The supervisor is forked on the first operation that needs agent,
PTY, provider, or Git runtime authority and is reused until it exits.

## Runtime adapters

`ClientRuntime` is the explicit capability contract.

- Electron installs the preload/IPC-backed adapter.
- A browser installs `src/renderer/browser/remoteBridge.ts`.
- Capacitor installs the browser adapter and adds declared native capabilities
  such as secure storage, native push, app links, and SSH transport.

Shared UI asks the capability contract whether an operation exists. It does not
infer authority from screen size, browser name, or user agent. A large tablet
can use compact layout with browser capabilities; a narrow Electron window can
use compact layout while retaining Electron capabilities.

## Remote transport

Commands and bounded snapshots use authenticated HTTP. Ordered live supervisor
events use WebSocket with tickets, sequence numbers, replay, interest filtering,
payload limits, and resynchronization. Reconnect replays from the last sequence
when possible and refreshes authoritative state when replay is no longer
available.

Pairing exchanges a short-lived, one-time credential for a scoped session. New
pairing links target `/` on the chosen app origin. The browser bootstrap removes
the credential from the address bar after exchange and restores the persisted
session on later launches.

Direct LAN/VPN/Tailscale connectivity is the default. The relay is a transport
tunnel for cross-network access; it does not terminate Poracode authorization or
become the source of project/thread state.

## Web and PWA delivery

`pnpm run build:web` produces `dist/web` from the canonical entry. The root
manifest and service worker make that build installable and provide an offline
app shell. Hashed assets are cache-first; navigations are network-first with the
cached root shell as fallback. Cross-origin remote-host API and WebSocket
traffic is not intercepted.

`app.poracode.com/` is the only stable public app URL. There is no `/desktop`
product route and no phone-specific entry. Legacy `/app`, `/desktop`, `/pair`,
and `/mobile.html` paths are permanent migration redirects to `/`.

Capacitor embeds `dist/web`; it does not select a mobile router or alternate
store. Native association files claim the root app URL and retain legacy paths
only for migration.

## Adaptive layout

Compact presentation is derived from observable environment state:

- viewport and container width
- coarse/fine pointer and hover capability
- safe-area insets
- orientation
- visual viewport and virtual-keyboard occlusion

The switch is live and preserves mounted application state. User-agent phone
detection is forbidden because it fails on tablets, desktop touch devices,
resized windows, split-screen, and external displays.

## Performance invariants

1. Agent and terminal processes are supervisor children, never renderer
   children.
2. The renderer receives bounded normalized events and batches store updates.
3. Slow clients are disconnected and recover through replay/resync instead of
   creating unbounded queues.
4. Snapshot construction avoids loading full transcript payloads for unrelated
   threads.
5. Layout changes do not restart transports, stores, or agent sessions.
6. Browser and Electron views use the same data model, preventing duplicate
   normalization and divergent caches.

## Compatibility boundaries

Changes to `ClientRuntime`, persisted remote servers, remote protocol payloads,
service-worker cache identity, native packaged runtime manifests, and pairing
URLs require an intentional version/migration review. Old artifacts that cannot
operate safely must be migrated or invalidated; they must not be silently read
as the new format.

## Completion verification

Architecture work is complete only after automated checks and real runtime
proof cover:

- Electron and desktop Chrome
- narrow touch viewport plus live resize/rotation
- installability and offline restart
- pairing, credential cleanup, reconnect, replay, and session restoration
- Capacitor app links, secure storage, push, and native SSH
- a real PTY and a real paid-provider/ACP turn
- sustained multi-agent output while measuring renderer responsiveness

Static, unit, and mock tests establish contracts; they do not replace those
runtime proofs.
