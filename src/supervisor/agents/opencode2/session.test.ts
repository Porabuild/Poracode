import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChildProcess } from "node:child_process";
import type { ProjectLocation, RuntimeEvent, ThreadConfig } from "@/shared/contracts";
import type { StructuredSessionUpdate } from "../base";
import type { AcquiredOpenCode2Server } from "./client";
import type { OpenCode2Client, V2Event } from "./clientTypes";
import { OpenCode2Session } from "./session";

const mocks = vi.hoisted(() => ({
  acquireOpenCode2Server: vi.fn<(input: unknown) => Promise<unknown>>(),
  subscribeOpenCode2ServerEvents:
    vi.fn<(input: { client: unknown; subscription: unknown }) => () => void>(),
}));

vi.mock("./client", async (importActual) => {
  const actual = await importActual<typeof import("./client")>();
  return { ...actual, acquireOpenCode2Server: mocks.acquireOpenCode2Server };
});

vi.mock("./eventHub", () => ({
  subscribeOpenCode2ServerEvents: mocks.subscribeOpenCode2ServerEvents,
  waitForOpenCode2ServerEvents: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
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

function makeClient(): OpenCode2Client {
  return {
    session: {
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
    plugin: { awaitActivation: vi.fn<() => Promise<void>>().mockResolvedValue(undefined) },
    agent: { list: vi.fn<() => Promise<{ data: unknown[] }>>().mockResolvedValue({ data: [] }) },
    skill: { list: vi.fn<() => Promise<{ data: unknown[] }>>().mockResolvedValue({ data: [] }) },
    command: { list: vi.fn<() => Promise<{ data: unknown[] }>>().mockResolvedValue({ data: [] }) },
    permission: {
      list: vi.fn<() => Promise<unknown>>().mockResolvedValue([]),
      rules: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      reply: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    },
    form: {
      list: vi.fn<() => Promise<unknown>>().mockResolvedValue([]),
      reply: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      cancel: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    },
    mcp: {
      add: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      remove: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    },
  } as unknown as OpenCode2Client;
}

function makeAcquired(
  client: OpenCode2Client,
  options?: { child?: ChildProcess },
): {
  acquired: AcquiredOpenCode2Server;
  onServerExit: (callback: () => void) => () => void;
} {
  const exits = new Set<() => void>();
  const onServerExit = (callback: () => void) => {
    exits.add(callback);
    return () => exits.delete(callback);
  };
  const acquired = {
    client,
    baseUrl: "http://127.0.0.1:4600",
    handle: {
      child: options?.child ?? (new EventEmitter() as ChildProcess),
      baseUrl: Promise.resolve("http://127.0.0.1:4600"),
      password: Promise.resolve("pw"),
      formatOutput: () => "",
      dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    },
    onServerExit,
    updateMcpServers: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  } as unknown as AcquiredOpenCode2Server & { dispose: ReturnType<typeof vi.fn> };
  return { acquired, onServerExit };
}

interface Harness {
  session: OpenCode2Session;
  client: OpenCode2Client;
  subscription: CapturedSubscription | undefined;
  updates: StructuredSessionUpdate[];
  events: RuntimeEvent[];
  errors: string[];
}

async function makeSession(options?: {
  client?: OpenCode2Client;
  acquired?: AcquiredOpenCode2Server;
  presentationMode?: "gui" | "terminal";
}): Promise<Harness> {
  const client = options?.client ?? makeClient();
  const acquired = options?.acquired ?? (makeAcquired(client).acquired as AcquiredOpenCode2Server);
  if (!options?.acquired) {
    mocks.acquireOpenCode2Server.mockResolvedValue(acquired);
  }

  let subscription: CapturedSubscription | undefined;
  mocks.subscribeOpenCode2ServerEvents.mockImplementation((input) => {
    subscription = input.subscription as CapturedSubscription;
    return () => {};
  });

  const session = await OpenCode2Session.create({
    threadId: "thread-abc12345",
    projectLocation,
    config,
    presentationMode: options?.presentationMode ?? "gui",
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
  await session.openThread(config);

  return { session, client, subscription, updates, events, errors };
}

type OpenCode2ServerOverrides = Record<string, unknown>;

function makeClientWith(overrides: OpenCode2ServerOverrides): OpenCode2Client {
  const client = makeClient() as unknown as Record<string, any>;
  for (const [path, value] of Object.entries(overrides)) {
    const [group, method] = path.split(".");
    if (!group || !method) continue;
    client[group] = {
      ...(client[group] as Record<string, unknown> | undefined),
      [method]: value,
    };
  }
  return client as OpenCode2Client;
}

describe("OpenCode2Session", () => {
  beforeEach(() => {
    mocks.acquireOpenCode2Server.mockReset();
    mocks.subscribeOpenCode2ServerEvents.mockReset();
    eventSeq = 0;
  });

  it("hydrates a resumed approval before the listener attaches", async () => {
    const client = makeClient();
    mocks.acquireOpenCode2Server.mockResolvedValue(makeAcquired(client).acquired);
    vi.mocked(client.session.active).mockResolvedValue({ ses_resume: { type: "running" } });
    vi.mocked(client.permission.list).mockResolvedValue([
      { id: "resume", sessionID: "ses_resume", action: "shell", resources: ["pwd"] },
    ]);
    const session = await OpenCode2Session.create({
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
      expect.objectContaining({ type: "request.opened", requestId: "opencode2-perm-resume" }),
    );
    expect(updates.at(-1)?.status).toBe("needs_approval");
    await session.resolveServerRequest("opencode2-perm-resume", { decision: "reject" });
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
        requestId: "opencode2-perm-child-approval",
      }),
    );
    await harness.session.resolveServerRequest("opencode2-perm-child-approval", {
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
      expect.objectContaining({ type: "request.opened", requestId: "opencode2-perm-p" }),
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
    expect(session.ownsProviderSession("ses_new")).toBe(true);
    expect(session.ownsProviderSession("ses_other")).toBe(false);
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
    expect(client.permission.rules).toHaveBeenLastCalledWith({
      sessionID: "ses_resume",
      permissions: [
        { action: "*", resource: "*", effect: "ask" },
        { action: "question", resource: "*", effect: "allow" },
      ],
    });
    expect(mocks.subscribeOpenCode2ServerEvents).not.toHaveBeenCalled();
  });

  it("resumes an existing session without creating one", async () => {
    const { session, client } = await makeSession();
    vi.mocked(client.session.create).mockClear();

    const id = await session.openThread(config, {
      providerSessionId: "ses_resume",
      discoveredAt: "2026-01-01T00:00:00.000Z",
    });

    expect(id).toBe("ses_resume");
    expect(client.session.get).toHaveBeenCalledWith({ sessionID: "ses_resume" });
    expect(client.session.create).not.toHaveBeenCalled();
    expect(session.launchOptions.resumeThreadId).toBe("ses_resume");
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
    vi.mocked(client.form.reply).mockRejectedValueOnce(new Error("network unavailable"));
    await expect(
      session.resolveServerRequest("opencode2-form-retry", { answers: { answer: "yes" } }),
    ).rejects.toThrow("network unavailable");
    await session.resolveServerRequest("opencode2-form-retry", { action: "cancel" });
    expect(client.form.cancel).toHaveBeenCalledWith({ sessionID: "ses_new", formID: "retry" });
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
    expect(client.permission.rules).toHaveBeenLastCalledWith({
      sessionID: "ses_new",
      permissions: [
        { action: "*", resource: "*", effect: "allow" },
        { action: "question", resource: "*", effect: "allow" },
      ],
    });
    expect(mocks.acquireOpenCode2Server).toHaveBeenCalledTimes(1);
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
      event("permission.replied", { sessionID: "ses_new", requestID: "pending", reply: "reject" }),
    );
    expect(events.filter((entry) => entry.type === "request.resolved")).toEqual([
      {
        type: "request.resolved",
        threadId: "thread-abc12345",
        requestId: "opencode2-perm-pending",
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
      requestId: "opencode2-perm-perm_1",
      requestType: "command_execution_approval",
    });

    await session.resolveServerRequest("opencode2-perm-perm_1", { decision: "always" });
    expect(client.permission.reply).toHaveBeenCalledWith({
      sessionID,
      requestID: "perm_1",
      reply: "always",
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
      requestId: "opencode2-form-form_1",
      requestType: "tool_user_input",
    });

    await session.resolveServerRequest("opencode2-form-form_1", {
      answers: { env: "prod", tags: ["a", "b"], skip: { nested: true } },
    });
    expect(client.form.reply).toHaveBeenCalledWith({
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
    expect(mocks.acquireOpenCode2Server).toHaveBeenCalledTimes(1);
    const acquired = await mocks.acquireOpenCode2Server.mock.results[0]!.value;
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
      } as AcquiredOpenCode2Server;
      const secondClient = makeClient();
      const second = makeAcquired(secondClient);
      mocks.acquireOpenCode2Server
        .mockResolvedValueOnce(acquiredFirst)
        .mockResolvedValueOnce(second.acquired);

      const harness = await makeSession({ acquired: acquiredFirst });
      const { session, events, errors } = harness;
      expect(mocks.subscribeOpenCode2ServerEvents).toHaveBeenCalledTimes(1);

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
      ).toEqual(active ? [{ requestId: "opencode2-perm-stale", outcome: "cancelled" }] : []);
      expect(harness.updates.at(-1)).toMatchObject({ status: "idle" });
      await vi.waitFor(() => expect(mocks.acquireOpenCode2Server).toHaveBeenCalledTimes(2));
      await vi.waitFor(() => expect(mocks.subscribeOpenCode2ServerEvents).toHaveBeenCalledTimes(2));
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

  it("forwards provider-level MCP updates to the lease", async () => {
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
    const acquired = (await mocks.acquireOpenCode2Server.mock.results[0]!.value) as {
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
  const initialCatalog = updates.find((update) => update.slashCommands?.length)?.slashCommands;
  expect(initialCatalog?.length).toBeGreaterThan(0);
  const onUpdate = vi.fn<(update: StructuredSessionUpdate) => void>();
  session.setListener({ onClose: () => {}, onError: () => {}, onRuntimeEvent: () => {}, onUpdate });
  expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ slashCommands: initialCatalog }));
  await session.dispose();
});
