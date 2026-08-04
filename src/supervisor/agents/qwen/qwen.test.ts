import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation, ThreadConfig } from "@/shared/contracts";
import { createQwenAdapter } from ".";
import { buildQwenArgs, QWEN_DEFAULT_MODEL_ID } from "./argv";
import { buildQwenProbeCapabilities, QWEN_AUTH_ENV_KEYS, qwenDetectionSpec } from "./detection";
import { detectQwenInvalidSessionRef } from "./session";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

afterEach(() => {
  vi.unstubAllEnvs();
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

describe("buildQwenProbeCapabilities", () => {
  it("maps ACP models, context limits, and auth state", () => {
    const capabilities = buildQwenProbeCapabilities({
      models: [
        { id: "coder-model", label: "coder-model" },
        { id: QWEN_DEFAULT_MODEL_ID, label: "Qwen3.8 Max Preview" },
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
          id: "qwen3.8-max-preview(openai)",
          label: "[ModelStudio Coding Plan for Global/Intl] qwen3.8-max-preview",
        },
        {
          id: "glm-5.2(openai)",
          label: "[ModelStudio Coding Plan for Global/Intl] glm-5.2",
        },
        {
          id: "deepseek-v4-pro(openai)",
          label: "[ModelStudio Coding Plan for Global/Intl] deepseek-v4-pro",
        },
      ],
      modelMetadata: {
        "qwen3.8-max-preview(openai)": { contextLimit: 1_000_000 },
      },
    });

    expect(capabilities.models).toEqual([
      { id: QWEN_DEFAULT_MODEL_ID, label: "Qwen3.8 Max Preview" },
      { id: "coder-model", label: "Coder Model" },
      { id: "glm-5.2", label: "GLM 5.2" },
      { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
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
      "glm-5.2": "alibaba-token-plan",
      "deepseek-v4-pro": "alibaba-token-plan",
    });
    expect(capabilities.modelContextSizes).toEqual({
      [QWEN_DEFAULT_MODEL_ID]: ["1M"],
    });
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
