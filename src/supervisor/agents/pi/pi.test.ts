import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation, ThreadConfig } from "@/shared/contracts";
import { resolveModelSelection, resolveReasoningSelection } from "@/shared/agentSelection";
import { batchWslCommandsAsync, createKnownSessionRef, readAgentCommandOutput } from "../base";
import { buildPiArgs, buildPiOneShotArgs, PI_THINKING_LEVELS, splitPiModelId } from "./argv";
import {
  humanizePiModelId,
  parsePiModelList,
  piDefaultCapabilities,
  piDetectionSpec,
} from "./detection";
import { createPiAdapter } from "./index";

vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
  readFile: vi.fn<typeof readFile>(),
}));

vi.mock("../base", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../base")>()),
  readAgentCommandOutput: vi.fn<typeof readAgentCommandOutput>(),
  batchWslCommandsAsync: vi.fn<typeof batchWslCommandsAsync>(),
}));

const location = { kind: "posix", path: "/tmp/pi-project" } as ProjectLocation;

describe("Pi provider metadata", () => {
  const adapter = createPiAdapter();

  it("declares terminal and native SDK chat without inventing plan or permission modes", () => {
    expect(adapter).toMatchObject({ kind: "pi", label: "Pi", binary: "pi" });
    expect(adapter.capabilities).toMatchObject({
      presentationMode: "terminal",
      presentationModes: ["terminal", "gui"],
      modes: [],
      approvalPolicies: [],
      supportsResume: true,
      supportsOneShot: true,
      mcpScope: { terminal: "launch", gui: "launch" },
    });
    expect(typeof adapter.createStructuredSession).toBe("function");
  });

  it("uses Pi and shared Agent Skills roots with Pi's native invocation", () => {
    expect(adapter.skillSupport).toEqual({
      roots: [
        {
          id: "pi",
          label: "Pi",
          globalPath: ".pi/agent/skills",
          projectPath: ".pi/skills",
          globalOverride: { env: "PI_CODING_AGENT_DIR", path: "skills" },
        },
        {
          id: "agents",
          label: "Shared agent skills",
          globalPath: ".agents/skills",
          projectPath: ".agents/skills",
        },
      ],
      invocation: "skill",
      precedence: { global: ["pi", "agents"], project: ["pi", "agents"] },
    });
  });

  it("wires the official self updater and package fallback", () => {
    expect(adapter.update).toMatchObject({
      builtIn: { binary: "pi", args: ["update", "self"] },
      npm: "@earendil-works/pi-coding-agent",
    });
    expect(piDetectionSpec.loginCommand).toBe("pi");
  });
});

describe("Pi CLI argv", () => {
  it("passes model and every supported thinking effort to interactive Pi", () => {
    expect(
      buildPiArgs(
        { model: "anthropic/claude-sonnet-4-5", effort: "max" } as ThreadConfig,
        "inspect this",
      ),
    ).toEqual([
      "--approve",
      "--model",
      "anthropic/claude-sonnet-4-5",
      "--thinking",
      "max",
      "inspect this",
    ]);
  });

  it("resumes the exact Pi session id", async () => {
    const adapter = createPiAdapter();
    expect(
      (
        await adapter.buildResumeArgv(
          location,
          { model: "openai/gpt-5-mini", effort: "low" } as ThreadConfig,
          "continue",
          createKnownSessionRef("0198-session"),
        )
      ).args,
    ).toEqual([
      "--approve",
      "--session",
      "0198-session",
      "--model",
      "openai/gpt-5-mini",
      "--thinking",
      "low",
      "continue",
    ]);
  });

  it("builds an ephemeral print-mode command for utility and subagent runs", () => {
    expect(
      buildPiOneShotArgs({ model: "google/gemini-2.5-flash", effort: "minimal" }, "reply OK", {
        textOnly: true,
      }),
    ).toEqual([
      "--approve",
      "--model",
      "google/gemini-2.5-flash",
      "--thinking",
      "minimal",
      "--no-session",
      "--no-tools",
      "--no-extensions",
      "--no-skills",
      "--no-prompt-templates",
      "--no-context-files",
      "-p",
      "reply OK",
    ]);
  });

  it("formats attachments with Pi's documented @path syntax", () => {
    const formatted = createPiAdapter().formatPromptSegments?.([
      { kind: "text", content: "Review these" },
      { kind: "attachment", path: "/tmp/a.png", mimeType: "image/png" },
      { kind: "attachment", path: "/tmp/spec.md" },
    ]);
    expect(formatted).toBe("Review these\n\n@/tmp/a.png @/tmp/spec.md");
  });

  it("splits fully qualified model ids without truncating nested ids", () => {
    expect(splitPiModelId("openrouter/anthropic/claude-sonnet")).toEqual({
      provider: "openrouter",
      modelId: "anthropic/claude-sonnet",
    });
    expect(splitPiModelId("sonnet")).toBeUndefined();
  });
});

