import { OpenCode2Session } from "./session";
import { resolveSharedUpdateCommand } from "@/shared/agents/updateResolver";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createOpenCode2Adapter } from ".";
import { buildOpenCode2Args, buildOpenCode2ServerCommand } from "./argv";
import {
  buildOpenCode2CapabilityPartialFromInventory,
  openCode2DetectionSpec,
  type OpenCode2Inventory,
} from "./detection";
import { createKnownSessionRef } from "../base";
import { detectOpenCode2TerminalStatus, opencode2OscHint, opencode2OscTitleHint } from "./terminal";

vi.mock("./binary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./binary")>()),
  cachedOpenCode2Binary: () => undefined,
  resolveOpenCode2Binary: async () => undefined,
}));

describe("buildOpenCode2Args", () => {
  it("emits no flags for a fresh launch with no prompt", () => {
    expect(buildOpenCode2Args({ model: "" }, "")).toEqual([]);
  });

  it("encodes initial prompt via --prompt", () => {
    expect(buildOpenCode2Args({ model: "" }, "hello world")).toEqual(["--prompt", "hello world"]);
  });

  it("uses --session for resume", () => {
    expect(buildOpenCode2Args({ model: "" }, "", "ses_abc123")).toEqual([
      "--session",
      "ses_abc123",
    ]);
  });

  it("composes session and prompt in order", () => {
    expect(buildOpenCode2Args({ model: "" }, "continue please", "ses_abc")).toEqual([
      "--session",
      "ses_abc",
      "--prompt",
      "continue please",
    ]);
  });

  it("ignores whitespace-only prompts", () => {
    expect(buildOpenCode2Args({ model: "" }, "   ")).toEqual([]);
  });

  it("does not forward model, effort, or mode — the V2 TUI has no --model/--agent flags", () => {
    expect(
      buildOpenCode2Args(
        { model: "opencode-go/deepseek-v4.1-flash", effort: "max", mode: "plan" },
        "",
      ),
    ).toEqual([]);
  });
});

describe("buildOpenCode2ServerCommand", () => {
  it("serves on loopback with an ephemeral port from the runtime home", () => {
    const spec = buildOpenCode2ServerCommand(
      { kind: "posix", path: "/repo" },
      "/usr/local/bin/opencode2",
    );

    // An absolute exec path takes buildAgentCommand's direct-spawn fast path.
    expect(spec).toEqual({
      command: "/usr/local/bin/opencode2",
      args: ["serve", "--hostname=127.0.0.1", "--port=0", "--print-logs"],
      cwd: homedir(),
      env: { OPENCODE_DB: "opencode-v2.db" },
    });
  });

  it("bypasses the login shell for WSL servers and prepends the binary dir to PATH", () => {
    const spec = buildOpenCode2ServerCommand(
      {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/repo",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\repo",
      },
      "/home/dev/.opencode2/bin/opencode2",
      { OPENCODE_SERVER_PASSWORD: "secret" },
    );

    const systemRoot = process.env.SystemRoot ?? process.env.windir ?? "C:\\Windows";
    expect(spec.command).toBe(join(systemRoot, "System32", "wsl.exe"));
    expect(spec.args).toEqual([
      "-d",
      "Ubuntu",
      "--cd",
      "~",
      "--",
      "/usr/bin/env",
      "PATH=/home/dev/.opencode2/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      "OPENCODE_SERVER_PASSWORD=secret",
      "OPENCODE_DB=opencode-v2.db",
      "/home/dev/.opencode2/bin/opencode2",
      "serve",
      "--hostname=127.0.0.1",
      "--port=0",
      "--print-logs",
    ]);
  });
});

