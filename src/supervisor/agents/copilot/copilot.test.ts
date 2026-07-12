import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { McpServer } from "@/shared/contracts";
import type { OscNotification, OscShellEvent } from "@/shared/osc";
import { buildCopilotArgs } from "./argv";
import { copilotDetectionSpec } from "./detection";
import { buildCopilotMcpLaunchConfig } from "./mcp";
import {
  createCopilotAdapter,
  detectCopilotInvalidSessionRef,
  detectCopilotModelEffort,
  detectCopilotStatusLineModel,
  detectCopilotTerminalStatus,
} from "./index";

describe("copilotDetectionSpec", () => {
  it("uses Copilot CLI login for terminal authentication", () => {
    expect(copilotDetectionSpec.loginCommand).toBe("copilot login");
  });
});

function oscNotify(body: string, code: 9 | 99 | 777 = 9): OscNotification {
  return { code, title: "", body, payload: undefined };
}

describe("createCopilotAdapter OSC status", () => {
  const adapter = createCopilotAdapter();

  it("maps iTerm2 OSC 9;4 progress to working and idle", () => {
    expect(adapter.handleOscNotification?.(oscNotify("4;3;0"))).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
    expect(adapter.handleOscNotification?.(oscNotify("4;1;42"))).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
    expect(adapter.handleOscNotification?.(oscNotify("4;0;0"))).toEqual({
      status: "idle",
      attention: "none",
      corroborated: true,
    });
  });

  it("ignores non-OSC-9 progress-looking notifications", () => {
    expect(adapter.handleOscNotification?.(oscNotify("4;3;0", 777))).toBeNull();
    expect(adapter.handleOscNotification?.(oscNotify("4;0;0", 99))).toBeNull();
  });

  it("maps shell integration preexec/finished markers as a WSL fallback", () => {
    const preexec: OscShellEvent = { code: 133, kind: "command-pre-exec" };
    const finished: OscShellEvent = { code: 133, kind: "command-finished", exitCode: 0 };

    expect(adapter.handleOscShellEvent?.(preexec)).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
    expect(adapter.handleOscShellEvent?.(finished)).toEqual({
      status: "idle",
      attention: "none",
      corroborated: true,
    });
  });
});

