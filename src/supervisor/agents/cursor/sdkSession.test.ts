import { describe, expect, it, vi } from "vitest";
import type {
  ProjectLocation,
  ResolvedMcpServer,
  RuntimeEvent,
  ThreadConfig,
} from "@/shared/contracts";
import type {
  CreateStructuredSessionInput,
  StructuredSessionListener,
  StructuredSessionUpdate,
} from "../base";
import { cursorSdkAgentId, CursorSdkSession } from "./sdkSession";
import { CursorSdkWorkerRpcError } from "./sdkWorkerClient";
import type {
  CursorSdkWorkerAgentMessage,
  CursorSdkWorkerEvent,
  CursorSdkWorkerInitializeInput,
  CursorSdkWorkerInitializeResult,
  CursorSdkWorkerProbeResult,
  CursorSdkWorkerStartInput,
  CursorSdkWorkerStartResult,
} from "./sdkWorkerProtocol";

const projectLocation: ProjectLocation = { kind: "posix", path: "/repo" };
const baseConfig: ThreadConfig = {
  model: "composer[test=one]",
  effort: "high",
  mode: "agent",
  approvalPolicy: "default",
  sandboxMode: "workspace-write",
};
const initialMcp: ResolvedMcpServer[] = [
  {
    id: "docs-id",
    name: "docs",
    timeoutMs: 10_000,
    transport: {
      type: "stdio",
      command: "node",
      args: ["docs.js"],
      env: { TOKEN: "opaque" },
    },
  },
];

function input(
  overrides: Partial<CreateStructuredSessionInput> = {},
): CreateStructuredSessionInput {
  return {
    threadId: "thread-123456789",
    projectLocation,
    config: baseConfig,
    agentSettings: { structuredRuntime: "sdk" },
    env: { PROJECT_VALUE: "yes" },
    mcpServers: initialMcp,
    presentationMode: "gui",
    ...overrides,
  };
}

class FakeWorker {
  private listeners = new Set<(event: CursorSdkWorkerEvent) => void>();
  private transportErrorListeners = new Set<(error: Error) => void>();

  readonly initialize = vi.fn<
    (input: CursorSdkWorkerInitializeInput) => Promise<CursorSdkWorkerInitializeResult>
  >(async (_input) => ({
    agentId: "agent-1",
    model: { id: "composer" },
  }));
  readonly start = vi.fn<(input: CursorSdkWorkerStartInput) => Promise<CursorSdkWorkerStartResult>>(
    async (_input) => ({ runId: "run-1" }),
  );
  readonly cancel = vi.fn<(runId?: string) => Promise<{ cancelled: boolean }>>(async (_runId) => ({
    cancelled: true,
  }));
  readonly reload = vi.fn<() => Promise<void>>(async () => {});
  readonly listMessages = vi.fn<
    (input?: { limit?: number; offset?: number }) => Promise<CursorSdkWorkerAgentMessage[]>
  >(async (_input) => [
    {
      type: "user",
      uuid: "user-1",
      agent_id: "agent-1",
      message: { role: "user", content: [{ type: "text", text: "hello" }] },
    },
    {
      type: "assistant",
      uuid: "assistant-1",
      agent_id: "agent-1",
      message: { role: "assistant", content: [{ type: "text", text: "hi" }] },
    },
  ]);
  readonly listModels = vi.fn<(apiKey?: string) => Promise<CursorSdkWorkerProbeResult>>(
    async () => ({
      models: [
        {
          id: "composer",
          displayName: "Composer",
          parameters: [
            {
              id: "effort",
              values: [
                { value: "medium", displayName: "Medium" },
                { value: "high", displayName: "High" },
              ],
            },
          ],
        },
      ],
      sdkVersion: "1.0.24",
      source: "configured" as const,
    }),
  );
  readonly dispose = vi.fn<() => Promise<void>>(async () => {});