describe("buildOpenCode2CapabilityPartialFromInventory", () => {
  const inventory: OpenCode2Inventory = {
    models: [
      {
        id: "opencode-go/deepseek-v4.1-flash",
        label: "DeepSeek V4.1 Flash",
        variants: ["low", "high", "max"],
        contextLimit: 1_000_000,
      },
      {
        id: "opencode/gpt-6-astra",
        label: "GPT-6 Astra",
        variants: ["low", "medium", "high", "xhigh"],
        contextLimit: 400_000,
      },
      {
        id: "opencode/tiny",
        label: "Tiny",
        variants: [],
      },
    ],
    providers: [
      { id: "opencode-go", name: "OpenCode Go" },
      { id: "opencode", name: "OpenCode Zen" },
    ],
    integrations: [],
    agents: [
      { id: "build", mode: "primary", hidden: false },
      { id: "general", mode: "subagent", hidden: false },
      { id: "compaction", mode: "primary", hidden: true },
      { id: "plan", mode: "primary", hidden: false },
    ],
    defaultModel: { providerID: "opencode-go", id: "deepseek-v4.1-flash" },
  };

  it("maps catalog models to composite ids with server-supplied labels", () => {
    const capabilities = buildOpenCode2CapabilityPartialFromInventory(inventory);
    expect(capabilities.models).toEqual(
      [
        { id: "opencode-go/deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash" },
        { id: "opencode/gpt-6-astra", label: "GPT-6 Astra" },
        { id: "opencode/tiny", label: "Tiny" },
      ].toSorted((left, right) => left.label.localeCompare(right.label)),
    );
  });

  it("maps providers to sub-provider groups by server name", () => {
    const capabilities = buildOpenCode2CapabilityPartialFromInventory(inventory);
    expect(capabilities.subProviders).toEqual([
      { id: "opencode-go", label: "OpenCode Go" },
      { id: "opencode", label: "OpenCode Zen" },
    ]);
  });

  it("falls back to the composite id when a provider has no name", () => {
    const capabilities = buildOpenCode2CapabilityPartialFromInventory({
      ...inventory,
      providers: [{ id: "opencode-go", name: "" }],
    });
    expect(capabilities.subProviders).toEqual([{ id: "opencode-go", label: "opencode-go" }]);
  });

  it("takes the effort ladder from the default model's variants", () => {
    const capabilities = buildOpenCode2CapabilityPartialFromInventory(inventory);
    expect(capabilities.efforts).toEqual(["low", "high", "max"]);
    expect(capabilities.defaultEffort).toBe("max");
    expect(capabilities.modelEfforts).toEqual({
      "opencode-go/deepseek-v4.1-flash": ["low", "high", "max"],
      "opencode/gpt-6-astra": ["low", "medium", "high", "xhigh"],
      "opencode/tiny": [],
    });
  });

  it("falls back to the weakest variant when the default ladder has no max tier", () => {
    const capabilities = buildOpenCode2CapabilityPartialFromInventory({
      ...inventory,
      defaultModel: { providerID: "opencode", id: "gpt-6-astra" },
    });
    expect(capabilities.efforts).toEqual(["low", "medium", "high", "xhigh"]);
    expect(capabilities.defaultEffort).toBe("low");
  });

  it("reports no efforts when the catalog has no default model", () => {
    const capabilities = buildOpenCode2CapabilityPartialFromInventory({
      ...inventory,
      defaultModel: undefined,
    });
    expect(capabilities.efforts).toEqual([]);
    expect(capabilities.defaultEffort).toBeUndefined();
  });

  it("advertises plan mode when the built-in plan agent is visible", () => {
    const capabilities = buildOpenCode2CapabilityPartialFromInventory(inventory);
    expect(capabilities.modes).toEqual(["agent", "plan"]);
  });

  it("omits plan mode when the plan agent is hidden or absent", () => {
    const hidden = buildOpenCode2CapabilityPartialFromInventory({
      ...inventory,
      agents: inventory.agents.map((agent) =>
        agent.id === "plan" ? { ...agent, hidden: true } : agent,
      ),
    });
    expect(hidden.modes).toEqual(["agent"]);

    const absent = buildOpenCode2CapabilityPartialFromInventory({
      ...inventory,
      agents: [{ id: "build", mode: "primary", hidden: false }],
    });
    expect(absent.modes).toEqual(["agent"]);
  });

  it("maps per-model context limits to context size options", () => {
    const capabilities = buildOpenCode2CapabilityPartialFromInventory(inventory);
    expect(capabilities.modelContextSizes).toEqual({
      "opencode-go/deepseek-v4.1-flash": ["1M"],
      "opencode/gpt-6-astra": ["400K"],
    });
    expect(capabilities.contextSizes).toEqual([
      { id: "400K", label: "400K" },
      { id: "1M", label: "1M" },
    ]);
  });
});

describe("OpenCode 2 prompt formatting", () => {
  it("places attachments on their own line with \\n\\n separator", () => {
    const adapter = createOpenCode2Adapter();
    const attachmentPath = join(homedir(), ".poracode", "attachments", "draft", "image.png");
    const prompt = adapter.formatPromptSegments?.([
      { kind: "text", content: "can you see this image?" },
      { kind: "attachment", path: attachmentPath },
    ]);

    expect(prompt).toBe("can you see this image?\n\n@~/.poracode/attachments/draft/image.png ");
  });

  it("wraps multiline prompts in bracketed paste in buildDirectInput", () => {
    const adapter = createOpenCode2Adapter();
    expect(adapter.buildDirectInput?.("line one\nline two")).toEqual([
      "\x1b[200~line one\nline two\x1b[201~",
      "@wait:60",
      "\r",
    ]);
  });

  it("does not wrap single-line prompts in bracketed paste", () => {
    const adapter = createOpenCode2Adapter();
    expect(adapter.buildDirectInput?.("just one line")).toEqual([
      "just one line",
      "@wait:60",
      "\r",
    ]);
  });
});

