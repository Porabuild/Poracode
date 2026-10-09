// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { AgentInstanceConfig } from "@/shared/contracts";
import {
  parseDevinProfileConfig,
  type DevinProfileConfig,
} from "@/shared/agents/devin/profileConfig";
import {
  devinCloudDefaultsFormFromConfig,
  devinCloudDefaultsFromForm,
  devinCloudFormIssues,
  devinProfileConfigFingerprint,
  devinProfileConfigPatch,
  devinProfileConfigView,
  devinProfileOwnerCandidates,
  devinProfileOwnerRef,
  emptyDevinCloudDefaultsForm,
  emptyDevinProfileConfig,
  findDevinProfileDependents,
  parseDevinCloudRepositoryEntries,
  type DevinCloudDefaultsForm,
} from "./profileConfigUi";

function instance(overrides: Partial<AgentInstanceConfig> & { id: string }): AgentInstanceConfig {
  return { driver: "devin", ...overrides } as AgentInstanceConfig;
}

function form(overrides: Partial<DevinCloudDefaultsForm> = {}): DevinCloudDefaultsForm {
  return { ...emptyDevinCloudDefaultsForm(), ...overrides };
}

describe("devinProfileConfigView via the shared parser", () => {
  // The view is a thin adapter over the authoritative shared parser — the
  // same module the supervisor validates persisted payloads with. This guard
  // fails if the adapter's status mapping ever diverges from the parser.
  const samples: unknown[] = [
    undefined,
    null,
    {},
    "",
    [],
    { format: 1 },
    { format: 1, auth: { kind: "native-default" } },
    { format: 1, auth: { kind: "isolated-owner" } },
    { auth: { kind: "isolated-owner" }, orgId: "org-abc" },
    { format: 1, auth: { kind: "owner-reference", ownerId: "devin_owner" } },
    {
      format: 1,
      auth: { kind: "native-default" },
      configPath: "~/work.json",
      runtimeTarget: "cloud",
      agentType: "review",
      futureKey: { keep: true },
    },
    { format: 2 },
    { format: 2, cloudDefaults: { repositories: ["SDSLeon/zed"], persona: "", platform: "linux" } },
    { format: 3, auth: { kind: "native-default" } },
    { format: "2" },
    { auth: { kind: "bogus" } },
    { auth: { kind: "owner-reference" } },
    { runtimeTarget: "quantum" },
    { agentType: "bogus" },
    { configPath: 7 },
    { orgId: "" },
    { cloudDefaults: { repositories: ["a,b"] } },
    { cloudDefaults: { platform: "solaris" } },
  ];

  it("maps every sample shape to the parser's status verbatim", () => {
    for (const sample of samples) {
      const viewStatus = devinProfileConfigView(sample).status;
      const mapped = viewStatus === "usable" ? "ok" : viewStatus;
      expect(`view=${String(mapped)}`).toBe(
        `view=${String(parseDevinProfileConfig(sample).status)}`,
      );
    }
  });

  it("classifies a missing or empty payload as the usable native-default default at the latest format", () => {
    for (const value of [undefined, null, {}]) {
      expect(devinProfileConfigView(value)).toMatchObject({
        status: "usable",
        config: { format: 2, auth: { kind: "native-default" } },
      });
    }
  });

  it("keeps a newer format stored verbatim instead of reinterpreting it", () => {
    const raw = { format: 3, auth: { kind: "native-default" }, futureField: { a: 1 } };
    const view = devinProfileConfigView(raw);
    expect(view).toMatchObject({ status: "unsupported-format", formatVersion: 3, raw });
    expect(view.raw).toBe(raw);
  });

  it("reports invalid payloads while preserving the stored record", () => {
    const raw = { auth: { kind: "bogus" }, futureHint: "keep" };
    const view = devinProfileConfigView(raw);
    expect(view.status).toBe("invalid");
    expect(view.raw).toBe(raw);
    expect(devinProfileConfigView({ runtimeTarget: "quantum" }).status).toBe("invalid");
    expect(devinProfileConfigView({ agentType: "bogus" }).status).toBe("invalid");
    expect(devinProfileConfigView({ configPath: 7 }).status).toBe("invalid");
    // Malformed cloud defaults are visible too.
    expect(devinProfileConfigView({ cloudDefaults: { platform: "solaris" } }).status).toBe(
      "invalid",
    );
    // New semantics must not survive silently under an explicit legacy marker.
    expect(
      devinProfileConfigView({
        format: 1,
        auth: { kind: "native-default" },
        cloudDefaults: { repositories: [] },
      }).status,
    ).toBe("invalid");
  });

  it("applies schema defaults for display and retains unknown keys in the config", () => {
    const view = devinProfileConfigView({
      auth: { kind: "owner-reference", ownerId: "acct-1" },
      orgId: "org-abc",
      futureVendorHint: { keep: true },
    });
    expect(view.status).toBe("usable");
    if (view.status !== "usable") return;
    expect(view.config).toMatchObject({
      auth: { kind: "owner-reference", ownerId: "acct-1" },
      orgId: "org-abc",
      futureVendorHint: { keep: true },
    });
    expect(devinProfileOwnerRef(view.config)).toBe("acct-1");
  });

  it("accepts every explicit format-1 shape the supervisor schema accepts", () => {
    expect(devinProfileConfigView({ format: 1 }).status).toBe("usable");
    expect(
      devinProfileConfigView({
        format: 1,
        auth: { kind: "owner-reference", ownerId: "devin_owner" },
        configPath: "~/.config/devin/work.json",
        orgId: "org-abc",
        runtimeTarget: "cloud",
        agentType: "review",
      }).status,
    ).toBe("usable");
  });
});

