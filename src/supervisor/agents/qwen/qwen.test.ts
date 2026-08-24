import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation, ThreadConfig } from "@/shared/contracts";
import { createAcpStructuredSession } from "../acp";
import type { CreateStructuredSessionInput } from "../base";
import { createQwenAdapter } from ".";
import { buildQwenArgs, QWEN_DEFAULT_MODEL_ID } from "./argv";
import {
  buildQwenAcpSessionArgs,
  buildQwenProbeCapabilities,
  QWEN_AUTH_ENV_KEYS,
  qwenDefaultCapabilities,
  qwenDetectionSpec,
} from "./detection";
import { detectQwenInvalidSessionRef } from "./session";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

const detectAgentInstallMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<{ version?: string; capabilities?: unknown }>>(),
);
const resolveAgentBinaryPathMock = vi.hoisted(() =>
  vi.fn<(location: ProjectLocation) => string | undefined>((location) =>
    location.kind === "windows" ? "C:\\tools\\qwen.exe" : undefined,
  ),
);

vi.mock("../base", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../base")>()),
  detectAgentInstall: detectAgentInstallMock,
}));

vi.mock("../acp", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../acp")>()),
  createAcpStructuredSession: vi.fn<() => undefined>(() => undefined),
}));

vi.mock("../binaryResolver", () => ({ resolveAgentBinaryPath: resolveAgentBinaryPathMock }));

afterEach(() => {
  vi.unstubAllEnvs();
  detectAgentInstallMock.mockReset();
  resolveAgentBinaryPathMock.mockClear();
  vi.mocked(createAcpStructuredSession).mockClear();
});

describe("buildQwenArgs", () => {
  it("builds an interactive plan-mode launch with a preassigned session", () => {
    expect(
      buildQwenArgs(
        { model: QWEN_DEFAULT_MODEL_ID, mode: "plan" },
        "hello",
        undefined,
        "session-id",
      ),
    ).toEqual([
      "--session-id",
      "session-id",
      "--model",
      QWEN_DEFAULT_MODEL_ID,
      "--approval-mode",
      "plan",
      "--prompt-interactive",
      "hello",
    ]);
  });

  it.each([
    ["auto_edit", "auto-edit"],
    ["auto-edit", "auto-edit"],
    ["auto", "auto"],
    ["default", "default"],
    ["never", "yolo"],
    ["bypassPermissions", "yolo"],
    [undefined, "auto"],
  ] as const)("maps approval policy %s to %s", (approvalPolicy, expected) => {
    const config: ThreadConfig = {
      model: QWEN_DEFAULT_MODEL_ID,
      ...(approvalPolicy ? { approvalPolicy } : {}),
    };
    const args = buildQwenArgs(config, "");
    expect(args.slice(-2)).toEqual(["--approval-mode", expected]);
  });
});

describe("createQwenAdapter", () => {
  const project: ProjectLocation = { kind: "windows", path: "C:\\demo" };
  const config: ThreadConfig = { model: QWEN_DEFAULT_MODEL_ID };

  it("preassigns a stable session ID and resumes that exact ID", () => {
    const adapter = createQwenAdapter();
    const launch = adapter.buildLaunchArgv(project, config, "hello");
    const sessionIndex = launch.args.indexOf("--session-id");
    const sessionId = launch.args[sessionIndex + 1];

    expect(launch.binary).toBe("qwen");
    expect(sessionId).toMatch(UUID_RE);
    expect(launch.sessionRef?.providerSessionId).toBe(sessionId);

    const resume = adapter.buildResumeArgv(project, config, "again", launch.sessionRef!);
    expect(resume.args).toContain("--resume");
    expect(resume.args).toContain(sessionId);
    expect(resume.args).not.toContain("--session-id");
  });

  it("exposes terminal and ACP runtimes, updater metadata, and Qwen skill roots", () => {
    const adapter = createQwenAdapter();
    expect(adapter.capabilities.modes).toEqual(["agent", "plan"]);
    expect(adapter.capabilities.defaultApprovalPolicy).toBe("auto");
    expect(adapter.capabilities.presentationModes).toEqual(["terminal", "gui"]);
    expect(adapter.createStructuredSession).toBeTypeOf("function");
    expect(adapter.update).toEqual({
      builtIn: { binary: "qwen", args: ["update"] },
      verifyBuiltInVersionChange: true,
      npm: "@qwen-code/qwen-code",
      brew: "qwen-code",
    });
    expect(adapter.skillSupport?.roots.map((root) => root.id)).toEqual(["qwen", "agents"]);
  });

  it("uses read-only plan mode for one-shot utility prompts", () => {
    expect(createQwenAdapter().buildOneShotCommand?.("", "", "title")).toEqual({
      command: "qwen",
      args: ["-p", "title", "--model", QWEN_DEFAULT_MODEL_ID, "--approval-mode", "plan"],
      stdin: "",
    });
  });
});

