# Poracode mobile beta release

Poracode ships one mobile client from `src/mobile` to a hosted PWA, Android via
Capacitor, and iOS via Capacitor. The native application identifier is locked to
`com.lightcodeapp.mobile`; the iOS Live Activity extension uses
`com.lightcodeapp.mobile.PoracodeActivities`.

The first beta is an internal TestFlight build and a Google Play internal-test
release. Public store-listing screenshots and promotional art are not part of
the internal-beta gate.

## Repository release gates

Run these before creating a mobile release:

```bash
pnpm install --frozen-lockfile
pnpm i18n:extract
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build:mobile

cd android
./gradlew lintRelease bundleRelease
```

The signed iOS archive/export gate runs on GitHub's `macos-26` image with Xcode 26. It cannot run on Windows. `.github/workflows/release-mobile.yml` assigns a
unique store build number from `GITHUB_RUN_NUMBER` and `GITHUB_RUN_ATTEMPT`, and
reads the three-integer marketing version from `package.json` (or a
`mobile-vX.Y.Z` tag).

## Public URLs

These URLs are Poracode's hosted-PWA, legal, and verified-link acceptance gates.
Internal TestFlight and Play installation can work without the association
endpoints, but the links must be live before testing universal/app links or
using them as store metadata:

- Stable PWA: `https://app.poracode.com/`
- Nightly PWA: `https://app-nightly.poracode.com/`
- Privacy policy: `https://poracode.com/privacy`
- Support: `https://poracode.com/support`
- Apple association: `https://poracode.com/.well-known/apple-app-site-association`
- Android association: `https://poracode.com/.well-known/assetlinks.json`

The association routes are owned by the marketing website. Configure these in
the production environment for that Vercel project:

| Variable                                           | Value                                                    |
| -------------------------------------------------- | -------------------------------------------------------- |
| `PORACODE_MOBILE_APPLE_TEAM_ID`                    | Apple Developer Team ID                                  |
| `PORACODE_MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS` | Play App Signing SHA-256 fingerprint(s), comma separated |
| `PORACODE_MOBILE_APP_ID`                           | Optional; defaults to `com.lightcodeapp.mobile`          |

Both endpoints intentionally return valid empty associations until the account
values exist. After configuration, verify a direct 200 response with
`Content-Type: application/json` and no redirect.

The production push gateway runs in the same Vercel project. Configure these as
encrypted production environment variables before testing notifications:

| Variable                     | Value                                                           |
| ---------------------------- | --------------------------------------------------------------- |
| `FCM_PROJECT_ID`             | Firebase project ID                                             |
| `FCM_CLIENT_EMAIL`           | Firebase service-account email                                  |
| `FCM_PRIVATE_KEY`            | Firebase service-account private key                            |
| `APNS_KEY_ID`                | Apple Push Notifications key ID                                 |
| `APNS_TEAM_ID`               | Apple Developer Team ID                                         |
| `APNS_AUTH_KEY`              | Full Apple Push Notifications `.p8` contents                    |
| `APNS_TOPIC`                 | `com.lightcodeapp.mobile`                                       |
| `APNS_ENV`                   | `production` (the default; use `sandbox` only for development)  |
| `WEB_PUSH_VAPID_PUBLIC_KEY`  | Public VAPID key used by installed PWAs                         |
| `WEB_PUSH_VAPID_PRIVATE_KEY` | Matching private VAPID key; keep encrypted                      |
| `WEB_PUSH_VAPID_SUBJECT`     | Optional contact URI; defaults to `mailto:support@poracode.com` |

Generate the VAPID pair once with
`pnpm --dir website exec web-push generate-vapid-keys --json`. Keep the same
pair across deployments: rotating it forces every installed PWA to create a
new browser subscription the next time it connects.

## GitHub release configuration

The `mobile-android` and `mobile-ios` environments are used by the native
release workflow (`release-mobile.yml`); the `mobile-web` environment is used by
the standalone PWA workflow (`release-pwa.yml`). Set
`PORACODE_MOBILE_APP_HOST=poracode.com` in all three and `PLAY_TRACK=internal`
in `mobile-android`. Each environment requires approval from the repository
owner and only accepts deployments from `master` or a `mobile-v*` tag. The
workflows pin third-party actions to immutable commits and scope publisher
credentials to the steps that consume them.

### `mobile-web`

Used by **Release PWA** (`release-pwa.yml`), which deploys the hosted PWA to
Vercel production independently of the native store releases. The environment
needs `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, and this secret:

- `VERCEL_TOKEN`

### `mobile-android`

Create one long-lived upload keystore, keep an offline backup, and add:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`
- `ANDROID_GOOGLE_SERVICES_JSON_BASE64`
- `PORACODE_MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS` after Play processes the
  first manually uploaded AAB
- `PLAY_SERVICE_ACCOUNT_JSON` only after the first AAB has been uploaded manually

