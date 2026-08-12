# Canonical web app and native-shell release

Poracode ships one renderer build. `pnpm run build:web` creates `dist/web` for
`app.poracode.com`, installable PWA delivery, and both Capacitor shells. iOS and
Android do not contain a second client application; `cap sync` embeds that same
build.

The native application identifier remains `com.lightcodeapp.mobile` for store
continuity. This identifier describes the native package, not a separate mobile
web architecture.

## Release gates

```bash
pnpm install --frozen-lockfile
pnpm i18n:extract
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build:web

cd android
./gradlew lintRelease bundleRelease
```

The iOS archive/export gate runs on GitHub's macOS runner. The native release
workflow assigns a monotonic store build number and uses the version from
`package.json` or a `mobile-vX.Y.Z` tag.

## Public delivery

- Stable app: `https://app.poracode.com/`
- Nightly app: `https://app-nightly.poracode.com/`
- Privacy: `https://poracode.com/privacy`
- Support: `https://poracode.com/support`

The stable and nightly origins are separate installations, but each serves the
same canonical root application for desktop and compact layouts. Do not deploy
an alternate phone entry or select an app by user agent.

`vercel.json` deploys `dist/web`. The production manifest has `id`, `scope`,
and `start_url` set to `/`; the service worker owns that same root scope.
Legacy `/app`, `/desktop`, `/pair`, and `/mobile.html` paths permanently redirect
to `/`.

## Verified links and native association

The web build emits `.well-known/assetlinks.json` and
`.well-known/apple-app-site-association`. Configure:

| Variable                                           | Purpose                           |
| -------------------------------------------------- | --------------------------------- |
| `PORACODE_MOBILE_APPLE_TEAM_ID`                    | Apple Developer Team ID           |
| `PORACODE_MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS` | Play signing SHA-256 fingerprints |
| `PORACODE_MOBILE_APP_ID`                           | Optional package ID override      |

The root path is the canonical universal/app link. The legacy `/pair` and
`/app` patterns remain claimed only so installed older links can migrate.
Association files must return HTTP 200 as JSON without a redirect.

## Push configuration

Native push uses FCM/APNs and installed web apps use VAPID Web Push. Configure
the production secrets in the deployment environment:

- `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`
- `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_AUTH_KEY`, `APNS_TOPIC`, `APNS_ENV`
- `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`,
  `WEB_PUSH_VAPID_SUBJECT`

Keep a VAPID pair stable across deployments so existing installations do not
have to replace their subscriptions.

## GitHub environments

- `mobile-web` owns stable/nightly root web deployments.
- `mobile-android` owns keystore, Firebase, and Play publishing credentials.
- `mobile-ios` owns App Store Connect and Apple signing credentials.

The environment names preserve deployment history; they do not represent
separate renderer products.

For Android's first release, upload the signed AAB manually before enabling the
Play publishing API. For iOS, use a team App Store Connect API key and keep a
durable backup of the one-time `.p8` download outside GitHub.

Before promoting a release, verify the hosted root at wide and narrow widths,
installation/offline startup, root pairing and reconnect, a Capacitor app link,
native push, native SSH pairing, a real PTY, and at least one paid structured
provider turn.
