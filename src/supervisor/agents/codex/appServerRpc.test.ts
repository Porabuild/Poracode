import type { RuntimeEvent } from "@/shared/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  CodexAppServerConnection,
  CodexAppServerRpc,
  CodexRpcResponseError,
  isUnsupportedCodexRequestError,
  type CodexAppServerRpcListener,
  type CodexAppServerRpcTransport,
  type CodexRpcDebugDirection,
} from "./appServerRpc";
import type { CodexStdioTransportListener } from "./stdioTransport";

function createRpcHarness(output = "") {
  let transportListener: CodexStdioTransportListener | undefined;
  const writes: Array<Record<string, unknown>> = [];
  const runtimeEvents: RuntimeEvent[] = [];
  const notifications: Array<{
    method: string;
    params: Record<string, unknown> | undefined;
  }> = [];
  const debugEvents: Array<{ direction: CodexRpcDebugDirection; payload: unknown }> = [];
  const onClose = vi.fn<() => void>();
  const onError = vi.fn<(error: Error) => void>();
  const dispose = vi.fn<() => void>();
  const transport: CodexAppServerRpcTransport = {
    setListener: (listener) => {
      transportListener = listener;
    },
    write: (message) => writes.push(message),
    dispose,
    formatOutput: () => output,
  };
  const rpc = new CodexAppServerRpc(transport, "local-thread");
  rpc.setListener({
    onNotification: (method, params) => notifications.push({ method, params }),
    onRuntimeEvents: (events) => runtimeEvents.push(...events),
    onClose,
    onError,
    onDebug: (direction, payload) => debugEvents.push({ direction, payload }),
  });

  const listener = () => {
    if (!transportListener) {
      throw new Error("RPC transport listener was not attached.");
    }
    return transportListener;
  };

  return {
    debugEvents,
    dispose,
    listener,
    notifications,
    onClose,
    onError,
    rpc,
    runtimeEvents,
    writes,
  };
}

