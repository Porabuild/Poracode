import { describe, expect, it } from "vitest";
import {
  DEFAULT_HOST_RESOURCE_ADMISSION_SETTINGS,
  HOST_RESOURCE_BUSY_CODE,
  HOST_RESOURCE_POLICY_UNAVAILABLE_CODE,
  HostResourceAdmissionRefusalError,
  gitProcessAdmissionDiagnosticsSchema,
  hostResourceAdmissionSettingsSchema,
  hostResourceRetryAfterMsOf,
  isHostResourceAdmissionRefusal,
  isHostResourceBusyError,
  isHostResourcePolicyUnavailableError,
  resolveHostResourceAdmissionEvidence,
} from "./hostResourceAdmission";
import { defaultSharedSettings, normalizeSharedSettings } from "./settings";

const MAX_SAFE = Number.MAX_SAFE_INTEGER;

describe("host resource admission settings resolution", () => {
  it("treats a missing field on a valid document as an explicit absence", () => {
    expect(resolveHostResourceAdmissionEvidence({ themeMode: "dark" })).toEqual({
      kind: "absent",
    });
  });

  it("fills only absent keys from the declared defaults for a valid partial object", () => {
    // The settings authority fills absence before its own parse; the raw
    // resolver must agree, so a partial authority-valid document keeps 8.
    expect(
      resolveHostResourceAdmissionEvidence({
        hostResourceAdmission: { maxActiveAgentSessions: 8 },
      }),
    ).toEqual({
      kind: "configured",
      settings: {
        maxActiveAgentSessions: 8,
        maxActiveTerminalShells: 0,
        maxActiveGenerationHelpers: 0,
      },
    });
  });

  it("keeps explicit zeroes as a configured unlimited policy", () => {
    expect(
      resolveHostResourceAdmissionEvidence({
        hostResourceAdmission: {
          maxActiveAgentSessions: 0,
          maxActiveTerminalShells: 0,
          maxActiveGenerationHelpers: 0,
        },
      }),
    ).toEqual({ kind: "configured", settings: { ...DEFAULT_HOST_RESOURCE_ADMISSION_SETTINGS } });
  });

  it("accepts nonnegative safe integers with no arbitrary ceiling", () => {
    const resolution = resolveHostResourceAdmissionEvidence({
      hostResourceAdmission: {
        maxActiveAgentSessions: MAX_SAFE,
        maxActiveTerminalShells: 512,
        maxActiveGenerationHelpers: 512,
      },
    });
    expect(resolution).toEqual({
      kind: "configured",
      settings: {
        maxActiveAgentSessions: MAX_SAFE,
        maxActiveTerminalShells: 512,
        maxActiveGenerationHelpers: 512,
      },
    });
  });

  it("never treats a present invalid value as unlimited", () => {
    const invalidValues: unknown[] = [
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      MAX_SAFE + 1,
      "4",
      null,
      true,
      [],
      {},
    ];
    for (const value of invalidValues) {
      const resolution = resolveHostResourceAdmissionEvidence({
        hostResourceAdmission: {
          maxActiveAgentSessions: value,
          maxActiveTerminalShells: 0,
          maxActiveGenerationHelpers: 0,
        },
      });
      expect(
        resolution.kind,
        `expected ${String(value)} to be invalid, got ${JSON.stringify(resolution)}`,
      ).toBe("invalid");
    }
  });

  it("rejects a non-object field and a non-object document with safe codes", () => {
    expect(resolveHostResourceAdmissionEvidence({ hostResourceAdmission: "4" })).toEqual({
      kind: "invalid",
      problem: "host-resource-admission-invalid",
    });
    expect(resolveHostResourceAdmissionEvidence(42)).toEqual({
      kind: "invalid",
      problem: "settings-document-not-object",
    });
    expect(resolveHostResourceAdmissionEvidence(null)).toEqual({
      kind: "invalid",
      problem: "settings-document-not-object",
    });
  });

  it("ignores unknown sub-keys so a newer writer stays readable", () => {
    expect(
      resolveHostResourceAdmissionEvidence({
        hostResourceAdmission: {
          maxActiveAgentSessions: 4,
          maxActiveTerminalShells: 2,
          maxActiveGenerationHelpers: 1,
          futureClass: 9,
        },
      }),
    ).toEqual({
      kind: "configured",
      settings: {
        maxActiveAgentSessions: 4,
        maxActiveTerminalShells: 2,
        maxActiveGenerationHelpers: 1,
      },
    });
  });

  it("mirrors the same partial/invalid/legacy cases through normalizeSharedSettings", () => {
    expect(
      normalizeSharedSettings({
        hostResourceAdmission: { maxActiveAgentSessions: 8 },
      }).hostResourceAdmission,
    ).toEqual({
      maxActiveAgentSessions: 8,
      maxActiveTerminalShells: 0,
      maxActiveGenerationHelpers: 0,
    });

    // A present invalid value falls back per-field for typed settings only;
    // the raw resolver above never selects unlimited for it.
    expect(
      normalizeSharedSettings({ hostResourceAdmission: { maxActiveAgentSessions: -1 } })
        .hostResourceAdmission,
    ).toEqual({ ...DEFAULT_HOST_RESOURCE_ADMISSION_SETTINGS });

    // Legacy documents without the field keep the transitional defaults.
    expect(normalizeSharedSettings({}).hostResourceAdmission).toEqual({
      ...DEFAULT_HOST_RESOURCE_ADMISSION_SETTINGS,
    });
    expect(defaultSharedSettings.hostResourceAdmission).toEqual({
      ...DEFAULT_HOST_RESOURCE_ADMISSION_SETTINGS,
    });
  });

  it("schema rejects unsafe integers while plain z.number() would accept them", () => {
    expect(
      hostResourceAdmissionSettingsSchema.safeParse({ maxActiveAgentSessions: MAX_SAFE }).success,
    ).toBe(true);
    expect(
      hostResourceAdmissionSettingsSchema.safeParse({ maxActiveAgentSessions: MAX_SAFE + 1 })
        .success,
    ).toBe(false);
  });
});

