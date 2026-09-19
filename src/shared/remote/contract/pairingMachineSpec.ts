/**
 * THE pairing state-machine spec (V5 plan item 5.2, finding P2).
 *
 * Pairing intent handling, candidate idempotency, failure-phase recovery, and
 * the scope-request guard were hand-triplicated across TS/Swift/Kotlin and had
 * already drifted (Android fingerprinted endpoints with trimming + lowercasing
 * while iOS fingerprinted raw endpoints). This module is the ONE declarative
 * source: states, events, guards, and transition tables. The native emitter
 * (`contract/native/emitPairing{Swift,Kotlin}.ts`) renders it into the same
 * generated bundles as the wire contract, and `pairingMachine.ts` is the
 * executable TS reference used by the contract tests.
 *
 * Scope: the pure decision machine only. Transport I/O, durable stores, task
 * ownership, and platform UI stay hand-written coordinators; they consume the
 * generated guards and transitions. The TS *renderer* pairing flow is the
 * behavioral reference for the wire steps (scan -> parse -> exchange -> record)
 * but still drives this machine hand-written; converging it is a documented
 * follow-up (renderer files sit outside the contract tree).
 *
 * The wire protocol is unchanged: nothing here touches routes, procedures, or
 * schemas — `buildRemoteV3IrDocument()` never reads this file.
 */

export const PAIRING_MACHINE_ID = "pairing" as const;
export const PAIRING_MACHINE_SPEC_VERSION = 1 as const;

/** Session pairing phases. Superset of every native UI phase enum; platforms
 * map their own enum to these literals at the call boundary. */
export const PAIRING_PHASES = [
  "launching",
  "needsPairing",
  "reconnectingStored",
  "connecting",
  "ready",
  "sessionExpired",
  "protocolIncompatible",
  "localStoreInconsistent",
] as const;
export type PairingMachinePhase = (typeof PAIRING_PHASES)[number];

/** Intent-machine states. */
export const PAIRING_INTENT_STATES = [
  "idle",
  "pendingConfirmation",
  "pairInFlight",
  "paired",
] as const;
export type PairingIntentState = (typeof PAIRING_INTENT_STATES)[number];

/** Intent-machine events. */
export const PAIRING_INTENT_EVENTS = [
  "candidateSeen",
  "confirmPending",
  "cancelPending",
  "pairAttemptFailed",
  "pairCommitted",
  "reset",
] as const;
export type PairingIntentEvent =
  | { readonly type: "candidateSeen"; readonly external: boolean }
  | { readonly type: "confirmPending" }
  | { readonly type: "cancelPending" }
  | { readonly type: "pairAttemptFailed" }
  | { readonly type: "pairCommitted" }
  | { readonly type: "reset" };

/** Named guards evaluated by the intent reducer; each has one generated and one
 * TS implementation driven by the tables below. */
export const PAIRING_INTENT_GUARDS = [
  "candidateIncomplete",
  "duplicateFingerprint",
  "externalConfirmationRequired",
] as const;
export type PairingIntentGuard = (typeof PAIRING_INTENT_GUARDS)[number];

export type PairingIntentEffect =
  | "ignore"
  | "storePending"
  | "beginPair"
  | "clearPending"
  | "releaseInFlight"
  | "consumeFingerprint"
  | "clearAll";

export interface PairingIntentTransition {
  readonly state: PairingIntentState;
  readonly event: PairingIntentEvent["type"];
  /** First matching row wins; a row without guards always matches. */
  readonly guards?: readonly PairingIntentGuard[];
  readonly target: PairingIntentState;
  readonly effect: PairingIntentEffect;
}

/**
 * Failure-phase recovery: ordered first-match rules. `target: null` keeps the
 * previous phase (a failed pair must not regress a valid loaded session).
 */
export interface PairingPhaseAfterFailureRule {
  readonly from: readonly PairingMachinePhase[];
  readonly hasRetainedCredential: boolean;
  readonly target: PairingMachinePhase | null;
}

/** Non-secret candidate digest: sha256 over `endpoint \u0001 credential`. */
export interface PairingFingerprintSpec {
  readonly algorithm: "sha256";
  readonly encoding: "hex-lowercase";
  /** Literal separator byte between endpoint and credential material. */
  readonly separator: "\u0001";
}

/**
 * Two documented duplicate policies over the same fingerprint:
 * - `tracker`: in-flight + last-succeeded digests (iOS pairing tracker).
 * - `consumedSet`: process-lifetime set of applied fingerprints (Android).
 */
export interface PairingDuplicateDetectionSpec {
  readonly fingerprint: PairingFingerprintSpec;
  readonly policies: readonly ("tracker" | "consumedSet")[];
}

export interface PairingScopesSpec {
  /** Canonical order; `scopesToRequest` intersects into THIS order, never the
   * advertised order. Server-advertised unknown scopes are dropped, never fatal. */
  readonly standardOrder: readonly string[];
  readonly presets: {
    readonly operator: readonly string[];
    readonly viewer: readonly string[];
  };
  /** Empty `scopesToRequest` means "refuse before consuming the one-time
   * credential" — never escalate to the full standard set. */
  readonly emptyRequestMeans: "refuse-before-consuming-credential";
}