describe("detectCopilotTerminalStatus", () => {
  it("detects idle from the Copilot prompt placeholder", () => {
    const text = "Type @ to mention files, # for issues/PRs, / for commands, or ? for shortcuts";

    expect(detectCopilotTerminalStatus(text)).toEqual({
      status: "idle",
      attention: "none",
      corroborated: true,
    });
  });

  it("detects working from the Copilot status line", () => {
    expect(detectCopilotTerminalStatus("thinking")).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
  });

  it("detects needs_reply from the trust prompt", () => {
    const text = "This folder is not trusted. Please confirm folder trust to continue.";

    expect(detectCopilotTerminalStatus(text)).toEqual({
      status: "needs_reply",
      attention: "needs_reply",
      corroborated: true,
    });
  });

  it("detects needs_approval from permission overlays", () => {
    expect(detectCopilotTerminalStatus("Permission request (1 remaining)")).toEqual({
      status: "needs_approval",
      attention: "needs_approval",
      corroborated: true,
    });
  });

  it("detects needs_reply from 'Copilot is requesting information' form", () => {
    const text = [
      "Copilot is requesting information",
      "What feature, change, or task would you like to plan and implement?",
      "",
      "[Implementation Request]  Additional Context (Optional)",
      "",
      "Enter accept · Tab next · ctrl+d decline · Esc cancel",
    ].join("\n");
    expect(detectCopilotTerminalStatus(text)).toEqual({
      status: "needs_reply",
      attention: "needs_reply",
      corroborated: true,
    });
  });

  it("detects needs_reply from the form action bar alone", () => {
    const text = "Enter accept · Tab next · ctrl+d decline · Esc cancel";
    expect(detectCopilotTerminalStatus(text)).toEqual({
      status: "needs_reply",
      attention: "needs_reply",
      corroborated: true,
    });
  });

  it("detects needs_reply from 'Plan Ready for Review'", () => {
    const text = [
      "Plan Ready for Review",
      "",
      "- Refresh the existing component",
      "- Accept plan and build on default permissions",
      "",
      "↓ to navigate · Enter to select · ctrl+e to show full plan · Esc to cancel",
    ].join("\n");
    expect(detectCopilotTerminalStatus(text)).toEqual({
      status: "needs_reply",
      attention: "needs_reply",
      corroborated: true,
    });
  });

  it("detects needs_reply from 'ctrl+e to show full plan' alone", () => {
    const text = "↓ to navigate · Enter to select · ctrl+e to show full plan · Esc to cancel";
    expect(detectCopilotTerminalStatus(text)).toEqual({
      status: "needs_reply",
      attention: "needs_reply",
      corroborated: true,
    });
  });

  it("detects needs_reply from persistent 'Asking user' action indicator", () => {
    // After TUI form overlay redraws, the conversation action indicator persists
    const text = [
      "ture, improvement, or task they're interested in working on.",
      "                                       ○ Asking user I'd be happy to help you create a plan!",
      "│ │                                                                      │ │",
    ].join("\n");
    expect(detectCopilotTerminalStatus(text)).toEqual({
      status: "needs_reply",
      attention: "needs_reply",
      corroborated: true,
    });
  });

  it("detects needs_reply from 'Asking user' even with idle prompt earlier", () => {
    const text = [
      "Type @ to mention files, # for issues/PRs, / for commands, or ? for shortcuts",
      "some conversation...",
      "○ Asking user What would you like to do?",
    ].join("\n");
    const result = detectCopilotTerminalStatus(text);
    expect(result?.status).toBe("needs_reply");
  });

  it("detects working from 'Thinking (Esc to cancel)' with symbol prefix", () => {
    expect(detectCopilotTerminalStatus("⊙ Thinking (Esc to cancel)")).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
  });

  it("does not treat bare 'Esc to cancel' in action bars as working", () => {
    // The plan review action bar contains "Esc to cancel" without parens —
    // only "(Esc to cancel)" with parens is a working indicator.
    const text = "ctrl+e to show full plan · Esc to cancel";
    const result = detectCopilotTerminalStatus(text);
    expect(result?.status).not.toBe("working");
  });

  it("ignores stale working output deep in history when the recent tail only shows the status bar", () => {
    const text = ["⊙ Thinking (Esc to cancel)", "x".repeat(2000), "shift+tab switch mode"].join(
      "\n",
    );

    expect(detectCopilotTerminalStatus(text)).toEqual({
      status: "idle",
      attention: "none",
      corroborated: false,
    });
  });

  it("detects model and effort from 'Model changed to' message", () => {
    const text = [
      "● Model changed to: claude-opus-4.6 (medium)",
      "",
      "Type @ to mention files, # for issues/PRs, / for commands, or ? for shortcuts",
    ].join("\n");
    const result = detectCopilotTerminalStatus(text);
    expect(result?.status).toBe("idle");
    expect(result?.model).toBe("claude-opus-4.6");
    expect(result?.effort).toBe("medium");
  });

  it("detects model with xhigh effort", () => {
    const text = [
      "● Model changed to: gpt-5.4 (xhigh)",
      "",
      "Type @ to mention files, # for issues/PRs, / for commands, or ? for shortcuts",
    ].join("\n");
    const result = detectCopilotTerminalStatus(text);
    expect(result?.model).toBe("gpt-5.4");
    expect(result?.effort).toBe("xhigh");
  });

  it("falls back to status line model when no 'Model changed to' message", () => {
    const text = [
      "~/work/site-search-ui [↗ dev]          GPT-5.4 (xhigh)",
      "",
      "Type @ to mention files, # for issues/PRs, / for commands, or ? for shortcuts",
    ].join("\n");
    const result = detectCopilotTerminalStatus(text);
    expect(result?.model).toBe("GPT-5.4");
    expect(result?.effort).toBe("xhigh");
  });

  it("prioritizes plan review over idle when plan review appears last", () => {
    const text = [
      "Type @ to mention files, # for issues/PRs, / for commands, or ? for shortcuts",
      "",
      "Plan Ready for Review",
      "- Some plan step",
      "↓ to navigate · Enter to select · ctrl+e to show full plan · Esc to cancel",
    ].join("\n");
    expect(detectCopilotTerminalStatus(text)?.status).toBe("needs_reply");
  });

  it("idle prompt does not override approval policy", () => {
    // The ready prompt is the same regardless of active policy — it should
    // NOT carry approvalPolicy so that a user-chosen policy isn't reset.
    const text = [
      "some output",
      "autopilot",
      "Type @ to mention files, # for issues/PRs, / for commands, or ? for shortcuts",
    ].join("\n");
    const result = detectCopilotTerminalStatus(text);
    expect(result?.status).toBe("idle");
    expect(result?.approvalPolicy).toBeUndefined();
  });

  it("detects autopilot when it appears after ready prompt", () => {
    const text = [
      "Type @ to mention files, # for issues/PRs, / for commands, or ? for shortcuts",
      "autopilot",
    ].join("\n");
    const result = detectCopilotTerminalStatus(text);
    expect(result?.status).toBe("idle");
    expect(result?.approvalPolicy).toBe("autopilot");
  });

  it("idle prompt after plan mode text does not carry planMode", () => {
    // When the ready prompt appears after "plan mode" text, the ready prompt
    // is the last match and wins — it carries no planMode/approvalPolicy.
    const text = [
      "some output",
      "plan mode",
      "Type @ to mention files, # for issues/PRs, / for commands, or ? for shortcuts",
    ].join("\n");
    const result = detectCopilotTerminalStatus(text);
    expect(result?.status).toBe("idle");
    expect(result?.planMode).toBeUndefined();
  });

  it("detects plan mode when it appears after ready prompt", () => {
    const text = [
      "Type @ to mention files, # for issues/PRs, / for commands, or ? for shortcuts",
      "plan mode",
    ].join("\n");
    const result = detectCopilotTerminalStatus(text);
    expect(result?.status).toBe("idle");
    expect(result?.planMode).toBe(true);
  });
});