PowerShell encodes the binary files without line wrapping:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("poracode-upload.keystore"))
[Convert]::ToBase64String([IO.File]::ReadAllBytes("google-services.json"))
```

### `mobile-ios`

The existing repository `APPLE_TEAM_ID` secret is accepted as the team-ID
fallback. Add:

- `APP_STORE_CONNECT_KEY_ID`
- `APP_STORE_CONNECT_ISSUER_ID`
- `APP_STORE_CONNECT_PRIVATE_KEY` (the full `.p8` contents)

Use an Admin **team App Store Connect API key**, not an individual API key.
Individual keys cannot use Apple's provisioning endpoints. Xcode cloud signing
provisions the app and extension, archives `App.xcodeproj`, exports an IPA, and
uploads it to TestFlight without a locally imported distribution certificate.

Keep a durable copy of the one-time-download App Store Connect `.p8` outside the
repository. GitHub secrets are deployment copies and cannot be retrieved as
backups.

## Apple one-time setup

1. In Certificates, Identifiers & Profiles, register
   `com.lightcodeapp.mobile` with Push Notifications and Associated Domains.
2. Register `com.lightcodeapp.mobile.PoracodeActivities` as the extension ID.
3. Create an Admin team App Store Connect API key and add the GitHub secrets
   above. Do not use an individual API key because Xcode automatic provisioning
   cannot use it.
4. Create the App Store Connect app record: platform iOS, name `Poracode`, bundle
   ID `com.lightcodeapp.mobile`, primary language English (U.S.), and a unique
   SKU such as `poracode-ios`.
5. Set Privacy Policy URL to `https://poracode.com/privacy` and Support URL to
   `https://poracode.com/support`.
6. Complete App Privacy, age rating, content-rights, and export-compliance
   questions. Do not automatically answer “no encryption”: Poracode includes an
   SSH client and SwiftCrypto, so the encryption/export answer must be reviewed
   in App Store Connect.
7. Add an internal tester group and enable automatic distribution if uploaded
   builds should appear there without a manual assignment. External TestFlight
   testing additionally requires Beta App Review and a stable review pairing
   path.

### TestFlight copy

Beta description:

> Poracode for iPhone and iPad is the mobile companion for the Poracode desktop
> app. Pair with a desktop to monitor coding agents, reply when they need input,
> review work, and receive optional status notifications away from your desk.

What to Test:

> Pair with a Poracode desktop by scanning its QR code or entering the endpoint
> and token. Verify project/thread navigation, terminal and native-chat updates,
> sending a reply, camera and local-network permission prompts, background
> notifications, universal links, and Live Activity status. Report the desktop
> and mobile versions, device model, iOS version, and exact reproduction steps.

Feedback email: `support@poracode.com`

Review note:

> Poracode is a companion client and requires a reachable Poracode desktop.
> Provide Beta App Review with a dedicated reachable desktop endpoint and
> pairing token; do not submit a short-lived QR code as static credentials.

## Google Play one-time setup

1. Complete Play Console developer enrollment and create an app named
   `Poracode`, default language English (United States), package
   `com.lightcodeapp.mobile`, app/game = App, free.
2. Generate one upload key, back it up, and add its encoded
   keystore/password/alias values to the GitHub environment. Select Play App
   Signing with a Google-generated app-signing key for the first release.
3. Add `com.lightcodeapp.mobile` to Firebase, download `google-services.json`,
   encode it, and add `ANDROID_GOOGLE_SERVICES_JSON_BASE64`.
4. Complete App access, Ads, Content rating, Target audience, Privacy policy,
   and the Data safety form applicable to the selected testing track.
5. Run the workflow with Android selected, download the signed AAB artifact,
   and upload that first AAB manually to Internal testing. Google Play does not
   allow the publishing API action to create the app's first release. The first
   build intentionally allows an empty `assetlinks.json` because Play has not
   exposed its app-signing certificate yet.
6. After Play processes the first AAB, copy the **App signing key certificate**
   SHA-256 fingerprint to the GitHub secret and the marketing website production
   variable, then redeploy the website. Do not use the upload or debug
   certificate fingerprint.
7. Create a Google Play Android Developer API
   service account, grant it release access to this app, and add its complete
   JSON key as `PLAY_SERVICE_ACCOUNT_JSON`. Later workflow runs publish to the
   configured track automatically.

Store listing name: `Poracode`

Short description:

> Run, monitor, and steer desktop coding agents securely from your phone.

Full description:

> Poracode is the mobile companion for the Poracode desktop app. Pair your phone
> with a desktop you control to follow active coding sessions, read terminal and
> native chat output, respond when an agent needs input, inspect project work,
> and receive optional status notifications. Poracode supports local-network and
> HTTPS desktop connections. A running Poracode desktop is required; the mobile
> app does not provide a hosted coding-agent account.

Initial release note:

> First beta: pair with Poracode desktop, monitor and steer agent threads, scan
> pairing QR codes, and receive optional status notifications.

Privacy policy: `https://poracode.com/privacy`

Support: `https://poracode.com/support`

## First release

1. Finish the account setup above and configure the secrets.
2. Deploy the website changes and verify all five public URLs.
3. In GitHub Actions, run **Release Mobile** with iOS and Android selected.
   TestFlight upload is automatic. Leave `PLAY_SERVICE_ACCOUNT_JSON` unset for
   the first run so the workflow produces the signed AAB without attempting the
   unsupported first API upload.
4. Download `poracode-android-<version>-<build>.zip` from the workflow and upload
   its AAB to the Play Internal testing release.
5. Select the processed TestFlight build for the internal tester group and roll
   out the Play internal release.

After both first uploads exist, a `mobile-vX.Y.Z` tag builds and uploads the
native targets with monotonically increasing build numbers; the hosted PWA is
released separately by running **Release PWA** in GitHub Actions. TestFlight
distribution is automatic only for groups where **Enable automatic
distribution** is turned on.