describe("Pi terminal behavior", () => {
  const adapter = createPiAdapter();

  it("submits direct input after Pi's paste guard window", () => {
    expect(adapter.buildDirectInput?.("hello")).toEqual(["hello", "@wait:150", "\r"]);
  });

  it("recognizes Pi working and idle output", () => {
    expect(adapter.detectTerminalStatus?.("Thinking… esc to abort")?.status).toBe("working");
    expect(adapter.detectTerminalStatus?.("12,400 tokens | $0.02")?.status).toBe("idle");
  });
});

describe("Pi capability defaults", () => {
  it("keeps model and effort discovery dynamic", () => {
    expect(piDefaultCapabilities.models).toEqual([]);
    expect(piDefaultCapabilities.efforts).toEqual([]);
    expect(piDefaultCapabilities.modelEfforts).toEqual({});
  });

  it("starts reasoning models thinking instead of at their leading off tier", () => {
    const capabilities = {
      ...piDefaultCapabilities,
      models: [
        { id: "a/reasoning", label: "Reasoning" },
        { id: "a/plain", label: "Plain" },
      ],
      modelEfforts: {
        "a/reasoning": ["off", "minimal", "low", "medium", "high", "xhigh", "max"],
        "a/plain": ["off"],
      },
    };
    expect(resolveReasoningSelection(capabilities, "a/reasoning")).toBe("medium");
    expect(resolveReasoningSelection(capabilities, "a/plain")).toBe("off");
  });

  it("parses Pi's native model table for WSL terminal discovery", () => {
    expect(
      parsePiModelList(`provider  model             context  max-out  thinking  images
anthropic  claude-sonnet-4  200K     64K      yes       yes
openai     gpt-4.1-mini      1M       32K      no        yes`),
    ).toEqual([
      { id: "anthropic/claude-sonnet-4", reasoning: true },
      { id: "openai/gpt-4.1-mini", reasoning: false },
    ]);
  });

  it("beautifies probed model ids into picker labels", () => {
    expect(humanizePiModelId("anthropic/claude-sonnet-4-5")).toBe("Sonnet 4.5");
    expect(humanizePiModelId("anthropic/claude-sonnet-4-5-20250929")).toBe("Sonnet 4.5 (20250929)");
    expect(humanizePiModelId("openai/gpt-5.4-mini")).toBe("GPT-5.4 Mini");
    expect(humanizePiModelId("openai-codex/gpt-5.3-codex-spark")).toBe("Codex 5.3 Spark");
    expect(humanizePiModelId("openai/gpt-5.6-luna")).toBe("GPT-5.6 Luna");
    expect(humanizePiModelId("google/gemini-3-pro")).toBe("Gemini 3 Pro");
    expect(humanizePiModelId("openrouter/anthropic/claude-sonnet-4-5")).toBe("Sonnet 4.5");
    expect(humanizePiModelId("xai/grok-code-fast-1")).toBe("Grok Code Fast 1");
  });
});

