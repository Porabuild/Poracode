import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import { resolveSharedUpdateCommand } from "@/shared/agents/updateResolver";
import { AcpStructuredSession } from "../acp/session";
import { probeAcpCapabilities } from "../acp";
import { primeWslLaunchEnvironment } from "../base";
import * as base from "../base";
import * as binaryResolver from "../binaryResolver";
import { createDeepSeekAdapter } from ".";
import { buildDeepSeekCommand } from "./argv";
import { buildDeepSeekProbeCapabilities, deepSeekDetectionSpec } from "./detection";

vi.mock("../acp", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../acp")>()),
  probeAcpCapabilities: vi.fn<typeof probeAcpCapabilities>(),
}));

afterEach(() => vi.restoreAllMocks());

const model = '["deepseek-official","deepseek-v4-flash"]';
const location: ProjectLocation = {
  kind: process.platform === "win32" ? "windows" : "posix",
  path: process.cwd(),
};

describe("DeepSeek Harness", () => {
  it("uses the detected default route for implicit one-shot generation", async () => {
    const adapter = createDeepSeekAdapter();
    expect(adapter.defaultOneShotModel).toBe('["deepseek-official","deepseek-flash"]');
    const detectInstall = vi.spyOn(base, "detectAgentInstall");
    for (const detectedModel of [
      '["deepseek-account","deepseek-flash"]',
      '["custom-route","custom-model"]',
    ]) {
      detectInstall.mockResolvedValue({
        kind: "deepseek",
        label: "DeepSeek Harness",
        installed: true,
        authState: "authenticated",
        capabilities: {
          ...adapter.capabilities,
          models: [{ id: detectedModel, label: "Available model" }],
        },
      });
      await adapter.detectInstall();
      expect(adapter.defaultOneShotModel).toBe(detectedModel);
    }
  });

  it("advertises the shipped ACP surface and headless utility lane without a terminal", () => {
    const adapter = createDeepSeekAdapter();
    expect(adapter).toMatchObject({ kind: "deepseek", label: "DeepSeek Harness", binary: "dsh" });
    expect(adapter.capabilities).toMatchObject({
      presentationMode: "gui",
      presentationModes: ["gui"],
      liveInputMode: "server",
      supportsResume: true,
      supportsOneShot: true,
      readsImageAttachmentsFromHost: false,
      modes: ["agent"],
      mcpScope: { gui: "launch" },
      defaultApprovalPolicy: "never",
      bypassPermissions: { approvalPolicy: "never" },
    });
    expect(adapter.runOneShot).toBeTypeOf("function");
    expect(adapter.createInitialSessionRef()).toBeUndefined();
    expect(() => adapter.buildLaunchArgv(location, { model }, "", undefined)).toThrow("Chat");
    expect(() =>
      adapter.buildResumeArgv(location, { model }, "", {
        providerSessionId: "id",
        discoveredAt: "2026-10-17T00:00:00Z",
      }),
    ).toThrow("Chat");
    expect(adapter.mcpRequiresStdioCwdProxy).toBe(true);
    expect(adapter.skillSupport).toMatchObject({
      invocation: "prompt",
      roots: [
        { globalOverride: { env: "DSH_HOME", path: "skills" }, projectPath: ".dsh/skills" },
        {
          globalOverride: { env: "DSH_AGENTS_HOME", path: "skills" },
          projectPath: ".agents/skills",
        },
      ],
    });
  });

  it("launches the resolved ACP binary in the native project cwd", () => {
    expect(buildDeepSeekCommand(location, process.execPath)).toMatchObject({
      command: process.execPath,
      args: ["acp"],
      cwd: process.cwd(),
    });
  });

  it("routes WSL ACP through its native Linux cwd and resolved binary", () => {
    primeWslLaunchEnvironment("Ubuntu", { shellPath: "/bin/bash", home: "/home/test" });
    const command = buildDeepSeekCommand(
      {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/home/test/a project",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\test\\a project",
      },
      "/home/test/.local/bin/dsh",
    );
    expect(command.command).toMatch(/(?:^|[\\/])wsl\.exe$/);
    expect(command.args).toContain("/home/test/a project");
    expect(command.args.join(" ")).toContain("/home/test/.local/bin/dsh");
    expect(command.args.join(" ")).toContain("acp");
  });

  it.each(["posix", "windows", "wsl"] as const)(
    "keeps %s updates on the current release-candidate channel",
    (envKind) => {
      const adapter = createDeepSeekAdapter();
      expect(
        resolveSharedUpdateCommand({
          update: adapter.update,
          executablePath: "/node_modules/.bin/dsh",
          envKind,
        }),
      ).toEqual({
        binary: "npm",
        args: ["install", "-g", "@deepseek-ai/dsh@next"],
        strategy: "installer",
      });
      expect(adapter.update?.latestVersionUrls).toEqual([
        "https://registry.npmjs.org/%40deepseek-ai%2Fdsh/next",
      ]);
    },
  );

  it("preserves opaque model routes, grouping, and each model's reasoning choices", () => {
    const probe = buildDeepSeekProbeCapabilities({
      authState: "authenticated",
      authMethods: [],
      supportsResume: true,
      models: [{ id: model, label: "deepseek-v4-flash" }],
      subProviders: [{ id: "deepseek-official", label: "DeepSeek" }],
      modelSubProvider: { [model]: "deepseek-official" },
      efforts: ["off", "low", "high", "max"],
      defaultEffort: "high",
      modelEfforts: { [model]: ["off", "low", "high", "max"], custom: [] },
      modelDefaultEfforts: { [model]: "high" },
    });
    expect(probe).toMatchObject({
      models: [{ id: model, label: "DeepSeek V4 Flash" }],
      subProviders: [{ id: "deepseek-official", label: "DeepSeek" }],
      modelSubProvider: { [model]: "deepseek-official" },
      defaultEffort: "high",
      modelEfforts: { [model]: ["off", "low", "high", "max"], custom: [] },
      modelDefaultEfforts: { [model]: "high" },
      authMethods: [{ type: "terminal" }],
      preferTerminalLogin: true,
    });
    expect(probe).not.toHaveProperty("authState");
    expect(buildDeepSeekProbeCapabilities(undefined)).not.toHaveProperty("models");
    expect(deepSeekDetectionSpec.loginCommand).toBe("dsh web --port 0");
  });

  it("probes the ACP profile with its exact per-model option snapshots", async () => {
    vi.mocked(probeAcpCapabilities).mockResolvedValue({
      supportsResume: true,
      modelEfforts: { [model]: [] },
    });
    const result = await deepSeekDetectionSpec.capabilitiesProbe?.({
      location,
      executablePath: process.execPath,
    });
    expect(result?.modelEfforts).toEqual({ [model]: [] });
    expect(probeAcpCapabilities).toHaveBeenCalledWith(
      process.execPath,
      ["acp"],
      expect.any(String),
      expect.objectContaining({ preserveEmptyModelEfforts: true }),
    );
  });

  it("uses the shared structured-session lifecycle for new and resumed chats", async () => {
    vi.spyOn(binaryResolver, "resolveAgentBinaryPath").mockReturnValue(process.execPath);
    const fake = {} as AcpStructuredSession;
    const created = vi.spyOn(AcpStructuredSession, "create").mockReturnValue(fake);
    const adapter = createDeepSeekAdapter();
    const config = { model, effort: "low", approvalPolicy: "default" };
    const sessionRef = {
      providerSessionId: "persisted-session",
      discoveredAt: "2026-10-17T00:00:00Z",
    };
    expect(
      await adapter.createStructuredSession?.({
        threadId: "deepseek-thread",
        projectLocation: location,
        presentationMode: "gui",
        config,
        sessionRef,
        mcpServers: [],
      }),
    ).toBe(fake);
    expect(created).toHaveBeenCalledWith(
      expect.objectContaining({ command: process.execPath, args: ["acp"], cwd: process.cwd() }),
      location,
      "deepseek-thread",
      expect.objectContaining({ mcpServers: [] }),
    );
  });
});
