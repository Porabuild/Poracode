import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const paths = vi.hoisted(() => ({ configRoot: "", dataRoot: "" }));
const mocks = vi.hoisted(() => ({
  probeAcpCapabilities: vi.fn<(command: string, args: string[]) => Promise<unknown>>(
    async () => ({}),
  ),
  loadDevinModelsForKey: vi.fn<(...args: unknown[]) => Promise<unknown[]>>(async () => []),
  provenIdentity: vi.fn<(...args: unknown[]) => Promise<string>>(async () => "identity"),
  readCredential: vi.fn<() => Promise<undefined>>(async () => undefined),
  prepareSeed: vi.fn<() => Promise<void>>(async () => {}),
}));
vi.mock("../acp", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../acp")>()),
  probeAcpCapabilities: mocks.probeAcpCapabilities,
}));
vi.mock("./modelCatalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./modelCatalog")>()),
  loadDevinModelsForKey: mocks.loadDevinModelsForKey,
}));
vi.mock("./accountIdentity", () => ({
  resolveDevinProvenScopeIdentity: mocks.provenIdentity,
  readDevinContextCredential: mocks.readCredential,
  resetDevinAccountIdentityCaches: () => {},
  DevinAccountIdentityError: class extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));
vi.mock("./launchContext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./launchContext")>()),
  prepareDevinProfileLaunch: mocks.prepareSeed,
}));
vi.mock("./credentials", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./credentials")>()),
  // The probe's volatile scope reads the native default config; pin it to a
  // temp root so no host state leaks into a test digest.
  devinDefaultConfigRoot: () => paths.configRoot,
  devinDefaultDataRoot: () => paths.dataRoot,
}));

beforeAll(async () => {
  paths.configRoot = await mkdtemp(join(tmpdir(), "devin-probe-config-"));
  paths.dataRoot = await mkdtemp(join(tmpdir(), "devin-probe-data-"));
});
afterAll(async () => {
  await rm(paths.configRoot, { recursive: true, force: true }).catch(() => undefined);
  await rm(paths.dataRoot, { recursive: true, force: true }).catch(() => undefined);
});

import {
  buildDevinAcpArgs,
  buildDevinArgs,
  buildDevinOneShotArgs,
  devinCliPermissionMode,
  resolveDevinAcpMode,
} from "./argv";
import {
  buildDevinProbeCapabilities,
  createDevinDetectionSpec,
  dedupeDevinAuthMethods,
  devinDetectionSpec,
  devinProbeClientCapabilitiesMeta,
} from "./detection";
import { DEVIN_ACP_CLIENT_CAPABILITY_MANIFEST } from "./acp/capabilityManifest";
import { parseDevinCredentials } from "./credentials";
import { DEVIN_CLOUD_DEFAULT_MODEL_ID } from "./models";
import { createDevinAdapter } from "./index";
import { extractSemverFromVersionOutput } from "../base";

