import { safeStorage } from "electron";

/**
 * Once-per-launch safeStorage probe (P3). Every secret-storage surface used to
 * call `safeStorage.isEncryptionAvailable()` (plus the Linux `basic_text`
 * backend check) at its own moment, so a flapping keychain could seal some
 * credentials and leave others session-only within one run. This module probes
 * exactly once per process launch, latches the verdict, and logs once when the
 * verdict is "unavailable" so the user-visible consequence — credentials stay
 * session-only until relaunch — is disclosed at the moment the latch is set.
 *
 * The loud `SafeStorageKeyUnavailableError` rotation refusal (Gate 2.5 S5.2)
 * is unaffected: that fires on decrypt failure AFTER a healthy probe, which is
 * a different failure than "the OS store was never available this launch".
 */

export type SafeStorageHealthState =
  | { readonly kind: "healthy" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "inspection-failed"; readonly cause: unknown };

export const SAFE_STORAGE_LATCH_WARNING =
  "[credential-storage] OS-backed secret storage is unavailable (latched for this launch): " +
  "credentials are session-only until Poracode is relaunched.";

let latched: SafeStorageHealthState | null = null;

function probe(platform: NodeJS.Platform): SafeStorageHealthState {
  try {
    if (!safeStorage.isEncryptionAvailable()) return { kind: "unavailable" };
    if (platform === "linux" && safeStorage.getSelectedStorageBackend() === "basic_text") {
      return { kind: "unavailable" };
    }
    return { kind: "healthy" };
  } catch (cause) {
    return { kind: "inspection-failed", cause };
  }
}

/** Latched health: probes on the first call of the launch, then never again. */
export function safeStorageHealth(
  platform: NodeJS.Platform = process.platform,
): SafeStorageHealthState {
  if (!latched) {
    latched = probe(platform);
    if (latched.kind === "unavailable") {
      console.warn(SAFE_STORAGE_LATCH_WARNING);
    }
  }
  return latched;
}

/** Explicit re-probe (no caller yet): overwrites the latch with a fresh probe. */
export function reprobeSafeStorageHealth(
  platform: NodeJS.Platform = process.platform,
): SafeStorageHealthState {
  latched = null;
  return safeStorageHealth(platform);
}

/** Test seam: the latch is per-process by design, so tests must clear it. */
export function resetSafeStorageHealthForTests(): void {
  latched = null;
}