describe("detectCopilotInvalidSessionRef", () => {
  it("detects invalid or missing resume targets", () => {
    expect(detectCopilotInvalidSessionRef("Failed to resume session: Session not found: abc")).toBe(
      true,
    );
    expect(detectCopilotInvalidSessionRef("Session not found: abc")).toBe(true);
  });

  it("ignores unrelated output", () => {
    expect(detectCopilotInvalidSessionRef("Type @ to mention files")).toBe(false);
  });
});

describe("detectCopilotModelEffort", () => {
  it("detects model and effort from change message", () => {
    const text = "● Model changed to: claude-opus-4.6 (medium)";
    expect(detectCopilotModelEffort(text)).toEqual({
      rawModel: "claude-opus-4.6",
      effort: "medium",
    });
  });

  it("detects xhigh effort", () => {
    const text = "● Model changed to: gpt-5.4 (xhigh)";
    expect(detectCopilotModelEffort(text)).toEqual({
      rawModel: "gpt-5.4",
      effort: "xhigh",
    });
  });

  it("uses last match when multiple model changes exist", () => {
    const text = [
      "● Model changed to: claude-opus-4.6 (medium)",
      "some output",
      "● Model changed to: gpt-5.4 (high)",
    ].join("\n");
    expect(detectCopilotModelEffort(text)).toEqual({
      rawModel: "gpt-5.4",
      effort: "high",
    });
  });

  it("returns null when no model change message present", () => {
    expect(detectCopilotModelEffort("some random text")).toBeNull();
  });

  it("ignores unknown effort values", () => {
    const text = "● Model changed to: some-model (turbo)";
    expect(detectCopilotModelEffort(text)).toEqual({
      rawModel: "some-model",
    });
  });

  it("handles bullet dot variant", () => {
    const text = "• Model changed to: gpt-5.4 (low)";
    expect(detectCopilotModelEffort(text)).toEqual({
      rawModel: "gpt-5.4",
      effort: "low",
    });
  });
});

describe("detectCopilotStatusLineModel", () => {
  it("detects model and effort from status line", () => {
    const text = "~/work/site-search-ui [↗ dev]          GPT-5.4 (xhigh)";
    expect(detectCopilotStatusLineModel(text)).toEqual({
      rawModel: "GPT-5.4",
      effort: "xhigh",
    });
  });

  it("detects model without effort", () => {
    const text = "~/work/site-search-ui [↗ dev]          Claude Haiku 4.5";
    expect(detectCopilotStatusLineModel(text)).toEqual({
      rawModel: "Claude Haiku 4.5",
    });
  });

  it("strips context info like (3x) and detects effort", () => {
    const text = "~/work/site-search-ui [↗ dev]          Claude Opus 4.6 (3x) (medium)";
    expect(detectCopilotStatusLineModel(text)).toEqual({
      rawModel: "Claude Opus 4.6",
      effort: "medium",
    });
  });

  it("uses last match when buffer has multiple status lines", () => {
    const text = [
      "~/work/repo [main]          GPT-5.4 (high)",
      "some output",
      "~/work/repo [main]          Claude Haiku 4.5 (low)",
    ].join("\n");
    expect(detectCopilotStatusLineModel(text)).toEqual({
      rawModel: "Claude Haiku 4.5",
      effort: "low",
    });
  });

  it("returns null for lines without bracket+space pattern", () => {
    expect(detectCopilotStatusLineModel("just some random text")).toBeNull();
  });

  it("rejects captured model containing box-drawing/arrow glyphs from /model picker overlay", () => {
    // The picker overlay can sit on the same logical line as the status row;
    // `.` matches `\r`, so the captured "model" ends up being the picker glyphs
    // glued together. Reject so we don't pass garbage to `--model` on resume.
    const text = "~/work/lightcode [↗ master]          ──────────────❯";
    expect(detectCopilotStatusLineModel(text)).toBeNull();
  });

  it("rejects captured model when it spans an embedded \\r (picker glyphs across two visual lines)", () => {
    const text = "~/work/lightcode [↗ master]          ─────────\r  ─────❯";
    expect(detectCopilotStatusLineModel(text)).toBeNull();
  });
});