  onEvent(listener: (event: CursorSdkWorkerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onTransportError(listener: (error: Error) => void): () => void {
    this.transportErrorListeners.add(listener);
    return () => this.transportErrorListeners.delete(listener);
  }

  emit(event: CursorSdkWorkerEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  crash(error: Error): void {
    for (const listener of this.transportErrorListeners) listener(error);
  }

  snapshotListeners(): {
    emit(event: CursorSdkWorkerEvent): void;
    crash(error: Error): void;
  } {
    const eventListeners = [...this.listeners];
    const transportErrorListeners = [...this.transportErrorListeners];
    return {
      emit: (event) => {
        for (const listener of eventListeners) listener(event);
      },
      crash: (error) => {
        for (const listener of transportErrorListeners) listener(error);
      },
    };
  }
}

function recordingListener() {
  const updates: StructuredSessionUpdate[] = [];
  const events: RuntimeEvent[] = [];
  const errors: string[] = [];
  let closes = 0;
  const listener: StructuredSessionListener = {
    onClose: () => {
      closes += 1;
    },
    onError: (message) => errors.push(message),
    onUpdate: (update) => updates.push(update),
    onRuntimeEvent: (event) => events.push(event),
  };
  return {
    listener,
    updates,
    events,
    errors,
    get closes() {
      return closes;
    },
  };
}

async function createSession(
  worker = new FakeWorker(),
  inputOverrides: Partial<CreateStructuredSessionInput> = {},
) {
  const spawnWorker = vi.fn<(input: unknown) => Promise<FakeWorker>>(async () => worker);
  let id = 0;
  const session = await CursorSdkSession.create(input(inputOverrides), {
    spawnWorker,
    newId: () => `id-${++id}`,
  });
  return { session, worker, spawnWorker };
}

async function createSessionWithWorkers(
  workers: readonly FakeWorker[],
  inputOverrides: Partial<CreateStructuredSessionInput> = {},
) {
  let workerIndex = 0;
  const spawnWorker = vi.fn<(input: unknown) => Promise<FakeWorker>>(async () => {
    const worker = workers[workerIndex++];
    if (!worker) throw new Error("No fake Cursor SDK worker remains.");
    return worker;
  });
  let id = 0;
  const session = await CursorSdkSession.create(input(inputOverrides), {
    spawnWorker,
    newId: () => `id-${++id}`,
  });
  return { session, spawnWorker };
}

function resultEvent(
  status: "finished" | "error" | "cancelled" = "finished",
  runId = "run-1",
): CursorSdkWorkerEvent {
  return {
    type: "result",
    requestId: "request-1",
    runId,
    result: {
      id: runId,
      status,
      ...(status === "error" ? { error: { message: "backend failed", code: "backend" } } : {}),
    },
  };
}

function deferred<Value>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("CursorSdkSession", () => {
  it("spawns the isolated worker and creates a fresh durable local agent", async () => {
    const { session, worker, spawnWorker } = await createSession();
    const recorded = recordingListener();
    session.setListener(recorded.listener);

    await session.activate();
    const id = await session.openThread(baseConfig);

    expect(spawnWorker).toHaveBeenCalledWith({
      projectLocation,
      env: { PROJECT_VALUE: "yes" },
    });
    expect(worker.listModels).toHaveBeenCalledWith();
    expect(worker.initialize).toHaveBeenCalledWith({
      createOptions: {
        model: {
          id: "composer",
          params: [
            { id: "test", value: "one" },
            { id: "effort", value: "high" },
          ],
        },
        name: "poracode/thread-1",
        local: {
          cwd: "/repo",
          settingSources: ["all"],
          autoReview: true,
          sandboxOptions: { enabled: true },
        },
        mcpServers: {
          docs: {
            type: "stdio",
            command: "node",
            args: ["docs.js"],
            env: { TOKEN: "opaque" },
          },
        },
        mode: "agent",
        agentId: cursorSdkAgentId("thread-123456789"),
      },
    });
    expect(id).toBe("sdk:agent-1");
    expect(session.launchOptions.resumeThreadId).toBe("sdk:agent-1");
    expect(recorded.updates.at(-1)).toMatchObject({
      status: "idle",
      attention: "none",
      sessionRef: { providerSessionId: "sdk:agent-1" },
    });
  });

  it("derives a stable Cursor-shaped local identity from the Poracode thread", () => {
    const first = cursorSdkAgentId("thread-123456789");
    expect(first).toMatch(
      /^agent-[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(cursorSdkAgentId("thread-123456789")).toBe(first);
    expect(cursorSdkAgentId("another-thread")).not.toBe(first);
  });

  it("expires the crash-stale initial run after deterministic create recovery", async () => {
    const worker = new FakeWorker();
    worker.initialize.mockResolvedValue({
      agentId: "agent-recovered",
      recoveredExisting: true,
    });
    const { session } = await createSession(worker);
    await session.activate();
    await session.openThread(baseConfig);

    const turn = session.startTurn("recover create", baseConfig);
    await vi.waitFor(() => expect(worker.start).toHaveBeenCalledOnce());
    expect(worker.start.mock.calls[0]?.[0].options?.local).toEqual({ force: true });
    worker.emit(resultEvent());
    await turn;
  });

  it("passes a scoped SDK key over worker RPC instead of relying on target argv", async () => {
    const { session, worker } = await createSession(new FakeWorker(), {
      env: { PROJECT_VALUE: "yes", CURSOR_API_KEY: "scoped-secret" },
    });
    await session.activate();
    await session.openThread(baseConfig);

    expect(worker.listModels).toHaveBeenCalledWith("scoped-secret");
    expect(worker.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "scoped-secret" }),
    );
  });

  it("passes the supervisor SDK key explicitly when the GUI session has no env override", async () => {
    const previous = process.env.CURSOR_API_KEY;
    process.env.CURSOR_API_KEY = "supervisor-secret";
    try {
      const { session, worker } = await createSession(new FakeWorker(), {
        env: {},
      });
      await session.activate();
      await session.openThread(baseConfig);

      expect(worker.listModels).toHaveBeenCalledWith("supervisor-secret");
      expect(worker.initialize).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: "supervisor-secret" }),
      );
    } finally {
      if (previous === undefined) delete process.env.CURSOR_API_KEY;
      else process.env.CURSOR_API_KEY = previous;
    }
  });

  it("strips the runtime prefix on resume and forwards explicit false safety settings", async () => {
    const config: ThreadConfig = {
      model: "composer",
      mode: "plan",
      approvalPolicy: "never",
      sandboxMode: "danger-full-access",
    };
    const { session, worker } = await createSession();
    await session.activate();

    await session.openThread(config, {
      providerSessionId: "sdk:existing-agent",
      discoveredAt: "2026-01-01T00:00:00.000Z",
    });

    expect(worker.initialize).toHaveBeenCalledWith({
      resumeAgentId: "existing-agent",
      createOptions: expect.objectContaining({
        mode: "plan",
        local: {
          cwd: "/repo",
          settingSources: ["all"],
          autoReview: false,
          sandboxOptions: { enabled: false },
        },
      }),
    });
    expect(worker.initialize.mock.calls[0]?.[0].createOptions.agentId).toBeUndefined();
  });

  it("reopens a local resume when the cloud model catalog is temporarily unavailable", async () => {
    const worker = new FakeWorker();
    worker.listModels.mockRejectedValue(new Error("catalog unavailable"));
    const { session } = await createSession(worker);
    await session.activate();

    await expect(
      session.openThread(baseConfig, {
        providerSessionId: "sdk:existing-agent",
        discoveredAt: "2026-01-01T00:00:00.000Z",
      }),
    ).resolves.toBe("sdk:agent-1");
    expect(worker.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ resumeAgentId: "existing-agent" }),
    );
    const initializeOptions = worker.initialize.mock.calls[0]?.[0].createOptions;
    expect(initializeOptions?.agentId).toBeUndefined();
    expect(initializeOptions?.model).toBeUndefined();
  });

  it.each(["auth_missing", "auth_invalid"])(
    "does not bypass an SDK %s error while resuming",
    async (code) => {
      const worker = new FakeWorker();
      worker.listModels.mockRejectedValue(
        new CursorSdkWorkerRpcError({
          name: "AuthenticationError",
          message: "SDK authentication failed",
          code,
        }),
      );
      const { session } = await createSession(worker);
      await session.activate();

      await expect(
        session.openThread(baseConfig, {
          providerSessionId: "sdk:existing-agent",
          discoveredAt: "2026-01-01T00:00:00.000Z",
        }),
      ).rejects.toMatchObject({ code });
      expect(worker.initialize).not.toHaveBeenCalled();
    },
  );

  it("keeps catalog authentication mandatory for a fresh local agent", async () => {
    const worker = new FakeWorker();
    worker.listModels.mockRejectedValue(new Error("catalog unavailable"));
    const { session } = await createSession(worker);
    await session.activate();

    await expect(session.openThread(baseConfig)).rejects.toThrow("catalog unavailable");
    expect(worker.initialize).not.toHaveBeenCalled();
  });

  it.each([
    { label: "omitted", config: { model: "composer" } satisfies ThreadConfig },
    {
      label: "unknown",
      config: {
        model: "composer",
        approvalPolicy: "future-policy",
        sandboxMode: "future-sandbox",
      } satisfies ThreadConfig,
    },
  ])("keeps safe SDK defaults for $label generic safety settings", async ({ config }) => {
    const { session, worker } = await createSession();
    await session.activate();

    await session.openThread(config);

    expect(worker.initialize).toHaveBeenCalledWith({
      createOptions: expect.objectContaining({
        local: {
          cwd: "/repo",
          settingSources: ["all"],
          autoReview: true,
          sandboxOptions: { enabled: true },
        },
      }),
    });
  });

  it("rebinds both unrestricted safety settings before sending and fences the old worker", async () => {
    const originalWorker = new FakeWorker();
    const replacementWorker = new FakeWorker();
    const { session, spawnWorker } = await createSessionWithWorkers([
      originalWorker,
      replacementWorker,
    ]);
    const recorded = recordingListener();
    session.setListener(recorded.listener);
    await session.activate();
    await session.openThread(baseConfig);
    const staleListeners = originalWorker.snapshotListeners();
    const unrestrictedConfig: ThreadConfig = {
      ...baseConfig,
      approvalPolicy: "never",
      sandboxMode: "danger-full-access",
    };

    const turn = session.startTurn("run unrestricted", unrestrictedConfig);
    await vi.waitFor(() => expect(replacementWorker.start).toHaveBeenCalledOnce());

    expect(spawnWorker).toHaveBeenCalledTimes(2);
    expect(replacementWorker.initialize).toHaveBeenCalledWith({
      resumeAgentId: "agent-1",
      createOptions: {
        model: {
          id: "composer",
          params: [
            { id: "test", value: "one" },
            { id: "effort", value: "high" },
          ],
        },
        name: "poracode/thread-1",
        local: {
          cwd: "/repo",
          settingSources: ["all"],
          autoReview: false,
          sandboxOptions: { enabled: false },
        },
        mcpServers: {
          docs: {
            type: "stdio",
            command: "node",
            args: ["docs.js"],
            env: { TOKEN: "opaque" },
          },
        },
        mode: "agent",
      },
    });
    expect(replacementWorker.initialize.mock.calls[0]?.[0].createOptions).not.toHaveProperty(
      "agentId",
    );
    expect(originalWorker.reload).not.toHaveBeenCalled();
    expect(originalWorker.start).not.toHaveBeenCalled();
    expect(originalWorker.dispose).toHaveBeenCalledOnce();
    expect(replacementWorker.reload).toHaveBeenCalledOnce();
    expect(replacementWorker.start.mock.calls[0]?.[0].options?.local).toEqual({
      force: true,
    });

    staleListeners.emit({
      type: "delta",
      requestId: "stale-request",
      runId: "run-1",
      update: { type: "text-delta", text: "stale output" },
    });
    staleListeners.emit(resultEvent());
    staleListeners.crash(new Error("retired worker crashed"));
    await Promise.resolve();

    expect(
      recorded.events.some(
        (event) => event.type === "content.delta" && event.delta === "stale output",
      ),
    ).toBe(false);
    expect(recorded.updates.at(-1)).toMatchObject({
      status: "working",
      sessionRef: { providerSessionId: "sdk:agent-1" },
    });
    expect(recorded.errors).toEqual([]);
    expect(recorded.closes).toBe(0);

    replacementWorker.emit(resultEvent());
    await turn;
    expect(recorded.updates.at(-1)).toMatchObject({
      status: "idle",
      sessionRef: { providerSessionId: "sdk:agent-1" },
    });
  });

  it("ignores old-worker events while a replacement is still initializing", async () => {
    const originalWorker = new FakeWorker();
    const replacementWorker = new FakeWorker();
    const initialization = deferred<CursorSdkWorkerInitializeResult>();
    replacementWorker.initialize.mockReturnValue(initialization.promise);
    replacementWorker.start.mockResolvedValue({ runId: "run-replacement" });
    const { session } = await createSessionWithWorkers([originalWorker, replacementWorker]);
    const recorded = recordingListener();
    session.setListener(recorded.listener);
    await session.activate();
    await session.openThread(baseConfig);

    const turn = session.startTurn("change safety", {
      ...baseConfig,
      approvalPolicy: "never",
    });
    await vi.waitFor(() => expect(replacementWorker.initialize).toHaveBeenCalledOnce());

    originalWorker.emit({
      type: "delta",
      requestId: "stale-request",
      runId: "run-stale",
      update: { type: "text-delta", text: "pre-commit stale output" },
    });
    originalWorker.emit(resultEvent("finished", "run-stale"));
    await Promise.resolve();

    expect(
      recorded.events.some(
        (event) => event.type === "content.delta" && event.delta === "pre-commit stale output",
      ),
    ).toBe(false);
    expect(recorded.events.some((event) => event.type === "turn.completed")).toBe(false);
    expect(recorded.updates.at(-1)).toMatchObject({ status: "working" });
    expect(originalWorker.start).not.toHaveBeenCalled();
    expect(replacementWorker.start).not.toHaveBeenCalled();

    initialization.resolve({ agentId: "agent-1" });
    await vi.waitFor(() => expect(replacementWorker.start).toHaveBeenCalledOnce());
    replacementWorker.emit(resultEvent("finished", "run-replacement"));
    await turn;

    expect(recorded.events.at(-1)).toMatchObject({
      type: "turn.completed",
      state: "completed",
    });
    expect(recorded.updates.at(-1)).toMatchObject({ status: "idle" });
  });

  it("awaits in-flight replacement cleanup when disposed during initialize", async () => {
    const originalWorker = new FakeWorker();
    const replacementWorker = new FakeWorker();
    const initialization = deferred<CursorSdkWorkerInitializeResult>();
    const replacementCleanup = deferred<void>();
    replacementWorker.initialize.mockReturnValue(initialization.promise);
    replacementWorker.dispose.mockReturnValue(replacementCleanup.promise);
    const { session } = await createSessionWithWorkers([originalWorker, replacementWorker]);
    const recorded = recordingListener();
    session.setListener(recorded.listener);
    await session.activate();
    await session.openThread(baseConfig);

    const turn = session.startTurn("change safety", {
      ...baseConfig,
      sandboxMode: "danger-full-access",
    });
    await vi.waitFor(() => expect(replacementWorker.initialize).toHaveBeenCalledOnce());

    let disposeResolved = false;
    const disposal = session.dispose().then(() => {
      disposeResolved = true;
    });
    await vi.waitFor(() => expect(replacementWorker.dispose).toHaveBeenCalledOnce());

    expect(originalWorker.dispose).toHaveBeenCalledOnce();
    expect(disposeResolved).toBe(false);
    expect(recorded.closes).toBe(0);
    expect(replacementWorker.reload).not.toHaveBeenCalled();
    expect(replacementWorker.start).not.toHaveBeenCalled();

    replacementCleanup.resolve();
    await disposal;
    await turn;

    expect(disposeResolved).toBe(true);
    expect(recorded.closes).toBe(1);
    expect(recorded.events.at(-1)).toMatchObject({
      type: "turn.completed",
      state: "cancelled",
    });
    initialization.resolve({ agentId: "agent-1" });
    await Promise.resolve();
    expect(replacementWorker.dispose).toHaveBeenCalledOnce();
    expect(replacementWorker.start).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "approval review",
      changedConfig: {
        ...baseConfig,
        approvalPolicy: "never",
      } satisfies ThreadConfig,
      changedLocal: {
        autoReview: false,
        sandboxOptions: { enabled: true },
      },
    },
    {
      label: "sandboxing",
      changedConfig: {
        ...baseConfig,
        sandboxMode: "danger-full-access",
      } satisfies ThreadConfig,
      changedLocal: {
        autoReview: true,
        sandboxOptions: { enabled: false },
      },
    },
  ])(
    "rebinds when $label changes and when it switches back",
    async ({ changedConfig, changedLocal }) => {
      const originalWorker = new FakeWorker();
      const changedWorker = new FakeWorker();
      const restoredWorker = new FakeWorker();
      changedWorker.start.mockResolvedValue({ runId: "run-changed" });
      restoredWorker.start.mockResolvedValue({ runId: "run-restored" });
      const { session, spawnWorker } = await createSessionWithWorkers([
        originalWorker,
        changedWorker,
        restoredWorker,
      ]);
      await session.activate();
      await session.openThread(baseConfig);

      const changedTurn = session.startTurn("change safety", changedConfig);
      await vi.waitFor(() => expect(changedWorker.start).toHaveBeenCalledOnce());
      expect(changedWorker.initialize.mock.calls[0]?.[0]).toMatchObject({
        resumeAgentId: "agent-1",
        createOptions: {
          local: {
            cwd: "/repo",
            settingSources: ["all"],
            ...changedLocal,
          },
        },
      });
      changedWorker.emit(resultEvent("finished", "run-changed"));
      await changedTurn;

      const restoredTurn = session.startTurn("restore safety", baseConfig);
      await vi.waitFor(() => expect(restoredWorker.start).toHaveBeenCalledOnce());
      expect(restoredWorker.initialize.mock.calls[0]?.[0]).toMatchObject({
        resumeAgentId: "agent-1",
        createOptions: {
          local: {
            cwd: "/repo",
            settingSources: ["all"],
            autoReview: true,
            sandboxOptions: { enabled: true },
          },
        },
      });
      restoredWorker.emit(resultEvent("finished", "run-restored"));
      await restoredTurn;

      expect(spawnWorker).toHaveBeenCalledTimes(3);
      expect(originalWorker.dispose).toHaveBeenCalledOnce();
      expect(changedWorker.dispose).toHaveBeenCalledOnce();
      expect(restoredWorker.dispose).not.toHaveBeenCalled();
    },
  );

  it("does not rebind for model, mode, or MCP-only changes", async () => {
    const worker = new FakeWorker();
    worker.start
      .mockResolvedValueOnce({ runId: "run-model" })
      .mockResolvedValueOnce({ runId: "run-mode" })
      .mockResolvedValueOnce({ runId: "run-mcp" });
    const { session, spawnWorker } = await createSession(worker);
    await session.activate();
    await session.openThread(baseConfig);

    const modelTurn = session.startTurn("change model options", {
      ...baseConfig,
      model: "composer[test=two]",
      effort: "medium",
    });
    await vi.waitFor(() => expect(worker.start).toHaveBeenCalledTimes(1));
    worker.emit(resultEvent("finished", "run-model"));
    await modelTurn;

    const modeTurn = session.startTurn("change mode", {
      ...baseConfig,
      mode: "plan",
    });
    await vi.waitFor(() => expect(worker.start).toHaveBeenCalledTimes(2));
    worker.emit(resultEvent("finished", "run-mode"));
    await modeTurn;

    await session.updateMcpServers([
      {
        id: "remote-id",
        name: "remote",
        timeoutMs: 20_000,
        transport: {
          type: "http",
          url: "https://example.test/mcp",
          headers: {},
        },
      },
    ]);
    const mcpTurn = session.startTurn("change MCP", baseConfig);
    await vi.waitFor(() => expect(worker.start).toHaveBeenCalledTimes(3));
    worker.emit(resultEvent("finished", "run-mcp"));
    await mcpTurn;

    expect(spawnWorker).toHaveBeenCalledOnce();
    expect(worker.initialize).toHaveBeenCalledOnce();
    expect(worker.start.mock.calls[0]?.[0].options).toMatchObject({
      model: {
        id: "composer",
        params: [
          { id: "test", value: "two" },
          { id: "effort", value: "medium" },
        ],
      },
    });
    expect(worker.start.mock.calls[1]?.[0].options?.mode).toBe("plan");
    expect(worker.start.mock.calls[2]?.[0].options?.mcpServers).toEqual({
      remote: {
        type: "http",
        url: "https://example.test/mcp",
      },
    });
  });

  it.each(["spawn", "initialize", "identity"] as const)(
    "keeps the old worker usable when replacement %s fails without sending under stale safety",
    async (failurePoint) => {
      const originalWorker = new FakeWorker();
      const failedWorker = new FakeWorker();
      if (failurePoint === "initialize") {
        failedWorker.initialize.mockRejectedValue(new Error("replacement initialize failed"));
      } else if (failurePoint === "identity") {
        failedWorker.initialize.mockResolvedValue({ agentId: "agent-unexpected" });
      }
      const spawnWorker = vi.fn<(input: unknown) => Promise<FakeWorker>>();
      spawnWorker.mockResolvedValueOnce(originalWorker);
      if (failurePoint === "spawn") {
        spawnWorker.mockRejectedValueOnce(new Error("replacement spawn failed"));
      } else {
        spawnWorker.mockResolvedValueOnce(failedWorker);
      }
      let id = 0;
      const session = await CursorSdkSession.create(input(), {
        spawnWorker,
        newId: () => `id-${++id}`,
      });
      const recorded = recordingListener();
      session.setListener(recorded.listener);
      await session.activate();
      await session.openThread(baseConfig);

      await expect(
        session.startTurn("change safety", {
          ...baseConfig,
          approvalPolicy: "never",
        }),
      ).resolves.toBeUndefined();

      expect(originalWorker.reload).not.toHaveBeenCalled();
      expect(originalWorker.start).not.toHaveBeenCalled();
      expect(originalWorker.dispose).not.toHaveBeenCalled();
      expect(failedWorker.reload).not.toHaveBeenCalled();
      expect(failedWorker.start).not.toHaveBeenCalled();
      expect(failedWorker.dispose).toHaveBeenCalledTimes(failurePoint === "spawn" ? 0 : 1);
      expect(recorded.events.at(-1)).toMatchObject({
        type: "turn.completed",
        state: "failed",
      });

      const recoveredTurn = session.startTurn("use original safety", baseConfig);
      await vi.waitFor(() => expect(originalWorker.start).toHaveBeenCalledOnce());
      expect(spawnWorker).toHaveBeenCalledTimes(2);
      originalWorker.emit(resultEvent());
      await recoveredTurn;
      expect(recorded.updates.at(-1)).toMatchObject({
        status: "idle",
        sessionRef: { providerSessionId: "sdk:agent-1" },
      });
    },
  );

  it("ignores legacy custom SDK paths and uses automatic WSL package discovery", async () => {
    const worker = new FakeWorker();
    const location: ProjectLocation = {
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/home/me/repo",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\me\\repo",
    };
    const { session, spawnWorker } = await createSession(worker, {
      projectLocation: location,
      agentSettings: { structuredRuntime: "sdk" },
    });

    await session.activate();

    expect(spawnWorker).toHaveBeenCalledWith({
      projectLocation: location,
      env: { PROJECT_VALUE: "yes" },
    });
  });

  it("maps raw and normalized output once and completes with idle state", async () => {
    const { session, worker } = await createSession();
    const recorded = recordingListener();
    session.setListener(recorded.listener);
    await session.activate();
    await session.openThread(baseConfig);

    const turn = session.startTurn("hello", baseConfig, undefined, {
      userMessageItemId: "optimistic-user",
    });
    await vi.waitFor(() => expect(worker.start).toHaveBeenCalledOnce());
    expect(worker.reload).toHaveBeenCalledOnce();
    expect(worker.reload.mock.invocationCallOrder[0]).toBeLessThan(
      worker.start.mock.invocationCallOrder[0]!,
    );
    worker.emit({
      type: "delta",
      requestId: "request-1",
      runId: "run-1",
      update: { type: "text-delta", text: "answer" },
    });
    worker.emit({
      type: "message",
      requestId: "request-1",
      runId: "run-1",
      message: {
        type: "assistant",
        agent_id: "agent-1",
        run_id: "run-1",
        message: { role: "assistant", content: [{ type: "text", text: "answer" }] },
      },
    });
    worker.emit({
      type: "message",
      requestId: "request-1",
      runId: "run-1",
      message: {
        type: "status",
        agent_id: "agent-1",
        run_id: "run-1",
        status: "FINISHED",
      },
    });
    worker.emit(resultEvent());
    await turn;

    expect(worker.start).toHaveBeenCalledWith({
      message: "hello",
      options: {
        model: {
          id: "composer",
          params: [
            { id: "test", value: "one" },
            { id: "effort", value: "high" },
          ],
        },
        mode: "agent",
        mcpServers: expect.objectContaining({ docs: expect.any(Object) }),
        idempotencyKey: "turn-id-1",
      },
    });
    expect(
      recorded.events
        .filter((event) => event.type === "content.delta")
        .map((event) => event.delta)
        .join(""),
    ).toBe("answer");
    expect(
      recorded.events.some(
        (event) => event.type === "item.started" && event.itemId === "optimistic-user",
      ),
    ).toBe(false);
    expect(recorded.events.at(-1)).toMatchObject({
      type: "turn.completed",
      state: "completed",
    });
    expect(recorded.updates.at(-1)).toMatchObject({ status: "idle", attention: "none" });
  });

  it("fails canonically when ambient Cursor configuration cannot reload", async () => {
    const worker = new FakeWorker();
    worker.reload.mockRejectedValue(new Error("reload failed"));
    const { session } = await createSession(worker);
    const recorded = recordingListener();
    session.setListener(recorded.listener);
    await session.activate();
    await session.openThread(baseConfig);

    await expect(session.startTurn("use latest config", baseConfig)).resolves.toBeUndefined();

    expect(worker.start).not.toHaveBeenCalled();
    expect(recorded.events).toContainEqual({
      type: "error",
      threadId: "thread-123456789",
      message: "reload failed",
    });
    expect(recorded.events.at(-1)).toMatchObject({
      type: "turn.completed",
      state: "failed",
    });
  });

  it("forces only the first send after resume to recover a persisted stale run", async () => {
    const { session, worker } = await createSession();
    await session.activate();
    await session.openThread(baseConfig, {
      providerSessionId: "sdk:existing-agent",
      discoveredAt: "2026-01-01T00:00:00.000Z",
    });

    const first = session.startTurn("recover", baseConfig);
    await vi.waitFor(() => expect(worker.start).toHaveBeenCalledOnce());
    expect(worker.start.mock.calls[0]?.[0].options?.local).toEqual({ force: true });
    worker.emit(resultEvent());
    await first;

    const second = session.startTurn("continue", baseConfig);
    await vi.waitFor(() => expect(worker.start).toHaveBeenCalledTimes(2));
    expect(worker.start.mock.calls[1]?.[0].options?.local).toBeUndefined();
    worker.emit(resultEvent());
    await second;
  });

  it("surfaces worker run errors canonically and leaves the thread in error", async () => {
    const { session, worker } = await createSession();
    const recorded = recordingListener();
    session.setListener(recorded.listener);
    await session.activate();
    await session.openThread(baseConfig);

    const turn = session.startTurn("fail", baseConfig);
    await vi.waitFor(() => expect(worker.start).toHaveBeenCalledOnce());
    worker.emit({
      type: "run-error",
      requestId: "request-1",
      runId: "run-1",
      error: { name: "NetworkError", message: "network unavailable", code: "network" },
    });
    await turn;

    expect(recorded.events).toContainEqual({
      type: "error",
      threadId: "thread-123456789",
      message: "network unavailable",
    });
    expect(recorded.events.at(-1)).toMatchObject({
      type: "turn.completed",
      state: "failed",
    });
    expect(recorded.updates.at(-1)).toMatchObject({
      status: "error",
      attention: "error",
      errorMessage: "network unavailable",
    });
  });

  it("turns a rejected start command into a failed canonical turn", async () => {
    const worker = new FakeWorker();
    worker.start.mockRejectedValue(new Error("send rejected"));
    const { session } = await createSession(worker);
    const recorded = recordingListener();
    session.setListener(recorded.listener);
    await session.activate();
    await session.openThread(baseConfig);

    await expect(session.startTurn("fail immediately", baseConfig)).resolves.toBeUndefined();

    expect(recorded.events).toContainEqual({
      type: "error",
      threadId: "thread-123456789",
      message: "send rejected",
    });
    expect(recorded.events.at(-1)).toMatchObject({
      type: "turn.completed",
      state: "failed",
    });
    expect(recorded.updates.at(-1)).toMatchObject({
      status: "error",
      errorMessage: "send rejected",
    });
  });

  it("cancels exactly once when interrupted before start returns its run id", async () => {
    const worker = new FakeWorker();
    const start = deferred<CursorSdkWorkerStartResult>();
    worker.start.mockImplementation(async () => start.promise);
    const { session } = await createSession(worker);
    await session.activate();
    await session.openThread(baseConfig);

    const turn = session.startTurn("long task", baseConfig);
    await vi.waitFor(() => expect(worker.start).toHaveBeenCalledOnce());
    const interrupt = session.interruptTurn();
    start.resolve({ runId: "run-1" });
    await interrupt;
    expect(worker.cancel).toHaveBeenCalledTimes(1);
    expect(worker.cancel).toHaveBeenCalledWith("run-1");
    worker.emit(resultEvent("cancelled"));
    await turn;
  });

  it("cancels exactly once when force-completion precedes a late start acknowledgement", async () => {
    const worker = new FakeWorker();
    const start = deferred<CursorSdkWorkerStartResult>();
    worker.start.mockImplementation(async () => start.promise);
    const { session } = await createSession(worker);
    await session.activate();
    await session.openThread(baseConfig);

    const turn = session.startTurn("long task", baseConfig);
    await vi.waitFor(() => expect(worker.start).toHaveBeenCalledOnce());
    const interrupt = session.interruptTurn();
    session.forceCompleteTurn();
    start.resolve({ runId: "run-1" });

    await Promise.all([turn, interrupt]);
    expect(worker.cancel).toHaveBeenCalledTimes(1);
    expect(worker.cancel).toHaveBeenCalledWith("run-1");
  });

  it("cancels exactly once when disposal precedes a late start acknowledgement", async () => {
    const worker = new FakeWorker();
    const start = deferred<CursorSdkWorkerStartResult>();
    worker.start.mockImplementation(async () => start.promise);
    const { session } = await createSession(worker);
    await session.activate();
    await session.openThread(baseConfig);

    const turn = session.startTurn("long task", baseConfig);
    await vi.waitFor(() => expect(worker.start).toHaveBeenCalledOnce());
    const interrupt = session.interruptTurn();
    await session.dispose();
    start.resolve({ runId: "run-1" });

    await Promise.all([turn, interrupt]);
    expect(worker.cancel).toHaveBeenCalledTimes(1);
    expect(worker.cancel).toHaveBeenCalledWith("run-1");
  });

  it("does not repeat an early-event cancellation after a late start acknowledgement", async () => {
    const worker = new FakeWorker();
    const start = deferred<CursorSdkWorkerStartResult>();
    worker.start.mockImplementation(async () => start.promise);
    const { session } = await createSession(worker);
    await session.activate();
    await session.openThread(baseConfig);

    const turn = session.startTurn("long task", baseConfig);
    await vi.waitFor(() => expect(worker.start).toHaveBeenCalledOnce());
    const interrupt = session.interruptTurn();
    worker.emit({
      type: "delta",
      requestId: "request-1",
      runId: "run-1",
      update: { type: "text-delta", text: "early" },
    });
    session.forceCompleteTurn();
    start.resolve({ runId: "run-1" });

    await Promise.all([turn, interrupt]);
    expect(worker.cancel).toHaveBeenCalledTimes(1);
    expect(worker.cancel).toHaveBeenCalledWith("run-1");
  });

  it("fails and releases an active turn when the worker exits after start acknowledgement", async () => {
    const { session, worker } = await createSession();
    const recorded = recordingListener();
    session.setListener(recorded.listener);
    await session.activate();
    await session.openThread(baseConfig);
    const turn = session.startTurn("long task", baseConfig);
    await vi.waitFor(() => expect(worker.start).toHaveBeenCalledOnce());

    worker.crash(new Error("Cursor SDK worker exited unexpectedly (code 9)."));
    await turn;

    expect(recorded.events).toContainEqual({
      type: "error",
      threadId: "thread-123456789",
      message: "Cursor SDK worker exited unexpectedly (code 9).",
    });
    expect(recorded.events.at(-1)).toMatchObject({
      type: "turn.completed",
      state: "failed",
    });
    expect(recorded.updates.at(-1)).toMatchObject({
      status: "error",
      attention: "error",
      errorMessage: "Cursor SDK worker exited unexpectedly (code 9).",
    });
    expect(recorded.errors).toEqual(["Cursor SDK worker exited unexpectedly (code 9)."]);
    expect(recorded.closes).toBe(1);

    await session.dispose();
    expect(recorded.closes).toBe(1);
  });

  it("buffers early runtime events and replays the current state to a late listener", async () => {
    const { session, worker } = await createSession();
    await session.activate();
    await session.openThread(baseConfig);
    const turn = session.startTurn("hello", baseConfig);
    await vi.waitFor(() => expect(worker.start).toHaveBeenCalledOnce());
    worker.emit({
      type: "delta",
      requestId: "request-1",
      runId: "run-1",
      update: { type: "text-delta", text: "early" },
    });
    worker.emit(resultEvent());
    await turn;

    const recorded = recordingListener();
    session.setListener(recorded.listener);

    expect(recorded.events.some((event) => event.type === "turn.started")).toBe(true);
    expect(recorded.events.some((event) => event.type === "content.delta")).toBe(true);
    expect(recorded.events.at(-1)).toMatchObject({ type: "turn.completed" });
    expect(recorded.updates).toHaveLength(1);
    expect(recorded.updates[0]).toMatchObject({
      status: "idle",
      sessionRef: { providerSessionId: "sdk:agent-1" },
    });
  });

  it("uses an updated MCP set on future sends without mutating the active run", async () => {
    const { session, worker } = await createSession();
    await session.activate();
    await session.openThread(baseConfig);
    const replacement: ResolvedMcpServer[] = [
      {
        id: "remote-id",
        name: "remote",
        timeoutMs: 20_000,
        transport: {
          type: "http",
          url: "https://example.test/mcp",
          headers: { Authorization: "Bearer opaque" },
        },
      },
    ];
    await session.updateMcpServers(replacement);

    const turn = session.startTurn("use remote", { ...baseConfig, mode: "plan" });
    await vi.waitFor(() => expect(worker.start).toHaveBeenCalledOnce());
    expect(worker.start.mock.calls[0]![0].options).toMatchObject({
      mode: "plan",
      mcpServers: {
        remote: {
          type: "http",
          url: "https://example.test/mcp",
          headers: { Authorization: "Bearer opaque" },
        },
      },
    });
    worker.emit(resultEvent());
    await turn;
  });

  it("reads durable messages with prefixed identity and preserves raw info", async () => {
    const { session } = await createSession();
    await session.activate();
    await session.openThread(baseConfig);

    await expect(session.readThread()).resolves.toEqual({
      providerSessionId: "sdk:agent-1",
      messages: [
        {
          messageId: "user-1",
          role: "user",
          parts: [{ type: "text", text: "hello" }],
          info: {
            type: "user",
            uuid: "user-1",
            agent_id: "agent-1",
            message: { role: "user", content: [{ type: "text", text: "hello" }] },
          },
        },
        {
          messageId: "assistant-1",
          role: "assistant",
          parts: [{ type: "text", text: "hi" }],
          info: {
            type: "assistant",
            uuid: "assistant-1",
            agent_id: "agent-1",
            message: { role: "assistant", content: [{ type: "text", text: "hi" }] },
          },
        },
      ],
    });
  });

  it("force-completes an active run, closes its items, and requests cancellation", async () => {
    const { session, worker } = await createSession();
    const recorded = recordingListener();
    session.setListener(recorded.listener);
    await session.activate();
    await session.openThread(baseConfig);
    const turn = session.startTurn("long task", baseConfig);
    await vi.waitFor(() => expect(worker.start).toHaveBeenCalledOnce());
    worker.emit({
      type: "delta",
      requestId: "request-1",
      runId: "run-1",
      update: { type: "text-delta", text: "partial" },
    });

    session.forceCompleteTurn();
    await turn;

    expect(worker.cancel).toHaveBeenCalledWith("run-1");
    expect(recorded.events).toContainEqual(expect.objectContaining({ type: "item.completed" }));
    expect(recorded.events.at(-1)).toMatchObject({
      type: "turn.completed",
      state: "cancelled",
    });
    expect(recorded.updates.at(-1)).toMatchObject({ status: "idle", attention: "none" });
  });

  it("disposes an active run without leaking late events", async () => {
    const { session, worker } = await createSession();
    const recorded = recordingListener();
    session.setListener(recorded.listener);
    await session.activate();
    await session.openThread(baseConfig);
    const turn = session.startTurn("long task", baseConfig);
    await vi.waitFor(() => expect(worker.start).toHaveBeenCalledOnce());
    worker.emit({
      type: "delta",
      requestId: "request-1",
      runId: "run-1",
      update: { type: "text-delta", text: "partial" },
    });

    await session.dispose();
    await turn;
    const eventCount = recorded.events.length;
    worker.emit(resultEvent());

    expect(worker.cancel).toHaveBeenCalledWith("run-1");
    expect(worker.dispose).toHaveBeenCalledOnce();
    expect(recorded.closes).toBe(1);
    expect(recorded.events).toHaveLength(eventCount);
    expect(recorded.events.at(-1)).toMatchObject({
      type: "turn.completed",
      state: "cancelled",
    });
    expect((session as unknown as { steerTurn?: unknown }).steerTurn).toBeUndefined();
  });
});