describe("Pi scoped model discovery", () => {
  const cliTable = `provider  model             context  max-out  thinking  images
anthropic  claude-sonnet-4  200K     64K      yes       yes
openai     gpt-4.1-mini      1M       32K      no        yes`;
  const scopedModel = "opencode-go/deepseek-v4.1-flash";

  beforeEach(() => {
    vi.stubEnv("PI_CODING_AGENT_DIR", join(process.cwd(), "tmp", "pi-scoped-settings"));
    vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));
    vi.mocked(readAgentCommandOutput).mockResolvedValue({ ok: true, stdout: cliTable, stderr: "" });
    vi.mocked(batchWslCommandsAsync).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(["windows", "posix"] as const)(
    "loads exact scoped models immediately on %s without starting a catalogue probe",
    async (kind) => {
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          enabledModels: ["openai/gpt-4.1-mini", scopedModel, scopedModel],
          defaultProvider: "opencode-go",
          defaultModel: "deepseek-v4.1-flash",
        }),
      );
      vi.mocked(readAgentCommandOutput).mockImplementation(() => new Promise(() => {}));

      const result = await piDetectionSpec.capabilitiesProbe!({
        location: { kind, path: "/project" },
        executablePath: "pi",
      });

      expect(result?.models?.map((model) => model.id)).toEqual([
        scopedModel,
        "openai/gpt-4.1-mini",
      ]);
      expect(resolveModelSelection({ ...piDefaultCapabilities, ...result })).toBe(scopedModel);
      expect(result?.modelEfforts?.[scopedModel]).toEqual(PI_THINKING_LEVELS);
      expect(result?.authState).toBeUndefined();
      expect(readFile).toHaveBeenCalledWith(
        join(process.env.PI_CODING_AGENT_DIR!, "settings.json"),
        { encoding: "utf8", signal: undefined },
      );
      expect(readAgentCommandOutput).not.toHaveBeenCalled();
    },
  );

  it("reads WSL settings in the distro with its own agent directory override", async () => {
    const signal = new AbortController().signal;
    vi.mocked(batchWslCommandsAsync).mockResolvedValue([
      { ok: true, stdout: JSON.stringify({ enabledModels: [scopedModel] }) },
    ]);
    const result = await piDetectionSpec.capabilitiesProbe!({
      location: {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/project",
        uncPath: "\\\\wsl$\\Ubuntu\\project",
      },
      executablePath: "/usr/bin/pi",
      signal,
    });
    expect(result?.models?.map((model) => model.id)).toEqual([scopedModel]);
    expect(result?.presentationModes).toEqual(["terminal"]);
    expect(batchWslCommandsAsync).toHaveBeenCalledWith(
      "Ubuntu",
      ['cat "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/settings.json"'],
      signal,
    );
    expect(readFile).not.toHaveBeenCalled();
    expect(readAgentCommandOutput).not.toHaveBeenCalled();
  });

  it("keeps nested and colon model IDs, skips non-exact entries, and includes a missing default", async () => {
    vi.mocked(readFile).mockResolvedValue(
      `\uFEFF${JSON.stringify({
        enabledModels: [
          "openrouter/anthropic/claude-sonnet-4-5",
          "openrouter/qwen/qwen3:free",
          "*sonnet*",
          "openai/*",
          "sonnet",
          42,
        ],
        defaultProvider: "opencode-go",
        defaultModel: "deepseek-v4.1-flash",
      })}`,
    );
    const result = await piDetectionSpec.capabilitiesProbe!({ location, executablePath: "pi" });
    expect(result?.models?.map((model) => model.id)).toEqual([
      scopedModel,
      "openrouter/anthropic/claude-sonnet-4-5",
      "openrouter/qwen/qwen3:free",
    ]);
    expect(readAgentCommandOutput).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    "{",
    "[]",
    "null",
    "{}",
    '{"enabledModels": []}',
    '{"enabledModels": "bad"}',
  ])("falls back to CLI discovery for unusable settings %s", async (settings) => {
    if (settings !== undefined) vi.mocked(readFile).mockResolvedValue(settings);
    const signal = new AbortController().signal;
    const result = await piDetectionSpec.capabilitiesProbe!({
      location,
      executablePath: "pi",
      signal,
    });
    expect(result?.models?.map((model) => model.id)).toEqual([
      "anthropic/claude-sonnet-4",
      "openai/gpt-4.1-mini",
    ]);
    expect(result?.modelEfforts?.["openai/gpt-4.1-mini"]).toEqual(["off"]);
    expect(result?.authState).toBe("authenticated");
    expect(readAgentCommandOutput).toHaveBeenCalledWith(location, "pi", ["--list-models"], {
      timeoutMs: 15_000,
      signal,
    });
  });

  it("keeps the configured default when CLI discovery times out", async () => {
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({
        defaultProvider: "opencode-go",
        defaultModel: "deepseek-v4.1-flash",
      }),
    );
    vi.mocked(readAgentCommandOutput).mockResolvedValue({
      ok: false,
      stdout: "",
      stderr: "timeout",
    });
    const result = await piDetectionSpec.capabilitiesProbe!({ location, executablePath: "pi" });
    expect(result?.models?.map((model) => model.id)).toEqual([scopedModel]);
    expect(result?.authState).toBeUndefined();
  });

  it("propagates cancellation instead of falling back to CLI discovery", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      piDetectionSpec.capabilitiesProbe!({
        location,
        executablePath: "pi",
        signal: controller.signal,
      }),
    ).rejects.toThrow("This operation was aborted");
    expect(readAgentCommandOutput).not.toHaveBeenCalled();
  });
});
