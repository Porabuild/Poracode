import { homedir } from "node:os";
import { join } from "node:path";
import { resolveSharedUpdateCommand } from "@/shared/agents/updateResolver";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOpenCodeAdapter } from ".";
import { createKnownSessionRef } from "../base";
import { buildOpenCodeArgs, buildOpenCodeServerCommand } from "./argv";
import { acquireOpenCodeServer } from "./client";
import type { V2Event } from "./clientTypes";
import { clearOpenCodeSessionDatabases, rememberOpenCodeSessionDatabase } from "./database";
import {
  buildOpenCodeCapabilityPartialFromInventory,
  openCodeDetectionSpec,
  type OpenCodeInventory,
} from "./detection";
import { subscribeOpenCodeServerEvents } from "./eventHub";
import { OpenCodeSession } from "./session";
import { detectOpenCodeTerminalStatus, opencodeOscHint, opencodeOscTitleHint } from "./terminal";

vi.mock("./binary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./binary")>()),
  cachedOpenCodeBinary: () => undefined,
  resolveOpenCodeBinary: async () => undefined,
}));

vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  acquireOpenCodeServer: vi.fn<typeof acquireOpenCodeServer>(),
}));

vi.mock("./eventHub", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./eventHub")>()),
  subscribeOpenCodeServerEvents: vi.fn<typeof subscribeOpenCodeServerEvents>(),
}));

const disposeTerminalServer = vi.fn<() => Promise<void>>();
const interruptTerminalSession = vi.fn<() => Promise<void>>();
const updateTerminalSession = vi.fn<() => Promise<void>>();
const unsubscribeTerminalEvents = vi.fn<() => void>();
beforeEach(() => {
  disposeTerminalServer.mockReset().mockResolvedValue(undefined);
  interruptTerminalSession.mockReset().mockResolvedValue(undefined);
  updateTerminalSession.mockReset().mockResolvedValue(undefined);
  unsubscribeTerminalEvents.mockReset();
  vi.mocked(subscribeOpenCodeServerEvents).mockReset().mockReturnValue(unsubscribeTerminalEvents);
  vi.mocked(acquireOpenCodeServer)
    .mockReset()
    .mockResolvedValue({
      baseUrl: "http://127.0.0.1:4300",
      handle: { password: Promise.resolve("fixture-password") },
      client: {
        session: {
          interrupt: interruptTerminalSession,
          update: updateTerminalSession,
        },
        event: {
          subscribe: vi.fn<() => void>(),
        },
      },
      getDirectoryMcpNames: () => [],
      onDirectoryMcpChanged: () => () => undefined,
      dispose: disposeTerminalServer,
    } as unknown as Awaited<ReturnType<typeof acquireOpenCodeServer>>);
});

afterEach(clearOpenCodeSessionDatabases);

describe("buildOpenCodeArgs", () => {
  it("emits no flags for a fresh launch with no prompt", () => {
    expect(buildOpenCodeArgs({ model: "" }, "")).toEqual([]);
  });

  it("encodes initial prompt via --prompt", () => {
    expect(buildOpenCodeArgs({ model: "" }, "hello world")).toEqual(["--prompt", "hello world"]);
  });

  it("uses --session for resume", () => {
    expect(buildOpenCodeArgs({ model: "" }, "", "ses_abc123")).toEqual(["--session", "ses_abc123"]);
  });

  it("composes session and prompt in order", () => {
    expect(buildOpenCodeArgs({ model: "" }, "continue please", "ses_abc")).toEqual([
      "--session",
      "ses_abc",
      "--prompt",
      "continue please",
    ]);
  });

  it("ignores whitespace-only prompts", () => {
    expect(buildOpenCodeArgs({ model: "" }, "   ")).toEqual([]);
  });

  it("does not forward model, effort, or mode — the V2 TUI has no --model/--agent flags", () => {
    expect(
      buildOpenCodeArgs(
        { model: "opencode-go/deepseek-v4.1-flash", effort: "max", mode: "plan" },
        "",
      ),
    ).toEqual([]);
  });
});

