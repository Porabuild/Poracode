import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ThreadConfig, ProjectLocation } from "@/shared/contracts";
import type { CreateStructuredSessionInput } from "../base/types";
import { projectQualifiedAllowOtherPresentation } from "./acp/allowOtherPresentation";

const mocks = vi.hoisted(() => ({
  createAcpStructuredSession: vi.fn<(...args: unknown[]) => unknown>(() => ({
    dispose: async () => {},
  })),
  warmDevinModels: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => undefined),
  prepareDevinMcpConfig: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => undefined),
  prepareDevinProfileMcpOverlay: vi.fn<(...args: unknown[]) => Promise<unknown>>(
    async () => undefined,
  ),
  prepareDevinSessionRecordLaunch: vi.fn<(...args: unknown[]) => Promise<unknown>>(
    async () => undefined,
  ),
  provenIdentity: vi.fn<(...args: unknown[]) => Promise<string>>(async () => "unused"),
  volatileScope: vi.fn<(...args: unknown[]) => Promise<string>>(async () => "vol:fixed"),
  defaultScope: vi.fn<
    (...args: unknown[]) => Promise<{ generation: string; volatileGeneration: string }>
  >(async () => ({ generation: "gen-default", volatileGeneration: "vol:default" })),
}));

/** The stable user id the mocked proof always returns. */
const PROVEN_USER = "user-proved";

vi.mock("../acp", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../acp")>()),
  createAcpStructuredSession: mocks.createAcpStructuredSession,
}));
vi.mock("./modelCatalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./modelCatalog")>()),
  warmDevinModels: mocks.warmDevinModels,
}));
vi.mock("./volatileCatalog", () => ({
  resolveDevinVolatileCatalogScope: mocks.volatileScope,
  resolveDevinDefaultCatalogScope: mocks.defaultScope,
}));
vi.mock("./mcpConfig", () => ({
  prepareDevinMcpConfig: mocks.prepareDevinMcpConfig,
}));
vi.mock("./launchContext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./launchContext")>()),
  prepareDevinProfileMcpOverlay: mocks.prepareDevinProfileMcpOverlay,
  prepareDevinProfileLaunch: async () => {},
}));
vi.mock("./sessionFiles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./sessionFiles")>()),
  // The adapter imports the per-launch hook view from sessionFiles; mocking
  // it here keeps terminal-launch tests off the real record directory.
  prepareDevinSessionRecordLaunch: mocks.prepareDevinSessionRecordLaunch,
}));
vi.mock("./accountIdentity", () => ({
  resolveDevinProvenScopeIdentity: mocks.provenIdentity,
  readDevinContextCredential: async () => undefined,
  resetDevinAccountIdentityCaches: () => {},
  // Shape-compatible stand-in so `instanceof` conversions in the adapter and
  // in tests keep working.
  DevinAccountIdentityError: class extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = "DevinAccountIdentityError";
      this.code = code;
    }
  },
}));
vi.mock("../base/processRuntime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../base/processRuntime")>()),
  // WSL command builds need a prepared distro shell; tests never spawn one.
  getCachedWslShellPath: () => "/bin/sh",
  getCachedWslHomeDirectory: () => "/home/u",
}));

const { createDevinAdapter } = await import("./index");
const { DEVIN_ACP_SESSION_ACTION_IDS } = await import("./acp/sessionActions");
const { DEVIN_ACP_CONFIG_ACTION_IDS, DEVIN_ACP_FAST_CONFIG_BINDING } =
  await import("./acp/sessionConfiguration");
const { DEVIN_NATIVE_PERSONAS_ACTION_ID } = await import("./personas/sessionAction");
const { DEVIN_CLOUD_DEFAULT_MODEL_ID, createDevinAcpModelResolver, parseDevinModelCatalog } =
  await import("./models");
const { AcpSessionConfigSync, AcpConfigSelectionError } = await import("../acp/sessionConfigSync");
const { resolveDevinExecutionContext } = await import("./profileContext");
const { devinSessionScopeIdentity } = await import("./sessionScope");
const accountIdentity = await import("./accountIdentity");

const guiInput = (config: Partial<ThreadConfig> & { model: string }) => ({
  threadId: "t1",
  projectLocation: { kind: "posix" as const, path: "/project" },
  config: { ...config } as ThreadConfig,
  presentationMode: "gui" as const,
});

const posixLocation = { kind: "posix" as const, path: "/project" };

/** The PROVEN identity for one profile settings shape (stable user id included). */
const provenIdentityFor = async (
  settings: Parameters<typeof resolveDevinExecutionContext>[0],
): Promise<string> => {
  const resolution = await resolveDevinExecutionContext(settings, posixLocation);
  if (!resolution.ok) throw new Error(resolution.message);
  return devinSessionScopeIdentity({
    account: resolution.context.account,
    location: resolution.context.location,
    orgId: resolution.context.orgId,
    runtimeTarget: resolution.context.runtimeTarget,
    roots: { dataRoot: resolution.context.roots.dataRoot },
    accountUserId: PROVEN_USER,
  });
};

const identityFor = (instanceId: string) =>
  provenIdentityFor({
    instanceId,
    label: `Devin ${instanceId}`,
    auth: { kind: "default" as const },
    runtimeTarget: "local" as const,
    configGeneration: "gen",
  });

const profileAdapter = (
  settings: Partial<{
    instanceId: string;
    runtimeTarget: "local" | "cloud";
    agentType: "review" | "summarizer";
    cloudDefaults: NonNullable<import("./profileConfig").DevinProfileConfig["cloudDefaults"]>;
    auth: { kind: "default" } | { kind: "isolated"; ownerId: string };
  }> = {},
) => {
  const instanceId = settings.instanceId ?? "work";
  return createDevinAdapter({
    kind: `devin:${instanceId}`,
    label: `Devin ${instanceId}`,
    profile: {
      instanceId,
      label: `Devin ${instanceId}`,
      auth: settings.auth ?? { kind: "default" },
      runtimeTarget: settings.runtimeTarget ?? "local",
      configGeneration: "gen",
      ...(settings.agentType ? { agentType: settings.agentType } : {}),
      ...(settings.cloudDefaults !== undefined ? { cloudDefaults: settings.cloudDefaults } : {}),
    },
  });
};

