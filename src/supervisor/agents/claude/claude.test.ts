import { homedir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createClaudeAdapter, createClaudeProfileAdapter } from "./index";
import { claudeCapabilities, parseClaudeAuthStatusJson } from "./detection";
import type { OscNotification, OscTitle } from "@/shared/osc";
import type { ProjectLocation, ThreadConfig } from "@/shared/contracts";

function oscTitle(text: string, code: 0 | 1 | 2 = 0): OscTitle {
  return { code, text };
}

function oscNotify(body: string, code: 9 | 99 | 777 = 9): OscNotification {
  return { code, title: "", body, payload: undefined };
}

describe("createClaudeAdapter handleOscTitle", () => {
  const adapter = createClaudeAdapter();

  // Observed from real dev sessions (~/.lightcode/logs/terminal/*.log):
  //   124× "⠂ <task title>"  /  121× "⠐ <task title>"  /  10× "✳ <task title>"
  // The braille 2-frame animation (⠂ / ⠐, U+2802 / U+2810) is the stable
  // "working" signal; ✳ appeared rarely and was classified as an artifact.
  it("maps Claude's 2-frame braille spinner (⠂ / ⠐) to working", () => {
    for (const glyph of ["⠂", "⠐"]) {
      expect(adapter.handleOscTitle?.(oscTitle(`${glyph} Add jump to bottom button`))).toEqual({
        status: "working",
        attention: "working",
        corroborated: true,
      });
    }
  });

  it("accepts any glyph in the braille range (U+2800–U+28FF)", () => {
    for (const glyph of ["⠀", "⠁", "⠄", "⣾", "⣿"]) {
      expect(adapter.handleOscTitle?.(oscTitle(`${glyph} task`))?.status).toBe("working");
    }
  });

  it("returns null for Claude's idle titles (no spinner prefix)", () => {
    // At startup Claude sets these; they are NOT a working signal.
    expect(adapter.handleOscTitle?.(oscTitle("claude"))).toBeNull();
    expect(adapter.handleOscTitle?.(oscTitle("Claude Code"))).toBeNull();
  });

  it("returns null when the braille glyph is not at the start of the title", () => {
    expect(adapter.handleOscTitle?.(oscTitle("Claude Code ⠂"))).toBeNull();
  });
});

describe("createClaudeAdapter handleOscNotification (iTerm2 OSC 9;4 progress)", () => {
  const adapter = createClaudeAdapter();

  // Real bodies observed in ~/.lightcode-dev/logs/terminal/*.log after the
  // `preferredNotifChannel: "iterm2"` settings flip: "4;0;", "4;0;0", "4;3;0".
  // See plugin/install.ts for the settings wiring.
  it("maps state 0 (remove progress) to idle", () => {
    for (const body of ["4;0", "4;0;", "4;0;0"]) {
      expect(adapter.handleOscNotification?.(oscNotify(body))).toEqual({
        status: "idle",
        attention: "none",
        corroborated: true,
      });
    }
  });

  it("maps state 3 (indeterminate) to working — Claude's in-turn signal", () => {
    expect(adapter.handleOscNotification?.(oscNotify("4;3;0"))).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
  });

  it("maps state 1 (determinate progress) to working", () => {
    expect(adapter.handleOscNotification?.(oscNotify("4;1;42"))).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
  });

  it("ignores states 2 (error) and 4 (paused) — no clean mapping", () => {
    expect(adapter.handleOscNotification?.(oscNotify("4;2"))).toBeNull();
    expect(adapter.handleOscNotification?.(oscNotify("4;4;0"))).toBeNull();
  });

  it("ignores OSC 9 bodies that aren't the 9;4 progress sub-protocol", () => {
    // Codex-style plain-text OSC 9 (turn-end notify with response text) must
    // not accidentally flip Claude to idle/working — Claude is configured for
    // iTerm2 progress only, so a non-`4;` body is a foreign signal.
    expect(adapter.handleOscNotification?.(oscNotify("Hello from some other agent"))).toBeNull();
    expect(adapter.handleOscNotification?.(oscNotify(""))).toBeNull();
  });

  it("ignores OSC 777 / OSC 99 — Claude only speaks iTerm2 OSC 9", () => {
    expect(adapter.handleOscNotification?.(oscNotify("4;0", 777))).toBeNull();
    expect(adapter.handleOscNotification?.(oscNotify("4;3;0", 99))).toBeNull();
  });
});

