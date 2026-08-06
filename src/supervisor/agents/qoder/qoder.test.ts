import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation, ThreadConfig } from "@/shared/contracts";
import { createQoderAdapter } from ".";
import { buildQoderArgs, QODER_DEFAULT_MODEL_ID } from "./argv";
import { buildQoderProbeCapabilities, QODER_AUTH_ENV_KEYS, qoderDetectionSpec } from "./detection";
import { detectQoderInvalidSessionRef } from "./session";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buildQoderArgs", () => {
  it("builds an interactive plan-mode launch with a preassigned session", () => {
    expect(
      buildQoderArgs(
        { model: QODER_DEFAULT_MODEL_ID, mode: "plan" },
        "hello",
        undefined,
        "session-id",
      ),
    ).toEqual([
      "--session-id",
      "session-id",
      "--model",
      QODER_DEFAULT_MODEL_ID,
      "--permission-mode",
      "plan",
      "--prompt-interactive",
      "hello",
    ]);
  });

  it.each([
    ["acceptEdits", "accept_edits"],
    ["auto_edit", "accept_edits"],
    ["auto", "auto"],
    ["dont_ask", "dont_ask"],
    ["default", "default"],
    ["never", "bypass_permissions"],
    ["bypassPermissions", "bypass_permissions"],
    [undefined, "default"],
  ] as const)("maps approval policy %s to %s", (approvalPolicy, expected) => {
    const config: ThreadConfig = {
      model: QODER_DEFAULT_MODEL_ID,
      ...(approvalPolicy ? { approvalPolicy } : {}),
    };
    const args = buildQoderArgs(config, "");
    expect(args.slice(-2)).toEqual(["--permission-mode", expected]);
  });

  it("passes the configured reasoning effort through", () => {
    const args = buildQoderArgs({ model: "ultimate", effort: "high" }, "");
    expect(args).toContain("--reasoning-effort");
    expect(args[args.indexOf("--reasoning-effort") + 1]).toBe("high");
  });
});

describe("createQoderAdapter", () => {
  const project: ProjectLocation = { kind: "windows", path: "C:\\demo" };
  const config: ThreadConfig = { model: QODER_DEFAULT_MODEL_ID };

  it("preassigns a stable session ID and resumes that exact ID", () => {
    const adapter = createQoderAdapter();
    const launch = adapter.buildLaunchArgv(project, config, "hello");
    const sessionIndex = launch.args.indexOf("--session-id");
    const sessionId = launch.args[sessionIndex + 1];

    expect(launch.binary).toBe("qodercli");
    expect(sessionId).toMatch(UUID_RE);
    expect(launch.sessionRef?.providerSessionId).toBe(sessionId);

    const resume = adapter.buildResumeArgv(project, config, "again", launch.sessionRef!);
    expect(resume.args).toContain("--resume");
    expect(resume.args).toContain(sessionId);
    expect(resume.args).not.toContain("--session-id");
  });

  it("exposes terminal and ACP runtimes, updater metadata, and Qoder skill roots", () => {
    const adapter = createQoderAdapter();
    expect(adapter.capabilities.modes).toEqual(["agent", "plan"]);
    expect(adapter.capabilities.defaultApprovalPolicy).toBe("bypassPermissions");
    expect(adapter.capabilities.bypassPermissions).toEqual({
      approvalPolicy: "bypassPermissions",
    });
    expect(adapter.capabilities.presentationModes).toEqual(["terminal", "gui"]);
    expect(adapter.capabilities.mcpScope).toEqual({ terminal: "none", gui: "launch" });
    expect(adapter.createStructuredSession).toBeTypeOf("function");
    expect(adapter.update).toEqual({
      builtIn: { binary: "qodercli", args: ["update"] },
      npm: "@qoder-ai/qodercli",
    });
    expect(adapter.skillSupport).toMatchObject({
      roots: [
        { id: "qoder", globalPath: ".qoder/skills", projectPath: ".qoder/skills" },
        { id: "agents", globalPath: ".agents/skills", projectPath: ".agents/skills" },
      ],
      invocation: "slash",
      precedence: {
        global: ["qoder", "agents"],
        project: ["qoder", "agents"],
      },
    });
  });

  it("uses read-only plan mode for one-shot utility prompts", () => {
    expect(createQoderAdapter().buildOneShotCommand?.("", "", "title")).toEqual({
      command: "qodercli",
      args: ["-p", "title", "--model", QODER_DEFAULT_MODEL_ID, "--permission-mode", "plan"],
      stdin: "",
    });
  });
});

