/**
 * Executable TS reference for the pairing state machine spec
 * (`pairingMachineSpec.ts`). The native Swift/Kotlin sources in the generated
 * bundles are rendered from the same tables by
 * `contract/native/emitPairing{Swift,Kotlin}.ts`; the contract tests pin all
 * three to identical vectors.
 *
 * The renderer pairing flows (browser deep-link intake, the connection-page
 * hook, and the mobile settings sheet) drive their candidate decisions and
 * intent transitions through this executor, so it is both the normative
 * interpreter the generated sources are tested against and the live decision
 * engine on the web client. It must stay renderer-bundle-safe: no `node:*`
 * imports (the digest lives in `./sha256` for exactly that reason).
 */

import { isLoopbackHostname } from "../../http";
import {
  PAIRING_MACHINE_SPEC,
  type PairingIntentEffect,
  type PairingIntentEvent,
  type PairingIntentState,
  type PairingMachinePhase,
} from "./pairingMachineSpec";
import { sha256Hex } from "./sha256";

// ---------------------------------------------------------------------------
// Failure-phase recovery (first-match table walk)
// ---------------------------------------------------------------------------

export function phaseAfterPairingFailure(
  previousPhase: PairingMachinePhase,
  hasRetainedCredential: boolean,
): PairingMachinePhase {
  for (const rule of PAIRING_MACHINE_SPEC.phaseAfterFailure) {
    if (
      rule.hasRetainedCredential === hasRetainedCredential &&
      (rule.from as readonly string[]).includes(previousPhase)
    ) {
      return rule.target ?? previousPhase;
    }
  }
  return previousPhase;
}

// ---------------------------------------------------------------------------
// Candidate fingerprint + duplicate policies
// ---------------------------------------------------------------------------

/** Non-secret sha256 hex digest of `endpoint \u0001 credential`. Rendered with
 * the browser-safe synchronous digest (`./sha256`) so the executor runs in the
 * renderer bundle unchanged. */
export function pairingFingerprint(endpoint: string, credential: string): string {
  return sha256Hex(
    `${endpoint}${PAIRING_MACHINE_SPEC.duplicateDetection.fingerprint.separator}${credential}`,
  );
}

/** iOS-style one-shot candidate tracker: in-flight + last-succeeded digests.
 * Failure releases in-flight so a network retry of the same candidate can
 * proceed; success burns the digest for the process lifetime. */
export class PairingCandidateTracker {
  private inFlightDigest: string | null = null;
  private lastSucceededDigest: string | null = null;

  decide(digest: string): "proceed" | "ignoreDuplicate" {
    if (digest === this.inFlightDigest || digest === this.lastSucceededDigest) {
      return "ignoreDuplicate";
    }
    return "proceed";
  }

  markInFlight(digest: string): void {
    this.inFlightDigest = digest;
  }

  markSucceeded(digest: string): void {
    this.lastSucceededDigest = digest;
    if (this.inFlightDigest === digest) this.inFlightDigest = null;
  }

  markFailed(digest: string): void {
    if (this.inFlightDigest === digest) this.inFlightDigest = null;
  }

  reset(): void {
    this.inFlightDigest = null;
    this.lastSucceededDigest = null;
  }
}

/** Android-style process-lifetime consumed-set policy. The fingerprint must
 * never include the raw secret in logs or saved state. */
export function shouldSkipDuplicateFingerprint(
  fingerprint: string,
  seen: ReadonlySet<string>,
): boolean {
  return fingerprint.length > 0 && seen.has(fingerprint);
}

export function afterFingerprintConsumed(
  fingerprint: string,
  seen: ReadonlySet<string>,
): Set<string> {
  return fingerprint.length === 0 ? new Set(seen) : new Set([...seen, fingerprint]);
}

// ---------------------------------------------------------------------------
// Deep-link intent extraction + pending confirmation decision
// ---------------------------------------------------------------------------

/** One-shot pairing URL extraction from intent data. Callers must clear
 * Intent.data after extraction so rotation cannot re-redeem a burned token. */
export function extractPairingData(dataString: string | null | undefined): string | null {
  const trimmed = dataString?.trim();
  return trimmed ? trimmed : null;
}

/** A browsable (externally delivered) link always requires explicit
 * confirmation; it can never silently replace an existing pair. */
export function requiresBrowsableConfirmation(fromBrowsableIntent: boolean): boolean {
  return fromBrowsableIntent;
}

/** UI-safe host label: authority `host[:port]`, or a fragment/query-stripped,
 * length-bounded fallback. Never includes a credential. */
export function sanitizedHostLabel(endpoint: string): string {
  const trimmed = endpoint.trim();
  try {
    const url = new URL(trimmed);
    if (url.hostname) {
      return url.port ? `${url.hostname}:${url.port}` : url.hostname;
    }
  } catch {
    // Fall through to the strip fallback.
  }
  const stripped = trimmed.split("#")[0]!.split("?")[0]!;
  const candidate = stripped.length > 0 ? stripped : trimmed;
  // Truncate on UTF-16 code units (matching the generated Swift/Kotlin
  // `prefix` semantics), never code points: splitting a surrogate pair only
  // affects a display string's tail.
  return candidate.slice(0, PAIRING_MACHINE_SPEC.deepLink.hostDisplayFallbackMaxCharacters);
}

/** An `http:` endpoint on a non-loopback host. */
export function isCleartextLanEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === "http:" && !isLoopbackHostname(url.hostname);
  } catch {
    return false;
  }
}

export interface PairingPendingCandidate {
  readonly endpoint: string;
  readonly hostDisplay: string;
  readonly credential: string;
  readonly digest: string;
  readonly isCleartextLan: boolean;
  readonly replacesExistingPair: boolean;
}

