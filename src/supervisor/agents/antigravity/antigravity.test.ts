import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { McpServer, ProjectLocation, ThreadConfig } from "@/shared/contracts";
import { EXTRACTION_PROMPT } from "@/supervisor/contextExtractor";
import { createAntigravityAdapter, shouldUseAntigravityPrintPty } from ".";
import { buildAntigravityArgs } from "./argv";
import { ANTIGRAVITY_DEFAULT_MODEL_ID, antigravityDetectionSpec } from "./detection";
import {
  ANTIGRAVITY_KNOWN_MODEL_VARIANTS,
  buildAntigravityModelCapabilities,
  detectAntigravityLaunchDialect,
  parseAntigravityEffortsHelp,
  parseAntigravityModelVariantsOutput,
  parseAntigravityModelsOutput,
} from "./models";
import { detectAntigravityInvalidSessionRef } from "./session";
import {
  detectAntigravityStatusLineState,
  detectAntigravityTerminalStatus,
  syncAntigravityConfigFromTerminalState,
} from "./terminal";

describe("buildAntigravityArgs", () => {
  const config: ThreadConfig = { model: ANTIGRAVITY_DEFAULT_MODEL_ID };

  it("uses Gemini 3.5 Flash Medium by default", () => {
    const args = buildAntigravityArgs(config, "hello");

    expect(args).toEqual([
      "--model",
      "gemini-3.5-flash",
      "--effort",
      "medium",
      "--prompt-interactive",
      "hello",
    ]);
  });

  it("passes stable model slugs and efforts as separate agy 1.1.5 flags", () => {
    expect(
      buildAntigravityArgs({ model: ANTIGRAVITY_DEFAULT_MODEL_ID, effort: "High" }, "hello"),
    ).toEqual(["--model", "gemini-3.5-flash", "--effort", "high", "--prompt-interactive", "hello"]);

    expect(buildAntigravityArgs({ model: "Gemini 3.6 Flash", effort: "High" }, "hello")).toEqual([
      "--model",
      "gemini-3.6-flash",
      "--effort",
      "high",
      "--prompt-interactive",
      "hello",
    ]);
    expect(buildAntigravityArgs({ model: "Gemini 3.6 Flash" }, "hello")).toEqual([
      "--model",
      "gemini-3.6-flash",
      "--effort",
      "medium",
      "--prompt-interactive",
      "hello",
    ]);
    expect(buildAntigravityArgs({ model: "nova-code", effort: "Extra High" }, "hello")).toEqual([
      "--model",
      "nova-code",
      "--effort",
      "extra-high",
      "--prompt-interactive",
      "hello",
    ]);
    expect(buildAntigravityArgs({ model: "Gemini 3.6 Flash", effort: "Ultra" }, "hello")).toEqual([
      "--model",
      "gemini-3.6-flash",
      "--effort",
      "ultra",
      "--prompt-interactive",
      "hello",
    ]);
    expect(buildAntigravityArgs({ model: "Claude Opus 4.6", effort: "Thinking" }, "hello")).toEqual(
      ["--model", "claude-opus-4-6-thinking", "--prompt-interactive", "hello"],
    );
    expect(buildAntigravityArgs({ model: "future-reasoner", effort: "Thinking" }, "hello")).toEqual(
      ["--model", "future-reasoner", "--effort", "thinking", "--prompt-interactive", "hello"],
    );
  });

  it("maps legacy auto configs to Gemini 3.5 Flash Medium", () => {
    expect(buildAntigravityArgs({ model: "auto" }, "hello")).toEqual([
      "--model",
      "gemini-3.5-flash",
      "--effort",
      "medium",
      "--prompt-interactive",
      "hello",
    ]);
  });

  it("normalizes legacy display-string configs to the new flags", () => {
    expect(buildAntigravityArgs({ model: "Gemini 3.5 Flash (Low)" }, "hello")).toEqual([
      "--model",
      "gemini-3.5-flash",
      "--effort",
      "low",
      "--prompt-interactive",
      "hello",
    ]);
  });

  it("uses --conversation when resuming a known conversation", () => {
    expect(buildAntigravityArgs(config, "", "conversation-id")).toEqual([
      "--conversation",
      "conversation-id",
      "--model",
      "gemini-3.5-flash",
      "--effort",
      "medium",
    ]);
  });

  it("maps Poracode bypass and sandbox config to agy flags", () => {
    expect(
      buildAntigravityArgs({ ...config, approvalPolicy: "yolo", sandboxMode: "sandbox" }, ""),
    ).toEqual([
      "--model",
      "gemini-3.5-flash",
      "--effort",
      "medium",
      "--dangerously-skip-permissions",
      "--sandbox",
    ]);
  });

  it("maps the latest agy execution modes", () => {
    expect(buildAntigravityArgs({ ...config, mode: "plan" }, "")).toEqual([
      "--model",
      "gemini-3.5-flash",
      "--effort",
      "medium",
      "--mode",
      "plan",
    ]);
    expect(buildAntigravityArgs({ ...config, approvalPolicy: "accept-edits" }, "")).toEqual([
      "--model",
      "gemini-3.5-flash",
      "--effort",
      "medium",
      "--mode",
      "accept-edits",
    ]);
  });
});