describe("CodexAppServerRpc", () => {
  it("uses a 30s default timeout and removes expired requests", async () => {
    vi.useFakeTimers();
    try {
      const { listener, rpc, writes } = createRpcHarness();
      const pending = rpc.request("thread/read", { threadId: "provider-thread" });
      let rejectedMessage: string | undefined;
      pending.catch((error: unknown) => {
        rejectedMessage = error instanceof Error ? error.message : String(error);
      });

      await vi.advanceTimersByTimeAsync(29_999);
      expect(rejectedMessage).toBeUndefined();

      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
      expect(rejectedMessage).toBe(
        "Timed out waiting for Codex app-server response to thread/read.",
      );
      expect(writes).toEqual([
        {
          id: "poracode-0",
          method: "thread/read",
          params: { threadId: "provider-thread" },
        },
      ]);

      listener().onMessage({
        jsonrpc: "2.0",
        id: "poracode-0",
        result: { late: true },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("resolves successful responses and ignores unknown response ids", async () => {
    const { debugEvents, listener, rpc } = createRpcHarness();
    const pending = rpc.request("thread/read", { threadId: "provider-thread" });

    const response = { jsonrpc: "2.0", id: "poracode-0", result: { ok: true } };
    listener().onMessage({ jsonrpc: "2.0", id: "unknown", result: { ignored: true } });
    listener().onMessage(response);

    await expect(pending).resolves.toEqual({ ok: true });
    expect(debugEvents).toContainEqual({
      direction: "poracode->codex",
      payload: {
        id: "poracode-0",
        method: "thread/read",
        params: { threadId: "provider-thread" },
      },
    });
    expect(debugEvents).toContainEqual({ direction: "codex->poracode", payload: response });
  });

  it("rejects error responses with the app-server message", async () => {
    const { listener, rpc } = createRpcHarness();
    const pending = rpc.request("turn/start", { threadId: "provider-thread", input: [] });

    listener().onMessage({
      jsonrpc: "2.0",
      id: "poracode-0",
      error: { code: -32000, message: "turn rejected" },
    });

    await expect(pending).rejects.toThrow("turn rejected");
  });

  it("only treats missing methods and unknown parameters as unsupported", () => {
    expect(
      isUnsupportedCodexRequestError(new CodexRpcResponseError("Method not found", -32601)),
    ).toBe(true);
    expect(
      isUnsupportedCodexRequestError(
        new CodexRpcResponseError("Invalid params: unknown field `lastTurnId`", -32602),
      ),
    ).toBe(true);
    expect(
      isUnsupportedCodexRequestError(
        new CodexRpcResponseError("Invalid params: lastTurnId is in progress", -32602),
      ),
    ).toBe(false);
  });

  it("retries overloaded requests with exponential backoff", async () => {
    vi.useFakeTimers();
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const { listener, rpc, writes } = createRpcHarness();
      const pending = rpc.request("thread/read", { threadId: "provider-thread" });

      listener().onMessage({
        id: "poracode-0",
        error: { code: -32001, message: "Server overloaded; retry later." },
      });
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(49);
      expect(writes).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(writes).toHaveLength(2);
      expect(writes[1]).toMatchObject({
        id: "poracode-1",
        method: "thread/read",
        params: { threadId: "provider-thread" },
      });

      listener().onMessage({ id: "poracode-1", result: { ok: true } });
      await expect(pending).resolves.toEqual({ ok: true });
    } finally {
      random.mockRestore();
      vi.useRealTimers();
    }
  });

  it("maps inbound requests and replies with their original numeric ids", () => {
    const { listener, rpc, runtimeEvents, writes } = createRpcHarness();
    listener().onMessage({
      jsonrpc: "2.0",
      id: 0,
      method: "item/commandExecution/requestApproval",
      params: { command: "pnpm test" },
    });

    expect(runtimeEvents).toContainEqual(
      expect.objectContaining({
        type: "request.opened",
        threadId: "local-thread",
        requestId: "0",
      }),
    );

    rpc.resolveServerRequest("0", { optionId: "accept" });

    expect(writes.at(-1)).toEqual({
      id: 0,
      result: { decision: "accept" },
    });
  });

  it("answers external current-time requests", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_781_717_655_999);
    try {
      const { listener, runtimeEvents, writes } = createRpcHarness();
      listener().onMessage({
        id: "time-1",
        method: "currentTime/read",
        params: { threadId: "provider-thread" },
      });

      expect(writes).toEqual([
        {
          id: "time-1",
          result: { currentTimeAt: 1_781_717_655 },
        },
      ]);
      expect(runtimeEvents).toEqual([]);
    } finally {
      now.mockRestore();
    }
  });

  it("emits question-answer events when resolving Codex user input", () => {
    const { listener, rpc, runtimeEvents, writes } = createRpcHarness();
    listener().onMessage({
      jsonrpc: "2.0",
      id: "question-1",
      method: "item/tool/requestUserInput",
      params: {
        threadId: "provider-thread",
        turnId: "turn-1",
        itemId: "item-1",
        autoResolutionMs: null,
        questions: [
          {
            id: "scope",
            header: "Scope",
            question: "Which scope?",
            isOther: false,
            isSecret: false,
            options: [{ label: "Workspace", description: "Current workspace" }],
          },
        ],
      },
    });
    runtimeEvents.splice(0);

    const response = { answers: { scope: { answers: ["Workspace"] } } };
    rpc.resolveServerRequest("question-1", response);

    expect(writes.at(-1)).toEqual({
      id: "question-1",
      result: response,
    });
    expect(runtimeEvents).toEqual([
      expect.objectContaining({
        type: "item.started",
        threadId: "local-thread",
        payload: {
          questions: [
            {
              header: "Scope",
              question: "Which scope?",
              selected: [{ label: "Workspace", description: "Current workspace" }],
            },
          ],
        },
      }),
      expect.objectContaining({ type: "item.completed", threadId: "local-thread" }),
    ]);
  });

  it("returns method-not-found for unimplemented ChatGPT auth-token refresh", () => {
    const { listener, runtimeEvents, writes } = createRpcHarness();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      listener().onMessage({
        jsonrpc: "2.0",
        id: "refresh-1",
        method: "account/chatgptAuthTokens/refresh",
        params: { reason: "unauthorized" },
      });
    } finally {
      warn.mockRestore();
    }

    expect(writes).toEqual([
      {
        id: "refresh-1",
        error: {
          code: -32601,
          message:
            'Unsupported Codex app-server request method "account/chatgptAuthTokens/refresh".',
        },
      },
    ]);
    expect(runtimeEvents).toEqual([]);
  });

  it("forwards notifications without taking ownership of session state", () => {
    const { listener, notifications } = createRpcHarness();
    listener().onMessage({
      jsonrpc: "2.0",
      method: "turn/started",
      params: { threadId: "provider-thread" },
    });

    expect(notifications).toEqual([
      { method: "turn/started", params: { threadId: "provider-thread" } },
    ]);
  });

  it("rejects pending requests with output diagnostics when transport closes", async () => {
    const { debugEvents, listener, onClose, rpc } = createRpcHarness(" Output: app-server crashed");
    const pending = rpc.request("thread/read", { threadId: "provider-thread" });

    listener().onClose();

    await expect(pending).rejects.toThrow("Codex app-server exited. Output: app-server crashed");
    expect(onClose).toHaveBeenCalledOnce();
    expect(debugEvents).toContainEqual({
      direction: "transport",
      payload: { event: "close", output: " Output: app-server crashed" },
    });
  });

  it("rejects pending requests and forwards transport errors", async () => {
    const { listener, onError, rpc } = createRpcHarness();
    const pending = rpc.request("thread/read", { threadId: "provider-thread" });
    const error = new Error("stdio failed");

    listener().onError(error);

    await expect(pending).rejects.toBe(error);
    expect(onError).toHaveBeenCalledWith(error);
  });

  it("disposes the transport and rejects pending requests with the session error", async () => {
    const { dispose, onClose, rpc } = createRpcHarness();
    const pending = rpc.request("thread/read", { threadId: "provider-thread" });
    const error = new Error("Codex app-server session disposed.");

    rpc.dispose(error);

    await expect(pending).rejects.toBe(error);
    expect(dispose).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shares initialization and routes thread notifications across RPC channels", async () => {
    let transportListener: CodexStdioTransportListener | undefined;
    const writes: Array<Record<string, unknown>> = [];
    const dispose = vi.fn<() => void>();
    const transport: CodexAppServerRpcTransport = {
      setListener: (listener) => {
        transportListener = listener;
      },
      write: (message) => writes.push(message),
      dispose,
      formatOutput: () => "",
    };
    const connection = new CodexAppServerConnection(transport);
    const first = new CodexAppServerRpc(connection, "local-first");
    const second = new CodexAppServerRpc(connection, "local-second");
    const firstNotifications =
      vi.fn<(method: string, params: Record<string, unknown> | undefined) => void>();
    const secondNotifications =
      vi.fn<(method: string, params: Record<string, unknown> | undefined) => void>();
    const listener = (onNotification: typeof firstNotifications): CodexAppServerRpcListener => ({
      onNotification,
      onRuntimeEvents: () => {},
      onClose: () => {},
      onError: () => {},
    });
    first.setListener(listener(firstNotifications));
    second.setListener(listener(secondNotifications));

    const firstInitialize = first.request("initialize", {
      clientInfo: { name: "poracode", version: "test" },
      capabilities: null,
    });
    const secondInitialize = second.request("initialize", {
      clientInfo: { name: "poracode", version: "test" },
      capabilities: null,
    });
    expect(writes).toHaveLength(1);
    transportListener!.onMessage({ id: "poracode-0", result: { userAgent: "codex/test" } });
    await expect(Promise.all([firstInitialize, secondInitialize])).resolves.toHaveLength(2);
    first.notify("initialized");
    second.notify("initialized");
    expect(writes.filter((message) => message.method === "initialized")).toHaveLength(1);

    first.claimThread("provider-first");
    second.claimThread("provider-second");
    transportListener!.onMessage({
      method: "turn/started",
      params: { threadId: "provider-second" },
    });
    expect(firstNotifications).not.toHaveBeenCalled();
    expect(secondNotifications).toHaveBeenCalledWith("turn/started", {
      threadId: "provider-second",
    });

    first.dispose(new Error("first closed"));
    expect(dispose).not.toHaveBeenCalled();
    const pending = second.request("thread/read", {
      threadId: "provider-second",
      includeTurns: false,
    });
    transportListener!.onMessage({
      id: "poracode-1",
      result: { thread: { id: "provider-second" } },
    });
    await expect(pending).resolves.toMatchObject({ thread: { id: "provider-second" } });

    connection.dispose(new Error("shutdown"));
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("routes inbound server requests to the owning local thread", () => {
    let transportListener: CodexStdioTransportListener | undefined;
    const writes: Array<Record<string, unknown>> = [];
    const transport: CodexAppServerRpcTransport = {
      setListener: (listener) => {
        transportListener = listener;
      },
      write: (message) => writes.push(message),
      dispose: () => {},
      formatOutput: () => "",
    };
    const connection = new CodexAppServerConnection(transport);
    const first = new CodexAppServerRpc(connection, "local-first");
    const second = new CodexAppServerRpc(connection, "local-second");
    const firstEvents: RuntimeEvent[] = [];
    const secondEvents: RuntimeEvent[] = [];
    const listener = (events: RuntimeEvent[]): CodexAppServerRpcListener => ({
      onNotification: () => {},
      onRuntimeEvents: (next) => events.push(...next),
      onClose: () => {},
      onError: () => {},
    });
    first.setListener(listener(firstEvents));
    second.setListener(listener(secondEvents));
    first.claimThread("provider-first");
    second.claimThread("provider-second");

    transportListener!.onMessage({
      id: "approval-2",
      method: "item/commandExecution/requestApproval",
      params: { threadId: "provider-second", command: "pnpm test" },
    });

    expect(firstEvents).toEqual([]);
    expect(secondEvents).toContainEqual(
      expect.objectContaining({
        type: "request.opened",
        threadId: "local-second",
        requestId: "approval-2",
      }),
    );
    second.resolveServerRequest("approval-2", { optionId: "accept" });
    expect(writes.at(-1)).toEqual({ id: "approval-2", result: { decision: "accept" } });
  });

  it("routes legacy conversation approvals and child threads to their owning channel", () => {
    let transportListener: CodexStdioTransportListener | undefined;
    const writes: Array<Record<string, unknown>> = [];
    const transport: CodexAppServerRpcTransport = {
      setListener: (listener) => {
        transportListener = listener;
      },
      write: (message) => writes.push(message),
      dispose: () => {},
      formatOutput: () => "",
    };
    const connection = new CodexAppServerConnection(transport);
    const first = new CodexAppServerRpc(connection, "local-first");
    const second = new CodexAppServerRpc(connection, "local-second");
    const firstEvents: RuntimeEvent[] = [];
    const secondEvents: RuntimeEvent[] = [];
    const firstNotifications = vi.fn<CodexAppServerRpcListener["onNotification"]>();
    const secondNotifications = vi.fn<CodexAppServerRpcListener["onNotification"]>();
    const listener = (
      events: RuntimeEvent[],
      onNotification: CodexAppServerRpcListener["onNotification"],
    ): CodexAppServerRpcListener => ({
      onNotification,
      onRuntimeEvents: (next) => events.push(...next),
      onClose: () => {},
      onError: () => {},
    });
    first.setListener(listener(firstEvents, firstNotifications));
    second.setListener(listener(secondEvents, secondNotifications));
    first.claimThread("provider-first");
    second.claimThread("provider-second");

    transportListener!.onMessage({
      id: "legacy-approval",
      method: "execCommandApproval",
      params: {
        conversationId: "provider-second",
        callId: "call-1",
        approvalId: null,
        command: ["pwd"],
        cwd: "C:\\repo",
        reason: null,
        parsedCmd: [],
      },
    });
    expect(firstEvents).toEqual([]);
    expect(secondEvents).toContainEqual(
      expect.objectContaining({
        type: "request.opened",
        threadId: "local-second",
        requestId: "legacy-approval",
      }),
    );
    second.resolveServerRequest("legacy-approval", { optionId: "decline" });
    expect(writes.at(-1)).toEqual({
      id: "legacy-approval",
      result: { decision: "decline" },
    });

    transportListener!.onMessage({
      method: "thread/started",
      params: { thread: { id: "provider-child", parentThreadId: "provider-second" } },
    });
    transportListener!.onMessage({
      method: "turn/started",
      params: { threadId: "provider-child", turn: { id: "child-turn" } },
    });
    expect(first.ownsThread("provider-child")).toBe(false);
    expect(second.ownsThread("provider-child")).toBe(true);
    expect(firstNotifications).not.toHaveBeenCalled();
    expect(secondNotifications).toHaveBeenCalledWith("turn/started", {
      threadId: "provider-child",
      turn: { id: "child-turn" },
    });
  });

  it("buffers startup notifications until the matching thread is claimed", () => {
    let transportListener: CodexStdioTransportListener | undefined;
    const transport: CodexAppServerRpcTransport = {
      setListener: (listener) => {
        transportListener = listener;
      },
      write: () => {},
      dispose: () => {},
      formatOutput: () => "",
    };
    const connection = new CodexAppServerConnection(transport);
    const first = new CodexAppServerRpc(connection, "local-first");
    const second = new CodexAppServerRpc(connection, "local-second");
    const firstNotifications = vi.fn<CodexAppServerRpcListener["onNotification"]>();
    const secondNotifications = vi.fn<CodexAppServerRpcListener["onNotification"]>();
    const listener = (
      onNotification: CodexAppServerRpcListener["onNotification"],
    ): CodexAppServerRpcListener => ({
      onNotification,
      onRuntimeEvents: () => {},
      onClose: () => {},
      onError: () => {},
    });
    first.setListener(listener(firstNotifications));
    second.setListener(listener(secondNotifications));

    transportListener!.onMessage({
      method: "thread/started",
      params: { thread: { id: "provider-second", status: { type: "idle" } } },
    });
    transportListener!.onMessage({
      method: "thread/status/changed",
      params: { threadId: "provider-second", status: { type: "active" } },
    });
    expect(firstNotifications).not.toHaveBeenCalled();
    expect(secondNotifications).not.toHaveBeenCalled();

    second.claimThread("provider-second");
    expect(secondNotifications.mock.calls).toEqual([
      ["thread/started", { thread: { id: "provider-second", status: { type: "idle" } } }],
      ["thread/status/changed", { threadId: "provider-second", status: { type: "active" } }],
    ]);
    expect(firstNotifications).not.toHaveBeenCalled();
  });

  it("cancels a closing channel's request and keeps sibling requests working", async () => {
    let transportListener: CodexStdioTransportListener | undefined;
    const writes: Array<Record<string, unknown>> = [];
    const transport: CodexAppServerRpcTransport = {
      setListener: (listener) => {
        transportListener = listener;
      },
      write: (message) => writes.push(message),
      dispose: () => {},
      formatOutput: () => "",
    };
    const connection = new CodexAppServerConnection(transport);
    const first = new CodexAppServerRpc(connection, "local-first");
    const second = new CodexAppServerRpc(connection, "local-second");
    const listener: CodexAppServerRpcListener = {
      onNotification: () => {},
      onRuntimeEvents: () => {},
      onClose: () => {},
      onError: () => {},
    };
    first.setListener(listener);
    second.setListener(listener);
    first.claimThread("provider-first");
    second.claimThread("provider-second");

    transportListener!.onMessage({
      id: "approval-first",
      method: "item/commandExecution/requestApproval",
      params: { threadId: "provider-first", command: "pnpm test" },
    });
    first.dispose(new Error("first closed"));
    expect(writes.at(-1)).toEqual({
      id: "approval-first",
      error: {
        code: -32800,
        message: "Request cancelled because the Poracode thread closed.",
      },
    });

    const pending = second.request("thread/read", {
      threadId: "provider-second",
      includeTurns: false,
    });
    transportListener!.onMessage({
      id: "poracode-0",
      result: { thread: { id: "provider-second" } },
    });
    await expect(pending).resolves.toMatchObject({ thread: { id: "provider-second" } });
  });

  it("rejects immediately when writing a request fails", async () => {
    const transport: CodexAppServerRpcTransport = {
      setListener: () => {},
      write: () => {
        throw new Error("stdin closed");
      },
      dispose: () => {},
      formatOutput: () => "",
    };
    const rpc = new CodexAppServerRpc(transport, "local-thread");

    await expect(rpc.request("thread/read", { threadId: "provider-thread" })).rejects.toThrow(
      "stdin closed",
    );
  });

  it("keeps a replacement channel alive when the superseded session for the same thread disposes", async () => {
    let transportListener: CodexStdioTransportListener | undefined;
    const writes: Array<Record<string, unknown>> = [];
    const transport: CodexAppServerRpcTransport = {
      setListener: (listener) => {
        transportListener = listener;
      },
      write: (message) => writes.push(message),
      dispose: () => {},
      formatOutput: () => "",
    };
    const connection = new CodexAppServerConnection(transport);
    // A force-stopped session is replaced while its own teardown still drains,
    // so both sessions share the Poracode thread id.
    const forceStopped = new CodexAppServerRpc(connection, "local-thread");
    forceStopped.claimThread("provider-thread");
    const replacement = new CodexAppServerRpc(connection, "local-thread");
    const replacementNotifications =
      vi.fn<(method: string, params: Record<string, unknown> | undefined) => void>();
    replacement.setListener({
      onNotification: replacementNotifications,
      onRuntimeEvents: () => {},
      onClose: () => {},
      onError: () => {},
    });
    // A sibling channel keeps the connection multi-channel so nothing falls
    // back to the single-channel delivery path.
    const sibling = new CodexAppServerRpc(connection, "local-sibling");
    sibling.claimThread("provider-sibling");
    replacement.claimThread("provider-thread");

    expect(forceStopped.ownsThread("provider-thread")).toBe(false);
    expect(replacement.ownsThread("provider-thread")).toBe(true);

    const pending = replacement.request("turn/start", {
      threadId: "provider-thread",
      input: [],
      model: "gpt-5.6-sol",
    });
    forceStopped.dispose(new Error("Codex app-server session disposed."));

    transportListener!.onMessage({
      method: "turn/started",
      params: { threadId: "provider-thread" },
    });
    expect(replacementNotifications).toHaveBeenCalledWith("turn/started", {
      threadId: "provider-thread",
    });

    const requestId = writes.find((message) => message.method === "turn/start")?.id;
    transportListener!.onMessage({ id: requestId, result: { turn: { id: "turn-1" } } });
    await expect(pending).resolves.toMatchObject({ turn: { id: "turn-1" } });
  });
});
