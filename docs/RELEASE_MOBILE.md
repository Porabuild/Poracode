# Poracode Mobile — deploy & release

The mobile app is the PWA in `src/mobile/` (entry `mobile.html`). It is a remote
client that pairs to a desktop's embedded remote-access server and reuses the
desktop renderer's components through a bridge shim.

It ships to **three targets** from the same web build:

| Target          | How it's served                                              | Talks to desktop over                 | Best for                                      |
| --------------- | ------------------------------------------------------------ | ------------------------------------- | --------------------------------------------- |
| **LAN PWA**     | The desktop's embedded server at `http://<lan-ip>:38987/app` | Same-origin HTTP (LAN)                | Zero-setup pairing on the same network        |
| **Hosted PWA**  | Vercel (`vercel.json` → `dist/mobile`)                       | HTTPS only ⚠️ (see below)             | Install entry, QR landing, app-vs-PWA routing |
| **Native apps** | App Store / Play, via Capacitor (`capacitor.config.json`)    | HTTP **or** HTTPS (cleartext allowed) | Store presence, native camera/push            |

### ⚠️ The mixed-content constraint

A page served over **HTTPS cannot open HTTP connections to a LAN address** —
browsers block it as mixed content. The desktop server exposes plain HTTP on the
LAN, so:

- **LAN PWA** works because it is itself served over HTTP (same origin). ✅
- **Hosted PWA** (HTTPS) can only reach a desktop that is _also_ reachable over
  HTTPS (e.g. a tunnel such as Tailscale Funnel / Cloudflare Tunnel, or a reverse
  proxy). Pairing to a plain-HTTP LAN desktop from the hosted PWA is blocked; the
  app detects this and shows an explanation (see `isMixedContentEndpoint`). ⚠️
- **Native apps** load from a local `https://`/`capacitor://` origin but the
  WebView is configured to allow cleartext to the LAN desktop
  (`server.cleartext`/`allowMixedContent` on Android; ATS exception on iOS), so
  they pair to a plain-HTTP LAN desktop just like the LAN PWA. ✅

Net: the **LAN PWA and the native apps are the fully-working LAN experiences**;
the hosted PWA is the install/landing surface and the HTTPS-desktop path.

---

## Build

```bash
pnpm run build:mobile      # → dist/mobile (mobile-only; emits index.html + mobile.html)
```

`build:mobile` sets `PORACODE_BUILD_TARGET=mobile`, which makes `vite.config.ts`
build only the mobile entry into `dist/mobile`, then `scripts/finalize-mobile-build.mjs`
mirrors `mobile.html` → `index.html` (what Vercel and Capacitor serve at `/`) and
generates the app-link association files under `dist/mobile/.well-known/`.

PWA assets are static under `public/` (`manifest.webmanifest`, `service-worker.js`,
`app-icon.svg`, `icons/`) and are copied verbatim into the build. The desktop
server serves equivalents at runtime (`src/main/remote/pairingPage.ts`) and now
also serves the PNG icon set from `/icons/*`.

---

## 1. Hosted PWA on Vercel

`vercel.json` (repo root) is a ready-to-connect config:

