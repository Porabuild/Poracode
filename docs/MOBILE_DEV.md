# Mobile dev & remote pairing

Fast path for iterating on the **mobile app** (`src/mobile`) against a local
desktop **remote server**, with HMR. If you only read one thing: run
**`pnpm run dev:ios`** or **`pnpm run dev:android`**, then pair the
simulator/emulator.

## One command

```bash
pnpm run dev:ios      # iOS simulator
pnpm run dev:android  # Android emulator or USB device
```

Both run the same trio together (`concurrently -k`), plus one Android-only
helper:

| Sub-script                        | What it is                                               | Port    |
| --------------------------------- | -------------------------------------------------------- | ------- |
| `dev:mobile:server`               | Headless remote server (`build:electron` + `server.cjs`) | `38987` |
| `dev:mobile`                      | Vite dev server for the mobile target (HMR)              | `3100`  |
| `dev:ios:app` / `dev:android:app` | target-resolving `cap run <platform> --live-reload`      | —       |
| `android-reverse-server-port.mjs` | Android only: keeps `adb reverse tcp:38987` applied      | —       |

`dev:mobile:server` sets `LIGHTCODE_IS_DEV=1`, which turns on two dev-only
conveniences in the server (see [Why dev mode matters](#why-dev-mode-matters)):
loopback advertising + loopback CORS. **No other env vars are needed** — pairing
works against `http://127.0.0.1:38987/` out of the box.

The iOS and Android launch wrappers pass an explicit native target so Capacitor
does not stop at an interactive device picker under `concurrently`. Override the
automatic choice with `LIGHTCODE_IOS_TARGET=<simulator-udid>` or
`LIGHTCODE_ANDROID_TARGET=<device-or-avd-id>`.

The endpoint is the **same on both platforms**: the iOS simulator shares the
Mac's loopback natively, and on Android the reverse-port helper maps the
device's `127.0.0.1:38987` back to the host via `adb reverse` (works on
emulators and USB devices; it re-applies automatically when a device boots or
restarts). Capacitor itself forwards only the Vite port (`--forwardPorts` takes
a single pair), which is why the server port has its own helper.

The server's data dir is `~/.poracode`. Override with `LIGHTCODE_BASE_DIR` to run
an isolated instance (avoids the single-instance lock clash with a running
desktop app or a second server).

## Pair the simulator / emulator

1. Grab the pairing token — the server prints it at startup:
   ```
   [lightcode-server] pair a device:   http://127.0.0.1:38987/pair#token=lc_pair_…
   ```
   Need a fresh one (10-min TTL, in-memory only)? Send `SIGUSR2`:
   ```bash
   kill -SIGUSR2 "$(pgrep -f dist/main/server.cjs)"   # prints a new link to stdout
   ```
2. In the app: **Connections → Pair a connection**. Endpoint
   `http://127.0.0.1:38987/`, paste the `lc_pair_…` token, tap **Pair**.
3. Once universal links are live (below), a tapped pairing link opens the
   installed app and pairs automatically — no manual entry.

Driving the sim by automation? Enable **I/O → Keyboard → Connect Hardware
Keyboard** and **Edit → Automatically Sync Pasteboard** first; then per field:
copy → **Edit → Send Pasteboard** → tap field → ⌘A → ⌘V. The keyboard accessory
up/down arrows move focus between the two fields reliably.

## Why dev mode matters

Two things break dev pairing on a stock (non-dev) server; `LIGHTCODE_IS_DEV=1`
fixes both:

- **iOS ATS** (`ios/App/App/Info.plist` → `NSAllowsLocalNetworking`) permits
  cleartext to **loopback** but **not** a `192.168.x` LAN IP. A non-dev server
  auto-advertises the LAN IP → the WebView's fetch fails with **"Load failed"**.
  Dev mode advertises `127.0.0.1` (the sim shares the Mac's loopback).
  See `createHeadlessRemoteHost.ts` (`advertisedHost` dev default).
- **CORS** — the server's trusted origins only include portless
  `http://localhost`, not the dev origin `http://localhost:3100`, so the pairing
  fetch is CORS-blocked (also surfaces as **"Load failed"**). Dev mode trusts any
  **loopback** web origin (`isLoopbackWebOrigin` in
  `src/main/remote/server/security.ts`). Production is unchanged — only loopback,
  only in dev.

## Deep linking (Universal Links)

Goal: one `https://poracode.com/…` pairing link that opens the **installed app**
if present, else falls back to the hosted PWA. Product model: users without the
app land on the hosted PWA (`poracode.com/mobile-app`); users with it get the app.

**Already wired (app side):**

- `@capacitor/app` + `src/mobile/useDeepLinkPairing.ts` (mounted in
  `RootLayout`): consumes a tapped pairing URL — cold start via
  `App.getLaunchUrl()`, warm via the `appUrlOpen` event — parses it with
  `parsePairingUrl`, and calls `pairDesktop`. Inert on the hosted PWA (there,
  boot-time launch params are handled by `capturePairingLaunch()`).
- Native association host defaults to `poracode.com`
  (`scripts/configure-mobile-native.mjs`), which writes `applinks:poracode.com`
  into the iOS entitlement + the Android intent-filter on `cap:sync`/`cap:configure`.

**To make links actually route into the app (ops — needs secrets + hosting):**

1. **Apple Team ID** — set `LIGHTCODE_MOBILE_APPLE_TEAM_ID` (+ Android
   `LIGHTCODE_MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS`) so
   `scripts/finalize-mobile-build.mjs` emits a **non-empty** AASA/assetlinks into
   `dist/mobile/.well-known/` (AASA `appIDs = <team>.com.lightcodeapp.mobile`,
   components match `/pair*` and `/app*`).
2. **Host** `/pair`, `/app`, and `/.well-known/apple-app-site-association` on
   **poracode.com**. Today the mobile PWA is a _separate_ Vercel project (root
   `vercel.json` → `dist/mobile`) from the marketing site (`website/`). Either
   point poracode.com's domain at the mobile-PWA project, or add the rewrites +
   AASA route into `website/`.
3. **Desktop** — set `LIGHTCODE_REMOTE_ACCESS_PAIRING_APP_URL=https://poracode.com`
   in packaged builds so minted QR/links are `https://poracode.com/pair?host=…#token=…`.
4. Rebuild the app (`cap sync` + `pnpm run dev:ios`) so the entitlement + plugin
   ship. Universal-link routing **cannot be exercised in the simulator** until
   the app is built with the entitlement _and_ the AASA is served over https.

**Gotcha — no subpaths in pairing links.** `buildPairingUrl`
(`src/shared/remote/pairingUrl.ts`) does `new URL("/pair", base)`, which drops
any base path: `…poracode.com/mobile-app` still mints `…poracode.com/pair`.
Keep **`/pair`** as the pairing (universal-link) path and use `/mobile-app` as
the human-facing landing page. Changing that requires patching `buildPairingUrl`

- the Vercel rewrites + the AASA components together.

## Troubleshooting

- **"Load failed" on Pair** → almost always ATS or CORS (see [Why dev mode
  matters](#why-dev-mode-matters)). Confirm the server advertised loopback
  (`grep "listening at" server log` → `http://127.0.0.1:38987/`) and that you
  ran with `LIGHTCODE_IS_DEV=1`. Sanity-check CORS:
  ```bash
  curl -s -D - -o /dev/null -H "Origin: http://localhost:3100" \
    http://127.0.0.1:38987/.well-known/lightcode/environment | grep -i access-control
  ```
- **"data dir … is in use by another Lightcode process (pid N)"** → a desktop
  app or a prior server holds the lock. Kill it (`kill N`) or run with a separate
  `LIGHTCODE_BASE_DIR`.
- **Invalid pairing token** → tokens are single-use and expire in 10 min; mint a
  fresh one with `SIGUSR2` (above).
- **`@capacitor/app` not found at runtime in the sim** → the plugin is native;
  rebuild via `pnpm run dev:ios` (`cap run` re-syncs pods).
- **Android: "cannot run … adb"** → the reverse-port helper resolves adb from
  `ANDROID_HOME`/`ANDROID_SDK_ROOT`, then `android/local.properties`
  (`sdk.dir=…`), then `PATH`. Make sure one of those points at the SDK (Gradle
  needs `JAVA_HOME` too).
- **Android: pairing fetch fails on `127.0.0.1:38987`** → the `adb reverse`
  mapping is missing; check the `adb` pane of `dev:android` for the
  "device 127.0.0.1:38987 → host" line (emulator fallback: `10.0.2.2:38987`).

## Related

- `docs/REMOTE_ARCHITECTURE.md` — the remote server/client architecture.
- `docs/RELEASE_MOBILE.md` — release build, hosting, signing, AASA/assetlinks.