describe("opencode2OscTitleHint", () => {
  it("flips to working when title is prefixed by a braille spinner glyph", () => {
    expect(opencode2OscTitleHint({ code: 2, text: "⠋ working… (project)" })).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
  });

  it("ignores titles without a braille prefix", () => {
    expect(opencode2OscTitleHint({ code: 2, text: "OpenCode 2 (project)" })).toBeNull();
  });
});

describe("opencode2OscHint", () => {
  it("treats OSC 9;4;0 (remove progress) as idle", () => {
    expect(opencode2OscHint({ code: 9, body: "4;0", title: "", payload: undefined })).toEqual({
      status: "idle",
      attention: "none",
      corroborated: true,
    });
  });

  it("treats OSC 9;4;1 / 9;4;3 (set / indeterminate) as working", () => {
    expect(opencode2OscHint({ code: 9, body: "4;1;42", title: "", payload: undefined })).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
    expect(opencode2OscHint({ code: 9, body: "4;3;0", title: "", payload: undefined })).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
  });

  it("falls back to needs_approval on permission keywords in non-progress notifications", () => {
    expect(
      opencode2OscHint({
        code: 9,
        body: "permission requested",
        title: "OpenCode 2",
        payload: undefined,
      }),
    ).toEqual({ status: "needs_approval", attention: "needs_approval", corroborated: true });
  });
});

describe("detectOpenCode2TerminalStatus", () => {
  it("detects working from 'esc to interrupt' line", () => {
    expect(detectOpenCode2TerminalStatus("Working... (esc to interrupt)")?.status).toBe("working");
  });

  it("detects working from the V2 TUI's 'esc interrupt' status bar", () => {
    // Live-verified against 0.0.0-beta-19425: while a turn runs, the status
    // bar shows "esc interrupt" without the V1 "to".
    expect(
      detectOpenCode2TerminalStatus(
        "Build · DeepSeek V4.1 Flash · 4.9s · 237.6 tok/s — esc interrupt",
      )?.status,
    ).toBe("working");
  });

  it("recognizes completion before a large sidebar redraw", () => {
    expect(
      detectOpenCode2TerminalStatus(
        "Build · Muse Spark 1.3 Free · 2.6s · 77.7 tok/s" + " ".repeat(5000),
      )?.status,
    ).toBe("idle");
  });

  it("detects needs_approval from a [y/n] prompt", () => {
    expect(detectOpenCode2TerminalStatus("Allow this tool? [y/n]")?.status).toBe("needs_approval");
  });

  it("falls back to idle on a 'Type a message' footer", () => {
    expect(detectOpenCode2TerminalStatus("Type a message")).toEqual({
      status: "idle",
      attention: "none",
      corroborated: false,
    });
  });

  it("detects idle from the keybind footer painted only in input state", () => {
    const text = "                                  tab agentsctrl+p commands";
    expect(detectOpenCode2TerminalStatus(text)).toEqual({
      status: "idle",
      attention: "none",
      corroborated: true,
    });
  });

  it("returns null when no pattern matches", () => {
    expect(detectOpenCode2TerminalStatus("nothing of note here")).toBeNull();
  });

  it("prefers a tail approval prompt over an earlier working line", () => {
    const text = "Working... (esc to interrupt)\nfinished step\nAllow tool? [y/n]";
    expect(detectOpenCode2TerminalStatus(text)?.status).toBe("needs_approval");
  });
});

