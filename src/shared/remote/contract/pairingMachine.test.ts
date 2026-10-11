import { describe, expect, it } from "vitest";
import {
  PairingCandidateTracker,
  afterFingerprintConsumed,
  canOperateScopes,
  canReadScopes,
  decideDeepLink,
  extractPairingData,
  filterKnownScopes,
  hasNoKnownAdvertisedScopes,
  isCleartextLanEndpoint,
  pairingFingerprint,
  pendingSanitizedDescription,
  phaseAfterPairingFailure,
  reducePairingIntent,
  requiresBrowsableConfirmation,
  sanitizedHostLabel,
  scopesToRequest,
  shouldSkipDuplicateFingerprint,
} from "./pairingMachine";
import { PAIRING_MACHINE_SPEC, validatePairingMachineSpec } from "./pairingMachineSpec";
import { emitKotlinPairingMachine } from "./native/emitPairingKotlin";
import { emitSwiftPairingMachine } from "./native/emitPairingSwift";
import type { PairingMachinePhase } from "./pairingMachineSpec";
import type { PairingDeepLinkDecision, PairingPendingCandidate } from "./pairingMachine";

/** Narrow a decision to its pending branch without a conditional expect. */
function expectPending(decision: PairingDeepLinkDecision): PairingPendingCandidate {
  if (decision.kind !== "pending") throw new Error(`expected pending, received ${decision.kind}`);
  return decision.pending;
}

describe("pairing machine spec", () => {
  it("is self-consistent: full phase coverage, valid transitions, standard presets", () => {
    expect(validatePairingMachineSpec(PAIRING_MACHINE_SPEC)).toEqual([]);
  });

  it("fails closed when a rule leaves a (phase, retained) cell uncovered", () => {
    const broken = {
      ...PAIRING_MACHINE_SPEC,
      phaseAfterFailure: PAIRING_MACHINE_SPEC.phaseAfterFailure.slice(1),
    };
    expect(validatePairingMachineSpec(broken)).toContain(
      "phaseAfterFailure has no rule for launching with retainedCredential=false",
    );
  });

  it("does not feed the wire IR: no route, procedure, or schema lives in the spec", () => {
    const serialized = JSON.stringify(PAIRING_MACHINE_SPEC);
    expect(serialized).not.toContain("jsonSchema");
    expect(serialized).not.toContain("httpRoutes");
  });
});

describe("pairing failure-phase recovery", () => {
  const expected: ReadonlyArray<{
    previous: PairingMachinePhase;
    retained: boolean;
    next: PairingMachinePhase;
  }> = [
    { previous: "ready", retained: true, next: "ready" },
    { previous: "sessionExpired", retained: true, next: "sessionExpired" },
    { previous: "reconnectingStored", retained: true, next: "reconnectingStored" },
    { previous: "protocolIncompatible", retained: true, next: "protocolIncompatible" },
    { previous: "localStoreInconsistent", retained: true, next: "localStoreInconsistent" },
    { previous: "connecting", retained: true, next: "ready" },
    { previous: "launching", retained: true, next: "needsPairing" },
    { previous: "needsPairing", retained: true, next: "needsPairing" },
    { previous: "connecting", retained: false, next: "needsPairing" },
    { previous: "ready", retained: false, next: "needsPairing" },
  ];

  it.each(expected)("$previous + retained=$retained -> $next", ({ previous, retained, next }) => {
    expect(phaseAfterPairingFailure(previous, retained)).toBe(next);
  });
});

