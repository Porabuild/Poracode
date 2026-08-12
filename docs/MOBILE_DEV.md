# Unified web and native-shell development

Poracode has one renderer application. Electron, a desktop browser, an
installed PWA, and the Capacitor iOS/Android shells all boot `index.html` through
`src/renderer/bootstrap.ts`. There is no separate mobile entry, router, store,
or component tree.

Compact mode is selected at runtime from viewport, input modality, safe-area,
and virtual-keyboard state. It is not selected from the user agent. Resizing or
rotating changes layout without restarting the renderer or replacing project
and thread state.

## Development commands

```bash
pnpm run dev          # Electron and the canonical renderer
pnpm run dev:web      # headless host plus canonical browser renderer
pnpm run dev:ios      # canonical renderer in the iOS Capacitor shell
pnpm run dev:android  # canonical renderer in the Android Capacitor shell
```

`dev:web` prepares the backend and embedded SSH runtime, then starts the
headless host on the first free port from `49152` and the Vite renderer on port
`3100`. Open the `pair a device` URL printed by the server; it targets the Vite
app and carries the actual backend port plus the one-time pairing credential.
Both processes stop together with `Ctrl+C`. The server defaults to the isolated
`.tmp/poracode-web-dev` data directory so it can run beside Electron. Set
`PORACODE_BASE_DIR` or `PORACODE_REMOTE_ACCESS_PORT` before launching when a
different data directory or explicit port is intentional.

For process-level debugging, `pnpm run dev:web:client` starts only Vite and
`pnpm run dev:web:server` starts only the prepared headless host.

The native commands run three parts together:

| Process              | Purpose                                                          | Port     |
| -------------------- | ---------------------------------------------------------------- | -------- |
| `dev:web:server:run` | Headless Poracode host and authenticated API/WebSocket transport | `49152+` |
| `dev:web:client`     | The same renderer used by Electron, with Vite HMR                | `3100`   |
| Capacitor runner     | iOS/Android WebView pointed at the Vite renderer                 | n/a      |

Android also maintains `adb reverse tcp:49152 tcp:49152`. The iOS simulator
shares the host loopback interface. Override native target selection with
`PORACODE_IOS_TARGET=<simulator-udid>` or
`PORACODE_ANDROID_TARGET=<device-or-avd-id>`.
The native commands intentionally pin their backend to `49152` because the
simulator/device forwarding targets that port; stop another owner first if it
is already in use.

Use an isolated `PORACODE_BASE_DIR` when another Poracode process already owns
the normal data directory.

## Pairing

The server prints a root URL such as:

```text
http://127.0.0.1:3100/?host=http%3A%2F%2F127.0.0.1%3A49152#token=lc_pair_...
```

Open it directly, or enter the endpoint and token under Connections. The
canonical bootstrap exchanges the one-time credential, persists the resulting
session, and removes the credential from the visible URL. Capacitor handles
cold and warm app links through the same bootstrap path.

Legacy `/pair`, `/app`, `/desktop`, and `/mobile.html` URLs are migration-only
and permanently redirect to `/`; new links must target the root.

## Runtime boundaries

- Electron installs the native client adapter and uses IPC for local process,
  filesystem, PTY, window, and OS capabilities.
- Browsers install the authenticated remote bridge and use HTTP for commands and
  snapshots plus WebSocket for ordered live events.
- Capacitor uses the browser transport, then enables explicit native
  capabilities such as secure storage, push, app links, and the packaged SSH
  runtime.
- Unsupported operations are hidden or disabled through `ClientRuntime`
  capability checks. Layout never decides capabilities.

## Verification

For any layout or bootstrap change, test all of these without reloading between
wide and narrow states:

1. Electron at desktop width.
2. Chrome at desktop width and a touch-sized viewport.
3. Resize and rotate while a thread is open; identity and transcript state must
   remain stable.
4. Pair, reconnect, and replay live events.
5. Install the production build and reload it offline.
6. Exercise touch controls and an opened virtual keyboard.
7. Run the relevant real PTY and structured-provider smoke, not only mocks.

See `docs/REMOTE_ARCHITECTURE.md` for the transport and process model and
`docs/RELEASE_MOBILE.md` for native-shell signing and releases.