describe("buildQwenAcpSessionArgs", () => {
  it("enables ask_user_question restore on Qwen 0.22.0 and newer", () => {
    expect(buildQwenAcpSessionArgs("0.22.0")).toEqual(["--acp", "--restore-ask-user-question"]);
    expect(buildQwenAcpSessionArgs("0.23.1")).toEqual(["--acp", "--restore-ask-user-question"]);
    expect(buildQwenAcpSessionArgs("v0.22.0")).toEqual(["--acp", "--restore-ask-user-question"]);
  });

  it("keeps plain --acp for older or undetected CLIs", () => {
    expect(buildQwenAcpSessionArgs("0.21.15")).toEqual(["--acp"]);
    expect(buildQwenAcpSessionArgs("0.21.14-nightly.20260822")).toEqual(["--acp"]);
    expect(buildQwenAcpSessionArgs(undefined)).toEqual(["--acp"]);
  });
});

describe("Qwen ACP session spawn", () => {
  const sessionInput: CreateStructuredSessionInput = {
    threadId: "thread-1",
    projectLocation: { kind: "windows", path: "C:\\repo" },
    config: { model: QWEN_DEFAULT_MODEL_ID },
  };

  it("passes --restore-ask-user-question once Qwen 0.22.0 is detected", async () => {
    detectAgentInstallMock.mockResolvedValue({
      version: "0.22.0",
      capabilities: qwenDefaultCapabilities,
    });
    const adapter = createQwenAdapter();
    await adapter.detectInstall({ envKind: "windows" });
    await adapter.createStructuredSession?.(sessionInput);

    const command = vi.mocked(createAcpStructuredSession).mock.calls[0]?.[0];
    expect(command?.args.slice(-2)).toEqual(["--acp", "--restore-ask-user-question"]);
  });

  it("spawns plain --acp while the detected CLI is older", async () => {
    detectAgentInstallMock.mockResolvedValue({
      version: "0.21.15",
      capabilities: qwenDefaultCapabilities,
    });
    const adapter = createQwenAdapter();
    await adapter.detectInstall({ envKind: "windows" });
    await adapter.createStructuredSession?.(sessionInput);

    const command = vi.mocked(createAcpStructuredSession).mock.calls[0]?.[0];
    expect(command?.args.slice(-1)).toEqual(["--acp"]);
  });

  it("spawns plain --acp before any detection has run", async () => {
    const adapter = createQwenAdapter();
    await adapter.createStructuredSession?.(sessionInput);

    const command = vi.mocked(createAcpStructuredSession).mock.calls[0]?.[0];
    expect(command?.args.slice(-1)).toEqual(["--acp"]);
  });

  it("uses the detected version for the matching native or WSL environment", async () => {
    let releaseNative!: () => void;
    let releaseWsl!: () => void;
    const nativeReady = new Promise<void>((resolve) => {
      releaseNative = resolve;
    });
    const wslReady = new Promise<void>((resolve) => {
      releaseWsl = resolve;
    });
    detectAgentInstallMock.mockImplementation(async (ctx: unknown) => {
      if ((ctx as { envKind?: string }).envKind === "wsl") {
        await wslReady;
        return { version: "0.21.15", capabilities: qwenDefaultCapabilities };
      }
      await nativeReady;
      return { version: "0.22.0", capabilities: qwenDefaultCapabilities };
    });

    const adapter = createQwenAdapter();
    const nativeDetection = adapter.detectInstall({ envKind: "windows" });
    const wslDetection = adapter.detectInstall({ envKind: "wsl", wslDistro: "Ubuntu" });
    releaseWsl();
    releaseNative();
    await Promise.all([nativeDetection, wslDetection]);

    await adapter.createStructuredSession?.(sessionInput);
    await adapter.createStructuredSession?.({
      ...sessionInput,
      projectLocation: {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/repo",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\repo",
      },
    });

    const commands = vi.mocked(createAcpStructuredSession).mock.calls.map(([command]) => command);
    expect(commands[0]?.args.slice(-2)).toEqual(["--acp", "--restore-ask-user-question"]);
    expect(commands[1]?.args.join(" ")).toContain("--acp");
    expect(commands[1]?.args.join(" ")).not.toContain("restore-ask-user-question");
  });

  it("clears a stale version after detection fails", async () => {
    const adapter = createQwenAdapter();
    detectAgentInstallMock.mockResolvedValue({
      version: "0.22.0",
      capabilities: qwenDefaultCapabilities,
    });
    await adapter.detectInstall({ envKind: "windows" });

    let rejectDetection!: (error: Error) => void;
    detectAgentInstallMock.mockImplementationOnce(
      () =>
        new Promise<never>((_, reject) => {
          rejectDetection = reject;
        }),
    );
    const detection = adapter.detectInstall({ envKind: "windows" });
    await adapter.createStructuredSession?.(sessionInput);

    const command = vi.mocked(createAcpStructuredSession).mock.calls[0]?.[0];
    expect(command?.args.slice(-1)).toEqual(["--acp"]);
    rejectDetection(new Error("probe failed"));
    await expect(detection).rejects.toThrow("probe failed");
  });

  it("keeps the newest result when overlapping detections finish out of order", async () => {
    let resolveOlder!: () => void;
    let resolveNewer!: () => void;
    const olderReady = new Promise<void>((resolve) => {
      resolveOlder = resolve;
    });
    const newerReady = new Promise<void>((resolve) => {
      resolveNewer = resolve;
    });
    let callCount = 0;
    detectAgentInstallMock.mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) {
        await olderReady;
        return { version: "0.21.15", capabilities: qwenDefaultCapabilities };
      }
      await newerReady;
      return { version: "0.22.0", capabilities: qwenDefaultCapabilities };
    });

    const adapter = createQwenAdapter();
    const olderDetection = adapter.detectInstall({ envKind: "windows" });
    const newerDetection = adapter.detectInstall({ envKind: "windows" });
    resolveNewer();
    resolveOlder();
    await Promise.all([olderDetection, newerDetection]);
    await adapter.createStructuredSession?.(sessionInput);

    const command = vi.mocked(createAcpStructuredSession).mock.calls[0]?.[0];
    expect(command?.args.slice(-2)).toEqual(["--acp", "--restore-ask-user-question"]);
  });

  it("does not clear a newer result when an older detection fails", async () => {
    let rejectOlder!: (error: Error) => void;
    let resolveNewer!: () => void;
    const olderReady = new Promise<never>((_, reject) => {
      rejectOlder = reject;
    });
    const newerReady = new Promise<void>((resolve) => {
      resolveNewer = resolve;
    });
    let callCount = 0;
    detectAgentInstallMock.mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) return olderReady;
      await newerReady;
      return { version: "0.22.0", capabilities: qwenDefaultCapabilities };
    });

    const adapter = createQwenAdapter();
    const olderDetection = adapter.detectInstall({ envKind: "windows" });
    const newerDetection = adapter.detectInstall({ envKind: "windows" });
    resolveNewer();
    rejectOlder(new Error("probe failed"));
    await expect(olderDetection).rejects.toThrow("probe failed");
    await newerDetection;
    await adapter.createStructuredSession?.(sessionInput);

    const command = vi.mocked(createAcpStructuredSession).mock.calls[0]?.[0];
    expect(command?.args.slice(-2)).toEqual(["--acp", "--restore-ask-user-question"]);
  });
});