describe("buildCopilotArgs", () => {
  it("drops a corrupted model value rather than passing TUI glyphs to --model", () => {
    // Self-heal path: if a previous picker-overlay capture wrote junk into the
    // persisted config, the next resume should silently fall back to "auto"
    // instead of erroring on every spawn.
    const args = buildCopilotArgs({ model: "──────────\r\n  ────❯" }, "", "session-1");
    expect(args).not.toContain("--model");
  });

  it("passes a clean model value through to --model on resume", () => {
    const args = buildCopilotArgs({ model: "claude-opus-4.6" }, "", "session-1");
    const idx = args.indexOf("--model");
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toBe("claude-opus-4.6");
  });
});

describe("Copilot CLI MCP configuration", () => {
  const servers: McpServer[] = [
    {
      id: "stdio-id",
      name: "local-tools",
      description: "",
      enabled: true,
      timeoutMs: 15_000,
      transport: {
        type: "stdio",
        command: "node",
        args: ["server.js"],
        env: { API_TOKEN: "stdio-secret" },
        cwd: "C:\\tools",
      },
    },
    {
      id: "remote-id",
      name: "Vercel",
      description: "",
      enabled: true,
      timeoutMs: 30_000,
      transport: {
        type: "http",
        url: "https://mcp.vercel.com",
        headers: { Authorization: "Bearer remote-secret" },
      },
    },
  ];

  it("uses Copilot's native schema and keeps environment and header values out of JSON", () => {
    const launch = buildCopilotMcpLaunchConfig(servers);
    const serialized = JSON.stringify(launch.config);

    expect(launch.config.mcpServers).toMatchObject({
      "local-tools": {
        type: "stdio",
        command: "node",
        args: ["server.js"],
        tools: ["*"],
        cwd: "C:\\tools",
        timeout: 15_000,
      },
      Vercel: {
        type: "http",
        url: "https://mcp.vercel.com",
        tools: ["*"],
        timeout: 30_000,
      },
    });
    expect(serialized).not.toContain("stdio-secret");
    expect(serialized).not.toContain("remote-secret");
    expect(Object.values(launch.env)).toEqual(
      expect.arrayContaining(["stdio-secret", "Bearer remote-secret"]),
    );
    const local = launch.config.mcpServers["local-tools"];
    const remote = launch.config.mcpServers.Vercel;
    expect(local?.type === "stdio" ? local.env?.API_TOKEN : undefined).toMatch(
      /^\$\{LIGHTCODE_COPILOT_MCP_[A-F0-9]{16}\}$/u,
    );
    expect(remote?.type === "http" ? remote.headers?.Authorization : undefined).toMatch(
      /^\$\{LIGHTCODE_COPILOT_MCP_[A-F0-9]{16}\}$/u,
    );
  });

  it("adds a protected @file to both launch and resume without putting secrets in argv", () => {
    const adapter = createCopilotAdapter();
    const location = { kind: "windows" as const, path: "C:\\repo" };
    const launch = adapter.buildLaunchArgv(location, { model: "gpt-5" }, "hello", undefined, {
      resumeThreadId: "launch-session",
      mcpServers: servers,
    });
    const resume = adapter.buildResumeArgv(
      location,
      { model: "gpt-5" },
      "again",
      { providerSessionId: "resume-session", discoveredAt: new Date().toISOString() },
      { mcpServers: servers },
    );

    for (const spec of [launch, resume]) {
      const flagIndex = spec.args.indexOf("--additional-mcp-config");
      const argument = spec.args[flagIndex + 1];
      expect(flagIndex).toBeGreaterThanOrEqual(0);
      expect(argument).toMatch(/^@/u);
      expect(spec.args.join(" ")).not.toContain("remote-secret");
      expect(readFileSync(argument!.slice(1), "utf8")).toContain('"Vercel"');
      expect(Object.values(spec.env ?? {})).toContain("Bearer remote-secret");
      spec.cleanup?.();
      expect(existsSync(argument!.slice(1))).toBe(false);
    }
  });
});