describe("pairing candidate tracker (duplicate policy: tracker)", () => {
  it("produces a stable, non-secret sha256 hex digest", () => {
    const first = pairingFingerprint("https://desktop.example", "lc_pair_secret");
    const second = pairingFingerprint("https://desktop.example", "lc_pair_secret");
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toContain("lc_pair_secret");
    expect(first).not.toContain("desktop.example");
    // Same host with a fresh credential is a different candidate.
    expect(pairingFingerprint("https://h", "tok-new")).not.toBe(
      pairingFingerprint("https://h", "tok-old"),
    );
  });

  it("ignores duplicates of in-flight and succeeded candidates", () => {
    const tracker = new PairingCandidateTracker();
    const digest = pairingFingerprint("https://h", "tok1");
    expect(tracker.decide(digest)).toBe("proceed");
    tracker.markInFlight(digest);
    expect(tracker.decide(digest)).toBe("ignoreDuplicate");
    tracker.markSucceeded(digest);
    expect(tracker.decide(digest)).toBe("ignoreDuplicate");
  });

  it("releases in-flight on failure so a retry of the same candidate can proceed", () => {
    const tracker = new PairingCandidateTracker();
    const digest = pairingFingerprint("https://h", "tok1");
    tracker.markInFlight(digest);
    tracker.markFailed(digest);
    expect(tracker.decide(digest)).toBe("proceed");
  });

  it("a fresh token for the same host is still allowed", () => {
    const tracker = new PairingCandidateTracker();
    const succeeded = pairingFingerprint("https://h", "tok-old");
    tracker.markSucceeded(succeeded);
    expect(tracker.decide(pairingFingerprint("https://h", "tok-new"))).toBe("proceed");
  });
});

describe("duplicate policy: consumed set", () => {
  it("skips process-lifetime duplicates and consumes non-empty fingerprints", () => {
    const seen = new Set<string>();
    expect(shouldSkipDuplicateFingerprint("abc", seen)).toBe(false);
    const next = afterFingerprintConsumed("abc", seen);
    expect(shouldSkipDuplicateFingerprint("abc", next)).toBe(true);
    expect(shouldSkipDuplicateFingerprint("other", next)).toBe(false);
  });

  it("empty fingerprints are never skipped nor recorded", () => {
    expect(shouldSkipDuplicateFingerprint("", new Set([""]))).toBe(false);
    expect(afterFingerprintConsumed("", new Set(["a"]))).toEqual(new Set(["a"]));
  });
});

describe("deep-link intent", () => {
  it("extracts one-shot pairing data and drops blank intent payloads", () => {
    expect(extractPairingData("https://poracode.com/pair?host=https://d#token=x")).toBe(
      "https://poracode.com/pair?host=https://d#token=x",
    );
    expect(extractPairingData(null)).toBeNull();
    expect(extractPairingData("")).toBeNull();
    expect(extractPairingData("   ")).toBeNull();
  });

  it("externally delivered links always require confirmation", () => {
    expect(requiresBrowsableConfirmation(true)).toBe(true);
    expect(requiresBrowsableConfirmation(false)).toBe(false);
  });

  it("builds a sanitized pending candidate without exposing the credential", () => {
    const tracker = new PairingCandidateTracker();
    const pending = expectPending(
      decideDeepLink("https://desktop.example:49152", "lc_pair_secret", tracker, false),
    );
    expect(pending.endpoint).toBe("https://desktop.example:49152");
    expect(pending.hostDisplay).toBe("desktop.example:49152");
    expect(pending.digest).toBe(
      pairingFingerprint("https://desktop.example:49152", "lc_pair_secret"),
    );
    expect(pending.isCleartextLan).toBe(false);
    expect(pending.replacesExistingPair).toBe(false);
    expect(pendingSanitizedDescription(pending)).not.toContain("lc_pair_secret");
  });

  it("marks a pending that would replace an existing live pair", () => {
    const pending = expectPending(
      decideDeepLink("https://h", "tok", new PairingCandidateTracker(), true),
    );
    expect(pending.replacesExistingPair).toBe(true);
  });

  it("ignores incomplete candidates and duplicate fingerprints", () => {
    const tracker = new PairingCandidateTracker();
    expect(decideDeepLink(null, "tok", tracker, false).kind).toBe("ignore");
    expect(decideDeepLink("https://h", "", tracker, false).kind).toBe("ignore");
    const first = expectPending(decideDeepLink("https://h", "tok", tracker, false));
    // decideDeepLink does not mutate the tracker; marking in-flight does.
    expect(decideDeepLink("https://h", "tok", tracker, false).kind).toBe("pending");
    tracker.markInFlight(first.digest);
    expect(decideDeepLink("https://h", "tok", tracker, false).kind).toBe("ignore");
  });
});

