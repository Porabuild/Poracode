// Electron's default user agent looks like
//   ...(KHTML, like Gecko) Lightcode/1.3.2 Chrome/146.0.0.0 Electron/41.7.0 Safari/537.36
// Google sign-in (and other "is this a secure browser?" gates) reject any user
// agent that contains the `Electron/<version>` product token, showing
// "Couldn't sign you in — this browser or app may not be secure".
//
// The fix is to drop ONLY the `Electron/...` token. It is tempting to also strip
// the host app's own product token (`Lightcode/1.3.2`) to make the UA look like
// stock Chrome, but that backfires: Google rejects a *bare* `Chrome/...` UA
// coming from an embedded browser as a spoofed/unsupported browser, while it
// accepts a Chromium UA that honestly identifies the host app. Keeping the app
// token is precisely what lets Google sign-in complete inside the in-app browser
// (verified against the live flow; this is also why Codex / T3 Code embedded
// browsers, which keep their app token and only drop Electron, are accepted).
const ELECTRON_PRODUCT_RE = /\sElectron\/[^\s]+/g;

export function buildBrowserUserAgent(defaultUserAgent: string): string {
  return defaultUserAgent
    .replace(ELECTRON_PRODUCT_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