- `installCommand`: `pnpm install --frozen-lockfile --ignore-scripts` (skips the
  Electron native rebuild, which isn't needed for the web build).
- `buildCommand`: `pnpm run build:mobile`, `outputDirectory`: `dist/mobile`.
- Rewrites `/`, `/app`, `/pair` → the app entry; long-cache headers for hashed
  assets; correct content types for the manifest and the AASA file.

**Setup**

1. Create a Vercel project pointing at this repo, Root Directory = repo root.
2. Add repo secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
3. On the **desktop**, turn on **Settings → Remote Access** and set
   `PORACODE_REMOTE_ACCESS_PAIRING_APP_URL=https://<your-host>`
   so the pairing QR encodes `https://<your-host>/pair?host=<desktop>#token=…`
   (this is what enables app-vs-PWA routing below).

Deploy: `Actions → Release Mobile` with **Web** ticked (or push a `mobile-v*` tag).

---

## 2. Native apps (Capacitor)

`capacitor.config.json` wraps the built PWA (`webDir: dist/mobile`) as native iOS
and Android apps (`appId: com.lightcodeapp.mobile`). This pre-rebrand identifier is intentionally
retained so Poracode upgrades preserve the existing Lightcode app sandbox. The native projects
(`android/`, `ios/`) are generated, not committed yet:

```bash
pnpm run build:mobile
pnpm exec cap add android      # one-time; generates android/
pnpm exec cap add ios          # one-time; generates ios/   (macOS + Xcode)
pnpm run cap:sync              # after every web build; syncs and patches native config
```

Commit `android/` and `ios/` once you customize them (icons, splash, signing,
store signing/export options). Until then, the release workflow bootstraps them
in CI with `cap add`. Brand the freshly generated projects (Poracode app icons,
adaptive-icon layers, dark splash screens) with:

````bash
node branding/assets/build-native-assets.mjs
``` `scripts/configure-mobile-native.mjs` applies the native
pieces Poracode needs after each sync:

- Android App Links intent filter for `https://<PORACODE_MOBILE_APP_HOST>/pair`
  and `/app`.
- iOS `NSAllowsLocalNetworking` for LAN desktop pairing.
- iOS Associated Domains entitlements for `applinks:` and `webcredentials:`.

> **Why Capacitor for both stores?** iOS has no Trusted Web Activity equivalent
> and Apple rejects thin web wrappers (guideline 4.2), so a native shell is
> required there regardless; using Capacitor for Android too keeps one toolchain
> and a real camera for QR scanning. If you'd rather ship Android as a
> lightweight **TWA**, use Bubblewrap against the hosted PWA + `assetlinks.json`
> and drop the Android job from the workflow.

---

## 3. Deep linking — open the installed app vs the PWA

This is handled at the OS level by **Universal Links (iOS)** and **App Links
(Android)**, not by JavaScript guessing. When the desktop QR points at the hosted
domain (step 1.3 above) and the domain is associated with the native app, then
scanning the QR:

- **App installed** → the OS opens the **native app** at `/pair?host=…#token=…`.
- **App not installed** → it opens in the browser as the **PWA**.

To enable this, configure the release secrets that `scripts/finalize-mobile-build.mjs`
uses to generate the hosted association files:

- `PORACODE_MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS` — one or more **Play app
  signing** SHA-256 certificate fingerprints, comma- or newline-separated.
- `PORACODE_MOBILE_APPLE_TEAM_ID` — your Apple Team ID.
- `PORACODE_MOBILE_APP_HOST` — the hosted PWA domain, for native app-link
  declarations (for example `app.poracodeapp.com`, without a path).

When these values are absent, local/web builds emit valid non-associating files
instead of shipping placeholders. Android and iOS release jobs set
`PORACODE_MOBILE_REQUIRE_ANDROID_LINKS=1` / `PORACODE_MOBILE_REQUIRE_IOS_LINKS=1`,
so a store build fails if the platform's association value or app host is missing.

In-browser, the app also offers **Add to Home Screen** when the browser exposes
an install prompt (`src/mobile/pwaInstall.ts`), and detects standalone/native
launch so it doesn't nag installed users.

---

## 4. Release workflow & partial releases

`.github/workflows/release-mobile.yml` releases each target independently.

- **Manual / partial:** `Actions → Release Mobile → Run workflow`, then tick any
  combination of **Web / Android / iOS**. Each platform job is gated by its
  checkbox, so you can ship web-only, or push an iOS-only hotfix.
- **Full release:** push a tag `mobile-vX.Y.Z` — all three targets release.

Builds always upload the **AAB / IPA as artifacts**, so the workflow produces
installable binaries even before store credentials are configured; the store
upload steps activate automatically once their secrets are present.

### Secrets

| Target  | Secrets                                                                                                                                                                                                                                                                                 |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web     | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, optional `PORACODE_MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS`, optional `PORACODE_MOBILE_APPLE_TEAM_ID`, var `PORACODE_MOBILE_APP_HOST`                                                                                          |
| Android | `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, `PORACODE_MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS`, var `PORACODE_MOBILE_APP_HOST`, `PLAY_SERVICE_ACCOUNT_JSON` (optional → auto-publish), var `PLAY_TRACK` (default `internal`) |
| iOS     | `IOS_DIST_CERT_BASE64`, `IOS_DIST_CERT_PASSWORD`, `PORACODE_MOBILE_APPLE_TEAM_ID`, var `PORACODE_MOBILE_APP_HOST`, `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_PRIVATE_KEY`                                                                         |

Each platform job uses a GitHub Environment (`mobile-web` / `mobile-android` /
`mobile-ios`) so you can add required reviewers for production releases.

---

## 5. Push notifications, Live Activities (iOS) & Android push

Background push (turn complete / needs input) and lock-screen / Dynamic Island
**Live Activities** are iOS-only. They ride on two Capacitor plugins:

- `@capacitor/push-notifications` — ordinary APNs alert pushes (device token).
- `@poracode/activity-bridge` — a **local** plugin in `native/activity-bridge/`
  bridging ActivityKit (start/end activities, push-to-start + per-activity
  update tokens). No-op on Android/web. Linked from the root `package.json` as
  `"@poracode/activity-bridge": "file:native/activity-bridge"`.

The desktop never talks to APNs directly (the `.p8` auth key can't ship in the
app); it posts to a small hosted **push gateway** that holds the key and signs
the APNs JWT. See `docs/superpowers/specs/2026-07-02-live-activities-design.md`.

### iOS floor

- Live Activities: **iOS 16.2+**.
- Push-to-start (remote activity start with the phone's app never opened):
  **iOS 17.2+**.

Everything is runtime-gated with `#available`, so the app still builds and runs
on the Capacitor 8 default deployment target and simply reports Live Activities
as unavailable below the floor.

### What `scripts/configure-mobile-native.mjs` does automatically

Run after every `cap sync` (via `pnpm run cap:sync`). When `ios/` is present it:

- Sets `NSSupportsLiveActivities` and `NSSupportsLiveActivitiesFrequentUpdates`
  to `YES` in the **app** target's `Info.plist`.
- Adds `aps-environment` to `ios/App/App/App.entitlements` (default
  `production`; override with `PORACODE_IOS_APS_ENVIRONMENT=development` for
  debug/TestFlight sandbox builds) and wires `CODE_SIGN_ENTITLEMENTS`.
- Copies the widget-extension sources from `native/ios/PoracodeActivities/`
  into `ios/App/PoracodeActivities/` (idempotent), so the manual Xcode step is
  just "add existing folder as a target".

### One-time manual Xcode steps

Target injection into `project.pbxproj` is **not** scripted (too fragile).
After the first `cap add ios` + `pnpm run cap:sync`:

1. **Push Notifications capability.** Select the `App` target →
   Signing & Capabilities → **+ Capability → Push Notifications**. (The script
   already added `aps-environment`; this registers the capability in Xcode.)
2. **Create the widget extension target.** File → New → Target →
   **Widget Extension**, name it `PoracodeActivities`, and tick "Include Live
   Activity". Delete Xcode's boilerplate sources.
3. **Add the copied sources.** Right-click the new target group → Add Files →
   select `ios/App/PoracodeActivities/` (`PoracodeActivitiesBundle.swift`,
   `DesktopSessionLiveActivity.swift`, `ThreadStatusDisplay.swift`, `Info.plist`),
   added to the `PoracodeActivities` target.
4. **Share the ActivityAttributes file.** Add
   `native/activity-bridge/ios/Sources/ActivityBridgePlugin/DesktopSessionAttributes.swift`
   to the `PoracodeActivities` target's membership as well (it is already
   compiled into the app plugin target). ActivityKit requires the **exact same**
   `ActivityAttributes` type in both targets — use one shared file reference,
   do not copy it.