describe("host display + cleartext LAN", () => {
  it("prefers the URL authority host and explicit port", () => {
    expect(sanitizedHostLabel("https://desktop.example:49152/some/path")).toBe(
      "desktop.example:49152",
    );
    expect(sanitizedHostLabel("https://desktop.example")).toBe("desktop.example");
  });

  it("falls back to fragment/query stripping with a length bound", () => {
    expect(sanitizedHostLabel("not a url#secret?token=abc")).toBe("not a url");
    // A parseable URL loses the fragment by construction of the authority path.
    expect(sanitizedHostLabel("https://d#token=secret")).toBe("d");
    const long = `${"x".repeat(200)}#token=secret`;
    expect(sanitizedHostLabel(long)).toHaveLength(80);
    expect(sanitizedHostLabel(long)).not.toContain("token");
  });

  it("classifies cleartext LAN endpoints, excluding loopback", () => {
    expect(isCleartextLanEndpoint("http://192.168.1.10:49152")).toBe(true);
    expect(isCleartextLanEndpoint("https://192.168.1.10:49152")).toBe(false);
    expect(isCleartextLanEndpoint("http://localhost:49152")).toBe(false);
    expect(isCleartextLanEndpoint("http://127.0.0.1:49152")).toBe(false);
    expect(isCleartextLanEndpoint("http://[::1]:49152")).toBe(false);
    expect(isCleartextLanEndpoint("garbage")).toBe(false);
  });
});

describe("scope-request guard", () => {
  it("drops unknown advertised scopes", () => {
    expect(filterKnownScopes(["session:read", "future:scope", "projects:manage"])).toEqual([
      "session:read",
      "projects:manage",
    ]);
  });

  it("intersects into standard order, not advertised order", () => {
    expect(
      scopesToRequest(["projects:manage", "session:operate", "session:read", "future:capability"]),
    ).toEqual(["session:read", "session:operate", "projects:manage"]);
  });

  it("never escalates to the full standard set when nothing known is advertised", () => {
    expect(scopesToRequest([])).toEqual([]);
    expect(scopesToRequest(["future:x", "other:unknown"])).toEqual([]);
    expect(hasNoKnownAdvertisedScopes([])).toBe(true);
    expect(hasNoKnownAdvertisedScopes(["future:x"])).toBe(true);
  });

  it("derives capability predicates from filtered scopes", () => {
    expect(canReadScopes(["session:read", "future:x"])).toBe(true);
    expect(canOperateScopes(["session:read"])).toBe(false);
    expect(canOperateScopes(["session:operate"])).toBe(true);
    expect(canReadScopes(["session:operate"])).toBe(false);
  });

  it("declares the operator and viewer presets from batch 4.3", () => {
    expect(PAIRING_MACHINE_SPEC.scopes.presets.operator).toEqual(
      PAIRING_MACHINE_SPEC.scopes.standardOrder,
    );
    expect(PAIRING_MACHINE_SPEC.scopes.presets.viewer).toEqual(["session:read", "terminal:read"]);
  });
});

