import type { AuthMethod } from "@agentclientprotocol/sdk";
import { describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import { createAcpStructuredSession, type AcpProbeResult } from "../acp";
import { buildAgentRegistry } from "../registry";
import {
  buildFactoryCommand,
  buildFactoryProbeCapabilities,
  FACTORY_ACP_ARGS,
  FACTORY_DISABLE_AUTO_UPDATE_ENV,
  factoryDetectionSpec,
  normalizeFactoryModels,
} from "./detection";
import { createFactoryAdapter } from "./index";

const probeAcpCapabilitiesMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<AcpProbeResult | undefined>>(),
);

vi.mock("../acp", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../acp")>()),
  createAcpStructuredSession: vi.fn<() => undefined>(() => undefined),
  probeAcpCapabilities: probeAcpCapabilitiesMock,
}));

describe("Factory Droid detection", () => {
  it("normalizes Factory Droid model rates at the provider boundary", async () => {
    probeAcpCapabilitiesMock.mockResolvedValue({
      models: [
        {
          id: "glm-5.1",
          label: "Droid Core (GLM-5.1)",
          description: "0.55x Factory token rate",
        },
        {
          id: "auto",
          label: "Auto",
          description: "Let Droid choose the best model",
        },
      ],
    });
    const adapter = buildAgentRegistry([
      {
        driver: "acp-generic",
        config: { binary: "droid", args: ["exec", "--output-format", "acp"] },
        id: "factory-droid",
        displayName: "Factory Droid",
      },
    ]).find((candidate) => candidate.kind === "acp-generic:factory-droid")!;
    const status = await adapter.detectInstall();
    expect(status.capabilities.models).toEqual([
      {
        id: "glm-5.1",
        label: "Droid Core (GLM-5.1)",
        description: "0.55x",
        tooltipDescription: "0.55x Factory token rate",
      },
      { id: "auto", label: "Auto", description: "Let Droid choose the best model" },
    ]);
  });

  it("declares the native binary, updater, ACP defaults, and API-key fallback", () => {
    expect(factoryDetectionSpec).toMatchObject({
      kind: "factory",
      label: "Factory Droid",
      binary: "droid",
      update: {
        builtIn: { binary: "droid", args: ["update"] },
        npm: "droid",
      },
      baseSpawnEnv: FACTORY_DISABLE_AUTO_UPDATE_ENV,
    });
    expect(factoryDetectionSpec.capabilities).toMatchObject({
      liveInputMode: "server",
      presentationMode: "gui",
      presentationModes: ["gui"],
      supportsResume: true,
      supportsOneShot: true,
      defaultApprovalPolicy: "auto-high",
      bypassPermissions: { approvalPolicy: "auto-high" },
    });
  });

  it("builds the direct ACP command with automatic updates disabled", () => {
    const location: ProjectLocation = { kind: "windows", path: "C:\\repo" };
    expect(buildFactoryCommand(location, "C:\\bin\\droid.exe")).toMatchObject({
      command: "C:\\bin\\droid.exe",
      args: [...FACTORY_ACP_ARGS],
      cwd: "C:\\repo",
      env: expect.objectContaining(FACTORY_DISABLE_AUTO_UPDATE_ENV),
    });
  });

  it("forwards the shared probe-env merge into the ACP capabilities probe spawn", async () => {
    probeAcpCapabilitiesMock.mockReset();
    probeAcpCapabilitiesMock.mockResolvedValue(undefined);

    const probeEnv = { ...FACTORY_DISABLE_AUTO_UPDATE_ENV, PROBE_ONLY: "1" };
    await factoryDetectionSpec.capabilitiesProbe?.({
      location: { kind: "windows", path: "C:\\repo" },
      executablePath: "C:\\bin\\droid.exe",
      // What detectAgentInstall passes: mergeSpawnEnv(baseSpawnEnv, probeEnv).
      probeEnv,
    });

    // The probe lane honors the single declaration point via ctx.probeEnv
    // instead of hardcoding the constant.
    expect(probeAcpCapabilitiesMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        env: expect.objectContaining(probeEnv),
      }),
    );
  });

  it("keeps the Factory token rate compact while retaining the full tooltip", () => {
    expect(
      normalizeFactoryModels([
        {
          id: "claude-opus-4-8",
          label: "Opus 4.8",
          description: "0.55x Factory token rate",
        },
        { id: "auto", label: "Auto Model" },
      ]),
    ).toEqual([
      {
        id: "claude-opus-4-8",
        label: "Opus 4.8",
        description: "0.55x",
        tooltipDescription: "0.55x Factory token rate",
      },
      { id: "auto", label: "Auto Model" },
    ]);
  });

  it("maps live ACP models, effort tiers, autonomy modes, and auth", () => {
    const authMethod = {
      id: "device-pairing",
      name: "Sign in with browser",
      type: "agent",
    } as AuthMethod;
    const capabilities = buildFactoryProbeCapabilities({
      models: [{ id: "model-a", label: "Model A", description: "1x Factory token rate" }],
      efforts: ["low", "high"],
      defaultEffort: "high",
      modelEfforts: { "model-a": ["low", "high"] },
      modes: ["agent"],
      approvalPolicies: [
        { id: "normal", label: "Auto (Off)" },
        { id: "auto-high", label: "Auto (High Risk)" },
      ],
      authMethods: [authMethod],
      authState: "authenticated",
    });

    expect(capabilities).toMatchObject({
      models: [
        {
          id: "model-a",
          description: "1x",
          tooltipDescription: "1x Factory token rate",
        },
      ],
      efforts: ["low", "high"],
      defaultEffort: "high",
      modelEfforts: { "model-a": ["low", "high"] },
      approvalPolicies: [
        { id: "normal", label: "Auto (Off)" },
        { id: "auto-high", label: "Auto (High Risk)" },
      ],
      authMethods: [authMethod],
      authState: "authenticated",
    });
  });
});

