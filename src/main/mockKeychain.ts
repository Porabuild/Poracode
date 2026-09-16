interface MockKeychainOptions {
  isDev: boolean;
  platform?: string;
  /** PORACODE_USE_REAL_KEYCHAIN — "1" opts a dev launch back onto the real OS keychain. */
  requested?: string;
  /**
   * PORACODE_USE_MOCK_KEYCHAIN — "1" requests the mock keychain for a non-dev
   * (production-mode) launch, e.g. measurement/smoke harnesses that run the
   * built bundle under the legacy product identity. Ignored when the real
   * keychain was explicitly requested.
   */
  forced?: string;
}

/**
 * Dev launches on macOS default to Chromium's mock keychain.
 *
 * On macOS Tahoe, Chromium's safeStorage initialization inside a
 * dev-identity Electron binary regularly fails keychain resolution and
 * blocks every launch with a modal "Keychain Not Found — A keychain cannot
 * be found to store 'Lightcode Key.'" dialog, even with a healthy login
 * keychain and search list (the CLI can read/write items in the same
 * session). Dev profiles are disposable and run mock agents, so the mock
 * keychain is the right default there; set PORACODE_USE_REAL_KEYCHAIN=1 to
 * opt a dev launch back onto the real OS keychain.
 *
 * Production-mode launches driven by a harness (isDev=false, built bundle,
 * legacy "Lightcode" identity) hit the same dialog; they opt in explicitly
 * with PORACODE_USE_MOCK_KEYCHAIN=1. Packaged launches without that env
 * never use the mock (asserted by tests).
 */
export function shouldUseMockKeychain({
  isDev,
  platform = process.platform,
  requested = process.env.PORACODE_USE_REAL_KEYCHAIN,
  forced = process.env.PORACODE_USE_MOCK_KEYCHAIN,
}: MockKeychainOptions): boolean {
  if (platform !== "darwin" || requested === "1") return false;
  return isDev || forced === "1";
}