describe("createCopilotAdapter", () => {
  it.skipIf(process.platform !== "win32")(
    "skips ACP session setup when resuming an existing TUI session",
    async () => {
      const adapter = createCopilotAdapter();

      await expect(
        adapter.createStructuredSession?.({
          threadId: "thread-1",
          projectLocation: {
            kind: "windows",
            path: "C:\\repo",
          },
          config: {
            model: "gpt-5.4",
            effort: "high",
          },
          sessionRef: {
            providerSessionId: "session-1",
            discoveredAt: new Date().toISOString(),
          },
        }),
      ).resolves.toBeUndefined();
    },
  );

  it("passes plan-mode prompts through unchanged (mode is set via --plan at launch)", () => {
    const adapter = createCopilotAdapter();

    expect(
      adapter.buildDirectInput?.("fix bug", undefined, {
        model: "gpt-5.4",
        mode: "plan",
      }),
    ).toEqual(["fix bug", "@wait:40", "\r"]);
  });

  it("preserves user-typed slash commands verbatim", () => {
    const adapter = createCopilotAdapter();

    expect(
      adapter.buildDirectInput?.("/plan fix bug", undefined, {
        model: "gpt-5.4",
        mode: "plan",
      }),
    ).toEqual(["/plan fix bug", "@wait:40", "\r"]);
  });

  it("detectTerminalStatus returns model and effort", () => {
    const adapter = createCopilotAdapter();
    const text = [
      "● Model changed to: gpt-5.4 (high)",
      "Type @ to mention files, # for issues/PRs, / for commands, or ? for shortcuts",
    ].join("\n");
    const hint = adapter.detectTerminalStatus?.(text);
    expect(hint?.model).toBe("gpt-5.4");
    expect(hint?.effort).toBe("high");
  });

  it("syncConfigFromTerminalState updates model and effort", () => {
    const adapter = createCopilotAdapter();
    const result = adapter.syncConfigFromTerminalState?.({
      config: { model: "gpt-5.4", effort: "high" },
      previousStatus: "idle",
      previousAttention: "none",
      hint: {
        status: "idle",
        attention: "none",
        model: "claude-opus-4.6",
        effort: "medium",
      },
    });
    expect(result).toEqual({
      model: "claude-opus-4.6",
      effort: "medium",
    });
  });

  it("syncConfigFromTerminalState updates approval policy", () => {
    const adapter = createCopilotAdapter();
    const result = adapter.syncConfigFromTerminalState?.({
      config: { model: "gpt-5.4", approvalPolicy: "default" },
      previousStatus: "idle",
      previousAttention: "none",
      hint: {
        status: "idle",
        attention: "none",
        approvalPolicy: "autopilot",
      },
    });
    expect(result?.approvalPolicy).toBe("autopilot");
  });

  it("syncConfigFromTerminalState enters plan mode", () => {
    const adapter = createCopilotAdapter();
    const result = adapter.syncConfigFromTerminalState?.({
      config: { model: "gpt-5.4" },
      previousStatus: "idle",
      previousAttention: "none",
      hint: {
        status: "idle",
        attention: "none",
        planMode: true,
      },
    });
    expect(result?.mode).toBe("plan");
  });

  it("syncConfigFromTerminalState exits plan mode on idle without planMode", () => {
    const adapter = createCopilotAdapter();
    const result = adapter.syncConfigFromTerminalState?.({
      config: { model: "gpt-5.4", mode: "plan" },
      previousStatus: "idle",
      previousAttention: "none",
      hint: {
        status: "idle",
        attention: "none",
      },
    });
    expect(result?.mode).toBeUndefined();
  });

  it("syncConfigFromTerminalState returns undefined when nothing changed", () => {
    const adapter = createCopilotAdapter();
    const result = adapter.syncConfigFromTerminalState?.({
      config: { model: "gpt-5.4", effort: "high" },
      previousStatus: "idle",
      previousAttention: "none",
      hint: {
        status: "idle",
        attention: "none",
      },
    });
    expect(result).toBeUndefined();
  });

  it("syncConfigFromTerminalState updates only effort when model unchanged", () => {
    const adapter = createCopilotAdapter();
    const result = adapter.syncConfigFromTerminalState?.({
      config: { model: "gpt-5.4", effort: "high" },
      previousStatus: "idle",
      previousAttention: "none",
      hint: {
        status: "idle",
        attention: "none",
        effort: "xhigh",
      },
    });
    expect(result).toEqual({
      model: "gpt-5.4",
      effort: "xhigh",
    });
  });
});
