import { describe, expect, it } from "vitest";
import type { ProjectLocation, ThreadConfig } from "@/shared/contracts";
import { createGeminiAdapter } from ".";
import { buildGeminiArgs } from "./argv";
import { geminiIntentFor } from "./plugin/intentMap";
import { detectGeminiInvalidSessionRef } from "./session";
import { detectGeminiTerminalStatus } from "./terminal";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("detectGeminiTerminalStatus", () => {
  it("detects idle from ◇ Ready title bar indicator", () => {
    const text = "0;◇  Ready (my-project)";
    expect(detectGeminiTerminalStatus(text)).toEqual({
      status: "idle",
      attention: "none",
      corroborated: true,
    });
  });

  it("detects working from ✦ Working title bar indicator", () => {
    const text = "0;✦  Working… (my-project)";
    expect(detectGeminiTerminalStatus(text)).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
  });

  it("detects needs_reply from ✋ Action Required title bar indicator", () => {
    const text = "0;✋  Action Required (my-project)";
    const result = detectGeminiTerminalStatus(text);
    expect(result?.status).toBe("needs_reply");
    expect(result?.attention).toBe("needs_reply");
  });

  it("detects needs_reply from Enter to select footer", () => {
    const text = "Enter to select · ↑/↓ to navigate · Esc to cancel";
    const result = detectGeminiTerminalStatus(text);
    expect(result?.status).toBe("needs_reply");
    expect(result?.attention).toBe("needs_reply");
  });

  it("detects working from esc-to-cancel prompt", () => {
    const text = "⠋ Thinking about your request... (esc to cancel, 2s)";
    expect(detectGeminiTerminalStatus(text)).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
  });

  it("ignores stale spinner without esc-to-cancel context", () => {
    const text = "⠋ Resuming session...\n>   Type your message or @path/to/file";
    expect(detectGeminiTerminalStatus(text)).toEqual({
      status: "idle",
      attention: "none",
      corroborated: false,
    });
  });

  it("detects approval prompt from [y/n] pattern", () => {
    const text = "Allow gemini to write to file.ts? [y/n]";
    expect(detectGeminiTerminalStatus(text)).toEqual({
      status: "needs_approval",
      attention: "needs_approval",
      corroborated: true,
    });
  });

  it("returns null when no pattern matches", () => {
    expect(detectGeminiTerminalStatus("random text with no indicators")).toBeNull();
  });

  it("Ready wins over earlier Working when closer to end", () => {
    const text = "0;✦  Working… (my-project)\nsome output\n0;◇  Ready (my-project)";
    expect(detectGeminiTerminalStatus(text)?.status).toBe("idle");
  });

  it("Action Required wins over Working when closer to end", () => {
    const text = "0;✦  Working… (my-project)\nsome output\n0;✋  Action Required (my-project)";
    expect(detectGeminiTerminalStatus(text)?.status).toBe("needs_reply");
  });

  it("keeps working when the input prompt is still visible below the spinner", () => {
    const text = [
      "0;✦  Working… (my-project)",
      "⠋ Thinking... Moving Towards the Goal (esc to cancel, 4s)",
      ">   Type your message or @path/to/file",
      "? for shortcuts",
    ].join("\n");

    expect(detectGeminiTerminalStatus(text)).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
  });

  it("returns to idle when Ready appears after earlier working output", () => {
    const text = [
      "⠋ Thinking... Moving Towards the Goal (esc to cancel, 4s)",
      ">   Type your message or @path/to/file",
      "0;◇  Ready (my-project)",
      ">   Type your message or @path/to/file",
    ].join("\n");

    expect(detectGeminiTerminalStatus(text)).toEqual({
      status: "idle",
      attention: "none",
      corroborated: true,
    });
  });

  it("keeps working when spinner is present but no title bar signal exists", () => {
    const text = [
      "⠋ This is taking a bit longer, we're still on it. (esc to cancel, 2m 13s)",
      ">   Type your message or @path/to/file",
      "? for shortcuts",
    ].join("\n");

    expect(detectGeminiTerminalStatus(text)).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
  });

  it("still uses the input prompt as an idle fallback when no stronger signal exists", () => {
    const text = ">   Type your message or @path/to/file";
    expect(detectGeminiTerminalStatus(text)).toEqual({
      status: "idle",
      attention: "none",
      corroborated: false,
    });
  });

  it("ignores stale working output deep in history when only the idle prompt remains in the tail", () => {
    const text = [
      "0;✦  Working… (my-project)",
      "x".repeat(1500),
      ">   Type your message or @path/to/file",
    ].join("\n");

    expect(detectGeminiTerminalStatus(text)).toEqual({
      status: "idle",
      attention: "none",
      corroborated: false,
    });
  });

  it("detects needs_reply from Action Required with numbered options", () => {
    const text = [
      "Which modules would you like to update?",
      "",
      "● 1.  All npm modules",
      "  2.  Specific packages",
      "  3.  Other",
      "",
      "Enter to select · ↑/↓ to navigate · Esc to cancel",
      "",
      "0;✋  Action Required (my-project)",
    ].join("\n");

    const result = detectGeminiTerminalStatus(text);
    expect(result?.status).toBe("needs_reply");
    expect(result?.attention).toBe("needs_reply");
  });

  it("detects needs_reply from plan approval with Action Required", () => {
    const text = [
      "Ready to start implementation?",
      "",
      "● 1.  Yes, automatically accept edits",
      "  2.  Yes, manually accept edits",
      "",
      "Enter to select",
      "",
      "0;✋  Action Required (my-project)",
    ].join("\n");

    const result = detectGeminiTerminalStatus(text);
    expect(result?.status).toBe("needs_reply");
    expect(result?.attention).toBe("needs_reply");
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
  it("declares Gemini hook plugin metadata and launch env", async () => {
    const adapter = createGeminiAdapter();

    expect(adapter.capabilities.presentationModes).toEqual(["terminal", "gui"]);
    expect(adapter.createStructuredSession).toBeTypeOf("function");
    expect(adapter.pluginId).toBe("lightcode-status@gemini");
    expect(adapter.pluginVersion).toBe("1.2.3");
    expect(adapter.minProtocolVersion).toBe(1);

    const extras = await adapter.pluginLaunchExtras?.({
      envKind: "posix",
      baseDir: "C:\\lightcode-test",
    });

    expect(extras?.args).toBeUndefined();
    expect(extras?.env?.GEMINI_CLI_SYSTEM_SETTINGS_PATH).toContain("agent-plugins");
    expect(extras?.env?.GEMINI_CLI_SYSTEM_SETTINGS_PATH).toContain("gemini");
    expect(extras?.env?.GEMINI_CLI_SYSTEM_SETTINGS_PATH).toContain("settings.json");
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