describe("Factory Droid adapter", () => {
  it("owns Factory skills and projects canonical skills into Droid's native root", () => {
    expect(createFactoryAdapter().skillSupport).toMatchObject({
      roots: [
        { id: "factory", globalPath: ".factory/skills", projectPath: ".factory/skills" },
        { id: "agent", projectPath: ".agent/skills" },
      ],
      projectionRoots: [
        {
          id: "factory",
          globalPath: ".factory/skills",
          projectPath: ".factory/skills",
          linkProjectionFromVersion: "0.56.0",
        },
      ],
      invocation: "slash",
    });
  });

  it("uses Droid's read-only headless path for utility one-shots", () => {
    expect(
      createFactoryAdapter().buildOneShotCommand?.("model-a", "high", "write a title"),
    ).toEqual({
      command: "droid",
      args: ["exec", "--output-format", "text", "--model", "model-a", "--reasoning-effort", "high"],
    });
  });

  it("uses direct ACP for both the launch placeholder and auth handshake", async () => {
    const adapter = createFactoryAdapter();
    expect(
      adapter.buildLaunchArgv({ kind: "windows", path: "C:\\repo" }, { model: "auto" }, ""),
    ).toEqual({
      binary: "droid",
      args: [...FACTORY_ACP_ARGS],
    });
    // The updater opt-out is no longer repeated on the argv: shared runtime
    // applies `baseSpawnEnv` at the ACP session/auth lanes (see
    // baseSpawnEnv.test.ts), so the adapter declares it exactly once.
    expect(adapter.baseSpawnEnv).toEqual(FACTORY_DISABLE_AUTO_UPDATE_ENV);
  });

  it("declares HTTP MCP support Droid never advertises so built-in servers reach it", async () => {
    await createFactoryAdapter().createStructuredSession?.({
      threadId: "thread-1",
      projectLocation: { kind: "windows", path: "C:\\repo" },
      config: { model: "auto" },
    });

    expect(vi.mocked(createAcpStructuredSession).mock.calls[0]?.[2]).toEqual({
      assumedMcpCapabilities: { http: true },
    });
  });
});