/** UI-safe view — never exposes the credential. */
export function pendingSanitizedDescription(pending: PairingPendingCandidate): string {
  return pending.isCleartextLan ? `${pending.hostDisplay} (plain HTTP)` : pending.hostDisplay;
}

export type PairingDeepLinkDecision =
  | { readonly kind: "ignore" }
  | { readonly kind: "pending"; readonly pending: PairingPendingCandidate };

/** Decide a resolved endpoint+credential pair without starting a network pair.
 * Malformed resolution and duplicate fingerprints are no-ops. */
export function decideDeepLink(
  endpoint: string | null | undefined,
  credential: string | null | undefined,
  tracker: PairingCandidateTracker,
  hasExistingPair: boolean,
): PairingDeepLinkDecision {
  if (!endpoint || !credential || endpoint.length === 0 || credential.length === 0) {
    return { kind: "ignore" };
  }
  const digest = pairingFingerprint(endpoint, credential);
  if (tracker.decide(digest) === "ignoreDuplicate") {
    return { kind: "ignore" };
  }
  return {
    kind: "pending",
    pending: {
      endpoint,
      hostDisplay: sanitizedHostLabel(endpoint),
      credential,
      digest,
      isCleartextLan: isCleartextLanEndpoint(endpoint),
      replacesExistingPair: hasExistingPair,
    },
  };
}

// ---------------------------------------------------------------------------
// Scope-request guard
// ---------------------------------------------------------------------------

export function filterKnownScopes(scopes: readonly string[]): string[] {
  const known = new Set(PAIRING_MACHINE_SPEC.scopes.standardOrder);
  return scopes.filter((scope) => known.has(scope));
}

export function isKnownScope(scope: string): boolean {
  return (PAIRING_MACHINE_SPEC.scopes.standardOrder as readonly string[]).includes(scope);
}

/** Ordered intersection of standard scopes with advertised-known scopes.
 * Empty means refuse before consuming the one-time credential. */
export function scopesToRequest(advertised: readonly string[]): string[] {
  const knownAdvertised = new Set(filterKnownScopes(advertised));
  if (knownAdvertised.size === 0) return [];
  return PAIRING_MACHINE_SPEC.scopes.standardOrder.filter((scope) => knownAdvertised.has(scope));
}

export function hasNoKnownAdvertisedScopes(advertised: readonly string[]): boolean {
  return filterKnownScopes(advertised).length === 0;
}

export function canReadScopes(scopes: readonly string[]): boolean {
  return filterKnownScopes(scopes).includes("session:read");
}

export function canOperateScopes(scopes: readonly string[]): boolean {
  return filterKnownScopes(scopes).includes("session:operate");
}

// ---------------------------------------------------------------------------
// Intent-machine reducer (data-driven over the spec transition table)
// ---------------------------------------------------------------------------

export interface PairingIntentContext {
  /** Endpoint/credential resolved from the last candidateSeen, when present. */
  readonly candidate: PairingPendingCandidate | null;
  readonly tracker: PairingCandidateTracker;
  /** Process-lifetime applied fingerprints (consumedSet policy). */
  readonly consumedFingerprints: ReadonlySet<string>;
  /** Whether a live pair (profile + token) exists right now. */
  readonly hasExistingPair: boolean;
}

export interface PairingIntentStateSnapshot {
  readonly state: PairingIntentState;
  readonly effect: PairingIntentEffect | null;
}

export function initialPairingIntentState(): PairingIntentState {
  return "idle";
}

export type { PairingIntentState, PairingIntentEffect, PairingIntentEvent };

interface GuardInputs {
  readonly candidateEndpoint: string | null;
  readonly candidateCredential: string | null;
  readonly external: boolean;
}

/** Evaluate one named guard against the current event context. */
function guardMatches(guard: string, context: PairingIntentContext, inputs: GuardInputs): boolean {
  switch (guard) {
    case "candidateIncomplete":
      return !inputs.candidateEndpoint || !inputs.candidateCredential;
    case "duplicateFingerprint": {
      if (!inputs.candidateEndpoint || !inputs.candidateCredential) return false;
      const digest = pairingFingerprint(inputs.candidateEndpoint, inputs.candidateCredential);
      if (shouldSkipDuplicateFingerprint(digest, context.consumedFingerprints)) return true;
      return context.tracker.decide(digest) === "ignoreDuplicate";
    }
    case "externalConfirmationRequired":
      return inputs.external;
    default:
      return false;
  }
}

/**
 * Pure reducer over the spec transition table (first matching row wins). For
 * `candidateSeen` the candidate's resolved endpoint/credential ride the
 * context. Returns the next state plus the matched effect; the caller performs
 * the effect (store pending, begin the network pair, consume fingerprints,
 * clear) — the machine itself never performs I/O.
 */
export function reducePairingIntent(
  state: PairingIntentState,
  event: PairingIntentEvent,
  context: PairingIntentContext,
): PairingIntentStateSnapshot {
  const inputs: GuardInputs =
    event.type === "candidateSeen"
      ? {
          candidateEndpoint: context.candidate?.endpoint ?? null,
          candidateCredential: context.candidate?.credential ?? null,
          external: event.external,
        }
      : { candidateEndpoint: null, candidateCredential: null, external: false };
  for (const transition of PAIRING_MACHINE_SPEC.intent.transitions) {
    if (transition.state !== state || transition.event !== event.type) continue;
    if (
      transition.guards &&
      !transition.guards.some((guard) => guardMatches(guard, context, inputs))
    ) {
      continue;
    }
    return { state: transition.target, effect: transition.effect };
  }
  return { state, effect: null };
}