describe("Devin structured-session wiring", () => {
  it("opts only local ACP adapters into the internal workspace directory carrier", () => {
    expect(createDevinAdapter().supportsStructuredWorkspaceDirectories).toBe(true);
    expect(profileAdapter().supportsStructuredWorkspaceDirectories).toBe(true);
    expect(profileAdapter({ runtimeTarget: "cloud" }).supportsStructuredWorkspaceDirectories).toBe(
      false,
    );
  });
  it("refuses host workspace roots on a cloud relay before creating a session", async () => {
    await expect(
      profileAdapter({ runtimeTarget: "cloud" }).createStructuredSession?.({
        ...guiInput({ model: DEVIN_CLOUD_DEFAULT_MODEL_ID }),
        additionalDirectories: [{ kind: "posix", path: "/extra" }],
      }),
    ).rejects.toMatchObject({ code: "cloud-workspace-roots-unsupported" });
    expect(mocks.createAcpStructuredSession).not.toHaveBeenCalled();
  });

  it("does not silently hand an approved-root structured input to the terminal TUI", async () => {
    await expect(
      createDevinAdapter().createStructuredSession?.({
        ...guiInput({ model: "" }),
        presentationMode: "terminal",
        additionalDirectories: [{ kind: "posix", path: "/extra" }],
      }),
    ).rejects.toMatchObject({ code: "workspace-roots-chat-only" });
    expect(mocks.createAcpStructuredSession).not.toHaveBeenCalled();
  });

  it("forwards local approved roots unchanged to the standard ACP factory", async () => {
    const additionalDirectories = [{ kind: "posix" as const, path: "/extra" }];
    await createDevinAdapter().createStructuredSession?.({
      ...guiInput({ model: "" }),
      additionalDirectories,
    });
    const input = mocks.createAcpStructuredSession.mock.calls.at(-1)?.[1] as Record<
      string,
      unknown
    >;
    expect(input).toMatchObject({
      additionalDirectories,
      acpElicitationPresentation: projectQualifiedAllowOtherPresentation,
    });
    expect(input).not.toHaveProperty("acpLocalResourceResolution");
  });

  it("passes cloud setup only through the shared factory options and rejects CLI ignore", async () => {
    const adapter = profileAdapter({ runtimeTarget: "cloud", cloudDefaults: { repositories: [] } });
    await adapter.createStructuredSession?.(guiInput({ model: DEVIN_CLOUD_DEFAULT_MODEL_ID }));
    const call = mocks.createAcpStructuredSession.mock.calls.at(-1)!;
    expect(call[1]).not.toHaveProperty("configureOpenedSession");
    expect(call[2]).toMatchObject({
      configureOpenedSession: expect.any(Function),
      allowUnlistedSelectValue: expect.any(Function),
    });
    await expect(
      adapter.buildLaunchArgv(
        posixLocation,
        { model: DEVIN_CLOUD_DEFAULT_MODEL_ID },
        "test",
        undefined,
      ),
    ).rejects.toMatchObject({ code: "cloud-setup-chat-only" });
  });

  it("refuses a local root agent type on a cloud relay before creating a session", async () => {
    await expect(
      profileAdapter({ runtimeTarget: "cloud", agentType: "review" }).createStructuredSession?.(
        guiInput({ model: DEVIN_CLOUD_DEFAULT_MODEL_ID }),
      ),
    ).rejects.toMatchObject({ code: "cloud-root-agent-type-unsupported" });
    expect(mocks.createAcpStructuredSession).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    mocks.createAcpStructuredSession.mockClear();
    mocks.createAcpStructuredSession.mockImplementation(() => ({ dispose: async () => {} }));
    mocks.warmDevinModels.mockReset();
    mocks.warmDevinModels.mockImplementation(async () => undefined);
    mocks.prepareDevinMcpConfig.mockClear();
    mocks.prepareDevinProfileMcpOverlay.mockClear();
    mocks.prepareDevinSessionRecordLaunch.mockClear();
    mocks.prepareDevinSessionRecordLaunch.mockResolvedValue(undefined);
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
    mocks.volatileScope.mockClear();
    mocks.volatileScope.mockImplementation(async () => "vol:fixed");
    mocks.defaultScope.mockClear();
    mocks.defaultScope.mockImplementation(async () => ({
      generation: "gen-default",
      volatileGeneration: "vol:default",
    }));
  });

  it("installs the project-bound diagnostics pull only for local execution with a real host source", async () => {
    const readHostDiagnostics = vi.fn<
      NonNullable<CreateStructuredSessionInput["readHostDiagnostics"]>
    >(async () => ({ documents: [], truncated: false }));
    await createDevinAdapter().createStructuredSession?.({
      ...guiInput({ model: "" }),
      readHostDiagnostics,
    });
    const local = mocks.createAcpStructuredSession.mock
      .calls[0]![1] as CreateStructuredSessionInput;
    expect(local.acpClientCapabilitiesMeta?.["cognition.ai/requestDiagnostics"]).toBe(true);
    const signal = new AbortController().signal;
    await expect(
      local.acpExtensionRequestHandler?.(
        "_cognition.ai/request_diagnostics",
        {},
        { threadId: "fixture", sessionId: "owned", signal },
      ),
    ).resolves.toEqual({ handled: true, result: { items: [], truncated: false } });
    expect(readHostDiagnostics).toHaveBeenCalledExactlyOnceWith(signal);
    await profileAdapter({ runtimeTarget: "cloud" }).createStructuredSession?.({
      ...guiInput({ model: "" }),
      readHostDiagnostics,
    });
    const cloud = mocks.createAcpStructuredSession.mock
      .calls[1]![1] as CreateStructuredSessionInput;
    expect(cloud.acpClientCapabilitiesMeta?.["cognition.ai/requestDiagnostics"]).toBeUndefined();
    expect(cloud.acpExtensionRequestHandler).toBeUndefined();
  });

  it("composes vendor session actions plus the Poracode-side persona catalog and strict selection", async () => {
    await createDevinAdapter().createStructuredSession?.(guiInput({ model: "" }));
    const [command, input, overrides] = mocks.createAcpStructuredSession.mock.calls[0]!;
    expect(command).toBeDefined();
    const wiredInput = input as Record<string, unknown>;
    // The factory form composes the four confirmed vendor RPCs (addressed by
    // neutral id, live extMethod transport injected by the shared session),
    // the live config pair (when the transport carries both members), and
    // the Poracode-side `native-personas.list` scan for this readable
    // location.
    expect(typeof wiredInput.acpSessionActions).toBe("function");
    const actions = (wiredInput.acpSessionActions as (t: unknown) => Array<{ id: string }>)({
      request: async () => ({}),
      getConfigOptions: () => [],
      setConfigOption: async () => {},
    });
    // The vendor descriptor set may grow (root-owned); the Poracode-side
    // persona scan always composes LAST, after every vendor RPC and the
    // live config pair.
    expect(actions.map((action) => action.id)).toEqual(
      expect.arrayContaining([
        DEVIN_ACP_SESSION_ACTION_IDS.rename,
        DEVIN_ACP_SESSION_ACTION_IDS.revise,
        DEVIN_ACP_SESSION_ACTION_IDS.rules,
        DEVIN_ACP_SESSION_ACTION_IDS.hooks,
        DEVIN_ACP_CONFIG_ACTION_IDS.list,
        DEVIN_ACP_CONFIG_ACTION_IDS.set,
      ]),
    );
    // Cloud-only archive is never exposed on the LOCAL surface, where the
    // build answers _cognition.ai/session/archive with -32601.
    expect(actions.map((action) => action.id)).not.toContain(DEVIN_ACP_SESSION_ACTION_IDS.archive);
    expect(actions.at(-1)?.id).toBe(DEVIN_NATIVE_PERSONAS_ACTION_ID);
    expect(wiredInput.acpClientCapabilitiesMeta).toEqual({
      "cognition.ai/subagentSupport": true,
      "cognition.ai/partialContent": true,
      "cognition.ai/messageGrouping": true,
      "cognition.ai/groupedSessionConfigOptions": true,
    });
    const wiredOverrides = overrides as Record<string, any>;
    expect(wiredOverrides.behavior).toEqual({
      strictConfigSelection: true,
      promptUsageCounterKind: "per-call",
      promptUsageReportsContext: false,
      // Live local receipt: config writes are confirmed mid-prompt.
      allowConfigWritesDuringPrompt: true,
      // Local binds the native `speed` select onto the shared ThreadConfig
      // fast toggle: exact native id + exact advertised value pair, never
      // rewritten (DEVIN_ACP_FAST_CONFIG_BINDING, checkpoint-l capture).
      fastConfigBinding: {
        configId: "speed",
        disabled: "standard",
        enabled: "fast",
      },
      // Local declares the catalog-membership proof: a variant whose
      // identity encodes the level survives the strict target validation
      // without an independent reasoning select. Its membership semantics
      // are proven over the real catalog in compositeModelControls.test.ts.
      modelCarriesEffort: expect.any(Function),
    });
    expect(wiredOverrides.behavior.fastConfigBinding).toEqual(DEVIN_ACP_FAST_CONFIG_BINDING);
    // The negotiated five-choice baseline resolves through sessionModes.
    expect(wiredOverrides.resolveMode({ model: "", approvalPolicy: "ask" }, ["ask"])).toBe("ask");
    // The throwing resolver is wired (strict pair); the legacy undefined
    // resolver would silently downgrade an explicit selection.
    expect(wiredOverrides.resolveModelConfig({ model: "" }, {})).toBeUndefined();
    // Local wires NO normalizer: the native `speed` select keeps its native
    // category and is consumed through the behavior binding above — no
    // category or value rewrite happens at this boundary.
    expect(wiredInput.acpConfigOptionsNormalizer).toBeUndefined();
  });

  it("omits the live config pair when the transport predates the seam", async () => {
    await createDevinAdapter().createStructuredSession?.(guiInput({ model: "" }));
    const [, input] = mocks.createAcpStructuredSession.mock.calls[0]!;
    const actions = (input as Record<string, unknown>).acpSessionActions as (
      t: unknown,
    ) => Array<{ id: string }>;
    const actionsWithoutLiveConfig = actions({ request: async () => ({}) });
    expect(actionsWithoutLiveConfig.map((action) => action.id)).not.toContain(
      DEVIN_ACP_CONFIG_ACTION_IDS.list,
    );
    expect(actionsWithoutLiveConfig.map((action) => action.id)).not.toContain(
      DEVIN_ACP_CONFIG_ACTION_IDS.set,
    );
    // The rest of the surface is unaffected.
    expect(actionsWithoutLiveConfig.at(-1)?.id).toBe(DEVIN_NATIVE_PERSONAS_ACTION_ID);
  });

  it("wires the cloud-only normalizer so devin_version folds into the thread model", async () => {
    await profileAdapter({
      instanceId: "cloudy",
      runtimeTarget: "cloud",
    }).createStructuredSession?.(guiInput({ model: "" }));
    const [, input] = mocks.createAcpStructuredSession.mock.calls[0]!;
    const normalize = (input as Record<string, unknown>).acpConfigOptionsNormalizer as (
      options: readonly unknown[],
    ) => readonly unknown[];
    expect(typeof normalize).toBe("function");
    const normalized = normalize([
      { id: "org_id", type: "select", category: null, currentValue: "org-1", options: [] },
      {
        id: "devin_version",
        type: "select",
        category: null,
        currentValue: "devin-2-5",
        options: [{ value: "devin-2-5", name: "Devin 2.5" }],
      },
    ]);
    // Semantic category only — the native id, current value and options are
    // preserved verbatim so setter parity and rendering are unaffected.
    expect(normalized[0]).toEqual({
      id: "org_id",
      type: "select",
      category: null,
      currentValue: "org-1",
      options: [],
    });
    expect(normalized[1]).toMatchObject({
      id: "devin_version",
      category: "model",
      currentValue: "devin-2-5",
    });
    // Cloud does NOT qualify mid-prompt config writes, and declares NO fast
    // binding: the Fast model tier (`devin-fast-opus`) stays the sole cloud
    // model choice — no new cloud toggle.
    const [, , overrides] = mocks.createAcpStructuredSession.mock.calls[0]!;
    expect((overrides as Record<string, any>).behavior).toEqual({
      strictConfigSelection: true,
    });
    expect((overrides as Record<string, any>).behavior.fastConfigBinding).toBeUndefined();
  });

  it("warms the local catalog under the fully volatile-scoped key material", async () => {
    // Every warm/load lane keys the catalog by the effective context's static
    // generation PLUS the memory-only volatile scope (credential + effective
    // config + org) — never by a location-only or generation-only key that
    // another account/policy state could share.
    await createDevinAdapter().createStructuredSession?.(guiInput({ model: "swe" }));
    expect(mocks.warmDevinModels).toHaveBeenCalledTimes(1);
    const scope = mocks.warmDevinModels.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(scope).toMatchObject({
      location: { kind: "posix", path: "/project" },
      generation: expect.stringContaining("|default|"),
      volatileGeneration: "vol:fixed",
    });
    expect(mocks.volatileScope).toHaveBeenCalledTimes(1);
    // The catalog subprocess receives the profile's own env and --config
    // prefix (spawn-lane parity), unchanged.
    expect(mocks.warmDevinModels.mock.calls[0]?.[4]).toBeUndefined();
  });

  it("degrades a volatile-scope failure to no catalog instead of a missing-dimension key", async () => {
    // A scope resolution failure must skip the cache entirely: an entry read
    // or written under a key without the volatile dimension could belong to
    // a different credential/org/policy state.
    mocks.volatileScope.mockRejectedValueOnce(new Error("config unreadable"));
    await createDevinAdapter().createStructuredSession?.(guiInput({ model: "swe" }));
    expect(mocks.warmDevinModels).not.toHaveBeenCalled();
    // The session still opens — the catalog is enrichment, and the negotiated
    // ACP menu is the launch authority.
    expect(mocks.createAcpStructuredSession).toHaveBeenCalledTimes(1);
  });

  it("omits the persona catalog action for WSL locations (no distro-side reader)", async () => {
    await createDevinAdapter().createStructuredSession?.({
      ...guiInput({ model: "" }),
      projectLocation: {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/home/u/proj",
        uncPath: "\\\\wsl$\\Ubuntu\\home\\u\\proj",
      },
    });
    const [, input] = mocks.createAcpStructuredSession.mock.calls[0]!;
    const actions = (
      (input as Record<string, unknown>).acpSessionActions as (t: unknown) => Array<{ id: string }>
    )({ request: async () => ({}) });
    expect(actions.map((action) => action.id)).not.toContain(DEVIN_NATIVE_PERSONAS_ACTION_ID);
  });

  it("defers a saved composite effort to post-open validation and still rejects uncarryable controls", async () => {
    // Parsed catalog shape (as `warmDevinModels` returns it): a Fusion family
    // whose every variant is a composite pair.
    const compositeOnly = [
      {
        id: "fusion-left-right",
        label: "Fusion",
        variants: [
          {
            id: "fusion-left-right",
            label: "Left + Right",
            composite: "Left + Right",
            effort: "",
            thinking: false,
            fast: false,
            context: "default" as const,
            cost: "$1/$2",
          },
        ],
      },
    ];
    mocks.warmDevinModels.mockImplementation(async () => compositeOnly);
    // The composite family's id is its first pair's wire uid. A saved
    // non-empty effort — the level a native thought-level write ECHOED into
    // the persisted config (live checkpoint L) — no longer rejects the open
    // pre-negotiation: the launch keeps the exact pair id, the effort stays
    // in the config, and the strict post-open negotiation owns the carrier
    // check while the shared sync validates the ladder membership.
    const session = await createDevinAdapter().createStructuredSession?.(
      guiInput({ model: "fusion-left-right", effort: "max" }),
    );
    expect(session).toBeDefined();
    const [command, wiredInput] = mocks.createAcpStructuredSession.mock.calls[0]!;
    expect(JSON.stringify(command)).toContain("fusion-left-right");
    // The requested effort is never silently removed from the config.
    expect((wiredInput as CreateStructuredSessionInput).config.effort).toBe("max");
    mocks.createAcpStructuredSession.mockClear();
    await createDevinAdapter().createStructuredSession?.(
      guiInput({ model: "fusion-left-right", effort: "max", fast: true }),
    );
    const [fastCommand, fastInput] = mocks.createAcpStructuredSession.mock.calls[0]!;
    expect(JSON.stringify(fastCommand)).toContain("fusion-left-right");
    expect((fastInput as CreateStructuredSessionInput).config.fast).toBe(true);
    // Controls the pair cannot carry still fail the open visibly, before any
    // process starts.
    for (const config of [
      { model: "fusion-left-right", thinking: true },
      { model: "fusion-left-right", contextSize: "1m" },
    ]) {
      mocks.createAcpStructuredSession.mockClear();
      await expect(
        createDevinAdapter().createStructuredSession?.(guiInput(config)),
      ).rejects.toThrowError(/Unsupported model configuration/);
      expect(mocks.createAcpStructuredSession).not.toHaveBeenCalled();
    }
  });

  it("keeps the raw id when the catalog is unavailable and mapping was needed", async () => {
    mocks.warmDevinModels.mockImplementation(async () => {
      throw new Error("catalog down");
    });
    const session = await createDevinAdapter().createStructuredSession?.(
      guiInput({ model: "swe-2-max", effort: "max" }),
    );
    expect(session).toBeDefined();
    const [command] = mocks.createAcpStructuredSession.mock.calls[0]!;
    expect(JSON.stringify(command)).toContain("swe-2-max");
  });

  it("refuses a profile resume with a missing scope binding before any process starts", async () => {
    await expect(
      profileAdapter().createStructuredSession?.({
        ...guiInput({ model: "" }),
        sessionRef: { providerSessionId: "sid", discoveredAt: "2026-10-07T00:00:00Z" },
      }),
    ).rejects.toThrowError(/resume-scope-missing/);
    // No spawn, no session open: the refusal precedes the ACP factory.
    expect(mocks.createAcpStructuredSession).not.toHaveBeenCalled();
  });

  it("refuses a profile resume bound to a different account scope without recovery", async () => {
    await expect(
      profileAdapter().createStructuredSession?.({
        ...guiInput({ model: "" }),
        sessionRef: {
          providerSessionId: "sid",
          discoveredAt: "2026-10-07T00:00:00Z",
          executionIdentity: "devin-session-scope-2:" + "0".repeat(32),
        },
      }),
    ).rejects.toThrowError(/resume-scope-mismatch/);
    expect(mocks.createAcpStructuredSession).not.toHaveBeenCalled();
  });

  it("fails a profile session visibly when the account identity cannot be proved", async () => {
    // A cold failed identity proof (service unreachable, credential rejected,
    // response unusable) is a localized launch failure — never a skipped
    // verification that would resume without comparison.
    mocks.provenIdentity.mockRejectedValueOnce(
      new accountIdentity.DevinAccountIdentityError("auth-unreachable", "service down"),
    );
    const failure = await profileAdapter()
      .createStructuredSession?.(guiInput({ model: "" }))
      .then(
        () => undefined,
        (error: Error) => error,
      );
    expect(failure).toBeDefined();
    expect(failure!.message).toContain("cannot launch with its current login");
    expect(failure).toMatchObject({ code: "account-identity-auth-unreachable" });
    expect(mocks.createAcpStructuredSession).not.toHaveBeenCalled();
  });

  it("stamps the immutable scope identity on the getter and every listener ref", async () => {
    const identity = await identityFor("work");
    let capturedListener: { onUpdate?: (update: unknown) => void } | undefined;
    mocks.createAcpStructuredSession.mockImplementation(() => ({
      dispose: async () => {},
      getSessionRef: () => ({
        providerSessionId: "native-1",
        discoveredAt: "2026-10-07T00:00:00Z",
      }),
      setListener: (listener: { onUpdate?: (update: unknown) => void }) => {
        capturedListener = listener;
      },
    }));
    const session = await profileAdapter().createStructuredSession?.({
      ...guiInput({ model: "" }),
      sessionRef: {
        providerSessionId: "sid",
        discoveredAt: "2026-10-07T00:00:00Z",
        executionIdentity: identity,
      },
    });
    expect(session).toBeDefined();
    // The shared getter (spawn pipeline + subattempt runner) sees the binding.
    expect(session!.getSessionRef!()).toMatchObject({
      providerSessionId: "native-1",
      executionIdentity: identity,
    });
    // Listener updates (the persisted ref path) are stamped identically.
    const received: Array<{ sessionRef?: { executionIdentity?: string } }> = [];
    session!.setListener({
      onUpdate: (update) => received.push(update as never),
      onClose: vi.fn<() => void>(),
      onError: vi.fn<() => void>(),
    });
    capturedListener!.onUpdate!({
      status: "idle",
      sessionRef: { providerSessionId: "native-1", discoveredAt: "2026-10-07T00:00:00Z" },
    });
    expect(received[0]?.sessionRef).toMatchObject({ executionIdentity: identity });
    // Updates without a ref pass through untouched.
    capturedListener!.onUpdate!({ status: "working" });
    expect(received[1]).toEqual({ status: "working" });
  });

  it("requires proved ownership for historical default-account resumes", async () => {
    const adapter = createDevinAdapter();
    await expect(
      adapter.createStructuredSession?.({
        ...guiInput({ model: "" }),
        sessionRef: { providerSessionId: "sid", discoveredAt: "2026-10-07T00:00:00Z" },
      }),
    ).rejects.toThrowError(/resume-scope-missing/);
    expect(mocks.createAcpStructuredSession).not.toHaveBeenCalled();
    // Prior draft identities do not establish ownership under current inputs.
    await expect(
      adapter.createStructuredSession?.({
        ...guiInput({ model: "" }),
        sessionRef: {
          providerSessionId: "sid",
          discoveredAt: "2026-10-07T00:00:00Z",
          executionIdentity: "devin-session-scope-2:" + "1".repeat(32),
        },
      }),
    ).rejects.toThrowError(/resume-scope-mismatch/);
  });
  it("stamps default-account GUI refs and rejects a different proved account before spawn", async () => {
    const nativeRef = { providerSessionId: "default-native", discoveredAt: "2026-10-07T00:00:00Z" };
    mocks.createAcpStructuredSession.mockReturnValue({
      dispose: async () => {},
      getSessionRef: () => nativeRef,
    });
    const adapter = createDevinAdapter();
    const session = await adapter.createStructuredSession?.(guiInput({ model: "" }));
    const ref = session?.getSessionRef?.();
    expect(ref).toMatchObject({
      ...nativeRef,
      executionIdentity: expect.stringMatching(/^devin-session-scope-3:/),
    });
    expect(mocks.provenIdentity).toHaveBeenCalled();
    mocks.createAcpStructuredSession.mockClear();
    mocks.provenIdentity.mockResolvedValueOnce("different-proved-account");
    await expect(
      adapter.createStructuredSession?.({ ...guiInput({ model: "" }), sessionRef: ref! }),
    ).rejects.toThrowError(/resume-scope-mismatch/);
    expect(mocks.createAcpStructuredSession).not.toHaveBeenCalled();
  });

  it("builds a cloud session without local model/catalog mapping, host capabilities or stdio relays", async () => {
    await profileAdapter({
      instanceId: "cloudy",
      runtimeTarget: "cloud",
    }).createStructuredSession?.({
      ...guiInput({ model: "swe-2-max", effort: "max" }),
      mcpServers: [
        {
          id: "local",
          name: "local",
          timeoutMs: 30_000,
          transport: { type: "stdio", command: "uvi", args: ["x"], env: {} },
        },
        {
          id: "remote",
          name: "remote",
          timeoutMs: 30_000,
          transport: { type: "http", url: "https://mcp.example.com", headers: {} },
        },
        // A filtered remote server is OMITTED, not forwarded unfiltered: no
        // qualified cloud-side substitute for the stdio tool-filter relay
        // exists, so forwarding would silently drop the user's tool policy.
        {
          id: "filtered",
          name: "filtered",
          timeoutMs: 30_000,
          disabledTools: ["danger"],
          transport: { type: "http", url: "https://filtered.example.com", headers: {} },
        },
      ],
    } as never);
    const [command, input] = mocks.createAcpStructuredSession.mock.calls[0]!;
    expect(JSON.stringify(command)).toContain("--cloud");
    // `--cloud` documents model/agent-type as ignored: neither the model flag
    // nor a local catalog lookup is fed to the cloud relay.
    expect(JSON.stringify(command)).not.toContain("--model");
    expect(mocks.warmDevinModels).not.toHaveBeenCalled();
    // The cloud agent executes outside the host: client-hosted text IO and
    // terminal operations are refused at the method level, not advertised.
    expect((input as Record<string, unknown>).acpFsTextCapability).toBe(false);
    expect((input as Record<string, unknown>).acpTerminalCapability).toBe(false);
    expect((input as Record<string, unknown>).acpLocalResourceResolution).toBe(false);
    expect((input as Record<string, unknown>).acpElicitationPresentation).toBe(
      projectQualifiedAllowOtherPresentation,
    );
    // No local filter relays or config paths reach the server: stdio entries
    // (including Poracode's tool-filter proxies) are dropped, remote http/sse
    // negotiates through standard session/new, and FILTERED servers are
    // omitted entirely rather than shipped with their policy unenforced.
    const servers = (input as Record<string, unknown>).mcpServers as Array<{
      name: string;
      transport: { type: string };
    }>;
    expect(servers.map((server) => server.name)).toEqual(["remote"]);
    // A cloud relay cannot see a host config path: neither the profile overlay
    // nor the shared supervisor-root overlay is faked onto it.
    expect(mocks.prepareDevinProfileMcpOverlay).not.toHaveBeenCalled();
    expect(mocks.prepareDevinMcpConfig).not.toHaveBeenCalled();
    // Cloud-only archive IS composed on the cloud target.
    const cloudActions = (
      (input as Record<string, unknown>).acpSessionActions as (t: unknown) => Array<{ id: string }>
    )({ request: async () => ({}) });
    expect(cloudActions.map((action) => action.id)).toContain(DEVIN_ACP_SESSION_ACTION_IDS.archive);
  });

  it("resolves the cloud native-default intent to the live devin_version on the wired resolver", async () => {
    await profileAdapter({
      instanceId: "cloudy",
      runtimeTarget: "cloud",
    }).createStructuredSession?.(guiInput({ model: DEVIN_CLOUD_DEFAULT_MODEL_ID }));
    const [, , overrides] = mocks.createAcpStructuredSession.mock.calls[0]!;
    const wired = overrides as {
      resolveModelConfig: (config: unknown, options: unknown) => unknown;
    };
    const cloudOptions = [
      {
        id: "devin_version",
        type: "select",
        currentValue: "devin-2-5",
        options: [{ value: "devin-2-5" }, { value: "devin-ultra" }],
      },
    ];
    // The sentinel is an INTENT: it resolves to the option's own live
    // current value — never an invented id passed as the native model.
    expect(wired.resolveModelConfig({ model: DEVIN_CLOUD_DEFAULT_MODEL_ID }, cloudOptions)).toEqual(
      { configId: "devin_version", value: "devin-2-5", currentValue: "devin-2-5" },
    );
    // An explicit id is pushed only when the live menu advertises it.
    expect(wired.resolveModelConfig({ model: "devin-ultra" }, cloudOptions)).toEqual({
      configId: "devin_version",
      value: "devin-ultra",
      currentValue: "devin-2-5",
    });
    expect(() => wired.resolveModelConfig({ model: "swe-1-7-medium" }, cloudOptions)).toThrowError(
      /does not offer the selected model/,
    );
    // The local CLI catalog is never the cloud authority.
    expect(() =>
      wired.resolveModelConfig({ model: DEVIN_CLOUD_DEFAULT_MODEL_ID }, [
        { id: "model", type: "select", category: "model", currentValue: "x", options: [] },
      ]),
    ).not.toThrow();
  });

  it("declares cloud profiles unsupported for one-shot utilities", async () => {
    // buildOneShotCommand returns undefined → the shared generator raises a
    // visible "does not support one-shot generation" error, and runOneShot
    // fails typed — a local spawn would silently use the default account.
    await expect(
      profileAdapter({ instanceId: "cloudy", runtimeTarget: "cloud" }).buildOneShotCommand?.(
        "swe",
        undefined,
        "title",
        posixLocation,
        undefined,
      ),
    ).resolves.toBeUndefined();
  });
});