describe("devinProfileConfigPatch", () => {
  it("builds the latest-format native default", () => {
    expect(
      devinProfileConfigPatch(
        {},
        {
          authKind: "native-default",
          ownerId: undefined,
          configPath: "",
          orgId: "",
          runtimeTarget: undefined,
          agentType: undefined,
          cloud: emptyDevinCloudDefaultsForm(),
        },
      ),
    ).toEqual({ format: 2, auth: { kind: "native-default" } });
    expect(emptyDevinProfileConfig()).toEqual({ format: 2, auth: { kind: "native-default" } });
  });

  it("preserves unknown persisted keys while replacing owned fields", () => {
    const raw = {
      format: 1,
      auth: { kind: "isolated-owner" },
      orgId: "org-old",
      futureVendorHint: { keep: true },
    };
    const next = devinProfileConfigPatch(raw, {
      authKind: "native-default",
      ownerId: undefined,
      configPath: " /tmp/work.json ",
      orgId: " org-new ",
      runtimeTarget: "cloud",
      agentType: "summarizer",
      cloud: emptyDevinCloudDefaultsForm(),
    });
    expect(next).toEqual({
      format: 2,
      auth: { kind: "native-default" },
      configPath: "/tmp/work.json",
      orgId: "org-new",
      runtimeTarget: "cloud",
      futureVendorHint: { keep: true },
    });
  });

  it("removes stale owner references when leaving owner-reference auth", () => {
    const raw = { format: 1, auth: { kind: "owner-reference", ownerId: "gone" } };
    const next = devinProfileConfigPatch(raw, {
      authKind: "isolated-owner",
      ownerId: undefined,
      configPath: "",
      orgId: "",
      runtimeTarget: undefined,
      agentType: undefined,
      cloud: emptyDevinCloudDefaultsForm(),
    });
    expect(next).toEqual({ format: 2, auth: { kind: "isolated-owner" } });
    expect(JSON.stringify(next)).not.toContain("gone");
  });
});

