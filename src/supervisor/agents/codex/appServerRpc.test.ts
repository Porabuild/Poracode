import type { RuntimeEvent } from "@/shared/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  CodexAppServerRpc,
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
});
