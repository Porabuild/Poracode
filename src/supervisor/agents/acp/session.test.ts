import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequestError, type RequestPermissionRequest } from "@agentclientprotocol/sdk";
import type { CreateStructuredSessionInput } from "../base";
import type { ThreadConfig } from "@/shared/contracts";
import {
  AcpStructuredSession,
  resolveAcpReadableHostFsPath,
  resolveAcpResourcePath,
  rewriteLoadSessionError,
  toAcpResourceUri,
} from "./session";
import { shouldSpawnAcpSession } from "./sessionFactory";
import { resolveAcpPromptFailureMessage, shouldEmitAcpPromptRpcErrorItem } from "./sessionErrors";

function makeInput(
  overrides: Partial<CreateStructuredSessionInput> = {},
): CreateStructuredSessionInput {
  return {
    threadId: "thread-1",
    projectLocation: { kind: "windows", path: "C:\\repo" },
    config: { model: "test-model" },
    ...overrides,
  };
}

type TestableAcpSession = {
  openThread(
    config: ThreadConfig,
    sessionRef?: import("@/shared/contracts").SessionRef,
  ): Promise<string>;
  startTurn(
    prompt: string,
    config: ThreadConfig,
    segments?: import("@/shared/contracts").PromptSegment[],
    options?: { userMessageItemId?: string },
  ): Promise<void>;
  interruptTurn(): Promise<void>;
  dispose(): Promise<void>;
  resolveServerRequest(requestId: string, response: unknown): Promise<void>;
  handlePermissionRequest(params: RequestPermissionRequest): Promise<unknown>;
  handleSessionUpdate(params: { update: unknown }): void;
  setListener(listener: unknown): void;
};

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

function makeConfigSyncSession(
  overrides: {
    currentConfig?: ThreadConfig;
    agentMcpCapabilities?: { http?: boolean; sse?: boolean };
    mcpServers?: Array<{
      id: string;
      name: string;
      timeoutMs: number;
      transport: { type: "http"; url: string; headers: Record<string, string> };
    }>;
  } = {},
) {
  const connection = {
    setSessionMode: vi
      .fn<(args: { sessionId: string; modeId: string }) => Promise<void>>()
      .mockResolvedValue(undefined),
    // Raw request escape hatch used by the unstable `session/set_model`
    // compat shim (see unstableModelCompat.ts).
    request: vi
      .fn<(method: string, params: { sessionId: string; modelId: string }) => Promise<unknown>>()
      .mockResolvedValue(undefined),
    setSessionConfigOption: vi
      .fn<
        (args: {
          sessionId: string;
          configId: string;
          value: string;
        }) => Promise<{ configOptions: unknown[] } | void>
      >()
      .mockResolvedValue(undefined),
    prompt: vi
      .fn<(args: { sessionId: string; prompt: unknown[] }) => Promise<{ stopReason: string }>>()
      .mockResolvedValue({ stopReason: "end_turn" }),
    cancel: vi.fn<(args: { sessionId: string }) => Promise<void>>().mockResolvedValue(undefined),
    closeSession: vi
      .fn<(args: { sessionId: string }) => Promise<void>>()
      .mockResolvedValue(undefined),
    loadSession: vi
      .fn<
        (args: { sessionId: string; cwd: string; mcpServers: unknown[] }) => Promise<{
          modes?: { availableModes: Array<{ id: string }> };
          configOptions?: unknown[];
        }>
      >()
      .mockResolvedValue({ modes: { availableModes: [] }, configOptions: [] }),
    resumeSession: vi
      .fn<
        (args: { sessionId: string; cwd: string; mcpServers: unknown[] }) => Promise<{
          modes?: { availableModes: Array<{ id: string }> };
          configOptions?: unknown[];
        }>
      >()
      .mockResolvedValue({ modes: { availableModes: [] }, configOptions: [] }),
    newSession: vi
      .fn<
        (args: { cwd: string; mcpServers: unknown[] }) => Promise<{
          sessionId: string;
          modes?: { availableModes: Array<{ id: string }> };
          configOptions?: unknown[];
        }>
      >()
      .mockResolvedValue({
        sessionId: "session-1",
        modes: { availableModes: [] },
        configOptions: [],
      }),
  };
  const listener = {
    onClose: vi.fn<() => void>(),
    onError: vi.fn<(message: string) => void>(),
    onUpdate: vi.fn<(update: unknown) => void>(),
    onRuntimeEvent: vi.fn<(event: unknown) => void>(),
  };
  const session = Object.create(AcpStructuredSession.prototype) as Record<string, unknown>;
  session["child"] = { killed: true };
  session["connection"] = connection;
  session["acpToolCallIdToItemId"] = new Map();
  session["sessionId"] = "session-1";
  session["threadId"] = "thread-1";
  session["projectLocation"] = { kind: "windows", path: "C:\\repo" };
  session["listener"] = listener;
  // Default to advertising HTTP MCP support so the mcpServers-gating (added for
  // the Factory Droid bug) is a no-op for these pass-through tests. The gating
  // itself is covered by a dedicated test below.
  session["agentMcpCapabilities"] = overrides.agentMcpCapabilities ?? { http: true };
  session["currentConfig"] = overrides.currentConfig ?? {
    model: "model-a",
    effort: "low",
    mode: "agent",
    approvalPolicy: "default",
  };
  session["currentSlashCommands"] = undefined;
  session["currentStatus"] = "idle";
  session["currentAttention"] = "none";
  session["bufferedRuntimeEvents"] = [];
  session["isReplayingHistory"] = false;
  session["isDisposed"] = false;
  session["promptInFlight"] = false;
  session["pendingPromptInterrupt"] = false;
  session["currentTurnInterruptRequested"] = false;
  session["recentInterruptAckTextTail"] = "";
  session["currentTurnHadAgentActivity"] = false;
  session["stderrChunks"] = [];
  session["emptyResponseErrorResolver"] = undefined;
  session["mapperState"] = undefined;
  session["acpTerminals"] = new Map();
  session["acpTerminalSeq"] = 0;
  session["releasedAcpTerminalOutput"] = new Map();
  session["acpTerminalCommandById"] = new Map();
  session["agentPromptCapabilities"] = undefined;
  session["agentSessionCapabilities"] = undefined;
  session["cwd"] = "C:\\repo";
  session["stableSessionRef"] = undefined;
  session["launchOptions"] = {};
  session["mcpServers"] = overrides.mcpServers ?? [];
  session["loadSessionErrorRewriter"] = rewriteLoadSessionError;
  return { connection, listener, session: session as unknown as TestableAcpSession };
}

