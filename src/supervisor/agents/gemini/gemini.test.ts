import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ProjectLocation, ThreadConfig } from "@/shared/contracts";
import type { OscTitle } from "@/shared/osc";
import { createGeminiAdapter } from ".";
import { buildGeminiArgs } from "./argv";
import { geminiIntentFor } from "./plugin/intentMap";
import { detectGeminiInvalidSessionRef } from "./session";
import { detectGeminiOscTitleStatus } from "./terminal";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("detectGeminiOscTitleStatus", () => {
  it("detects idle from ◇ Ready title bar indicator", () => {
    const text = "◇  Ready (my-project)";
    expect(detectGeminiOscTitleStatus(text)).toEqual({
      status: "idle",
      attention: "none",
      corroborated: true,
    });
  });

  it("detects working from ✦ Working title bar indicator", () => {
    const text = "✦  Working… (my-project)";
    expect(detectGeminiOscTitleStatus(text)).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
  });

  it("detects needs_reply from ✋ Action Required title bar indicator", () => {
    const text = "✋  Action Required (my-project)";
    const result = detectGeminiOscTitleStatus(text);
    expect(result?.status).toBe("needs_reply");
    expect(result?.attention).toBe("needs_reply");
  });

  it("returns null when no pattern matches", () => {
    expect(detectGeminiOscTitleStatus("Type your message or @path/to/file")).toBeNull();
    expect(detectGeminiOscTitleStatus("? for shortcuts")).toBeNull();
    expect(detectGeminiOscTitleStatus("⠋ Thinking... (esc to cancel, 2s)")).toBeNull();
  });
});

describe("createGeminiAdapter handleOscNotification", () => {
  const adapter = createGeminiAdapter();

  it("maps iTerm2 OSC 9;4 progress to working and idle", () => {
    expect(
      adapter.handleOscNotification?.({ code: 9, title: "", body: "4;3;0", payload: undefined }),
    ).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
    expect(
      adapter.handleOscNotification?.({ code: 9, title: "", body: "4;0;0", payload: undefined }),
    ).toEqual({
      status: "idle",
      attention: "none",
      corroborated: true,
    });
  });
});

describe("createGeminiAdapter handleOscTitle", () => {
  const adapter = createGeminiAdapter();
  const oscTitle = (text: string, code: 0 | 1 | 2 = 0): OscTitle => ({ code, text });

  it("does not parse stripped TUI text for status", () => {
    expect(adapter.detectTerminalStatus).toBeUndefined();
  });

  it("maps Gemini title-bar status to Poracode status", () => {
    expect(adapter.handleOscTitle?.(oscTitle("✦  Working… (lightcode)"))).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
    expect(adapter.handleOscTitle?.(oscTitle("◇  Ready (lightcode)"))).toEqual({
      status: "idle",
      attention: "none",
      corroborated: true,
    });
    expect(adapter.handleOscTitle?.(oscTitle("✋  Action Required (lightcode)"))).toEqual({
      status: "needs_reply",
      attention: "needs_reply",
      corroborated: true,
    });
  });
});

describe("buildGeminiArgs", () => {
  const config: ThreadConfig = { model: "gemini-2.5-pro" };

  it("emits --session-id when an assignedSessionId is provided", () => {
    const args = buildGeminiArgs(config, "hello", undefined, "abc-uuid");
    const sessionIdx = args.indexOf("--session-id");
    expect(sessionIdx).toBeGreaterThanOrEqual(0);
    expect(args[sessionIdx + 1]).toBe("abc-uuid");
    expect(args).not.toContain("--resume");
  });

  it("prefers --resume over --session-id when both are provided", () => {
    const args = buildGeminiArgs(config, "hello", "resume-uuid", "assigned-uuid");
    expect(args).toContain("--resume");
    expect(args).toContain("resume-uuid");
    expect(args).not.toContain("--session-id");
    expect(args).not.toContain("assigned-uuid");
  });

  it("omits both flags when neither is provided", () => {
    const args = buildGeminiArgs(config, "hello");
    expect(args).not.toContain("--resume");
    expect(args).not.toContain("--session-id");
  });
});

