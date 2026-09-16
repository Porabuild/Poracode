interface MockKeychainOptions {
  isDev: boolean;
  /** A packaged (shipped) launch never downgrades its keychain via env. */
  isPackaged?: boolean;
  platform?: string;
  /** PORACODE_USE_REAL_KEYCHAIN — "1" opts a dev launch back onto the real OS keychain. */
  requested?: string;
  /**
   * PORACODE_USE_MOCK_KEYCHAIN — "1" requests the mock keychain for an
   * unpackaged production-mode launch, e.g. measurement/smoke harnesses that
   * run the built bundle under the legacy product identity. Ignored when the
   * real keychain was explicitly requested, and always ignored for packaged
   * launches: an environment variable must never swap a shipped app's
   * safeStorage to Chromium's fixed mock key (it would also flip the key, so
   * existing sealed credentials would stop decrypting).
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
 * Unpackaged production-mode launches driven by a harness (built bundle run
 * via the node_modules electron binary, so app.isPackaged stays false) hit
 * the same dialog; they opt in explicitly with PORACODE_USE_MOCK_KEYCHAIN=1.
 * Packaged launches always keep the real OS keychain (asserted by tests).
 */
export function shouldUseMockKeychain({
  isDev,
  isPackaged = false,
  platform = process.platform,
  requested = process.env.PORACODE_USE_REAL_KEYCHAIN,
  forced = process.env.PORACODE_USE_MOCK_KEYCHAIN,
}: MockKeychainOptions): boolean {
  // A packaged launch is authoritative: no env may downgrade its keychain,
  // not even the dev default (defense in depth — env is attacker-controllable).
  if (platform !== "darwin" || isPackaged || requested === "1") return false;
  if (isDev) return true;
  return forced === "1";
}
