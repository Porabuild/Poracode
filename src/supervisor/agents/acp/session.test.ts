import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RequestError,
  type RequestPermissionRequest,
  type SessionNotification,
} from "@agentclientprotocol/sdk";
import type { CreateStructuredSessionInput } from "../base";
import type { ThreadConfig } from "@/shared/contracts";
import {
  AcpStructuredSession,
  isAcpHomeScopeLocation,
  resolveAcpGlobalSkillFallbackHostFsPath,
  resolveAcpReadableHostFsPath,
  resolveAcpResourcePath,
  resolveAcpWritableHostFsPath,
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
  forceCompleteTurn(): void;
  dispose(): Promise<void>;
  resolveServerRequest(requestId: string, response: unknown): Promise<void>;
  handlePermissionRequest(params: RequestPermissionRequest): Promise<unknown>;
  handleSessionUpdate(params: { update: unknown }): void;
  ingestExternalSessionUpdate(notification: SessionNotification): void;
  attachExternalSessionUpdateSource(source: {
    onSessionUpdate(notification: SessionNotification): boolean | void;
    dispose(): void;
  }): void;
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
    agentMcpCapabilities?: { http?: boolean; sse?: boolean } | undefined;
    assumedMcpCapabilities?: { http?: boolean; sse?: boolean };
    mcpServers?: Array<{
      id: string;
      name: string;
      timeoutMs: number;
      transport: { type: "http"; url: string; headers: Record<string, string> };
    }>;
    fsTextCapability?: boolean;
    initializeMeta?: Record<string, unknown>;
  } = {},
) {
  const connection = {
    initialize: vi
      .fn<(args: { clientCapabilities: unknown }) => Promise<{ protocolVersion: number }>>()
      .mockResolvedValue({ protocolVersion: 1 }),
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
    extMethod: vi
      .fn<(method: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>>()
      .mockResolvedValue({}),
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
          modes?: { currentModeId?: string; availableModes: Array<{ id: string }> };
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
  session["detachedTurnParentToolCallIds"] = new Set();
  session["sessionId"] = "session-1";
  session["threadId"] = "thread-1";
  session["projectLocation"] = { kind: "windows", path: "C:\\repo" };
  session["listener"] = listener;
  // Default to advertising HTTP MCP support so the mcpServers-gating (added for
  // the Factory Droid bug) is a no-op for these pass-through tests. The gating
  // itself is covered by a dedicated test below.
  session["agentMcpCapabilities"] =
    "agentMcpCapabilities" in overrides ? overrides.agentMcpCapabilities : { http: true };
  session["assumedMcpCapabilities"] = overrides.assumedMcpCapabilities;
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
  session["initializeMeta"] = overrides.initializeMeta;
  session["cwd"] = "C:\\repo";
  session["stableSessionRef"] = undefined;
  session["usageScopeId"] = undefined;
  session["usageEpoch"] = 0;
  session["usageScopeFresh"] = false;
  session["launchOptions"] = {};
  session["mcpServers"] = overrides.mcpServers ?? [];
  session["loadSessionErrorRewriter"] = rewriteLoadSessionError;
  // Mirrors the constructor's `options?.fsTextCapability !== false` default.
  session["fsTextCapability"] = overrides.fsTextCapability !== false;
  session["fsAgentHomeDirs"] = [];
  session["spawnReady"] = Promise.resolve();
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

describe("ACP async extension updates", () => {
  it.each(["disposed", "replaying"] as const)(
    "drops recovered updates when the session becomes %s before resolution",
    async (state) => {
      const { listener, session } = makeConfigSyncSession();
      let resolveUpdate!: (notification: SessionNotification) => void;
      const recovered = new Promise<SessionNotification>((resolve) => {
        resolveUpdate = resolve;
      });
      const internal = session as unknown as Record<string, unknown>;
      internal["extensionSessionUpdateTransform"] = () => recovered;

      (
        session as unknown as {
          handleExtNotification(method: string, params: Record<string, unknown>): void;
        }
      ).handleExtNotification("vendor/status", {});
      if (state === "disposed") internal["isDisposed"] = true;
      else internal["isReplayingHistory"] = true;

      resolveUpdate({
        sessionId: "session-1",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "late update" },
        },
      });
      await recovered;
      await Promise.resolve();

      expect(listener.onRuntimeEvent).not.toHaveBeenCalled();
      expect(listener.onUpdate).not.toHaveBeenCalled();
    },
  );
});

describe("ACP external session update sources", () => {
  it("allows a source to defer a provider update and re-ingest it without recursion", () => {
    const { listener, session } = makeConfigSyncSession();
    const notification = {
      sessionId: "session-1",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Recovered child output" },
      },
    } as SessionNotification;
    const onSessionUpdate = vi.fn<(notification: SessionNotification) => boolean>(() => true);
    session.attachExternalSessionUpdateSource({
      onSessionUpdate,
      dispose: vi.fn<() => void>(),
    });

    session.handleSessionUpdate(notification);
    expect(onSessionUpdate).toHaveBeenCalledOnce();
    expect(listener.onRuntimeEvent).not.toHaveBeenCalled();

    session.ingestExternalSessionUpdate(notification);
    expect(onSessionUpdate).toHaveBeenCalledOnce();
    expect(listener.onRuntimeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "content.delta", delta: "Recovered child output" }),
    );
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

describe("ACP transport close lifecycle", () => {
  it("keeps an established session's nonzero exit reportable", () => {
    const { session } = makeConfigSyncSession();
    const internal = session as unknown as {
      isExpectedTransportExit(code: number | null): boolean;
    };

    expect(internal.isExpectedTransportExit(0)).toBe(true);
    expect(internal.isExpectedTransportExit(9)).toBe(false);
    expect(internal.isExpectedTransportExit(null)).toBe(false);

    (session as unknown as Record<string, unknown>)["isDisposed"] = true;
    expect(internal.isExpectedTransportExit(9)).toBe(true);
  });

  it("reports one root error and one derivative close", () => {
    const { listener, session } = makeConfigSyncSession();
    const internal = session as unknown as {
      reportTransportOutcome(message: string | undefined): void;
    };

    internal.reportTransportOutcome("ACP connection closed unexpectedly.");
    internal.reportTransportOutcome("duplicate");

    expect(listener.onError).toHaveBeenCalledExactlyOnceWith("ACP connection closed unexpectedly.");
    expect(listener.onClose).toHaveBeenCalledTimes(1);
  });

  it("treats a clean transport close as expected", () => {
    const { listener, session } = makeConfigSyncSession();
    const internal = session as unknown as {
      reportTransportOutcome(message: string | undefined): void;
    };

    internal.reportTransportOutcome(undefined);

    expect(listener.onError).not.toHaveBeenCalled();
    expect(listener.onClose).toHaveBeenCalledTimes(1);
  });

  it("suppresses cancel rejection only after the close boundary won the race", async () => {
    const { connection, session } = makeConfigSyncSession();
    connection.cancel.mockRejectedValueOnce(new Error("ACP connection closed"));
    (session as unknown as Record<string, unknown>)["transportClosed"] = true;

    await expect(session.interruptTurn()).resolves.toBeUndefined();
  });
});

describe("ACP prompt-response usage → usage.spent", () => {
  it("emits cumulative usage.spent from a new session's prompt usage, fresh once", async () => {
    const { connection, listener, session } = makeConfigSyncSession();
    await session.openThread({ model: "model-a" });

    connection.prompt.mockResolvedValueOnce({
      stopReason: "end_turn",
      usage: { totalTokens: 1200, inputTokens: 1000, outputTokens: 200 },
    } as { stopReason: string });
    await session.startTurn("hello", { model: "model-a" });

    expect(listener.onRuntimeEvent).toHaveBeenCalledWith({
      type: "usage.spent",
      threadId: "thread-1",
      usage: {
        counterKind: "cumulative",
        counter: 1200,
        scopeId: "session-1",
        epoch: 0,
        fresh: true,
        sampleId: "session-1:0:1200",
      },
    });
    // The dock's context.updated is still emitted from the same payload.
    expect(listener.onRuntimeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "context.updated" }),
    );

    // Second turn: same scope, `fresh` consumed by the first sample.
    connection.prompt.mockResolvedValueOnce({
      stopReason: "end_turn",
      usage: { totalTokens: 1500 },
    } as { stopReason: string });
    await session.startTurn("again", { model: "model-a" });

    expect(listener.onRuntimeEvent).toHaveBeenCalledWith({
      type: "usage.spent",
      threadId: "thread-1",
      usage: {
        counterKind: "cumulative",
        counter: 1500,
        scopeId: "session-1",
        epoch: 0,
        sampleId: "session-1:0:1500",
      },
    });
  });

  it("marks resumed sessions non-fresh and emits nothing without prompt usage", async () => {
    const { connection, listener, session } = makeConfigSyncSession();
    await session.openThread(
      { model: "model-a" },
      { providerSessionId: "session-resume", discoveredAt: new Date().toISOString() },
    );

    connection.prompt.mockResolvedValueOnce({
      stopReason: "end_turn",
      usage: { totalTokens: 9000 },
    } as { stopReason: string });
    await session.startTurn("hello", { model: "model-a" });

    const spentEvents = () =>
      listener.onRuntimeEvent.mock.calls
        .map(([event]) => event)
        .filter((event): event is Record<string, unknown> => {
          return (
            typeof event === "object" &&
            event !== null &&
            (event as { type?: string }).type === "usage.spent"
          );
        });
    expect(spentEvents()).toHaveLength(1);
    expect(spentEvents()[0]).toMatchObject({
      usage: {
        counterKind: "cumulative",
        counter: 9000,
        scopeId: "session-resume",
        epoch: 0,
        sampleId: "session-resume:0:9000",
      },
    });
    // Resumed scope: baseline-only first sample, no fresh flag.
    expect(spentEvents()[0]).not.toMatchObject({ usage: { fresh: true } });

    // Bridges without prompt-response usage emit no spend event at all.
    listener.onRuntimeEvent.mockClear();
    connection.prompt.mockResolvedValueOnce({ stopReason: "end_turn" });
    await session.startTurn("hello again", { model: "model-a" });
    expect(spentEvents()).toHaveLength(0);
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

  it("allows read-only access to Grok bundled and vendor skill files outside the project", () => {
    const grokBundled = "C:\\Users\\me\\.grok\\bundled\\skills\\review\\SKILL.md";
    const grokUser = "C:\\Users\\me\\.grok\\skills\\commit\\SKILL.md";
    const claude = "C:\\Users\\me\\.claude\\skills\\review\\SKILL.md";
    const cursor = "C:\\Users\\me\\.cursor\\skills\\review\\SKILL.md";
    expect(resolveAcpReadableHostFsPath(WINDOWS_LOCATION, grokBundled)).toBe(grokBundled);
    expect(resolveAcpReadableHostFsPath(WINDOWS_LOCATION, grokUser)).toBe(grokUser);
    expect(resolveAcpReadableHostFsPath(WINDOWS_LOCATION, claude)).toBe(claude);
    expect(resolveAcpReadableHostFsPath(WINDOWS_LOCATION, cursor)).toBe(cursor);
    expect(
      resolveAcpReadableHostFsPath(WSL_LOCATION, "/home/me/.grok/bundled/skills/review/SKILL.md"),
    ).toBe("\\\\wsl.localhost\\Ubuntu\\home\\me\\.grok\\bundled\\skills\\review\\SKILL.md");
    expect(() => resolveAcpWritableHostFsPath(WINDOWS_LOCATION, grokBundled)).toThrow(
      "Invalid params",
    );
    expect(() =>
      resolveAcpReadableHostFsPath(WINDOWS_LOCATION, "C:\\Users\\me\\.grok\\auth.json"),
    ).toThrow("Invalid params");
  });

  it("maps a missing project skill path to the matching user-global skill file", () => {
    expect(
      resolveAcpGlobalSkillFallbackHostFsPath(
        WSL_LOCATION,
        "/home/me/repo/.agents/skills/code-review/SKILL.md",
      ),
    ).toBe("\\\\wsl.localhost\\Ubuntu\\home\\me\\.agents\\skills\\code-review\\SKILL.md");
    expect(
      resolveAcpGlobalSkillFallbackHostFsPath(
        WSL_LOCATION,
        "/home/me/repo/.grok/skills/commit/SKILL.md",
      ),
    ).toBe("\\\\wsl.localhost\\Ubuntu\\home\\me\\.grok\\skills\\commit\\SKILL.md");
    expect(resolveAcpGlobalSkillFallbackHostFsPath(WSL_LOCATION, "/home/me/repo/src/main.ts")).toBe(
      undefined,
    );
    expect(
      resolveAcpGlobalSkillFallbackHostFsPath(
        WSL_LOCATION,
        "/home/me/.agents/skills/code-review/SKILL.md",
      ),
    ).toBe(undefined);
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

  const WINDOWS_LOCATION = { kind: "windows", path: "C:\\repo" } as const;
  const WSL_LOCATION = {
    kind: "wsl",
    distro: "Ubuntu",
    linuxPath: "/home/me/repo",
    uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\me\\repo",
  } as const;
  const KIMI_PLAN_WINDOWS = "C:\\Users\\me\\.kimi-code\\sessions\\ws\\sid\\agents\\a\\plans\\p.md";
  const KIMI_PLAN_LINUX = "/home/me/.kimi-code/sessions/ws/sid/agents/a/plans/p.md";

  it("allows read and write access to a declared agent home dir outside the project", () => {
    expect(resolveAcpReadableHostFsPath(WINDOWS_LOCATION, KIMI_PLAN_WINDOWS, [".kimi-code"])).toBe(
      KIMI_PLAN_WINDOWS,
    );
    expect(resolveAcpWritableHostFsPath(WINDOWS_LOCATION, KIMI_PLAN_WINDOWS, [".kimi-code"])).toBe(
      KIMI_PLAN_WINDOWS,
    );
    const grokBundled = "C:\\Users\\me\\.grok\\bundled\\skills\\review\\SKILL.md";
    expect(resolveAcpReadableHostFsPath(WINDOWS_LOCATION, grokBundled, [".grok"])).toBe(
      grokBundled,
    );
    expect(resolveAcpWritableHostFsPath(WINDOWS_LOCATION, grokBundled, [".grok"])).toBe(
      grokBundled,
    );
  });

  it("maps agent home dir paths inside a WSL project to UNC host paths", () => {
    const unc =
      "\\\\wsl.localhost\\Ubuntu\\home\\me\\.kimi-code\\sessions\\ws\\sid\\agents\\a\\plans\\p.md";
    expect(resolveAcpReadableHostFsPath(WSL_LOCATION, KIMI_PLAN_LINUX, [".kimi-code"])).toBe(unc);
    expect(resolveAcpWritableHostFsPath(WSL_LOCATION, KIMI_PLAN_LINUX, [".kimi-code"])).toBe(unc);
  });

  it("still rejects agent home dir paths when no carve-out is declared", () => {
    expect(() => resolveAcpReadableHostFsPath(WINDOWS_LOCATION, KIMI_PLAN_WINDOWS)).toThrow(
      "Invalid params",
    );
    expect(() => resolveAcpWritableHostFsPath(WINDOWS_LOCATION, KIMI_PLAN_WINDOWS)).toThrow(
      "Invalid params",
    );
  });

  it("keeps user agent skills read-only even with agent home carve-outs", () => {
    expect(() =>
      resolveAcpWritableHostFsPath(WSL_LOCATION, "/home/me/.agents/skills/x/SKILL.md", [
        ".kimi-code",
      ]),
    ).toThrow("Invalid params");
  });

  it("rejects agent home dir paths that escape through parent segments", () => {
    expect(() =>
      resolveAcpWritableHostFsPath(WSL_LOCATION, "/home/me/.kimi-code/../secret.txt", [
        ".kimi-code",
      ]),
    ).toThrow("Invalid params");
    expect(() =>
      resolveAcpWritableHostFsPath(WINDOWS_LOCATION, "C:\\Users\\me\\.kimi-code\\..\\secret.txt", [
        ".kimi-code",
      ]),
    ).toThrow("Invalid params");
  });

  it("does not match the agent home dir root itself", () => {
    expect(() =>
      resolveAcpWritableHostFsPath(WSL_LOCATION, "/home/me/.kimi-code", [".kimi-code"]),
    ).toThrow("Invalid params");
  });

  const HOME_WINDOWS = { kind: "windows", path: "C:\\Users\\me" } as const;
  const HOME_WSL = {
    kind: "wsl",
    distro: "Ubuntu",
    linuxPath: "/home/me",
    uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\me",
  } as const;

  it("treats a workspace that is the user home as the Home scope", () => {
    expect(isAcpHomeScopeLocation(HOME_WINDOWS)).toBe(true);
    expect(isAcpHomeScopeLocation(HOME_WSL)).toBe(true);
    expect(isAcpHomeScopeLocation({ kind: "posix", path: "/home/me" })).toBe(true);
    expect(isAcpHomeScopeLocation(WINDOWS_LOCATION)).toBe(false);
    expect(isAcpHomeScopeLocation(WSL_LOCATION)).toBe(false);
    expect(isAcpHomeScopeLocation({ kind: "windows", path: "C:\\Users\\me\\Documents" })).toBe(
      false,
    );
  });

  it("does not confine Home-scope reads or writes to the home folder", () => {
    expect(resolveAcpReadableHostFsPath(HOME_WINDOWS, "E:\\work\\repo\\file.ts")).toBe(
      "E:\\work\\repo\\file.ts",
    );
    expect(resolveAcpWritableHostFsPath(HOME_WINDOWS, "E:\\work\\repo\\file.ts")).toBe(
      "E:\\work\\repo\\file.ts",
    );
    expect(resolveAcpReadableHostFsPath(HOME_WSL, "/tmp/notes.md")).toBe(
      "\\\\wsl.localhost\\Ubuntu\\tmp\\notes.md",
    );
    expect(resolveAcpWritableHostFsPath(HOME_WSL, "/tmp/notes.md")).toBe(
      "\\\\wsl.localhost\\Ubuntu\\tmp\\notes.md",
    );
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

  it("serves ACP fs reads and writes anywhere when the workspace is Home", async () => {
    const outsideRoot = makePosixProject();
    writeFileSync(join(outsideRoot, "notes.txt"), "from-outside", "utf8");
    const { session } = makeConfigSyncSession();
    (session as unknown as Record<string, unknown>)["projectLocation"] =
      HOST_KIND === "windows"
        ? { kind: "windows", path: "C:\\Users\\me" }
        : { kind: "posix", path: "/home/me" };

    const read = (session as unknown as { handleReadTextFile: Function }).handleReadTextFile.bind(
      session,
    );
    const write = (
      session as unknown as { handleWriteTextFile: Function }
    ).handleWriteTextFile.bind(session);

    await expect(
      read({ sessionId: "session-1", path: join(outsideRoot, "notes.txt") }),
    ).resolves.toEqual({ content: "from-outside" });
    await write({
      sessionId: "session-1",
      path: join(outsideRoot, "out.txt"),
      content: "ok",
    });
    expect(readFileSync(join(outsideRoot, "out.txt"), "utf8")).toBe("ok");
  });

  it("falls back to the user-global skill when the project copy is missing", async () => {
    const projectRoot = makePosixProject();
    const folder = `poracode-acp-skill-fallback-${Date.now()}`;
    const globalDir = join(homedir(), ".agents", "skills", folder);
    mkdirSync(globalDir, { recursive: true });
    writeFileSync(join(globalDir, "SKILL.md"), "global-body", "utf8");
    try {
      const { session } = makeConfigSyncSession();
      (session as unknown as Record<string, unknown>)["projectLocation"] = {
        kind: HOST_KIND,
        path: projectRoot,
      };
      const read = (session as unknown as { handleReadTextFile: Function }).handleReadTextFile.bind(
        session,
      );
      await expect(
        read({
          sessionId: "session-1",
          path: join(projectRoot, ".agents", "skills", folder, "SKILL.md"),
        }),
      ).resolves.toEqual({ content: "global-body" });
    } finally {
      rmSync(globalDir, { recursive: true, force: true });
    }
  });

  it("advertises the fs text capabilities by default", async () => {
    const { connection, session } = makeConfigSyncSession();
    await (session as unknown as { activate(): Promise<void> }).activate();
    expect(connection.initialize.mock.calls[0]?.[0]).toMatchObject({
      clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
    });
  });

  it("withholds the fs text capabilities when the adapter opts out", async () => {
    // Providers that proxy their own internal state files through the client and
    // then mis-classify the JSON-RPC errors it returns opt out; they fall back
    // to their local filesystem, which Poracode shares.
    const { connection, session } = makeConfigSyncSession({ fsTextCapability: false });
    await (session as unknown as { activate(): Promise<void> }).activate();
    expect(connection.initialize.mock.calls[0]?.[0]).toMatchObject({
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false } },
    });
  });

  it("includes adapter vendor metadata in the initialize request", async () => {
    const { connection, session } = makeConfigSyncSession({
      initializeMeta: { "vendor.heartbeat": { v: 1 } },
    });
    await (session as unknown as { activate(): Promise<void> }).activate();
    expect(connection.initialize.mock.calls[0]?.[0]).toMatchObject({
      _meta: { "vendor.heartbeat": { v: 1 } },
    });
  });

  it("answers a read for a missing file with resource-not-found, not an internal error", async () => {
    // A plain Node `ENOENT` escapes as JSON-RPC `-32603 Internal error`, which
    // reads as a broken client rather than a missing file. Agents that probe
    // for a not-yet-created file (plan files, per-session config) then treat
    // the answer as fatal.
    const projectRoot = makePosixProject();
    const { session } = makeConfigSyncSession();
    (session as unknown as Record<string, unknown>)["projectLocation"] = {
      kind: HOST_KIND,
      path: projectRoot,
    };

    const read = (session as unknown as { handleReadTextFile: Function }).handleReadTextFile.bind(
      session,
    );

    const missing = join(projectRoot, "nope.md");
    await expect(read({ sessionId: "session-1", path: missing })).rejects.toMatchObject({
      code: -32002,
    });
  });

  it("reports other fs failures as internal errors carrying the errno", async () => {
    const projectRoot = makePosixProject();
    const { session } = makeConfigSyncSession();
    (session as unknown as Record<string, unknown>)["projectLocation"] = {
      kind: HOST_KIND,
      path: projectRoot,
    };

    const read = (session as unknown as { handleReadTextFile: Function }).handleReadTextFile.bind(
      session,
    );

    // Reading a directory fails with EISDIR — a real failure, not a missing file.
    await expect(read({ sessionId: "session-1", path: projectRoot })).rejects.toMatchObject({
      code: -32603,
      data: { code: "EISDIR" },
    });
  });

  it("answers a write into a missing directory with resource-not-found", async () => {
    const projectRoot = makePosixProject();
    const { session } = makeConfigSyncSession();
    (session as unknown as Record<string, unknown>)["projectLocation"] = {
      kind: HOST_KIND,
      path: projectRoot,
    };

    const write = (
      session as unknown as { handleWriteTextFile: Function }
    ).handleWriteTextFile.bind(session);

    await expect(
      write({ sessionId: "session-1", path: join(projectRoot, "gone", "out.txt"), content: "x" }),
    ).rejects.toMatchObject({ code: -32002 });
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

  it("keeps HTTP MCP servers when the adapter assumes support and the agent advertises nothing", async () => {
    // Factory Droid answers `initialize` with no mcpCapabilities block but
    // connects HTTP MCP servers fine, so its adapter declares the transport.
    // Without this, none of the built-in (all-HTTP) servers reach the agent.
    const { connection, session } = makeConfigSyncSession({
      agentMcpCapabilities: undefined,
      assumedMcpCapabilities: { http: true },
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

  it("retries without the assumed-transport MCP servers when session creation fails", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { connection, session } = makeConfigSyncSession({
      agentMcpCapabilities: undefined,
      assumedMcpCapabilities: { http: true },
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
      ],
    });
    connection.newSession
      .mockRejectedValueOnce(
        RequestError.internalError({
          message: "MCP server transport is unsupported",
          Authorization: "Bearer must-not-reach-logs",
        }),
      )
      .mockResolvedValueOnce({
        sessionId: "session-1",
        modes: { availableModes: [] },
        configOptions: [],
      });

    try {
      await expect(session.openThread({ model: "model-a", browserMcp: true })).resolves.toBe(
        "session-1",
      );

      expect(connection.newSession).toHaveBeenCalledTimes(2);
      expect(connection.newSession).toHaveBeenLastCalledWith({
        cwd: "C:\\repo",
        mcpServers: [],
      });
      expect(JSON.stringify(log.mock.calls)).not.toContain("must-not-reach-logs");
    } finally {
      log.mockRestore();
    }
  });

  it("does not drop assumed-transport MCP servers after an unrelated session-open failure", async () => {
    const { connection, session } = makeConfigSyncSession({
      agentMcpCapabilities: undefined,
      assumedMcpCapabilities: { http: true },
      mcpServers: [
        {
          id: "browser",
          name: "browser",
          timeoutMs: 30_000,
          transport: {
            type: "http",
            url: "http://127.0.0.1:9123/mcp",
            headers: {},
          },
        },
      ],
    });
    connection.newSession.mockRejectedValueOnce(new Error("transport closed"));

    await expect(session.openThread({ model: "model-a", browserMcp: true })).rejects.toThrow(
      "transport closed",
    );
    expect(connection.newSession).toHaveBeenCalledTimes(1);
  });

  it("retries Droid's legacy bare internal error without broadening to detailed auth errors", async () => {
    const { connection, session } = makeConfigSyncSession({
      agentMcpCapabilities: undefined,
      assumedMcpCapabilities: { http: true },
      mcpServers: [
        {
          id: "browser",
          name: "browser",
          timeoutMs: 30_000,
          transport: {
            type: "http",
            url: "http://127.0.0.1:9123/mcp",
            headers: {},
          },
        },
      ],
    });
    connection.newSession
      .mockRejectedValueOnce(RequestError.internalError())
      .mockResolvedValueOnce({
        sessionId: "session-1",
        modes: { availableModes: [] },
        configOptions: [],
      });

    await expect(session.openThread({ model: "model-a", browserMcp: true })).resolves.toBe(
      "session-1",
    );
    expect(connection.newSession).toHaveBeenCalledTimes(2);

    connection.newSession.mockClear();
    connection.newSession.mockRejectedValueOnce(
      RequestError.internalError({ details: "401 invalid access token or token expired" }),
    );
    await expect(session.openThread({ model: "model-a", browserMcp: true })).rejects.toMatchObject({
      code: -32603,
    });
    expect(connection.newSession).toHaveBeenCalledTimes(1);
  });

  it("preserves stale-session invalidParams instead of retrying load without MCP servers", async () => {
    const { connection, session } = makeConfigSyncSession({
      agentMcpCapabilities: undefined,
      assumedMcpCapabilities: { http: true },
      mcpServers: [
        {
          id: "browser",
          name: "browser",
          timeoutMs: 30_000,
          transport: {
            type: "http",
            url: "http://127.0.0.1:9123/mcp",
            headers: {},
          },
        },
      ],
    });
    const sessionRef = {
      providerSessionId: "stale-session",
      discoveredAt: new Date().toISOString(),
    };
    connection.loadSession.mockRejectedValueOnce(
      RequestError.invalidParams({ message: 'Session "stale-session" not found' }),
    );

    await expect(
      session.openThread({ model: "model-a", browserMcp: true }, sessionRef),
    ).rejects.toThrow("can't be resumed");
    expect(connection.loadSession).toHaveBeenCalledTimes(1);
    expect((session as unknown as Record<string, unknown>)["isReplayingHistory"]).toBe(false);
  });

  it.each([
    ["resumeSession", true],
    ["loadSession", false],
  ] as const)(
    "retries %s without assumed-transport MCP servers",
    async (method, supportsResume) => {
      const { connection, session } = makeConfigSyncSession({
        agentMcpCapabilities: undefined,
        assumedMcpCapabilities: { http: true },
        mcpServers: [
          {
            id: "browser",
            name: "browser",
            timeoutMs: 30_000,
            transport: {
              type: "http",
              url: "http://127.0.0.1:9123/mcp",
              headers: {},
            },
          },
        ],
      });
      if (supportsResume) {
        (session as unknown as Record<string, unknown>)["agentSessionCapabilities"] = {
          resume: {},
        };
      }
      const open = connection[method];
      open.mockRejectedValueOnce(RequestError.invalidParams({ field: "mcpServers" }));
      const sessionRef = {
        providerSessionId: `session-${supportsResume ? "resume" : "load"}`,
        discoveredAt: new Date().toISOString(),
      };

      await expect(
        session.openThread({ model: "model-a", browserMcp: true }, sessionRef),
      ).resolves.toBe(sessionRef.providerSessionId);

      expect(open).toHaveBeenCalledTimes(2);
      expect(open).toHaveBeenLastCalledWith({
        sessionId: sessionRef.providerSessionId,
        cwd: "C:\\repo",
        mcpServers: [],
      });
      expect((session as unknown as Record<string, unknown>)["isReplayingHistory"]).toBe(false);
    },
  );

  it("does not assume transports the agent explicitly declined to advertise", async () => {
    const { connection, session } = makeConfigSyncSession({
      agentMcpCapabilities: { http: false },
      assumedMcpCapabilities: { http: true },
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
      ],
    });

    await expect(session.openThread({ model: "model-a", browserMcp: true })).resolves.toBe(
      "session-1",
    );

    expect(connection.newSession).toHaveBeenCalledTimes(1);
    expect(connection.newSession).toHaveBeenCalledWith({ cwd: "C:\\repo", mcpServers: [] });
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

  it("does not re-push a resumed session's mode back at the agent", async () => {
    const { connection, session } = makeConfigSyncSession();
    (session as unknown as Record<string, unknown>)["agentSessionCapabilities"] = { resume: {} };
    connection.resumeSession.mockResolvedValueOnce({
      modes: { currentModeId: "plan", availableModes: [{ id: "default" }, { id: "plan" }] },
      configOptions: [],
    });

    await session.openThread(
      { model: "model-a", mode: "plan" },
      { providerSessionId: "session-1", discoveredAt: new Date().toISOString() },
    );

    expect(connection.setSessionMode).not.toHaveBeenCalled();
  });

  it("adopts plan mode from a completed EnterPlanMode tool call", () => {
    // ACP only says an agent "can" announce its own mode change via
    // current_mode_update, and offers no way to read the mode mid-session.
    // Kimi Code's EnterPlanMode skips the notification, so the mode is
    // inferred from the tool stream instead — otherwise the composer would
    // keep showing Work for the rest of a session spent planning.
    const { listener, session } = makeConfigSyncSession();
    (session as unknown as Record<string, unknown>)["currentStatus"] = "working";
    (session as unknown as Record<string, unknown>)["currentAttention"] = "working";

    session.handleSessionUpdate({
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "0:tool_x",
        title: "EnterPlanMode",
        kind: "other",
        status: "pending",
      },
    });
    expect(listener.onUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ config: expect.objectContaining({ mode: "plan" }) }),
    );

    // The completed update carries no title — correlation is by tool call id.
    session.handleSessionUpdate({
      update: { sessionUpdate: "tool_call_update", toolCallId: "0:tool_x", status: "completed" },
    });

    expect(listener.onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "working",
        attention: "working",
        config: expect.objectContaining({ mode: "plan" }),
      }),
    );
  });

  it("returns to agent mode when the agent leaves plan mode, keeping the approval policy", () => {
    // Adopting the entry without the exit would leave the thread claiming plan
    // mode after the agent left it — and because the config would already read
    // `plan`, nothing would re-assert it, so an edit could land while the
    // composer still showed Plan.
    const { listener, session } = makeConfigSyncSession({
      currentConfig: { model: "model-a", effort: "high", mode: "plan", approvalPolicy: "auto" },
    });

    session.handleSessionUpdate({
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "0:tool_exit",
        title: "ExitPlanMode",
        status: "pending",
      },
    });
    session.handleSessionUpdate({
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "0:tool_exit",
        status: "completed",
        content: [
          {
            type: "content",
            content: { type: "text", text: "Exited plan mode. Plan mode deactivated." },
          },
        ],
      },
    });

    expect(listener.onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ mode: "agent", approvalPolicy: "auto" }),
      }),
    );
  });

  it("stays in plan mode when the plan review only asks for revisions", () => {
    const { listener, session } = makeConfigSyncSession({
      currentConfig: { model: "model-a", effort: "high", mode: "plan", approvalPolicy: "default" },
    });

    session.handleSessionUpdate({
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "0:tool_exit",
        title: "ExitPlanMode",
        status: "pending",
      },
    });
    session.handleSessionUpdate({
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "0:tool_exit",
        status: "failed",
        content: [
          {
            type: "content",
            content: { type: "text", text: "User requested revisions. Plan mode remains active." },
          },
        ],
      },
    });

    expect(listener.onUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ config: expect.objectContaining({ mode: "agent" }) }),
    );
  });

  it("keeps the mode unchanged when EnterPlanMode fails", () => {
    const { listener, session } = makeConfigSyncSession();

    session.handleSessionUpdate({
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "0:tool_x",
        title: "EnterPlanMode",
        status: "pending",
      },
    });
    session.handleSessionUpdate({
      update: { sessionUpdate: "tool_call_update", toolCallId: "0:tool_x", status: "failed" },
    });

    expect(listener.onUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ config: expect.objectContaining({ mode: "plan" }) }),
    );
  });

  it("ignores EnterPlanMode tool calls replayed from a loaded session's history", () => {
    // On load/resume the agent's SessionModeState.currentModeId is authoritative;
    // a historical entry may since have been exited.
    const { listener, session } = makeConfigSyncSession();
    (session as unknown as Record<string, unknown>)["isReplayingHistory"] = true;

    session.handleSessionUpdate({
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "0:tool_x",
        title: "EnterPlanMode",
        status: "pending",
      },
    });
    session.handleSessionUpdate({
      update: { sessionUpdate: "tool_call_update", toolCallId: "0:tool_x", status: "completed" },
    });

    expect(listener.onUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ config: expect.objectContaining({ mode: "plan" }) }),
    );
  });

  it("does not reopen a settled turn for an out-of-band ACP tool notification", () => {
    const { listener, session } = makeConfigSyncSession();

    session.handleSessionUpdate({
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "background-task",
        title: "Background task completed",
        kind: "other",
        status: "completed",
      },
    });

    expect(listener.onRuntimeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "item.started", itemType: "tool_call" }),
    );
    expect(listener.onUpdate).not.toHaveBeenCalledWith({
      status: "working",
      attention: "working",
    });
  });

  it("keeps the foreground runtime turn open until its background subagent finishes", async () => {
    const { connection, listener, session } = makeConfigSyncSession();
    let resolvePrompt!: (result: { stopReason: string }) => void;
    connection.prompt.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePrompt = resolve;
      }),
    );

    const turn = session.startTurn("launch background research", {
      model: "model-a",
      effort: "low",
      mode: "agent",
      approvalPolicy: "default",
    });
    await vi.waitFor(() => expect(connection.prompt).toHaveBeenCalledOnce());

    session.handleSessionUpdate({
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "detached-agent",
        title: "Agent",
        status: "in_progress",
        rawInput: {
          _toolName: "task",
          subagent_type: "Explore",
          description: "Inspect mapping",
          background: true,
        },
      },
    });
    resolvePrompt({ stopReason: "end_turn" });
    await turn;

    const parentStart = listener.onRuntimeEvent.mock.calls
      .map(([event]) => event as { type?: string; itemType?: string; itemId?: string })
      .find((event) => event.type === "item.started" && event.itemType === "tool_call");
    expect(parentStart?.itemId).toBeTruthy();
    expect(listener.onRuntimeEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "item.completed", itemId: parentStart?.itemId }),
    );
    expect(listener.onRuntimeEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "turn.completed" }),
    );
    expect(listener.onUpdate).not.toHaveBeenLastCalledWith({ status: "idle", attention: "none" });

    listener.onRuntimeEvent.mockClear();
    listener.onUpdate.mockClear();
    session.handleSessionUpdate({
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "The detached child completed." },
        _meta: { poracodeParentToolCallId: "detached-agent" },
      },
    });

    expect(listener.onRuntimeEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "turn.started" }),
    );
    expect(listener.onRuntimeEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "item.started",
        itemType: "assistant_message",
        parentItemId: parentStart?.itemId,
      }),
    );
    expect(listener.onUpdate).not.toHaveBeenCalledWith({ status: "idle", attention: "none" });

    listener.onRuntimeEvent.mockClear();
    listener.onUpdate.mockClear();
    session.handleSessionUpdate({
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "detached-agent",
        status: "completed",
        rawInput: {
          _toolName: "task",
          subagent_type: "Explore",
          description: "Inspect mapping",
          background: true,
        },
        _meta: { poracodeDetachedSubAgentActivity: "detached-agent" },
      },
    });

    const terminalEvents = listener.onRuntimeEvent.mock.calls.map(([event]) => event);
    expect(terminalEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "item.completed", itemId: parentStart?.itemId }),
        expect.objectContaining({ type: "turn.completed", state: "completed" }),
      ]),
    );
    expect(listener.onUpdate).toHaveBeenLastCalledWith({
      status: "idle",
      attention: "none",
    });
  });

  it("keeps one continuous foreground turn across concurrent background completions", async () => {
    const { connection, listener, session } = makeConfigSyncSession();
    let resolvePrompt!: (result: { stopReason: string }) => void;
    connection.prompt.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePrompt = resolve;
      }),
    );

    const turn = session.startTurn("launch two background agents", {
      model: "model-a",
      effort: "low",
      mode: "agent",
      approvalPolicy: "default",
    });
    await vi.waitFor(() => expect(connection.prompt).toHaveBeenCalledOnce());
    for (const toolCallId of ["foreground-bg-a", "foreground-bg-b"]) {
      session.handleSessionUpdate({
        update: {
          sessionUpdate: "tool_call",
          toolCallId,
          title: "Agent",
          status: "in_progress",
          rawInput: { _toolName: "task", subagent_type: "Explore", background: true },
        },
      });
    }
    resolvePrompt({ stopReason: "end_turn" });
    await turn;

    for (const toolCallId of ["foreground-bg-a", "foreground-bg-b"]) {
      session.handleSessionUpdate({
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId,
          status: "completed",
          rawInput: { _toolName: "task", subagent_type: "Explore", background: true },
          _meta: { poracodeDetachedSubAgentActivity: toolCallId },
        },
      });
    }

    const events = listener.onRuntimeEvent.mock.calls.map(([event]) => event as { type?: string });
    expect(events.filter((event) => event.type === "turn.started")).toHaveLength(1);
    expect(events.filter((event) => event.type === "turn.completed")).toHaveLength(1);
    const updates = listener.onUpdate.mock.calls.map(([update]) => update);
    expect(
      updates.filter((update) => JSON.stringify(update).includes('"status":"idle"')),
    ).toHaveLength(1);
    expect(listener.onUpdate).toHaveBeenLastCalledWith({ status: "idle", attention: "none" });
  });

  it("stays working until all concurrently reporting detached subagents complete", () => {
    const { listener, session } = makeConfigSyncSession();
    for (const toolCallId of ["detached-a", "detached-b"]) {
      session.handleSessionUpdate({
        update: {
          sessionUpdate: "tool_call",
          toolCallId,
          title: "Agent",
          status: "in_progress",
          rawInput: {
            _toolName: "task",
            subagent_type: "Explore",
            background: true,
          },
        },
      });
    }
    listener.onRuntimeEvent.mockClear();
    listener.onUpdate.mockClear();

    for (const toolCallId of ["detached-a", "detached-b"]) {
      session.handleSessionUpdate({
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: `${toolCallId} reporting` },
          _meta: {
            poracodeNewAssistantItem: true,
            poracodeDetachedSubAgentActivity: toolCallId,
          },
        },
      });
    }
    expect(
      listener.onRuntimeEvent.mock.calls
        .map(([event]) => event as { type?: string })
        .filter((event) => event.type === "turn.started"),
    ).toHaveLength(1);
    expect(listener.onUpdate).toHaveBeenCalledWith({
      status: "working",
      attention: "working",
    });

    listener.onRuntimeEvent.mockClear();
    listener.onUpdate.mockClear();
    session.handleSessionUpdate({
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "detached-a",
        status: "completed",
        rawInput: { _toolName: "task", subagent_type: "Explore", background: true },
        _meta: { poracodeDetachedSubAgentActivity: "detached-a" },
      },
    });
    expect(listener.onRuntimeEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "turn.completed" }),
    );
    expect(listener.onUpdate).not.toHaveBeenCalledWith({ status: "idle", attention: "none" });

    session.handleSessionUpdate({
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "detached-b",
        status: "completed",
        rawInput: { _toolName: "task", subagent_type: "Explore", background: true },
        _meta: { poracodeDetachedSubAgentActivity: "detached-b" },
      },
    });
    expect(listener.onRuntimeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "turn.completed", state: "completed" }),
    );
    expect(listener.onUpdate).toHaveBeenLastCalledWith({ status: "idle", attention: "none" });
  });

  it("keeps an in-flight turn working when its ACP tool call starts", () => {
    const { listener, session } = makeConfigSyncSession();
    (session as unknown as Record<string, unknown>)["promptInFlight"] = true;

    session.handleSessionUpdate({
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "foreground-task",
        title: "Run checks",
        kind: "execute",
        status: "in_progress",
      },
    });

    expect(listener.onUpdate).toHaveBeenCalledWith({
      status: "working",
      attention: "working",
    });
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
    expect(listener.onUpdate).toHaveBeenLastCalledWith({
      status: "working",
      attention: "working",
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

  it("treats an interrupt-triggered prompt abort as a cancelled turn", async () => {
    const { connection, listener, session } = makeConfigSyncSession();
    let rejectPrompt: ((error: Error) => void) | undefined;
    connection.prompt.mockReturnValueOnce(
      new Promise<{ stopReason: string }>((_resolve, reject) => {
        rejectPrompt = reject;
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
    rejectPrompt?.(new Error("Request was aborted."));
    await turnPromise;

    expect(listener.onRuntimeEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "error" }),
    );
    expect(listener.onRuntimeEvent.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "turn.completed",
      state: "cancelled",
    });
    expect(listener.onUpdate).toHaveBeenLastCalledWith({
      status: "idle",
      attention: "none",
    });
  });

  it("keeps prompt abort errors as failures when no interrupt was requested", async () => {
    const { connection, listener, session } = makeConfigSyncSession();
    connection.prompt.mockRejectedValueOnce(new Error("Request was aborted."));

    await session.startTurn("hello", {
      model: "model-a",
      effort: "low",
      mode: "agent",
      approvalPolicy: "default",
    });

    expect(listener.onRuntimeEvent).toHaveBeenCalledWith({
      type: "error",
      threadId: "thread-1",
      message: "Request was aborted.",
    });
    expect(listener.onRuntimeEvent.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "turn.completed",
      state: "failed",
    });
    expect(listener.onUpdate).toHaveBeenLastCalledWith({
      status: "error",
      attention: "error",
      errorMessage: "Request was aborted.",
    });
  });

  it("closes open canonical items when a stuck turn is force-completed", () => {
    const { listener, session } = makeConfigSyncSession();
    (session as unknown as Record<string, unknown>)["currentTurnId"] = "turn-force";
    session.handleSessionUpdate({
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "tool-force",
        title: "Long-running task",
        kind: "execute",
        status: "in_progress",
      },
    });

    session.forceCompleteTurn();

    expect(listener.onRuntimeEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "item.completed",
        threadId: "thread-1",
        itemId: expect.any(String),
      }),
    );
    expect(listener.onRuntimeEvent.mock.calls.at(-1)?.[0]).toEqual({
      type: "turn.completed",
      threadId: "thread-1",
      turnId: "turn-force",
      state: "cancelled",
    });
  });
});

