import {
  PairingCandidateTracker,
  reducePairingIntent,
  type PairingIntentContext,
  type PairingIntentState,
} from "@/shared/remote/contract/pairingMachine";

/**
 * Direct-path pairing intent plumbing shared by the renderer pairing surfaces
 * (connection-page hook + mobile settings sheet). Both drive the shared
 * pairing state machine (`shared/remote/contract/pairingMachine.ts`) as the
 * spec's direct in-app manual path: a complete candidate pairs without a
 * confirmation stop, and each attempt sees a fresh guard context so manual
 * re-pairing of the same server stays possible. Externally delivered
 * candidates (deep links) keep the executor's consumedSet policy in
 * `bootstrap.ts` instead.
 */

/** Fresh per-attempt guard context: nothing is burned, so the
 * duplicate-fingerprint guard can never reject a deliberate re-pair. */
export function directPairingContext(endpoint: string, token: string): PairingIntentContext {
  return {
    candidate: {
      endpoint,
      hostDisplay: endpoint,
      credential: token,
      digest: "",
      isCleartextLan: false,
      replacesExistingPair: false,
    },
    tracker: new PairingCandidateTracker(),
    consumedFingerprints: new Set(),
    hasExistingPair: false,
  };
}

/** Clears a settled intent (paired / pendingConfirmation) before a deliberate
 * new candidate (spec `reset`: clearAll). `pairInFlight` is left alone: the
 * machine refuses a second begin while an attempt is running, matching the
 * native coordinators. */
export function resetSettledPairingIntent(
  state: PairingIntentState,
  endpoint: string,
  token: string,
): PairingIntentState {
  if (state !== "paired" && state !== "pendingConfirmation") return state;
  return reducePairingIntent(state, { type: "reset" }, directPairingContext(endpoint, token)).state;
}

/** Evaluates the direct `candidateSeen` step. Returns the next state and
 * whether the machine began the pair attempt. */
export function beginDirectPair(
  state: PairingIntentState,
  endpoint: string,
  token: string,
): { readonly state: PairingIntentState; readonly began: boolean } {
  const step = reducePairingIntent(
    state,
    { type: "candidateSeen", external: false },
    directPairingContext(endpoint, token),
  );
  if (step.effect !== "beginPair") return { state, began: false };
  return { state: step.state, began: true };
}

/** The committed step: a successful pair burns the candidate (spec
 * `pairCommitted` -> `paired`). */
export function commitDirectPair(
  state: PairingIntentState,
  endpoint: string,
  token: string,
): PairingIntentState {
  return reducePairingIntent(
    state,
    { type: "pairCommitted" },
    directPairingContext(endpoint, token),
  ).state;
}

/** The failed-attempt step: releases in-flight so a retry can proceed (spec
 * `pairAttemptFailed` -> `idle`). */
export function failDirectPair(
  state: PairingIntentState,
  endpoint: string,
  token: string,
): PairingIntentState {
  return reducePairingIntent(
    state,
    { type: "pairAttemptFailed" },
    directPairingContext(endpoint, token),
  ).state;
}