describe("Devin terminal launch parity", () => {
  beforeEach(() => {
    mocks.prepareDevinSessionRecordLaunch.mockClear();
    mocks.prepareDevinSessionRecordLaunch.mockResolvedValue(undefined);
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
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("passes --cloud for a cloud-runtime terminal launch instead of silently running local", async () => {
    const argv = await profileAdapter({
      instanceId: "cloudy",
      runtimeTarget: "cloud",
    }).buildLaunchArgv(posixLocation, { model: "swe" } as ThreadConfig, "ship it", undefined);
    expect(argv.args).toEqual([
      "--cloud",
      "--respect-workspace-trust",
      "false",
      "--permission-mode",
      "smart",
      "--model",
      "swe",
      "--",
      "ship it",
    ]);
    // No local per-launch hook view and no local-db reservation: a cloud
    // session is neither written to nor discoverable from the local account
    // root, and a reservation would only mark concurrent local launches
    // ambiguous (foreign discovery).
    expect(mocks.prepareDevinSessionRecordLaunch).not.toHaveBeenCalled();
    expect(argv.cleanup).toBeUndefined();
  });

  it("passes --cloud on terminal resume for a cloud runtime", async () => {
    const argv = await profileAdapter({
      instanceId: "cloudy",
      runtimeTarget: "cloud",
    }).buildResumeArgv(posixLocation, { model: "" } as ThreadConfig, "next", {
      providerSessionId: "sid",
      discoveredAt: "2026-10-07T00:00:00Z",
      // A profile resume carries the proven scope binding (checked first).
      executionIdentity: await provenIdentityFor({
        instanceId: "cloudy",
        label: "Devin cloudy",
        auth: { kind: "default" as const },
        runtimeTarget: "cloud" as const,
        configGeneration: "gen",
      }),
    });
    expect(argv.args).toEqual([
      "--cloud",
      "--respect-workspace-trust",
      "false",
      "--permission-mode",
      "smart",
      "--resume",
      "sid",
      "--",
      "next",
    ]);
  });

  it("refuses cloud Terminal resume without an exact session instead of selecting latest", async () => {
    const adapter = profileAdapter({ instanceId: "cloudy", runtimeTarget: "cloud" });
    await expect(
      adapter.buildResumeArgv(posixLocation, { model: "" } as ThreadConfig, "next", {
        providerSessionId: "",
        discoveredAt: "2026-10-07T00:00:00Z",
        executionIdentity: await provenIdentityFor({
          instanceId: "cloudy",
          label: "Devin cloudy",
          auth: { kind: "default" as const },
          runtimeTarget: "cloud" as const,
          configGeneration: "gen",
        }),
      }),
    ).rejects.toMatchObject({ code: "resume-session-missing" });
    expect(adapter.capabilities.supportsResume).toBe(false);
    expect(adapter.capabilities.presentationCapabilities?.gui?.supportsResume).toBe(true);
  });

  it("refuses a Terminal launch for a root agent-type profile (acp-only flag)", async () => {
    // `--agent-type` exists only on `devin acp`; silently ignoring it would
    // run a review/summarizer profile as the default agent.
    await expect(
      profileAdapter({ agentType: "review" }).buildLaunchArgv(
        posixLocation,
        { model: "" } as ThreadConfig,
        "go",
        undefined,
      ),
    ).rejects.toMatchObject({ code: "agent-type-terminal-unsupported" });
    await expect(
      profileAdapter({ agentType: "summarizer" }).buildResumeArgv(
        posixLocation,
        { model: "" } as ThreadConfig,
        "go",
        { providerSessionId: "sid", discoveredAt: "2026-10-07T00:00:00Z" },
      ),
    ).rejects.toMatchObject({ code: "agent-type-terminal-unsupported" });
  });

  it("still sends the root agent type to the ACP session for GUI presentation", async () => {
    await profileAdapter({ agentType: "review" }).createStructuredSession?.(
      guiInput({ model: "" }),
    );
    const [command] = mocks.createAcpStructuredSession.mock.calls[0]!;
    expect(JSON.stringify(command)).toContain("--agent-type");
    expect(JSON.stringify(command)).toContain("review");
  });

  it("requires a proved account identity before a Terminal launch", async () => {
    mocks.provenIdentity.mockRejectedValueOnce(
      new accountIdentity.DevinAccountIdentityError("auth-missing", "no credential"),
    );
    await expect(
      profileAdapter().buildLaunchArgv(
        posixLocation,
        { model: "" } as ThreadConfig,
        "go",
        undefined,
      ),
    ).rejects.toMatchObject({ code: "account-identity-auth-missing" });
  });

  it("launches a raw id with no unresolved controls through the rewrite when the catalog fails (plan Q35)", async () => {
    // Every spawn (launch, resume, recovery) rewrites --model through the
    // catalog. A failing catalog subprocess must not blanket-abort a stored
    // selection that is fully concrete without any control: the raw id
    // launches verbatim.
    mocks.warmDevinModels.mockClear();
    mocks.warmDevinModels.mockRejectedValueOnce(new Error("catalog subprocess failed"));
    const argv = await profileAdapter().rewriteLaunchArgsForConfig?.(
      [
        "--respect-workspace-trust",
        "false",
        "--permission-mode",
        "smart",
        "--model",
        "swe-1-6-fast",
        "--",
        "go",
      ],
      { model: "swe-1-6-fast" } as ThreadConfig,
      posixLocation,
    );
    expect(argv).toContain("swe-1-6-fast");
    expect(mocks.warmDevinModels).toHaveBeenCalledTimes(1);
  });

  it("fails the rewrite visibly for a stored pair id with unresolved OFF seeds on a failed catalog (plan Q35 correction)", async () => {
    // The composer's OFF/default seeds are real pins on regular families, and
    // a restored composite pick carries no binding provenance: cold, the
    // opaque UID cannot prove the seeds are inert. The rewrite must fail
    // typed instead of launching a possibly-different selection.
    mocks.warmDevinModels.mockClear();
    mocks.warmDevinModels.mockRejectedValueOnce(new Error("catalog subprocess failed"));
    await expect(
      profileAdapter().rewriteLaunchArgsForConfig?.(
        [
          "--respect-workspace-trust",
          "false",
          "--permission-mode",
          "smart",
          "--model",
          "fusion-pair-uid",
          "--",
          "go",
        ],
        {
          model: "fusion-pair-uid",
          effort: "",
          fast: false,
          thinking: false,
          contextSize: "default",
        } as ThreadConfig,
        posixLocation,
      ),
    ).rejects.toMatchObject({ name: "DevinCatalogUnavailableError", lane: "launch" });
    expect(mocks.warmDevinModels).toHaveBeenCalledTimes(1);
  });

  it("still fails the config rewrite visibly for an explicit control on a failed catalog", async () => {
    mocks.warmDevinModels.mockRejectedValueOnce(new Error("catalog subprocess failed"));
    await expect(
      profileAdapter().rewriteLaunchArgsForConfig?.(
        [
          "--respect-workspace-trust",
          "false",
          "--permission-mode",
          "smart",
          "--model",
          "swe",
          "--",
          "go",
        ],
        { model: "swe", effort: "high" } as ThreadConfig,
        posixLocation,
      ),
    ).rejects.toMatchObject({ name: "DevinCatalogUnavailableError" });
  });
});

describe("Devin discovery root guard", () => {
  const dataBase = async () => {
    const base = await mkdtemp(join(tmpdir(), "poracode-devin-disco-"));
    process.env.XDG_DATA_HOME = base;
    return base;
  };

  it("attributes a discovered terminal ref only through a still-valid account root", async () => {
    const base = await dataBase();
    try {
      const recordDir = await mkdtemp(join(tmpdir(), "poracode-devin-disco-rec-"));
      const recordPath = join(recordDir, "session-a.json");
      mocks.prepareDevinSessionRecordLaunch.mockResolvedValue({
        recordPath,
        prefixArgs: ["--config", join(base, "unused.json")],
        cleanup: async () => {},
      });
      const adapter = profileAdapter({ auth: { kind: "isolated", ownerId: "work" } });
      // The launch provisions the isolated root; discovery reuses the cached
      // context against the SAME scoped snapshot.
      const argv = (await adapter.buildLaunchArgv(
        posixLocation,
        { model: "" } as ThreadConfig,
        "go",
        undefined,
      )) as { cleanup?: () => Promise<void> };
      await expect(adapter.discoverSessionRef?.(posixLocation)).resolves.toBeUndefined();
      // The record appears afterwards (the hook fired late): the NEXT
      // discovery attributes it through the cached context.
      await writeFile(recordPath, JSON.stringify({ session_id: "late-a" }));
      const ref = (await adapter.discoverSessionRef?.(posixLocation)) as {
        providerSessionId: string;
        executionIdentity?: string;
      };
      expect(ref.providerSessionId).toBe("late-a");
      expect(ref.executionIdentity).toBe(
        await provenIdentityFor({
          instanceId: "work",
          label: "Devin work",
          auth: { kind: "isolated" as const, ownerId: "work" },
          runtimeTarget: "local" as const,
          configGeneration: "gen",
        }),
      );
      await argv.cleanup?.();
      await rm(recordDir, { recursive: true, force: true });
    } finally {
      delete process.env.XDG_DATA_HOME;
      await rm(base, { recursive: true, force: true });
    }
  });

  it("never attributes refs once the cached root's manifest stops validating", async () => {
    const base = await dataBase();
    try {
      const { devinAccountRootsFor } = await import("./accountRoots");
      const recordDir = await mkdtemp(join(tmpdir(), "poracode-devin-disco-rec2-"));
      const recordPath = join(recordDir, "session-b.json");
      mocks.prepareDevinSessionRecordLaunch.mockResolvedValue({
        recordPath,
        prefixArgs: ["--config", join(base, "unused.json")],
        cleanup: async () => {},
      });
      const adapter = profileAdapter({ auth: { kind: "isolated", ownerId: "gone" } });
      const argv = (await adapter.buildLaunchArgv(
        posixLocation,
        { model: "" } as ThreadConfig,
        "go",
        undefined,
      )) as { cleanup?: () => Promise<void> };
      // Warm the discovery context cache while the root is still valid.
      await expect(adapter.discoverSessionRef?.(posixLocation)).resolves.toBeUndefined();
      // The root stops being a Poracode-owned root (future format stamped by
      // something else). The SUCCESS cache must not bypass the guard.
      const roots = devinAccountRootsFor(posixLocation, "gone");
      await writeFile(
        roots.manifestPath,
        JSON.stringify({ format: 99, kind: "devin-account-root", ownerId: "gone" }),
      );
      await writeFile(recordPath, JSON.stringify({ session_id: "late-b" }));
      await expect(adapter.discoverSessionRef?.(posixLocation)).resolves.toBeUndefined();
      await argv.cleanup?.();
      await rm(recordDir, { recursive: true, force: true });
    } finally {
      delete process.env.XDG_DATA_HOME;
      await rm(base, { recursive: true, force: true });
    }
  });
});

describe("Devin composite effort through the shared config sync", () => {
  // SOURCE+LIVE checkpoint L fixture: a local 3000.11.3 session on the exact
  // Fusion pair advertises the mode select, the model select (bounded here to
  // the pair and the previously-selected regular model) and the SEPARATE
  // thought_level select with its FIVE native choices
  // (checkpoint-l-native-pair-controls.json, checkpoint-l-pair-low-native-echo.json).
  const pair = "fusion-gpt-6-astra-high-sidekick-swe-2-high";
  const pairLabel = "Fusion (GPT-6 Astra High Thinking + SWE-2 High)";
  const pairThoughtLadder = ["low", "medium", "high", "xhigh", "max"];
  const pairCatalog = parseDevinModelCatalog(
    JSON.stringify({
      families: [
        {
          family_label: "Fusion",
          slug: "fusion",
          variants: [{ model_uid: pair, label: pairLabel }],
        },
      ],
    }),
  );
  const fixtureOptions = (modelValue: string, thoughtValue: string) => [
    {
      id: "mode",
      type: "select",
      category: "mode",
      name: "Session Mode",
      currentValue: "bypass",
      options: [
        { value: "smart", name: "Smart" },
        { value: "ask", name: "Ask" },
        { value: "plan", name: "Plan" },
        { value: "bypass", name: "Bypass Permissions" },
      ],
    },
    {
      id: "model",
      type: "select",
      category: "model",
      currentValue: modelValue,
      options: [
        { value: "swe-2-high", name: "SWE-2 High" },
        { value: pair, name: pairLabel },
      ],
    },
    {
      id: "thought_level",
      type: "select",
      category: "thought_level",
      name: "Thinking",
      currentValue: thoughtValue,
      options: pairThoughtLadder.map((value) => ({ value })),
    },
  ];
  const echoOptions = (base: unknown[], configId: string, value: string) =>
    (base as Array<Record<string, unknown>>).map((option) =>
      option.id === configId ? { ...option, currentValue: value } : option,
    );
  const buildSync = (initial: unknown[]) => {
    let current = initial;
    const setSessionConfigOption = vi.fn<
      (input: { configId: string; value: string }) => Promise<{ configOptions: unknown[] }>
    >(async ({ configId, value }) => {
      current = echoOptions(current, configId, value);
      return { configOptions: current };
    });
    const sync = new AcpSessionConfigSync(
      { setSessionConfigOption } as never,
      undefined,
      createDevinAcpModelResolver({ families: pairCatalog }),
      { strictConfigSelection: true },
    );
    sync.rememberOptions([], initial);
    return {
      sync,
      options: () => current,
      setSessionConfigOption,
      pushIds: () =>
        setSessionConfigOption.mock.calls.map((call) => (call[0] as { configId: string }).configId),
    };
  };
  const threadConfig = (overrides: Partial<ThreadConfig>) =>
    ({
      model: pair,
      effort: "",
      contextSize: "",
      mode: "agent",
      approvalPolicy: "bypass",
      fast: false,
      thinking: false,
      ...overrides,
    }) as ThreadConfig;

  it("runs first submit, native echo, and the repeat submit without throwing", async () => {
    const { sync, options, setSessionConfigOption } = buildSync(
      fixtureOptions("swe-2-high", "high"),
    );
    // First submit — the composer's all-off config on the exact pair: the
    // model push selects the pair, the inert effort pushes no thought level
    // (checkpoint-l-fusion-selected/turn.json: the prompt succeeded).
    const confirmed = await sync.applyTurnConfig("s1", threadConfig({}), undefined);
    expect(confirmed).toMatchObject({ model: pair, effort: "" });
    expect(
      setSessionConfigOption.mock.calls.map((call) => (call[0] as { configId: string }).configId),
    ).toEqual(["model"]);
    // Native echo (checkpoint-l-fusion-turn.json): the agent reports the pair
    // as current with thought_level "high"; the shared reduction folds that
    // level into the persisted config as the effort.
    sync.rememberOptions([], options());
    const echoed = sync.reduceConfigOptions(threadConfig({}), options());
    expect(echoed).toMatchObject({ model: pair, effort: "high" });
    // The REPEAT submit carries that echoed meaningful effort — the exact
    // shape that failed live with "Unsupported model configuration". It now
    // resolves with no redundant push: the agent already holds both values.
    setSessionConfigOption.mockClear();
    const repeated = await sync.applyTurnConfig("s1", echoed!, echoed!);
    expect(repeated).toMatchObject({ model: pair, effort: "high" });
    expect(setSessionConfigOption).not.toHaveBeenCalled();
  });

  it("pushes a chosen pair level on the thought-level select, after the model", async () => {
    // checkpoint-l-pair-low-native-echo.json: a standard thought_level write
    // of "low" was accepted and echoed on the SAME exact pair id.
    const { sync, setSessionConfigOption } = buildSync(fixtureOptions("swe-2-high", "high"));
    const confirmed = await sync.applyTurnConfig("s1", threadConfig({ effort: "low" }), undefined);
    // The level rides its own select, pushed right after the model.
    expect(setSessionConfigOption.mock.calls.map((call) => call[0])).toEqual([
      { sessionId: "s1", configId: "model", value: pair },
      { sessionId: "s1", configId: "thought_level", value: "low" },
    ]);
    expect(confirmed).toMatchObject({ model: pair, effort: "low" });
  });

  it("rejects a pair effort the advertised thought-level ladder does not carry", async () => {
    // Membership is the shared sync's strict check: the negotiation admits
    // the CARRIER, the ladder refuses the VALUE — the turn fails typed before
    // any prompt instead of silently prompting on a different level.
    const { sync, setSessionConfigOption } = buildSync(fixtureOptions("swe-2-high", "high"));
    const error = await sync
      .applyTurnConfig("s1", threadConfig({ effort: "minimal" }), undefined)
      .then(
        () => undefined,
        (caught: unknown) => caught,
      );
    expect(error).toBeInstanceOf(AcpConfigSelectionError);
    expect((error as Error).cause).toBeInstanceOf(Error);
    expect(((error as Error).cause as Error).message).toMatch(/reasoning level/);
    // Only the model push preceded the typed refusal — no thought-level write
    // was ever attempted with the unsupported value.
    expect(
      setSessionConfigOption.mock.calls.map((call) => (call[0] as { configId: string }).configId),
    ).toEqual(["model"]);
  });
});