5. **Bundle id & signing.** Set the extension's bundle id to
   `com.lightcodeapp.mobile.PoracodeActivities` (must be prefixed by the app id
   `com.lightcodeapp.mobile`), select the team, and let Xcode manage the
   extension's provisioning profile.

Commit `ios/` once these are done (per the existing "commit once customized"
convention); CI's fresh `cap add ios` won't recreate the target.

### APNs key / gateway secrets

The push gateway (hosted alongside the PWA — same Vercel project) needs the
team's APNs auth key. These live in the **website deployment** environment, not
the app build:

| Var             | Meaning                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------- |
| `APNS_KEY_ID`   | Key ID of the `.p8` APNs auth key.                                                                  |
| `APNS_TEAM_ID`  | Apple Team ID.                                                                                      |
| `APNS_AUTH_KEY` | The `.p8` private key contents (PEM).                                                               |
| `APNS_TOPIC`    | App bundle id `com.lightcodeapp.mobile` (activity pushes use the `.push-type.liveactivity` suffix). |

Use the APNs **sandbox** host + `aps-environment=development` for
debug/TestFlight-sandbox device tokens, and the production host + `production`
for App Store / TestFlight-production builds.

### Android push (FCM)

Android gets **no native code and no Live Activities**. The desktop sends FCM
**notification** messages, which Android auto-renders — Capacitor's push plugin
still receives them in-app when foregrounded (so no double-notify). Each thread's
status pushes share `collapse_key`/`tag = threadId`, so successive updates
(`Running` → `Needs your input` → `Finished`) **replace** each other in the tray,
approximating a status card. There is **no live card**: Android 16 Live Updates is
a future increment.

The same hosted push gateway (`/api/push`) also fronts FCM: the desktop POSTs
`{ platform: "android", token, pushType: "alert", payload: { title, body,
threadId, silent? }, priority, collapseId }`, and the gateway forwards it to FCM
HTTP v1 with a service-account OAuth2 bearer.

**Firebase setup.** Create a Firebase project, add an Android app with id
`com.lightcodeapp.mobile`, and download its `google-services.json`. Point
`PORACODE_ANDROID_GOOGLE_SERVICES_JSON` at that file (a path, relative to the
repo root or absolute). Generate a **service-account** key (Project settings →
Service accounts → Generate new private key) for the gateway env below.

**What `scripts/configure-mobile-native.mjs` does automatically** (when `android/`
is present): copies `google-services.json` into `android/app/`, adds the
`com.google.gms:google-services` classpath to `android/build.gradle`, and ensures
the plugin is applied in `android/app/build.gradle` (Capacitor's template already
guards this, so it's usually a no-op). All steps are idempotent and warn (never
fail) when the env var or `android/` is absent.

**Gateway env vars** (website deployment, alongside the APNs vars — an iOS-only or
Android-only deployment works without the other's env being present):

| Var                | Meaning                                                         |
| ------------------ | --------------------------------------------------------------- |
| `FCM_PROJECT_ID`   | Firebase project id (the `{project}` in the v1 send URL).       |
| `FCM_CLIENT_EMAIL` | Service-account client email (the OAuth2 JWT `iss`).            |
| `FCM_PRIVATE_KEY`  | Service-account private key (PEM; `\n`-escapes are normalized). |
````
