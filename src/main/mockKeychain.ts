interface MockKeychainOptions {
  isDev: boolean;
  platform?: string;
  requested?: string;
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
 * opt a dev launch back onto the real OS keychain. Packaged launches never
 * use the mock (asserted by tests).
 */
export function shouldUseMockKeychain({
  isDev,
  platform = process.platform,
  requested = process.env.PORACODE_USE_REAL_KEYCHAIN,
}: MockKeychainOptions): boolean {
  return isDev && platform === "darwin" && requested !== "1";
}