describe("intent-machine reducer", () => {
  const context = (overrides: Partial<Parameters<typeof reducePairingIntent>[2]> = {}) => ({
    candidate: null,
    tracker: new PairingCandidateTracker(),
    consumedFingerprints: new Set<string>(),
    hasExistingPair: false,
    ...overrides,
  });

  it("routes an external candidate into pending confirmation", () => {
    const candidate = {
      endpoint: "https://h",
      hostDisplay: "h",
      credential: "tok",
      digest: "d1",
      isCleartextLan: false,
      replacesExistingPair: false,
    };
    expect(
      reducePairingIntent(
        "idle",
        { type: "candidateSeen", external: true },
        context({ candidate }),
      ),
    ).toEqual({ state: "pendingConfirmation", effect: "storePending" });
  });

  it("routes a direct in-app candidate straight into the pair attempt", () => {
    const candidate = {
      endpoint: "https://h",
      hostDisplay: "h",
      credential: "tok",
      digest: "d1",
      isCleartextLan: false,
      replacesExistingPair: false,
    };
    expect(
      reducePairingIntent(
        "idle",
        { type: "candidateSeen", external: false },
        context({ candidate }),
      ),
    ).toEqual({ state: "pairInFlight", effect: "beginPair" });
  });

  it("ignores incomplete and duplicate candidates", () => {
    const candidate = {
      endpoint: "",
      hostDisplay: "",
      credential: "",
      digest: "",
      isCleartextLan: false,
      replacesExistingPair: false,
    };
    expect(
      reducePairingIntent(
        "idle",
        { type: "candidateSeen", external: true },
        context({ candidate }),
      ),
    ).toEqual({ state: "idle", effect: "ignore" });
    const duplicateDigest = pairingFingerprint("https://h", "tok");
    const duplicate = context({
      candidate: {
        endpoint: "https://h",
        hostDisplay: "h",
        credential: "tok",
        digest: duplicateDigest,
        isCleartextLan: false,
        replacesExistingPair: false,
      },
      consumedFingerprints: new Set([duplicateDigest]),
    });
    expect(
      reducePairingIntent("idle", { type: "candidateSeen", external: true }, duplicate),
    ).toEqual({ state: "idle", effect: "ignore" });
  });

  it("covers the confirm/cancel/fail/commit/reset transitions", () => {
    expect(
      reducePairingIntent("pendingConfirmation", { type: "confirmPending" }, context()),
    ).toEqual({
      state: "pairInFlight",
      effect: "beginPair",
    });
    expect(
      reducePairingIntent("pendingConfirmation", { type: "cancelPending" }, context()),
    ).toEqual({
      state: "idle",
      effect: "clearPending",
    });
    expect(reducePairingIntent("pairInFlight", { type: "pairAttemptFailed" }, context())).toEqual({
      state: "idle",
      effect: "releaseInFlight",
    });
    expect(reducePairingIntent("pairInFlight", { type: "pairCommitted" }, context())).toEqual({
      state: "paired",
      effect: "consumeFingerprint",
    });
    for (const state of ["idle", "pendingConfirmation", "paired"] as const) {
      expect(reducePairingIntent(state, { type: "reset" }, context())).toEqual({
        state: "idle",
        effect: "clearAll",
      });
    }
  });
});

describe("generated pairing sources", () => {
  const swift = emitSwiftPairingMachine();
  const kotlin = emitKotlinPairingMachine();

  it("renders byte-stable sources from one spec", () => {
    expect(emitSwiftPairingMachine()).toBe(swift);
    expect(emitKotlinPairingMachine()).toBe(kotlin);
  });

  it("carries every spec phase and failure rule into both languages", () => {
    for (const phase of PAIRING_MACHINE_SPEC.phases) {
      expect(swift).toContain(`case ${phase}`);
      expect(kotlin).toContain(`${phase[0]!.toUpperCase()}${phase.slice(1)}`);
    }
    for (const scope of PAIRING_MACHINE_SPEC.scopes.standardOrder) {
      expect(swift).toContain(`"${scope}"`);
      expect(kotlin).toContain(`"${scope}"`);
    }
    expect(swift).toContain("phaseAfterPairingFailure");
    expect(kotlin).toContain("phaseAfterPairingFailure");
    expect(swift).toContain("sha256 hex-lowercase");
    expect(kotlin).toContain("sha256 hex-lowercase");
  });

  it("emits only the pairing machine — never wire-contract schema tables", () => {
    expect(swift).not.toContain("RemoteSchema");
    expect(kotlin).not.toContain("RemoteSchemaValidator");
    expect(swift).not.toContain("x-poracode-semanticValidators");
  });
});