describe("devinProfileConfigPatch cloud chat setup", () => {
  it("writes explicit cloud choices and removes a root agent type that cloud ignores", () => {
    const next = devinProfileConfigPatch(
      { agentType: "review", cloudDefaults: { persona: "ops" } },
      {
        authKind: "isolated-owner",
        ownerId: undefined,
        configPath: "",
        orgId: "",
        runtimeTarget: "cloud",
        agentType: undefined,
        cloud: form({
          repositoryMode: "list",
          repositoriesText: " SDSLeon/zed , SDSLeon/lightcode ",
          personaMode: "agent",
          platformMode: "select",
          platform: "windows",
        }),
      },
    );
    expect(next).toEqual({
      format: 2,
      auth: { kind: "isolated-owner" },
      runtimeTarget: "cloud",
      cloudDefaults: {
        repositories: ["SDSLeon/zed", "SDSLeon/lightcode"],
        persona: "",
        platform: "windows",
      },
    });
    expect(JSON.stringify(next)).not.toContain("review");
  });

  it("persona as the explicit Agent is an empty string, never dropped", () => {
    const next = devinProfileConfigPatch(
      {},
      {
        authKind: "native-default",
        ownerId: undefined,
        configPath: "",
        orgId: "",
        runtimeTarget: "cloud",
        agentType: undefined,
        cloud: form({ personaMode: "agent" }),
      },
    );
    expect(next.cloudDefaults).toEqual({ persona: "" });
  });

  it("no-repositories is an explicit empty list", () => {
    const next = devinProfileConfigPatch(
      {},
      {
        authKind: "native-default",
        ownerId: undefined,
        configPath: "",
        orgId: "",
        runtimeTarget: "cloud",
        agentType: undefined,
        cloud: form({ repositoryMode: "none" }),
      },
    );
    expect(next.cloudDefaults).toEqual({ repositories: [] });
  });

  it("all-keep removes only the owned dimensions and preserves unknown cloud keys", () => {
    const next = devinProfileConfigPatch(
      { cloudDefaults: { repositories: ["acme/web"], platform: "linux", futureKnob: 1 } },
      {
        authKind: "native-default",
        ownerId: undefined,
        configPath: "",
        orgId: "",
        runtimeTarget: "cloud",
        agentType: undefined,
        cloud: emptyDevinCloudDefaultsForm(),
      },
    );
    // Returning every dimension to "keep" drops the stored choices (absent
    // means Devin decides again) but unknown keys ride along.
    expect(next.cloudDefaults).toEqual({ futureKnob: 1 });
  });

  it("drops the cloudDefaults key entirely when nothing remains", () => {
    const next = devinProfileConfigPatch(
      { cloudDefaults: { platform: "macos" } },
      {
        authKind: "native-default",
        ownerId: undefined,
        configPath: "",
        orgId: "",
        runtimeTarget: "cloud",
        agentType: undefined,
        cloud: emptyDevinCloudDefaultsForm(),
      },
    );
    expect(next).not.toHaveProperty("cloudDefaults");
  });

  it("leaves cloudDefaults dormant when the target is not cloud", () => {
    const stored = { repositories: ["acme/web"], futureKnob: { deep: true } };
    const next = devinProfileConfigPatch(
      { runtimeTarget: "cloud", cloudDefaults: stored, agentType: "summarizer" },
      {
        authKind: "native-default",
        ownerId: undefined,
        configPath: "",
        orgId: "",
        runtimeTarget: "local",
        agentType: "review",
        cloud: emptyDevinCloudDefaultsForm(),
      },
    );
    // Switching local retains the cloud-scoped choices untouched (the section
    // is hidden, so the form must not have written over them), and the agent
    // type is a local choice again.
    expect(next.cloudDefaults).toEqual(stored);
    expect(next.agentType).toBe("review");
    expect(next.runtimeTarget).toBe("local");
  });

  it("replaces a malformed carried cloudDefaults record when the target is cloud", () => {
    const next = devinProfileConfigPatch(
      { cloudDefaults: "garbage" },
      {
        authKind: "native-default",
        ownerId: undefined,
        configPath: "",
        orgId: "",
        runtimeTarget: "cloud",
        agentType: undefined,
        cloud: form({ personaMode: "custom", personaSlug: "ops" }),
      },
    );
    expect(next.cloudDefaults).toEqual({ persona: "ops" });
  });

  it("keeps an explicit legacy format-1 record parseable after an upgrade save", () => {
    const legacy = {
      format: 1,
      auth: { kind: "owner-reference", ownerId: "owner" },
      runtimeTarget: "cloud",
    };
    const next = devinProfileConfigPatch(legacy, {
      authKind: "owner-reference",
      ownerId: "owner",
      configPath: "",
      orgId: "",
      runtimeTarget: "cloud",
      agentType: undefined,
      cloud: form({ repositoryMode: "list", repositoriesText: "acme/web" }),
    });
    expect(next.format).toBe(2);
    expect(parseDevinProfileConfig(next).status).toBe("ok");
  });
});