describe("buildQwenProbeCapabilities", () => {
  it("maps ACP models, context limits, and auth state", () => {
    const capabilities = buildQwenProbeCapabilities({
      models: [
        { id: "coder-model", label: "coder-model" },
        { id: QWEN_DEFAULT_MODEL_ID, label: "Qwen3.8 Max" },
      ],
      modelMetadata: { "coder-model": { contextLimit: 1_000_000 } },
      authState: "authenticated",
    });

    expect(capabilities.models?.[0]?.id).toBe(QWEN_DEFAULT_MODEL_ID);
    expect(capabilities.modelContextSizes).toEqual({ "coder-model": ["1M"] });
    expect(capabilities.authState).toBe("authenticated");
    expect(capabilities.preferTerminalLogin).toBe(true);
  });

  it("normalizes Qwen ACP provider tags onto public model ids", () => {
    const capabilities = buildQwenProbeCapabilities({
      models: [
        { id: "coder-model(qwen-oauth)", label: "coder-model" },
        {
          id: "qwen3.8-max(openai)",
          label: "[Token Plan Personal] qwen3.8-max",
        },
        {
          id: "qwen3.7-max(openai)",
          label: "[Token Plan Personal] qwen3.7-max",
        },
        {
          id: "qwen3.7-plus(openai)",
          label: "[Token Plan Personal] qwen3.7-plus",
        },
        {
          id: "qwen3.6-flash(openai)",
          label: "[Token Plan Personal] qwen3.6-flash",
        },
        {
          id: "glm-5.2(openai)",
          label: "[Token Plan Personal] glm-5.2",
        },
        {
          id: "deepseek-v4-pro(openai)",
          label: "[Token Plan Personal] deepseek-v4-pro",
        },
        {
          id: "deepseek-v4-flash-0731(openai)",
          label: "[Token Plan Personal] deepseek-v4-flash-0731",
        },
      ],
      modelMetadata: {
        "qwen3.8-max(openai)": { contextLimit: 1_000_000 },
      },
    });

    expect(capabilities.models).toEqual([
      { id: QWEN_DEFAULT_MODEL_ID, label: "Qwen3.8 Max" },
      { id: "coder-model", label: "Coder Model" },
      { id: "qwen3.7-max", label: "Qwen3.7 Max" },
      { id: "qwen3.7-plus", label: "Qwen3.7 Plus" },
      { id: "qwen3.6-flash", label: "Qwen3.6 Flash" },
      { id: "glm-5.2", label: "GLM 5.2" },
      { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
      { id: "deepseek-v4-flash-0731", label: "DeepSeek V4 Flash 0731" },
    ]);
    expect(capabilities.subProviders).toEqual([
      {
        id: "alibaba-token-plan",
        label: "Alibaba Token Plan",
      },
      { id: "qwen-oauth", label: "Qwen OAuth" },
    ]);
    expect(capabilities.modelSubProvider).toEqual({
      [QWEN_DEFAULT_MODEL_ID]: "alibaba-token-plan",
      "coder-model": "qwen-oauth",
      "qwen3.7-max": "alibaba-token-plan",
      "qwen3.7-plus": "alibaba-token-plan",
      "qwen3.6-flash": "alibaba-token-plan",
      "glm-5.2": "alibaba-token-plan",
      "deepseek-v4-pro": "alibaba-token-plan",
      "deepseek-v4-flash-0731": "alibaba-token-plan",
    });
    expect(capabilities.modelContextSizes).toEqual({
      [QWEN_DEFAULT_MODEL_ID]: ["1M"],
    });
  });

  it("excludes the retired Qwen 3.8 preview model reported by older CLIs", () => {
    const capabilities = buildQwenProbeCapabilities({
      models: [
        { id: "qwen3.8-max-preview", label: "Qwen3.8 Max Preview" },
        { id: QWEN_DEFAULT_MODEL_ID, label: "Qwen3.8 Max" },
      ],
      modelMetadata: { "qwen3.8-max-preview": { contextLimit: 1_000_000 } },
      modelEfforts: { "qwen3.8-max-preview": ["high"] },
      modelDefaultEfforts: { "qwen3.8-max-preview": "high" },
    });

    expect(capabilities.models?.map((model) => model.id)).toEqual([QWEN_DEFAULT_MODEL_ID]);
    expect(capabilities.modelContextSizes).toBeUndefined();
    expect(capabilities.modelEfforts).toEqual({});
    expect(capabilities.modelDefaultEfforts).toBeUndefined();
  });

  it("normalizes provider suffixes in per-model effort and thinking maps", () => {
    const capabilities = buildQwenProbeCapabilities({
      models: [
        { id: "qwen3.8-max(openai)", label: "Qwen3.8 Max" },
        { id: "qwen3.7-plus(openai)", label: "Qwen3.7 Plus" },
      ],
      modelEfforts: {
        "qwen3.8-max(openai)": ["low", "medium", "xhigh"],
        "qwen3.7-plus(openai)": [],
      },
      modelDefaultEfforts: {
        "qwen3.8-max(openai)": "xhigh",
        "qwen3.7-plus(openai)": "default",
      },
      thinkingModels: ["qwen3.7-plus(openai)"],
    });

    expect(capabilities.modelEfforts).toEqual({
      "qwen3.8-max": ["low", "medium", "xhigh"],
      "qwen3.7-plus": [],
    });
    expect(capabilities.modelDefaultEfforts).toEqual({
      "qwen3.8-max": "xhigh",
      "qwen3.7-plus": "default",
    });
    expect(capabilities.thinkingModels).toEqual(["qwen3.7-plus"]);
  });

  it("keeps Agent and Plan modes when an authenticated ACP probe reports only Agent", () => {
    expect(buildQwenProbeCapabilities({ modes: ["agent"] }).modes).toEqual(["agent", "plan"]);
  });
});

describe("Qwen authentication detection", () => {
  it.each([
    "BAILIAN_CODING_PLAN_API_KEY",
    "BAILIAN_TOKEN_PLAN_API_KEY",
    "ALIBABA_CODING_PLAN_API_KEY",
  ])("recognizes the Alibaba plan variable %s", async (name) => {
    for (const key of QWEN_AUTH_ENV_KEYS) vi.stubEnv(key, "");
    vi.stubEnv(name, "coding-plan-key");

    await expect(
      qwenDetectionSpec.authProbes?.[0]?.({
        location: { kind: "windows", path: "C:\\demo" },
        executablePath: "qwen",
      }),
    ).resolves.toBe("authenticated");
  });
});

describe("detectQwenInvalidSessionRef", () => {
  it("detects Qwen resume failures", () => {
    expect(detectQwenInvalidSessionRef('No session found with ID "missing".')).toBe(true);
    expect(detectQwenInvalidSessionRef("Failed to resume session: missing")).toBe(true);
    expect(detectQwenInvalidSessionRef("Qwen Code ready")).toBe(false);
  });
});