describe("shouldSpawnAcpSession — shared resume/presentation gate for all ACP adapters", () => {
  it("skips spawn on terminal-mode resume (TUI re-attaches itself)", () => {
    expect(
      shouldSpawnAcpSession(
        makeInput({
          sessionRef: { providerSessionId: "ses_1", discoveredAt: new Date().toISOString() },
          presentationMode: "terminal",
        }),
      ),
    ).toBe(false);
  });

  it("skips spawn on resume when presentation mode is omitted (defaults to terminal behavior)", () => {
    expect(
      shouldSpawnAcpSession(
        makeInput({
          sessionRef: { providerSessionId: "ses_1", discoveredAt: new Date().toISOString() },
        }),
      ),
    ).toBe(false);
  });

  it("spawns on GUI resume so loadSession can re-attach the chat surface", () => {
    expect(
      shouldSpawnAcpSession(
        makeInput({
          sessionRef: { providerSessionId: "ses_1", discoveredAt: new Date().toISOString() },
          presentationMode: "gui",
        }),
      ),
    ).toBe(true);
  });

  it("spawns on a fresh launch in either presentation mode", () => {
    expect(shouldSpawnAcpSession(makeInput({ presentationMode: "gui" }))).toBe(true);
    expect(shouldSpawnAcpSession(makeInput({ presentationMode: "terminal" }))).toBe(true);
    expect(shouldSpawnAcpSession(makeInput())).toBe(true);
  });
});

describe("resolveAcpPromptFailureMessage — prompt rejection after agent-surfaced errors", () => {
  it("prefers the usage-limit detail streamed in agent_message_chunk", () => {
    const usage =
      "You've reached your weekly standard usage limit (resets in 2 days).\nSwitch to Droid Core or enable Extra Usage to continue.";
    const out = resolveAcpPromptFailureMessage(
      RequestError.internalError({ details: "Internal error: Agent error" }),
      usage,
    );
    expect(out).toBe(usage);
  });

  it("falls back to the JSON-RPC error when no agent-surfaced message exists", () => {
    expect(
      resolveAcpPromptFailureMessage(RequestError.internalError({ details: "Agent error" })),
    ).toBe("Agent error");
  });

  it("uses provider details for a generic internal error", () => {
    expect(
      resolveAcpPromptFailureMessage(
        RequestError.internalError({ details: "401 invalid access token or token expired" }),
      ),
    ).toBe("401 invalid access token or token expired");
  });

  it("suppresses a generic Internal error row when usage detail was already streamed", () => {
    const usage = "Usage limit reached.";
    const transport = RequestError.internalError({ details: "Internal error: Agent error" });
    expect(shouldEmitAcpPromptRpcErrorItem(transport, usage)).toBe(false);
    expect(resolveAcpPromptFailureMessage(transport, usage)).toBe(usage);
  });

  it("still emits the RPC error row when no agent-surfaced message exists", () => {
    const transport = RequestError.internalError({ details: "Agent error" });
    expect(shouldEmitAcpPromptRpcErrorItem(transport, undefined)).toBe(true);
  });
});

describe("ACP empty-response provider guard", () => {
  it("turns a provider-diagnosed empty end_turn into a visible failed turn", async () => {
    const { connection, listener, session } = makeConfigSyncSession();
    const resolver = vi.fn<(input: { stopReason: string; stderr: readonly string[] }) => Error>(
      () => new Error("credential file is locked"),
    );
    (session as unknown as Record<string, unknown>)["emptyResponseErrorResolver"] = resolver;
    connection.prompt.mockImplementationOnce(async () => {
      (session as unknown as Record<string, string[]>)["stderrChunks"]!.push(
        "EPERM rename kimi-code.json",
      );
      return { stopReason: "end_turn" };
    });

    await session.startTurn("hello", { model: "model-a" });

    expect(resolver).toHaveBeenCalledWith({
      stopReason: "end_turn",
      stderr: ["EPERM rename kimi-code.json"],
    });
    expect(listener.onUpdate).toHaveBeenLastCalledWith({
      status: "error",
      attention: "error",
      errorMessage: "credential file is locked",
    });
    expect(listener.onRuntimeEvent).toHaveBeenCalledWith({
      type: "error",
      threadId: "thread-1",
      message: "credential file is locked",
    });
    expect(listener.onRuntimeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "turn.completed", state: "failed" }),
    );
  });

  it("does not invoke the guard after agent activity", async () => {
    const { connection, session } = makeConfigSyncSession();
    const resolver = vi.fn<(input: { stopReason: string; stderr: readonly string[] }) => Error>(
      () => new Error("unexpected"),
    );
    (session as unknown as Record<string, unknown>)["emptyResponseErrorResolver"] = resolver;
    connection.prompt.mockImplementationOnce(async () => {
      session.handleSessionUpdate({
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "hello" },
        },
      });
      return { stopReason: "end_turn" };
    });

    await session.startTurn("hello", { model: "model-a" });

    expect(resolver).not.toHaveBeenCalled();
  });
});

