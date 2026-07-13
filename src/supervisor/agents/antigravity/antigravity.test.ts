import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { McpServer, ProjectLocation, ThreadConfig } from "@/shared/contracts";
import { createAntigravityAdapter } from ".";
import { buildAntigravityArgs } from "./argv";
import { ANTIGRAVITY_DEFAULT_MODEL_ID, antigravityDetectionSpec } from "./detection";
import {
  ANTIGRAVITY_KNOWN_MODEL_VARIANTS,
  buildAntigravityModelCapabilities,
  parseAntigravityModelVariantsOutput,
  parseAntigravityModelsOutput,
} from "./models";
import { detectAntigravityInvalidSessionRef } from "./session";
import { detectAntigravityTerminalStatus } from "./terminal";

describe("buildAntigravityArgs", () => {
  const config: ThreadConfig = { model: ANTIGRAVITY_DEFAULT_MODEL_ID };

  it("uses Gemini 3.5 Flash Medium by default", () => {
    const args = buildAntigravityArgs(config, "hello");

    expect(args).toEqual(["--model", "Gemini 3.5 Flash (Medium)", "--prompt-interactive", "hello"]);
  });

  it("composes selected efforts into exact agy model strings", () => {
    expect(
      buildAntigravityArgs({ model: ANTIGRAVITY_DEFAULT_MODEL_ID, effort: "High" }, "hello"),
    ).toEqual(["--model", "Gemini 3.5 Flash (High)", "--prompt-interactive", "hello"]);
  });

  it("maps legacy auto configs to Gemini 3.5 Flash Medium", () => {
    expect(buildAntigravityArgs({ model: "auto" }, "hello")).toEqual([
      "--model",
      "Gemini 3.5 Flash (Medium)",
      "--prompt-interactive",
      "hello",
    ]);
  });

  it("passes exact agy model display strings", () => {
    expect(buildAntigravityArgs({ model: "Gemini 3.5 Flash (Low)" }, "hello")).toEqual([
      "--model",
      "Gemini 3.5 Flash (Low)",
      "--prompt-interactive",
      "hello",
    ]);
  });

  it("uses --conversation when resuming a known conversation", () => {
    expect(buildAntigravityArgs(config, "", "conversation-id")).toEqual([
      "--conversation",
      "conversation-id",
      "--model",
      "Gemini 3.5 Flash (Medium)",
    ]);
  });

  it("maps Poracode bypass and sandbox config to agy flags", () => {
    expect(
      buildAntigravityArgs({ ...config, approvalPolicy: "yolo", sandboxMode: "sandbox" }, ""),
    ).toEqual([
      "--model",
      "Gemini 3.5 Flash (Medium)",
      "--dangerously-skip-permissions",
      "--sandbox",
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
      { id: "Gemini 3.5 Flash", label: "Gemini 3.5 Flash", description: "Google DeepMind" },
      { id: "Gemini 3.1 Pro", label: "Gemini 3.1 Pro", description: "Google DeepMind" },
      { id: "Claude Sonnet 4.6", label: "Claude Sonnet 4.6", description: "Anthropic" },
      { id: "Claude Opus 4.6", label: "Claude Opus 4.6", description: "Anthropic" },
      { id: "GPT-OSS 120B", label: "GPT-OSS 120B", description: "OpenAI" },
    ]);
    expect(adapter.capabilities.defaultEffort).toBe("Medium");
    expect(adapter.capabilities.modelEfforts).toEqual({
      "Gemini 3.5 Flash": ["Low", "Medium", "High"],
      "Gemini 3.1 Pro": ["Low", "High"],
      "Claude Sonnet 4.6": ["Thinking"],
      "Claude Opus 4.6": ["Thinking"],
      "GPT-OSS 120B": ["Medium"],
    });
    expect(adapter.capabilities.approvalPolicies.map((policy) => policy.id)).toEqual([
      "default",
      "yolo",
    ]);
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
      // agy print mode emits its answer only when attached to a terminal.
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

  it("builds a subagent one-shot command that runs in the project cwd (no isolateCwd)", () => {
    const adapter = createAntigravityAdapter();
    const cmd = adapter.buildSubagentOneShotCommand?.({
      model: ANTIGRAVITY_DEFAULT_MODEL_ID,
      effort: "High",
      prompt: "implement it",
      location: project,
    });
    expect(cmd).toEqual({
      command: "agy",
      args: ["--model", "Gemini 3.5 Flash (High)", "-p", "implement it"],
      stdin: "",
      pty: true,
    });
    // A subagent child must NOT isolate the cwd — it works in the real repo.
    expect(cmd).not.toHaveProperty("isolateCwd");
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

  it("parses agy 1.0.5 display-name model output into base models", () => {
    const raw = ANTIGRAVITY_KNOWN_MODEL_VARIANTS.map((variant) => variant.cliModel).join("\n");

    expect(parseAntigravityModelsOutput(raw)).toEqual([
      { id: "Gemini 3.5 Flash", label: "Gemini 3.5 Flash" },
      { id: "Gemini 3.1 Pro", label: "Gemini 3.1 Pro" },
      { id: "Claude Sonnet 4.6", label: "Claude Sonnet 4.6" },
      { id: "Claude Opus 4.6", label: "Claude Opus 4.6" },
      { id: "GPT-OSS 120B", label: "GPT-OSS 120B" },
    ]);

    expect(
      buildAntigravityModelCapabilities(parseAntigravityModelVariantsOutput(raw)).modelEfforts,
    ).toEqual({
      "Gemini 3.5 Flash": ["Low", "Medium", "High"],
      "Gemini 3.1 Pro": ["Low", "High"],
      "Claude Sonnet 4.6": ["Thinking"],
      "Claude Opus 4.6": ["Thinking"],
      "GPT-OSS 120B": ["Medium"],
    });
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
