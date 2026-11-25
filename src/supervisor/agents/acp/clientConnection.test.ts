import { describe, expect, it, vi } from "vitest";
import * as acp from "@agentclientprotocol/sdk/unstable";
import type { AnyMessage } from "@agentclientprotocol/sdk/unstable";
import { connectAcpClient, DELIVERED_SESSION_UPDATE_KINDS } from "./clientConnection";

/** Crossed `TransformStream`s: the agent app and our client talk over real JSON-RPC, in process. */
function loopback(configure?: (app: acp.AgentApp) => void) {
  const clientToAgent = new TransformStream<AnyMessage>();
  const agentToClient = new TransformStream<AnyMessage>();
  const clientStream: acp.Stream = {
    writable: clientToAgent.writable,
    readable: agentToClient.readable,
  };
  const agentStream: acp.Stream = {
    writable: agentToClient.writable,
    readable: clientToAgent.readable,
  };
  // Handlers must be registered before connecting: the connection is built from
  // the app's handler set at connect time.
  const agentApp = acp.agent({ name: "wire-test" });
  configure?.(agentApp);
  const agent = agentApp.connect(agentStream).client;
  return { clientStream, agent, agentApp };
}

const baseHandlers = () => ({
  requestPermission: vi.fn<
    (params: acp.RequestPermissionRequest) => Promise<acp.RequestPermissionResponse>
  >(async () => ({ outcome: { outcome: "cancelled" as const } })),
  sessionUpdate: vi.fn<(params: acp.SessionNotification) => Promise<void>>(async () => {}),
});

const update = (kind: string, body: Record<string, unknown> = {}) => ({
  sessionId: "s-1",
  update: { sessionUpdate: kind, ...body },
});

/** Minimal bodies the 2.x schema accepts, one per delivered kind. */
const KNOWN_UPDATE_BODIES: Record<string, Record<string, unknown>> = {
  agent_message_chunk: { content: { type: "text", text: "hi" } },
  agent_thought_chunk: { content: { type: "text", text: "think" } },
  user_message_chunk: { content: { type: "text", text: "user" } },
  available_commands_update: { availableCommands: [{ name: "plan", description: "d" }] },
  compaction_summary_chunk: { compactionId: "cp-1", content: { type: "text", text: "summary" } },
  compaction_update: { compactionId: "cp-1", status: "in_progress" },
  config_option_update: { configOptions: [] },
  current_mode_update: { currentModeId: "default" },
  plan: { entries: [{ content: "step", priority: "medium", status: "pending" }] },
  plan_removed: { planId: "p-1" },
  plan_update: {
    plan: {
      type: "items",
      planId: "p-1",
      entries: [{ content: "step", priority: "medium", status: "pending" }],
    },
  },
  session_info_update: {},
  tool_call: {
    toolCallId: "c-1",
    title: "run",
    kind: "execute",
    status: "in_progress",
    rawInput: {},
  },
  tool_call_update: { toolCallId: "c-1", status: "completed" },
  usage_update: { used: 1, size: 10 },
};