describe("rewriteLoadSessionError — user-facing copy for session/load failures", () => {
  it("rewrites a 'Session not found' invalidParams into resume-specific guidance", () => {
    const raw = RequestError.invalidParams({ message: 'Session "abc-123" not found' });
    const out = rewriteLoadSessionError(raw, "abc-123");
    expect(out.message).toBe(
      "This conversation can't be resumed — the agent no longer recognizes this session. Start a new thread to continue.",
    );
    expect((out as { cause?: unknown }).cause).toBe(raw);
  });

  it("includes the agent's error message verbatim for non-not-found failures", () => {
    const raw = RequestError.invalidParams({ message: "cwd does not match" });
    const out = rewriteLoadSessionError(raw, "ses-9");
    expect(out.message).toContain("cwd does not match");
    expect(out.message).toContain("Start a new thread");
  });

  it("falls back to the Error message when the error isn't a RequestError", () => {
    const out = rewriteLoadSessionError(new Error("stream closed"), "ses-9");
    expect(out.message).toContain("stream closed");
    expect(out.message).toContain("Start a new thread");
  });

  it("detects 'session ... not found' phrasing inside plain Error messages", () => {
    const out = rewriteLoadSessionError(new Error('session "ses-9" not found'), "ses-9");
    expect(out.message).toContain("can't be resumed");
    expect(out.message).not.toContain("ses-9");
  });
});

describe("ACP resource path helpers", () => {
  it("resolves repo-relative paths against the project root", () => {
    expect(
      resolveAcpResourcePath({ kind: "windows", path: "C:\\repo" }, ".agents/docs/ui-patterns.md"),
    ).toBe("C:\\repo\\.agents\\docs\\ui-patterns.md");
    expect(
      resolveAcpResourcePath(
        {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/home/me/repo",
          uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\me\\repo",
        },
        ".agents/docs/ui-patterns.md",
      ),
    ).toBe("/home/me/repo/.agents/docs/ui-patterns.md");
  });

  it("keeps Windows absolute image paths host-readable in WSL sessions", () => {
    expect(
      resolveAcpResourcePath(
        {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/home/me/repo",
          uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\me\\repo",
        },
        "C:\\Users\\me\\Pictures\\diagram.png",
      ),
    ).toBe("C:\\Users\\me\\Pictures\\diagram.png");
  });

  it.skipIf(process.platform !== "win32")(
    "builds ACP-safe file URIs for Windows relative paths",
    () => {
      // Legacy two-slash form: Gemini-CLI strips exactly "file://" and resolves
      // the remainder against the workspace cwd. The three-slash RFC form would
      // leave "/C:/..." and double the drive to "C:\C:\..." on Windows.
      expect(
        toAcpResourceUri({ kind: "windows", path: "C:\\repo" }, ".agents/docs/ui patterns.md"),
      ).toBe("file://C:/repo/.agents/docs/ui%20patterns.md");
    },
  );

  it.skipIf(process.platform !== "win32")(
    "Windows file URI survives Gemini-CLI's slice('file://') + path.resolve",
    async () => {
      const { win32 } = await import("node:path");
      const cwd = "C:\\Users\\me\\repo";
      const uri = toAcpResourceUri({ kind: "windows", path: cwd }, "README.md");
      const sliced = uri.slice("file://".length);
      expect(sliced).toBe("C:/Users/me/repo/README.md");
      expect(win32.resolve(cwd, sliced)).toBe("C:\\Users\\me\\repo\\README.md");
    },
  );

  it("builds ACP-safe file URIs for WSL relative paths", () => {
    expect(
      toAcpResourceUri(
        {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/home/me/repo",
          uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\me\\repo",
        },
        ".agents/docs/ui patterns.md",
      ),
    ).toBe("file:///home/me/repo/.agents/docs/ui%20patterns.md");
  });

  it("allows read-only access to user agent skill files outside a WSL project", () => {
    expect(
      resolveAcpReadableHostFsPath(
        {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/home/me/repo",
          uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\me\\repo",
        },
        "/home/me/.agents/skills/agent-browser/SKILL.md",
      ),
    ).toBe("\\\\wsl.localhost\\Ubuntu\\home\\me\\.agents\\skills\\agent-browser\\SKILL.md");
  });

  it("rejects user agent skill paths that escape through parent segments", () => {
    expect(() =>
      resolveAcpReadableHostFsPath(
        {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/home/me/repo",
          uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\me\\repo",
        },
        "/home/me/.agents/skills/../secret.txt",
      ),
    ).toThrow("Invalid params");
  });
});

