export const CHANGELOG_STORAGE_KEYS = {
  seenVersion: "poracode-changelog-seen-version",
  acknowledgedVersion: "poracode-changelog-ack-version",
  hidden: "poracode-whatsnew-hidden",
  cache: "poracode-changelog-cache",
} as const;

const LEGACY_CHANGELOG_STORAGE_KEYS = {
  seenVersion: "lightcode-changelog-seen-version",
  acknowledgedVersion: "lightcode-changelog-ack-version",
  hidden: "lightcode-whatsnew-hidden",
  cache: "lightcode-changelog-cache",
} as const;

/**
 * Preserve the user's changelog position across the Lightcode -> Poracode
 * rename. Copy only missing values so a Poracode launch always wins over stale
 * legacy state, and keep the originals for downgrade safety.
 */
export function migrateLegacyChangelogStorage(storage: Pick<Storage, "getItem" | "setItem">): void {
  try {
    for (const key of Object.keys(CHANGELOG_STORAGE_KEYS) as Array<
      keyof typeof CHANGELOG_STORAGE_KEYS
    >) {
      const currentKey = CHANGELOG_STORAGE_KEYS[key];
      if (storage.getItem(currentKey) !== null) continue;
      const legacyValue = storage.getItem(LEGACY_CHANGELOG_STORAGE_KEYS[key]);
      if (legacyValue !== null) storage.setItem(currentKey, legacyValue);
    }
  } catch {
    // Storage can be unavailable under strict browser/privacy policies. The
    // changelog store already degrades to in-memory defaults in that case.
  }
}
