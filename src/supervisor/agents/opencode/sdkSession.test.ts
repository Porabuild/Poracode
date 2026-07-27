import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Event } from "@opencode-ai/sdk/v2";
import type { ProjectLocation, RuntimeEvent, ThreadConfig } from "@/shared/contracts";
import type { StructuredSessionUpdate } from "../base";
import { subscribeOpenCodeServerEvents } from "./sdkEventHub";
import { OpencodeSdkSession, parseOpenCodeQuestionAnswers } from "./sdkSession";
import { OpenCodeReadinessTimeoutError } from "./sdkServer";

const mocks = vi.hoisted(() => ({
  acquireOpenCodeServer: vi.fn<(input: unknown) => Promise<unknown>>(),
}));

vi.mock("./sdkClient", async (importActual) => {
  const actual = await importActual<typeof import("./sdkClient")>();
  return {
    ...actual,
    acquireOpenCodeServer: mocks.acquireOpenCodeServer,
  };
});

function streamOf<T>(...values: readonly T[]): AsyncGenerator<T> {
  return (async function* () {
    for (const value of values) {
      yield value;
    }
  })();
}

function serverConnectedEvent(): Event {
  return {
    id: "evt-server",
    type: "server.connected",
    properties: {},
  };
}

function emptyEventClient() {
  return {
    global: {
      event: vi.fn<() => Promise<{ stream: AsyncGenerator<unknown> }>>().mockResolvedValue({
        stream: streamOf(),
      }),
    },
  };
}