describe("createOpenCode2Adapter", () => {
  it.each(["posix", "windows", "wsl"] as const)(
    "installs the published 2.0.0 CLI after self-update fails on %s",
    (envKind) => {
      expect(
        resolveSharedUpdateCommand({
          update: openCode2DetectionSpec.update,
          executablePath: "/usr/local/lib/node_modules/@opencode/cli/bin/opencode.exe",
          envKind,
          skipBuiltIn: true,
        }),
      ).toMatchObject({
        strategy: "installer",
        args: expect.arrayContaining([
          envKind === "windows"
            ? 'npm install --prefix "$env:USERPROFILE/.opencode2" @opencode/cli@2.0.0'
            : 'npm install --prefix "$HOME/.opencode2" @opencode/cli@2.0.0',
        ]),
      });
    },
  );

  it("declares identity, install/update metadata, and shared skill roots", () => {
    const adapter = createOpenCode2Adapter();
    expect(adapter.kind).toBe("opencode2");
    expect(adapter.label).toBe("OpenCode 2");
    expect(adapter.binary).toBe("opencode2");
    expect(adapter.update?.latestVersionUrls).toEqual([
      "https://registry.npmjs.org/@opencode%2Fcli/latest",
    ]);
    expect(adapter.update?.builtIn).toBeUndefined();
    const login =
      typeof openCode2DetectionSpec.loginCommand === "function"
        ? openCode2DetectionSpec.loginCommand({
            location: { kind: "posix", path: "/repo" },
            executablePath: "/path with spaces/opencode.exe",
          })
        : undefined;
    expect(login).toBe("'/path with spaces/opencode.exe' auth login");
    expect(adapter.skillSupport?.roots.map((root) => root.id)).toEqual([
      "opencode2",
      "opencode2-singular",
      "claude",
      "agents",
    ]);
    expect(adapter.skillSupport?.precedence).toEqual({
      global: ["opencode2", "opencode2-singular", "agents", "claude"],
      project: ["opencode2", "opencode2-singular", "agents", "claude"],
    });
  });

  it("ships beta-channel defaults with native one-shot support and no hook plugin", () => {
    const adapter = createOpenCode2Adapter();
    expect(adapter.capabilities).toMatchObject({
      defaultApprovalPolicy: "yolo",
      bypassPermissions: { approvalPolicy: "yolo" },
      mcpConfigSource: "agentSettings",
      supportsResume: true,
      supportsOneShot: true,
      presentationModes: ["terminal", "gui"],
    });
    expect(adapter.pluginId).toBeUndefined();
    expect(adapter.runOneShot).toBeTypeOf("function");
    expect(adapter.createInitialSessionRef()).toBeUndefined();
  });

  it("uses structured preparation for terminal resume configuration", async () => {
    const adapter = createOpenCode2Adapter();
    const create = vi
      .spyOn(OpenCode2Session, "create")
      .mockRejectedValueOnce(new Error("prepared"));
    try {
      await expect(
        adapter.createStructuredSession?.({
          threadId: "thread-terminal",
          projectLocation: { kind: "posix", path: "/repo" },
          config: { model: "" },
          presentationMode: "terminal",
          sessionRef: { providerSessionId: "ses_resume", discoveredAt: "2026-01-01T00:00:00.000Z" },
        }),
      ).rejects.toThrow("prepared");
      expect(create).toHaveBeenCalledTimes(1);
    } finally {
      create.mockRestore();
    }
  });

  it("launches through opencode2 with the deferred prompt path", () => {
    const adapter = createOpenCode2Adapter();
    const launch = adapter.buildLaunchArgv(
      { kind: "posix", path: "/repo" },
      { model: "", approvalPolicy: "yolo" },
      "first prompt",
      undefined,
      undefined,
    );
    expect(launch).toEqual({
      binary: "opencode2",
      args: ["--prompt", "first prompt"],
      preferShell: true,
    });
    expect(adapter.shouldDeferPromptToTerminal?.({ model: "" })).toBe(true);
  });

  it("resumes through --session and forwards MCP config via the config overlay env", () => {
    const adapter = createOpenCode2Adapter();
    const launch = adapter.buildLaunchArgv(
      { kind: "posix", path: "/repo" },
      { model: "" },
      "",
      undefined,
      { resumeThreadId: "ses_launch" },
    );
    expect(launch.args).toEqual(["--session", "ses_launch"]);
    expect(launch.sessionRef).toMatchObject({ providerSessionId: "ses_launch" });

    const resume = adapter.buildResumeArgv(
      { kind: "posix", path: "/repo" },
      { model: "" },
      "next",
      createKnownSessionRef("ses_resume"),
      {
        mcpServers: [
          {
            id: "browser",
            name: "browser",
            timeoutMs: 30_000,
            transport: { type: "http", url: "http://127.0.0.1:9/mcp", headers: {} },
          },
        ],
      },
    );
    expect(resume.args).toEqual(["--session", "ses_resume", "--prompt", "next"]);
    expect(resume.env?.OPENCODE_CONFIG_CONTENT).toContain('"browser"');
  });

  it("omits the MCP env when a launch carries no servers", () => {
    const adapter = createOpenCode2Adapter();
    const resume = adapter.buildResumeArgv(
      { kind: "posix", path: "/repo" },
      { model: "", approvalPolicy: "yolo" },
      "next",
      createKnownSessionRef("ses_resume"),
      { mcpServers: [] },
    );
    expect(resume.env).toBeUndefined();
  });
});