describe("devinCloudDefaultsFormFromConfig", () => {
  it("seeds all-keep for a config without cloud defaults", () => {
    expect(
      devinCloudDefaultsFormFromConfig({ format: 2, auth: { kind: "native-default" } }),
    ).toEqual(emptyDevinCloudDefaultsForm());
  });

  it("seeds stored choices, including the meaningful empty persona", () => {
    expect(
      devinCloudDefaultsFormFromConfig({
        format: 2,
        auth: { kind: "native-default" },
        cloudDefaults: {
          repositories: ["SDSLeon/zed", "SDSLeon/lightcode"],
          persona: "",
          platform: "macos",
        },
      }),
    ).toEqual({
      repositoryMode: "list",
      repositoriesText: "SDSLeon/zed, SDSLeon/lightcode",
      personaMode: "agent",
      personaSlug: "",
      platformMode: "select",
      platform: "macos",
    });
  });

  it("seeds an empty repository list as the explicit no-repositories mode", () => {
    const seeded = devinCloudDefaultsFormFromConfig({
      format: 2,
      auth: { kind: "native-default" },
      cloudDefaults: { repositories: [] },
    });
    expect(seeded.repositoryMode).toBe("none");
  });

  it("roundtrips form → value → form for every mode combination", () => {
    const variants: DevinCloudDefaultsForm[] = [
      emptyDevinCloudDefaultsForm(),
      form({ repositoryMode: "none" }),
      form({ repositoryMode: "list", repositoriesText: "acme/web, acme/api" }),
      form({ personaMode: "agent" }),
      form({ personaMode: "custom", personaSlug: "ops" }),
      form({ platformMode: "select", platform: "windows" }),
      form({
        repositoryMode: "list",
        repositoriesText: "acme/web",
        personaMode: "custom",
        personaSlug: "ops",
        platformMode: "select",
        platform: "linux",
      }),
    ];
    for (const variant of variants) {
      const value = devinCloudDefaultsFromForm(variant);
      const config: DevinProfileConfig = {
        format: 2,
        auth: { kind: "native-default" },
        ...(value ? { cloudDefaults: value } : {}),
      };
      expect(devinCloudDefaultsFormFromConfig(config)).toEqual(variant);
    }
  });
});

describe("parseDevinCloudRepositoryEntries and devinCloudFormIssues", () => {
  it("splits on commas, trims, and drops blank segments", () => {
    expect(parseDevinCloudRepositoryEntries("")).toEqual([]);
    expect(parseDevinCloudRepositoryEntries(" acme/web , ,acme/api,")).toEqual([
      "acme/web",
      "acme/api",
    ]);
  });

  it("reports no issues for savable forms", () => {
    expect(devinCloudFormIssues(emptyDevinCloudDefaultsForm())).toEqual([]);
    expect(
      devinCloudFormIssues(
        form({ repositoryMode: "list", repositoriesText: "acme/web, acme/api" }),
      ),
    ).toEqual([]);
    expect(devinCloudFormIssues(form({ personaMode: "agent" }))).toEqual([]);
  });

  it("flags duplicate, malformed, and over-list repository entries", () => {
    expect(
      devinCloudFormIssues(
        form({ repositoryMode: "list", repositoriesText: "acme/web, acme/web" }),
      ),
    ).toContain("repository-duplicate");
    expect(
      devinCloudFormIssues(form({ repositoryMode: "list", repositoriesText: "acme/web x" })),
    ).toEqual([]);
    expect(
      devinCloudFormIssues(
        form({
          repositoryMode: "list",
          repositoriesText: Array.from({ length: 101 }, (_, i) => `acme/r${i}`).join(", "),
        }),
      ),
    ).toContain("repository-overflow");
    expect(
      devinCloudFormIssues(form({ repositoryMode: "list", repositoriesText: "a".repeat(513) })),
    ).toContain("repository-entry");
    expect(
      devinCloudFormIssues(form({ repositoryMode: "list", repositoriesText: "acme/web\u0007" })),
    ).toContain("repository-entry");
  });

  it("flags a custom persona that is empty or oversized", () => {
    expect(devinCloudFormIssues(form({ personaMode: "custom", personaSlug: "  " }))).toContain(
      "persona-empty",
    );
    expect(
      devinCloudFormIssues(form({ personaMode: "custom", personaSlug: "p".repeat(513) })),
    ).toContain("persona-overflow");
  });
});