describe("createAntigravityAdapter", () => {
  const project: ProjectLocation = {
    kind: "windows",
    path: "C:\\demo",
  };

  it("declares the real agy binary and permission override capability", () => {
    const adapter = createAntigravityAdapter();

    expect(adapter.kind).toBe("antigravity");
    expect(adapter.binary).toBe("agy");
    expect(adapter.update).toEqual({
      builtIn: { binary: "agy", args: ["update"] },
      latestVersionUrls: [
        "https://antigravity-cli-auto-updater-974169037036.us-central1.run.app/manifests/linux_amd64.json",
      ],
    });
    expect(adapter.capabilities.models).toEqual([
      { id: "Gemini 3.6 Flash", label: "Gemini 3.6 Flash", description: "Google DeepMind" },
      { id: "Gemini 3.5 Flash", label: "Gemini 3.5 Flash", description: "Google DeepMind" },
      { id: "Gemini 3.1 Pro", label: "Gemini 3.1 Pro", description: "Google DeepMind" },
      { id: "Claude Sonnet 4.6", label: "Claude Sonnet 4.6", description: "Anthropic" },
      { id: "Claude Opus 4.6", label: "Claude Opus 4.6", description: "Anthropic" },
      { id: "GPT-OSS 120B", label: "GPT-OSS 120B", description: "OpenAI" },
    ]);
    expect(adapter.capabilities.defaultEffort).toBe("Medium");
    expect(adapter.capabilities.modelEfforts).toEqual({
      "Gemini 3.6 Flash": ["Low", "Medium", "High"],
      "Gemini 3.5 Flash": ["Low", "Medium", "High"],
      "Gemini 3.1 Pro": ["Low", "High"],
      "Claude Sonnet 4.6": ["Thinking"],
      "Claude Opus 4.6": ["Thinking"],
      "GPT-OSS 120B": ["Medium"],
    });
    expect(adapter.capabilities.approvalPolicies.map((policy) => policy.id)).toEqual([
      "default",
      "accept-edits",
      "yolo",
    ]);
    expect(adapter.capabilities.modes).toEqual(["agent", "plan"]);
    expect(adapter.capabilities.defaultApprovalPolicy).toBe("yolo");
    expect(adapter.defaultOneShotModel).toBe(ANTIGRAVITY_DEFAULT_MODEL_ID);
  });

  it("advertises a terminal login method and bare-agy login command", async () => {
    // `agy` has no `agy login` subcommand — the bare binary is the login path.
    expect(antigravityDetectionSpec.loginCommand).toBe("agy");

    // executablePath undefined → probeAntigravityModels short-circuits without
    // spawning, but the login method must still be advertised so the Settings
    // UI renders the Login/Re-login button.
    const result = await antigravityDetectionSpec.capabilitiesProbe?.({
      location: project,
      executablePath: undefined,
    });
    expect(result?.authMethods).toEqual([
      { type: "terminal", id: "antigravity-login", name: "Antigravity login", args: [] },
    ]);
    // No non-interactive `agy logout` exists, so the spec must NOT advertise
    // logout — that would render a Logout button the UI cannot fulfill (the UI
    // then correctly shows "Re-login" when authenticated instead).
    expect(result?.authLogoutSupported).toBeUndefined();
  });

  it("wires no ACP auth/logout dispatch (agy is terminal-only, not ACP)", () => {
    const adapter = createAntigravityAdapter();

    expect(adapter.buildAcpAuthCommand).toBeUndefined();
    expect(adapter.buildAcpLogoutCommand).toBeUndefined();
  });

  it("builds agy launch, resume, and one-shot commands", () => {
    const adapter = createAntigravityAdapter();
    const config: ThreadConfig = { model: ANTIGRAVITY_DEFAULT_MODEL_ID };

    expect(adapter.buildLaunchArgv(project, config, "hi")).toMatchObject({
      binary: "agy",
      args: ["--model", "Gemini 3.5 Flash (Medium)", "--prompt-interactive", "hi"],
    });
    expect(
      adapter.buildResumeArgv(project, config, "next", {
        providerSessionId: "conversation-id",
        discoveredAt: "2026-05-20T00:00:00.000Z",
      }),
    ).toMatchObject({
      binary: "agy",
      args: [
        "--conversation",
        "conversation-id",
        "--model",
        "Gemini 3.5 Flash (Medium)",
        "--prompt-interactive",
        "next",
      ],
    });
    expect(
      adapter.buildOneShotCommand?.(ANTIGRAVITY_DEFAULT_MODEL_ID, undefined, "summarize"),
    ).toEqual({
      command: "agy",
      args: ["--model", "Gemini 3.5 Flash (Medium)", "-p", "summarize"],
      stdin: "",
      // Isolate the cwd so the one-shot's last_conversations.json[cwd] write
      // can't be mistaken for the real interactive session (see index.ts).
      isolateCwd: true,
      // Retain PTY compatibility with older installed agy versions.
      pty: true,
    });
    expect(adapter.buildOneShotCommand?.("Gemini 3.5 Flash", "Low", "summarize")).toEqual({
      command: "agy",
      args: ["--model", "Gemini 3.5 Flash (Low)", "-p", "summarize"],
      stdin: "",
      isolateCwd: true,
      pty: true,
    });
  });

  it("builds direct context extraction for a resumed conversation", () => {
    const adapter = createAntigravityAdapter();

    expect(
      adapter.buildContextExtractionCommand?.(
        {
          providerSessionId: "conversation-id",
          discoveredAt: "2026-05-20T00:00:00.000Z",
        },
        project,
        "Gemini 3.1 Pro (High)",
      ),
    ).toEqual({
      command: "agy",
      args: [
        "--conversation",
        "conversation-id",
        "--model",
        "Gemini 3.1 Pro (High)",
        "-p",
        EXTRACTION_PROMPT,
      ],
      stdin: "",
    });
  });

  it("does not project custom MCP servers into workspace config", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "antigravity-mcp-"));
    try {
      const location = { kind: "windows", path: projectDir } as ProjectLocation;
      const config: ThreadConfig = { model: ANTIGRAVITY_DEFAULT_MODEL_ID };
      const server = {
        id: "vercel",
        name: "Vercel",
        description: "",
        enabled: true,
        timeoutMs: 30_000,
        transport: { type: "http", url: "https://mcp.vercel.com", headers: {} },
      } satisfies McpServer;
      const adapter = createAntigravityAdapter();

      adapter.buildLaunchArgv(location, config, "", undefined, { mcpServers: [server] });
      adapter.buildResumeArgv(
        location,
        config,
        "",
        {
          providerSessionId: "conversation-id",
          discoveredAt: "2026-05-20T00:00:00.000Z",
        },
        { mcpServers: [server] },
      );

      expect(existsSync(join(projectDir, ".agents", "mcp_config.json"))).toBe(false);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("builds a subagent one-shot command with the headless permission bypass", () => {
    const adapter = createAntigravityAdapter();
    const cmd = adapter.buildSubagentOneShotCommand?.({
      model: ANTIGRAVITY_DEFAULT_MODEL_ID,
      effort: "High",
      prompt: "implement it",
      location: project,
    });
    expect(cmd).toEqual({
      command: "agy",
      args: [
        "--model",
        "Gemini 3.5 Flash (High)",
        "--dangerously-skip-permissions",
        "-p",
        "implement it",
      ],
      stdin: "",
      pty: true,
    });
    // A subagent child must NOT isolate the cwd — it works in the real repo.
    expect(cmd).not.toHaveProperty("isolateCwd");
  });
});