describe("createGeminiAdapter buildLaunchArgv", () => {
  const project: ProjectLocation = {
    kind: "windows",
    path: "C:\\demo",
  };
  const config: ThreadConfig = { model: "gemini-2.5-pro" };

  it("assigns a stable session UUID at launch and returns it as sessionRef", () => {
    const adapter = createGeminiAdapter();
    const argv = adapter.buildLaunchArgv(project, config, "hi");

    if (argv === undefined) throw new Error("expected argv");
    expect(argv.binary).toBe("gemini");

    const sessionIdx = argv.args.indexOf("--session-id");
    expect(sessionIdx).toBeGreaterThanOrEqual(0);
    const uuid = argv.args[sessionIdx + 1]!;
    expect(uuid).toMatch(UUID_RE);

    expect(argv.sessionRef?.providerSessionId).toBe(uuid);
  });

  it("uses --resume (not --session-id) on resume", () => {
    const adapter = createGeminiAdapter();
    const argv = adapter.buildResumeArgv(project, config, "hi", {
      providerSessionId: "11111111-1111-4111-8111-111111111111",
      discoveredAt: "2026-05-15T00:00:00.000Z",
    });

    if (argv === undefined) throw new Error("expected argv");
    expect(argv.args).toContain("--resume");
    expect(argv.args).toContain("11111111-1111-4111-8111-111111111111");
    expect(argv.args).not.toContain("--session-id");
  });

  it("carries custom MCP settings without depending on hook-plugin launch extras", () => {
    const baseDir = mkdtempSync(join(tmpdir(), "lightcode-gemini-mcp-"));
    const previousDataDir = process.env.LIGHTCODE_DATA_DIR;
    process.env.LIGHTCODE_DATA_DIR = baseDir;
    try {
      const adapter = createGeminiAdapter();
      const argv = adapter.buildLaunchArgv(project, config, "hi", undefined, {
        mcpServers: [
          {
            id: "memory-id",
            name: "memory",
            description: "",
            enabled: true,
            timeoutMs: 30_000,
            transport: { type: "stdio", command: "memory-server", args: [], env: {} },
          },
        ],
      });
      const settingsPath = argv.env?.GEMINI_CLI_SYSTEM_SETTINGS_PATH;

      expect(settingsPath).toMatch(/\.lightcode-thread-[0-9a-f-]+\.json$/u);
      expect(settingsPath).toContain(join(baseDir, "agent-plugins", "gemini"));
      expect(JSON.parse(readFileSync(settingsPath!, "utf8"))).toMatchObject({
        mcpServers: { memory: { command: "memory-server", timeout: 30_000 } },
      });
      argv.cleanup?.();
      expect(existsSync(settingsPath!)).toBe(false);
    } finally {
      if (previousDataDir === undefined) delete process.env.LIGHTCODE_DATA_DIR;
      else process.env.LIGHTCODE_DATA_DIR = previousDataDir;
      rmSync(baseDir, { recursive: true, force: true });
    }
  });
});

describe("detectGeminiInvalidSessionRef", () => {
  it("detects Gemini invalid resume session errors", () => {
    expect(
      detectGeminiInvalidSessionRef(
        'Error resuming session: Invalid session identifier "db8b5cb1-4cb6-46c1-abcb-71d35e18006a".',
      ),
    ).toBe(true);
  });

  it("ignores unrelated output", () => {
    expect(detectGeminiInvalidSessionRef("Loaded cached credentials.")).toBe(false);
  });
});

describe("geminiIntentFor", () => {
  it("maps the trimmed lifecycle hooks to universal intents", () => {
    expect(geminiIntentFor("SessionStart", undefined)).toBe("session.started");
    expect(geminiIntentFor("BeforeAgent", undefined)).toBe("session.turn_started");
    expect(geminiIntentFor("AfterAgent", undefined)).toBe("session.turn_finished");
  });

  it("ignores dropped redundant turn-open events", () => {
    expect(geminiIntentFor("BeforeModel", undefined)).toBeUndefined();
    expect(geminiIntentFor("BeforeTool", undefined)).toBeUndefined();
    expect(geminiIntentFor("AfterTool", undefined)).toBeUndefined();
  });

  it("maps only approval-style notifications to needs_approval", () => {
    expect(
      geminiIntentFor("Notification", {
        notification_type: "ToolPermission",
        message: "Allow tool?",
      }),
    ).toBe("session.needs_approval");
    expect(geminiIntentFor("Notification", { message: "FYI only" })).toBeUndefined();
  });
});

describe("createGeminiAdapter hook plugin support", () => {
  it("declares Gemini hook plugin metadata", () => {
    const adapter = createGeminiAdapter();

    expect(adapter.capabilities.presentationModes).toEqual(["terminal", "gui"]);
    expect(adapter.createStructuredSession).toBeTypeOf("function");
    expect(adapter.pluginId).toBe("lightcode-status@gemini");
    expect(adapter.pluginVersion).toBe("1.2.3");
    expect(adapter.minProtocolVersion).toBe(1);
  });

  it("allows hook-active terminal fallback only for Gemini attention prompts", () => {
    const adapter = createGeminiAdapter();

    expect(
      adapter.shouldApplyTerminalStatusWhileHookActive?.({
        status: "needs_reply",
        attention: "needs_reply",
      }),
    ).toBe(true);
    expect(
      adapter.shouldApplyTerminalStatusWhileHookActive?.({
        status: "working",
        attention: "working",
      }),
    ).toBe(false);
    expect(
      adapter.shouldApplyTerminalStatusWhileHookActive?.({
        status: "idle",
        attention: "none",
      }),
    ).toBe(false);
  });
});