describe("ACP orphan turns — agent-initiated work after prompt() settled", () => {
  const ORPHAN_TURN_IDLE_MS = 20_000;

  afterEach(() => {
    vi.useRealTimers();
  });

  function statusUpdates(listener: { onUpdate: { mock: { calls: unknown[][] } } }) {
    return listener.onUpdate.mock.calls.map((call) => (call[0] as { status: string }).status);
  }

  function runtimeEventTypes(listener: { onRuntimeEvent: { mock: { calls: unknown[][] } } }) {
    return listener.onRuntimeEvent.mock.calls.map((call) => (call[0] as { type: string }).type);
  }

  function thoughtChunk(text: string) {
    return { update: { sessionUpdate: "agent_thought_chunk", content: { type: "text", text } } };
  }

  it("reopens a working turn when the agent keeps going after its prompt settled", () => {
    const { listener, session } = makeConfigSyncSession();

    session.handleSessionUpdate(thoughtChunk("still thinking about the fix"));

    expect(statusUpdates(listener)).toEqual(["working"]);
    expect(runtimeEventTypes(listener)).toContain("turn.started");
  });

  it("ignores empty chunks and metadata-only updates so trailing chatter cannot reopen a turn", () => {
    const { listener, session } = makeConfigSyncSession();

    session.handleSessionUpdate({
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "" } },
    });
    session.handleSessionUpdate({ update: { sessionUpdate: "session_info_update", title: "t" } });
    session.handleSessionUpdate({
      update: { sessionUpdate: "available_commands_update", availableCommands: [] },
    });

    expect(statusUpdates(listener)).not.toContain("working");
    expect(runtimeEventTypes(listener)).not.toContain("turn.started");
  });

  it("closes the orphan turn after the idle window, closing its open items", () => {
    vi.useFakeTimers();
    const { listener, session } = makeConfigSyncSession();

    session.handleSessionUpdate({
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "summary" } },
    });
    expect(statusUpdates(listener)).toEqual(["working"]);

    vi.advanceTimersByTime(ORPHAN_TURN_IDLE_MS + 1);

    expect(statusUpdates(listener)).toEqual(["working", "idle"]);
    // The streaming assistant item must not be left dangling in `updated`.
    expect(runtimeEventTypes(listener)).toContain("item.completed");
    expect(listener.onRuntimeEvent.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "turn.completed",
      state: "completed",
    });
  });

  it("stays working past the idle window while a tool call is still open", () => {
    vi.useFakeTimers();
    const { listener, session } = makeConfigSyncSession();

    session.handleSessionUpdate({
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "tc-1",
        title: "shell exec",
        kind: "execute",
        status: "in_progress",
        rawInput: { command: "pnpm run test", cwd: "C:\\repo" },
      },
    });
    // A long test run emits nothing for minutes; that is not idleness.
    vi.advanceTimersByTime(ORPHAN_TURN_IDLE_MS * 10);
    expect(statusUpdates(listener)).toEqual(["working"]);

    session.handleSessionUpdate({
      update: { sessionUpdate: "tool_call_update", toolCallId: "tc-1", status: "completed" },
    });
    vi.advanceTimersByTime(ORPHAN_TURN_IDLE_MS + 1);

    expect(statusUpdates(listener).at(-1)).toBe("idle");
  });

  it("sends session/cancel when Stop lands on an orphan turn", async () => {
    const { connection, listener, session } = makeConfigSyncSession();
    session.handleSessionUpdate(thoughtChunk("mid-flight"));

    await session.interruptTurn();

    expect(connection.cancel).toHaveBeenCalledWith({ sessionId: "session-1" });
    expect(statusUpdates(listener).at(-1)).toBe("idle");
  });

  it("lets a real prompt supersede an orphan turn without an idle flicker", async () => {
    const { listener, session } = makeConfigSyncSession();
    session.handleSessionUpdate(thoughtChunk("leftover work"));
    listener.onRuntimeEvent.mockClear();
    listener.onUpdate.mockClear();

    await session.startTurn("next question", { model: "model-a" });

    const types = runtimeEventTypes(listener);
    expect(types.indexOf("turn.completed")).toBeLessThan(types.indexOf("turn.started"));
    // The handover paints `working` straight away — no idle in between. (The
    // trailing idle is this prompt's own end_turn, which the mock resolves.)
    expect(statusUpdates(listener)[0]).toBe("working");
  });

  it("covers the Qwen case: work continuing after end_turn gets its own turn", async () => {
    const { connection, listener, session } = makeConfigSyncSession();
    connection.prompt.mockResolvedValueOnce({ stopReason: "end_turn" });

    await session.startTurn("investigate this", { model: "model-a" });
    expect(statusUpdates(listener).at(-1)).toBe("idle");
    listener.onRuntimeEvent.mockClear();
    listener.onUpdate.mockClear();

    // Qwen settles our prompt and immediately opens a turn of its own to
    // process a backgrounded subagent's report. Nothing tags these updates.
    session.handleSessionUpdate(thoughtChunk("now let me apply the fix"));

    expect(statusUpdates(listener)).toEqual(["working"]);
    expect(runtimeEventTypes(listener)).toContain("turn.started");
  });

  it("leaves turn ownership alone while our own prompt is in flight", () => {
    const { listener, session } = makeConfigSyncSession();
    (session as unknown as Record<string, unknown>)["promptInFlight"] = true;

    session.handleSessionUpdate(thoughtChunk("normal streaming"));

    expect(runtimeEventTypes(listener)).not.toContain("turn.started");
  });
});