describe("Agy launch feature detection", () => {
  it("uses the probed 1.1.5 flag dialect instead of relying only on semver", () => {
    expect(
      detectAntigravityLaunchDialect(
        [
          "  --effort  Reasoning effort (low|medium|high)",
          "  --model   Model for the current CLI session",
          "  --print-timeout  Timeout for print mode wait",
        ].join("\n"),
        "gemini-3.6-flash-high\ngemini-3.6-flash-medium",
      ),
    ).toEqual({ separateModelEffort: true });

    expect(
      detectAntigravityLaunchDialect(
        "  --model  Model for the current CLI session",
        "Gemini 3.5 Flash (Medium)",
      ),
    ).toEqual({ separateModelEffort: false });
  });

  it("keeps PTY compatibility only for pre-1.1.1 or unknown versions", () => {
    expect(shouldUseAntigravityPrintPty(undefined)).toBe(true);
    expect(shouldUseAntigravityPrintPty("1.1.0")).toBe(true);
    expect(shouldUseAntigravityPrintPty("1.1.1")).toBe(false);
    expect(shouldUseAntigravityPrintPty("1.1.5")).toBe(false);
  });
});

describe("Agy terminal config synchronization", () => {
  const capabilities = {
    models: [
      { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
    ],
    modelEfforts: {
      "gemini-3.6-flash": ["Low", "Medium", "High"],
      "claude-sonnet-4-6": [],
    },
  };

  it("parses the built-in model, effort, and mode status segments", () => {
    expect(
      detectAntigravityStatusLineState("\t plan · Gemini 3.6 Flash · medium\r", capabilities),
    ).toEqual({ model: "gemini-3.6-flash", effort: "Medium", mode: "plan" });
    expect(
      detectAntigravityStatusLineState(" accept-edits · Gemini 3.6 Flash · low\r", capabilities),
    ).toEqual({ model: "gemini-3.6-flash", effort: "Low", mode: "accept-edits" });
    expect(detectAntigravityStatusLineState(" Gemini 3.6 Flash · high\r", capabilities)).toEqual({
      model: "gemini-3.6-flash",
      effort: "High",
      mode: "default",
    });
  });

  it("does not infer a mode from an ambiguous customized status line", () => {
    expect(
      detectAntigravityStatusLineState("main · Gemini 3.6 Flash · high", capabilities),
    ).toEqual({ model: "gemini-3.6-flash", effort: "High" });
  });

  it("adds config fields to corroborated terminal hints", () => {
    expect(
      detectAntigravityTerminalStatus("◇ Ready\n plan · Gemini 3.6 Flash · medium", capabilities),
    ).toMatchObject({
      status: "idle",
      model: "gemini-3.6-flash",
      effort: "Medium",
      planMode: true,
      approvalPolicy: "default",
    });
  });

  it("updates model, effort, and execution mode without acting on absent mode data", () => {
    expect(
      syncAntigravityConfigFromTerminalState(
        {
          config: {
            model: "gemini-3.6-flash",
            effort: "High",
            mode: "plan",
            approvalPolicy: "default",
          },
          previousStatus: "idle",
          previousAttention: "none",
          hint: {
            status: "idle",
            attention: "none",
            model: "gemini-3.6-flash",
            effort: "Low",
            planMode: false,
            approvalPolicy: "accept-edits",
          },
        },
        capabilities,
      ),
    ).toEqual({
      model: "gemini-3.6-flash",
      effort: "Low",
      mode: undefined,
      approvalPolicy: "accept-edits",
    });

    expect(
      syncAntigravityConfigFromTerminalState(
        {
          config: { model: "gemini-3.6-flash", effort: "High", mode: "plan" },
          previousStatus: "idle",
          previousAttention: "none",
          hint: { status: "idle", attention: "none", effort: "Medium" },
        },
        capabilities,
      ),
    ).toEqual({ model: "gemini-3.6-flash", effort: "Medium", mode: "plan" });
  });

  it("clears an incompatible effort when switching to a model without efforts", () => {
    expect(
      syncAntigravityConfigFromTerminalState(
        {
          config: { model: "gemini-3.6-flash", effort: "High" },
          previousStatus: "idle",
          previousAttention: "none",
          hint: {
            status: "idle",
            attention: "none",
            model: "claude-sonnet-4-6",
          },
        },
        capabilities,
      ),
    ).toEqual({ model: "claude-sonnet-4-6", effort: undefined });
  });
});

describe("parseAntigravityModelsOutput", () => {
  it("parses JSON model objects into variants", () => {
    expect(
      parseAntigravityModelVariantsOutput(
        JSON.stringify({
          models: [
            {
              id: "Gemini 3.5 Flash (Medium)",
              label: "Gemini 3.5 Flash (Medium)",
              provider: "Google",
            },
            { model: "Claude Sonnet 4.6 (Thinking)", displayName: "Claude Sonnet 4.6" },
          ],
        }),
      ),
    ).toEqual([
      {
        model: "Gemini 3.5 Flash",
        effort: "Medium",
        cliModel: "Gemini 3.5 Flash (Medium)",
        provider: "Google",
      },
      { model: "Claude Sonnet 4.6", effort: "Thinking", cliModel: "Claude Sonnet 4.6 (Thinking)" },
    ]);
  });

  it("parses legacy display-name model output into base models", () => {
    const raw = ANTIGRAVITY_KNOWN_MODEL_VARIANTS.map((variant) => variant.cliModel).join("\n");

    expect(parseAntigravityModelsOutput(raw)).toEqual([
      { id: "Gemini 3.6 Flash", label: "Gemini 3.6 Flash" },
      { id: "Gemini 3.5 Flash", label: "Gemini 3.5 Flash" },
      { id: "Gemini 3.1 Pro", label: "Gemini 3.1 Pro" },
      { id: "Claude Sonnet 4.6", label: "Claude Sonnet 4.6" },
      { id: "Claude Opus 4.6", label: "Claude Opus 4.6" },
      { id: "GPT-OSS 120B", label: "GPT-OSS 120B" },
    ]);

    expect(
      buildAntigravityModelCapabilities(parseAntigravityModelVariantsOutput(raw)).modelEfforts,
    ).toEqual({
      "Gemini 3.6 Flash": ["Low", "Medium", "High"],
      "Gemini 3.5 Flash": ["Low", "Medium", "High"],
      "Gemini 3.1 Pro": ["Low", "High"],
      "Claude Sonnet 4.6": ["Thinking"],
      "Claude Opus 4.6": ["Thinking"],
      "GPT-OSS 120B": ["Medium"],
    });
  });

  it("parses agy 1.1.5 slug model output into base models and efforts", () => {
    const raw = [
      "⠋ Fetching available models...\rgemini-3.6-flash-high     Gemini 3.6 Flash (High)",
      "gemini-3.6-flash-medium",
      "gemini-3.6-flash-low",
      "gemini-3.5-flash-medium",
      "gemini-3.5-flash-high",
      "gemini-3.5-flash-low",
      "gemini-3.1-pro-low",
      "gemini-3.1-pro-high",
      "claude-sonnet-4-6",
      "claude-opus-4-6-thinking",
      "gpt-oss-120b-medium",
    ].join("\n");

    const capabilities = buildAntigravityModelCapabilities(
      parseAntigravityModelVariantsOutput(raw),
    );

    expect(capabilities.models).toEqual([
      { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash", description: "Google DeepMind" },
      { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", description: "Google DeepMind" },
      { id: "gemini-3.1-pro", label: "Gemini 3.1 Pro", description: "Google DeepMind" },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", description: "Anthropic" },
      {
        id: "claude-opus-4-6-thinking",
        label: "Claude Opus 4.6",
        description: "Anthropic",
      },
      { id: "gpt-oss-120b", label: "GPT-OSS 120B", description: "OpenAI" },
    ]);
    expect(capabilities.modelEfforts).toEqual({
      "gemini-3.6-flash": ["Low", "Medium", "High"],
      "gemini-3.5-flash": ["Low", "Medium", "High"],
      "gemini-3.1-pro": ["Low", "High"],
      "claude-sonnet-4-6": [],
      "claude-opus-4-6-thinking": [],
      "gpt-oss-120b": ["Medium"],
    });
  });

  it("discovers unknown model families and effort names dynamically", () => {
    expect(
      parseAntigravityEffortsHelp(
        "  --effort  Reasoning effort for the current CLI session (balanced|extra-high)",
      ),
    ).toEqual(["balanced", "extra-high"]);

    const capabilities = buildAntigravityModelCapabilities(
      parseAntigravityModelVariantsOutput(
        [
          "nova-code-balanced",
          "nova-code-extra-high",
          "mistral-codestral-25-08",
          "future-model-ultra",
        ].join("\n"),
        ["balanced", "extra-high"],
      ),
    );

    expect(capabilities.models).toEqual([
      { id: "nova-code", label: "Nova Code" },
      { id: "mistral-codestral-25-08", label: "Mistral Codestral 25 08" },
      { id: "future-model-ultra", label: "Future Model Ultra" },
    ]);
    expect(capabilities.modelEfforts).toEqual({
      "nova-code": ["Balanced", "Extra High"],
      "mistral-codestral-25-08": [],
      "future-model-ultra": [],
    });
    expect(capabilities.defaultEffort).toBe("Balanced");
  });

  it("parses table model output", () => {
    expect(
      parseAntigravityModelsOutput(
        [
          "Available models:",
          "| id | label | provider |",
          "| --- | --- | --- |",
          "| Claude Opus 4.6 (Thinking) | Claude Opus 4.6 | Anthropic |",
        ].join("\n"),
      ),
    ).toEqual([{ id: "Claude Opus 4.6", label: "Claude Opus 4.6", description: "Anthropic" }]);
  });
});

describe("detectAntigravityTerminalStatus", () => {
  it("detects the signed-in agy idle prompt seen in the real TUI", () => {
    const text = [
      "      ▄▀▀▄        Antigravity CLI 1.0.0",
      "     ▀▀▀▀▀▀       user@example.com",
      "    ▀▀▀▀▀▀▀▀      Gemini 3.5 Flash (High)",
      "   ▄▀▀    ▀▀▄     ~/work/poracode",
      "",
      "────────────────────────────────────────────────────────────────────────────────",
      ">",
      "────────────────────────────────────────────────────────────────────────────────",
      "? for shortcuts                                          Gemini 3.5 Flash (High)",
    ].join("\n");

    expect(detectAntigravityTerminalStatus(text)).toEqual({
      status: "idle",
      attention: "none",
      corroborated: true,
    });
  });

  it("detects action-required prompts before idle fallbacks", () => {
    const result = detectAntigravityTerminalStatus("✋ Action Required\n>\n? for shortcuts");

    expect(result?.status).toBe("needs_reply");
    expect(result?.attention).toBe("needs_reply");
  });

  it("detects the visible agy braille loader as working", () => {
    expect(detectAntigravityTerminalStatus("⡿ Generating...")).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
  });

  it("returns null when no Antigravity prompt indicators are present", () => {
    expect(detectAntigravityTerminalStatus("random output")).toBeNull();
  });
});

describe("detectAntigravityInvalidSessionRef", () => {
  it("detects invalid conversation messages", () => {
    expect(detectAntigravityInvalidSessionRef("invalid conversation: missing")).toBe(true);
    expect(detectAntigravityInvalidSessionRef("conversation not found")).toBe(true);
  });

  it("ignores unrelated output", () => {
    expect(detectAntigravityInvalidSessionRef("Antigravity CLI ready")).toBe(false);
  });
});