describe("host resource admission refusal helpers", () => {
  it("classifies busy and policy-unavailable codes without shared classes", () => {
    const busy = Object.assign(new Error("full"), {
      code: HOST_RESOURCE_BUSY_CODE,
      retryAfterMs: 250,
    });
    const unavailable = Object.assign(new Error("no policy"), {
      code: HOST_RESOURCE_POLICY_UNAVAILABLE_CODE,
    });
    expect(isHostResourceBusyError(busy)).toBe(true);
    expect(isHostResourcePolicyUnavailableError(busy)).toBe(false);
    expect(isHostResourceAdmissionRefusal(busy)).toBe(true);
    expect(isHostResourcePolicyUnavailableError(unavailable)).toBe(true);
    expect(isHostResourceAdmissionRefusal(unavailable)).toBe(true);
    expect(isHostResourceAdmissionRefusal(new Error("full"))).toBe(false);
    expect(hostResourceRetryAfterMsOf(busy)).toBe(250);
  });

  it("drops malformed retry hints instead of forwarding them", () => {
    for (const retryAfterMs of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "250", null]) {
      expect(
        hostResourceRetryAfterMsOf({ retryAfterMs }),
        `retryAfterMs=${String(retryAfterMs)}`,
      ).toBeUndefined();
    }
  });

  it("rehydrates a typed refusal with the shared carrier error", () => {
    const error = new HostResourceAdmissionRefusalError("full", {
      code: HOST_RESOURCE_BUSY_CODE,
      retryAfterMs: 1000,
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("HostResourceAdmissionRefusalError");
    expect(error.code).toBe(HOST_RESOURCE_BUSY_CODE);
    expect(error.retryAfterMs).toBe(1000);
    expect(isHostResourceBusyError(error)).toBe(true);
  });
});

describe("git process admission diagnostics schema", () => {
  const legacyReport = {
    short: { limit: 8, active: 0, queued: 0, maxActive: 0 },
    long: { limit: 2, active: 0, queued: 0, maxActive: 0 },
    admitted: 0,
    queueFullRefusals: 0,
    waitTimeoutRefusals: 0,
    cancellations: 0,
  };

  it("parses an older peer report without the additive timing fields", () => {
    expect(gitProcessAdmissionDiagnosticsSchema.parse(legacyReport)).toEqual(legacyReport);
  });

  it("accepts and preserves the additive timing, slow-fetch and environment fields", () => {
    const report = {
      ...legacyReport,
      short: {
        ...legacyReport.short,
        queueWaitMs: 0,
        maxQueueWaitMs: 0,
        executionMs: 1.5,
        maxExecutionMs: 1.5,
      },
      long: {
        ...legacyReport.long,
        queueWaitMs: 250,
        maxQueueWaitMs: 250,
        executionMs: 10_001,
        maxExecutionMs: 10_001,
      },
      slowFetches: 1,
      environments: {
        posix: { active: 0, queued: 0 },
        windows: { active: 0, queued: 0 },
        wsl: { active: 5, queued: 2 },
      },
    };
    expect(gitProcessAdmissionDiagnosticsSchema.parse(report)).toEqual(report);
  });

  it("rejects negative timings and malformed environment gauges", () => {
    expect(
      gitProcessAdmissionDiagnosticsSchema.safeParse({
        ...legacyReport,
        short: { ...legacyReport.short, queueWaitMs: -1 },
      }).success,
    ).toBe(false);
    expect(
      gitProcessAdmissionDiagnosticsSchema.safeParse({
        ...legacyReport,
        environments: {
          posix: { active: -1, queued: 0 },
          windows: { active: 0, queued: 0 },
          wsl: { active: 0, queued: 0 },
        },
      }).success,
    ).toBe(false);
    expect(
      gitProcessAdmissionDiagnosticsSchema.safeParse({
        ...legacyReport,
        environments: { posix: { active: 0, queued: 0 }, windows: { active: 0, queued: 0 } },
      }).success,
    ).toBe(false);
  });
});
