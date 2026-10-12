import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveAgentBinaryPath: vi.fn<() => string | undefined>(() => "/bin/devin"),
  provenIdentity: vi.fn<(...args: unknown[]) => Promise<string>>(async () => "unused"),
}));
vi.mock("../binaryResolver", () => ({ resolveAgentBinaryPath: mocks.resolveAgentBinaryPath }));
vi.mock("./accountIdentity", () => ({
  resolveDevinProvenScopeIdentity: mocks.provenIdentity,
  devinCredentialFingerprint: vi.fn<() => Promise<string>>(async () => "fp-fixed"),
  readDevinContextCredential: async () => undefined,
  resetDevinAccountIdentityCaches: () => {},
  DevinAccountIdentityError: class extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

import { createDevinProfileAdapter } from "./profiles";
import { devinExecutionSettingsFromConfig, resolveDevinExecutionContext } from "./profileContext";
import { devinSessionScopeIdentity } from "./sessionScope";
import type { AgentInstanceConfig, ProjectLocation } from "@/shared/contracts";

/** The stable user id the mocked proof returns. */
const PROVEN_USER = "user-proved";

beforeEach(() => {
  mocks.provenIdentity.mockClear();
  mocks.provenIdentity.mockImplementation(async (context: unknown) => {
    const ctx = context as {
      account: { kind: string; ownerId?: string };
      orgId?: string;
      runtimeTarget: string;
      roots: { dataRoot: string };
      location: ProjectLocation;
    };
    return devinSessionScopeIdentity({
      account: ctx.account as never,
      location: ctx.location,
      orgId: ctx.orgId,
      runtimeTarget: ctx.runtimeTarget as never,
      roots: { dataRoot: ctx.roots.dataRoot },
      accountUserId: PROVEN_USER,
    });
  });
});

const instance = (
  config: unknown,
  overrides: Partial<AgentInstanceConfig> = {},
): AgentInstanceConfig => ({
  id: "work",
  driver: "devin",
  displayName: "Work",
  config,
  ...overrides,
});

describe("createDevinProfileAdapter", () => {
  it("builds an instance-scoped adapter for a same-login profile", async () => {
    const adapter = createDevinProfileAdapter(instance({ orgId: "org-1" }));
    expect(adapter.kind).toBe("devin:work");
    expect(adapter.label).toBe("Devin Work");
    // Terminal presentation never opens ACP, with or without a profile.
    expect(
      await adapter.createStructuredSession?.({
        threadId: "t",
        projectLocation: { kind: "posix", path: "/p" },
        config: { model: "" },
        presentationMode: "terminal",
      }),
    ).toBeUndefined();
  });

  it("routes every launch lane through the profile context", async () => {
    const adapter = createDevinProfileAdapter(
      instance({
        auth: { kind: "owner-reference", ownerId: "owner" },
        configPath: "/roots/devin-work.json",
      }),
      {
        resolveInstance: () => ({
          id: "owner",
          driver: "devin",
          config: { format: 1, auth: { kind: "isolated-owner" } },
        }),
      },
    );
    const launch = await adapter.buildLaunchArgv(
      { kind: "posix", path: "/p" },
      { model: "" },
      "hello",
    );
    expect(launch.args[0]).toBe("--config");
    expect(launch.args[1]).toBe("/roots/devin-work.json");
    // The reference's env redirection is deterministic from the owner id, so
    // no sibling config lookup is required to launch.
    expect(launch.env?.XDG_DATA_HOME).toContain("owner");
    // Resume binding (root seam SessionRef.executionIdentity): the ref must
    // carry THIS profile's account scope. A ref created by this scope hashes
    // account source + data root + org + runtime target.
    const resolution = await resolveDevinExecutionContext(
      devinExecutionSettingsFromConfig("work", "Work", {
        format: 1,
        auth: { kind: "owner-reference", ownerId: "owner" },
        configPath: "/roots/devin-work.json",
      }),
      { kind: "posix", path: "/p" },
      { provision: true },
    );
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    // The binding is the PROVEN identity: scope dimensions plus the stable
    // account user id proved over authenticated native metadata (a credential
    // rotation never changes it; a different login does).
    const identity = devinSessionScopeIdentity({
      account: resolution.context.account,
      location: resolution.context.location,
      orgId: resolution.context.orgId,
      runtimeTarget: resolution.context.runtimeTarget,
      roots: { dataRoot: resolution.context.roots.dataRoot },
      accountUserId: PROVEN_USER,
    });
    expect(identity).toMatch(/^devin-session-scope-3:[0-9a-f]{32}$/);
    const resume = await adapter.buildResumeArgv(
      { kind: "posix", path: "/p" },
      { model: "" },
      "next",
      {
        providerSessionId: "sid",
        discoveredAt: "2026-10-07T00:00:00Z",
        executionIdentity: identity,
      },
    );
    expect(resume.args.slice(0, 2)).toEqual(["--config", "/roots/devin-work.json"]);
    expect(resume.args).toContain("--resume");
    expect(resume.args).toContain("sid");
    // Fail closed BEFORE spawning: profiles never shipped unbound refs, so a
    // ref without a scope binding is refused, never silently attached.
    await expect(
      adapter.buildResumeArgv({ kind: "posix", path: "/p" }, { model: "" }, "next", {
        providerSessionId: "sid",
        discoveredAt: "2026-10-07T00:00:00Z",
      }),
    ).rejects.toThrowError(/resume-scope-missing/);
  });

  it("preserves and disables unknown config formats instead of guessing", () => {
    expect(() => createDevinProfileAdapter(instance({ format: 7 }))).toThrowError(/format 7/);
  });

  it("validates owner references against an enabled isolated Devin owner", () => {
    const owner = instance({ auth: { kind: "isolated-owner" } }, { id: "owner" });
    const context = {
      resolveInstance: (id: string) => (id === "owner" ? owner : undefined),
    };
    // A valid reference resolves.
    expect(() =>
      createDevinProfileAdapter(
        instance({ auth: { kind: "owner-reference", ownerId: "owner" } }),
        context,
      ),
    ).not.toThrow();
    // Missing owner.
    expect(() =>
      createDevinProfileAdapter(
        instance({ auth: { kind: "owner-reference", ownerId: "ghost" } }),
        context,
      ),
    ).toThrowError(/ghost/);
    // Self-reference.
    expect(() =>
      createDevinProfileAdapter(
        instance({ auth: { kind: "owner-reference", ownerId: "work" } }),
        context,
      ),
    ).toThrowError(/itself/);
    // Disabled owner.
    const disabledOwner = instance({}, { id: "owner", enabled: false });
    expect(() =>
      createDevinProfileAdapter(instance({ auth: { kind: "owner-reference", ownerId: "owner" } }), {
        resolveInstance: (id) => (id === "owner" ? disabledOwner : undefined),
      }),
    ).toThrowError(/disabled/);
    // Cross-driver owner.
    expect(() =>
      createDevinProfileAdapter(instance({ auth: { kind: "owner-reference", ownerId: "owner" } }), {
        resolveInstance: (id) =>
          id === "owner" ? instance({}, { id: "owner", driver: "claude" }) : undefined,
      }),
    ).toThrowError(/claude/);
    // Native-default owners cannot be referenced (no isolated account to share).
    expect(() =>
      createDevinProfileAdapter(instance({ auth: { kind: "owner-reference", ownerId: "owner" } }), {
        resolveInstance: (id) =>
          id === "owner"
            ? instance({ auth: { kind: "native-default" } }, { id: "owner" })
            : undefined,
      }),
    ).toThrowError(/isolated-owner/);
    // Reference chains are rejected: an owner-reference owner is not an owner.
    expect(() =>
      createDevinProfileAdapter(instance({ auth: { kind: "owner-reference", ownerId: "owner" } }), {
        resolveInstance: (id) =>
          id === "owner"
            ? instance({ auth: { kind: "owner-reference", ownerId: "up" } }, { id: "owner" })
            : undefined,
      }),
    ).toThrowError(/owner-reference/);
    // An owner with an unusable config cannot serve as an auth source.
    expect(() =>
      createDevinProfileAdapter(instance({ auth: { kind: "owner-reference", ownerId: "owner" } }), {
        resolveInstance: (id) =>
          id === "owner" ? instance({ format: 9 }, { id: "owner" }) : undefined,
      }),
    ).toThrowError(/format 9/);
  });

  it("fails closed on owner references without a factory context", () => {
    // The registry always supplies resolveInstance; direct construction must
    // not silently approve a reference nobody validated.
    expect(() =>
      createDevinProfileAdapter(instance({ auth: { kind: "owner-reference", ownerId: "ghost" } })),
    ).toThrowError(/ghost/);
  });

  it("applies cloud and agent-type choices to the ACP command only", async () => {
    createDevinProfileAdapter(instance({ runtimeTarget: "cloud", agentType: "review" }));
    // ACP args are built inside createStructuredSession; verify through the
    // exported argv builder contract instead of spawning a session here.
    const { buildDevinAcpArgs } = await import("./argv");
    expect(buildDevinAcpArgs({ model: "swe" }, { cloud: true })).toEqual(["acp", "--cloud"]);
    expect(buildDevinAcpArgs({ model: "swe" }, { agentType: "review" })).toEqual([
      "acp",
      "--model",
      "swe",
      "--agent-type",
      "review",
    ]);
  });
});
