import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChildProcess } from "node:child_process";
import type {
  ProjectLocation,
  ResolvedMcpServer,
  RuntimeEvent,
  ThreadConfig,
} from "@/shared/contracts";
import type { StructuredSessionUpdate } from "../base";
import type { AcquiredOpenCodeServer } from "./client";
import type { OpenCodeClient, V2Event } from "./clientTypes";
import { clearOpenCodeSessionDatabases, openCodeSessionDatabaseEnv } from "./database";
import { OpenCodeSession } from "./session";

const mocks = vi.hoisted(() => ({
  readOpenCodeGoalState: vi.fn<() => Promise<unknown>>().mockResolvedValue(undefined),
  resolveOpenCodeGoalStatePath: vi.fn<() => Promise<string | undefined>>(async () => "/goals.json"),
  acquireOpenCodeServer: vi.fn<(input: unknown) => Promise<unknown>>(),
  subscribeOpenCodeServerEvents:
    vi.fn<(input: { client: unknown; subscription: unknown }) => () => void>(),
}));

vi.mock("./goals", async (importActual) => ({
  ...(await importActual<typeof import("./goals")>()),
  resolveOpenCodeGoalStatePath: mocks.resolveOpenCodeGoalStatePath,
  readOpenCodeGoalState: mocks.readOpenCodeGoalState,
}));

vi.mock("./client", async (importActual) => {
  const actual = await importActual<typeof import("./client")>();
  return { ...actual, acquireOpenCodeServer: mocks.acquireOpenCodeServer };
});