export const PAIRING_MACHINE_SPEC = {
  id: PAIRING_MACHINE_ID,
  specVersion: PAIRING_MACHINE_SPEC_VERSION,
  phases: PAIRING_PHASES,
  phaseAfterFailure: [
    {
      from: PAIRING_PHASES,
      hasRetainedCredential: false,
      target: "needsPairing",
    },
    {
      from: [
        "ready",
        "sessionExpired",
        "reconnectingStored",
        "protocolIncompatible",
        "localStoreInconsistent",
      ] as const,
      hasRetainedCredential: true,
      target: null,
    },
    {
      // Connecting that interrupted a live session restores Ready when
      // credentials remain (stale deep-link while already paired).
      from: ["connecting"] as const,
      hasRetainedCredential: true,
      target: "ready",
    },
    {
      from: ["launching", "needsPairing"] as const,
      hasRetainedCredential: true,
      target: "needsPairing",
    },
  ] satisfies readonly PairingPhaseAfterFailureRule[],
  duplicateDetection: {
    fingerprint: {
      algorithm: "sha256",
      encoding: "hex-lowercase",
      separator: "\u0001",
    },
    policies: ["tracker", "consumedSet"] as const,
  } satisfies PairingDuplicateDetectionSpec,
  intent: {
    states: PAIRING_INTENT_STATES,
    events: PAIRING_INTENT_EVENTS,
    guards: PAIRING_INTENT_GUARDS,
    transitions: [
      {
        state: "idle",
        event: "candidateSeen",
        guards: ["candidateIncomplete"],
        target: "idle",
        effect: "ignore",
      },
      {
        state: "idle",
        event: "candidateSeen",
        guards: ["duplicateFingerprint"],
        target: "idle",
        effect: "ignore",
      },
      {
        state: "idle",
        event: "candidateSeen",
        guards: ["externalConfirmationRequired"],
        target: "pendingConfirmation",
        effect: "storePending",
      },
      {
        // Direct in-app manual form only: pair without confirmation.
        state: "idle",
        event: "candidateSeen",
        target: "pairInFlight",
        effect: "beginPair",
      },
      {
        state: "pendingConfirmation",
        event: "confirmPending",
        target: "pairInFlight",
        effect: "beginPair",
      },
      {
        state: "pendingConfirmation",
        event: "cancelPending",
        target: "idle",
        effect: "clearPending",
      },
      {
        state: "pairInFlight",
        event: "pairAttemptFailed",
        target: "idle",
        effect: "releaseInFlight",
      },
      {
        state: "pairInFlight",
        event: "pairCommitted",
        target: "paired",
        effect: "consumeFingerprint",
      },
      {
        state: "pendingConfirmation",
        event: "reset",
        target: "idle",
        effect: "clearAll",
      },
      {
        state: "paired",
        event: "reset",
        target: "idle",
        effect: "clearAll",
      },
      {
        state: "idle",
        event: "reset",
        target: "idle",
        effect: "clearAll",
      },
    ] satisfies readonly PairingIntentTransition[],
  },
  deepLink: {
    /** Externally delivered links always require explicit sanitized-host
     * confirmation so a link can never silently replace a live pair. */
    externalConfirmation: "always",
    /** `hostDisplay` is UI-safe: authority host[:port], or a fragment/query
     * stripped and length-bounded fallback — never a credential. */
    hostDisplayFallback: "strip-fragment-then-query",
    hostDisplayFallbackMaxCharacters: 80,
  },
  scopes: {
    standardOrder: [
      "session:read",
      "session:operate",
      "terminal:read",
      "terminal:operate",
      "requests:resolve",
      "projects:manage",
      "ports:forward",
    ],
    presets: {
      operator: [
        "session:read",
        "session:operate",
        "terminal:read",
        "terminal:operate",
        "requests:resolve",
        "projects:manage",
        "ports:forward",
      ],
      viewer: ["session:read", "terminal:read"],
    },
    emptyRequestMeans: "refuse-before-consuming-credential",
  } satisfies PairingScopesSpec,
} as const;

export type PairingMachineSpec = typeof PAIRING_MACHINE_SPEC;

/** Fails closed when the spec tables are not exhaustive / self-consistent, so a
 * bad edit cannot reach generation. */
export function validatePairingMachineSpec(spec: PairingMachineSpec): string[] {
  const errors: string[] = [];
  const phaseSet = new Set<string>(spec.phases);
  for (const rule of spec.phaseAfterFailure) {
    for (const phase of rule.from) {
      if (!phaseSet.has(phase)) errors.push(`phaseAfterFailure rule names unknown phase ${phase}`);
    }
  }
  for (const retained of [true, false]) {
    for (const phase of spec.phases) {
      const matches = spec.phaseAfterFailure.filter(
        (rule) =>
          rule.hasRetainedCredential === retained &&
          (rule.from as readonly string[]).includes(phase),
      );
      if (matches.length === 0) {
        errors.push(
          `phaseAfterFailure has no rule for ${phase} with retainedCredential=${retained}`,
        );
      }
    }
  }
  const transitionStates = new Set<string>(spec.intent.states);
  const knownScopes = new Set(spec.scopes.standardOrder);
  for (const transition of spec.intent.transitions) {
    if (!transitionStates.has(transition.state)) {
      errors.push(`intent transition targets unknown state ${transition.state}`);
    }
    if (!transitionStates.has(transition.target)) {
      errors.push(`intent transition resolves to unknown state ${transition.target}`);
    }
  }
  for (const [name, preset] of Object.entries(spec.scopes.presets)) {
    for (const scope of preset) {
      if (!knownScopes.has(scope)) {
        errors.push(`scope preset ${name} declares non-standard scope ${scope}`);
      }
    }
  }
  if (spec.scopes.presets.operator.length !== spec.scopes.standardOrder.length) {
    errors.push("operator preset must equal the full standard order");
  }
  return errors;
}