describe("buildQoderProbeCapabilities", () => {
  it("overlays probed models, efforts, modes, policies, and slash commands", () => {
    const capabilities = buildQoderProbeCapabilities({
      models: [
        { id: "auto", label: "Auto (default)" },
        { id: "ultimate", label: "Ultimate" },
      ],
      efforts: ["xhigh", "high", "low", "max", "medium", "none"],
      defaultEffort: "xhigh",
      modes: ["agent", "plan"],
      approvalPolicies: [
        { id: "default", label: "Default" },
        { id: "acceptEdits", label: "Accept Edits" },
        { id: "bypassPermissions", label: "Bypass Permissions" },
      ],
      slashCommands: [{ id: "quest", label: "quest — workflow orchestrator" }],
    });

    expect(capabilities.models?.map((model) => model.id)).toEqual(["auto", "ultimate"]);
    expect(capabilities.efforts).toEqual(["xhigh", "high", "low", "max", "medium", "none"]);
    expect(capabilities.defaultEffort).toBe("xhigh");
    expect(capabilities.modes).toEqual(["agent", "plan"]);
    expect(capabilities.approvalPolicies).toHaveLength(3);
    expect(capabilities.defaultApprovalPolicy).toBe("bypassPermissions");
    expect(capabilities.slashCommands).toHaveLength(1);
    expect(capabilities.preferTerminalLogin).toBe(true);
  });

  it("keeps static defaults and never forwards a session-derived auth state", () => {
    const capabilities = buildQoderProbeCapabilities({
      authState: "authenticated",
    });

    expect(capabilities.models).toEqual(qoderDetectionSpec.capabilities.models);
    expect(capabilities.efforts).toEqual(qoderDetectionSpec.capabilities.efforts);
    expect(capabilities.approvalPolicies).toEqual(qoderDetectionSpec.capabilities.approvalPolicies);
    expect(capabilities.authState).toBeUndefined();
  });
});

describe("Qoder authentication detection", () => {
  it("recognizes the personal access token variable", async () => {
    vi.stubEnv("QODER_PERSONAL_ACCESS_TOKEN", "qoder-token");

    await expect(
      qoderDetectionSpec.authProbes?.[0]?.({
        location: { kind: "windows", path: "C:\\demo" },
        executablePath: "qodercli",
      }),
    ).resolves.toBe("authenticated");
  });

  it("does not treat unrelated Qwen env keys as Qoder auth", async () => {
    for (const key of QODER_AUTH_ENV_KEYS) vi.stubEnv(key, "");
    vi.stubEnv("DASHSCOPE_API_KEY", "dashscope-key");

    await expect(
      qoderDetectionSpec.authProbes?.[0]?.({
        location: { kind: "windows", path: "C:\\demo" },
        executablePath: "qodercli",
      }),
    ).resolves.toBe("unknown");
  });
});

describe("buildQoderArgs edge cases", () => {
  it("omits --prompt-interactive for whitespace-only prompts", () => {
    const args = buildQoderArgs({ model: "auto" }, "   ");
    expect(args).not.toContain("--prompt-interactive");
  });

  it("omits --prompt-interactive for empty prompts", () => {
    const args = buildQoderArgs({ model: "auto" }, "");
    expect(args).not.toContain("--prompt-interactive");
  });

  it("prefers --resume over --session-id when both are provided", () => {
    const args = buildQoderArgs({ model: "auto" }, "hi", "resume-id", "assigned-id");
    expect(args).toContain("--resume");
    expect(args).toContain("resume-id");
    expect(args).not.toContain("--session-id");
    expect(args).not.toContain("assigned-id");
  });

  it("falls back to the default model when config.model is empty", () => {
    const args = buildQoderArgs({ model: "" }, "hi");
    const modelIndex = args.indexOf("--model");
    expect(args[modelIndex + 1]).toBe(QODER_DEFAULT_MODEL_ID);
  });

  it("maps the yolo alias to bypass_permissions", () => {
    const args = buildQoderArgs({ model: "auto", approvalPolicy: "yolo" }, "");
    expect(args.slice(-2)).toEqual(["--permission-mode", "bypass_permissions"]);
  });

  it("maps the auto-edit hyphenated alias to accept_edits", () => {
    const args = buildQoderArgs({ model: "auto", approvalPolicy: "auto-edit" }, "");
    expect(args.slice(-2)).toEqual(["--permission-mode", "accept_edits"]);
  });

  it("omits --reasoning-effort when effort is undefined", () => {
    const args = buildQoderArgs({ model: "auto" }, "");
    expect(args).not.toContain("--reasoning-effort");
  });
});

describe("detectQoderInvalidSessionRef", () => {
  it("detects Qoder resume failures", () => {
    expect(detectQoderInvalidSessionRef('Invalid session identifier "missing".')).toBe(true);
    expect(detectQoderInvalidSessionRef("Error resuming session: missing")).toBe(true);
    expect(detectQoderInvalidSessionRef("Qoder ready")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(detectQoderInvalidSessionRef("INVALID SESSION IDENTIFIER")).toBe(true);
    expect(detectQoderInvalidSessionRef("error resuming session")).toBe(true);
  });

  it("detects the error embedded in longer output", () => {
    expect(
      detectQoderInvalidSessionRef("Loading config...\nError resuming session: abc-123\nExiting."),
    ).toBe(true);
  });

  it("does not false-positive on partial matches", () => {
    expect(detectQoderInvalidSessionRef("Invalid session")).toBe(false);
    expect(detectQoderInvalidSessionRef("Error resuming")).toBe(false);
    expect(detectQoderInvalidSessionRef("session identifier")).toBe(false);
  });
});
