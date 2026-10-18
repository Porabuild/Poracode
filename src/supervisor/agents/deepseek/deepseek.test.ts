import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ProjectLocation } from "@/shared/contracts";
import { resolveSharedUpdateCommand } from "@/shared/agents/updateResolver";
import { AcpStructuredSession } from "../acp/session";
import { probeAcpCapabilities } from "../acp";
import { AcpSessionRequests } from "../acp/sessionRequests";
import { createAcpMapperState } from "../acp/canonicalMapping";
import { primeWslLaunchEnvironment } from "../base";
import * as base from "../base";
import * as binaryResolver from "../binaryResolver";
import * as launchFiles from "../base/launchFiles";
import {
  DEEPSEEK_SESSION_POLICY,
  normalizeDeepSeekConfig,
  stageDeepSeekPermissions,
} from "./permissions";
import * as permissions from "./permissions";
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
  it.each([undefined, "never", "auto-review"])(
    "keeps native reviewer denials waiting for the user with saved policy %s",
    async (approvalPolicy) => {
      const config = normalizeDeepSeekConfig({
        model,
        ...(approvalPolicy ? { approvalPolicy } : {}),
      });
      expect(config.approvalPolicy).toBe("auto-review");
      const attention = vi.fn<(value: string) => void>();
      const requests = new AcpSessionRequests({
        threadId: "reviewed",
        getPermissionContext: () => ({ config, availableModeIds: [] }),
        ensureMapperState: () => createAcpMapperState("reviewed"),
        emitRuntimeEvents: () => {},
        setRequestAttention: attention,
        createRequestId: () => "review-denied",
      });
      const response = requests.requestPermission({
        sessionId: "native",
        toolCall: { toolCallId: "command", title: "Reviewer declined command", kind: "execute" },
        options: [{ optionId: "approve", name: "Allow once", kind: "allow_once" }],
      });
      expect(attention).toHaveBeenCalledWith("needs_approval");
      requests.resolve("review-denied", { action: "cancel" });
      await expect(response).resolves.toEqual({ outcome: { outcome: "cancelled" } });
    },
  );

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
      defaultApprovalPolicy: "auto-review",
      bypassPermissions: { approvalPolicy: "bypassPermissions" },
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
    const dispose = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const fake = {
      dispose,
      openThread: vi.fn<AcpStructuredSession["openThread"]>(),
      startTurn: vi.fn<AcpStructuredSession["startTurn"]>(),
      interruptTurn: vi.fn<AcpStructuredSession["interruptTurn"]>(),
    } as unknown as AcpStructuredSession;
    const cleanup = vi.fn<() => void>();
    const setConfig = vi
      .fn<(config: import("@/shared/contracts").ThreadConfig) => Promise<void>>()
      .mockResolvedValue(undefined);
    vi.spyOn(permissions, "stageDeepSeekPermissions").mockResolvedValue({
      directory: "/staged",
      patchPath: "/staged/permissions.json",
      setConfig,
      cleanup,
    });
    const openThread = fake.openThread;
    const startTurn = fake.startTurn;
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
      expect.objectContaining({
        command: process.execPath,
        args: ["acp", "--patch", expect.stringContaining("permissions.json")],
        cwd: process.cwd(),
      }),
      location,
      "deepseek-thread",
      expect.objectContaining({ mcpServers: [] }),
    );
    await fake.openThread({ model, approvalPolicy: "never" }, sessionRef);
    expect(openThread).toHaveBeenCalledWith({ model, approvalPolicy: "auto-review" }, sessionRef);
    await fake.startTurn("review this", { model, approvalPolicy: "never" });
    expect(setConfig).toHaveBeenCalledWith({ model, approvalPolicy: "auto-review" });
    expect(startTurn).toHaveBeenCalledWith("review this", { model, approvalPolicy: "auto-review" });
    expect(cleanup).not.toHaveBeenCalled();
    await fake.dispose();
    expect(dispose).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it.each(["interrupt", "dispose"] as const)(
    "does not start a turn cancelled during policy staging (%s)",
    async (action) => {
      vi.spyOn(binaryResolver, "resolveAgentBinaryPath").mockReturnValue(process.execPath);
      let release!: () => void;
      let entered!: () => void;
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const blocked = new Promise<void>((resolve) => {
        release = resolve;
      });
      const setConfig = vi.fn<(config: import("@/shared/contracts").ThreadConfig) => Promise<void>>(
        async () => {
          entered();
          await blocked;
        },
      );
      const cleanup = vi.fn<() => void>();
      vi.spyOn(permissions, "stageDeepSeekPermissions").mockResolvedValue({
        directory: "/staged",
        patchPath: "/staged/permissions.json",
        setConfig,
        cleanup,
      });
      const startTurn = vi.fn<AcpStructuredSession["startTurn"]>().mockResolvedValue(undefined);
      const fake = {
        openThread: vi.fn<AcpStructuredSession["openThread"]>(),
        startTurn,
        interruptTurn: vi.fn<AcpStructuredSession["interruptTurn"]>().mockResolvedValue(undefined),
        dispose: vi.fn<AcpStructuredSession["dispose"]>().mockResolvedValue(undefined),
      } as unknown as AcpStructuredSession;
      vi.spyOn(AcpStructuredSession, "create").mockReturnValue(fake);
      const session = await createDeepSeekAdapter().createStructuredSession!({
        threadId: "policy-staging",
        projectLocation: location,
        presentationMode: "gui",
        config: { model },
      });
      const turn = session!.startTurn!("read only", { model });
      await started;
      const stopped = action === "interrupt" ? session!.interruptTurn!() : session!.dispose();
      release();
      await stopped;
      await turn;
      expect(startTurn).not.toHaveBeenCalled();
      await session!.dispose();
    },
  );

  it.each([
    [{ kind: "posix", path: "/projects/app" }, "workspace-write"],
    [{ kind: "windows", path: "C:\\projects\\app" }, "workspace-write"],
    [{ kind: "windows", path: "C:\\Users\\test" }, "danger-full-access"],
    [{ kind: "posix", path: "/home/test" }, "danger-full-access"],
    [{ kind: "wsl", distro: "Ubuntu", linuxPath: "/home/test", uncPath: "" }, "danger-full-access"],
  ] satisfies Array<[ProjectLocation, string]>)(
    "pins Default sandbox policy for %j",
    async (projectLocation, expected) => {
      const stage = vi.spyOn(launchFiles, "stageLaunchFiles").mockResolvedValue({
        directory: "/staged",
        cleanup: vi.fn<() => void>(),
      });
      await stageDeepSeekPermissions(projectLocation, {
        model,
        approvalPolicy: "default",
        sandboxMode: "danger-full-access",
      });
      const files = stage.mock.calls[0]![2];
      expect(JSON.parse(files["permissions.json"]!)).toEqual([
        { id: "acp", inject: ["acpAppStartup", "poracodeSessionPolicy"] },
        {
          insert: [
            { id: "auto-review", name: "@deepseek-ai/dsh-experimental-auto-review" },
            {
              id: "poracode-session-policy",
              name: "./policy.mjs",
              config: { policyPath: "./selection.json" },
            },
          ],
        },
      ]);
      expect(files["policy.mjs"]).toBe(DEEPSEEK_SESSION_POLICY);
      expect(JSON.parse(files["selection.json"]!)).toEqual({
        sandboxMode: expected,
        autoReview: false,
      });
    },
  );

  it("overrides persisted native sandbox and approval choices before new or resumed agents run", async () => {
    const staged = await stageDeepSeekPermissions(location, {
      model,
      approvalPolicy: "bypassPermissions",
    });
    try {
      const policy = await import(
        `data:text/javascript;base64,${Buffer.from(DEEPSEEK_SESSION_POLICY).toString("base64")}`
      );
      const listeners = new Map<string, (...args: unknown[]) => void>();
      const ctx = {
        on: vi.fn<(name: string, listener: (...args: unknown[]) => void) => void>(
          (name, listener) => {
            listeners.set(name, listener);
          },
        ),
        provide: vi.fn<(name: string, value: unknown) => void>(),
        permissionPresets: {
          current: () => "custom",
          set: vi.fn<(session: unknown, preset: string) => void>(),
        },
        sandboxPolicy: { resolve: () => ({ mode: "workspace-write" }) },
        approval: { effectivePolicy: () => "never" },
      };
      policy.apply(ctx, {
        policyPath: pathToFileURL(join(staged.directory, "selection.json")).href,
      });
      expect(ctx.on).toHaveBeenCalledWith("agent/created", expect.any(Function));
      for (const previous of [[], [{ type: "sandbox/mode", data: { mode: "workspace-write" } }]]) {
        const events = [...previous];
        const append = vi.fn<(type: string, data: { mode?: string; policy?: string }) => void>(
          (type, data) => {
            events.push({ type, data } as (typeof events)[number]);
          },
        );
        listeners.get("agent/created")!({ agent: { session: { header: {}, append } } });
        expect(events.slice(-2)).toEqual([
          { type: "sandbox/mode", data: { mode: "danger-full-access" } },
          { type: "approval/policy", data: { policy: "ask" } },
        ]);
      }
      await staged.setConfig({ model, approvalPolicy: "default" });
      expect(JSON.parse(readFileSync(join(staged.directory, "selection.json"), "utf8"))).toEqual({
        sandboxMode: "workspace-write",
        autoReview: false,
      });
      const append = vi.fn<(type: string, data: unknown) => void>();
      ctx.sandboxPolicy.resolve = () => ({ mode: "danger-full-access" });
      listeners.get("agent/inbox/claimed")!({ agent: { session: { header: {}, append } } });
      expect(append).toHaveBeenCalledWith("sandbox/mode", { mode: "workspace-write" });
      const next = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
      listeners.get("agent/pre-step")!({ agent: { session: { header: {}, append } } }, next);
      expect(next).toHaveBeenCalledOnce();
      for (const approvalPolicy of [undefined, "never", "auto-review"]) {
        await staged.setConfig({ model, ...(approvalPolicy ? { approvalPolicy } : {}) });
        expect(JSON.parse(readFileSync(join(staged.directory, "selection.json"), "utf8"))).toEqual({
          sandboxMode: "danger-full-access",
          autoReview: true,
        });
        listeners.get("agent/inbox/claimed")!({ agent: { session: { header: {}, append } } });
        expect(ctx.permissionPresets.set).toHaveBeenLastCalledWith(expect.anything(), "auto");
      }
      ctx.permissionPresets.current = () => "auto";
      await staged.setConfig({ model, approvalPolicy: "default" });
      listeners.get("agent/inbox/claimed")!({ agent: { session: { header: {}, append } } });
      expect(ctx.permissionPresets.set).toHaveBeenLastCalledWith(
        expect.anything(),
        "workspace-write",
      );
      append.mockClear();
      listeners.get("agent/created")!({
        agent: { session: { header: { origin: "subagent" }, append } },
      });
      expect(append).not.toHaveBeenCalled();
    } finally {
      await staged.cleanup();
    }
  });
});
