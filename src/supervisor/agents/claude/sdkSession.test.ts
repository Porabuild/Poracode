import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CanUseTool,
  PermissionMode,
  Query,
  SDKControlGetContextUsageResponse,
  SDKMessage,
  SpawnOptions,
  SpawnedProcess,
} from "@anthropic-ai/claude-agent-sdk";
import type {
  ProjectLocation,
  RuntimeEvent,
  SessionRef,
  ThreadConfig,
  ThreadServerRequestId,
} from "@/shared/contracts";
import type { StructuredSessionUpdate } from "../base";
import { ClaudeSdkSession } from "./sdkSession";

const mockSdk = vi.hoisted(() => ({
  query: vi.fn<(input: unknown) => Query>(),
}));

const mockChildProcess = vi.hoisted(() => ({
  spawn:
    vi.fn<(command: string, args: string[], options: Record<string, unknown>) => SpawnedProcess>(),
}));

const mockBinaryResolver = vi.hoisted(() => ({
  resolveAgentBinaryPath:
    vi.fn<(location: ProjectLocation, binary: string) => string | undefined>(),
}));

const mockBase = vi.hoisted(() => ({
  getWslProjectShellEnv:
    vi.fn<(distro: string, cwd: string) => Record<string, string> | undefined>(),
  primeWslProjectShellEnv:
    vi.fn<(distro: string, cwd: string) => Promise<Record<string, string> | undefined>>(),
}));

const mockProcessTree = vi.hoisted(() => ({
  terminateChildProcessTree: vi.fn<(child: { pid?: number }) => void>(),
}));

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: mockSdk.query,
}));

vi.mock("../base", async () => {
  const actual = await vi.importActual<typeof import("../base")>("../base");
  return {
    ...actual,
    getWslProjectShellEnv: mockBase.getWslProjectShellEnv,
    primeWslProjectShellEnv: mockBase.primeWslProjectShellEnv,
  };
});

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    spawn: mockChildProcess.spawn,
  };
});

vi.mock("../binaryResolver", () => ({
  resolveAgentBinaryPath: mockBinaryResolver.resolveAgentBinaryPath,
}));

vi.mock("@/shared/processTree", () => ({
  terminateChildProcessTree: mockProcessTree.terminateChildProcessTree,
}));

// Real spawned objects are Node ChildProcess instances; ClaudeSdkSession
// registers an `exit` listener on them to track the process for teardown.
function makeFakeSpawnedChild(pid: number): SpawnedProcess {
  return {
    pid,
    once: vi.fn<(event: string, listener: (...args: unknown[]) => void) => void>(),
  } as unknown as SpawnedProcess;
}

function createFakeQuery(initCommands: Array<Record<string, string>> = []) {
  let closed = false;
  let resolveNext: ((result: IteratorResult<SDKMessage>) => void) | undefined;
  let rejectNext: ((error: unknown) => void) | undefined;
  const queuedMessages: SDKMessage[] = [];
  const setModel = vi.fn<(model?: string) => Promise<void>>().mockResolvedValue(undefined);
  const setPermissionMode = vi
    .fn<(mode: PermissionMode) => Promise<void>>()
    .mockResolvedValue(undefined);
  const getContextUsage = vi
    .fn<() => Promise<SDKControlGetContextUsageResponse>>()
    .mockResolvedValue({
      categories: [{ name: "Messages", tokens: 42_000, color: "#3366ff" }],
      totalTokens: 42_000,
      maxTokens: 1_000_000,
      rawMaxTokens: 1_000_000,
      percentage: 4.2,
      gridRows: [],
      model: "claude-opus-4-7[1m]",
      memoryFiles: [],
      mcpTools: [],
      isAutoCompactEnabled: true,
      agents: [],
      apiUsage: null,
    });
  const backgroundTasks = vi.fn<(toolUseId?: string) => Promise<boolean>>().mockResolvedValue(true);

  const runtime = {
    async next(): Promise<IteratorResult<SDKMessage>> {
      if (closed) return { done: true, value: undefined };
      const queued = queuedMessages.shift();
      if (queued) return { done: false, value: queued };
      return new Promise<IteratorResult<SDKMessage>>((resolve, reject) => {
        resolveNext = resolve;
        rejectNext = reject;
      });
    },
    async return(): Promise<IteratorResult<SDKMessage>> {
      closed = true;
      return { done: true, value: undefined };
    },
    async throw(error?: unknown): Promise<IteratorResult<SDKMessage>> {
      throw error;
    },
    [Symbol.asyncIterator]() {
      return this;
    },
    interrupt: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    setPermissionMode,
    setModel,
    setMaxThinkingTokens: vi
      .fn<(maxThinkingTokens: number | null) => Promise<void>>()
      .mockResolvedValue(undefined),
    applyFlagSettings: vi.fn<(settings: unknown) => Promise<void>>().mockResolvedValue(undefined),
    initializationResult: vi.fn<() => Promise<unknown>>().mockResolvedValue({
      commands: initCommands,
    }),
    supportedCommands: vi.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    supportedModels: vi.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    getContextUsage,
    backgroundTasks,
    close: vi.fn<() => void>(() => {
      closed = true;
      resolveNext?.({ done: true, value: undefined });
    }),
  } as unknown as Query;

  return {
    runtime,
    setModel,
    setPermissionMode,
    getContextUsage,
    backgroundTasks,
    emitMessage(message: SDKMessage): void {
      const resolve = resolveNext;
      resolveNext = undefined;
      rejectNext = undefined;
      if (resolve) {
        resolve({ done: false, value: message });
      } else {
        queuedMessages.push(message);
      }
    },
    emitStreamError(error: unknown): void {
      const reject = rejectNext;
      resolveNext = undefined;
      rejectNext = undefined;
      closed = true;
      reject?.(error);
    },
  };
}