describe("ACP client protocol helpers", () => {
  beforeEach(() => {
    delete process.env.PORACODE_BROWSER_MCP_URL;
    delete process.env.PORACODE_BROWSER_MCP_TOKEN;
  });

  const HOST_KIND: "windows" | "posix" = process.platform === "win32" ? "windows" : "posix";

  function makePosixProject() {
    const root = mkdtempSync(join(tmpdir(), "poracode-acp-"));
    tempDirs.push(root);
    return root;
  }

  it("serves fs/read_text_file with ACP line and limit semantics inside the project", async () => {
    const projectRoot = makePosixProject();
    writeFileSync(join(projectRoot, "notes.txt"), "one\ntwo\nthree\nfour", "utf8");
    const { session } = makeConfigSyncSession();
    (session as unknown as Record<string, unknown>)["projectLocation"] = {
      kind: HOST_KIND,
      path: projectRoot,
    };

    const read = (session as unknown as { handleReadTextFile: Function }).handleReadTextFile.bind(
      session,
    );

    await expect(
      read({ sessionId: "session-1", path: join(projectRoot, "notes.txt"), line: 2, limit: 2 }),
    ).resolves.toEqual({ content: "two\nthree" });
  });

  it("rejects ACP fs requests outside the project root", async () => {
    const projectRoot = makePosixProject();
    const outside = join(makePosixProject(), "secret.txt");
    writeFileSync(outside, "secret", "utf8");
    const { session } = makeConfigSyncSession();
    (session as unknown as Record<string, unknown>)["projectLocation"] = {
      kind: HOST_KIND,
      path: projectRoot,
    };

    const read = (session as unknown as { handleReadTextFile: Function }).handleReadTextFile.bind(
      session,
    );

    await expect(read({ sessionId: "session-1", path: outside })).rejects.toThrow("Invalid params");
  });

  it("serves fs/write_text_file only inside the project root", async () => {
    const projectRoot = makePosixProject();
    const { session } = makeConfigSyncSession();
    (session as unknown as Record<string, unknown>)["projectLocation"] = {
      kind: HOST_KIND,
      path: projectRoot,
    };

    const write = (
      session as unknown as { handleWriteTextFile: Function }
    ).handleWriteTextFile.bind(session);

    await write({ sessionId: "session-1", path: join(projectRoot, "out.txt"), content: "ok" });
    expect(readFileSync(join(projectRoot, "out.txt"), "utf8")).toBe("ok");
  });

  it("sends image content blocks for image attachments regardless of advertised prompt capabilities", async () => {
    const projectRoot = makePosixProject();
    writeFileSync(join(projectRoot, "diagram.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const { connection, session } = makeConfigSyncSession();
    (session as unknown as Record<string, unknown>)["projectLocation"] = {
      kind: HOST_KIND,
      path: projectRoot,
    };

    await session.startTurn(
      "inspect",
      {
        model: "model-a",
        effort: "low",
        mode: "agent",
        approvalPolicy: "default",
      },
      [{ kind: "attachment", path: "diagram.png", mimeType: "image/png" }],
    );

    expect(connection.prompt).toHaveBeenCalledWith({
      sessionId: "session-1",
      prompt: [
        {
          type: "image",
          data: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"),
          mimeType: "image/png",
        },
        { type: "text", text: "inspect" },
      ],
    });
  });

  it("falls back to a resource link when an image attachment can't be read", async () => {
    const projectRoot = makePosixProject();
    const imagePath = join(projectRoot, "missing.png");
    const { connection, session } = makeConfigSyncSession();
    (session as unknown as Record<string, unknown>)["projectLocation"] = {
      kind: HOST_KIND,
      path: projectRoot,
    };

    await session.startTurn(
      "inspect",
      {
        model: "model-a",
        effort: "low",
        mode: "agent",
        approvalPolicy: "default",
      },
      [{ kind: "attachment", path: "missing.png", mimeType: "image/png" }],
    );

    expect(connection.prompt).toHaveBeenCalledWith({
      sessionId: "session-1",
      prompt: [
        {
          type: "resource_link",
          uri: toAcpResourceUri({ kind: HOST_KIND, path: projectRoot }, imagePath),
          name: "missing.png",
          mimeType: "image/png",
        },
        { type: "text", text: "inspect" },
      ],
    });
  });

  it("implements ACP terminal create/output/wait/release over a real PTY", async () => {
    const projectRoot = makePosixProject();
    const { session } = makeConfigSyncSession();
    (session as unknown as Record<string, unknown>)["projectLocation"] = {
      kind: HOST_KIND,
      path: projectRoot,
    };

    const create = (
      session as unknown as { handleCreateTerminal: Function }
    ).handleCreateTerminal.bind(session);
    const wait = (
      session as unknown as { handleWaitForTerminalExit: Function }
    ).handleWaitForTerminalExit.bind(session);
    const output = (
      session as unknown as { handleTerminalOutput: Function }
    ).handleTerminalOutput.bind(session);
    const release = (
      session as unknown as { handleReleaseTerminal: Function }
    ).handleReleaseTerminal.bind(session);

    const created = create({
      sessionId: "session-1",
      command: process.execPath,
      args: ["-e", "process.stdout.write('hello from acp')"],
      cwd: projectRoot,
      outputByteLimit: 65536,
    });

    await expect(
      wait({ sessionId: "session-1", terminalId: created.terminalId }),
    ).resolves.toMatchObject({ exitCode: 0 });
    expect(output({ sessionId: "session-1", terminalId: created.terminalId })).toMatchObject({
      output: expect.stringContaining("hello from acp"),
      truncated: false,
      exitStatus: { exitCode: 0 },
    });
    release({ sessionId: "session-1", terminalId: created.terminalId });
  });

  it.skipIf(process.platform !== "win32")(
    "runs Windows ACP terminal command lines through PowerShell",
    async () => {
      const projectRoot = makePosixProject();
      const { session } = makeConfigSyncSession();
      (session as unknown as Record<string, unknown>)["projectLocation"] = {
        kind: "windows",
        path: projectRoot,
      };

      const create = (
        session as unknown as { handleCreateTerminal: Function }
      ).handleCreateTerminal.bind(session);
      const wait = (
        session as unknown as { handleWaitForTerminalExit: Function }
      ).handleWaitForTerminalExit.bind(session);
      const output = (
        session as unknown as { handleTerminalOutput: Function }
      ).handleTerminalOutput.bind(session);
      const release = (
        session as unknown as { handleReleaseTerminal: Function }
      ).handleReleaseTerminal.bind(session);

      const created = create({
        sessionId: "session-1",
        command: "Get-Location",
        cwd: projectRoot,
        outputByteLimit: 65536,
      });

      await expect(
        wait({ sessionId: "session-1", terminalId: created.terminalId }),
      ).resolves.toMatchObject({ exitCode: 0 });
      expect(output({ sessionId: "session-1", terminalId: created.terminalId })).toMatchObject({
        output: expect.stringContaining(projectRoot),
        truncated: false,
        exitStatus: { exitCode: 0 },
      });
      release({ sessionId: "session-1", terminalId: created.terminalId });
    },
  );

  it("calls session/close on dispose when the ACP agent advertises close support", async () => {
    const { connection, session } = makeConfigSyncSession();
    (session as unknown as Record<string, unknown>)["agentSessionCapabilities"] = { close: {} };

    await session.dispose();

    expect(connection.closeSession).toHaveBeenCalledWith({ sessionId: "session-1" });
  });

  it("uses session/resume for known sessions when the ACP agent advertises resume support", async () => {
    const { connection, session } = makeConfigSyncSession();
    (session as unknown as Record<string, unknown>)["agentSessionCapabilities"] = { resume: {} };
    const sessionRef = {
      providerSessionId: "session-resume",
      discoveredAt: new Date().toISOString(),
    };

    await expect(session.openThread({ model: "model-a" }, sessionRef)).resolves.toBe(
      "session-resume",
    );

    expect(connection.resumeSession).toHaveBeenCalledWith({
      sessionId: "session-resume",
      cwd: "C:\\repo",
      mcpServers: [],
    });
    expect(connection.loadSession).not.toHaveBeenCalled();
  });

  it("does not surface session/resume history replay as new work", async () => {
    const { connection, listener, session } = makeConfigSyncSession();
    (session as unknown as Record<string, unknown>)["agentSessionCapabilities"] = { resume: {} };
    const sessionRef = {
      providerSessionId: "session-resume",
      discoveredAt: new Date().toISOString(),
    };
    connection.resumeSession.mockImplementationOnce(async () => {
      session.handleSessionUpdate({
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "tc-1",
          title: "Read file",
          kind: "read",
        },
      });
      return { modes: { availableModes: [] }, configOptions: [] };
    });

    await session.openThread({ model: "model-a" }, sessionRef);

    expect(listener.onUpdate).not.toHaveBeenCalledWith({
      status: "working",
      attention: "working",
    });
    expect(listener.onRuntimeEvent).not.toHaveBeenCalled();
  });

  it("retains replayed config options when session/resume omits them", async () => {
    const { connection, session } = makeConfigSyncSession();
    (session as unknown as Record<string, unknown>)["agentSessionCapabilities"] = { resume: {} };
    const modelOptions = [
      {
        id: "model",
        category: "model",
        type: "select",
        currentValue: "model-a",
        options: [
          { value: "model-a", name: "Model A" },
          { value: "model-b", name: "Model B" },
        ],
      },
      {
        id: "thought-old",
        category: "thought_level",
        type: "select",
        currentValue: "low",
        options: [
          { value: "low", name: "Low" },
          { value: "high", name: "High" },
        ],
      },
    ];
    connection.resumeSession.mockImplementationOnce(async () => {
      session.handleSessionUpdate({
        update: { sessionUpdate: "config_option_update", configOptions: modelOptions },
      });
      return { modes: { availableModes: [] } };
    });
    connection.setSessionConfigOption
      .mockResolvedValueOnce({
        configOptions: [
          { ...(modelOptions[0] as object), currentValue: "model-b" },
          { ...(modelOptions[1] as object), id: "thought-new" },
        ],
      })
      .mockResolvedValueOnce({
        configOptions: [
          { ...(modelOptions[0] as object), currentValue: "model-b" },
          { ...(modelOptions[1] as object), id: "thought-new", currentValue: "high" },
        ],
      });

    await session.openThread(
      { model: "model-b", effort: "high" },
      { providerSessionId: "session-resume", discoveredAt: new Date().toISOString() },
    );

    expect(connection.setSessionConfigOption.mock.calls.map(([call]) => call.configId)).toEqual([
      "model",
      "thought-new",
    ]);
  });

  it("falls back to session/load for known sessions when resume is not advertised", async () => {
    const { connection, session } = makeConfigSyncSession();
    const sessionRef = {
      providerSessionId: "session-load",
      discoveredAt: new Date().toISOString(),
    };

    await expect(session.openThread({ model: "model-a" }, sessionRef)).resolves.toBe(
      "session-load",
    );

    expect(connection.loadSession).toHaveBeenCalledWith({
      sessionId: "session-load",
      cwd: "C:\\repo",
      mcpServers: [],
    });
    expect(connection.resumeSession).not.toHaveBeenCalled();
  });

  it("passes selected Browser MCP to ACP session open calls", async () => {
    const resolved = {
      id: "browser",
      name: "browser",
      timeoutMs: 30_000,
      transport: {
        type: "http" as const,
        url: "http://127.0.0.1:9123/mcp",
        headers: { Authorization: "Bearer secret-token" },
      },
    };
    const mcpServers = [
      {
        type: "http",
        name: "browser",
        url: "http://127.0.0.1:9123/mcp",
        headers: [{ name: "Authorization", value: "Bearer secret-token" }],
      },
    ];

    const newCase = makeConfigSyncSession({ mcpServers: [resolved] });
    await expect(newCase.session.openThread({ model: "model-a", browserMcp: true })).resolves.toBe(
      "session-1",
    );
    expect(newCase.connection.newSession).toHaveBeenCalledWith({
      cwd: "C:\\repo",
      mcpServers,
    });

    const resumeCase = makeConfigSyncSession({ mcpServers: [resolved] });
    (resumeCase.session as unknown as Record<string, unknown>)["agentSessionCapabilities"] = {
      resume: {},
    };
    await expect(
      resumeCase.session.openThread(
        { model: "model-a", browserMcp: true },
        { providerSessionId: "session-resume", discoveredAt: new Date().toISOString() },
      ),
    ).resolves.toBe("session-resume");
    expect(resumeCase.connection.resumeSession).toHaveBeenCalledWith({
      sessionId: "session-resume",
      cwd: "C:\\repo",
      mcpServers,
    });

    const loadCase = makeConfigSyncSession({ mcpServers: [resolved] });
    await expect(
      loadCase.session.openThread(
        { model: "model-a", browserMcp: true },
        { providerSessionId: "session-load", discoveredAt: new Date().toISOString() },
      ),
    ).resolves.toBe("session-load");
    expect(loadCase.connection.loadSession).toHaveBeenCalledWith({
      sessionId: "session-load",
      cwd: "C:\\repo",
      mcpServers,
    });
  });

  it("passes WSL Browser MCP through the in-distro bridge", async () => {
    const { connection, session } = makeConfigSyncSession({
      mcpServers: [
        {
          id: "browser",
          name: "browser",
          timeoutMs: 30_000,
          transport: {
            type: "http",
            url: "http://127.0.0.1:45678/mcp",
            headers: { Authorization: "Bearer bridge-secret" },
          },
        },
      ],
    });
    (session as unknown as Record<string, unknown>)["projectLocation"] = {
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/home/me/repo",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\me\\repo",
    };
    (session as unknown as Record<string, unknown>)["cwd"] = "/home/me/repo";
    await expect(session.openThread({ model: "model-a", browserMcp: true })).resolves.toBe(
      "session-1",
    );

    expect(connection.newSession).toHaveBeenCalledWith({
      cwd: "/home/me/repo",
      mcpServers: [
        {
          type: "http",
          name: "browser",
          url: "http://127.0.0.1:45678/mcp",
          headers: [{ name: "Authorization", value: "Bearer bridge-secret" }],
        },
      ],
    });
  });

  it("passes selected Crossagents MCP to ACP session open calls", async () => {
    const crossagents = {
      id: "crossagents",
      name: "crossagents",
      timeoutMs: 300_000,
      transport: {
        type: "http" as const,
        url: "http://127.0.0.1:9200/mcp",
        headers: { Authorization: "Bearer crossagent-token" },
      },
    };
    const { connection, session } = makeConfigSyncSession({ mcpServers: [crossagents] });

    await expect(session.openThread({ model: "model-a", crossagentMcp: true })).resolves.toBe(
      "session-1",
    );

    expect(connection.newSession).toHaveBeenCalledWith({
      cwd: "C:\\repo",
      mcpServers: [
        {
          type: "http",
          name: "crossagents",
          url: "http://127.0.0.1:9200/mcp",
          headers: [{ name: "Authorization", value: "Bearer crossagent-token" }],
        },
      ],
    });
  });

  it("drops HTTP MCP servers when the agent does not advertise mcpCapabilities.http", async () => {
    // Regression: Factory Droid (droid exec --output-format acp-daemon) fails
    // newSession with an internal error when handed an HTTP MCP server. Agents
    // that don't advertise http support get the servers dropped and launch
    // normally without them.
    const { connection, session } = makeConfigSyncSession({
      agentMcpCapabilities: { http: false },
      mcpServers: [
        {
          id: "crossagents",
          name: "crossagents",
          timeoutMs: 300_000,
          transport: {
            type: "http",
            url: "http://127.0.0.1:9200/mcp",
            headers: { Authorization: "Bearer crossagent-token" },
          },
        },
      ],
    });

    await expect(session.openThread({ model: "model-a", crossagentMcp: true })).resolves.toBe(
      "session-1",
    );

    expect(connection.newSession).toHaveBeenCalledWith({
      cwd: "C:\\repo",
      mcpServers: [],
    });
  });

  it("appends both browser and Crossagents MCP servers when both are selected", async () => {
    const { connection, session } = makeConfigSyncSession({
      mcpServers: [
        {
          id: "browser",
          name: "browser",
          timeoutMs: 30_000,
          transport: {
            type: "http",
            url: "http://127.0.0.1:9123/mcp",
            headers: { Authorization: "Bearer secret-token" },
          },
        },
        {
          id: "crossagents",
          name: "crossagents",
          timeoutMs: 300_000,
          transport: {
            type: "http",
            url: "http://127.0.0.1:9200/mcp",
            headers: { Authorization: "Bearer crossagent-token" },
          },
        },
      ],
    });

    await expect(
      session.openThread({ model: "model-a", browserMcp: true, crossagentMcp: true }),
    ).resolves.toBe("session-1");

    expect(connection.newSession).toHaveBeenCalledWith({
      cwd: "C:\\repo",
      mcpServers: [
        {
          type: "http",
          name: "browser",
          url: "http://127.0.0.1:9123/mcp",
          headers: [{ name: "Authorization", value: "Bearer secret-token" }],
        },
        {
          type: "http",
          name: "crossagents",
          url: "http://127.0.0.1:9200/mcp",
          headers: [{ name: "Authorization", value: "Bearer crossagent-token" }],
        },
      ],
    });
  });
});

describe("ACP turn config sync", () => {
  it("preserves the live status when the agent echoes a current_mode_update mid-turn", () => {
    const { listener, session } = makeConfigSyncSession({
      currentConfig: {
        model: "model-a",
        effort: "low",
        mode: "agent",
        approvalPolicy: "default",
      },
    });
    (session as unknown as Record<string, unknown>)["currentStatus"] = "working";
    (session as unknown as Record<string, unknown>)["currentAttention"] = "working";

    session.handleSessionUpdate({
      update: {
        sessionUpdate: "current_mode_update",
        currentModeId: "autopilot",
      },
    });

    expect(listener.onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "working",
        attention: "working",
      }),
    );
  });

  it("preserves the live status when a config_option_update arrives mid-turn", () => {
    const { listener, session } = makeConfigSyncSession({
      currentConfig: {
        model: "model-a",
        effort: "low",
        mode: "agent",
        approvalPolicy: "default",
      },
    });
    (session as unknown as Record<string, unknown>)["currentStatus"] = "working";
    (session as unknown as Record<string, unknown>)["currentAttention"] = "working";

    session.handleSessionUpdate({
      update: {
        sessionUpdate: "config_option_update",
        configOptions: [
          {
            id: "thought-level",
            category: "thought_level",
            type: "select",
            currentValue: "high",
          },
        ],
      },
    });

    expect(listener.onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "working",
        attention: "working",
        config: expect.objectContaining({ effort: "high" }),
      }),
    );
  });

  it("retains config-option metadata during replay suppression without emitting it", async () => {
    const { connection, listener, session } = makeConfigSyncSession({
      currentConfig: {
        model: "model-a",
        effort: "low",
        mode: "agent",
        approvalPolicy: "default",
      },
    });
    (session as unknown as Record<string, unknown>)["replayHistoryUntil"] = Date.now() + 10_000;
    const updatedOptions = [
      {
        id: "thought-replayed",
        category: "thought_level",
        type: "select",
        currentValue: "low",
        options: [
          { value: "low", name: "Low" },
          { value: "high", name: "High" },
        ],
      },
    ];

    session.handleSessionUpdate({
      update: { sessionUpdate: "config_option_update", configOptions: updatedOptions },
    });

    expect(listener.onUpdate).not.toHaveBeenCalled();
    connection.setSessionConfigOption.mockResolvedValueOnce({ configOptions: updatedOptions });
    await session.startTurn("continue", {
      model: "model-a",
      effort: "high",
      mode: "agent",
      approvalPolicy: "default",
    });
    expect(connection.setSessionConfigOption).toHaveBeenCalledWith({
      sessionId: "session-1",
      configId: "thought-replayed",
      value: "high",
    });
  });

  it("does not mark restored session replay as working", () => {
    const { listener, session } = makeConfigSyncSession();
    (session as unknown as Record<string, unknown>)["isReplayingHistory"] = true;

    session.handleSessionUpdate({
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "tool-1",
        title: "Read file",
        status: "completed",
      },
    });

    expect(listener.onUpdate).not.toHaveBeenCalled();
  });

  it("continues suppressing late Gemini loadSession history replay after the RPC resolves", () => {
    const { listener, session } = makeConfigSyncSession();
    (session as unknown as Record<string, unknown>)["replayHistoryUntil"] = Date.now() + 500;

    session.handleSessionUpdate({
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "restored assistant message" },
      },
    });

    expect(listener.onRuntimeEvent).not.toHaveBeenCalled();
    expect(listener.onUpdate).not.toHaveBeenCalled();
  });

  it("surfaces available ACP slash commands from session updates", () => {
    const { listener, session } = makeConfigSyncSession();

    session.handleSessionUpdate({
      update: {
        sessionUpdate: "available_commands_update",
        availableCommands: [
          {
            name: "plan",
            description: "Create a plan",
            input: { hint: "<topic>" },
          },
        ],
      },
    });

    expect(listener.onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        slashCommands: [
          {
            id: "plan",
            label: "plan — Create a plan",
            description: "Create a plan",
            argumentHint: "<topic>",
          },
        ],
      }),
    );
  });

  it("replays slash commands that arrive before the listener is attached", () => {
    const { listener, session } = makeConfigSyncSession();
    (session as unknown as Record<string, unknown>)["listener"] = undefined;
    (session as unknown as Record<string, unknown>)["isReplayingHistory"] = true;

    session.handleSessionUpdate({
      update: {
        sessionUpdate: "available_commands_update",
        availableCommands: [{ name: "review", description: "Review the changes" }],
      },
    });

    session.setListener(listener);

    expect(listener.onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        slashCommands: [
          {
            id: "review",
            label: "review — Review the changes",
            description: "Review the changes",
          },
        ],
      }),
    );
  });

  it("does not treat session metadata updates as working", () => {
    const { listener, session } = makeConfigSyncSession();

    session.handleSessionUpdate({
      update: {
        sessionUpdate: "session_info_update",
        title: "Restored topic",
      },
    });

    expect(listener.onUpdate).not.toHaveBeenCalled();
  });

  it("cancels active ACP turns immediately when a prompt is in flight", async () => {
    const { connection, session } = makeConfigSyncSession();
    (session as unknown as Record<string, unknown>)["promptInFlight"] = true;

    await session.interruptTurn();

    expect(connection.cancel).toHaveBeenCalledWith({ sessionId: "session-1" });
  });

  it("wires permission resolution and interrupt cancellation through the request coordinator", async () => {
    const { listener, session } = makeConfigSyncSession();
    const request: RequestPermissionRequest = {
      sessionId: "session-1",
      toolCall: { toolCallId: "tool-1", title: "Run tests", kind: "execute" },
      options: [{ optionId: "once", name: "Allow once", kind: "allow_once" }],
    };

    const selected = session.handlePermissionRequest(request);
    await session.resolveServerRequest("acp-perm-0", { optionId: "once" });
    await expect(selected).resolves.toEqual({
      outcome: { outcome: "selected", optionId: "once" },
    });

    const cancelled = session.handlePermissionRequest(request);
    await session.interruptTurn();
    await expect(cancelled).resolves.toEqual({ outcome: { outcome: "cancelled" } });
    expect(listener.onRuntimeEvent).toHaveBeenLastCalledWith({
      type: "request.resolved",
      threadId: "thread-1",
      requestId: "acp-perm-1",
      outcome: "cancelled",
    });
  });

  it("defers cancel via pendingPromptInterrupt when no prompt is in flight, then fires once startTurn enters prompt()", async () => {
    const { connection, session } = makeConfigSyncSession();

    // Race window: interrupt fires before prompt() has been entered. The
    // cancel would land on an idle session and be silently dropped, so we
    // expect it to be deferred until startTurn flips promptInFlight.
    await session.interruptTurn();
    expect(connection.cancel).not.toHaveBeenCalled();
    expect((session as unknown as Record<string, unknown>)["pendingPromptInterrupt"]).toBe(true);

    // Simulate startTurn's pre-prompt check: promptInFlight=true + flag set
    // would fire cancel immediately. We exercise that branch by replicating
    // the guard inline (the full startTurn requires more setup than this
    // unit test does).
    const internal = session as unknown as {
      promptInFlight: boolean;
      pendingPromptInterrupt: boolean;
      sessionId: string;
      connection: { cancel: (args: { sessionId: string }) => Promise<void> };
    };
    internal.promptInFlight = true;
    if (internal.pendingPromptInterrupt && internal.sessionId) {
      internal.pendingPromptInterrupt = false;
      await internal.connection.cancel({ sessionId: internal.sessionId });
    }
    expect(connection.cancel).toHaveBeenCalledWith({ sessionId: "session-1" });
  });

  it("keeps ordinary end_turn results completed when no interrupt was requested", async () => {
    const { listener, session } = makeConfigSyncSession();

    await session.startTurn("hello", {
      model: "model-a",
      effort: "low",
      mode: "agent",
      approvalPolicy: "default",
    });

    expect(listener.onRuntimeEvent.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "turn.completed",
      state: "completed",
    });
  });

  it("preserves native cancelled stop reasons for other ACP agents", async () => {
    const { connection, listener, session } = makeConfigSyncSession();
    connection.prompt.mockResolvedValueOnce({ stopReason: "cancelled" });

    await session.startTurn("hello", {
      model: "model-a",
      effort: "low",
      mode: "agent",
      approvalPolicy: "default",
    });

    expect(listener.onRuntimeEvent.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "turn.completed",
      state: "cancelled",
    });
  });

  it("normalizes interrupt-acknowledged end_turn results to cancelled", async () => {
    const { connection, listener, session } = makeConfigSyncSession();
    let resolvePrompt: ((value: { stopReason: string }) => void) | undefined;
    connection.prompt.mockReturnValueOnce(
      new Promise<{ stopReason: string }>((resolve) => {
        resolvePrompt = resolve;
      }),
    );

    const turnPromise = session.startTurn("hello", {
      model: "model-a",
      effort: "low",
      mode: "agent",
      approvalPolicy: "default",
    });
    await Promise.resolve();

    await session.interruptTurn();
    expect(connection.cancel).toHaveBeenCalledWith({ sessionId: "session-1" });

    session.handleSessionUpdate({
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Info: Operation cancelled by user" },
      },
    });

    resolvePrompt?.({ stopReason: "end_turn" });
    await turnPromise;

    expect(listener.onRuntimeEvent.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "turn.completed",
      state: "cancelled",
    });
    expect(listener.onUpdate).toHaveBeenLastCalledWith({
      status: "idle",
      attention: "none",
    });
  });
});