describe("buildOpenCodeServerCommand", () => {
  it("serves on loopback with an ephemeral port from the runtime home", () => {
    const spec = buildOpenCodeServerCommand(
      { kind: "posix", path: "/repo" },
      "/usr/local/bin/opencode",
    );

    // An absolute exec path takes buildAgentCommand's direct-spawn fast path.
    expect(spec).toEqual({
      command: "/usr/local/bin/opencode",
      args: ["serve", "--hostname=127.0.0.1", "--port=0", "--print-logs"],
      cwd: homedir(),
    });
  });

  it("bypasses the login shell for WSL servers and prepends the binary dir to PATH", () => {
    const spec = buildOpenCodeServerCommand(
      {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/repo",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\repo",
      },
      "/home/dev/.opencode2/bin/opencode",
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
      "/home/dev/.opencode2/bin/opencode",
      "serve",
      "--hostname=127.0.0.1",
      "--port=0",
      "--print-logs",
    ]);
  });
});

describe("buildOpenCodeCapabilityPartialFromInventory", () => {
  const inventory: OpenCodeInventory = {
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
    credentialFreeOllama: false,
    agents: [
      { id: "build", mode: "primary", hidden: false },
      { id: "general", mode: "subagent", hidden: false },
      { id: "compaction", mode: "primary", hidden: true },
      { id: "plan", mode: "primary", hidden: false },
    ],
    defaultModel: { providerID: "opencode-go", id: "deepseek-v4.1-flash" },
  };

  it("maps catalog models to composite ids with server-supplied labels", () => {
    const capabilities = buildOpenCodeCapabilityPartialFromInventory(inventory);
    expect(capabilities.models).toEqual(
      [
        { id: "opencode-go/deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash" },
        { id: "opencode/gpt-6-astra", label: "GPT-6 Astra" },
        { id: "opencode/tiny", label: "Tiny" },
      ].toSorted((left, right) => left.label.localeCompare(right.label)),
    );
  });

  it("maps providers to sub-provider groups by server name", () => {
    const capabilities = buildOpenCodeCapabilityPartialFromInventory(inventory);
    expect(capabilities.subProviders).toEqual([
      { id: "opencode-go", label: "OpenCode Go" },
      { id: "opencode", label: "OpenCode Zen" },
    ]);
  });

  it("falls back to the composite id when a provider has no name", () => {
    const capabilities = buildOpenCodeCapabilityPartialFromInventory({
      ...inventory,
      providers: [{ id: "opencode-go", name: "" }],
    });
    expect(capabilities.subProviders).toEqual([{ id: "opencode-go", label: "opencode-go" }]);
  });

  it("takes the effort ladder from the default model's variants", () => {
    const capabilities = buildOpenCodeCapabilityPartialFromInventory(inventory);
    expect(capabilities.efforts).toEqual(["low", "high", "max"]);
    expect(capabilities.defaultEffort).toBe("max");
    expect(capabilities.modelEfforts).toEqual({
      "opencode-go/deepseek-v4.1-flash": ["low", "high", "max"],
      "opencode/gpt-6-astra": ["low", "medium", "high", "xhigh"],
      "opencode/tiny": [],
    });
  });

  it("falls back to the weakest variant when the default ladder has no max tier", () => {
    const capabilities = buildOpenCodeCapabilityPartialFromInventory({
      ...inventory,
      defaultModel: { providerID: "opencode", id: "gpt-6-astra" },
    });
    expect(capabilities.efforts).toEqual(["low", "medium", "high", "xhigh"]);
    expect(capabilities.defaultEffort).toBe("low");
  });

  it("reports no efforts when the catalog has no default model", () => {
    const capabilities = buildOpenCodeCapabilityPartialFromInventory({
      ...inventory,
      defaultModel: undefined,
    });
    expect(capabilities.efforts).toEqual([]);
    expect(capabilities.defaultEffort).toBeUndefined();
  });

  it("advertises plan mode when the built-in plan agent is visible", () => {
    const capabilities = buildOpenCodeCapabilityPartialFromInventory(inventory);
    expect(capabilities.modes).toEqual(["agent", "plan"]);
  });

  it("omits plan mode when the plan agent is hidden or absent", () => {
    const hidden = buildOpenCodeCapabilityPartialFromInventory({
      ...inventory,
      agents: inventory.agents.map((agent) =>
        agent.id === "plan" ? { ...agent, hidden: true } : agent,
      ),
    });
    expect(hidden.modes).toEqual(["agent"]);

    const absent = buildOpenCodeCapabilityPartialFromInventory({
      ...inventory,
      agents: [{ id: "build", mode: "primary", hidden: false }],
    });
    expect(absent.modes).toEqual(["agent"]);
  });

  it("maps per-model context limits to context size options", () => {
    const capabilities = buildOpenCodeCapabilityPartialFromInventory(inventory);
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

describe("OpenCode prompt formatting", () => {
  it("places attachments on their own line with \\n\\n separator", () => {
    const adapter = createOpenCodeAdapter();
    const attachmentPath = join(homedir(), ".poracode", "attachments", "draft", "image.png");
    const prompt = adapter.formatPromptSegments?.([
      { kind: "text", content: "can you see this image?" },
      { kind: "attachment", path: attachmentPath },
    ]);

    expect(prompt).toBe("can you see this image?\n\n@~/.poracode/attachments/draft/image.png ");
  });

  it("wraps multiline prompts in bracketed paste in buildDirectInput", () => {
    const adapter = createOpenCodeAdapter();
    expect(adapter.buildDirectInput?.("line one\nline two")).toEqual([
      "\x1b[200~line one\nline two\x1b[201~",
      "@wait:60",
      "\r",
    ]);
  });

  it("does not wrap single-line prompts in bracketed paste", () => {
    const adapter = createOpenCodeAdapter();
    expect(adapter.buildDirectInput?.("just one line")).toEqual([
      "just one line",
      "@wait:60",
      "\r",
    ]);
  });
});

describe("opencodeOscTitleHint", () => {
  it("flips to working when title is prefixed by a braille spinner glyph", () => {
    expect(opencodeOscTitleHint({ code: 2, text: "⠋ working… (project)" })).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
  });

  it("ignores titles without a braille prefix", () => {
    expect(opencodeOscTitleHint({ code: 2, text: "OpenCode (project)" })).toBeNull();
  });
});

describe("opencodeOscHint", () => {
  it("treats OSC 9;4;0 (remove progress) as idle", () => {
    expect(opencodeOscHint({ code: 9, body: "4;0", title: "", payload: undefined })).toEqual({
      status: "idle",
      attention: "none",
      corroborated: true,
    });
  });

  it("treats OSC 9;4;1 / 9;4;3 (set / indeterminate) as working", () => {
    expect(opencodeOscHint({ code: 9, body: "4;1;42", title: "", payload: undefined })).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
    expect(opencodeOscHint({ code: 9, body: "4;3;0", title: "", payload: undefined })).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
  });

  it("falls back to needs_approval on permission keywords in non-progress notifications", () => {
    expect(
      opencodeOscHint({
        code: 9,
        body: "permission requested",
        title: "OpenCode",
        payload: undefined,
      }),
    ).toEqual({ status: "needs_approval", attention: "needs_approval", corroborated: true });
  });
});

describe("detectOpenCodeTerminalStatus", () => {
  it("detects working from 'esc to interrupt' line", () => {
    expect(detectOpenCodeTerminalStatus("Working... (esc to interrupt)")?.status).toBe("working");
  });

  it("detects working from the V2 TUI's 'esc interrupt' status bar", () => {
    // Live-verified against 0.0.0-beta-19425: while a turn runs, the status
    // bar shows "esc interrupt" without the V1 "to".
    expect(
      detectOpenCodeTerminalStatus(
        "Build · DeepSeek V4.1 Flash · 4.9s · 237.6 tok/s — esc interrupt",
      )?.status,
    ).toBe("working");
  });

  it("recognizes completion before a large sidebar redraw", () => {
    expect(
      detectOpenCodeTerminalStatus(
        "Build · Muse Spark 1.3 Free · 2.6s · 77.7 tok/s" + " ".repeat(5000),
      )?.status,
    ).toBe("idle");
  });

  it("detects needs_approval from a [y/n] prompt", () => {
    expect(detectOpenCodeTerminalStatus("Allow this tool? [y/n]")?.status).toBe("needs_approval");
  });

  it("falls back to idle on a 'Type a message' footer", () => {
    expect(detectOpenCodeTerminalStatus("Type a message")).toEqual({
      status: "idle",
      attention: "none",
      corroborated: false,
    });
  });

  it("detects idle from the keybind footer painted only in input state", () => {
    const text = "                                  tab agentsctrl+p commands";
    expect(detectOpenCodeTerminalStatus(text)).toEqual({
      status: "idle",
      attention: "none",
      corroborated: true,
    });
  });

  it("returns null when no pattern matches", () => {
    expect(detectOpenCodeTerminalStatus("nothing of note here")).toBeNull();
  });

  it("prefers a tail approval prompt over an earlier working line", () => {
    const text = "Working... (esc to interrupt)\nfinished step\nAllow tool? [y/n]";
    expect(detectOpenCodeTerminalStatus(text)?.status).toBe("needs_approval");
  });
});

describe("createOpenCodeAdapter", () => {
  it.each(["posix", "windows", "wsl"] as const)(
    "updates the managed CLI within the supported major on %s",
    (envKind) => {
      expect(
        resolveSharedUpdateCommand({
          update: openCodeDetectionSpec.update,
          executablePath: "/usr/local/lib/node_modules/@opencode/cli/bin/opencode.exe",
          envKind,
          skipBuiltIn: true,
        }),
      ).toMatchObject({
        strategy: "installer",
        args: expect.arrayContaining([
          expect.stringContaining(
            envKind === "windows"
              ? 'npm install --ignore-scripts --include=optional --prefix "$env:USERPROFILE/.opencode2" "@opencode/cli@^2.4.1"'
              : 'npm install --ignore-scripts --include=optional --prefix "$HOME/.opencode2" "@opencode/cli@^2.4.1"',
          ),
        ]),
      });
    },
  );

  it("declares identity, install/update metadata, and shared skill roots", () => {
    const adapter = createOpenCodeAdapter();
    expect(adapter.kind).toBe("opencode");
    expect(adapter.label).toBe("OpenCode");
    expect(adapter.binary).toBe("opencode");
    expect(adapter.poolsDirectoryMcp).toBe(true);
    expect(adapter.listNativePlugins).toBeTypeOf("function");
    expect(adapter.update?.latestVersionUrls).toEqual([
      "https://registry.npmjs.org/@opencode%2Fcli/latest",
    ]);
    expect(adapter.update?.builtIn).toBeUndefined();
    const login =
      typeof openCodeDetectionSpec.loginCommand === "function"
        ? openCodeDetectionSpec.loginCommand({
            location: { kind: "posix", path: "/repo" },
            executablePath: "/path with spaces/opencode.exe",
          })
        : undefined;
    expect(login).toBe("'/path with spaces/opencode.exe' auth login");
    expect(adapter.skillSupport?.roots.map((root) => root.id)).toEqual([
      "opencode",
      "opencode-singular",
      "claude",
      "agents",
    ]);
    expect(adapter.skillSupport?.precedence).toEqual({
      global: ["opencode", "opencode-singular", "agents", "claude"],
      project: ["opencode", "opencode-singular", "agents", "claude"],
    });
  });

  it("ships GUI default presentation, dynamic per-thread MCP defaults, and native one-shot support", () => {
    const adapter = createOpenCodeAdapter();
    expect(adapter.capabilities).toMatchObject({
      presentationMode: "gui",
      presentationModes: ["terminal", "gui"],
      defaultApprovalPolicy: "yolo",
      bypassPermissions: { approvalPolicy: "yolo" },
      mcpScope: { terminal: "launch", gui: "always" },
      crossagentMcpRouting: "provider-session",
      supportsResume: true,
      supportsOneShot: true,
    });
    expect(adapter.capabilities.mcpConfigSource).toBeUndefined();
    expect(adapter.pluginId).toBeUndefined();
    expect(adapter.runOneShot).toBeTypeOf("function");
    expect(adapter.createInitialSessionRef()).toBeUndefined();
  });

  it("uses structured preparation for terminal resume configuration", async () => {
    const adapter = createOpenCodeAdapter();
    const create = vi.spyOn(OpenCodeSession, "create").mockRejectedValueOnce(new Error("prepared"));
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
      await expect(
        adapter.buildResumeArgv(
          { kind: "posix", path: "/repo" },
          { model: "" },
          "",
          createKnownSessionRef("ses_resume"),
          undefined,
        ),
      ).rejects.toThrow("database was not resolved");
    } finally {
      create.mockRestore();
    }
  });

  it("launches through the managed server with the deferred prompt path", async () => {
    const adapter = createOpenCodeAdapter();
    const launch = await adapter.buildLaunchArgv(
      { kind: "posix", path: "/repo" },
      { model: "", approvalPolicy: "yolo" },
      "first prompt",
      undefined,
      undefined,
    );
    expect(launch).toEqual({
      binary: "opencode",
      args: ["--server", "http://127.0.0.1:4300", "--prompt", "first prompt"],
      env: { OPENCODE_PASSWORD: "fixture-password" },
      cleanup: expect.any(Function),
      preferShell: true,
    });
    expect(adapter.shouldDeferPromptToTerminal?.({ model: "" })).toBe(true);
    expect(disposeTerminalServer).not.toHaveBeenCalled();
    await launch.cleanup?.();
    expect(disposeTerminalServer).toHaveBeenCalledExactlyOnceWith({ closeServerIfIdle: true });
  });

  it("interrupts the prepared terminal session before releasing its server", async () => {
    const adapter = createOpenCodeAdapter();
    const location = { kind: "posix" as const, path: "/repo" };
    rememberOpenCodeSessionDatabase(location, "ses_terminal", "native");
    const launch = await adapter.buildLaunchArgv(location, { model: "" }, "", undefined, {
      resumeThreadId: "ses_terminal",
    });
    await launch.cleanup?.();
    await launch.cleanup?.();
    expect(interruptTerminalSession).toHaveBeenCalledExactlyOnceWith(
      { sessionID: "ses_terminal" },
      { signal: expect.any(AbortSignal) },
    );
    expect(interruptTerminalSession.mock.invocationCallOrder[0]).toBeLessThan(
      disposeTerminalServer.mock.invocationCallOrder[0]!,
    );
    expect(disposeTerminalServer).toHaveBeenCalledExactlyOnceWith({ closeServerIfIdle: true });
  });

  it("releases the terminal server even if interruption fails", async () => {
    interruptTerminalSession.mockRejectedValue(new Error("server exited"));
    const adapter = createOpenCodeAdapter();
    const location = { kind: "posix" as const, path: "/repo" };
    rememberOpenCodeSessionDatabase(location, "ses_terminal", "native");
    const launch = await adapter.buildResumeArgv(
      location,
      { model: "" },
      "",
      createKnownSessionRef("ses_terminal"),
      undefined,
    );
    await expect(launch.cleanup?.()).rejects.toThrow("server exited");
    expect(disposeTerminalServer).toHaveBeenCalledWith({ closeServerIfIdle: true });
  });

  it("resumes on the pooled MCP server instead of the native background service", async () => {
    const adapter = createOpenCodeAdapter();
    rememberOpenCodeSessionDatabase({ kind: "posix", path: "/repo" }, "ses_launch", "native");
    rememberOpenCodeSessionDatabase({ kind: "posix", path: "/repo" }, "ses_resume", "native");
    const launch = await adapter.buildLaunchArgv(
      { kind: "posix", path: "/repo" },
      { model: "" },
      "",
      undefined,
      { resumeThreadId: "ses_launch" },
    );
    expect(launch.args).toEqual(["--server", "http://127.0.0.1:4300", "--session", "ses_launch"]);
    expect(launch.sessionRef).toMatchObject({ providerSessionId: "ses_launch" });

    const resume = await adapter.buildResumeArgv(
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
    expect(resume.args).toEqual([
      "--server",
      "http://127.0.0.1:4300",
      "--session",
      "ses_resume",
      "--prompt",
      "next",
    ]);
    expect(acquireOpenCodeServer).toHaveBeenLastCalledWith(
      expect.objectContaining({
        resumeSessionId: "ses_resume",
        mcpServers: [expect.objectContaining({ name: "browser" })],
      }),
    );
    expect(resume.env?.OPENCODE_CONFIG_CONTENT).toBeUndefined();
    expect(resume.args.join(" ")).not.toContain("fixture-password");
  });

  it("keeps the legacy database when attaching both launch and resume terminals", async () => {
    const adapter = createOpenCodeAdapter();
    const location = { kind: "posix", path: "/repo" } as const;
    rememberOpenCodeSessionDatabase(location, "ses_old", "legacy-isolated");
    const options = {
      resumeThreadId: "ses_old",
      mcpServers: [
        {
          id: "browser",
          name: "browser",
          timeoutMs: 30_000,
          transport: { type: "http" as const, url: "http://127.0.0.1:9/mcp", headers: {} },
        },
      ],
    };
    const launch = await adapter.buildLaunchArgv(location, { model: "" }, "", undefined, options);
    const resume = await adapter.buildResumeArgv(
      location,
      { model: "" },
      "",
      createKnownSessionRef("ses_old"),
      options,
    );
    expect(launch.env).toEqual(resume.env);
    expect(launch.env?.OPENCODE_DB).toBe("opencode-v2.db");
    expect(launch.env?.OPENCODE_PASSWORD).toBe("fixture-password");
  });

  it("attaches to the managed server even with an explicitly empty MCP set", async () => {
    const adapter = createOpenCodeAdapter();
    rememberOpenCodeSessionDatabase({ kind: "posix", path: "/repo" }, "ses_resume", "native");
    const resume = await adapter.buildResumeArgv(
      { kind: "posix", path: "/repo" },
      { model: "", approvalPolicy: "yolo" },
      "next",
      createKnownSessionRef("ses_resume"),
      { mcpServers: [] },
    );
    expect(resume.env).toEqual({ OPENCODE_PASSWORD: "fixture-password" });
    expect(acquireOpenCodeServer).toHaveBeenCalledWith(
      expect.objectContaining({
        mcpServers: [],
      }),
    );
  });

  it("releases the terminal lease if constructing authenticated argv fails", async () => {
    const password = Promise.reject(new Error("password unavailable"));
    void password.catch(() => undefined);
    vi.mocked(acquireOpenCodeServer).mockResolvedValueOnce({
      baseUrl: "http://127.0.0.1:4300",
      handle: { password },
      dispose: disposeTerminalServer,
    } as unknown as Awaited<ReturnType<typeof acquireOpenCodeServer>>);
    await expect(
      createOpenCodeAdapter().buildLaunchArgv(
        { kind: "posix", path: "/repo" },
        { model: "" },
        "",
        undefined,
      ),
    ).rejects.toThrow("password unavailable");
    expect(disposeTerminalServer).toHaveBeenCalledOnce();
  });

  it("dynamically refreshes terminal session permissions when sibling threads change directory MCPs", async () => {
    let directoryListeners: Array<() => void> = [];
    let directoryNames = ["poracode", "browser"];
    const unsubscribeMcp = vi.fn<() => void>();
    vi.mocked(acquireOpenCodeServer).mockResolvedValueOnce({
      baseUrl: "http://127.0.0.1:4300",
      handle: { password: Promise.resolve("fixture-password") },
      client: {
        session: {
          interrupt: interruptTerminalSession,
          update: updateTerminalSession,
        },
        event: {
          subscribe: vi.fn<() => void>(),
        },
      },
      getDirectoryMcpNames: () => directoryNames,
      onDirectoryMcpChanged: (listener: () => void) => {
        directoryListeners.push(listener);
        return unsubscribeMcp;
      },
      dispose: disposeTerminalServer,
    } as unknown as Awaited<ReturnType<typeof acquireOpenCodeServer>>);

    const location = { kind: "posix" as const, path: "/repo" };
    rememberOpenCodeSessionDatabase(location, "ses_terminal", "native");
    const launch = await createOpenCodeAdapter().buildLaunchArgv(
      location,
      { model: "", approvalPolicy: "yolo" },
      "",
      undefined,
      {
        resumeThreadId: "ses_terminal",
        mcpServers: [
          {
            id: "app-controls",
            name: "poracode",
            timeoutMs: 30_000,
            transport: { type: "http", url: "http://127.0.0.1:9/mcp", headers: {} },
          },
        ],
      },
    );

    expect(directoryListeners).toHaveLength(1);
    directoryListeners[0]?.();
    await Promise.resolve();
    expect(updateTerminalSession).toHaveBeenCalledWith({
      sessionID: "ses_terminal",
      permissions: [
        { action: "*", resource: "*", effect: "allow" },
        { action: "question", resource: "*", effect: "allow" },
        { action: "browser_*", resource: "*", effect: "deny" },
      ],
    });

    // Duplicate notifications with identical permissions are deduped.
    directoryListeners[0]?.();
    await Promise.resolve();
    expect(updateTerminalSession).toHaveBeenCalledTimes(1);

    // Sibling thread adds chrome MCP; terminal session denies chrome_* dynamically.
    directoryNames = ["poracode", "browser", "chrome"];
    directoryListeners[0]?.();
    await Promise.resolve();
    expect(updateTerminalSession).toHaveBeenCalledTimes(2);
    expect(updateTerminalSession).toHaveBeenLastCalledWith({
      sessionID: "ses_terminal",
      permissions: [
        { action: "*", resource: "*", effect: "allow" },
        { action: "question", resource: "*", effect: "allow" },
        { action: "browser_*", resource: "*", effect: "deny" },
        { action: "chrome_*", resource: "*", effect: "deny" },
      ],
    });

    await launch.cleanup?.();
    expect(unsubscribeMcp).toHaveBeenCalledOnce();
  });

  it("streams L1 terminal status updates from the pooled server SSE hub and unsubscribes on cleanup", async () => {
    const location = { kind: "posix" as const, path: "/repo" };
    rememberOpenCodeSessionDatabase(location, "ses_terminal", "native");
    const statusUpdates: Array<{ status: string; attention: string }> = [];
    const launch = await createOpenCodeAdapter().buildLaunchArgv(
      location,
      { model: "", approvalPolicy: "default" },
      "",
      undefined,
      {
        resumeThreadId: "ses_terminal",
        onTerminalStatusUpdate: (change) => statusUpdates.push(change),
      },
    );

    expect(subscribeOpenCodeServerEvents).toHaveBeenCalledOnce();
    const sub = vi.mocked(subscribeOpenCodeServerEvents).mock.calls[0]?.[0]?.subscription;
    expect(sub?.sessionId()).toBe("ses_terminal");

    sub?.onEvent({
      type: "session.execution.started",
      data: { sessionID: "ses_terminal" },
    } as unknown as V2Event);
    sub?.onEvent({
      type: "permission.asked",
      data: { id: "perm_1", sessionID: "ses_terminal" },
    } as unknown as V2Event);
    sub?.onEvent({
      type: "form.created",
      data: { form: { id: "form_1", sessionID: "ses_terminal" } },
    } as unknown as V2Event);
    sub?.onEvent({
      type: "permission.replied",
      data: { requestID: "perm_1", sessionID: "ses_terminal" },
    } as unknown as V2Event);
    sub?.onEvent({
      type: "form.replied",
      data: { id: "form_1", sessionID: "ses_terminal" },
    } as unknown as V2Event);
    sub?.onEvent({
      type: "session.idle",
      data: { sessionID: "ses_terminal" },
    } as unknown as V2Event);

    expect(statusUpdates).toEqual([
      { status: "working", attention: "working" },
      { status: "needs_approval", attention: "needs_approval" },
      { status: "needs_approval", attention: "needs_approval" },
      { status: "needs_reply", attention: "needs_reply" },
      { status: "working", attention: "working" },
      { status: "idle", attention: "none" },
    ]);

    await launch.cleanup?.();
    expect(unsubscribeTerminalEvents).toHaveBeenCalledOnce();
  });
});