async function flushAsyncWork(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function sdkSystemMessage(
  subtype: "hook_started" | "hook_progress" | "hook_response" | "session_state_changed",
  sessionId: string,
  extra: Record<string, unknown> = {},
): SDKMessage {
  return {
    type: "system",
    subtype,
    uuid: `uuid-${subtype}`,
    session_id: sessionId,
    ...extra,
  } as unknown as SDKMessage;
}

function sdkAssistantMessage(sessionId: string, uuid: string, text: string): SDKMessage {
  return {
    type: "assistant",
    uuid,
    session_id: sessionId,
    parent_tool_use_id: null,
    message: {
      id: uuid,
      role: "assistant",
      content: [{ type: "text", text }],
    },
  } as unknown as SDKMessage;
}

function sdkAssistantMessageWithParent(
  sessionId: string,
  uuid: string,
  text: string,
  parentToolUseId: string,
): SDKMessage {
  return {
    type: "assistant",
    uuid,
    session_id: sessionId,
    parent_tool_use_id: parentToolUseId,
    message: {
      id: uuid,
      role: "assistant",
      content: [{ type: "text", text }],
    },
  } as unknown as SDKMessage;
}

function sdkSuccessResult(sessionId: string): SDKMessage {
  return {
    type: "result",
    subtype: "success",
    session_id: sessionId,
  } as unknown as SDKMessage;
}

function sdkErrorResult(sessionId: string): SDKMessage {
  return {
    type: "result",
    subtype: "error_during_execution",
    is_error: true,
    errors: ["upstream API failure"],
    session_id: sessionId,
  } as unknown as SDKMessage;
}

function sdkTaskStarted(sessionId: string, taskId: string, toolUseId: string): SDKMessage {
  return {
    type: "system",
    subtype: "task_started",
    uuid: `uuid-task-started-${taskId}`,
    session_id: sessionId,
    task_id: taskId,
    tool_use_id: toolUseId,
    subagent_type: "general-purpose",
  } as unknown as SDKMessage;
}

function sdkTaskNotification(
  sessionId: string,
  taskId: string,
  status: "completed" | "failed" = "completed",
): SDKMessage {
  return {
    type: "system",
    subtype: "task_notification",
    uuid: `uuid-task-notification-${taskId}`,
    session_id: sessionId,
    task_id: taskId,
    status,
  } as unknown as SDKMessage;
}

describe("ClaudeSdkSession", () => {
  const projectLocation: ProjectLocation = { kind: "windows", path: "C:\\repo" };
  const wslProjectLocation: ProjectLocation = {
    kind: "wsl",
    distro: "Ubuntu",
    linuxPath: "/home/demo/project",
    uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\project",
  };
  const config: ThreadConfig = { model: "sonnet" };
  const sessionRef: SessionRef = {
    providerSessionId: "11111111-1111-4111-8111-111111111111",
    discoveredAt: "2026-05-14T00:00:00.000Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockChildProcess.spawn.mockReturnValue(makeFakeSpawnedChild(1234));
    mockBase.getWslProjectShellEnv.mockReturnValue(undefined);
    mockBase.primeWslProjectShellEnv.mockResolvedValue(undefined);
    mockBinaryResolver.resolveAgentBinaryPath.mockImplementation(
      (location: ProjectLocation, binary: string) =>
        location.kind === "wsl" && binary === "claude" ? "/home/demo/.local/bin/claude" : undefined,
    );
  });

  it("waits for SDK query creation before sending the first GUI turn", async () => {
    const fake = createFakeQuery();
    mockSdk.query.mockReturnValue(fake.runtime);
    const runtimeEvents: RuntimeEvent[] = [];
    const updates: StructuredSessionUpdate[] = [];
    const session = await ClaudeSdkSession.create({
      threadId: "thread-claude-sdk",
      projectLocation,
      config,
      presentationMode: "gui",
    });
    session.setListener({
      onRuntimeEvent: (event) => runtimeEvents.push(event),
      onUpdate: (update) => updates.push(update),
      onError: () => {},
      onClose: () => {},
    });

    await session.openThread(config);
    const startTurn = session.startTurn("hello", config);

    expect(updates.at(-1)).toMatchObject({ status: "working", attention: "working" });
    expect(runtimeEvents.some((event) => event.type === "turn.started")).toBe(true);

    await expect(startTurn).resolves.toBeUndefined();

    expect(mockSdk.query).toHaveBeenCalledTimes(1);
    expect(mockSdk.query).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          includePartialMessages: true,
          forwardSubagentText: true,
        }),
      }),
    );
    expect(fake.setModel).not.toHaveBeenCalled();
    expect(fake.setPermissionMode).not.toHaveBeenCalled();

    await session.dispose();
  });

  it("force-kills the spawned process tree on dispose", async () => {
    const fake = createFakeQuery();
    mockSdk.query.mockReturnValue(fake.runtime);
    const spawnedChild = makeFakeSpawnedChild(4242);
    mockChildProcess.spawn.mockReturnValue(spawnedChild);

    const session = await ClaudeSdkSession.create({
      threadId: "thread-claude-kill",
      projectLocation: wslProjectLocation,
      config,
      presentationMode: "gui",
    });
    session.setListener({
      onRuntimeEvent: () => {},
      onUpdate: () => {},
      onError: () => {},
      onClose: () => {},
    });
    await session.openThread(config);

    // The SDK transport drives process spawning lazily through the custom hook;
    // invoke it the way the SDK would so the session captures the child.
    const queryInput = mockSdk.query.mock.calls[0]?.[0] as {
      options?: { spawnClaudeCodeProcess?: (opts: SpawnOptions) => SpawnedProcess };
    };
    const spawnHook = queryInput.options?.spawnClaudeCodeProcess;
    expect(spawnHook).toBeTypeOf("function");
    expect(spawnHook!({ args: [], env: {} } as unknown as SpawnOptions)).toBe(spawnedChild);
    expect(mockProcessTree.terminateChildProcessTree).not.toHaveBeenCalled();

    await session.dispose();

    expect(mockProcessTree.terminateChildProcessTree).toHaveBeenCalledTimes(1);
    expect(mockProcessTree.terminateChildProcessTree).toHaveBeenCalledWith(
      expect.objectContaining({ pid: 4242 }),
    );
  });

  it("switches the SDK permission mode for plan turns instead of changing the base policy", async () => {
    const fake = createFakeQuery();
    mockSdk.query.mockReturnValue(fake.runtime);
    const planConfig: ThreadConfig = { model: "sonnet", mode: "plan" };
    const session = await ClaudeSdkSession.create({
      threadId: "thread-claude-plan",
      projectLocation,
      config: planConfig,
      presentationMode: "gui",
    });
    session.setListener({
      onRuntimeEvent: () => {},
      onUpdate: () => {},
      onError: () => {},
      onClose: () => {},
    });

    await session.openThread(planConfig);
    const queryInput = mockSdk.query.mock.calls[0]?.[0] as { options?: Record<string, unknown> };
    expect(queryInput.options).toMatchObject({ permissionMode: "auto" });

    await session.startTurn("plan this", planConfig);
    expect(fake.setPermissionMode).toHaveBeenCalledWith("plan");

    await session.dispose();
  });

  it("restores the configured SDK permission mode after plan turns", async () => {
    const fake = createFakeQuery();
    mockSdk.query.mockReturnValue(fake.runtime);
    const planConfig: ThreadConfig = {
      model: "sonnet",
      mode: "plan",
      approvalPolicy: "acceptEdits",
    };
    const workConfig: ThreadConfig = {
      model: "sonnet",
      mode: "agent",
      approvalPolicy: "acceptEdits",
    };
    const session = await ClaudeSdkSession.create({
      threadId: "thread-claude-plan-deny",
      projectLocation,
      config: planConfig,
      presentationMode: "gui",
    });
    session.setListener({
      onRuntimeEvent: () => {},
      onUpdate: () => {},
      onError: () => {},
      onClose: () => {},
    });

    await session.openThread(planConfig);
    await session.startTurn("plan this", planConfig);
    await session.startTurn("build this", workConfig);

    expect(fake.setPermissionMode).toHaveBeenNthCalledWith(1, "plan");
    expect(fake.setPermissionMode).toHaveBeenNthCalledWith(2, "acceptEdits");

    await session.dispose();
  });

  it("returns AskUserQuestion answers keyed by question text with SDK labels", async () => {
    const fake = createFakeQuery();
    mockSdk.query.mockReturnValue(fake.runtime);
    const runtimeEvents: RuntimeEvent[] = [];
    const session = await ClaudeSdkSession.create({
      threadId: "thread-claude-question",
      projectLocation,
      config,
      presentationMode: "gui",
    });
    session.setListener({
      onRuntimeEvent: (event) => runtimeEvents.push(event),
      onUpdate: () => {},
      onError: () => {},
      onClose: () => {},
    });

    await session.openThread(config);
    const queryInput = mockSdk.query.mock.calls[0]?.[0] as {
      options?: { canUseTool?: CanUseTool };
    };
    const canUseTool = queryInput.options?.canUseTool;
    if (!canUseTool) throw new Error("missing canUseTool");

    const questions = [
      {
        question: "Which features should be enabled?",
        header: "Features",
        multiSelect: true,
        options: [
          { optionId: "fast", label: "Fast mode", description: "Use the fast path." },
          { optionId: "safe", label: "Safe mode", description: "Run extra checks." },
        ],
      },
    ];
    const permissionPromise = canUseTool(
      "AskUserQuestion",
      { questions },
      {
        signal: new AbortController().signal,
        toolUseID: "toolu_question",
        requestId: "req_question",
      },
    );

    const opened = runtimeEvents.find((event) => event.type === "request.opened");
    expect(opened).toMatchObject({
      type: "request.opened",
      requestType: "tool_user_input",
      payload: { summary: "Which features should be enabled?" },
    });
    if (!opened || opened.type !== "request.opened") throw new Error("missing question request");

    await session.resolveServerRequest(opened.requestId as ThreadServerRequestId, {
      answers: {
        Features: ["fast", "safe"],
      },
    });

    await expect(permissionPromise).resolves.toMatchObject({
      behavior: "allow",
      updatedInput: {
        questions,
        answers: {
          "Which features should be enabled?": "Fast mode, Safe mode",
        },
      },
    });

    await session.dispose();
  });

  it("resumes with the persisted session id without adopting transient hook ids", async () => {
    mockSdk.query.mockClear();
    const fake = createFakeQuery();
    mockSdk.query.mockReturnValue(fake.runtime);
    const updates: StructuredSessionUpdate[] = [];
    const session = await ClaudeSdkSession.create({
      threadId: "thread-claude-resume",
      projectLocation,
      config,
      sessionRef,
      presentationMode: "gui",
    });
    session.setListener({
      onRuntimeEvent: () => {},
      onUpdate: (update) => updates.push(update),
      onError: () => {},
      onClose: () => {},
    });

    await expect(session.openThread(config, sessionRef)).resolves.toBe(
      sessionRef.providerSessionId,
    );

    const queryInput = mockSdk.query.mock.calls[0]?.[0] as { options?: Record<string, unknown> };
    expect(queryInput.options).toMatchObject({ resume: sessionRef.providerSessionId });
    expect(queryInput.options).not.toHaveProperty("sessionId");

    fake.emitMessage(sdkSystemMessage("hook_started", "22222222-2222-4222-8222-222222222222"));
    await flushAsyncWork();

    expect(updates).not.toContainEqual(
      expect.objectContaining({
        status: "working",
        sessionRef: expect.objectContaining({
          providerSessionId: "22222222-2222-4222-8222-222222222222",
        }),
      }),
    );

    fake.emitMessage(
      sdkSystemMessage("session_state_changed", "22222222-2222-4222-8222-222222222222", {
        state: "idle",
      }),
    );
    await vi.waitFor(() => {
      expect(updates.some((update) => update.status === "idle")).toBe(true);
    });
    expect(
      updates.some(
        (update) => update.sessionRef?.providerSessionId === "22222222-2222-4222-8222-222222222222",
      ),
    ).toBe(false);

    await session.dispose();
  });

  it("starts new SDK sessions with an explicit session id without marking idle threads working", async () => {
    mockSdk.query.mockClear();
    const fake = createFakeQuery();
    mockSdk.query.mockReturnValue(fake.runtime);
    const updates: StructuredSessionUpdate[] = [];
    const session = await ClaudeSdkSession.create({
      threadId: "thread-claude-new",
      projectLocation,
      config,
      presentationMode: "gui",
    });
    session.setListener({
      onRuntimeEvent: () => {},
      onUpdate: (update) => updates.push(update),
      onError: () => {},
      onClose: () => {},
    });

    const openedSessionId = await session.openThread(config);
    expect(openedSessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );

    const queryInput = mockSdk.query.mock.calls[0]?.[0] as { options?: Record<string, unknown> };
    expect(queryInput.options).not.toHaveProperty("resume");
    expect(queryInput.options).toHaveProperty("sessionId", openedSessionId);

    fake.emitMessage(
      sdkSystemMessage("session_state_changed", openedSessionId, {
        state: "idle",
      }),
    );

    await vi.waitFor(() => {
      expect(updates).toContainEqual(
        expect.objectContaining({
          status: "idle",
          attention: "none",
        }),
      );
    });
    expect(updates.some((update) => update.status === "working")).toBe(false);

    await session.dispose();
  });

  it("reopens the turn to working when the model resumes after idle without a new prompt", async () => {
    const fake = createFakeQuery();
    mockSdk.query.mockReturnValue(fake.runtime);
    const runtimeEvents: RuntimeEvent[] = [];
    const updates: StructuredSessionUpdate[] = [];
    const session = await ClaudeSdkSession.create({
      threadId: "thread-claude-wakeup",
      projectLocation,
      config,
      presentationMode: "gui",
    });
    session.setListener({
      onRuntimeEvent: (event) => runtimeEvents.push(event),
      onUpdate: (update) => updates.push(update),
      onError: () => {},
      onClose: () => {},
    });

    const openedSessionId = await session.openThread(config);
    await session.startTurn("kick off some background work", config);
    await flushAsyncWork();

    // First turn settles to idle (the model scheduled a wakeup / backgrounded a task).
    fake.emitMessage(sdkAssistantMessage(openedSessionId, "assistant-uuid-1", "on it"));
    fake.emitMessage(sdkSuccessResult(openedSessionId));
    await flushAsyncWork();
    expect(updates.at(-1)).toMatchObject({ status: "idle" });

    const turnStartsAfterFirst = runtimeEvents.filter((e) => e.type === "turn.started").length;
    const turnCompletesAfterFirst = runtimeEvents.filter((e) => e.type === "turn.completed").length;

    // The wakeup re-invokes the model with NO new user prompt (no startTurn).
    fake.emitMessage(
      sdkAssistantMessage(openedSessionId, "assistant-uuid-2", "background job done"),
    );
    await flushAsyncWork();

    // Status flips back to working and a fresh turn is opened on the wire.
    expect(updates.at(-1)).toMatchObject({ status: "working", attention: "working" });
    expect(runtimeEvents.filter((e) => e.type === "turn.started").length).toBe(
      turnStartsAfterFirst + 1,
    );

    // The resumed turn settles cleanly back to idle with its own turn.completed.
    fake.emitMessage(sdkSuccessResult(openedSessionId));
    await flushAsyncWork();
    expect(updates.at(-1)).toMatchObject({ status: "idle" });
    expect(runtimeEvents.filter((e) => e.type === "turn.completed").length).toBe(
      turnCompletesAfterFirst + 1,
    );

    await session.dispose();
  });

  it("does not open a resumed turn on sub-agent chatter after idle", async () => {
    const fake = createFakeQuery();
    mockSdk.query.mockReturnValue(fake.runtime);
    const runtimeEvents: RuntimeEvent[] = [];
    const updates: StructuredSessionUpdate[] = [];
    const session = await ClaudeSdkSession.create({
      threadId: "thread-claude-subagent-idle",
      projectLocation,
      config,
      presentationMode: "gui",
    });
    session.setListener({
      onRuntimeEvent: (event) => runtimeEvents.push(event),
      onUpdate: (update) => updates.push(update),
      onError: () => {},
      onClose: () => {},
    });

    const openedSessionId = await session.openThread(config);
    await session.startTurn("launch a background subagent", config);
    await flushAsyncWork();
    fake.emitMessage(sdkAssistantMessage(openedSessionId, "assistant-uuid-1", "launched"));
    fake.emitMessage(sdkSuccessResult(openedSessionId));
    await flushAsyncWork();
    expect(updates.at(-1)).toMatchObject({ status: "idle" });

    const turnStartsAfterIdle = runtimeEvents.filter((e) => e.type === "turn.started").length;

    // Sub-agent output keeps arriving AFTER the main result — must NOT reopen a turn.
    fake.emitMessage(
      sdkAssistantMessageWithParent(openedSessionId, "sub-uuid-1", "subagent working", "toolu_p"),
    );
    await flushAsyncWork();

    expect(updates.at(-1)).toMatchObject({ status: "idle" });
    expect(runtimeEvents.filter((e) => e.type === "turn.started").length).toBe(turnStartsAfterIdle);

    await session.dispose();
  });

  it("prepares a steer interrupt by backgrounding foreground tasks", async () => {
    const fake = createFakeQuery();
    mockSdk.query.mockReturnValue(fake.runtime);
    const session = await ClaudeSdkSession.create({
      threadId: "thread-claude-steer",
      projectLocation,
      config,
      presentationMode: "gui",
    });
    session.setListener({
      onRuntimeEvent: () => {},
      onUpdate: () => {},
      onError: () => {},
      onClose: () => {},
    });

    await session.openThread(config);
    await session.startTurn("first", config);
    await flushAsyncWork();
    expect("steerTurn" in session).toBe(false);

    await session.prepareSteerInterrupt!();

    expect(fake.backgroundTasks).toHaveBeenCalledTimes(1);
    expect(fake.runtime.interrupt).not.toHaveBeenCalled();

    await session.dispose();
  });

  it("rolls back SDK sessions by reopening Claude at the target assistant UUID", async () => {
    mockSdk.query.mockClear();
    const firstQuery = createFakeQuery();
    const resumedQuery = createFakeQuery();
    mockSdk.query.mockReturnValueOnce(firstQuery.runtime).mockReturnValueOnce(resumedQuery.runtime);
    const session = await ClaudeSdkSession.create({
      threadId: "thread-claude-rollback",
      projectLocation,
      config,
      presentationMode: "gui",
    });
    session.setListener({
      onRuntimeEvent: () => {},
      onUpdate: () => {},
      onError: () => {},
      onClose: () => {},
    });

    const openedSessionId = await session.openThread(config);
    await flushAsyncWork();

    await session.startTurn("first", config);
    firstQuery.emitMessage(sdkAssistantMessage(openedSessionId, "assistant-uuid-1", "first"));
    await flushAsyncWork();
    firstQuery.emitMessage(sdkSuccessResult(openedSessionId));
    await flushAsyncWork();

    await session.startTurn("second", config);
    firstQuery.emitMessage(sdkAssistantMessage(openedSessionId, "assistant-uuid-2", "second"));
    await flushAsyncWork();
    firstQuery.emitMessage(sdkSuccessResult(openedSessionId));
    await flushAsyncWork();

    await expect(session.rollbackThread(1)).resolves.toEqual({
      providerSessionId: openedSessionId,
      messages: [],
    });

    expect(firstQuery.runtime.close).toHaveBeenCalledTimes(1);
    expect(mockSdk.query).toHaveBeenCalledTimes(2);
    const queryInput = mockSdk.query.mock.calls[1]?.[0] as { options?: Record<string, unknown> };
    expect(queryInput.options).toMatchObject({
      resume: openedSessionId,
      resumeSessionAt: "assistant-uuid-1",
    });
    expect(queryInput.options).not.toHaveProperty("sessionId");

    await session.dispose();
  });

  it("spawns WSL GUI sessions directly via wsl.exe without a login shell", async () => {
    const fake = createFakeQuery();
    mockSdk.query.mockReturnValue(fake.runtime);
    mockBase.getWslProjectShellEnv.mockImplementation((_distro, cwd) =>
      cwd === "/home/demo/project"
        ? {
            PATH: "/home/demo/.nvm/versions/node/v24/bin:/usr/bin:/bin",
            NVM_DIR: "/home/demo/.nvm",
            LS_COLORS: "rs=0:di=01;34:ln=01",
          }
        : undefined,
    );
    const signal = new AbortController().signal;
    const session = await ClaudeSdkSession.create({
      threadId: "thread-claude-wsl",
      projectLocation: wslProjectLocation,
      config,
      presentationMode: "gui",
    });
    session.setListener({
      onRuntimeEvent: () => {},
      onUpdate: () => {},
      onError: () => {},
      onClose: () => {},
    });

    await session.openThread(config);
    expect(mockBase.primeWslProjectShellEnv).toHaveBeenCalledWith("Ubuntu", "/home/demo/project");

    const queryInput = mockSdk.query.mock.calls[0]?.[0] as {
      options?: {
        spawnClaudeCodeProcess?: (spawnOptions: SpawnOptions) => SpawnedProcess;
      };
    };
    const spawnClaudeCodeProcess = queryInput.options?.spawnClaudeCodeProcess;
    expect(spawnClaudeCodeProcess).toEqual(expect.any(Function));

    spawnClaudeCodeProcess?.({
      command: "/home/demo/.local/bin/claude",
      args: ["chat", "--json"],
      cwd: "/home/demo/project/subdir",
      env: {
        BROWSER: "/bin/true",
        CLAUDE_AGENT_SDK_CLIENT_APP: "poracode",
        LOCALAPPDATA: "C:\\Users\\demo\\AppData\\Local",
        PATH: "C:\\Windows\\System32",
        FOO: "bar",
      },
      signal,
    });

    expect(mockChildProcess.spawn).toHaveBeenCalledTimes(1);
    const [command, args, options] = mockChildProcess.spawn.mock.calls[0] as [
      string,
      string[],
      Record<string, unknown>,
    ];
    expect(command.toLowerCase()).toMatch(/wsl\.exe$/);
    const wslPreambleEnd = args.indexOf("--");
    expect(args.slice(0, wslPreambleEnd)).toEqual([
      "-d",
      "Ubuntu",
      "--cd",
      "/home/demo/project/subdir",
    ]);
    const shellArgs = args.slice(wslPreambleEnd + 1);
    expect(shellArgs.slice(0, 2)).toEqual(["/bin/sh", "-c"]);
    expect(args).not.toContain("-l");
    expect(args).not.toContain("-i");
    expect(shellArgs[2]).toBe(
      [
        "export PATH='/home/demo/.nvm/versions/node/v24/bin:/usr/bin:/bin'",
        "export NVM_DIR='/home/demo/.nvm'",
        "export LS_COLORS='rs=0:di=01;34:ln=01'",
        "export BROWSER='/bin/true'",
        "export CLAUDE_AGENT_SDK_CLIENT_APP='poracode'",
        "export FOO='bar'",
        "exec '/home/demo/.local/bin/claude' 'chat' '--json'",
      ].join("; "),
    );
    expect(options).toMatchObject({
      env: process.env,
      signal,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    await session.dispose();
  });

  it.skipIf(process.platform !== "win32")(
    "wraps native Windows SDK .cmd shims instead of spawning them directly",
    async () => {
      const fake = createFakeQuery();
      mockSdk.query.mockReturnValue(fake.runtime);
      const signal = new AbortController().signal;
      const session = await ClaudeSdkSession.create({
        threadId: "thread-claude-windows-shim",
        projectLocation,
        config,
        presentationMode: "gui",
      });
      session.setListener({
        onRuntimeEvent: () => {},
        onUpdate: () => {},
        onError: () => {},
        onClose: () => {},
      });

      await session.openThread(config);
      const queryInput = mockSdk.query.mock.calls[0]?.[0] as {
        options?: {
          spawnClaudeCodeProcess?: (spawnOptions: SpawnOptions) => SpawnedProcess;
        };
      };
      const spawnClaudeCodeProcess = queryInput.options?.spawnClaudeCodeProcess;
      expect(spawnClaudeCodeProcess).toEqual(expect.any(Function));

      spawnClaudeCodeProcess?.({
        command: "C:\\Users\\demo\\AppData\\Roaming\\npm\\claude.cmd",
        args: ["chat", "--json"],
        cwd: "C:\\repo\\subdir",
        env: {
          CLAUDE_AGENT_SDK_CLIENT_APP: "poracode",
          FOO: "bar",
          PATH: "C:\\Windows\\System32",
        },
        signal,
      });

      expect(mockChildProcess.spawn).toHaveBeenCalledTimes(1);
      const [command, _args, options] = mockChildProcess.spawn.mock.calls[0] as [
        string,
        string[],
        Record<string, unknown>,
      ];
      expect(command).not.toBe("C:\\Users\\demo\\AppData\\Roaming\\npm\\claude.cmd");
      expect(options).toMatchObject({
        cwd: "C:\\repo\\subdir",
        env: expect.objectContaining({
          CLAUDE_AGENT_SDK_CLIENT_APP: "poracode",
          FOO: "bar",
          PATH: "C:\\Windows\\System32",
        }),
        signal,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });

      await session.dispose();
    },
  );

  it("surfaces live SDK slash commands on GUI sessions", async () => {
    const fake = createFakeQuery([
      {
        name: "goal",
        description: "Set a goal — keep working until the condition is met",
        argumentHint: "",
      },
    ]);
    mockSdk.query.mockReturnValue(fake.runtime);
    const updates: StructuredSessionUpdate[] = [];
    const session = await ClaudeSdkSession.create({
      threadId: "thread-claude-goal",
      projectLocation,
      config,
      presentationMode: "gui",
    });
    session.setListener({
      onRuntimeEvent: () => {},
      onUpdate: (update) => updates.push(update),
      onError: () => {},
      onClose: () => {},
    });

    await session.openThread(config);
    await Promise.resolve();

    expect(updates).toContainEqual(
      expect.objectContaining({
        slashCommands: [
          {
            id: "goal",
            label: "goal — Set a goal — keep working until the condition is met",
            description: "Set a goal — keep working until the condition is met",
          },
        ],
      }),
    );

    await session.dispose();
  });

  it("refreshes current SDK context usage after result messages", async () => {
    const fake = createFakeQuery();
    mockSdk.query.mockReturnValue(fake.runtime);
    const runtimeEvents: RuntimeEvent[] = [];
    const session = await ClaudeSdkSession.create({
      threadId: "thread-claude-context",
      projectLocation,
      config: { model: "claude-opus-4-7", contextSize: "1m" },
      presentationMode: "gui",
    });
    session.setListener({
      onRuntimeEvent: (event) => runtimeEvents.push(event),
      onUpdate: () => {},
      onError: () => {},
      onClose: () => {},
    });

    await session.openThread({ model: "claude-opus-4-7", contextSize: "1m" });
    await flushAsyncWork();

    fake.emitMessage({
      type: "result",
      subtype: "success",
      usage: { total_tokens: 4_000_000 },
      session_id: "claude-session",
    } as unknown as SDKMessage);
    await flushAsyncWork();

    expect(fake.getContextUsage).toHaveBeenCalledTimes(1);
    expect(runtimeEvents).toContainEqual({
      type: "context.updated",
      threadId: "thread-claude-context",
      usage: {
        usedTokens: 42_000,
        maxTokens: 1_000_000,
        breakdown: [{ id: "messages-0", label: "Messages", tokens: 42_000 }],
      },
    });
    expect(
      runtimeEvents.some(
        (event) => event.type === "context.updated" && event.usage.usedTokens === 4_000_000,
      ),
    ).toBe(false);

    await session.dispose();
  });

  it("updates active goal tokens from live SDK api usage including cache", async () => {
    vi.useFakeTimers();
    try {
      const fake = createFakeQuery();
      fake.getContextUsage.mockResolvedValue({
        categories: [{ name: "Messages", tokens: 238_000, color: "#3366ff" }],
        totalTokens: 238_000,
        maxTokens: 1_000_000,
        rawMaxTokens: 1_000_000,
        percentage: 23.8,
        gridRows: [],
        model: "claude-opus-4-7[1m]",
        memoryFiles: [],
        mcpTools: [],
        isAutoCompactEnabled: true,
        agents: [],
        apiUsage: {
          input_tokens: 1_500,
          output_tokens: 500,
          cache_creation_input_tokens: 99_000,
          cache_read_input_tokens: 136_000,
        },
      });
      mockSdk.query.mockReturnValue(fake.runtime);
      const runtimeEvents: RuntimeEvent[] = [];
      const session = await ClaudeSdkSession.create({
        threadId: "thread-claude-goal-spend",
        projectLocation,
        config,
        presentationMode: "gui",
      });
      session.setListener({
        onRuntimeEvent: (event) => runtimeEvents.push(event),
        onUpdate: () => {},
        onError: () => {},
        onClose: () => {},
      });

      await session.openThread(config);
      await session.startTurn("/goal fix live token count", config);
      await vi.advanceTimersByTimeAsync(15_000);

      expect(runtimeEvents).toContainEqual({
        type: "context.updated",
        threadId: "thread-claude-goal-spend",
        usage: {
          usedTokens: 238_000,
          maxTokens: 1_000_000,
          breakdown: [{ id: "messages-0", label: "Messages", tokens: 238_000 }],
        },
      });
      expect(runtimeEvents).toContainEqual(
        expect.objectContaining({
          type: "item.updated",
          threadId: "thread-claude-goal-spend",
          payload: expect.objectContaining({
            objective: "fix live token count",
            status: "active",
            tokensUsed: 237_000,
          }),
        }),
      );
      expect(runtimeEvents).not.toContainEqual(
        expect.objectContaining({
          type: "item.updated",
          payload: expect.objectContaining({ tokensUsed: 238_000 }),
        }),
      );

      await session.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("treats a steered/interrupted turn as idle rather than a failed turn", async () => {
    const fake = createFakeQuery();
    mockSdk.query.mockReturnValue(fake.runtime);
    const updates: StructuredSessionUpdate[] = [];
    const session = await ClaudeSdkSession.create({
      threadId: "thread-claude-steer",
      projectLocation,
      config,
      presentationMode: "gui",
    });
    session.setListener({
      onRuntimeEvent: () => {},
      onUpdate: (update) => updates.push(update),
      onError: () => {},
      onClose: () => {},
    });

    const openedSessionId = await session.openThread(config);
    await flushAsyncWork();

    await session.startTurn("do the thing", config);
    // The user steers → the runtime fires interruptTurn() before the turn settles.
    await session.interruptTurn();
    expect(
      (fake.runtime as unknown as { interrupt: ReturnType<typeof vi.fn> }).interrupt,
    ).toHaveBeenCalledTimes(1);

    // claude.exe reports an interrupted turn as `error_during_execution` with
    // `is_error: true` and only a `[ede_diagnostic]` line. This must resolve to
    // idle — surfacing "Claude turn failed." on every steer is the bug.
    fake.emitMessage({
      type: "result",
      subtype: "error_during_execution",
      is_error: true,
      errors: ["[ede_diagnostic] turn interrupted before assistant content"],
      session_id: openedSessionId,
    } as unknown as SDKMessage);
    await flushAsyncWork();

    const resultUpdate = updates.at(-1);
    expect(resultUpdate?.status).toBe("idle");
    expect(resultUpdate?.attention).toBe("none");
    expect(resultUpdate?.errorMessage).toBeUndefined();
    expect(updates.some((update) => update.status === "error")).toBe(false);

    await session.dispose();
  });

  it("keeps a goal active when interruptTurn is authoritative for the result", async () => {
    const fake = createFakeQuery();
    mockSdk.query.mockReturnValue(fake.runtime);
    const runtimeEvents: RuntimeEvent[] = [];
    const session = await ClaudeSdkSession.create({
      threadId: "thread-claude-goal-steer",
      projectLocation,
      config,
      presentationMode: "gui",
    });
    session.setListener({
      onRuntimeEvent: (event) => runtimeEvents.push(event),
      onUpdate: () => {},
      onError: () => {},
      onClose: () => {},
    });

    const openedSessionId = await session.openThread(config);
    await flushAsyncWork();

    await session.startTurn("/goal fix the bug", config);
    await session.interruptTurn();
    const goalItemId = runtimeEvents.find(
      (event): event is Extract<RuntimeEvent, { type: "item.started" }> =>
        event.type === "item.started" && event.itemType === "goal",
    )?.itemId;
    expect(goalItemId).toBeDefined();

    fake.emitMessage({
      type: "result",
      subtype: "error_during_execution",
      is_error: true,
      errors: ["execution stopped by user"],
      usage: { total_tokens: 12_000 },
      session_id: openedSessionId,
    } as unknown as SDKMessage);
    await flushAsyncWork();

    const goalUpdates = runtimeEvents.filter(
      (event) => event.type === "item.updated" && event.itemId === goalItemId,
    );
    expect(goalUpdates.at(-1)).toMatchObject({
      payload: {
        status: "active",
        tokensUsed: 12_000,
      },
    });
    expect(runtimeEvents).not.toContainEqual(
      expect.objectContaining({
        type: "item.updated",
        itemId: goalItemId,
        payload: expect.objectContaining({ status: "complete" }),
      }),
    );
    expect(runtimeEvents).toContainEqual(
      expect.objectContaining({
        type: "turn.completed",
        state: "interrupted",
      }),
    );

    await session.dispose();
  });

  it("stops the goal-tracking poller after an interrupted turn while keeping the goal active", async () => {
    vi.useFakeTimers();
    try {
      const fake = createFakeQuery();
      mockSdk.query.mockReturnValue(fake.runtime);
      const runtimeEvents: RuntimeEvent[] = [];
      const session = await ClaudeSdkSession.create({
        threadId: "thread-claude-goal-interrupt-timer",
        projectLocation,
        config,
        presentationMode: "gui",
      });
      session.setListener({
        onRuntimeEvent: (event) => runtimeEvents.push(event),
        onUpdate: () => {},
        onError: () => {},
        onClose: () => {},
      });

      const openedSessionId = await session.openThread(config);
      await session.startTurn("/goal fix the bug", config);

      // Stop/steer mid-turn: interrupt, then the interrupted result settles it.
      await session.interruptTurn();
      fake.emitMessage({
        type: "result",
        subtype: "error_during_execution",
        is_error: true,
        errors: ["execution stopped by user"],
        session_id: openedSessionId,
      } as unknown as SDKMessage);
      await vi.advanceTimersByTimeAsync(0);

      // The goal is kept active across the stop (not completed/cleared).
      const goalItemId = runtimeEvents.find(
        (event): event is Extract<RuntimeEvent, { type: "item.started" }> =>
          event.type === "item.started" && event.itemType === "goal",
      )?.itemId;
      expect(
        runtimeEvents
          .filter((event) => event.type === "item.updated" && event.itemId === goalItemId)
          .at(-1),
      ).toMatchObject({ payload: { status: "active" } });

      // The 15s goal-tracking interval must have stopped — advancing well past
      // it produces no further context-usage polls (previously it leaked).
      const pollsAfterStop = fake.getContextUsage.mock.calls.length;
      await vi.advanceTimersByTimeAsync(45_000);
      expect(fake.getContextUsage.mock.calls.length).toBe(pollsAfterStop);

      await session.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the thread working when the main result arrives while a background task is live", async () => {
    const fake = createFakeQuery();
    mockSdk.query.mockReturnValue(fake.runtime);
    const updates: StructuredSessionUpdate[] = [];
    const session = await ClaudeSdkSession.create({
      threadId: "thread-claude-bg-defer",
      projectLocation,
      config,
      presentationMode: "gui",
    });
    session.setListener({
      onRuntimeEvent: () => {},
      onUpdate: (update) => updates.push(update),
      onError: () => {},
      onClose: () => {},
    });

    const openedSessionId = await session.openThread(config);
    await session.startTurn("launch a background subagent", config);
    await flushAsyncWork();

    // A background subagent registers, then the main turn's result arrives.
    fake.emitMessage(sdkTaskStarted(openedSessionId, "task-1", "toolu_bg1"));
    fake.emitMessage(sdkSuccessResult(openedSessionId));
    await flushAsyncWork();

    expect(updates.at(-1)).toMatchObject({ status: "working", attention: "working" });
    expect(updates.some((update) => update.status === "idle")).toBe(false);

    await session.dispose();
  });

  it("emits the deferred idle after the resume grace once the last background task_notification drains the registry", async () => {
    vi.useFakeTimers();
    try {
      const fake = createFakeQuery();
      mockSdk.query.mockReturnValue(fake.runtime);
      const updates: StructuredSessionUpdate[] = [];
      const runtimeEvents: RuntimeEvent[] = [];
      const session = await ClaudeSdkSession.create({
        threadId: "thread-claude-bg-drain",
        projectLocation,
        config,
        presentationMode: "gui",
      });
      session.setListener({
        onRuntimeEvent: (event) => runtimeEvents.push(event),
        onUpdate: (update) => updates.push(update),
        onError: () => {},
        onClose: () => {},
      });

      const openedSessionId = await session.openThread(config);
      await session.startTurn("/goal launch a background subagent", config);
      await vi.advanceTimersByTimeAsync(0);
      const goalItemId = runtimeEvents.find(
        (event): event is Extract<RuntimeEvent, { type: "item.started" }> =>
          event.type === "item.started" && event.itemType === "goal",
      )?.itemId;
      expect(goalItemId).toBeDefined();
      fake.emitMessage(sdkTaskStarted(openedSessionId, "task-1", "toolu_bg1"));
      fake.emitMessage(sdkSuccessResult(openedSessionId));
      await vi.advanceTimersByTimeAsync(0);
      expect(updates.at(-1)).toMatchObject({ status: "working" });

      fake.emitMessage(sdkTaskNotification(openedSessionId, "task-1"));
      await vi.advanceTimersByTimeAsync(0);

      // Held through the resume grace window — the SDK usually wakes the
      // model right after the notification.
      expect(updates.at(-1)).toMatchObject({ status: "working" });
      expect(runtimeEvents).not.toContainEqual(
        expect.objectContaining({
          type: "item.updated",
          itemId: goalItemId,
          payload: expect.objectContaining({ status: "complete" }),
        }),
      );

      await vi.advanceTimersByTimeAsync(4_999);
      expect(updates.at(-1)).toMatchObject({ status: "working" });

      await vi.advanceTimersByTimeAsync(1);
      expect(updates.at(-1)).toMatchObject({ status: "idle", attention: "none" });
      expect(runtimeEvents).toContainEqual(
        expect.objectContaining({
          type: "item.updated",
          itemId: goalItemId,
          payload: expect.objectContaining({ status: "complete" }),
        }),
      );

      await session.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the thread working when the model resumes within the drain grace window", async () => {
    vi.useFakeTimers();
    try {
      const fake = createFakeQuery();
      mockSdk.query.mockReturnValue(fake.runtime);
      const updates: StructuredSessionUpdate[] = [];
      const runtimeEvents: RuntimeEvent[] = [];
      const session = await ClaudeSdkSession.create({
        threadId: "thread-claude-bg-drain-resume",
        projectLocation,
        config,
        presentationMode: "gui",
      });
      session.setListener({
        onRuntimeEvent: (event) => runtimeEvents.push(event),
        onUpdate: (update) => updates.push(update),
        onError: () => {},
        onClose: () => {},
      });

      const openedSessionId = await session.openThread(config);
      await session.startTurn("/goal launch a background subagent", config);
      await vi.advanceTimersByTimeAsync(0);
      const goalItemId = runtimeEvents.find(
        (event): event is Extract<RuntimeEvent, { type: "item.started" }> =>
          event.type === "item.started" && event.itemType === "goal",
      )?.itemId;
      expect(goalItemId).toBeDefined();
      fake.emitMessage(sdkTaskStarted(openedSessionId, "task-1", "toolu_bg1"));
      fake.emitMessage(sdkSuccessResult(openedSessionId));
      await vi.advanceTimersByTimeAsync(0);

      // The last task drains, and the SDK wakes the model to consume the
      // results: session-state running, then assistant activity.
      fake.emitMessage(sdkTaskNotification(openedSessionId, "task-1"));
      // Real Claude wakeups can arrive just after two seconds. Crossing the
      // old grace must not settle idle and reset the renderer's timer.
      await vi.advanceTimersByTimeAsync(2_100);
      fake.emitMessage(
        sdkSystemMessage("session_state_changed", openedSessionId, { state: "running" }),
      );
      await vi.advanceTimersByTimeAsync(500);
      fake.emitMessage({
        type: "stream_event",
        session_id: openedSessionId,
        event: { type: "message_start", message: { id: "msg-resumed" } },
      } as unknown as SDKMessage);
      await vi.advanceTimersByTimeAsync(10_000);

      // The stale held completion never settles the thread: no idle emitted,
      // so the renderer's working timer and done-notification stay untouched.
      expect(updates.some((update) => update.status === "idle")).toBe(false);
      expect(updates.at(-1)).toMatchObject({ status: "working" });
      expect(runtimeEvents).not.toContainEqual(
        expect.objectContaining({
          type: "item.updated",
          itemId: goalItemId,
          payload: expect.objectContaining({ status: "complete" }),
        }),
      );

      await session.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("preserves an error result through the deferral", async () => {
    vi.useFakeTimers();
    try {
      const fake = createFakeQuery();
      mockSdk.query.mockReturnValue(fake.runtime);
      const updates: StructuredSessionUpdate[] = [];
      const session = await ClaudeSdkSession.create({
        threadId: "thread-claude-bg-error",
        projectLocation,
        config,
        presentationMode: "gui",
      });
      session.setListener({
        onRuntimeEvent: () => {},
        onUpdate: (update) => updates.push(update),
        onError: () => {},
        onClose: () => {},
      });

      const openedSessionId = await session.openThread(config);
      await session.startTurn("launch a background subagent", config);
      await vi.advanceTimersByTimeAsync(0);
      fake.emitMessage(sdkTaskStarted(openedSessionId, "task-1", "toolu_bg1"));
      fake.emitMessage(sdkErrorResult(openedSessionId));
      await vi.advanceTimersByTimeAsync(0);
      expect(updates.at(-1)).toMatchObject({ status: "working" });

      fake.emitMessage(sdkTaskNotification(openedSessionId, "task-1"));
      await vi.advanceTimersByTimeAsync(5_000);

      expect(updates.at(-1)).toMatchObject({ status: "error", attention: "error" });

      await session.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("only emits idle after the last of multiple concurrent background tasks closes", async () => {
    const fake = createFakeQuery();
    mockSdk.query.mockReturnValue(fake.runtime);
    const updates: StructuredSessionUpdate[] = [];
    const session = await ClaudeSdkSession.create({
      threadId: "thread-claude-bg-multi",
      projectLocation,
      config,
      presentationMode: "gui",
    });
    session.setListener({
      onRuntimeEvent: () => {},
      onUpdate: (update) => updates.push(update),
      onError: () => {},
      onClose: () => {},
    });

    const openedSessionId = await session.openThread(config);
    await session.startTurn("launch two background subagents", config);
    await flushAsyncWork();
    fake.emitMessage(sdkTaskStarted(openedSessionId, "task-1", "toolu_bg1"));
    fake.emitMessage(sdkTaskStarted(openedSessionId, "task-2", "toolu_bg2"));
    fake.emitMessage(sdkSuccessResult(openedSessionId));
    await flushAsyncWork();
    expect(updates.at(-1)).toMatchObject({ status: "working" });

    fake.emitMessage(sdkTaskNotification(openedSessionId, "task-1"));
    await flushAsyncWork();
    expect(updates.at(-1)).toMatchObject({ status: "working" });
    expect(updates.some((update) => update.status === "idle")).toBe(false);

    fake.emitMessage(sdkTaskNotification(openedSessionId, "task-2"));
    await flushAsyncWork();
    // The drain grace holds the settle; dispose flushes it unconditionally.
    await session.dispose();
    expect(updates.at(-1)).toMatchObject({ status: "idle", attention: "none" });
  });

  it("suppresses a session-state idle while a completion is deferred behind a live task", async () => {
    const fake = createFakeQuery();
    mockSdk.query.mockReturnValue(fake.runtime);
    const updates: StructuredSessionUpdate[] = [];
    const session = await ClaudeSdkSession.create({
      threadId: "thread-claude-bg-session-state",
      projectLocation,
      config,
      presentationMode: "gui",
    });
    session.setListener({
      onRuntimeEvent: () => {},
      onUpdate: (update) => updates.push(update),
      onError: () => {},
      onClose: () => {},
    });

    const openedSessionId = await session.openThread(config);
    await session.startTurn("launch a background subagent", config);
    await flushAsyncWork();
    fake.emitMessage(sdkTaskStarted(openedSessionId, "task-1", "toolu_bg1"));
    fake.emitMessage(sdkSuccessResult(openedSessionId));
    await flushAsyncWork();
    expect(updates.at(-1)).toMatchObject({ status: "working" });
    const updatesBeforeSessionState = updates.length;

    // The SDK reports the session idle while the background task is still live
    // — this must not settle the thread past the deferred completion.
    fake.emitMessage(sdkSystemMessage("session_state_changed", openedSessionId, { state: "idle" }));
    await flushAsyncWork();
    expect(updates.slice(updatesBeforeSessionState).some((u) => u.status === "idle")).toBe(false);

    fake.emitMessage(sdkTaskNotification(openedSessionId, "task-1"));
    await flushAsyncWork();
    // The drain grace holds the settle; dispose flushes it unconditionally.
    await session.dispose();
    expect(updates.at(-1)).toMatchObject({ status: "idle", attention: "none" });
  });

  it("keeps a deferred error outcome intact across a suppressed session-state idle", async () => {
    const fake = createFakeQuery();
    mockSdk.query.mockReturnValue(fake.runtime);
    const updates: StructuredSessionUpdate[] = [];
    const session = await ClaudeSdkSession.create({
      threadId: "thread-claude-bg-session-state-error",
      projectLocation,
      config,
      presentationMode: "gui",
    });
    session.setListener({
      onRuntimeEvent: () => {},
      onUpdate: (update) => updates.push(update),
      onError: () => {},
      onClose: () => {},
    });

    const openedSessionId = await session.openThread(config);
    await session.startTurn("launch a background subagent", config);
    await flushAsyncWork();
    fake.emitMessage(sdkTaskStarted(openedSessionId, "task-1", "toolu_bg1"));
    fake.emitMessage(sdkErrorResult(openedSessionId));
    await flushAsyncWork();
    expect(updates.at(-1)).toMatchObject({ status: "working" });

    fake.emitMessage(sdkSystemMessage("session_state_changed", openedSessionId, { state: "idle" }));
    await flushAsyncWork();
    expect(updates.at(-1)).toMatchObject({ status: "working" });

    fake.emitMessage(sdkTaskNotification(openedSessionId, "task-1"));
    await flushAsyncWork();
    // The drain grace holds the settle; dispose flushes it unconditionally.
    await session.dispose();
    expect(updates.at(-1)).toMatchObject({ status: "error", attention: "error" });
    expect(updates.some((update) => update.status === "idle")).toBe(false);
  });

  it("flushes a deferred idle when the stream throws with a background task still live", async () => {
    const fake = createFakeQuery();
    mockSdk.query.mockReturnValue(fake.runtime);
    const updates: StructuredSessionUpdate[] = [];
    const session = await ClaudeSdkSession.create({
      threadId: "thread-claude-bg-streamthrow",
      projectLocation,
      config,
      presentationMode: "gui",
    });
    session.setListener({
      onRuntimeEvent: () => {},
      onUpdate: (update) => updates.push(update),
      onError: () => {},
      onClose: () => {},
    });

    const openedSessionId = await session.openThread(config);
    await session.startTurn("launch a background subagent", config);
    await flushAsyncWork();
    fake.emitMessage(sdkTaskStarted(openedSessionId, "task-1", "toolu_bg1"));
    fake.emitMessage(sdkSuccessResult(openedSessionId));
    await flushAsyncWork();
    expect(updates.at(-1)).toMatchObject({ status: "working" });

    // Break the stream: the pending iteration rejects, driving the catch path.
    fake.emitStreamError(new Error("stream broke"));
    await flushAsyncWork();

    expect(updates.at(-1)).toMatchObject({ status: "idle", attention: "none" });

    await session.dispose();
  });

  it("flushes a deferred idle on dispose with a background task still live", async () => {
    const fake = createFakeQuery();
    mockSdk.query.mockReturnValue(fake.runtime);
    const updates: StructuredSessionUpdate[] = [];
    const session = await ClaudeSdkSession.create({
      threadId: "thread-claude-bg-dispose",
      projectLocation,
      config,
      presentationMode: "gui",
    });
    session.setListener({
      onRuntimeEvent: () => {},
      onUpdate: (update) => updates.push(update),
      onError: () => {},
      onClose: () => {},
    });

    const openedSessionId = await session.openThread(config);
    await session.startTurn("launch a background subagent", config);
    await flushAsyncWork();
    fake.emitMessage(sdkTaskStarted(openedSessionId, "task-1", "toolu_bg1"));
    fake.emitMessage(sdkSuccessResult(openedSessionId));
    await flushAsyncWork();
    expect(updates.at(-1)).toMatchObject({ status: "working" });

    await session.dispose();

    expect(updates.at(-1)).toMatchObject({ status: "idle", attention: "none" });
  });

  it("flushes a deferred idle when the stream ends with a background task still live", async () => {
    const fake = createFakeQuery();
    mockSdk.query.mockReturnValue(fake.runtime);
    const updates: StructuredSessionUpdate[] = [];
    const session = await ClaudeSdkSession.create({
      threadId: "thread-claude-bg-streamexit",
      projectLocation,
      config,
      presentationMode: "gui",
    });
    session.setListener({
      onRuntimeEvent: () => {},
      onUpdate: (update) => updates.push(update),
      onError: () => {},
      onClose: () => {},
    });

    const openedSessionId = await session.openThread(config);
    await session.startTurn("launch a background subagent", config);
    await flushAsyncWork();
    fake.emitMessage(sdkTaskStarted(openedSessionId, "task-1", "toolu_bg1"));
    fake.emitMessage(sdkSuccessResult(openedSessionId));
    await flushAsyncWork();
    expect(updates.at(-1)).toMatchObject({ status: "working" });

    // The SDK stream ends (session stop) before any task_notification arrives.
    (fake.runtime as unknown as { close: () => void }).close();
    await flushAsyncWork();

    expect(updates.at(-1)).toMatchObject({ status: "idle", attention: "none" });

    await session.dispose();
  });

  it("lets a new user turn own the status instead of the deferred completion", async () => {
    const fake = createFakeQuery();
    mockSdk.query.mockReturnValue(fake.runtime);
    const updates: StructuredSessionUpdate[] = [];
    const session = await ClaudeSdkSession.create({
      threadId: "thread-claude-bg-newturn",
      projectLocation,
      config,
      presentationMode: "gui",
    });
    session.setListener({
      onRuntimeEvent: () => {},
      onUpdate: (update) => updates.push(update),
      onError: () => {},
      onClose: () => {},
    });

    const openedSessionId = await session.openThread(config);
    await session.startTurn("first", config);
    await flushAsyncWork();
    fake.emitMessage(sdkTaskStarted(openedSessionId, "task-1", "toolu_bg1"));
    fake.emitMessage(sdkSuccessResult(openedSessionId));
    await flushAsyncWork();
    expect(updates.at(-1)).toMatchObject({ status: "working" });

    // A new user turn starts while the completion was deferred — it owns status.
    await session.startTurn("second", config);
    await flushAsyncWork();
    const updatesAfterNewTurn = updates.length;

    // The stale background task now closes: the cleared deferral must not fire.
    fake.emitMessage(sdkTaskNotification(openedSessionId, "task-1"));
    await flushAsyncWork();

    expect(updates.slice(updatesAfterNewTurn).some((update) => update.status === "idle")).toBe(
      false,
    );
    expect(updates.at(-1)).toMatchObject({ status: "working" });

    await session.dispose();
  });
});