describe("devinProfileConfigFingerprint", () => {
  it("is equal for the same content regardless of key order, at every nesting level", () => {
    expect(devinProfileConfigFingerprint({ a: 1, b: { c: 2, d: 3 } })).toBe(
      devinProfileConfigFingerprint({ b: { d: 3, c: 2 }, a: 1 }),
    );
    expect(devinProfileConfigFingerprint({ auth: { kind: "native-default" }, orgId: "o" })).toBe(
      devinProfileConfigFingerprint({ orgId: "o", auth: { kind: "native-default" } }),
    );
    expect(
      devinProfileConfigFingerprint({
        cloudDefaults: { repositories: ["a", "b"], persona: "" },
      }),
    ).toBe(
      devinProfileConfigFingerprint({
        cloudDefaults: { persona: "", repositories: ["a", "b"] },
      }),
    );
  });

  it("differs on unknown fields, changed values, and array order", () => {
    expect(devinProfileConfigFingerprint({ a: 1 })).not.toBe(
      devinProfileConfigFingerprint({ a: 1, futureHint: "keep-me" }),
    );
    expect(devinProfileConfigFingerprint({ auth: { kind: "native-default" } })).not.toBe(
      devinProfileConfigFingerprint({
        auth: { kind: "owner-reference", ownerId: "devin_owner" },
      }),
    );
    expect(devinProfileConfigFingerprint({ tags: [1, 2] })).not.toBe(
      devinProfileConfigFingerprint({ tags: [2, 1] }),
    );
    expect(devinProfileConfigFingerprint({ cloudDefaults: { persona: "" } })).not.toBe(
      devinProfileConfigFingerprint({ cloudDefaults: { persona: "ops" } }),
    );
  });

  it("compares the parsed configs the save flow confirms, unknown keys included", () => {
    const stored = {
      format: 2,
      auth: { kind: "native-default" },
      orgId: "org-abc",
      cloudDefaults: { repositories: ["acme/web"] },
      futureHint: { keep: true },
    };
    const fingerprintOfOk = (value: unknown): string => {
      const parsed = parseDevinProfileConfig(value);
      if (parsed.status !== "ok") throw new Error(`expected ok, got ${parsed.status}`);
      return devinProfileConfigFingerprint(parsed.config);
    };
    // The host re-reading the same payload parses to the same canonical
    // record, whatever order the keys round-trip in.
    expect(fingerprintOfOk(stored)).toBe(
      fingerprintOfOk({
        futureHint: { keep: true },
        cloudDefaults: { repositories: ["acme/web"] },
        orgId: "org-abc",
        format: 2,
        auth: { kind: "native-default" },
      }),
    );
    expect(fingerprintOfOk(stored)).not.toBe(fingerprintOfOk({ ...stored, orgId: "org-other" }));
  });
});

describe("owner candidates and dependents", () => {
  const instances: Record<string, AgentInstanceConfig> = {
    owner: instance({
      id: "owner",
      displayName: "Work login",
      config: { format: 2, auth: { kind: "isolated-owner" } },
    }),
    ref: instance({
      id: "ref",
      displayName: "Review config",
      config: {
        format: 2,
        auth: { kind: "owner-reference", ownerId: "owner" },
        runtimeTarget: "cloud",
      },
    }),
    native: instance({
      id: "native",
      config: { format: 1, auth: { kind: "native-default" } },
    }),
    brokenOwner: instance({
      id: "brokenOwner",
      config: { format: 3, auth: { kind: "isolated-owner" } },
    }),
    disabledOwner: instance({
      id: "disabledOwner",
      enabled: false,
      config: { format: 1, auth: { kind: "isolated-owner" } },
    }),
  };

  it("offers only usable, enabled isolated owners and can exclude self", () => {
    expect(devinProfileOwnerCandidates(instances)).toEqual([
      { id: "owner", displayName: "Work login" },
    ]);
    expect(devinProfileOwnerCandidates(instances, "owner")).toEqual([]);
  });

  it("finds dependent profiles of an isolated owner", () => {
    expect(findDevinProfileDependents("owner", instances).map((entry) => entry.id)).toEqual([
      "ref",
    ]);
    expect(findDevinProfileDependents("native", instances)).toEqual([]);
  });

  it("ignores cross-driver instances", () => {
    const mixed: Record<string, AgentInstanceConfig> = {
      claudeOwner: instance({
        id: "claudeOwner",
        driver: "claude",
        config: { configDir: "~/.claude-work" },
      }),
    };
    expect(devinProfileOwnerCandidates(mixed)).toEqual([]);
    expect(findDevinProfileDependents("claudeOwner", mixed)).toEqual([]);
  });
});