describe("OpencodeSdkSession", () => {
  const projectLocation: ProjectLocation = { kind: "posix", path: "/repo" };
  const config: ThreadConfig = { model: "opencode/big-pickle" };

  beforeEach(() => {
    mocks.acquireOpenCodeServer.mockReset();
  });

  it("preserves a typed, actionable provider readiness timeout", async () => {
    mocks.acquireOpenCodeServer.mockRejectedValue(
      new OpenCodeReadinessTimeoutError("opencode serve: OpenCode server did not respond in time."),
    );
    const session = await OpencodeSdkSession.create({
      threadId: "thread-opencode",
      projectLocation,
      config,
      presentationMode: "gui",
    });

    await expect(session.activate()).rejects.toMatchObject({
      name: "OpenCodeReadinessTimeoutError",
      message: expect.stringContaining("OpenCode server did not respond in time"),
    });
  });

  it("starts the GUI event stream on activation", async () => {
    const globalEvent = vi
      .fn<() => Promise<{ stream: AsyncGenerator<unknown> }>>()
      .mockResolvedValue({
        stream: streamOf({ payload: serverConnectedEvent() }),
      });
    const dispose = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    mocks.acquireOpenCodeServer.mockResolvedValue({
      eventClient: { global: { event: globalEvent } },
      client: {
        command: { list: vi.fn<() => Promise<{ data: [] }>>().mockResolvedValue({ data: [] }) },
        session: {
          create: vi
            .fn<() => Promise<{ data: { id: string } }>>()
            .mockResolvedValue({ data: { id: "ses_test" } }),
        },
      },
      baseUrl: "http://127.0.0.1:0",
      handle: {},
      dispose,
    });

    const session = await OpencodeSdkSession.create({
      threadId: "thread-opencode",
      projectLocation,
      config,
      presentationMode: "gui",
    });
    session.setListener({
      onClose: () => {},
      onError: () => {},
      onUpdate: () => {},
      onRuntimeEvent: () => {},
    });

    await session.activate();
    expect(globalEvent).toHaveBeenCalledTimes(1);

    await session.openThread(config);

    expect(globalEvent).toHaveBeenCalledTimes(1);
    expect(globalEvent).toHaveBeenCalledWith({
      signal: expect.any(AbortSignal),
      onSseError: expect.any(Function),
    });

    await session.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("shares one server event stream across GUI sessions", async () => {
    const globalEvent = vi
      .fn<() => Promise<{ stream: AsyncGenerator<unknown> }>>()
      .mockResolvedValue({ stream: streamOf() });
    const eventClient = { global: { event: globalEvent } };
    const handle = {};
    mocks.acquireOpenCodeServer.mockImplementation(() =>
      Promise.resolve({
        eventClient,
        client: {},
        baseUrl: "http://127.0.0.1:0",
        handle,
        dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      }),
    );

    const first = await OpencodeSdkSession.create({
      threadId: "thread-first",
      projectLocation,
      config,
      presentationMode: "gui",
    });
    const second = await OpencodeSdkSession.create({
      threadId: "thread-second",
      projectLocation,
      config,
      presentationMode: "gui",
    });

    await first.activate();
    await second.activate();

    expect(globalEvent).toHaveBeenCalledTimes(1);

    await first.dispose();
    await second.dispose();
  });

  it("isolates a throwing event subscriber from sibling sessions", async () => {
    const eventClient = {
      global: {
        event: vi.fn<() => Promise<{ stream: AsyncGenerator<unknown> }>>().mockResolvedValue({
          stream: streamOf({ directory: "/repo", payload: serverConnectedEvent() }),
        }),
      },
    };
    const sibling = vi.fn<(event: Event) => void>();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const unsubscribeThrowing = subscribeOpenCodeServerEvents({
      eventClient: eventClient as never,
      directory: "/repo",
      onEvent: () => {
        throw new Error("listener failed");
      },
    });
    const unsubscribeSibling = subscribeOpenCodeServerEvents({
      eventClient: eventClient as never,
      directory: "/repo",
      onEvent: sibling,
    });

    await vi.waitFor(() => expect(sibling).toHaveBeenCalledWith(serverConnectedEvent()));
    expect(error).toHaveBeenCalledWith(
      "[opencode] event subscriber failed:",
      expect.objectContaining({ message: "listener failed" }),
    );

    unsubscribeThrowing();
    unsubscribeSibling();
    error.mockRestore();
  });

  it("reacquires the shared server when its process exits", async () => {
    let notifyServerExit!: () => void;
    const firstDispose = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const secondDispose = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const firstEvent = emptyEventClient();
    const secondEvent = emptyEventClient();
    const promptAsync = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    mocks.acquireOpenCodeServer
      .mockResolvedValueOnce({
        eventClient: firstEvent,
        client: {
          command: { list: vi.fn<() => Promise<{ data: [] }>>().mockResolvedValue({ data: [] }) },
          session: {
            create: vi
              .fn<() => Promise<{ data: { id: string } }>>()
              .mockResolvedValue({ data: { id: "ses_recover" } }),
          },
        },
        baseUrl: "http://127.0.0.1:1",
        handle: {},
        onServerExit: (callback: () => void) => {
          notifyServerExit = callback;
          return vi.fn<() => void>();
        },
        dispose: firstDispose,
      })
      .mockResolvedValueOnce({
        eventClient: secondEvent,
        client: { session: { promptAsync } },
        baseUrl: "http://127.0.0.1:2",
        handle: {},
        onServerExit: () => vi.fn<() => void>(),
        dispose: secondDispose,
      });

    const session = await OpencodeSdkSession.create({
      threadId: "thread-recover",
      projectLocation,
      config,
      presentationMode: "gui",
    });

    await session.activate();
    await session.openThread(config);
    notifyServerExit();
    await vi.waitFor(() => expect(mocks.acquireOpenCodeServer).toHaveBeenCalledTimes(2));

    expect(firstDispose).toHaveBeenCalledTimes(1);
    expect(secondEvent.global.event).toHaveBeenCalledTimes(1);
    await session.startTurn("after restart", config);
    expect(promptAsync).toHaveBeenCalledWith(expect.objectContaining({ sessionID: "ses_recover" }));

    await session.dispose();
    expect(secondDispose).toHaveBeenCalledTimes(1);
  });

  it("joins the shared pool and forwards the MCP set", async () => {
    const dispose = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    mocks.acquireOpenCodeServer.mockResolvedValue({
      eventClient: emptyEventClient(),
      client: {
        command: { list: vi.fn<() => Promise<{ data: [] }>>().mockResolvedValue({ data: [] }) },
        session: {
          create: vi
            .fn<() => Promise<{ data: { id: string } }>>()
            .mockResolvedValue({ data: { id: "ses_host" } }),
        },
      },
      baseUrl: "http://127.0.0.1:0",
      handle: {},
      dispose,
    });

    const mcpServers = [
      {
        id: "browser",
        name: "browser",
        timeoutMs: 30_000,
        transport: {
          type: "http" as const,
          url: "http://127.0.0.1:9500/mcp",
          headers: {},
        },
      },
    ];
    const session = await OpencodeSdkSession.create({
      threadId: "thread-host-42",
      projectLocation,
      config,
      presentationMode: "gui",
      mcpServers,
    });

    await session.activate();

    expect(mocks.acquireOpenCodeServer).toHaveBeenCalledWith(
      expect.objectContaining({ projectLocation, mcpServers }),
    );

    await session.dispose();
  });

  it("joins the shared pool with no MCP set when none is provided", async () => {
    const dispose = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    mocks.acquireOpenCodeServer.mockResolvedValue({
      eventClient: emptyEventClient(),
      client: {
        command: { list: vi.fn<() => Promise<{ data: [] }>>().mockResolvedValue({ data: [] }) },
        session: {
          create: vi
            .fn<() => Promise<{ data: { id: string } }>>()
            .mockResolvedValue({ data: { id: "ses_plain" } }),
        },
      },
      baseUrl: "http://127.0.0.1:0",
      handle: {},
      dispose,
    });

    const session = await OpencodeSdkSession.create({
      threadId: "thread-plain",
      projectLocation,
      config,
      presentationMode: "gui",
    });

    await session.activate();

    const input = mocks.acquireOpenCodeServer.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(input.mcpServers).toBeUndefined();

    await session.dispose();
  });

  it("stores a new MCP set via updateMcpServers without acquiring before activation", async () => {
    const session = await OpencodeSdkSession.create({
      threadId: "thread-lazy-mcp",
      projectLocation,
      config,
      presentationMode: "gui",
    });

    const newMcpServers = [
      {
        id: "browser",
        name: "browser",
        timeoutMs: 300_000,
        transport: { type: "http" as const, url: "http://127.0.0.1:9501/mcp", headers: {} },
      },
    ];

    await session.updateMcpServers(newMcpServers);

    expect(mocks.acquireOpenCodeServer).not.toHaveBeenCalled();
  });

  it("updates the active directory MCP set without re-acquiring", async () => {
    const dispose = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const updateMcpServers = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    mocks.acquireOpenCodeServer.mockResolvedValue({
      eventClient: emptyEventClient(),
      client: {
        command: { list: vi.fn<() => Promise<{ data: [] }>>().mockResolvedValue({ data: [] }) },
        session: {
          create: vi
            .fn<() => Promise<{ data: { id: string } }>>()
            .mockResolvedValue({ data: { id: "ses_first" } }),
        },
      },
      baseUrl: "http://127.0.0.1:1",
      handle: {},
      updateMcpServers,
      dispose,
    });

    const initialMcpServers = [
      {
        id: "browser",
        name: "browser",
        timeoutMs: 300_000,
        transport: { type: "http" as const, url: "http://127.0.0.1:9501/mcp", headers: {} },
      },
    ];
    const session = await OpencodeSdkSession.create({
      threadId: "thread-reacquire-mcp",
      projectLocation,
      config,
      presentationMode: "gui",
      mcpServers: initialMcpServers,
    });

    await session.activate();
    expect(mocks.acquireOpenCodeServer).toHaveBeenCalledTimes(1);

    const newMcpServers = [
      {
        id: "chrome",
        name: "chrome",
        timeoutMs: 300_000,
        transport: { type: "http" as const, url: "http://127.0.0.1:9502/mcp", headers: {} },
      },
    ];
    await session.updateMcpServers(newMcpServers);

    expect(updateMcpServers).toHaveBeenCalledWith(newMcpServers);
    expect(mocks.acquireOpenCodeServer).toHaveBeenCalledTimes(1);
    expect(dispose).not.toHaveBeenCalled();

    await session.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("stores the created session id in launch options for terminal TUI handoff", async () => {
    const dispose = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    mocks.acquireOpenCodeServer.mockResolvedValue({
      client: {
        global: { event: vi.fn<() => Promise<{ stream: AsyncGenerator<Event> }>>() },
        command: { list: vi.fn<() => Promise<{ data: [] }>>().mockResolvedValue({ data: [] }) },
        session: {
          create: vi
            .fn<() => Promise<{ data: { id: string } }>>()
            .mockResolvedValue({ data: { id: "ses_created" } }),
        },
      },
      baseUrl: "http://127.0.0.1:0",
      handle: {},
      dispose,
    });

    const session = await OpencodeSdkSession.create({
      threadId: "thread-opencode",
      projectLocation,
      config,
      presentationMode: "terminal",
    });

    await session.activate();
    await expect(session.openThread(config)).resolves.toBe("ses_created");

    expect(session.launchOptions.resumeThreadId).toBe("ses_created");

    await session.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("restarts the OpenCode server once when session.create loses its connection", async () => {
    const firstDispose = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const secondDispose = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const firstCreate = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValue(new Error("fetch failed"));
    const secondCreate = vi
      .fn<() => Promise<{ data: { id: string } }>>()
      .mockResolvedValue({ data: { id: "ses_retry" } });
    const commandList = vi.fn<() => Promise<{ data: [] }>>().mockResolvedValue({ data: [] });
    mocks.acquireOpenCodeServer
      .mockResolvedValueOnce({
        client: {
          global: { event: vi.fn<() => Promise<{ stream: AsyncGenerator<Event> }>>() },
          command: { list: commandList },
          session: { create: firstCreate },
        },
        baseUrl: "http://127.0.0.1:1",
        handle: { formatOutput: () => "first server output" },
        dispose: firstDispose,
      })
      .mockResolvedValueOnce({
        client: {
          global: { event: vi.fn<() => Promise<{ stream: AsyncGenerator<Event> }>>() },
          command: { list: commandList },
          session: { create: secondCreate },
        },
        baseUrl: "http://127.0.0.1:2",
        handle: { formatOutput: () => "" },
        dispose: secondDispose,
      });

    const session = await OpencodeSdkSession.create({
      threadId: "thread-opencode",
      projectLocation,
      config,
      presentationMode: "terminal",
    });
    session.setListener({
      onClose: () => {},
      onError: () => {},
      onUpdate: () => {},
      onRuntimeEvent: () => {},
    });

    await session.activate();
    await expect(session.openThread(config)).resolves.toBe("ses_retry");

    expect(mocks.acquireOpenCodeServer).toHaveBeenCalledTimes(2);
    expect(firstDispose).toHaveBeenCalledTimes(1);
    expect(firstCreate).toHaveBeenCalledTimes(1);
    expect(secondCreate).toHaveBeenCalledTimes(1);

    await session.dispose();
    expect(secondDispose).toHaveBeenCalledTimes(1);
  });

  it("routes directory events and drops server-wide and sync envelopes", async () => {
    const updates: StructuredSessionUpdate[] = [];
    const runtimeEvents: RuntimeEvent[] = [];
    const wrappedEvents = [
      { payload: serverConnectedEvent() },
      {
        payload: {
          id: "evt-heartbeat",
          type: "server.heartbeat",
          properties: {},
        },
      },
      {
        directory: "/other-repo",
        payload: {
          id: "evt-wrong-directory",
          type: "session.status",
          properties: { sessionID: "ses_test", status: { type: "busy" } },
        },
      },
      {
        directory: "/repo",
        payload: {
          id: "evt-other",
          type: "session.status",
          properties: { sessionID: "ses_other", status: { type: "busy" } },
        },
      },
      {
        directory: "/repo",
        payload: {
          id: "evt-busy",
          type: "session.status",
          properties: { sessionID: "ses_test", status: { type: "busy" } },
        },
      },
      {
        directory: "/repo",
        payload: {
          type: "sync",
          syncEvent: {
            type: "message.updated.1",
            id: "evt-sync",
            seq: 0,
            aggregateID: "sessionID",
            data: {
              sessionID: "ses_test",
              info: {
                id: "msg_sync",
                parentID: "msg_user",
                sessionID: "ses_test",
                role: "assistant",
                mode: "build",
                agent: "build",
                path: { cwd: "/repo", root: "/repo" },
                cost: 0,
                tokens: {
                  input: 0,
                  output: 0,
                  reasoning: 0,
                  cache: { read: 0, write: 0 },
                },
                modelID: "big-pickle",
                providerID: "opencode",
                time: { created: 0 },
              },
            },
          },
          id: "evt-sync",
        },
      },
      {
        directory: "/repo",
        payload: {
          id: "evt-msg",
          type: "message.updated",
          properties: {
            sessionID: "ses_test",
            info: {
              id: "msg_asst",
              parentID: "msg_user",
              sessionID: "ses_test",
              role: "assistant",
              mode: "build",
              agent: "build",
              path: { cwd: "/repo", root: "/repo" },
              cost: 0,
              tokens: {
                input: 0,
                output: 0,
                reasoning: 0,
                cache: { read: 0, write: 0 },
              },
              modelID: "big-pickle",
              providerID: "opencode",
              time: { created: 0 },
            },
          },
        },
      },
      {
        directory: "/repo",
        payload: {
          id: "evt-part",
          type: "message.part.updated",
          properties: {
            sessionID: "ses_test",
            time: 0,
            part: {
              id: "prt_asst",
              sessionID: "ses_test",
              messageID: "msg_asst",
              type: "text",
              text: "Hi",
            },
          },
        },
      },
      {
        directory: "/repo",
        payload: {
          id: "evt-idle",
          type: "session.idle",
          properties: { sessionID: "ses_test" },
        },
      },
    ];
    const globalEvent = vi
      .fn<() => Promise<{ stream: AsyncGenerator<unknown> }>>()
      .mockResolvedValue({
        stream: streamOf(...wrappedEvents),
      });

    mocks.acquireOpenCodeServer.mockResolvedValue({
      eventClient: { global: { event: globalEvent } },
      client: {
        command: { list: vi.fn<() => Promise<{ data: [] }>>().mockResolvedValue({ data: [] }) },
        session: {
          create: vi
            .fn<() => Promise<{ data: { id: string } }>>()
            .mockResolvedValue({ data: { id: "ses_test" } }),
        },
      },
      baseUrl: "http://127.0.0.1:0",
      handle: {},
      dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    });

    const session = await OpencodeSdkSession.create({
      threadId: "thread-opencode",
      projectLocation,
      config,
      presentationMode: "gui",
    });
    session.setListener({
      onClose: () => {},
      onError: () => {},
      onUpdate: (update) => updates.push(update),
      onRuntimeEvent: (event) => runtimeEvents.push(event),
    });

    await session.activate();
    await session.openThread(config);

    await vi.waitFor(() => {
      expect(runtimeEvents.some((event) => event.type === "content.delta")).toBe(true);
    });

    expect(
      runtimeEvents.filter(
        (event) => event.type === "item.started" && event.itemType === "assistant_message",
      ),
    ).toHaveLength(1);
    expect(
      runtimeEvents.find(
        (event) =>
          event.type === "content.delta" &&
          event.stream === "assistant_text" &&
          event.delta === "Hi",
      ),
    ).toBeDefined();
    expect(updates.filter((update) => update.status === "working")).toHaveLength(1);
    expect(updates.some((update) => update.status === "idle")).toBe(true);

    await session.dispose();
  });

  it("surfaces OpenCode command-list entries as slash commands", async () => {
    const updates: StructuredSessionUpdate[] = [];
    const commandList = vi
      .fn<
        (input?: unknown) => Promise<{
          data: Array<{ name: string; description: string; hints: string[]; template: string }>;
        }>
      >()
      .mockResolvedValue({
        data: [
          {
            name: "review",
            description: "Review the current diff",
            hints: ["<scope>"],
            template: "",
          },
        ],
      });

    mocks.acquireOpenCodeServer.mockResolvedValue({
      client: {
        command: { list: commandList },
        session: {
          create: vi
            .fn<() => Promise<{ data: { id: string } }>>()
            .mockResolvedValue({ data: { id: "ses_test" } }),
        },
      },
      baseUrl: "http://127.0.0.1:0",
      handle: {},
      dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    });

    const session = await OpencodeSdkSession.create({
      threadId: "thread-opencode",
      projectLocation,
      config,
      presentationMode: "terminal",
    });
    session.setListener({
      onClose: () => {},
      onError: () => {},
      onUpdate: (update) => updates.push(update),
      onRuntimeEvent: () => {},
    });

    await session.activate();
    await session.openThread(config);

    expect(commandList).toHaveBeenCalledTimes(1);
    expect(commandList).toHaveBeenCalledWith({ directory: "/repo" });
    expect(updates).toContainEqual(
      expect.objectContaining({
        slashCommands: [
          {
            id: "review",
            label: "review — Review the current diff",
            description: "Review the current diff",
            argumentHint: "<scope>",
          },
        ],
      }),
    );
  });

  it("records single-question option replies as question answer events", async () => {
    const runtimeEvents: RuntimeEvent[] = [];
    const updates: StructuredSessionUpdate[] = [];
    const questionReply = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    let releaseQuestionEvent!: () => void;
    const waitForSession = new Promise<void>((resolve) => {
      releaseQuestionEvent = resolve;
    });
    const globalEvent = vi
      .fn<() => Promise<{ stream: AsyncGenerator<unknown> }>>()
      .mockResolvedValue({
        stream: (async function* () {
          yield { payload: serverConnectedEvent() };
          await waitForSession;
          yield {
            directory: "/repo",
            payload: {
              id: "evt-question",
              type: "question.asked",
              properties: {
                id: "req1",
                sessionID: "ses_test",
                questions: [
                  {
                    header: "Scope",
                    question: "Which scope should I use?",
                    options: [{ label: "Scope A" }, { label: "Scope B" }],
                  },
                ],
              },
            },
          };
        })(),
      });

    mocks.acquireOpenCodeServer.mockResolvedValue({
      eventClient: { global: { event: globalEvent } },
      client: {
        command: { list: vi.fn<() => Promise<{ data: [] }>>().mockResolvedValue({ data: [] }) },
        question: {
          reply: questionReply,
          reject: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        },
        session: {
          create: vi
            .fn<() => Promise<{ data: { id: string } }>>()
            .mockResolvedValue({ data: { id: "ses_test" } }),
        },
      },
      baseUrl: "http://127.0.0.1:0",
      handle: {},
      dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    });

    const session = await OpencodeSdkSession.create({
      threadId: "thread-opencode",
      projectLocation,
      config,
      presentationMode: "gui",
    });
    session.setListener({
      onClose: () => {},
      onError: () => {},
      onUpdate: (update) => updates.push(update),
      onRuntimeEvent: (event) => runtimeEvents.push(event),
    });

    await session.activate();
    await session.openThread(config);
    releaseQuestionEvent();

    await vi.waitFor(() => {
      expect(runtimeEvents.some((event) => event.type === "request.opened")).toBe(true);
    });
    expect(updates).toContainEqual(
      expect.objectContaining({ status: "needs_reply", attention: "needs_reply" }),
    );

    await session.resolveServerRequest("opencode-q-req1", { optionId: "q0.1" });

    expect(questionReply).toHaveBeenCalledWith({
      directory: "/repo",
      requestID: "req1",
      answers: [["Scope B"]],
    });
    expect(
      runtimeEvents.find(
        (event) => event.type === "item.started" && event.itemType === "question_answer",
      ),
    ).toMatchObject({
      payload: {
        questions: [
          {
            header: "Scope",
            question: "Which scope should I use?",
            selected: [{ label: "Scope B" }],
          },
        ],
      },
    });
    expect(updates.at(-1)).toMatchObject({ status: "working", attention: "working" });

    await session.dispose();
  });

  it("omits a session permission override in supervised mode", async () => {
    const create = vi
      .fn<(input: unknown) => Promise<{ data: { id: string } }>>()
      .mockResolvedValue({ data: { id: "ses_test" } });

    mocks.acquireOpenCodeServer.mockResolvedValue({
      client: {
        command: { list: vi.fn<() => Promise<{ data: [] }>>().mockResolvedValue({ data: [] }) },
        session: { create },
      },
      baseUrl: "http://127.0.0.1:0",
      handle: {},
      dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    });

    const session = await OpencodeSdkSession.create({
      threadId: "thread-opencode",
      projectLocation,
      config: { ...config, approvalPolicy: "default" },
      presentationMode: "terminal",
    });

    await session.activate();
    await session.openThread({ ...config, approvalPolicy: "default" });

    expect(create).toHaveBeenCalledWith({
      directory: "/repo",
      title: "poracode/thread-o",
    });
  });

  it("passes an allow-all session permission override in full access mode", async () => {
    const create = vi
      .fn<(input: unknown) => Promise<{ data: { id: string } }>>()
      .mockResolvedValue({ data: { id: "ses_test" } });

    mocks.acquireOpenCodeServer.mockResolvedValue({
      client: {
        command: { list: vi.fn<() => Promise<{ data: [] }>>().mockResolvedValue({ data: [] }) },
        session: { create },
      },
      baseUrl: "http://127.0.0.1:0",
      handle: {},
      dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    });

    const session = await OpencodeSdkSession.create({
      threadId: "thread-opencode",
      projectLocation,
      config: { ...config, approvalPolicy: "yolo" },
      presentationMode: "terminal",
    });

    await session.activate();
    await session.openThread({ ...config, approvalPolicy: "yolo" });

    expect(create).toHaveBeenCalledWith({
      directory: "/repo",
      title: "poracode/thread-o",
      permission: [{ permission: "*", pattern: "*", action: "allow" }],
    });
  });

  it("updates the same session to full access before a later turn", async () => {
    const update = vi
      .fn<(input: unknown) => Promise<{ data: unknown }>>()
      .mockResolvedValue({ data: {} });
    const promptAsync = vi
      .fn<(input: unknown) => Promise<{ data: unknown }>>()
      .mockResolvedValue({ data: {} });

    mocks.acquireOpenCodeServer.mockResolvedValue({
      client: {
        command: { list: vi.fn<() => Promise<{ data: [] }>>().mockResolvedValue({ data: [] }) },
        session: {
          create: vi
            .fn<(input: unknown) => Promise<{ data: { id: string } }>>()
            .mockResolvedValue({ data: { id: "ses_test" } }),
          update,
          promptAsync,
        },
      },
      baseUrl: "http://127.0.0.1:0",
      handle: {},
      dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    });

    const session = await OpencodeSdkSession.create({
      threadId: "thread-opencode",
      projectLocation,
      config: { ...config, approvalPolicy: "default" },
      presentationMode: "terminal",
    });

    await session.activate();
    await session.openThread({ ...config, approvalPolicy: "default" });
    await session.startTurn("ship it", { ...config, approvalPolicy: "yolo" });

    expect(update).toHaveBeenCalledWith({
      directory: "/repo",
      sessionID: "ses_test",
      permission: [{ permission: "*", pattern: "*", action: "allow" }],
    });
    expect(promptAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionID: "ses_test",
        parts: [{ type: "text", text: "ship it" }],
      }),
    );
  });

  it("steers through OpenCode's server-owned queue without aborting the active turn", async () => {
    const abort = vi.fn<() => Promise<{ data: boolean }>>().mockResolvedValue({ data: true });
    const promptAsync = vi
      .fn<(input: unknown) => Promise<{ data: unknown }>>()
      .mockResolvedValue({ data: {} });

    mocks.acquireOpenCodeServer.mockResolvedValue({
      eventClient: emptyEventClient(),
      client: {
        command: { list: vi.fn<() => Promise<{ data: [] }>>().mockResolvedValue({ data: [] }) },
        session: {
          create: vi
            .fn<(input: unknown) => Promise<{ data: { id: string } }>>()
            .mockResolvedValue({ data: { id: "ses_steer" } }),
          abort,
          promptAsync,
        },
      },
      baseUrl: "http://127.0.0.1:0",
      handle: {},
      dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    });

    const session = await OpencodeSdkSession.create({
      threadId: "thread-opencode-steer",
      projectLocation,
      config: { ...config, approvalPolicy: "yolo" },
      presentationMode: "gui",
    });
    session.setListener({
      onClose: () => {},
      onError: () => {},
      onUpdate: () => {},
      onRuntimeEvent: () => {},
    });

    await session.activate();
    await session.openThread({ ...config, approvalPolicy: "yolo" });
    await session.startTurn("first", { ...config, approvalPolicy: "yolo" });
    await session.steerTurn!(
      "steer ",
      {
        model: "opencode-go/kimi-k3",
        mode: "plan",
        effort: "high",
        approvalPolicy: "yolo",
      },
      [
        { kind: "text", content: "steer " },
        { kind: "attachment", path: "reference.png", mimeType: "image/png" },
      ],
      { inlineInstructions: "follow the reference" },
    );

    expect(abort).not.toHaveBeenCalled();
    expect(promptAsync).toHaveBeenCalledTimes(2);
    expect(promptAsync).toHaveBeenLastCalledWith({
      directory: "/repo",
      sessionID: "ses_steer",
      model: { modelID: "kimi-k3", providerID: "opencode-go" },
      agent: "plan",
      variant: "high",
      parts: [
        { type: "text", text: "steer " },
        {
          type: "file",
          mime: "image/png",
          filename: "reference.png",
          url: "file:///repo/reference.png",
        },
        { type: "text", text: "follow the reference" },
      ],
    });

    await session.dispose();
  });

  it("uses the current OpenCode config when an in-flight steer does not change it", async () => {
    const promptAsync = vi
      .fn<(input: unknown) => Promise<{ data: unknown }>>()
      .mockResolvedValue({ data: {} });

    mocks.acquireOpenCodeServer.mockResolvedValue({
      client: {
        command: { list: vi.fn<() => Promise<{ data: [] }>>().mockResolvedValue({ data: [] }) },
        session: {
          create: vi
            .fn<(input: unknown) => Promise<{ data: { id: string } }>>()
            .mockResolvedValue({ data: { id: "ses_steer" } }),
          promptAsync,
        },
      },
      baseUrl: "http://127.0.0.1:0",
      handle: {},
      dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    });

    const session = await OpencodeSdkSession.create({
      threadId: "thread-opencode-steer-unchanged",
      projectLocation,
      config,
      presentationMode: "terminal",
    });
    await session.activate();
    await session.openThread(config);
    await session.steerTurn!("keep going", config);

    expect(promptAsync).toHaveBeenCalledWith({
      directory: "/repo",
      sessionID: "ses_steer",
      model: { modelID: "big-pickle", providerID: "opencode" },
      parts: [{ type: "text", text: "keep going" }],
    });

    await session.dispose();
  });

  it("keeps disabled Crossagents tools denied in full access mode", async () => {
    const update = vi
      .fn<(input: unknown) => Promise<{ data: unknown }>>()
      .mockResolvedValue({ data: {} });
    const promptAsync = vi
      .fn<(input: unknown) => Promise<{ data: unknown }>>()
      .mockResolvedValue({ data: {} });

    mocks.acquireOpenCodeServer.mockResolvedValue({
      client: {
        command: { list: vi.fn<() => Promise<{ data: [] }>>().mockResolvedValue({ data: [] }) },
        session: {
          create: vi
            .fn<(input: unknown) => Promise<{ data: { id: string } }>>()
            .mockResolvedValue({ data: { id: "ses_test" } }),
          update,
          promptAsync,
        },
      },
      baseUrl: "http://127.0.0.1:0",
      handle: {},
      dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    });

    const session = await OpencodeSdkSession.create({
      threadId: "thread-opencode",
      projectLocation,
      config: { ...config, approvalPolicy: "yolo" },
      presentationMode: "terminal",
      mcpServers: [
        {
          id: "crossagents",
          name: "crossagents",
          timeoutMs: 30_000,
          disabledTools: ["spawn_agent"],
          transport: { type: "http", url: "http://127.0.0.1:4321/mcp", headers: {} },
        },
      ],
    });

    await session.activate();
    await session.openThread({ ...config, approvalPolicy: "yolo" });
    await session.startTurn("ship it", { ...config, approvalPolicy: "yolo" });

    expect(update).toHaveBeenCalledWith({
      directory: "/repo",
      sessionID: "ses_test",
      permission: [
        { permission: "*", pattern: "*", action: "allow" },
        { permission: "crossagents_spawn_agent", pattern: "*", action: "deny" },
      ],
    });
    expect(promptAsync).toHaveBeenCalledTimes(1);
  });

  it("resolves WSL relative file mentions to Linux file URLs", async () => {
    const promptAsync = vi
      .fn<(input: unknown) => Promise<{ data: unknown }>>()
      .mockResolvedValue({ data: {} });
    const wslProject: ProjectLocation = {
      kind: "wsl",
      distro: "Ubuntu",
      uncPath: "\\\\wsl$\\Ubuntu\\home\\demo\\repo",
      linuxPath: "/home/demo/repo",
    };

    mocks.acquireOpenCodeServer.mockResolvedValue({
      client: {
        command: { list: vi.fn<() => Promise<{ data: [] }>>().mockResolvedValue({ data: [] }) },
        session: {
          create: vi
            .fn<(input: unknown) => Promise<{ data: { id: string } }>>()
            .mockResolvedValue({ data: { id: "ses_test" } }),
          promptAsync,
        },
      },
      baseUrl: "http://127.0.0.1:0",
      handle: {},
      dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    });

    const session = await OpencodeSdkSession.create({
      threadId: "thread-opencode",
      projectLocation: wslProject,
      config,
      presentationMode: "terminal",
    });

    await session.activate();
    await session.openThread(config);
    await session.startTurn("inspect file", config, [{ kind: "file", path: "src/main.ts" }]);

    expect(promptAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: "/home/demo/repo",
        sessionID: "ses_test",
        parts: [
          {
            type: "file",
            mime: "text/plain",
            filename: "main.ts",
            url: "file:///home/demo/repo/src/main.ts",
          },
        ],
      }),
    );
  });

  it("retries media-type rejections with text fallback without surfacing the first error", async () => {
    const promptAsync = vi.fn<(input: unknown) => Promise<{ data: unknown }>>();
    promptAsync
      .mockRejectedValueOnce(
        new Error("file part media type image/bmp functionality not supported"),
      )
      .mockResolvedValue({ data: {} });

    mocks.acquireOpenCodeServer.mockResolvedValue({
      client: {
        command: { list: vi.fn<() => Promise<{ data: [] }>>().mockResolvedValue({ data: [] }) },
        session: {
          create: vi
            .fn<(input: unknown) => Promise<{ data: { id: string } }>>()
            .mockResolvedValue({ data: { id: "ses_test" } }),
          promptAsync,
        },
      },
      baseUrl: "http://127.0.0.1:0",
      handle: {},
      dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    });

    const session = await OpencodeSdkSession.create({
      threadId: "thread-opencode",
      projectLocation,
      config,
      presentationMode: "terminal",
    });

    await session.activate();
    await session.openThread(config);

    await expect(
      session.startTurn("inspect image", config, [
        { kind: "text", content: "inspect " },
        { kind: "attachment", path: "/tmp/screenshot.bmp", mimeType: "image/bmp" },
      ]),
    ).resolves.toBeUndefined();

    expect(promptAsync).toHaveBeenCalledTimes(2);
    expect(promptAsync).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        parts: [
          { type: "text", text: "inspect " },
          { type: "text", text: "Attached file could not be sent: /tmp/screenshot.bmp" },
        ],
      }),
    );
  });

  it("restores supervised permissions on the same session before a later turn", async () => {
    const update = vi
      .fn<(input: unknown) => Promise<{ data: unknown }>>()
      .mockResolvedValue({ data: {} });
    const promptAsync = vi
      .fn<(input: unknown) => Promise<{ data: unknown }>>()
      .mockResolvedValue({ data: {} });
    const agentPermission = [{ permission: "bash", pattern: "*", action: "ask" as const }];

    mocks.acquireOpenCodeServer.mockResolvedValue({
      client: {
        app: {
          agents: vi
            .fn<
              () => Promise<{ data: Array<{ name: string; permission: typeof agentPermission }> }>
            >()
            .mockResolvedValue({ data: [{ name: "build", permission: agentPermission }] }),
        },
        command: { list: vi.fn<() => Promise<{ data: [] }>>().mockResolvedValue({ data: [] }) },
        session: {
          create: vi
            .fn<(input: unknown) => Promise<{ data: { id: string } }>>()
            .mockResolvedValue({ data: { id: "ses_test" } }),
          update,
          promptAsync,
        },
      },
      baseUrl: "http://127.0.0.1:0",
      handle: {},
      dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    });

    const session = await OpencodeSdkSession.create({
      threadId: "thread-opencode",
      projectLocation,
      config: { ...config, approvalPolicy: "yolo" },
      presentationMode: "terminal",
    });

    await session.activate();
    await session.openThread({ ...config, approvalPolicy: "yolo" });
    await session.startTurn("be careful", { ...config, approvalPolicy: "default" });

    expect(update).toHaveBeenCalledWith({
      directory: "/repo",
      sessionID: "ses_test",
      permission: agentPermission,
    });
    expect(promptAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionID: "ses_test",
        parts: [{ type: "text", text: "be careful" }],
      }),
    );
  });
});

describe("parseOpenCodeQuestionAnswers", () => {
  it("translates structured form answers back to OpenCode answer rows", () => {
    expect(
      parseOpenCodeQuestionAnswers(
        {
          answers: {
            q0: "q0.1",
            q1: "q1.0",
          },
        },
        {
          answerKeys: ["q0", "q1"],
          optionValues: {
            "q0.0": "Scope A",
            "q0.1": "Scope B",
            "q1.0": "After each phase",
          },
        },
      ),
    ).toEqual([["Scope B"], ["After each phase"]]);
  });

  it("keeps multi-select rows grouped by question", () => {
    expect(
      parseOpenCodeQuestionAnswers(
        {
          answers: {
            q0: ["q0.0", "q0.1"],
            q1: "custom answer",
          },
        },
        {
          answerKeys: ["q0", "q1"],
          optionValues: {
            "q0.0": "React",
            "q0.1": "Vue",
          },
        },
      ),
    ).toEqual([["React", "Vue"], ["custom answer"]]);
  });
});