const NEW_2X_KINDS = [
  "notice",
  "cursor_update",
  "prompt_suggestions_update",
  "session_message",
  "session_message_chunk",
  "subagent_update",
];

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("connectAcpClient", () => {
  it("delivers the fifteen known update kinds and drops the six 2.x ones", async () => {
    const { clientStream, agent } = loopback();
    const handlers = baseHandlers();
    connectAcpClient(clientStream, handlers);

    for (const kind of [...NEW_2X_KINDS, "made_up_vendor_kind"]) {
      await agent.notify(acp.methods.client.session.update, update(kind));
    }
    for (const kind of DELIVERED_SESSION_UPDATE_KINDS) {
      await agent.notify(
        acp.methods.client.session.update,
        update(kind, KNOWN_UPDATE_BODIES[kind]),
      );
    }

    await vi.waitFor(() => expect(handlers.sessionUpdate).toHaveBeenCalledTimes(15));
    const delivered = handlers.sessionUpdate.mock.calls.map(
      ([params]) => (params as { update: { sessionUpdate: string } }).update.sessionUpdate,
    );
    expect(new Set(delivered)).toEqual(new Set(DELIVERED_SESSION_UPDATE_KINDS));
    expect(delivered).not.toContain("made_up_vendor_kind");
    for (const kind of NEW_2X_KINDS) expect(delivered).not.toContain(kind);
  });

  it("keeps _meta and strips unknown fields", async () => {
    const { clientStream, agent } = loopback();
    const handlers = baseHandlers();
    connectAcpClient(clientStream, handlers);

    await agent.notify(acp.methods.client.session.update, {
      sessionId: "s-1",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "hi" },
        vendorUpdate: 1,
      },
      _meta: { vendor: { a: [1, "b", null] } },
      vendorTop: 1,
    });

    await vi.waitFor(() => expect(handlers.sessionUpdate).toHaveBeenCalledTimes(1));
    const params = handlers.sessionUpdate.mock.calls[0]![0] as Record<string, unknown>;
    expect(params._meta).toEqual({ vendor: { a: [1, "b", null] } });
    expect(params).not.toHaveProperty("vendorTop");
    expect(params.update as Record<string, unknown>).not.toHaveProperty("vendorUpdate");
  });

  it("answers known methods without an implementation like the 1.x wrapper", async () => {
    const { clientStream, agent } = loopback();
    const handlers = baseHandlers();
    connectAcpClient(clientStream, handlers);

    await expect(
      agent.request(acp.methods.client.fs.writeTextFile, {
        sessionId: "s-1",
        path: "/x",
        content: "abc",
      }),
    ).resolves.toEqual({});
    await expect(
      agent.request(acp.methods.client.terminal.release, { sessionId: "s-1", terminalId: "t1" }),
    ).resolves.toEqual({});
    await expect(
      agent.request(acp.methods.client.terminal.kill, { sessionId: "s-1", terminalId: "t1" }),
    ).resolves.toEqual({});
    await expect(
      agent.request(acp.methods.client.terminal.create, { sessionId: "s-1", command: "echo" }),
    ).resolves.toBeNull();
    await expect(
      agent.request(acp.methods.client.terminal.output, { sessionId: "s-1", terminalId: "t1" }),
    ).resolves.toBeNull();
    await expect(
      agent.request(acp.methods.client.elicitation.create, {
        sessionId: "s-1",
        messageId: "e-1",
        message: "m",
        requestedSchema: { type: "object", properties: {} },
      }),
    ).rejects.toMatchObject({ code: -32601 });
    await expect(agent.request("vendor/ask", { q: "ping" })).rejects.toMatchObject({
      code: -32601,
    });
    await agent.notify("vendor/progress", { n: 1 });
    await tick();
    expect(handlers.requestPermission).not.toHaveBeenCalled();
  });

  it("routes unknown methods to the extension handlers", async () => {
    const { clientStream, agent } = loopback();
    const handlers = {
      ...baseHandlers(),
      extMethod: vi.fn<
        (method: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>
      >(async (_method, params) => ({ echo: params })),
      extNotification: vi.fn<(method: string, params: unknown) => Promise<void>>(async () => {}),
    };
    connectAcpClient(clientStream, handlers);

    await expect(agent.request("vendor/ask", { q: "ping" })).resolves.toEqual({
      echo: { q: "ping" },
    });
    expect(handlers.extMethod).toHaveBeenCalledWith("vendor/ask", { q: "ping" });

    await agent.notify("vendor/progress", { n: 1 });
    await vi.waitFor(() =>
      expect(handlers.extNotification).toHaveBeenCalledWith("vendor/progress", { n: 1 }),
    );

    await expect(
      agent.request(acp.methods.client.elicitation.create, {
        sessionId: "s-1",
        messageId: "e-1",
        message: "m",
        requestedSchema: { type: "object", properties: {} },
      }),
    ).rejects.toMatchObject({ code: -32601 });
    expect(handlers.extMethod).toHaveBeenCalledTimes(1);
  });

  it("preserves thrown errors", async () => {
    const { clientStream, agent } = loopback();
    connectAcpClient(clientStream, {
      ...baseHandlers(),
      extMethod: async (method: string) => {
        if (method === "vendor/plain") throw new Error("boom");
        throw new acp.RequestError(-32000, "custom", { detail: 1 });
      },
    });

    await expect(agent.request("vendor/plain", {})).rejects.toMatchObject({
      code: -32603,
      data: { details: "boom" },
    });
    await expect(agent.request("vendor/custom", {})).rejects.toMatchObject({
      code: -32000,
      message: "custom",
      data: { detail: 1 },
    });
  });

  it("relaxes the params 1.x tolerated", async () => {
    const { clientStream, agent } = loopback();
    const readTextFile = vi.fn<(params: acp.ReadTextFileRequest) => Promise<{ content: string }>>(
      async () => ({ content: "x" }),
    );
    const createTerminal = vi.fn<
      (params: acp.CreateTerminalRequest) => Promise<{ terminalId: string }>
    >(async () => ({ terminalId: "t1" }));
    connectAcpClient(clientStream, { ...baseHandlers(), readTextFile, createTerminal });
    const lastRead = () => readTextFile.mock.calls.at(-1)![0];
    const lastCreate = () => createTerminal.mock.calls.at(-1)![0];

    await agent.request(acp.methods.client.fs.readTextFile, {
      sessionId: "s-1",
      path: "/x",
      line: "x",
    });
    expect(lastRead()).toEqual({ sessionId: "s-1", path: "/x" });

    await agent.request(acp.methods.client.fs.readTextFile, {
      sessionId: "s-1",
      path: "/x",
      limit: -1,
    });
    expect(lastRead()).toEqual({ sessionId: "s-1", path: "/x" });

    await agent.request(acp.methods.client.terminal.create, {
      sessionId: "s-1",
      command: "echo",
      args: {},
    });
    expect(lastCreate()).toMatchObject({ args: [] });

    await agent.request(acp.methods.client.terminal.create, {
      sessionId: "s-1",
      command: "echo",
      args: ["a", 1, "b"],
    });
    expect(lastCreate()).toMatchObject({ args: ["a", "b"] });

    await agent.request(acp.methods.client.terminal.create, {
      sessionId: "s-1",
      command: "echo",
      env: {},
    });
    expect(lastCreate()).toMatchObject({ env: [] });

    await agent.request(acp.methods.client.terminal.create, {
      sessionId: "s-1",
      command: "echo",
      env: [{ name: "A", value: "1" }, { bad: 1 }, { name: "MISSING" }],
    });
    expect(lastCreate()).toMatchObject({ env: [{ name: "A", value: "1" }] });

    await agent.request(acp.methods.client.terminal.create, {
      sessionId: "s-1",
      command: "echo",
      cwd: 1,
    });
    expect(lastCreate()).not.toHaveProperty("cwd");

    await agent.request(acp.methods.client.terminal.create, {
      sessionId: "s-1",
      command: "echo",
      outputByteLimit: "x",
    });
    expect(lastCreate()).not.toHaveProperty("outputByteLimit");

    await agent.request(acp.methods.client.terminal.create, {
      sessionId: "s-1",
      command: "echo",
      outputByteLimit: -1,
    });
    expect(lastCreate()).not.toHaveProperty("outputByteLimit");
  });

  it("still rejects what 1.x rejected", async () => {
    const { clientStream, agent } = loopback();
    const handlers = baseHandlers();
    connectAcpClient(clientStream, handlers);

    await expect(
      agent.request(acp.methods.client.fs.readTextFile, { sessionId: "s-1" }),
    ).rejects.toMatchObject({ code: -32602 });
    await agent.notify(acp.methods.client.session.update, update("made_up_vendor_kind"));
    await tick();
    expect(handlers.sessionUpdate).not.toHaveBeenCalled();
  });

  it("sends built-in methods by wire name and returns responses raw", async () => {
    const recorded: string[] = [];
    const { clientStream } = loopback((agentApp) => {
      agentApp
        .onRequest(acp.methods.agent.initialize, () => {
          recorded.push("initialize");
          return { protocolVersion: 1 };
        })
        .onRequest(acp.methods.agent.session.new, () => {
          recorded.push("session/new");
          return { sessionId: "s-1" };
        })
        .onRequest(acp.methods.agent.session.prompt, () => {
          recorded.push("session/prompt");
          return { stopReason: "end_turn" };
        })
        .onNotification(acp.methods.agent.session.cancel, () => {
          recorded.push("session/cancel");
        })
        .onRequest("*", ({ method }) => {
          recorded.push(method);
          // An agent-side custom response is not schema-serialized, so this is the
          // field-for-field check that our client hands responses back untouched.
          return { echo: 1, vendorExtra: { kept: true } };
        });
    });
    const client = connectAcpClient(clientStream, baseHandlers());

    const initialized = (await client.initialize({ protocolVersion: 1 })) as Record<
      string,
      unknown
    >;
    expect(initialized.protocolVersion).toBe(1);
    const created = (await client.newSession({ cwd: "/w", mcpServers: [] })) as Record<
      string,
      unknown
    >;
    expect(created.sessionId).toBe("s-1");
    const prompted = (await client.prompt({
      sessionId: "s-1",
      prompt: [{ type: "text", text: "hi" }],
    })) as Record<string, unknown>;
    expect(prompted.stopReason).toBe("end_turn");
    await client.cancel({ sessionId: "s-1" });
    await expect(client.extMethod("vendor/echo", { a: 1 })).resolves.toEqual({
      echo: 1,
      vendorExtra: { kept: true },
    });

    await vi.waitFor(() => expect(recorded).toContain("vendor/echo"));
    expect(recorded).toEqual([
      "initialize",
      "session/new",
      "session/prompt",
      "session/cancel",
      "vendor/echo",
    ]);
  });
});