vi.mock("./eventHub", () => ({
  subscribeOpenCodeServerEvents: mocks.subscribeOpenCodeServerEvents,
  waitForOpenCodeServerEvents: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

const projectLocation: ProjectLocation = { kind: "posix", path: "/repo" };
const config: ThreadConfig = { model: "opencode-go/deepseek-v4.1-flash" };

type CapturedSubscription = {
  sessionId(): string | undefined;
  onEvent(event: V2Event): void;
  onReconnect(): Promise<void>;
};

let eventSeq = 0;

function event(type: string, data: Record<string, unknown>): V2Event {
  eventSeq += 1;
  return { id: `evt-${eventSeq}`, created: 1, type, data } as unknown as V2Event;
}

function makeClient(): OpenCodeClient {
  return {
    session: {
      update: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      form: {
        list: vi.fn<() => Promise<unknown>>().mockResolvedValue([]),
        reply: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        cancel: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      },
      active: vi.fn<() => Promise<unknown>>().mockResolvedValue({}),
      create: vi.fn<() => Promise<{ id: string }>>().mockResolvedValue({ id: "ses_new" }),
      get: vi.fn<() => Promise<{ id: string }>>().mockResolvedValue({ id: "ses_resume" }),
      prompt: vi.fn<() => Promise<unknown>>().mockResolvedValue({}),
      switchAgent: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      switchModel: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      interrupt: vi.fn<() => Promise<{ interrupted: boolean }>>().mockResolvedValue({
        interrupted: true,
      }),
    },
    message: {
      list: vi.fn<() => Promise<{ data: unknown[]; cursor: {} }>>().mockResolvedValue({
        data: [],
        cursor: {},
      }),
    },
    plugin: {
      list: vi.fn<() => Promise<object>>().mockResolvedValue({
        data: [{ source: { type: "builtin" }, state: { status: "active" } }],
      }),
    },
    agent: { list: vi.fn<() => Promise<{ data: unknown[] }>>().mockResolvedValue({ data: [] }) },
    skill: { list: vi.fn<() => Promise<{ data: unknown[] }>>().mockResolvedValue({ data: [] }) },
    command: { list: vi.fn<() => Promise<{ data: unknown[] }>>().mockResolvedValue({ data: [] }) },
    model: {
      list: vi.fn<() => Promise<{ data: unknown[] }>>().mockResolvedValue({ data: [] }),
    },
    config: { get: vi.fn<() => Promise<unknown[]>>().mockResolvedValue([]) },
    permission: {
      list: vi.fn<() => Promise<unknown>>().mockResolvedValue([]),
      reply: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    },
    mcp: {
      add: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      remove: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    },
  } as unknown as OpenCodeClient;
}

function makeAcquired(
  client: OpenCodeClient,
  options?: {
    child?: ChildProcess;
    database?: AcquiredOpenCodeServer["database"];
    directoryMcpNames?: string[];
  },
): {
  acquired: AcquiredOpenCodeServer;
  onServerExit: (callback: () => void) => () => void;
  setDirectoryMcpNames: (names: string[]) => void;
  emitDirectoryMcpChanged: () => void;
} {
  const exits = new Set<() => void>();
  const mcpListeners = new Set<() => void>();
  let directoryMcpNames = [...(options?.directoryMcpNames ?? [])];
  const onServerExit = (callback: () => void) => {
    exits.add(callback);
    return () => exits.delete(callback);
  };
  const onDirectoryMcpChanged = (callback: () => void) => {
    mcpListeners.add(callback);
    return () => mcpListeners.delete(callback);
  };
  const acquired = {
    client,
    database: options?.database ?? "native",
    baseUrl: "http://127.0.0.1:4600",
    handle: {
      child: options?.child ?? (new EventEmitter() as ChildProcess),
      baseUrl: Promise.resolve("http://127.0.0.1:4600"),
      password: Promise.resolve("pw"),
      formatOutput: () => "",
      dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    },
    onServerExit,
    getDirectoryMcpNames: () => [...directoryMcpNames],
    onDirectoryMcpChanged,
    updateMcpServers: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  } as unknown as AcquiredOpenCodeServer & { dispose: ReturnType<typeof vi.fn> };
  return {
    acquired,
    onServerExit,
    setDirectoryMcpNames: (names) => {
      directoryMcpNames = [...names];
    },
    emitDirectoryMcpChanged: () => {
      for (const listener of [...mcpListeners]) listener();
    },
  };
}

interface Harness {
  session: OpenCodeSession;
  client: OpenCodeClient;
  subscription: CapturedSubscription | undefined;
  updates: StructuredSessionUpdate[];
  events: RuntimeEvent[];
  errors: string[];
}

async function makeSession(options?: {
  client?: OpenCodeClient;
  acquired?: AcquiredOpenCodeServer;
  config?: ThreadConfig;
  presentationMode?: "gui" | "terminal";
  mcpServers?: readonly ResolvedMcpServer[];
  resolveMcpServersForTurn?: NonNullable<
    Parameters<typeof OpenCodeSession.create>[0]["resolveMcpServersForTurn"]
  >;
}): Promise<Harness> {
  const client = options?.client ?? makeClient();
  const threadConfig = options?.config ?? config;
  const acquired = options?.acquired ?? (makeAcquired(client).acquired as AcquiredOpenCodeServer);
  mocks.acquireOpenCodeServer.mockResolvedValue(acquired);

  let subscription: CapturedSubscription | undefined;
  mocks.subscribeOpenCodeServerEvents.mockImplementation((input) => {
    subscription = input.subscription as CapturedSubscription;
    return () => {};
  });

  const session = await OpenCodeSession.create({
    threadId: "thread-abc12345",
    projectLocation,
    config: threadConfig,
    presentationMode: options?.presentationMode ?? "gui",
    ...(options?.mcpServers !== undefined ? { mcpServers: options.mcpServers } : {}),
    ...(options?.resolveMcpServersForTurn
      ? { resolveMcpServersForTurn: options.resolveMcpServersForTurn }
      : {}),
  });

  const updates: StructuredSessionUpdate[] = [];
  const events: RuntimeEvent[] = [];
  const errors: string[] = [];
  session.setListener({
    onClose: () => {},
    onError: (message) => errors.push(message),
    onUpdate: (update) => updates.push(update),
    onRuntimeEvent: (entry) => events.push(entry),
  });
  await session.openThread(threadConfig);

  return { session, client, subscription, updates, events, errors };
}

type OpenCodeServerOverrides = Record<string, unknown>;

function makeClientWith(overrides: OpenCodeServerOverrides): OpenCodeClient {
  const client = makeClient() as unknown as Record<string, any>;
  for (const [path, value] of Object.entries(overrides)) {
    const keys = path.split(".");
    const method = keys.pop();
    if (!method) continue;
    let target = client;
    for (const key of keys) target = target[key];
    target[method] = value;
  }
  return client as OpenCodeClient;
}

function catalogModel(providerID: string, id: string, context: number) {
  return { providerID, id, limit: { context, output: 64_000 } };
}

function remoteMcp(name: string, url: string, disabledTools?: string[]): ResolvedMcpServer {
  return {
    id: name,
    name,
    timeoutMs: 30_000,
    transport: { type: "http" as const, url, headers: {} },
    ...(disabledTools ? { disabledTools } : {}),
  };
}

describe("OpenCodeSession", () => {
  afterEach(clearOpenCodeSessionDatabases);

  it("hydrates plugin goals, routes UI controls through native commands and stops polling on disposal", async () => {
    const goal = {
      id: "goal-1",
      sessionID: "ses_new",
      objective: "Finish task",
      status: "active",
      updatedAt: 100,
    };
    mocks.readOpenCodeGoalState.mockResolvedValue(goal);
    const command = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const client = makeClientWith({
      "command.list": vi
        .fn<() => Promise<unknown>>()
        .mockResolvedValue({ data: [{ name: "goal" }, { name: "pause_goal" }] }),
      "session.command": command,
    });
    const h = await makeSession({ client });
    try {
      await vi.waitFor(() =>
        expect(h.events).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: "item.started",
              itemType: "goal",
              payload: expect.objectContaining({ objective: "Finish task" }),
            }),
          ]),
        ),
      );
      await h.session.controlGoal({ action: "pause" });
      expect(command).toHaveBeenLastCalledWith({
        sessionID: "ses_new",
        name: "pause_goal",
        text: "",
      });
      await h.session.controlGoal({ action: "edit", objective: "Updated task" });
      expect(command).toHaveBeenLastCalledWith({
        sessionID: "ses_new",
        name: "goal",
        text: "edit Updated task",
      });
      await h.session.controlGoal({ action: "resume" });
      expect(command).toHaveBeenLastCalledWith({
        sessionID: "ses_new",
        name: "goal",
        text: "resume",
      });
      mocks.readOpenCodeGoalState.mockResolvedValue(null);
      await h.session.controlGoal({ action: "clear" });
      expect(command).toHaveBeenLastCalledWith({
        sessionID: "ses_new",
        name: "goal",
        text: "clear",
      });
      expect(h.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "item.updated", payload: { action: "cleared" } }),
        ]),
      );
    } finally {
      await h.session.dispose();
      mocks.readOpenCodeGoalState.mockResolvedValue(undefined);
    }
    const reads = mocks.readOpenCodeGoalState.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(mocks.readOpenCodeGoalState).toHaveBeenCalledTimes(reads);
  });

  it("hydrates goals when config and plugin lookup fail without dropping slash commands", async () => {
    mocks.readOpenCodeGoalState.mockResolvedValue({
      id: "goal-1",
      sessionID: "ses_new",
      objective: "Finish task",
      status: "active",
      updatedAt: 100,
    });
    const h = await makeSession({
      client: makeClientWith({
        "command.list": vi
          .fn<() => Promise<unknown>>()
          .mockResolvedValue({ data: [{ name: "goal", description: "Set a goal" }] }),
        "config.get": vi.fn<() => Promise<unknown>>().mockRejectedValue(new Error("config down")),
        "plugin.list": vi
          .fn<() => Promise<unknown>>()
          .mockResolvedValueOnce({
            data: [{ source: { type: "builtin" }, state: { status: "active" } }],
          })
          .mockRejectedValue(new Error("plugins down")),
      }),
    });
    try {
      await vi.waitFor(() =>
        expect(h.events).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: "item.started",
              itemType: "goal",
              payload: expect.objectContaining({ objective: "Finish task" }),
            }),
          ]),
        ),
      );
      expect(
        h.updates.some((update) => update.slashCommands?.some((command) => command.id === "goal")),
      ).toBe(true);
    } finally {
      await h.session.dispose();
      mocks.readOpenCodeGoalState.mockResolvedValue(undefined);
    }
  });

  it("retries goal-state resolution after the path lookup misses", async () => {
    mocks.resolveOpenCodeGoalStatePath
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue("/goals.json");
    mocks.readOpenCodeGoalState.mockResolvedValue({
      id: "goal-1",
      sessionID: "ses_new",
      objective: "Finish task",
      status: "active",
      updatedAt: 100,
    });
    const h = await makeSession({
      client: makeClientWith({
        "command.list": vi
          .fn<() => Promise<unknown>>()
          .mockResolvedValue({ data: [{ name: "goal" }] }),
      }),
    });
    try {
      await vi.waitFor(
        () =>
          expect(mocks.readOpenCodeGoalState).toHaveBeenCalledWith(
            projectLocation,
            "/goals.json",
            "ses_new",
          ),
        { timeout: 2500 },
      );
      expect(mocks.resolveOpenCodeGoalStatePath.mock.calls.length).toBeGreaterThan(1);
    } finally {
      await h.session.dispose();
      mocks.readOpenCodeGoalState.mockResolvedValue(undefined);
      mocks.resolveOpenCodeGoalStatePath.mockReset();
      mocks.resolveOpenCodeGoalStatePath.mockResolvedValue("/goals.json");
    }
  });

  it("does not expose goal commands without a plugin or create a model prompt on failure", async () => {
    const h = await makeSession();
    try {
      await expect(h.session.controlGoal({ action: "pause" })).rejects.toThrow(
        "goal plugin command is unavailable",
      );
      expect(h.client.session.prompt).not.toHaveBeenCalled();
    } finally {
      await h.session.dispose();
    }
  });

  it("hydrates renamed and command-disabled goal plugins", async () => {
    for (const enabled of [true, false]) {
      mocks.readOpenCodeGoalState.mockResolvedValue({
        id: "goal-1",
        sessionID: "ses_new",
        objective: "Restored goal",
        status: "paused",
        updatedAt: 100,
      });
      const command = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const client = makeClientWith({
        "command.list": vi
          .fn<() => Promise<unknown>>()
          .mockResolvedValue({ data: enabled ? [{ name: "mission" }] : [] }),
        "config.get": vi.fn<() => Promise<unknown>>().mockResolvedValue([
          {
            type: "document",
            info: {
              plugins: [
                {
                  package: "@prevalentware/opencode-goal-plugin",
                  options: { command_name: "mission", register_command: enabled },
                },
              ],
            },
          },
        ]),
        "plugin.list": vi.fn<() => Promise<unknown>>().mockResolvedValue({
          data: [{ id: "local.goal-mode.server", state: { status: "active" } }],
        }),
        "session.command": command,
      });
      const h = await makeSession({ client });
      try {
        await vi.waitFor(() =>
          expect(h.events).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                type: "item.started",
                itemType: "goal",
                payload: expect.objectContaining({
                  objective: "Restored goal",
                  availableActions: enabled ? ["edit", "resume", "clear"] : [],
                }),
              }),
            ]),
          ),
        );
        const result = await h.session
          .controlGoal({ action: "resume" })
          .catch((error: unknown) => error);
        expect(result instanceof Error).toBe(!enabled);
        expect(command.mock.calls).toEqual(
          enabled ? [[{ sessionID: "ses_new", name: "mission", text: "resume" }]] : [],
        );
      } finally {
        await h.session.dispose();
        mocks.readOpenCodeGoalState.mockResolvedValue(undefined);
      }
    }
  });

  it("releases Resume on reflected native state while its goal loop RPC is still pending", async () => {
    const goal = {
      id: "goal-1",
      sessionID: "ses_new",
      objective: "Goal",
      status: "paused",
      updatedAt: 100,
    };
    mocks.readOpenCodeGoalState.mockResolvedValue(goal);
    const pending = Promise.withResolvers<void>();
    const command = vi
      .fn<() => Promise<void>>()
      .mockResolvedValue(undefined)
      .mockImplementationOnce(() => pending.promise);
    const h = await makeSession({
      client: makeClientWith({
        "command.list": vi
          .fn<() => Promise<unknown>>()
          .mockResolvedValue({ data: [{ name: "goal" }, { name: "pause_goal" }] }),
        "session.command": command,
      }),
    });
    try {
      await vi.waitFor(() =>
        expect(h.events).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ type: "item.started", itemType: "goal" }),
          ]),
        ),
      );
      const resume = h.session.controlGoal({ action: "resume" });
      await vi.waitFor(() => expect(command).toHaveBeenCalledTimes(1));
      mocks.readOpenCodeGoalState.mockResolvedValue({ ...goal, status: "active", updatedAt: 200 });
      await resume;
      await h.session.controlGoal({ action: "pause" });
      expect(command).toHaveBeenLastCalledWith({
        sessionID: "ses_new",
        name: "pause_goal",
        text: "",
      });
      pending.reject(new Error("late command failure"));
      await vi.waitFor(() => expect(h.errors).toHaveLength(1));
    } finally {
      pending.resolve();
      await h.session.dispose();
      mocks.readOpenCodeGoalState.mockResolvedValue(undefined);
    }
  });

  it("does not let an in-flight file read overwrite a newer tool snapshot", async () => {
    const pending = Promise.withResolvers<unknown>();
    mocks.readOpenCodeGoalState.mockReturnValue(pending.promise);
    const h = await makeSession({
      client: makeClientWith({
        "command.list": vi
          .fn<() => Promise<unknown>>()
          .mockResolvedValue({ data: [{ name: "goal" }] }),
      }),
    });
    try {
      await vi.waitFor(() => expect(mocks.readOpenCodeGoalState).toHaveBeenCalled());
      h.subscription?.onEvent(
        event("session.tool.input.started", {
          sessionID: "ses_new",
          assistantMessageID: "msg-goal",
          id: "tool-goal",
          name: "create_goal",
        }),
      );
      h.subscription?.onEvent(
        event("session.tool.success", {
          sessionID: "ses_new",
          assistantMessageID: "msg-goal",
          id: "tool-goal",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                goal: {
                  id: "goal-1",
                  sessionID: "ses_new",
                  objective: "Latest goal",
                  status: "active",
                  updatedAt: 200,
                },
              }),
            },
          ],
        }),
      );
      pending.resolve(null);
      await pending.promise;
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(
        h.events.some((entry) => entry.type === "item.started" && entry.itemType === "goal"),
      ).toBe(true);
      expect(
        h.events.some(
          (entry) =>
            (entry.type === "item.started" || entry.type === "item.updated") &&
            (entry.payload as { action?: string })?.action === "cleared",
        ),
      ).toBe(false);
    } finally {
      await h.session.dispose();
      mocks.readOpenCodeGoalState.mockResolvedValue(undefined);
    }
  });

  beforeEach(() => {
    mocks.acquireOpenCodeServer.mockReset();
    mocks.subscribeOpenCodeServerEvents.mockReset();
    eventSeq = 0;
  });

  it.each(["command", "skill", "agent"] as const)(
    "admits plain input while the %s catalog is stalled",
    async (name) => {
      const catalog = Promise.withResolvers<{ data: never[] }>();
      const client = makeClient();
      vi.mocked(client[name].list).mockReturnValue(catalog.promise as never);
      const { session, updates } = await makeSession({ client });
      await session.startTurn("hello", config);
      expect(client.session.prompt).toHaveBeenCalledWith({ sessionID: "ses_new", text: "hello" });
      catalog.resolve({ data: [] });
      await vi.waitFor(() =>
        expect(updates.at(-1)).toMatchObject({
          status: "working",
          slashCommands: expect.any(Array),
        }),
      );
      await session.dispose();
    },
  );

  it.each([
    {
      prompt: "/review scope",
      method: "command",
      expected: { sessionID: "ses_new", name: "review", text: "scope" },
    },
    { prompt: "/compact", method: "compact", expected: { sessionID: "ses_new" } },
    {
      prompt: "/skill foo more",
      method: "prompt",
      expected: { sessionID: "ses_new", text: "more", skills: [{ id: "foo" }] },
    },
    {
      prompt: "/agent/reviewer",
      method: "switchAgent",
      expected: { sessionID: "ses_new", agent: "reviewer" },
    },
  ] as const)(
    "waits for metadata before dispatching $prompt",
    async ({ prompt, method, expected }) => {
      const catalog = Promise.withResolvers<{ data: { name: string }[] }>();
      const client = makeClientWith({
        "command.list": vi.fn<() => typeof catalog.promise>(() => catalog.promise),
        "skill.list": vi.fn<() => Promise<unknown>>(async () => ({
          data: [{ id: "foo", name: "Foo" }],
        })),
        "agent.list": vi.fn<() => Promise<unknown>>(async () => ({
          data: [{ id: "reviewer", name: "Reviewer", hidden: false, mode: "primary" }],
        })),
        "session.command": vi.fn<() => Promise<unknown>>(async () => ({})),
        "session.compact": vi.fn<() => Promise<unknown>>(async () => ({})),
      });
      const { session } = await makeSession({ client });
      const turn = session.startTurn(prompt, config);
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(client.session[method]).not.toHaveBeenCalled();
      catalog.resolve({ data: [{ name: "review" }] });
      await turn;
      expect(client.session[method]).toHaveBeenCalledWith(expected);
      await session.dispose();
    },
  );

  it("waits for native command discovery when steering an active turn", async () => {
    const catalog = Promise.withResolvers<{ data: { name: string }[] }>();
    const client = makeClientWith({
      "command.list": vi.fn<() => typeof catalog.promise>(() => catalog.promise),
      "session.command": vi.fn<() => Promise<unknown>>(async () => ({})),
    });
    const { session } = await makeSession({ client });
    await session.startTurn("hello", config);
    const steer = session.steerTurn("/review scope", config);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(client.session.command).not.toHaveBeenCalled();
    catalog.resolve({ data: [{ name: "review" }] });
    await steer;
    expect(client.session.command).toHaveBeenCalledWith({
      sessionID: "ses_new",
      name: "review",
      text: "scope",
      delivery: "steer",
    });
    await session.dispose();
  });

  it("preserves pending approval when catalog discovery finishes", async () => {
    const catalog = Promise.withResolvers<{ data: never[] }>();
    const client = makeClientWith({
      "command.list": vi.fn<() => typeof catalog.promise>(() => catalog.promise),
    });
    const { session, subscription, updates } = await makeSession({ client });
    subscription?.onEvent(
      event("permission.asked", {
        id: "p",
        sessionID: "ses_new",
        action: "shell",
        resources: ["pwd"],
      }),
    );
    catalog.resolve({ data: [] });
    await vi.waitFor(() =>
      expect(updates.at(-1)).toMatchObject({
        status: "needs_approval",
        slashCommands: expect.any(Array),
      }),
    );
    await session.dispose();
  });

  it("allows plain text after catalog failure and rejects native dispatch without its metadata", async () => {
    const catalog = Promise.withResolvers<{ data: never[] }>();
    const client = makeClientWith({
      "command.list": vi.fn<() => typeof catalog.promise>(() => catalog.promise),
    });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { session } = await makeSession({ client });
      catalog.reject(new Error("catalog unavailable"));
      await vi.waitFor(() => expect(warning).toHaveBeenCalled());
      await session.startTurn("hello", config);
      await expect(session.startTurn("/review", config)).rejects.toThrow("catalog unavailable");
      expect(client.session.prompt).toHaveBeenCalledTimes(1);
      await session.dispose();
    } finally {
      warning.mockRestore();
    }
  });

  it("drops catalog results delivered after disposal", async () => {
    const catalog = Promise.withResolvers<{ data: { name: string }[] }>();
    const client = makeClientWith({
      "command.list": vi.fn<() => typeof catalog.promise>(() => catalog.promise),
    });
    const { session, updates } = await makeSession({ client });
    await session.dispose();
    const count = updates.length;
    catalog.resolve({ data: [{ name: "late" }] });
    await catalog.promise;
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(updates).toHaveLength(count);
  });

  it("releases a command waiting on a stalled catalog when disposed", async () => {
    const catalog = Promise.withResolvers<{ data: never[] }>();
    const client = makeClientWith({
      "command.list": vi.fn<() => typeof catalog.promise>(() => catalog.promise),
    });
    const { session } = await makeSession({ client });
    const turn = session.startTurn("/review", config);
    const outcome = turn.catch((error: unknown) => error);
    await new Promise<void>((resolve) => setImmediate(resolve));
    await session.dispose();
    expect(await outcome).toHaveProperty(
      "message",
      expect.stringContaining("OpenCodeSession is not active"),
    );
    expect(client.session.prompt).not.toHaveBeenCalled();
  });

  it("uses the replacement server's catalog when a command waits across server recovery", async () => {
    const oldCatalog = Promise.withResolvers<{ data: { name: string }[] }>();
    const newCatalog = Promise.withResolvers<{ data: { name: string }[] }>();
    const oldClient = makeClientWith({
      "command.list": vi.fn<() => typeof oldCatalog.promise>(() => oldCatalog.promise),
    });
    const newClient = makeClientWith({
      "command.list": vi.fn<() => typeof newCatalog.promise>(() => newCatalog.promise),
      "session.command": vi.fn<() => Promise<unknown>>(async () => ({})),
    });
    const first = makeAcquired(oldClient).acquired;
    const second = makeAcquired(newClient).acquired;
    mocks.acquireOpenCodeServer.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const { session, updates } = await makeSession({ client: oldClient, acquired: first });
    const turn = session.startTurn("/fresh", config);
    vi.mocked(first.updateMcpServers).mockRejectedValueOnce(new Error("connection refused"));
    await session.updateMcpServers([]);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(newClient.session.command).not.toHaveBeenCalled();
    newCatalog.resolve({ data: [{ name: "fresh" }] });
    await turn;
    expect(newClient.session.command).toHaveBeenCalledWith({
      sessionID: "ses_new",
      name: "fresh",
      text: "",
    });
    expect(oldClient.session.prompt).not.toHaveBeenCalled();
    oldCatalog.resolve({ data: [{ name: "stale" }] });
    await oldCatalog.promise;
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(JSON.stringify(updates)).not.toContain('"stale"');
    await session.dispose();
  });

  it("hydrates a resumed approval before the listener attaches", async () => {
    const client = makeClient();
    mocks.acquireOpenCodeServer.mockResolvedValue(makeAcquired(client).acquired);
    vi.mocked(client.session.active).mockResolvedValue({ ses_resume: { type: "running" } });
    vi.mocked(client.permission.list).mockResolvedValue([
      { id: "resume", sessionID: "ses_resume", action: "shell", resources: ["pwd"] },
    ]);
    const session = await OpenCodeSession.create({
      threadId: "thread",
      projectLocation,
      config,
      presentationMode: "gui",
    });
    await session.openThread(config, {
      providerSessionId: "ses_resume",
      discoveredAt: new Date().toISOString(),
    });
    const events: RuntimeEvent[] = [];
    const updates: StructuredSessionUpdate[] = [];
    session.setListener({
      onClose() {},
      onError() {},
      onRuntimeEvent: (e) => events.push(e),
      onUpdate: (u) => updates.push(u),
    });
    expect(events).toContainEqual(
      expect.objectContaining({ type: "request.opened", requestId: "opencode-perm-resume" }),
    );
    expect(updates.at(-1)?.status).toBe("needs_approval");
    await session.resolveServerRequest("opencode-perm-resume", { decision: "reject" });
    expect(client.permission.reply).toHaveBeenCalledWith(
      expect.objectContaining({ sessionID: "ses_resume", requestID: "resume" }),
    );
    await session.dispose();
  });

  it("recovers a missed running child and routes its pending approval", async () => {
    const harness = await makeSession();
    vi.mocked(harness.client.session.active).mockResolvedValue({
      ses_new: { type: "running" },
      child: { type: "running" },
    });
    vi.mocked(harness.client.message.list).mockImplementation(
      async ({ sessionID }) =>
        ({
          data:
            sessionID === "ses_new"
              ? [
                  {
                    id: "m",
                    type: "assistant",
                    time: { created: 1 },
                    content: [
                      {
                        type: "tool",
                        id: "task",
                        name: "subagent",
                        state: {
                          status: "running",
                          input: { prompt: "check" },
                          metadata: { sessionID: "child" },
                          time: { start: 1 },
                        },
                      },
                    ],
                  },
                ]
              : [],
          cursor: {},
        }) as never,
    );
    vi.mocked(harness.client.permission.list).mockImplementation(async ({ sessionID }) =>
      sessionID === "child"
        ? [{ id: "child-approval", sessionID: "child", action: "shell", resources: ["pwd"] }]
        : [],
    );
    await harness.subscription!.onReconnect();
    expect(harness.session.ownsProviderSession("child")).toBe(true);
    expect(harness.events).toContainEqual(
      expect.objectContaining({
        type: "request.opened",
        requestId: "opencode-perm-child-approval",
      }),
    );
    await harness.session.resolveServerRequest("opencode-perm-child-approval", {
      decision: "reject",
    });
    expect(harness.client.permission.reply).toHaveBeenCalledWith(
      expect.objectContaining({ sessionID: "child", requestID: "child-approval" }),
    );
    await harness.session.dispose();
  });

  it("restores missed approvals and settles a turn after reconnect", async () => {
    const harness = await makeSession();
    await harness.session.startTurn("hello", config);
    vi.mocked(harness.client.permission.list).mockResolvedValueOnce([
      { id: "p", sessionID: "ses_new", action: "bash", resources: ["pwd"] },
    ]);
    await harness.subscription!.onReconnect();
    expect(harness.events).toContainEqual(
      expect.objectContaining({ type: "request.opened", requestId: "opencode-perm-p" }),
    );
    expect(harness.updates.at(-1)?.status).toBe("needs_approval");
    await harness.subscription!.onReconnect();
    expect(harness.events).toContainEqual(expect.objectContaining({ type: "request.resolved" }));
    expect(harness.updates.at(-1)?.status).toBe("idle");
    expect(harness.events.filter((entry) => entry.type === "turn.completed")).toHaveLength(1);
    await harness.session.dispose();
  });

  it("switches native agents during an active turn without submitting a server command", async () => {
    const client = makeClientWith({
      "agent.list": vi.fn<() => Promise<unknown>>().mockResolvedValue({
        data: [{ id: "plan", name: "Plan", mode: "primary", hidden: false }],
      }),
    });
    const harness = await makeSession({ client });
    await harness.session.startTurn("hello", config);
    expect(await harness.session.steerTurn("/agent/plan", config)).toEqual({
      outcome: "completed-without-turn",
    });
    expect(client.session.switchAgent).toHaveBeenLastCalledWith({
      sessionID: "ses_new",
      agent: "plan",
    });
    expect(client.session.prompt).toHaveBeenCalledTimes(1);
    expect(harness.updates.at(-1)?.status).toBe("working");
    await harness.session.dispose();
  });

  it("creates a session on the shared sidecar and reports it as the thread ref", async () => {
    const { session, client } = await makeSession();

    expect(client.session.create).toHaveBeenCalledWith({
      // Session titles carry the short thread id for server-side readability.
      title: "poracode/thread-a",
      location: { directory: "/repo" },
      permissions: [
        { action: "*", resource: "*", effect: "ask" },
        { action: "question", resource: "*", effect: "allow" },
      ],
    });
    expect(session.launchOptions.resumeThreadId).toBe("ses_new");
    expect(openCodeSessionDatabaseEnv(projectLocation, "ses_new")).toBeUndefined();
    expect(session.ownsProviderSession("ses_new")).toBe(true);
    expect(session.ownsProviderSession("ses_other")).toBe(false);
  });

  it("applies denied sibling MCP servers and disabled tools on create and resumed GUI threads", async () => {
    const client = makeClient();
    const { acquired } = makeAcquired(client, {
      directoryMcpNames: ["browser", "linear", "poracode"],
    });
    const mcpServers = [
      remoteMcp("browser", "http://127.0.0.1:9321/mcp", ["screenshot"]),
      remoteMcp("poracode", "http://127.0.0.1:9322/mcp"),
    ];
    const { session } = await makeSession({ client, acquired, mcpServers });

    expect(client.session.create).toHaveBeenCalledWith({
      title: "poracode/thread-a",
      location: { directory: "/repo" },
      permissions: [
        { action: "*", resource: "*", effect: "ask" },
        { action: "question", resource: "*", effect: "allow" },
        { action: "linear_*", resource: "*", effect: "deny" },
        { action: "browser_screenshot", resource: "*", effect: "deny" },
      ],
    });

    vi.mocked(client.session.update).mockClear();
    await session.openThread(
      { ...config, approvalPolicy: "yolo" },
      { providerSessionId: "ses_resume", discoveredAt: "2026-01-01T00:00:00.000Z" },
    );
    expect(client.session.update).toHaveBeenLastCalledWith({
      sessionID: "ses_resume",
      permissions: [
        { action: "*", resource: "*", effect: "allow" },
        { action: "question", resource: "*", effect: "allow" },
        { action: "linear_*", resource: "*", effect: "deny" },
        { action: "browser_screenshot", resource: "*", effect: "deny" },
      ],
    });
    await session.dispose();
  });

  it("resolves per-turn MCP servers before starting a turn and fences stale resolution", async () => {
    const client = makeClient();
    const { acquired, setDirectoryMcpNames } = makeAcquired(client, {
      directoryMcpNames: ["browser"],
    });
    const resolveMcpServersForTurn = vi.fn<
      NonNullable<Parameters<typeof OpenCodeSession.create>[0]["resolveMcpServersForTurn"]>
    >(async (turnConfig) => {
      setDirectoryMcpNames(["browser", "linear"]);
      return turnConfig.approvalPolicy === "yolo"
        ? [remoteMcp("browser", "http://127.0.0.1:9321/mcp", ["click"])]
        : [remoteMcp("linear", "http://127.0.0.1:9323/mcp")];
    });
    const { session } = await makeSession({
      client,
      acquired,
      mcpServers: [remoteMcp("browser", "http://127.0.0.1:9321/mcp")],
      resolveMcpServersForTurn,
    });

    await session.startTurn("first", { ...config, approvalPolicy: "yolo" });
    expect(acquired.updateMcpServers).toHaveBeenLastCalledWith([
      remoteMcp("browser", "http://127.0.0.1:9321/mcp", ["click"]),
    ]);
    expect(client.session.update).toHaveBeenLastCalledWith({
      sessionID: "ses_new",
      permissions: [
        { action: "*", resource: "*", effect: "allow" },
        { action: "question", resource: "*", effect: "allow" },
        { action: "linear_*", resource: "*", effect: "deny" },
        { action: "browser_click", resource: "*", effect: "deny" },
      ],
    });

    // If the session disposes while resolving MCPs, startTurn must bail without mutating the lease.
    vi.mocked(acquired.updateMcpServers).mockClear();
    const gated = Promise.withResolvers<readonly ResolvedMcpServer[]>();
    resolveMcpServersForTurn.mockImplementationOnce((_cfg, isCurrent) =>
      gated.promise.then((res) => (isCurrent() ? res : [])),
    );
    const pendingTurn = session.startTurn("stale", config);
    await vi.waitFor(() => expect(resolveMcpServersForTurn).toHaveBeenCalledTimes(2));
    await session.dispose();
    gated.resolve([]);
    await pendingTurn;
    expect(acquired.updateMcpServers).not.toHaveBeenCalled();
  });

  it("refreshes session permissions when a sibling thread alters directory MCP leases", async () => {
    const client = makeClient();
    const { acquired, setDirectoryMcpNames, emitDirectoryMcpChanged } = makeAcquired(client, {
      directoryMcpNames: ["browser"],
    });
    const { session } = await makeSession({
      client,
      acquired,
      mcpServers: [remoteMcp("browser", "http://127.0.0.1:9321/mcp")],
    });

    setDirectoryMcpNames(["browser", "sibling_mcp"]);
    emitDirectoryMcpChanged();
    await vi.waitFor(() =>
      expect(client.session.update).toHaveBeenLastCalledWith({
        sessionID: "ses_new",
        permissions: [
          { action: "*", resource: "*", effect: "ask" },
          { action: "question", resource: "*", effect: "allow" },
          { action: "sibling_mcp_*", resource: "*", effect: "deny" },
        ],
      }),
    );

    await session.dispose();
  });

  it("retains the legacy database when remembering a resumed terminal session", async () => {
    const client = makeClient();
    const { acquired } = makeAcquired(client, { database: "legacy-isolated" });
    mocks.acquireOpenCodeServer.mockResolvedValue(acquired);
    const session = await OpenCodeSession.create({
      threadId: "thread-legacy",
      projectLocation,
      config,
      presentationMode: "terminal",
      sessionRef: { providerSessionId: "ses_resume", discoveredAt: "2026-01-01T00:00:00.000Z" },
    });
    await session.openThread(config);
    expect(openCodeSessionDatabaseEnv(projectLocation, "ses_resume")).toEqual({
      OPENCODE_DB: "opencode-v2.db",
    });
    await session.dispose();
  });

  it("persists terminal model, agent and permissions before attachment", async () => {
    const { session, client } = await makeSession({ presentationMode: "terminal" });
    await session.openThread(
      { ...config, mode: "plan", effort: "high", approvalPolicy: "default" },
      {
        providerSessionId: "ses_resume",
        discoveredAt: "2026-01-01T00:00:00.000Z",
      },
    );
    expect(client.session.switchAgent).toHaveBeenLastCalledWith({
      sessionID: "ses_resume",
      agent: "plan",
    });
    expect(client.session.switchModel).toHaveBeenLastCalledWith({
      sessionID: "ses_resume",
      model: { providerID: "opencode-go", id: "deepseek-v4.1-flash", variant: "high" },
    });
    expect(client.session.update).toHaveBeenLastCalledWith({
      sessionID: "ses_resume",
      permissions: [
        { action: "*", resource: "*", effect: "ask" },
        { action: "question", resource: "*", effect: "allow" },
      ],
    });
    expect(mocks.subscribeOpenCodeServerEvents).not.toHaveBeenCalled();
    // Terminal presentation has no context dock; its window read must not run.
    expect(client.model.list).not.toHaveBeenCalled();
  });

  it("resumes an existing session without creating one", async () => {
    const client = makeClientWith({
      "model.list": vi.fn<() => Promise<unknown>>().mockResolvedValue({
        data: [catalogModel("opencode-go", "glm-5.3-flash", 1_048_576)],
      }),
    });
    const { session, events } = await makeSession({ client });
    vi.mocked(client.session.create).mockClear();

    const id = await session.openThread(
      { model: "opencode-go/glm-5.3-flash" },
      {
        providerSessionId: "ses_resume",
        discoveredAt: "2026-01-01T00:00:00.000Z",
      },
    );

    expect(id).toBe("ses_resume");
    expect(client.session.get).toHaveBeenCalledWith({ sessionID: "ses_resume" });
    expect(client.session.create).not.toHaveBeenCalled();
    expect(session.launchOptions.resumeThreadId).toBe("ses_resume");
    // A resumed thread announces the window of the model it will run.
    await vi.waitFor(() =>
      expect(events).toEqual(
        expect.arrayContaining([
          {
            type: "context.updated",
            threadId: "thread-abc12345",
            usage: { maxTokens: 1_048_576 },
          },
        ]),
      ),
    );
  });

  it("surfaces missing resume targets without silently replacing their history", async () => {
    const client = makeClientWith({
      "session.get": vi.fn<() => Promise<never>>().mockRejectedValue(new Error("not found")),
    });
    const { session } = await makeSession({ client });

    vi.mocked(client.session.create).mockClear();
    await expect(
      session.openThread(config, {
        providerSessionId: "ses_gone",
        discoveredAt: "2026-01-01T00:00:00.000Z",
      }),
    ).rejects.toThrow("not found");
    expect(client.session.create).not.toHaveBeenCalled();
  });

  it("refuses a resume whose session.get resolves without an id", async () => {
    const client = makeClientWith({
      "session.get": vi.fn<() => Promise<{ id?: string }>>().mockResolvedValue({}),
    });
    const { session } = await makeSession({ client });

    vi.mocked(client.session.create).mockClear();
    await expect(
      session.openThread(config, {
        providerSessionId: "ses_empty",
        discoveredAt: "2026-01-01T00:00:00.000Z",
      }),
    ).rejects.toThrow(/was not found/);
    expect(client.session.create).not.toHaveBeenCalled();
  });

  it("applies the configured model once per selection and rejects failed changes", async () => {
    const { session, client } = await makeSession();
    vi.mocked(client.session.switchModel).mockClear();

    await session.startTurn("first", config);
    await session.startTurn("second", config);
    await session.startTurn("third", { ...config, effort: "high" });

    expect(client.session.switchModel).toHaveBeenCalledTimes(2);
    expect(client.session.switchModel).toHaveBeenNthCalledWith(1, {
      sessionID: "ses_new",
      model: { providerID: "opencode-go", id: "deepseek-v4.1-flash" },
    });
    expect(client.session.switchModel).toHaveBeenNthCalledWith(2, {
      sessionID: "ses_new",
      model: { providerID: "opencode-go", id: "deepseek-v4.1-flash", variant: "high" },
    });
    expect(client.session.prompt).toHaveBeenLastCalledWith({ sessionID: "ses_new", text: "third" });

    // Never silently run a prompt on a model the user did not select.
    vi.mocked(client.session.switchModel).mockRejectedValueOnce(new Error("bad model"));
    await expect(session.startTurn("fourth", config)).rejects.toThrow("bad model");
    expect(client.session.prompt).toHaveBeenCalledTimes(3);
  });

  it("announces the catalog context window and stamps it on every step sample", async () => {
    const client = makeClientWith({
      "model.list": vi.fn<() => Promise<unknown>>().mockResolvedValue({
        data: [
          catalogModel("opencode-go", "deepseek-v4.1-flash", 1_000_000),
          catalogModel("zai-coding-plan", "glm-5.4", 200_000),
        ],
      }),
    });
    const { session, subscription, events } = await makeSession({ client });
    try {
      // The window is announced as soon as the catalog answers, before any step
      // sample, so a thread handed off to OpenCode stops showing the window its
      // previous provider reported.
      await vi.waitFor(() =>
        expect(events).toEqual(
          expect.arrayContaining([
            {
              type: "context.updated",
              threadId: "thread-abc12345",
              usage: { maxTokens: 1_000_000 },
            },
          ]),
        ),
      );

      // A prompt on the same model never waits for or repeats the announcement.
      events.length = 0;
      await session.startTurn("hello", config);
      const turnEvents = events.splice(0);
      expect(turnEvents.filter((mapped) => mapped.type === "context.updated")).toEqual([]);

      subscription?.onEvent(
        event("session.step.ended", {
          sessionID: "ses_new",
          assistantMessageID: "msg_a",
          tokens: { input: 10, output: 1, reasoning: 0, cache: { read: 3, write: 0 } },
        }),
      );
      const stepEvents = events.splice(0);
      expect(stepEvents.find((mapped) => mapped.type === "context.updated")).toMatchObject({
        type: "context.updated",
        usage: { usedTokens: 14, maxTokens: 1_000_000 },
      });

      // Selecting another model republishes that model's window; the lookup is
      // display-only, so the announcement lands after the prompt was admitted.
      await session.startTurn("next", { model: "zai-coding-plan/glm-5.4" });
      await vi.waitFor(() =>
        expect(events).toEqual(
          expect.arrayContaining([
            {
              type: "context.updated",
              threadId: "thread-abc12345",
              usage: { maxTokens: 200_000 },
            },
          ]),
        ),
      );
    } finally {
      await session.dispose();
    }
  });

  it("drops a superseded model window when the newer switch resolves first", async () => {
    const first = Promise.withResolvers<{ data: unknown[] }>();
    const second = Promise.withResolvers<{ data: unknown[] }>();
    let calls = 0;
    const client = makeClientWith({
      "model.list": vi.fn<() => Promise<{ data: unknown[] }>>(() =>
        ++calls === 1 ? first.promise : second.promise,
      ),
    });
    const now = vi.spyOn(Date, "now");
    try {
      now.mockReturnValue(1_000_000);
      const { session, events } = await makeSession({ client });
      try {
        // Age the open lookup's snapshot out so the switch issues its own
        // request; the older answer then arrives after the newer one.
        now.mockReturnValue(1_000_000 + 5 * 60_000);
        await session.startTurn("switch", { model: "zai-coding-plan/glm-5.4" });
        now.mockRestore();

        second.resolve({
          data: [
            catalogModel("opencode-go", "deepseek-v4.1-flash", 1_000_000),
            catalogModel("zai-coding-plan", "glm-5.4", 200_000),
          ],
        });
        await vi.waitFor(() =>
          expect(events).toContainEqual({
            type: "context.updated",
            threadId: "thread-abc12345",
            usage: { maxTokens: 200_000 },
          }),
        );

        first.resolve({ data: [catalogModel("opencode-go", "deepseek-v4.1-flash", 1_000_000)] });
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(
          events.flatMap((mapped) =>
            mapped.type === "context.updated" ? [mapped.usage.maxTokens] : [],
          ),
        ).toEqual([200_000]);
      } finally {
        await session.dispose();
      }
    } finally {
      now.mockRestore();
    }
  });

  it("drops a context window that resolves after disposal", async () => {
    const pending = Promise.withResolvers<{ data: unknown[] }>();
    const client = makeClientWith({
      "model.list": vi.fn<() => Promise<{ data: unknown[] }>>(() => pending.promise),
    });
    const { session, events } = await makeSession({ client });
    await session.dispose();
    pending.resolve({ data: [catalogModel("opencode-go", "deepseek-v4.1-flash", 1_000_000)] });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(events.filter((mapped) => mapped.type === "context.updated")).toEqual([]);
  });

  it("falls back to the configured context size when the catalog omits the model", async () => {
    // A model that the catalog never lists (e.g. its provider was signed out)
    // must not inherit the previous provider's window through the usage row.
    const client = makeClientWith({
      "model.list": vi.fn<() => Promise<unknown>>().mockResolvedValue({ data: [] }),
    });
    const configured: ThreadConfig = { ...config, contextSize: "1M" };
    const { session, events } = await makeSession({ client, config: configured });
    try {
      await vi.waitFor(() =>
        expect(events).toEqual(
          expect.arrayContaining([
            {
              type: "context.updated",
              threadId: "thread-abc12345",
              usage: { maxTokens: 1_000_000 },
            },
          ]),
        ),
      );
    } finally {
      await session.dispose();
    }
  });

  it("keeps turns running when the context-window catalog fails", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const client = makeClientWith({
        "model.list": vi.fn<() => Promise<never>>().mockRejectedValue(new Error("catalog down")),
      });
      const configured: ThreadConfig = { ...config, contextSize: "1M" };
      const { session, events } = await makeSession({ client, config: configured });
      try {
        await session.startTurn("hello", configured);
        expect(client.session.prompt).toHaveBeenCalledWith({
          sessionID: "ses_new",
          text: "hello",
        });
        // The thread's own configured size still replaces an inherited window.
        await vi.waitFor(() =>
          expect(events).toEqual(
            expect.arrayContaining([
              {
                type: "context.updated",
                threadId: "thread-abc12345",
                usage: { maxTokens: 1_000_000 },
              },
            ]),
          ),
        );
        await vi.waitFor(() => expect(warning).toHaveBeenCalled());
      } finally {
        await session.dispose();
      }
    } finally {
      warning.mockRestore();
    }
  });

  it("applies plan and build agent changes before admitting prompts", async () => {
    const { session, client } = await makeSession();
    await session.startTurn("plan", { ...config, mode: "plan" });
    expect(client.session.switchAgent).toHaveBeenLastCalledWith({
      sessionID: "ses_new",
      agent: "plan",
    });
    await session.startTurn("build", { ...config, mode: "agent" });
    expect(client.session.switchAgent).toHaveBeenLastCalledWith({
      sessionID: "ses_new",
      agent: "build",
    });
    vi.mocked(client.session.switchAgent).mockRejectedValueOnce(new Error("agent unavailable"));
    await expect(session.startTurn("plan again", { ...config, mode: "plan" })).rejects.toThrow(
      "agent unavailable",
    );
    expect(client.session.prompt).toHaveBeenCalledTimes(2);
  });

  it("cancels forms on the server and keeps failed replies retryable", async () => {
    const { session, client, subscription } = await makeSession();
    subscription?.onEvent(
      event("form.created", {
        form: {
          list: vi.fn<() => Promise<unknown>>().mockResolvedValue([]),
          id: "retry",
          sessionID: "ses_new",
          title: "Question",
          fields: [],
        },
      }),
    );
    vi.mocked(client.session.form.reply).mockRejectedValueOnce(new Error("network unavailable"));
    await expect(
      session.resolveServerRequest("opencode-form-retry", { answers: { answer: "yes" } }),
    ).rejects.toThrow("network unavailable");
    await session.resolveServerRequest("opencode-form-retry", { action: "cancel" });
    expect(client.session.form.cancel).toHaveBeenCalledWith({
      sessionID: "ses_new",
      formID: "retry",
    });
  });

  it("does not reopen a turn that completed before prompt admission returned", async () => {
    const { session, client, subscription } = await makeSession();
    vi.mocked(client.session.prompt).mockImplementationOnce(async () => {
      subscription?.onEvent(event("session.execution.started", { sessionID: "ses_new" }));
      subscription?.onEvent(event("session.execution.succeeded", { sessionID: "ses_new" }));
      return {} as never;
    });
    await session.startTurn("fast", config);
    await session.steerTurn("next", config);
    expect(client.session.prompt).toHaveBeenLastCalledWith({ sessionID: "ses_new", text: "next" });
  });

  it("keeps a selected primary agent across follow-ups", async () => {
    const client = makeClientWith({
      "agent.list": vi.fn<() => Promise<unknown>>().mockResolvedValue({
        data: [{ id: "reviewer", name: "Reviewer", hidden: false, mode: "primary" }],
      }),
    });
    const { session, updates, events } = await makeSession({ client });
    await expect(session.startTurn("/agent/reviewer", config)).resolves.toEqual({
      outcome: "completed-without-turn",
    });
    expect(client.session.prompt).not.toHaveBeenCalled();
    expect(updates.at(-1)?.config?.mode).toBe("agent");
    expect(updates.at(-1)?.status).toBe("idle");
    expect(events.some((entry) => entry.type === "item.started")).toBe(false);
    await session.startTurn("review", config);
    expect(client.session.switchAgent).toHaveBeenCalledTimes(1);
    expect(client.session.switchAgent).toHaveBeenCalledWith({
      sessionID: "ses_new",
      agent: "reviewer",
    });
  });

  it("updates the native session policy without acquiring another server", async () => {
    const { session, client } = await makeSession();
    await session.startTurn("first", config);
    await session.startTurn("next", { ...config, approvalPolicy: "yolo" });
    expect(client.session.update).toHaveBeenLastCalledWith({
      sessionID: "ses_new",
      permissions: [
        { action: "*", resource: "*", effect: "allow" },
        { action: "question", resource: "*", effect: "allow" },
      ],
    });
    expect(mocks.acquireOpenCodeServer).toHaveBeenCalledTimes(1);
  });

  it("cancels pending requests once when a turn is force-completed", async () => {
    const { session, subscription, events } = await makeSession();
    subscription?.onEvent(
      event("permission.asked", {
        sessionID: "ses_new",
        id: "pending",
        action: "shell",
        resources: ["pwd"],
      }),
    );
    session.forceCompleteTurn();
    subscription?.onEvent(
      event("permission.replied", {
        sessionID: "ses_new",
        requestID: "pending",
        decision: "reject",
      }),
    );
    expect(events.filter((entry) => entry.type === "request.resolved")).toEqual([
      {
        type: "request.resolved",
        threadId: "thread-abc12345",
        requestId: "opencode-perm-pending",
        outcome: "cancelled",
      },
    ]);
  });

  it("lets the inbox echo reuse the runtime's optimistic user id", async () => {
    const { session, subscription, events } = await makeSession();
    await session.startTurn("hello", config, undefined, { userMessageItemId: "user-opt" });

    events.length = 0;
    subscription?.onEvent(
      event("session.inbox.enqueued", {
        sessionID: "ses_new",
        inboxID: "msg_user_1",
        item: { type: "user", payload: { text: "hello" }, delivery: "queue" },
      }),
    );
    subscription?.onEvent(event("session.execution.started", { sessionID: "ses_new" }));

    const userRows = events.filter(
      (e): e is Extract<RuntimeEvent, { type: "item.started" }> =>
        e.type === "item.started" && e.itemType === "user_message",
    );
    expect(userRows).toEqual([]);
    expect(events[0]).toMatchObject({ type: "turn.started" });
  });

  it("steers the running turn natively and paints the steer bubble once", async () => {
    const { session, client, subscription, events } = await makeSession();
    await session.startTurn("working", config);
    events.length = 0;

    await session.steerTurn("and the tests?", config, undefined, {
      userMessageItemId: "user-steer",
    });

    expect(client.session.prompt).toHaveBeenLastCalledWith({
      sessionID: "ses_new",
      text: "and the tests?",
      delivery: "steer",
    });
    expect(events).toEqual([
      {
        type: "item.started",
        threadId: "thread-abc12345",
        itemId: "user-steer",
        itemType: "user_message",
        payload: { content: [{ kind: "text", text: "and the tests?" }] },
      },
      { type: "item.completed", threadId: "thread-abc12345", itemId: "user-steer" },
    ]);

    // The server's inbox echo for the steer consumes the painted id, so the
    // transcript still holds exactly one row for the steer.
    subscription?.onEvent(
      event("session.inbox.enqueued", {
        sessionID: "ses_new",
        inboxID: "msg_steer",
        item: { type: "user", payload: { text: "and the tests?" }, delivery: "steer" },
      }),
    );
    expect(
      events.filter(
        (e): e is Extract<RuntimeEvent, { type: "item.started" }> =>
          e.type === "item.started" && e.itemType === "user_message",
      ),
    ).toHaveLength(1);
  });

  it("falls back to startTurn when no turn is in flight", async () => {
    const { session, client, events } = await makeSession();

    await session.steerTurn("fresh prompt", config);

    expect(client.session.prompt).toHaveBeenCalledWith({
      sessionID: "ses_new",
      text: "fresh prompt",
    });
    expect(
      events.filter((e) => e.type === "item.started" && e.itemType === "user_message"),
    ).toEqual([]);
  });

  it("interrupts the session best-effort", async () => {
    const { session, client } = await makeSession();

    await session.interruptTurn();
    expect(client.session.interrupt).toHaveBeenCalledWith({ sessionID: "ses_new" });

    vi.mocked(client.session.interrupt).mockRejectedValueOnce(new Error("already idle"));
    await expect(session.interruptTurn()).resolves.toBeUndefined();
  });

  it("routes permission replies and flips thread status around them", async () => {
    const { session, client, subscription, updates, events } = await makeSession();
    const sessionID = "ses_new";

    subscription?.onEvent(
      event("permission.asked", {
        id: "perm_1",
        sessionID,
        action: "bash",
        resources: ["ls -la"],
        save: ["ls *"],
      }),
    );
    expect(updates.at(-1)).toMatchObject({ status: "needs_approval", attention: "needs_approval" });
    expect(events.at(-1)).toMatchObject({
      type: "request.opened",
      requestId: "opencode-perm-perm_1",
      requestType: "command_execution_approval",
    });

    await session.resolveServerRequest("opencode-perm-perm_1", { decision: "always" });
    expect(client.permission.reply).toHaveBeenCalledWith({
      sessionID,
      requestID: "perm_1",
      decision: "always",
    });
    expect(updates.at(-1)).toMatchObject({ status: "working", attention: "working" });
  });

  it("routes form replies with the renderer's answer map", async () => {
    const { session, client, subscription, updates, events } = await makeSession();
    const sessionID = "ses_new";

    subscription?.onEvent(
      event("form.created", {
        sessionID,
        form: {
          list: vi.fn<() => Promise<unknown>>().mockResolvedValue([]),
          id: "form_1",
          sessionID,
          title: "Pick one",
          fields: [
            {
              key: "env",
              title: "Environment",
              description: "Where?",
              type: "multiselect",
              options: [{ value: "prod", label: "Production" }],
            },
          ],
        },
      }),
    );
    expect(updates.at(-1)).toMatchObject({ status: "needs_reply", attention: "needs_reply" });
    expect(events.at(-1)).toMatchObject({
      type: "request.opened",
      requestId: "opencode-form-form_1",
      requestType: "tool_user_input",
    });

    await session.resolveServerRequest("opencode-form-form_1", {
      answers: { env: "prod", tags: ["a", "b"], skip: { nested: true } },
    });
    expect(client.session.form.reply).toHaveBeenCalledWith({
      sessionID,
      formID: "form_1",
      answer: { env: "prod", tags: ["a", "b"] },
    });
    expect(updates.at(-1)).toMatchObject({ status: "working", attention: "working" });
  });

  it("streams a turn into canonical events and thread status", async () => {
    const { session, subscription, updates, events } = await makeSession();
    await session.startTurn("hello", config);
    updates.length = 0;
    events.length = 0;

    subscription?.onEvent(event("session.execution.started", { sessionID: "ses_new" }));
    subscription?.onEvent(
      event("session.text.delta", {
        sessionID: "ses_new",
        assistantMessageID: "msg_a",
        ordinal: 0,
        delta: "Hi",
      }),
    );
    subscription?.onEvent(
      event("session.step.ended", {
        sessionID: "ses_new",
        assistantMessageID: "msg_a",
        finish: "stop",
        tokens: { input: 10, output: 1, reasoning: 0, cache: { read: 0, write: 0 } },
      }),
    );
    subscription?.onEvent(event("session.execution.succeeded", { sessionID: "ses_new" }));

    expect(updates.map((update) => update.status)).toEqual(["working", "idle"]);
    expect(updates.at(-1)?.sessionRef).toMatchObject({ providerSessionId: "ses_new" });
    expect(typesOf(events)).toEqual([
      "turn.started",
      "item.started", // assistant_message
      "content.delta",
      "item.completed",
      "context.updated",
      "usage.spent",
      "turn.completed",
    ]);
    expect(events.at(-1)).toMatchObject({ state: "completed" });
  });

  it("stops a turn as a normal interruption when the user interrupts it", async () => {
    const { session, client, subscription, updates, events, errors } = await makeSession();
    const sessionID = "ses_new";
    await session.startTurn("hello", config);
    subscription?.onEvent(
      event("session.text.delta", {
        sessionID,
        assistantMessageID: "msg_a",
        ordinal: 0,
        delta: "Let me ",
      }),
    );

    await session.interruptTurn();
    expect(client.session.interrupt).toHaveBeenCalledWith({ sessionID });
    updates.length = 0;
    events.length = 0;

    // The server fails the in-flight step with its abort marker, then reports
    // the interrupt itself.
    subscription?.onEvent(
      event("session.step.failed", {
        sessionID,
        assistantMessageID: "msg_a",
        error: { type: "aborted", message: "Step interrupted" },
      }),
    );
    subscription?.onEvent(event("session.execution.interrupted", { sessionID, reason: "user" }));

    // The open assistant row closes and the turn settles — with no error row.
    expect(typesOf(events)).toEqual(["item.completed", "turn.completed"]);
    expect(events.at(-1)).toMatchObject({ state: "interrupted" });
    expect(updates).toEqual([expect.objectContaining({ status: "idle", attention: "none" })]);
    expect(errors).toEqual([]);
  });

  it("reads a chronological history with user text at the top level", async () => {
    const client = makeClientWith({
      "message.list": vi.fn<() => Promise<{ data: unknown[]; cursor: {} }>>().mockResolvedValue({
        // Newest first, as the API returns by default.
        data: [
          {
            id: "msg_a",
            type: "assistant",
            agent: "build",
            model: { id: "deepseek-v4.1-flash", providerID: "opencode-go" },
            content: [
              { type: "text", text: "Hello" },
              { type: "tool", id: "tool_1", name: "bash", state: { status: "running", input: {} } },
            ],
            finish: "stop",
            time: { created: 200 },
          },
          { id: "msg_sys", type: "system", text: "internal" },
          { id: "msg_u", type: "user", text: "Say hello in one word.", time: { created: 100 } },
        ],
        cursor: {},
      }),
    });
    const { session } = await makeSession({ client });

    const history = await session.readThread();

    expect(history.providerSessionId).toBe("ses_new");
    expect(history.messages.map((entry) => entry.role)).toEqual(["user", "assistant"]);
    expect(history.messages[0]).toMatchObject({
      messageId: "msg_u",
      parts: [{ kind: "text", text: "Say hello in one word." }],
    });
    // Assistant `content` parts pass through provider-native, so a history
    // consumer reads the same shapes the live stream produces.
    expect(history.messages[1]?.parts).toEqual([
      { type: "text", text: "Hello" },
      { type: "tool", id: "tool_1", name: "bash", state: { status: "running", input: {} } },
    ]);
  });

  it("closes open rows and releases the lease on dispose", async () => {
    const { session, subscription, events } = await makeSession();
    await session.startTurn("hello", config);
    subscription?.onEvent(event("session.execution.started", { sessionID: "ses_new" }));
    subscription?.onEvent(
      event("session.text.delta", {
        sessionID: "ses_new",
        assistantMessageID: "msg_a",
        ordinal: 0,
        delta: "Hi",
      }),
    );
    events.length = 0;

    let closed = false;
    session.setListener({
      onClose: () => {
        closed = true;
      },
      onError: () => {},
      onUpdate: () => {},
      onRuntimeEvent: (entry) => events.push(entry),
    });
    await session.dispose();

    expect(typesOf(events)).toEqual(["item.completed", "turn.completed"]);
    expect(events[1]).toMatchObject({ state: "interrupted" });
    expect(mocks.acquireOpenCodeServer).toHaveBeenCalledTimes(1);
    const acquired = await mocks.acquireOpenCodeServer.mock.results[0]!.value;
    expect((acquired as { dispose: ReturnType<typeof vi.fn> }).dispose).toHaveBeenCalledWith({
      closeServerIfIdle: true,
    });
    expect(closed).toBe(true);

    // Idempotent: a second dispose does not release the lease twice.
    await session.dispose();
    expect((acquired as { dispose: ReturnType<typeof vi.fn> }).dispose).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])(
    "reacquires the sidecar and settles active state (active=%s)",
    async (active) => {
      const client = makeClient();
      const first = makeAcquired(client);
      let notifyExit: (() => void) | undefined;
      const exits = new Set<() => void>();
      const acquiredFirst = {
        ...first.acquired,
        onServerExit: (callback: () => void) => {
          notifyExit = callback;
          exits.add(callback);
          return () => exits.delete(callback);
        },
      } as AcquiredOpenCodeServer;
      const secondClient = makeClient();
      const second = makeAcquired(secondClient);
      mocks.acquireOpenCodeServer
        .mockResolvedValueOnce(acquiredFirst)
        .mockResolvedValueOnce(second.acquired);

      const harness = await makeSession({ acquired: acquiredFirst });
      const { session, events, errors } = harness;
      expect(mocks.subscribeOpenCodeServerEvents).toHaveBeenCalledTimes(1);

      if (active) {
        await session.startTurn("before restart", config);
        harness.subscription?.onEvent(
          event("permission.asked", {
            id: "stale",
            sessionID: "ses_new",
            action: "shell",
            resources: ["pwd"],
          }),
        );
      }
      notifyExit?.();
      expect(
        events.filter((entry) => entry.type === "turn.completed").map((entry) => entry.state),
      ).toEqual(active ? ["interrupted"] : []);
      expect(
        events
          .filter((entry) => entry.type === "request.resolved")
          .map((entry) => ({ requestId: entry.requestId, outcome: entry.outcome })),
      ).toEqual(active ? [{ requestId: "opencode-perm-stale", outcome: "cancelled" }] : []);
      expect(harness.updates.at(-1)).toMatchObject({ status: "idle" });
      await vi.waitFor(() => expect(mocks.acquireOpenCodeServer).toHaveBeenCalledTimes(2));
      await vi.waitFor(() => expect(mocks.subscribeOpenCodeServerEvents).toHaveBeenCalledTimes(2));
      await vi.waitFor(() => expect(secondClient.message.list).toHaveBeenCalled());
      expect(secondClient.permission.list).toHaveBeenCalled();
      expect(secondClient.session.active).toHaveBeenCalled();
      expect(secondClient.session.prompt).not.toHaveBeenCalled();

      await session.startTurn("after restart", config);
      expect(secondClient.session.prompt).toHaveBeenCalledWith({
        sessionID: "ses_new",
        text: "after restart",
      });
      expect(events.filter((e) => e.type === "error")).toEqual([]);
      expect(errors).toEqual([]);

      await session.dispose();
    },
  );

  it("forwards MCP updates to the lease", async () => {
    const { session } = await makeSession();
    const servers = [
      {
        id: "browser",
        name: "browser",
        timeoutMs: 30_000,
        transport: { type: "http" as const, url: "http://127.0.0.1:9/mcp", headers: {} },
      },
    ];
    await session.updateMcpServers(servers);
    const acquired = (await mocks.acquireOpenCodeServer.mock.results[0]!.value) as {
      updateMcpServers: ReturnType<typeof vi.fn>;
    };
    expect(acquired.updateMcpServers).toHaveBeenCalledWith(servers);
  });
});

function typesOf(events: RuntimeEvent[]): string[] {
  return events.map((entry) => entry.type);
}

it("publishes the loaded command catalog to listeners attached after openThread", async () => {
  const { session, updates } = await makeSession();
  await vi.waitFor(() =>
    expect(
      updates.find((update) => update.slashCommands?.length)?.slashCommands?.length,
    ).toBeGreaterThan(0),
  );
  const initialCatalog = updates.find((update) => update.slashCommands?.length)?.slashCommands;
  const onUpdate = vi.fn<(update: StructuredSessionUpdate) => void>();
  session.setListener({ onClose: () => {}, onError: () => {}, onRuntimeEvent: () => {}, onUpdate });
  expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ slashCommands: initialCatalog }));
  await session.dispose();
});
