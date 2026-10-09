import { describe, expect, it } from "vitest";
import {
  DEVIN_ACCOUNT_ROOT_FORMAT,
  DEVIN_PROFILE_CONFIG_FORMAT,
  DEVIN_PROFILE_CONFIG_FORMAT_LEGACY,
  describeDevinProfileConfigUnavailability,
  devinProfileConfigGeneration,
  parseDevinProfileConfig,
} from "./profileConfig";

/**
 * Captured verbatim from the previous format-1 parser (this module before the
 * format-2 change): the guard that refused any explicit format other than 1.
 * It exists so the compatibility claims below are tested against the ACTUAL
 * previous behavior, not a paraphrase — no broader compatibility is claimed
 * than this captured guard proves.
 */
function previousFormat1GuardRefusal(
  value: unknown,
): { status: "unsupported-format"; formatVersion: unknown } | undefined {
  if (value !== undefined && value !== null && typeof value === "object") {
    const rawFormat = (value as { format?: unknown }).format;
    if (rawFormat !== undefined && rawFormat !== 1) {
      return { status: "unsupported-format", formatVersion: rawFormat };
    }
  }
  return undefined;
}

describe("Devin profile config (format 2)", () => {
  it("parses an empty payload as the native-default profile at the latest format", () => {
    expect(parseDevinProfileConfig(undefined)).toEqual({
      status: "ok",
      config: { format: DEVIN_PROFILE_CONFIG_FORMAT, auth: { kind: "native-default" } },
    });
  });

  it("preserves and disables a future format instead of interpreting it", () => {
    const result = parseDevinProfileConfig({ format: 3, auth: { kind: "native-default" } });
    if (result.status !== "unsupported-format") {
      throw new Error(`expected unsupported-format, got ${result.status}`);
    }
    expect(result.formatVersion).toBe(3);
    expect(result.reason).toContain("format 3");
    expect(describeDevinProfileConfigUnavailability(result)).toBe(result.reason);
  });

  it("reads an absent format marker as the latest format, not as legacy", () => {
    const result = parseDevinProfileConfig({
      auth: { kind: "isolated-owner" },
      cloudDefaults: { persona: "" },
    });
    if (result.status !== "ok") throw new Error(`expected usable config, got ${result.status}`);
    expect(result.config.format).toBe(DEVIN_PROFILE_CONFIG_FORMAT);
    expect(result.config.format).not.toBe(DEVIN_PROFILE_CONFIG_FORMAT_LEGACY);
  });

  it("roundtrips an explicit legacy format-1 payload unchanged", () => {
    // Captured from the pre-format-2 suite: the exact payload shape the
    // format-1 editor wrote. An explicit marker keeps parsing under the
    // legacy schema, marker included.
    const legacy = {
      format: DEVIN_PROFILE_CONFIG_FORMAT_LEGACY,
      auth: { kind: "isolated-owner" },
      orgId: "org-abc",
      runtimeTarget: "cloud",
      agentType: "review",
      configPath: "~/devin-work.json",
    } as const;
    const result = parseDevinProfileConfig(legacy);
    expect(result).toEqual({ status: "ok", config: { ...legacy } });
    // Re-parsing the parsed output is stable — legacy stays legacy.
    const again = parseDevinProfileConfig(legacy);
    expect(again).toEqual(result);
  });

  it("the actual previous format-1 guard refuses a format-2 record", () => {
    const writtenNow = {
      format: DEVIN_PROFILE_CONFIG_FORMAT,
      auth: { kind: "native-default" },
      cloudDefaults: { repositories: ["SDSLeon/zed"] },
    };
    // The old build disables the profile and preserves the record instead of
    // silently ignoring cloudDefaults — this is the rollback protection the
    // format bump exists for.
    expect(previousFormat1GuardRefusal(writtenNow)).toEqual({
      status: "unsupported-format",
      formatVersion: DEVIN_PROFILE_CONFIG_FORMAT,
    });
    // And the current parser accepts what the old build refused.
    expect(parseDevinProfileConfig(writtenNow).status).toBe("ok");
  });

  it("refuses cloudDefaults carried under an explicit legacy format", () => {
    const result = parseDevinProfileConfig({
      format: DEVIN_PROFILE_CONFIG_FORMAT_LEGACY,
      auth: { kind: "isolated-owner" },
      cloudDefaults: { repositories: ["acme/website"] },
    });
    if (result.status !== "invalid") {
      throw new Error(`expected invalid, got ${result.status}`);
    }
    expect(result.reason).toContain("cloudDefaults");
    expect(result.reason).toContain("format 1");
    // Explicit Save (the editor's patch always writes the current format)
    // upgrades the record, and a well-formed cloudDefaults then applies.
    const upgraded = parseDevinProfileConfig({
      format: DEVIN_PROFILE_CONFIG_FORMAT,
      auth: { kind: "isolated-owner" },
      cloudDefaults: { repositories: ["acme/website"] },
    });
    expect(upgraded.status).toBe("ok");
  });

  it("keeps unknown keys so a hand-edited config never loses data", () => {
    const result = parseDevinProfileConfig({
      auth: { kind: "native-default" },
      futureKnob: { nested: true },
    });
    if (result.status !== "ok") throw new Error(`expected usable config, got ${result.status}`);
    expect(result.config).toMatchObject({ futureKnob: { nested: true } });
  });

  it("keeps unknown keys nested inside cloudDefaults", () => {
    const result = parseDevinProfileConfig({
      auth: { kind: "isolated-owner" },
      cloudDefaults: { repositories: ["acme/website"], futureCloudKnob: { keep: true } },
    });
    if (result.status !== "ok") throw new Error(`expected usable config, got ${result.status}`);
    expect(result.config.cloudDefaults).toMatchObject({
      repositories: ["acme/website"],
      futureCloudKnob: { keep: true },
    });
  });

  it("parses cloudDefaults with every meaningful absence shape", () => {
    // Absent cloudDefaults → leave the native choice everywhere.
    expect(parseDevinProfileConfig({ auth: { kind: "isolated-owner" } }).status).toBe("ok");
    // Empty repositories array is an explicit "clear all", kept verbatim.
    const cleared = parseDevinProfileConfig({
      cloudDefaults: { repositories: [], persona: "", platform: "linux" },
    });
    if (cleared.status !== "ok") throw new Error(`expected usable config, got ${cleared.status}`);
    expect(cleared.config.cloudDefaults).toEqual({
      repositories: [],
      persona: "",
      platform: "linux",
    });
    // persona "" is meaningful (the native Agent) and must not be dropped.
    const agent = parseDevinProfileConfig({ cloudDefaults: { persona: "" } });
    if (agent.status !== "ok") throw new Error(`expected usable config, got ${agent.status}`);
    expect(agent.config.cloudDefaults).toEqual({ persona: "" });
  });

  it("rejects malformed cloudDefaults visibly", () => {
    const invalid = (value: unknown) => {
      const result = parseDevinProfileConfig(value);
      if (result.status !== "invalid") throw new Error(`expected invalid, got ${result.status}`);
      expect(result.reason).toContain("cloudDefaults");
    };
    // Repositories travel CSV-comma-separated on the native wire, so a comma
    // inside one entry can never be expressed.
    invalid({ cloudDefaults: { repositories: ["acme/website,acme/api"] } });
    invalid({ cloudDefaults: { repositories: ["acme/web\u0000site"] } });
    invalid({ cloudDefaults: { repositories: [""] } });
    invalid({ cloudDefaults: { repositories: ["a".repeat(513)] } });
    invalid({ cloudDefaults: { repositories: ["acme/a", "acme/a"] } });
    invalid({
      cloudDefaults: { repositories: Array.from({ length: 101 }, (_, i) => `acme/r${i}`) },
    });
    invalid({ cloudDefaults: { repositories: "acme/website" } });
    invalid({ cloudDefaults: { persona: "p".repeat(513) } });
    invalid({ cloudDefaults: { platform: "darwin" } });
    invalid({ cloudDefaults: { platform: 7 } });
    invalid({ cloudDefaults: { repositories: ["acme/a"], platform: "solaris" } });
    // No invented provider ID pattern: opaque owner/name shapes stay valid.
    expect(
      parseDevinProfileConfig({ cloudDefaults: { repositories: ["SDSLeon/zed"] } }).status,
    ).toBe("ok");
  });

  it("rejects root agent types outside the CLI's closed enum", () => {
    expect(parseDevinProfileConfig({ agentType: "bogus" }).status).toBe("invalid");
    // Custom personas are native subagents, never root --agent-type values.
    expect(parseDevinProfileConfig({ agentType: "review" }).status).toBe("ok");
  });

  it("rejects owner references that are not opaque instance ids", () => {
    expect(parseDevinProfileConfig({ auth: { kind: "owner-reference" } }).status).toBe("invalid");
    expect(parseDevinProfileConfig({ auth: { kind: "owner-reference", ownerId: "" } }).status).toBe(
      "invalid",
    );
    expect(
      parseDevinProfileConfig({ auth: { kind: "owner-reference", ownerId: "/etc/passwd" } }).status,
    ).toBe("invalid");
  });

  it("keeps the isolated account-root marker at its own format 1", () => {
    // The profile-config format bump does not touch account roots.
    expect(DEVIN_ACCOUNT_ROOT_FORMAT).toBe(1);
  });

  it("derives a stable content generation that changes with meaningful edits", () => {
    const parseOk = (value: unknown) => {
      const result = parseDevinProfileConfig(value);
      if (result.status !== "ok") throw new Error(`expected usable config, got ${result.status}`);
      return result.config;
    };
    const base = parseOk({ orgId: "org-a" });
    const same = parseOk({ orgId: "org-a" });
    const other = parseOk({ orgId: "org-b" });
    expect(devinProfileConfigGeneration(base)).toBe(devinProfileConfigGeneration(same));
    expect(devinProfileConfigGeneration(base)).not.toBe(devinProfileConfigGeneration(other));
    // Unknown keys are part of the configuration identity.
    const extended = parseOk({ orgId: "org-a", extra: 1 });
    expect(devinProfileConfigGeneration(extended)).not.toBe(devinProfileConfigGeneration(base));
    // Cloud defaults participate: an edit to any of the three dimensions
    // invalidates derived catalogs.
    const withCloud = parseOk({ orgId: "org-a", cloudDefaults: { persona: "" } });
    expect(devinProfileConfigGeneration(withCloud)).not.toBe(devinProfileConfigGeneration(base));
    expect(
      devinProfileConfigGeneration(parseOk({ orgId: "org-a", cloudDefaults: { persona: "ops" } })),
    ).not.toBe(devinProfileConfigGeneration(withCloud));
    expect(
      devinProfileConfigGeneration(
        parseOk({ orgId: "org-a", cloudDefaults: { repositories: [] } }),
      ),
    ).not.toBe(devinProfileConfigGeneration(base));
    expect(
      devinProfileConfigGeneration(
        parseOk({ orgId: "org-a", cloudDefaults: { platform: "linux" } }),
      ),
    ).not.toBe(devinProfileConfigGeneration(base));
  });

  it("hashes nested auth bindings so distinct account bindings never share a generation", () => {
    const generation = (auth: unknown) =>
      devinProfileConfigGeneration({
        format: DEVIN_PROFILE_CONFIG_FORMAT,
        auth,
      } as Parameters<typeof devinProfileConfigGeneration>[0]);
    const native = generation({ kind: "native-default" });
    const isolated = generation({ kind: "isolated-owner" });
    const refA = generation({ kind: "owner-reference", ownerId: "owner-a" });
    const refB = generation({ kind: "owner-reference", ownerId: "owner-b" });
    // Every distinct binding hashes distinctly — nested keys participate.
    expect(new Set([native, isolated, refA, refB]).size).toBe(4);
    // Key order inside nested objects never matters.
    expect(
      devinProfileConfigGeneration({
        format: DEVIN_PROFILE_CONFIG_FORMAT,
        auth: { ownerId: "owner-a", kind: "owner-reference" },
      } as Parameters<typeof devinProfileConfigGeneration>[0]),
    ).toBe(refA);
    // Unknown nested objects participate recursively.
    const nestedA = devinProfileConfigGeneration({
      format: DEVIN_PROFILE_CONFIG_FORMAT,
      auth: { kind: "native-default" },
      future: { deep: { x: 1 } },
    } as Parameters<typeof devinProfileConfigGeneration>[0]);
    const nestedB = devinProfileConfigGeneration({
      format: DEVIN_PROFILE_CONFIG_FORMAT,
      auth: { kind: "native-default" },
      future: { deep: { x: 2 } },
    } as Parameters<typeof devinProfileConfigGeneration>[0]);
    expect(nestedA).not.toBe(nestedB);
  });
});
