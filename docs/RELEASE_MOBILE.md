# Lightcode Mobile — deploy & release

The mobile app is the PWA in `src/mobile/` (entry `mobile.html`). It is a remote
client that pairs to a desktop's embedded remote-access server and reuses the
desktop renderer's components through a bridge shim.

It ships to **three targets** from the same web build:

| Target          | How it's served                                              | Talks to desktop over                 | Best for                                      |
| --------------- | ------------------------------------------------------------ | ------------------------------------- | --------------------------------------------- |
| **LAN PWA**     | The desktop's embedded server at `http://<lan-ip>:38987/app` | Same-origin HTTP (LAN)                | Zero-setup pairing on the same network        |
| **Hosted PWA**  | Vercel (`vercel.json` → `dist/mobile`)                       | HTTPS only ⚠️ (see below)             | Install entry, QR landing, app-vs-PWA routing |
| **Native apps** | App Store / Play, via Capacitor (`capacitor.config.ts`)      | HTTP **or** HTTPS (cleartext allowed) | Store presence, native camera/push            |

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

`build:mobile` sets `LIGHTCODE_BUILD_TARGET=mobile`, which makes `vite.config.ts`
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
3. On the **desktop**, set `LIGHTCODE_REMOTE_ACCESS_PAIRING_APP_URL=https://<your-host>`
   so the pairing QR encodes `https://<your-host>/pair?host=<desktop>#token=…`
   (this is what enables app-vs-PWA routing below).

Deploy: `Actions → Release Mobile` with **Web** ticked (or push a `mobile-v*` tag).

---

## 2. Native apps (Capacitor)

`capacitor.config.ts` wraps the built PWA (`webDir: dist/mobile`) as native iOS
and Android apps (`appId: com.lightcodeapp.mobile`). The native projects
(`android/`, `ios/`) are generated, not committed yet:

```bash
pnpm run build:mobile
pnpm exec cap add android      # one-time; generates android/
pnpm exec cap add ios          # one-time; generates ios/   (macOS + Xcode)
pnpm run cap:sync              # after every web build; syncs and patches native config
```

Commit `android/` and `ios/` once you customize them (icons, splash, signing,
store signing/export options). Until then, the release workflow bootstraps them
in CI with `cap add`. `scripts/configure-mobile-native.mjs` applies the native
pieces Lightcode needs after each sync:

- Android App Links intent filter for `https://<LIGHTCODE_MOBILE_APP_HOST>/pair`
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

- `LIGHTCODE_MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS` — one or more **Play app
  signing** SHA-256 certificate fingerprints, comma- or newline-separated.
- `LIGHTCODE_MOBILE_APPLE_TEAM_ID` — your Apple Team ID.
- `LIGHTCODE_MOBILE_APP_HOST` — the hosted PWA domain, for native app-link
  declarations (for example `app.lightcodeapp.com`, without a path).

When these values are absent, local/web builds emit valid non-associating files
instead of shipping placeholders. Android and iOS release jobs set
`LIGHTCODE_MOBILE_REQUIRE_ANDROID_LINKS=1` / `LIGHTCODE_MOBILE_REQUIRE_IOS_LINKS=1`,
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
| Web     | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, optional `LIGHTCODE_MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS`, optional `LIGHTCODE_MOBILE_APPLE_TEAM_ID`, var `LIGHTCODE_MOBILE_APP_HOST`                                                                                          |
| Android | `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, `LIGHTCODE_MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS`, var `LIGHTCODE_MOBILE_APP_HOST`, `PLAY_SERVICE_ACCOUNT_JSON` (optional → auto-publish), var `PLAY_TRACK` (default `internal`) |
| iOS     | `IOS_DIST_CERT_BASE64`, `IOS_DIST_CERT_PASSWORD`, `LIGHTCODE_MOBILE_APPLE_TEAM_ID`, var `LIGHTCODE_MOBILE_APP_HOST`, `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_PRIVATE_KEY`                                                                         |

Each platform job uses a GitHub Environment (`mobile-web` / `mobile-android` /
`mobile-ios`) so you can add required reviewers for production releases.
