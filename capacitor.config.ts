import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Native (App Store / Play) wrapper for the Lightcode mobile PWA.
 *
 * The native shells bundle the built web app (`dist/mobile`) so they launch
 * offline and don't depend on a hosted origin; the desktop endpoint is entered
 * at runtime via pairing. Unlike the hosted HTTPS PWA, the native WebView can
 * reach a paired desktop over plain http on the LAN — `cleartext` enables that
 * on Android, and the iOS App Transport Security exceptions are documented in
 * docs/RELEASE_MOBILE.md.
 *
 * `scripts/finalize-mobile-build.mjs` generates the hosted app-link
 * association files from release secrets. `scripts/configure-mobile-native.mjs`
 * patches generated native projects with the matching Android intent filter,
 * iOS Associated Domains entitlement, and iOS local-networking ATS exception.
 *
 * Native projects (android/, ios/) are generated with `npx cap add` and should
 * be committed once customized (icons, splash, signing/export options). The
 * release workflow can bootstrap them in CI when they are absent.
 */
const config: CapacitorConfig = {
  appId: "com.lightcodeapp.mobile",
  appName: "Lightcode",
  webDir: "dist/mobile",
  server: {
    androidScheme: "https",
    // Allow the paired desktop's plain-http LAN endpoint (Android).
    cleartext: true,
  },
  ios: {
    contentInset: "always",
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
