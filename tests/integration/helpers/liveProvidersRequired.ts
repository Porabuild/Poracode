// Strict live-provider gating for the providers-lifecycle integration suite.
//
// `PORACODE_LIVE_PROVIDERS_REQUIRED` is a comma-separated list of provider
// kinds that MUST actually run in this suite. In ordinary local runs the
// suite skips providers that are not installed, not authenticated, or have
// no usable model — the right behavior for a developer laptop. A required
// provider may never silently take that path: every skip reason for a listed
// kind becomes a hard failure, so a qualification run cannot go green because
// a binary or credential was missing on the host.
//
// This module is deliberately pure: it parses and validates the list without
// importing the registry or touching any provider binary, so the unit tests
// next door exercise it with a synthetic kind list.

export const LIVE_PROVIDERS_REQUIRED_ENV = "PORACODE_LIVE_PROVIDERS_REQUIRED";

/** Typed failure for an invalid required-provider list. */
export class LiveProvidersRequiredError extends Error {
  readonly code = "LIVE_PROVIDERS_REQUIRED_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "LiveProvidersRequiredError";
  }
}

export interface RequiredLiveProviders {
  /** The trimmed env value. Empty when the mode is off. */
  readonly raw: string;
  /** Canonical registry kinds, in the order given. Empty when the mode is off. */
  readonly names: readonly string[];
}

/**
 * Parse and validate the strict-mode list.
 *
 * Unset or blank turns the mode off (`names: []`) — ordinary local behavior
 * is unchanged. A non-blank value must be a comma-separated list where every
 * entry is non-empty (after trimming), not a duplicate (case-insensitive),
 * and a known registry kind (matched case-insensitively so `Claude` resolves
 * to the canonical `claude`). Every violation throws with an actionable
 * message naming the entry, its position, and the valid choices.
 */
export function parseRequiredLiveProviders(
  rawValue: string | undefined,
  knownKinds: readonly string[],
): RequiredLiveProviders {
  if (rawValue === undefined || rawValue.trim().length === 0) {
    return { raw: "", names: [] };
  }
  const raw = rawValue.trim();
  const canonicalByLower = new Map(knownKinds.map((kind) => [kind.toLowerCase(), kind]));
  const names: string[] = [];
  const firstSeenAt = new Map<string, number>();

  const entries = raw.split(",");
  entries.forEach((entry, index) => {
    const position = index + 1;
    const name = entry.trim();
    if (name.length === 0) {
      throw new LiveProvidersRequiredError(
        `${LIVE_PROVIDERS_REQUIRED_ENV} has an empty provider name at position ${position} ` +
          `(raw value: "${raw}"). Use a comma-separated list of provider kinds with no empty ` +
          `entries. Known kinds: ${knownKinds.join(", ")}.`,
      );
    }
    const canonical = canonicalByLower.get(name.toLowerCase());
    if (canonical === undefined) {
      throw new LiveProvidersRequiredError(
        `${LIVE_PROVIDERS_REQUIRED_ENV} names unknown provider "${name}" at position ${position}. ` +
          `Known provider kinds: ${knownKinds.join(", ")}.`,
      );
    }
    const firstAt = firstSeenAt.get(canonical.toLowerCase());
    if (firstAt !== undefined) {
      throw new LiveProvidersRequiredError(
        `${LIVE_PROVIDERS_REQUIRED_ENV} names provider "${canonical}" twice (positions ${firstAt} ` +
          `and ${position}). Remove the duplicate entry.`,
      );
    }
    firstSeenAt.set(canonical.toLowerCase(), position);
    names.push(canonical);
  });

  return { raw, names };
}

/** Minimal shape of vitest's per-test context this helper needs. */
export interface SkippableTestContext {
  skip: (note?: string) => void;
}

/**
 * Skip in ordinary mode; fail in strict mode.
 *
 * A required provider may never silently skip — not for a missing binary, not
 * for a missing credential, not because the adapter structurally cannot run
 * this suite. The thrown message keeps the ordinary skip reason so the
 * failure says exactly what the host is missing.
 */
export function skipOrThrowRequired(
  testCtx: SkippableTestContext,
  isRequired: boolean,
  kind: string,
  reason: string,
): void {
  if (isRequired) {
    throw new Error(
      `[${LIVE_PROVIDERS_REQUIRED_ENV}] required provider "${kind}" could not run: ${reason}`,
    );
  }
  testCtx.skip(reason);
}