describe("Devin provider", () => {
  it.each([
    { kind: "posix" as const, path: "/project" },
    { kind: "windows" as const, path: "C:\\project" },
    {
      kind: "wsl" as const,
      distro: "Ubuntu",
      linuxPath: "/project",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\project",
    },
  ])("refuses ambiguous Terminal resume in $kind instead of selecting latest", async (location) => {
    const adapter = createDevinAdapter();
    await expect(
      adapter.buildResumeArgv(location, { model: "" }, "next", {
        providerSessionId: "",
        discoveredAt: "2026-10-07T00:00:00Z",
      }),
    ).rejects.toMatchObject({ code: "resume-session-missing" });
  });

  it("never starts ACP for terminal presentation", async () => {
    expect(
      await createDevinAdapter().createStructuredSession?.({
        threadId: "terminal-thread",
        projectLocation: { kind: "posix", path: "/project" },
        config: { model: "" },
        presentationMode: "terminal",
      }),
    ).toBeUndefined();
  });
  it("puts model selection after the ACP subcommand", () => {
    expect(buildDevinAcpArgs({ model: "swe", approvalPolicy: "smart" })).toEqual([
      "acp",
      "--model",
      "swe",
    ]);
  });
  it("passes the initial prompt as one positional argument with smart approvals", () => {
    expect(buildDevinArgs({ model: "swe-1-6-fast" }, "--help\n$(echo no)")).toEqual([
      "--respect-workspace-trust",
      "false",
      "--permission-mode",
      "smart",
      "--model",
      "swe-1-6-fast",
      "--",
      "--help\n$(echo no)",
    ]);
  });
  it("resumes an exact opaque session without dropping the prompt", async () => {
    const adapter = createDevinAdapter();
    expect(
      (
        await adapter.buildResumeArgv({ kind: "posix", path: "/project" }, { model: "" }, "next", {
          providerSessionId: "heavy-basin",
          discoveredAt: "2026-09-10T00:00:00Z",
          executionIdentity: "identity",
        })
      ).args,
    ).toEqual([
      "--respect-workspace-trust",
      "false",
      "--permission-mode",
      "smart",
      "--resume",
      "heavy-basin",
      "--",
      "next",
    ]);
  });
  it("refuses a historical default-account ref whose account ownership is unbound", async () => {
    const adapter = createDevinAdapter();
    const legacy = { providerSessionId: "heavy-basin", discoveredAt: "2026-09-10T00:00:00Z" };
    await expect(
      adapter.buildResumeArgv({ kind: "posix", path: "/project" }, { model: "" }, "next", legacy),
    ).rejects.toMatchObject({ code: "resume-scope-missing" });
    await expect(
      adapter.buildLaunchArgv({ kind: "posix", path: "/project" }, { model: "" }, "next", legacy),
    ).rejects.toMatchObject({ code: "resume-scope-missing" });
  });
  it("refuses an obsolete account binding on the native default account", async () => {
    // A prior draft identity cannot prove current account ownership. Refuse
    // before spawning rather than attach an unverified conversation.
    const adapter = createDevinAdapter();
    const bound = {
      providerSessionId: "heavy-basin",
      discoveredAt: "2026-09-10T00:00:00Z",
      executionIdentity: "devin-session-scope-1:" + "a".repeat(32),
    };
    await expect(
      adapter.buildResumeArgv({ kind: "posix", path: "/project" }, { model: "" }, "next", bound),
    ).rejects.toThrowError(/resume-scope-mismatch/);
    await expect(
      adapter.buildLaunchArgv({ kind: "posix", path: "/project" }, { model: "" }, "next", bound),
    ).rejects.toThrowError(/resume-scope-mismatch/);
  });
  it("defers plan prompts and never launches them with bypass", () => {
    const config = { model: "", mode: "plan" as const, approvalPolicy: "bypass" };
    const adapter = createDevinAdapter();
    expect(buildDevinArgs(config, "plan this")).toEqual([
      "--respect-workspace-trust",
      "false",
      "--permission-mode",
      "normal",
    ]);
    expect(adapter.shouldDeferPromptToTerminal?.(config)).toBe(true);
    expect(adapter.buildTerminalPreInputs?.(config)).toEqual([["/plan", "@wait:200", "\r"]]);
  });
  it("keeps one-shots noninteractive and preserves prompts", async () => {
    expect(buildDevinOneShotArgs(undefined, "title")).toEqual([
      "--permission-mode",
      "bypass",
      "--respect-workspace-trust",
      "false",
      "-p",
      "title",
    ]);
    const adapter = createDevinAdapter();
    expect(adapter.capabilities.supportsOneShot).toBe(true);
    expect((await adapter.buildOneShotCommand?.("swe", undefined, "title"))?.stdin).toBe("");
  });
  it("keeps login and logout available if ACP probing fails", () => {
    expect(buildDevinProbeCapabilities(undefined)).toMatchObject({
      authLogoutSupported: true,
      authMethods: [{ type: "terminal" }],
    });
    // Devin session/new succeeds even logged out; this signal is not auth proof.
    expect(buildDevinProbeCapabilities({ authState: "authenticated" })).not.toHaveProperty(
      "authState",
    );
    // The authoritative negative (auth_required) does refine status.
    expect(buildDevinProbeCapabilities({ authState: "missing" }).authState).toBe("missing");
    expect(devinDetectionSpec.update).toMatchObject({
      installer: { posix: { binary: "sh" } },
      homebrewCask: "devin-cli",
    });
  });
  it("retains grouped-menu sections from the probe result, absent for flat probes", () => {
    expect(
      buildDevinProbeCapabilities({
        subProviders: [{ id: "flagship", label: "Flagship" }],
        modelSubProvider: { "swe-2-high": "flagship" },
      }),
    ).toMatchObject({
      subProviders: [{ id: "flagship", label: "Flagship" }],
      modelSubProvider: { "swe-2-high": "flagship" },
    });
    expect(buildDevinProbeCapabilities({})).not.toHaveProperty("subProviders");
    expect(buildDevinProbeCapabilities({})).not.toHaveProperty("modelSubProvider");
  });
  it("dedupes the probe terminal auth method by id, keeping the probe's args", () => {
    const probeMethods = [
      { id: "devin-browser", name: "Log in with browser", type: "agent" as const },
      { id: "devin-terminal-login", name: "Login", type: "terminal" as const, args: ["--login"] },
    ];
    const deduped = dedupeDevinAuthMethods([
      ...probeMethods,
      { id: "devin-terminal-login", name: "Login", type: "terminal" as const },
    ]);
    expect(deduped.filter((method) => method.id === "devin-terminal-login")).toHaveLength(1);
    expect(deduped.find((method) => method.id === "devin-terminal-login")).toMatchObject({
      args: ["--login"],
    });
    // The static fallback survives when the probe advertises nothing.
    expect(
      dedupeDevinAuthMethods([
        { id: "devin-terminal-login", name: "Login", type: "terminal" as const },
      ]),
    ).toHaveLength(1);
    expect(buildDevinProbeCapabilities(undefined).authMethods).toHaveLength(1);
  });
  it("maps GUI modes against the negotiated ACP ids without coercion", () => {
    const available = ["accept-edits", "smart", "ask", "plan", "bypass"];
    expect(resolveDevinAcpMode({ model: "", mode: "plan" }, available)).toBe("plan");
    // Explicit stored policies map onto exactly one negotiated permission
    // level through the CLI alias table (sessionModes is the single owner of
    // this mapping — `ask` included when the session offers it).
    expect(resolveDevinAcpMode({ model: "", approvalPolicy: "bypass" }, available)).toBe("bypass");
    expect(
      resolveDevinAcpMode({ model: "", approvalPolicy: "bypassPermissions" }, ["dangerous"]),
    ).toBe("dangerous");
    expect(resolveDevinAcpMode({ model: "", approvalPolicy: "accept-edits" }, available)).toBe(
      "accept-edits",
    );
    expect(resolveDevinAcpMode({ model: "", approvalPolicy: "ask" }, available)).toBe("ask");
    // Stored CLI aliases resolve to their own permission level (`normal` is an
    // alias of the CLI's `auto`, which is the Smart mode) — never coerced to
    // another level when that one is advertised.
    expect(resolveDevinAcpMode({ model: "", approvalPolicy: "normal" }, available)).toBe("smart");
    // The stored policy's level missing from the session keeps the agent's
    // own mode instead of substituting a different permission level.
    expect(
      resolveDevinAcpMode({ model: "", approvalPolicy: "normal" }, ["accept-edits"]),
    ).toBeUndefined();
    // No stored policy: the legacy GUI Bypass default, then Devin's own Code
    // default, then the agent's own mode.
    expect(resolveDevinAcpMode({ model: "" }, ["bypass"])).toBe("bypass");
    expect(resolveDevinAcpMode({ model: "" }, ["smart"])).toBeUndefined();
    // Plan without a negotiated plan mode is not coerced either.
    expect(resolveDevinAcpMode({ model: "", mode: "plan" }, ["accept-edits"])).toBeUndefined();
  });
  it("keeps stored CLI policies on the accepted alias set", () => {
    expect(devinCliPermissionMode(undefined)).toBe("smart");
    expect(devinCliPermissionMode("bypassPermissions")).toBe("bypass");
    expect(devinCliPermissionMode("accept-edits")).toBe("accept-edits");
    expect(devinCliPermissionMode("unknown-policy")).toBe("smart");
  });
  it("keeps cloud ACP and root agent types on the ACP argv only", () => {
    expect(buildDevinAcpArgs({ model: "swe" }, { cloud: true })).toEqual(["acp", "--cloud"]);
    expect(buildDevinAcpArgs({ model: "swe" }, { agentType: "summarizer" })).toEqual([
      "acp",
      "--model",
      "swe",
      "--agent-type",
      "summarizer",
    ]);
  });
  it("probes the profile's declared agent type on the LOCAL shape and volatile-scopes the catalog", async () => {
    mocks.probeAcpCapabilities.mockClear();
    mocks.loadDevinModelsForKey.mockClear();
    mocks.prepareSeed.mockClear();
    const spec = createDevinDetectionSpec({
      instanceId: "w",
      label: "Devin w",
      auth: { kind: "default" },
      runtimeTarget: "local",
      configGeneration: "gen",
      agentType: "review",
    });
    await spec.capabilitiesProbe?.({
      location: { kind: "posix", path: "/p" },
      executablePath: "/bin/devin",
    });
    // The probe exercises the exact ACP shape the GUI session will get,
    // including the root persona flag (local agents only).
    expect(mocks.probeAcpCapabilities.mock.calls[0]?.[1]).toEqual([
      "acp",
      "--agent-type",
      "review",
    ]);
    // The probed catalog is keyed by the FULL volatile scope (credential +
    // effective config + effective org — a memory-only `vol:` digest), so a
    // token rotation, a same-path policy edit or an org change cannot serve
    // the previous state's catalog.
    expect(String(mocks.loadDevinModelsForKey.mock.calls[0]?.[0])).toMatch(/vol:[0-9a-f]{64}$/);
    // The private config view is seeded BEFORE the catalog subprocess, so the
    // hashed config is exactly the view that command consumes.
    expect(mocks.prepareSeed).toHaveBeenCalled();
    expect(mocks.prepareSeed.mock.invocationCallOrder[0]!).toBeLessThan(
      mocks.loadDevinModelsForKey.mock.invocationCallOrder[0]!,
    );
    // Cloud probes carry --cloud, drop the ignored agent type, and never run
    // the local catalog subprocess.
    mocks.probeAcpCapabilities.mockClear();
    mocks.loadDevinModelsForKey.mockClear();
    mocks.readCredential.mockClear();
    const cloudSpec = createDevinDetectionSpec({
      instanceId: "c",
      label: "Devin c",
      auth: { kind: "default" },
      runtimeTarget: "cloud",
      configGeneration: "gen",
      agentType: "review",
    });
    await cloudSpec.capabilitiesProbe?.({
      location: { kind: "posix", path: "/p" },
      executablePath: "/bin/devin",
    });
    expect(mocks.probeAcpCapabilities.mock.calls[0]?.[1]).toEqual(["acp", "--cloud"]);
    expect(mocks.loadDevinModelsForKey).not.toHaveBeenCalled();
    expect(mocks.readCredential).not.toHaveBeenCalled();
  });

  it("skips the catalog subprocess when the policy seed fails instead of hashing a stale view", async () => {
    // A seed failure must not silently run the catalog under a key hashed
    // from another (stale or not-yet-seeded) view state; capability detection
    // itself still reports, and the launch path re-reports the seed failure.
    mocks.prepareSeed.mockRejectedValueOnce(new Error("seed failed"));
    mocks.probeAcpCapabilities.mockClear();
    mocks.loadDevinModelsForKey.mockClear();
    const spec = createDevinDetectionSpec({
      instanceId: "w",
      label: "Devin w",
      auth: { kind: "default" },
      runtimeTarget: "local",
      configGeneration: "gen",
      orgId: "org-s",
    });
    const detected = await spec.capabilitiesProbe?.({
      location: { kind: "posix", path: "/p" },
      executablePath: "/bin/devin",
    });
    expect(mocks.prepareSeed).toHaveBeenCalled();
    expect(mocks.loadDevinModelsForKey).not.toHaveBeenCalled();
    expect(detected).toBeDefined();
  });
  it("carries the negotiated ACP menu as the GUI selection over the complete terminal catalog", async () => {
    const negotiatedMenu = [
      { id: "swe-1-7-medium", label: "Swe 1 7 Medium" },
      { id: "swe-2-high", label: "Swe 2 High" },
    ];
    mocks.probeAcpCapabilities.mockImplementation(async () => ({
      models: negotiatedMenu,
      efforts: ["medium", "high", "max"],
      modelEfforts: { "swe-1-7-medium": ["medium", "max"] },
    }));
    mocks.loadDevinModelsForKey.mockImplementation(async () => [
      {
        id: "swe-1-7",
        label: "SWE 1.7",
        variants: [
          { id: "swe-1-7", effort: "", thinking: false, fast: false, context: "default" },
          { id: "swe-1-7-max", effort: "max", thinking: false, fast: false, context: "default" },
        ],
      },
    ]);
    const spec = createDevinDetectionSpec({
      instanceId: "w",
      label: "Devin w",
      auth: { kind: "default" },
      runtimeTarget: "local",
      configGeneration: "gen",
    });
    const detected = await spec.capabilitiesProbe?.({
      location: { kind: "posix", path: "/p" },
      executablePath: "/bin/devin",
    });
    // BASE (terminal) keeps the complete catalog — the folded variant id the
    // live session would refuse included.
    expect(detected?.models).toEqual([{ id: "swe-1-7", label: "SWE 1.7" }]);
    // GUI selection is the NEGOTIATED menu only, as an explicit override the
    // presentation helper must preserve.
    const gui = detected?.presentationCapabilities?.gui;
    expect(gui?.models?.map((model) => model.id)).toEqual(["swe-1-7-medium", "swe-2-high"]);
    expect(gui?.efforts).toEqual(["medium", "high", "max"]);
    expect(gui?.modelEfforts).toEqual({ "swe-1-7-medium": ["medium", "max"] });
  });
  it("carries a grouped negotiated menu through detection into the GUI override", async () => {
    mocks.probeAcpCapabilities.mockImplementation(async () => ({
      models: [
        { id: "swe-2-high", label: "Swe 2 High" },
        { id: "swe-1-7-lightning-medium", label: "Swe 1 7 Lightning Medium" },
      ],
      subProviders: [
        { id: "flagship", label: "Flagship" },
        { id: "fast", label: "Fast tier" },
      ],
      modelSubProvider: {
        "swe-2-high": "flagship",
        "swe-1-7-lightning-medium": "fast",
      },
    }));
    mocks.loadDevinModelsForKey.mockImplementation(async () => []);
    const spec = createDevinDetectionSpec({
      instanceId: "w",
      label: "Devin w",
      auth: { kind: "default" },
      runtimeTarget: "local",
      configGeneration: "gen",
    });
    const detected = await spec.capabilitiesProbe?.({
      location: { kind: "posix", path: "/p" },
      executablePath: "/bin/devin",
    });
    const gui = detected?.presentationCapabilities?.gui;
    expect(gui?.subProviders).toEqual([
      { id: "flagship", label: "Flagship" },
      { id: "fast", label: "Fast tier" },
    ]);
    expect(gui?.modelSubProvider).toEqual({
      "swe-2-high": "flagship",
      "swe-1-7-lightning-medium": "fast",
    });
    // A flat probe result keeps the override free of group fields.
    mocks.probeAcpCapabilities.mockImplementation(async () => ({
      models: [{ id: "swe-2-high", label: "Swe 2 High" }],
    }));
    const flat = await spec.capabilitiesProbe?.({
      location: { kind: "posix", path: "/p" },
      executablePath: "/bin/devin",
    });
    expect(flat?.presentationCapabilities?.gui).not.toHaveProperty("subProviders");
    expect(flat?.presentationCapabilities?.gui).not.toHaveProperty("modelSubProvider");
  });
  it("derives the grouped-model probe flag from the manifest, matching the session advertisement", async () => {
    // The probe negotiates a grouped menu exactly while the manifest entry is
    // advertised — same source the live-session advertisement reads, so the
    // two cannot drift. The guard passes in either manifest state.
    const entry = DEVIN_ACP_CLIENT_CAPABILITY_MANIFEST.find(
      (candidate) => candidate.flag === "grouped_options",
    );
    expect(entry).toBeDefined();
    // Whatever the manifest state, the probe derivation matches it exactly.
    const expected = devinProbeClientCapabilitiesMeta();
    expect(expected).toEqual(
      entry!.state === "advertised" ? { [entry!.wireKey]: true } : undefined,
    );
    // Both detection specs (root + profile) advertise exactly that — and
    // nothing beyond the config-option shape the probe projects.
    mocks.probeAcpCapabilities.mockClear();
    for (const spec of [
      devinDetectionSpec,
      createDevinDetectionSpec({
        instanceId: "w",
        label: "Devin w",
        auth: { kind: "default" },
        runtimeTarget: "local",
        configGeneration: "gen",
      }),
    ]) {
      mocks.probeAcpCapabilities.mockClear();
      await spec.capabilitiesProbe?.({
        location: { kind: "posix", path: "/p" },
        executablePath: "/bin/devin",
      });
      const call = mocks.probeAcpCapabilities.mock.calls[0] as unknown as
        | [string, string[], unknown, { clientCapabilitiesMeta?: Record<string, true> }]
        | undefined;
      expect(call?.[3]?.clientCapabilitiesMeta).toEqual(expected);
    }
  });
  it("never collapses an unreadable credential source to a missing-keyed catalog load", async () => {
    // A "missing"-keyed entry could have been cached under a different
    // credential state; an unreadable source must skip the catalog (the
    // negotiated menu still reports) instead of risking a stale/default view.
    mocks.readCredential.mockRejectedValueOnce(new Error("auth-source-unreadable"));
    mocks.loadDevinModelsForKey.mockClear();
    const spec = createDevinDetectionSpec({
      instanceId: "w",
      label: "Devin w",
      auth: { kind: "default" },
      runtimeTarget: "local",
      configGeneration: "gen",
    });
    const detected = await spec.capabilitiesProbe?.({
      location: { kind: "posix", path: "/p" },
      executablePath: "/bin/devin",
    });
    expect(mocks.loadDevinModelsForKey).not.toHaveBeenCalled();
    expect(detected).toBeDefined();
  });
  it("starts a cloud profile on the provider-owned native-default choice, no invented cloud modes", async () => {
    const cloudSpec = createDevinDetectionSpec({
      instanceId: "c",
      label: "Devin c",
      auth: { kind: "default" },
      runtimeTarget: "cloud",
      configGeneration: "gen",
    });
    const detected = await cloudSpec.capabilitiesProbe?.({
      location: { kind: "posix", path: "/p" },
      executablePath: "/bin/devin",
    });
    // Both surfaces see exactly one honest entry — a zero-model provider is
    // hidden by the pickers and the draft refuses an empty model.
    expect(detected?.models).toEqual([{ id: DEVIN_CLOUD_DEFAULT_MODEL_ID, label: "Default" }]);
    expect(detected?.efforts).toEqual([]);
    expect(detected?.modelEfforts).toEqual({ [DEVIN_CLOUD_DEFAULT_MODEL_ID]: [] });
    const gui = detected?.presentationCapabilities?.gui;
    expect(gui?.models).toEqual([{ id: DEVIN_CLOUD_DEFAULT_MODEL_ID, label: "Default" }]);
    // No invented cloud modes/policies: the cloud session has neither.
    expect(gui?.modes).toEqual([]);
    expect(gui?.approvalPolicies).toEqual([]);
  });
  it("parses the observed version without the build hash", () => {
    expect(extractSemverFromVersionOutput("devin 3000.10.21 (611c1cba)")).toBe("3000.10.21");
  });
  it.each(["", 'windsurf_api_key = ""', "invalid TOML", "windsurf_api_key = 42"])(
    "rejects empty or malformed credentials: %s",
    (content) => {
      expect(parseDevinCredentials(content)).toBeUndefined();
    },
  );
  it("reads the token and configured server without exposing unrelated data", () => {
    expect(
      parseDevinCredentials(
        'windsurf_api_key = "example"\napi_server_url = "https://server.codeium.com"',
      ),
    ).toEqual({ accessToken: "example", raw: { baseUrl: "https://server.codeium.com" } });
  });
});

it("delimits terminal pastes before submitting multiline input", () => {
  expect(createDevinAdapter().buildDirectInput?.("line one\nline two")).toEqual([
    "\x1b[200~",
    "line one\nline two",
    "\x1b[201~",
    "@wait:500",
    "\r",
  ]);
});