describe("createClaudeAdapter structured sessions", () => {
  const projectLocation: ProjectLocation = { kind: "windows", path: "C:\\repo" };
  const config: ThreadConfig = { model: "sonnet" };

  it("advertises GUI as an opt-in presentation mode while keeping terminal as default", () => {
    const adapter = createClaudeAdapter();

    expect(adapter.capabilities.presentationMode).toBe("terminal");
    expect(adapter.capabilities.presentationModes).toEqual(["terminal", "gui"]);
  });

  it("creates a structured SDK session only for GUI presentation", async () => {
    const adapter = createClaudeAdapter();

    await expect(
      adapter.createStructuredSession?.({
        threadId: "thread-1",
        projectLocation,
        config,
        presentationMode: "terminal",
      }),
    ).resolves.toBeUndefined();

    await expect(
      adapter.createStructuredSession?.({
        threadId: "thread-1",
        projectLocation,
        config,
        presentationMode: "gui",
      }),
    ).resolves.toMatchObject({ launchOptions: { suppressResumeConfigOverrides: true } });
  });
});

describe("claudeCapabilities", () => {
  it("advertises Fable 5 as a 1M-only non-fast model guarded by the probe", () => {
    expect(claudeCapabilities.models).toContainEqual({ id: "claude-fable-5", label: "Fable 5" });
    expect(claudeCapabilities.modelEfforts["claude-fable-5"]).toEqual([
      "low",
      "medium",
      "high",
      "xHigh",
      "max",
      "ultracode",
    ]);
    expect(claudeCapabilities.modelContextSizes?.["claude-fable-5"]).toEqual(["1m"]);
    expect(claudeCapabilities.fastModels).not.toContain("claude-fable-5");
  });

  it("lists Fable 5 first so the latest model is the default for new threads", () => {
    expect(claudeCapabilities.models[0]).toEqual({ id: "claude-fable-5", label: "Fable 5" });
  });
});

describe("createClaudeAdapter buildAcpLogoutCommand", () => {
  it("returns `claude auth logout` so the Settings logout button can drive it", async () => {
    const adapter = createClaudeAdapter();
    const command = await adapter.buildAcpLogoutCommand?.();
    expect(command).toBeDefined();
    const args = command?.args ?? [];
    const rendered = args.includes("-EncodedCommand")
      ? Buffer.from(args.at(-1) ?? "", "base64").toString("utf16le")
      : args.join(" ");
    expect(rendered).toMatch(/claude/i);
    expect(rendered).toContain("auth");
    expect(rendered).toContain("logout");
  });
});

describe("createClaudeProfileAdapter", () => {
  const projectLocation: ProjectLocation = { kind: "posix", path: "/repo" };

  it("creates a distinct Claude adapter backed by a separate config directory", () => {
    const adapter = createClaudeProfileAdapter({
      id: "work",
      driver: "claude",
      displayName: "Work",
      config: { configDir: "~/.lightcode/claude-profiles/work" },
    });

    expect(adapter.kind).toBe("claude:work");
    expect(adapter.label).toBe("Claude Work");
    expect(adapter.capabilities.subProviders).toContainEqual({
      id: "claude-profile",
      label: "Work",
    });
    expect(adapter.capabilities.modelSubProvider?.sonnet).toBe("claude-profile");

    const expectedConfigDir = path.join(homedir(), ".lightcode/claude-profiles/work");
    expect(
      adapter.buildLaunchArgv(projectLocation, { model: "sonnet" }, "hello").env?.CLAUDE_CONFIG_DIR,
    ).toBe(expectedConfigDir);
    expect(
      adapter.buildOneShotCommand?.("haiku", undefined, "Summarize", projectLocation)?.env
        ?.CLAUDE_CONFIG_DIR,
    ).toBe(expectedConfigDir);
    expect(
      adapter.buildContextExtractionCommand?.(
        { providerSessionId: "session-1", discoveredAt: "test" },
        projectLocation,
      )?.env?.CLAUDE_CONFIG_DIR,
    ).toBe(expectedConfigDir);
  });
});

describe("parseClaudeAuthStatusJson", () => {
  it("extracts account metadata from Claude's auth-status JSON", () => {
    expect(
      parseClaudeAuthStatusJson(`{
        "loggedIn": true,
        "authMethod": "claude.ai",
        "email": "user@example.com",
        "orgName": "Yieldmo",
        "subscriptionType": "team"
      }`),
    ).toEqual({
      authState: "authenticated",
      providerMetadata: {
        authenticatedAs: "user@example.com",
        organization: "Yieldmo",
        plan: "Team Subscription",
        authMethod: "Claude.ai",
      },
    });
  });

  it("returns undefined for non-JSON output", () => {
    expect(parseClaudeAuthStatusJson("not json")).toBeUndefined();
  });
});
