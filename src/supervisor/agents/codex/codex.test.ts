import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
  createCodexAdapter,
  deriveCodexStructuredState,
  detectCodexReadyForInitialPrompt,
  detectCodexUpdatePrompt,
  parseCodexSocketMessage,
} from "./index";
import {
  codexDefaultCapabilities,
  formatCodexPlanLabel,
  parseCodexLoginStatusOutput,
} from "./detection";
import { CodexStructuredSession } from "./acp";
import type { OscNotification, OscTitle } from "@/shared/osc";
import type { RuntimeEvent } from "@/shared/contracts";
import { codexIntentFor } from "./plugin/intentMap";
import { mapCodexModels, mapCodexRequirements, mapCodexSlashCommands } from "./probe";
import { CodexStdioTransport } from "./stdioTransport";
import type { StructuredSessionUpdate } from "../base";

describe("deriveCodexStructuredState", () => {
  it("maps active approval state to needs_approval", () => {
    expect(
      deriveCodexStructuredState({
        type: "active",
        activeFlags: ["waitingOnApproval"],
      }),
    ).toEqual({
      status: "needs_approval",
      attention: "needs_approval",
    });
  });

  it("maps active user input state to needs_reply", () => {
    expect(
      deriveCodexStructuredState({
        type: "active",
        activeFlags: ["waitingOnUserInput"],
      }),
    ).toEqual({
      status: "needs_reply",
      attention: "needs_reply",
    });
  });

  it("maps active work with no flags to working", () => {
    expect(
      deriveCodexStructuredState({
        type: "active",
        activeFlags: [],
      }),
    ).toEqual({
      status: "working",
      attention: "working",
    });
  });

  it("maps idle state to idle", () => {
    expect(deriveCodexStructuredState({ type: "idle" })).toEqual({
      status: "idle",
      attention: "none",
    });
  });

  it("maps system errors to error", () => {
    expect(deriveCodexStructuredState({ type: "systemError" })).toEqual({
      status: "error",
      attention: "error",
    });
  });

  it("treats method messages with ids as server requests, not client responses", () => {
    expect(
      parseCodexSocketMessage({
        jsonrpc: "2.0",
        id: "req-1",
        method: "item/tool/requestUserInput",
        params: {
          questions: [],
        },
      }),
    ).toEqual({
      kind: "request",
      id: "req-1",
      method: "item/tool/requestUserInput",
      params: {
        questions: [],
      },
    });
  });

  it("preserves numeric server request ids", () => {
    expect(
      parseCodexSocketMessage({
        jsonrpc: "2.0",
        id: 0,
        method: "item/commandExecution/requestApproval",
        params: {
          command: "pnpm test",
        },
      }),
    ).toEqual({
      kind: "request",
      id: 0,
      method: "item/commandExecution/requestApproval",
      params: {
        command: "pnpm test",
      },
    });
  });

  it("treats id-only messages as JSON-RPC responses", () => {
    expect(
      parseCodexSocketMessage({
        jsonrpc: "2.0",
        id: "lightcode-1",
        result: {
          ok: true,
        },
      }),
    ).toEqual({
      kind: "response",
      id: "lightcode-1",
      result: {
        ok: true,
      },
    });
  });
});

function createTransportHarness() {
  const child = new EventEmitter() as EventEmitter & {
    stdin: PassThrough;
    stdout: PassThrough;
    stderr: PassThrough;
  };
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();

  const writes: string[] = [];
  child.stdin.on("data", (chunk) => writes.push(String(chunk)));

  const messages: unknown[] = [];
  const errors: Error[] = [];
  let closed = false;
  const transport = new CodexStdioTransport(
    child as unknown as import("node:child_process").ChildProcess,
  );
  transport.setListener({
    onMessage: (message) => messages.push(message),
    onClose: () => {
      closed = true;
    },
    onError: (error) => errors.push(error),
  });

  return {
    child,
    transport,
    messages,
    errors,
    writes,
    get closed() {
      return closed;
    },
  };
}

describe("CodexStdioTransport", () => {
  it("parses newline-delimited JSON-RPC messages across split stdout chunks", () => {
    const { child, messages } = createTransportHarness();

    child.stdout.write('{"jsonrpc":"2.0","id":"1",');
    expect(messages).toEqual([]);

    child.stdout.write('"result":{"ok":true}}\n{"jsonrpc":"2.0","method":"turn/started"}\r\n');

    expect(messages).toEqual([
      { jsonrpc: "2.0", id: "1", result: { ok: true } },
      { jsonrpc: "2.0", method: "turn/started" },
    ]);
  });

  it("keeps stderr out of protocol parsing and records it for diagnostics", () => {
    const { child, messages, transport } = createTransportHarness();

    child.stderr.write("warning from app-server\n");
    child.stdout.write('{"jsonrpc":"2.0","id":"1","result":null}\n');

    expect(messages).toEqual([{ jsonrpc: "2.0", id: "1", result: null }]);
    expect(transport.formatOutput()).toContain("warning from app-server");
  });

  it("writes outgoing JSON-RPC messages as newline-delimited JSON", () => {
    const { transport, writes } = createTransportHarness();

    transport.write({ jsonrpc: "2.0", method: "initialized" });

    expect(writes).toEqual(['{"jsonrpc":"2.0","method":"initialized"}\n']);
  });
});

describe("CodexStructuredSession", () => {
  type CodexRequestRecord = {
    method: string;
    params: Record<string, unknown>;
    timeoutMs?: number;
  };

  function makeStructuredSession(requests: CodexRequestRecord[]): CodexStructuredSession {
    const session = Object.create(CodexStructuredSession.prototype) as Record<string, unknown>;

    session["threadId"] = "local-thread";
    session["remoteThreadId"] = "provider-thread";
    session["bufferedRuntimeEvents"] = [];
    session["isDisposed"] = false;
    session["currentThreadStatus"] = { type: "idle" };
    session["seenErrorMessages"] = new Set<string>();
    session["resumeActiveStatusSuppressionUntil"] = new Map();
    session["request"] = async (
      method: string,
      params: Record<string, unknown>,
      timeoutMs?: number,
    ) => {
      requests.push({
        method,
        params,
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      });
      if (method === "turn/start") {
        return { turn: { id: "turn-1", items: [], status: "inProgress" } };
      }
      if (method === "thread/start") {
        return { thread: { id: "provider-thread" } };
      }
      return {};
    };

    return session as unknown as CodexStructuredSession;
  }

  it("uses a 30s default app-server request timeout", async () => {
    const structuredSession = Object.create(CodexStructuredSession.prototype) as Record<
      string,
      unknown
    >;
    const writes: unknown[] = [];
    structuredSession["requestSequence"] = 0;
    structuredSession["pendingRequests"] = new Map();
    structuredSession["transport"] = {
      write: (message: unknown) => writes.push(message),
    };

    vi.useFakeTimers();
    try {
      const pending = (
        structuredSession["request"] as (
          method: string,
          params: Record<string, unknown>,
        ) => Promise<unknown>
      ).call(structuredSession, "thread/read", { threadId: "provider-thread" });
      let rejectedMessage: string | undefined;
      pending.catch((error: unknown) => {
        rejectedMessage = error instanceof Error ? error.message : String(error);
      });

      await vi.advanceTimersByTimeAsync(29_999);
      expect((structuredSession["pendingRequests"] as Map<string, unknown>).size).toBe(1);
      expect(rejectedMessage).toBeUndefined();

      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
      expect(rejectedMessage).toBe(
        "Timed out waiting for Codex app-server response to thread/read.",
      );
    } finally {
      vi.useRealTimers();
    }

    expect(writes).toEqual([
      {
        jsonrpc: "2.0",
        id: "lightcode-0",
        method: "thread/read",
        params: { threadId: "provider-thread" },
      },
    ]);
    expect((structuredSession["pendingRequests"] as Map<string, unknown>).size).toBe(0);
  });

  it("interrupts the active Codex app-server turn", async () => {
    const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
    const structuredSession = makeStructuredSession(requests);

    await structuredSession.startTurn("hello", { model: "gpt-5.4" });
    await structuredSession.interruptTurn();

    expect(requests.at(-1)).toEqual({
      method: "turn/interrupt",
      params: {
        threadId: "provider-thread",
        turnId: "turn-1",
      },
    });
  });

  it("interrupts after turn/start when stop was requested before the turn id arrived", async () => {
    const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
    const structuredSession = makeStructuredSession(requests);

    await structuredSession.interruptTurn();
    await structuredSession.startTurn("hello", { model: "gpt-5.4" });

    expect(requests.map((request) => request.method)).toEqual(["turn/start", "turn/interrupt"]);
    expect(requests.at(-1)?.params).toEqual({
      threadId: "provider-thread",
      turnId: "turn-1",
    });
  });

  it("rolls back Codex app-server threads with thread/rollback", async () => {
    const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
    const structuredSession = makeStructuredSession(requests);

    await structuredSession.rollbackThread(2);

    expect(requests[0]).toEqual({
      method: "thread/rollback",
      params: {
        threadId: "provider-thread",
        numTurns: 2,
      },
    });
  });

  it("requests Codex reasoning summaries for GUI turns", async () => {
    const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
    const structuredSession = makeStructuredSession(requests);

    await structuredSession.startTurn("hello", { model: "gpt-5.4", effort: "high" });

    expect(requests[0]).toMatchObject({
      method: "turn/start",
      params: {
        effort: "high",
        summary: "auto",
      },
    });
  });

  it("forces serviceTier each turn: null when Fast is off (incl. the first turn), 'fast' when on", async () => {
    const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
    const structuredSession = makeStructuredSession(requests);

    // Off on the first turn → force null rather than preserving a config.toml tier.
    await structuredSession.startTurn("normal", { model: "gpt-5.4", fast: false });
    expect(requests[0]?.method).toBe("turn/start");
    expect(requests[0]?.params.serviceTier).toBeNull();

    // On → force "fast".
    await structuredSession.startTurn("go fast", { model: "gpt-5.4", fast: true });
    expect(requests[1]?.params.serviceTier).toBe("fast");

    // Back off → force null again to clear the sticky server-side override.
    await structuredSession.startTurn("back to normal", { model: "gpt-5.4", fast: false });
    expect(requests[2]?.params.serviceTier).toBeNull();
  });

  it("dispatches /goal <objective> to thread/goal/set without starting a model turn", async () => {
    const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
    const structuredSession = makeStructuredSession(requests);
    const runtimeEvents: RuntimeEvent[] = [];
    const updates: unknown[] = [];
    (structuredSession as unknown as Record<string, unknown>)["listener"] = {
      onRuntimeEvent: (event: RuntimeEvent) => runtimeEvents.push(event),
      onUpdate: (update: unknown) => updates.push(update),
    };

    await structuredSession.startTurn("/goal ship unified GUI goal support", { model: "gpt-5.4" });

    expect(requests).toEqual([
      {
        method: "thread/goal/set",
        params: {
          threadId: "provider-thread",
          objective: "ship unified GUI goal support",
          status: "active",
        },
      },
    ]);
    // The goal item itself is produced by the canonical mapper from the
    // `thread/goal/updated` notification — startTurn should only emit the
    // user-facing turn/user-message envelope around the RPC.
    expect(runtimeEvents.map((event) => event.type)).toEqual([
      "turn.started",
      "item.started",
      "item.completed",
      "turn.completed",
    ]);
    expect(updates.at(-1)).toEqual({ status: "idle", attention: "none" });
  });

  it("maps /goal clear to thread/goal/clear", async () => {
    const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
    const structuredSession = makeStructuredSession(requests);

    await structuredSession.startTurn("/goal clear", { model: "gpt-5.4" });

    expect(requests).toEqual([
      {
        method: "thread/goal/clear",
        params: { threadId: "provider-thread" },
      },
    ]);
  });

  it("maps /goal pause and /goal resume to thread/goal/set status changes", async () => {
    const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
    const structuredSession = makeStructuredSession(requests);

    await structuredSession.startTurn("/goal pause", { model: "gpt-5.4" });
    await structuredSession.startTurn("/goal resume", { model: "gpt-5.4" });

    expect(requests).toEqual([
      {
        method: "thread/goal/set",
        params: { threadId: "provider-thread", status: "paused" },
      },
      {
        method: "thread/goal/set",
        params: { threadId: "provider-thread", status: "active" },
      },
    ]);
  });

  it("treats /goal with no args as a no-op acknowledgement", async () => {
    const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
    const structuredSession = makeStructuredSession(requests);

    await structuredSession.startTurn("/goal", { model: "gpt-5.4" });

    expect(requests).toEqual([]);
  });

  it("surfaces Codex app-server commands as slash commands during initialize", async () => {
    const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
    const structuredSession = makeStructuredSession(requests);
    const updates: unknown[] = [];
    (structuredSession as unknown as Record<string, unknown>)["transport"] = {
      write: () => {},
    };
    (structuredSession as unknown as Record<string, unknown>)["listener"] = {
      onUpdate: (update: unknown) => updates.push(update),
    };
    (structuredSession as unknown as Record<string, unknown>)["request"] = async (
      method: string,
      params: Record<string, unknown>,
    ) => {
      requests.push({ method, params });
      return {
        commands: [
          {
            name: "review",
            description: "Review changes",
            argumentHint: "<scope>",
          },
        ],
      };
    };

    await (structuredSession as unknown as { initialize(): Promise<void> }).initialize();

    expect(updates).toContainEqual(
      expect.objectContaining({
        slashCommands: [
          {
            id: "review",
            label: "review — Review changes",
            description: "Review changes",
            argumentHint: "<scope>",
          },
        ],
      }),
    );
  });

  it("responds to numeric Codex app-server request ids with the original numeric id", async () => {
    const structuredSession = Object.create(CodexStructuredSession.prototype) as Record<
      string,
      unknown
    >;
    const writes: unknown[] = [];
    structuredSession["inboundRequests"] = new Map([
      [
        "0",
        {
          id: 0,
          method: "item/commandExecution/requestApproval",
          params: { command: "pnpm test" },
        },
      ],
    ]);
    structuredSession["transport"] = {
      write: (message: unknown) => writes.push(message),
    };

    await (structuredSession as unknown as CodexStructuredSession).resolveServerRequest("0", {
      optionId: "accept",
    });

    expect(writes).toEqual([
      {
        jsonrpc: "2.0",
        id: 0,
        result: { decision: "accept" },
      },
    ]);
  });

  it("answers unsupported app-server requests instead of leaving Codex blocked", () => {
    const structuredSession = Object.create(CodexStructuredSession.prototype) as Record<
      string,
      unknown
    >;
    const writes: unknown[] = [];
    let listener:
      | {
          onMessage: (message: unknown) => void;
        }
      | undefined;
    structuredSession["threadId"] = "local-thread";
    structuredSession["isDisposed"] = false;
    structuredSession["pendingRequests"] = new Map();
    structuredSession["inboundRequests"] = new Map();
    structuredSession["rejectPendingRequests"] = () => {};
    structuredSession["transport"] = {
      setListener: (next: typeof listener) => {
        listener = next;
      },
      write: (message: unknown) => writes.push(message),
    };

    (structuredSession["attachTransportHandlers"] as () => void).call(structuredSession);
    listener?.onMessage({
      jsonrpc: "2.0",
      id: "refresh-1",
      method: "account/chatgptAuthTokens/refresh",
      params: { reason: "unauthorized" },
    });

    expect(writes).toEqual([
      {
        jsonrpc: "2.0",
        id: "refresh-1",
        error: {
          code: -32601,
          message:
            'Unsupported Codex app-server request method "account/chatgptAuthTokens/refresh".',
        },
      },
    ]);
    expect((structuredSession["inboundRequests"] as Map<string, unknown>).size).toBe(0);
  });

  function makeNotificationSession(): {
    onMessage: (message: unknown) => void;
    runtimeEvents: RuntimeEvent[];
  } {
    const session = Object.create(CodexStructuredSession.prototype) as Record<string, unknown>;
    const runtimeEvents: RuntimeEvent[] = [];
    let onMessage: ((message: unknown) => void) | undefined;
    session["threadId"] = "local-thread";
    session["remoteThreadId"] = "provider-thread";
    session["isDisposed"] = false;
    session["currentThreadStatus"] = { type: "idle" };
    session["seenErrorMessages"] = new Set<string>();
    session["resumeActiveStatusSuppressionUntil"] = new Map();
    session["bufferedRuntimeEvents"] = [];
    session["pendingRequests"] = new Map();
    session["inboundRequests"] = new Map();
    session["rejectPendingRequests"] = () => {};
    session["request"] = async () => ({});
    session["listener"] = {
      onRuntimeEvent: (event: RuntimeEvent) => runtimeEvents.push(event),
      onUpdate: () => {},
    };
    session["transport"] = {
      setListener: (next: { onMessage: (message: unknown) => void }) => {
        onMessage = next.onMessage;
      },
      write: () => {},
    };
    (session["attachTransportHandlers"] as () => void).call(session);
    if (!onMessage) throw new Error("transport listener was not attached");
    return { onMessage, runtimeEvents };
  }

  it("does not surface resume-time active status as new work", async () => {
    const session = Object.create(CodexStructuredSession.prototype) as Record<string, unknown>;
    const updates: StructuredSessionUpdate[] = [];
    const runtimeEvents: RuntimeEvent[] = [];
    const requests: CodexRequestRecord[] = [];
    let onMessage: ((message: unknown) => void) | undefined;
    let resolveThreadRead: (value: unknown) => void = () => {};
    const threadRead = new Promise<unknown>((resolve) => {
      resolveThreadRead = resolve;
    });

    session["threadId"] = "local-thread";
    session["remoteThreadId"] = undefined;
    session["launchOptions"] = {};
    session["activated"] = true;
    session["isDisposed"] = false;
    session["currentThreadStatus"] = { type: "idle" };
    session["seenErrorMessages"] = new Set<string>();
    session["bufferedRuntimeEvents"] = [];
    session["pendingRequests"] = new Map();
    session["inboundRequests"] = new Map();
    session["resumeActiveStatusSuppressionUntil"] = new Map();
    session["rejectPendingRequests"] = () => {};
    session["request"] = async (
      method: string,
      params: Record<string, unknown>,
      timeoutMs?: number,
    ) => {
      requests.push({
        method,
        params,
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      });
      if (method === "thread/resume") {
        onMessage?.({
          jsonrpc: "2.0",
          method: "thread/started",
          params: {
            thread: {
              id: "provider-thread",
              status: { type: "active", activeFlags: [] },
            },
          },
        });
        return {};
      }
      if (method === "thread/read") {
        return threadRead;
      }
      return {};
    };
    session["transport"] = {
      setListener: (next: { onMessage: (message: unknown) => void }) => {
        onMessage = next.onMessage;
      },
      write: () => {},
    };

    (session["attachTransportHandlers"] as () => void).call(session);
    await (session as unknown as CodexStructuredSession).openThread(
      { model: "gpt-5.4" },
      {
        providerSessionId: "provider-thread",
        discoveredAt: "2026-05-10T12:00:00.000Z",
      },
    );
    (session as unknown as CodexStructuredSession).setListener({
      onClose: () => {},
      onError: () => {},
      onUpdate: (update) => updates.push(update),
      onRuntimeEvent: (event) => runtimeEvents.push(event),
    });

    expect(updates).toEqual([]);

    onMessage?.({
      jsonrpc: "2.0",
      method: "turn/started",
      params: {
        threadId: "provider-thread",
        turn: { id: "old-turn", threadId: "provider-thread" },
      },
    });
    onMessage?.({
      jsonrpc: "2.0",
      method: "item/started",
      params: {
        threadId: "provider-thread",
        item: {
          id: "old-assistant",
          type: "assistant_message",
          text: "history",
        },
      },
    });

    resolveThreadRead({ thread: { status: { type: "idle" } } });
    await Promise.resolve();
    await Promise.resolve();

    onMessage?.({
      jsonrpc: "2.0",
      method: "thread/started",
      params: {
        thread: {
          id: "provider-thread",
          status: { type: "active", activeFlags: [] },
        },
      },
    });
    onMessage?.({
      jsonrpc: "2.0",
      method: "turn/started",
      params: {
        threadId: "provider-thread",
        turn: { id: "late-old-turn", threadId: "provider-thread" },
      },
    });

    expect(requests.map((request) => request.method)).toContain("thread/read");
    expect(runtimeEvents).toEqual([]);
    expect(updates).not.toContainEqual(
      expect.objectContaining({
        status: "working",
        attention: "working",
      }),
    );
  });

  it("keeps live status on lifecycle notifications instead of startup thread/read", async () => {
    const session = Object.create(CodexStructuredSession.prototype) as Record<string, unknown>;
    const updates: StructuredSessionUpdate[] = [];
    const runtimeEvents: RuntimeEvent[] = [];
    const requests: CodexRequestRecord[] = [];
    let onMessage: ((message: unknown) => void) | undefined;
    let resolveTurnStart: (value: unknown) => void = () => {};
    const turnStart = new Promise<unknown>((resolve) => {
      resolveTurnStart = resolve;
    });

    session["threadId"] = "local-thread";
    session["remoteThreadId"] = "provider-thread";
    session["isDisposed"] = false;
    session["currentThreadStatus"] = { type: "idle" };
    session["seenErrorMessages"] = new Set<string>();
    session["bufferedRuntimeEvents"] = [];
    session["pendingRequests"] = new Map();
    session["inboundRequests"] = new Map();
    session["resumeActiveStatusSuppressionUntil"] = new Map();
    session["rejectPendingRequests"] = () => {};
    session["request"] = async (
      method: string,
      params: Record<string, unknown>,
      timeoutMs?: number,
    ) => {
      requests.push({
        method,
        params,
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      });
      if (method === "turn/start") {
        return turnStart;
      }
      return {};
    };
    session["transport"] = {
      setListener: (next: { onMessage: (message: unknown) => void }) => {
        onMessage = next.onMessage;
      },
      write: () => {},
      formatOutput: () => "",
    };

    (session["attachTransportHandlers"] as () => void).call(session);
    (session as unknown as CodexStructuredSession).setListener({
      onClose: () => {},
      onError: () => {},
      onUpdate: (update) => updates.push(update),
      onRuntimeEvent: (event) => runtimeEvents.push(event),
    });

    onMessage?.({
      jsonrpc: "2.0",
      method: "thread/started",
      params: {
        thread: {
          id: "provider-thread",
          status: { type: "idle" },
        },
      },
    });

    expect(updates).toEqual([]);
    expect(requests).toEqual([]);

    const initialTurn = (session as unknown as CodexStructuredSession).startTurn("hi", {
      model: "gpt-5.4",
    });
    await Promise.resolve();

    expect(updates.at(-1)).toEqual({ status: "working", attention: "working" });
    expect(requests.map((request) => request.method)).toEqual(["turn/start"]);

    resolveTurnStart({ turn: { id: "turn-1", status: "inProgress" } });
    await initialTurn;

    onMessage?.({
      jsonrpc: "2.0",
      method: "turn/completed",
      params: {
        threadId: "provider-thread",
        turn: { id: "turn-1", status: "completed" },
      },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(requests.map((request) => request.method)).toEqual(["turn/start"]);
    expect(runtimeEvents).toContainEqual({
      type: "turn.completed",
      threadId: "local-thread",
      turnId: "turn-1",
      state: "completed",
    });
    expect(updates.at(-1)).toEqual({ status: "idle", attention: "none" });
  });

  it("emits completion idle even when a status idle already arrived", () => {
    const session = Object.create(CodexStructuredSession.prototype) as Record<string, unknown>;
    const updates: StructuredSessionUpdate[] = [];
    const runtimeEvents: RuntimeEvent[] = [];
    let onMessage: ((message: unknown) => void) | undefined;

    session["threadId"] = "local-thread";
    session["remoteThreadId"] = "provider-thread";
    session["isDisposed"] = false;
    session["currentThreadStatus"] = { type: "active", activeFlags: [] };
    session["seenErrorMessages"] = new Set<string>();
    session["bufferedRuntimeEvents"] = [];
    session["pendingRequests"] = new Map();
    session["inboundRequests"] = new Map();
    session["resumeActiveStatusSuppressionUntil"] = new Map();
    session["rejectPendingRequests"] = () => {};
    session["request"] = async () => ({});
    session["listener"] = {
      onClose: () => {},
      onError: () => {},
      onUpdate: (update: StructuredSessionUpdate) => updates.push(update),
      onRuntimeEvent: (event: RuntimeEvent) => runtimeEvents.push(event),
    };
    session["transport"] = {
      setListener: (next: { onMessage: (message: unknown) => void }) => {
        onMessage = next.onMessage;
      },
      write: () => {},
      formatOutput: () => "",
    };

    (session["attachTransportHandlers"] as () => void).call(session);

    onMessage?.({
      jsonrpc: "2.0",
      method: "thread/status/changed",
      params: { threadId: "provider-thread", status: { type: "idle" } },
    });
    onMessage?.({
      jsonrpc: "2.0",
      method: "turn/completed",
      params: {
        threadId: "provider-thread",
        turn: { id: "turn-1", status: "completed" },
      },
    });

    expect(runtimeEvents).toContainEqual({
      type: "turn.completed",
      threadId: "local-thread",
      turnId: "turn-1",
      state: "completed",
    });
    expect(updates).toEqual([
      { status: "idle", attention: "none" },
      { status: "idle", attention: "none" },
    ]);
  });

  it("emits completion idle for Codex turn completion notifications without params", () => {
    const session = Object.create(CodexStructuredSession.prototype) as Record<string, unknown>;
    const updates: StructuredSessionUpdate[] = [];
    let onMessage: ((message: unknown) => void) | undefined;

    session["threadId"] = "local-thread";
    session["remoteThreadId"] = "provider-thread";
    session["isDisposed"] = false;
    session["currentThreadStatus"] = { type: "active", activeFlags: [] };
    session["seenErrorMessages"] = new Set<string>();
    session["bufferedRuntimeEvents"] = [];
    session["pendingRequests"] = new Map();
    session["inboundRequests"] = new Map();
    session["resumeActiveStatusSuppressionUntil"] = new Map();
    session["rejectPendingRequests"] = () => {};
    session["request"] = async () => ({});
    session["listener"] = {
      onClose: () => {},
      onError: () => {},
      onUpdate: (update: StructuredSessionUpdate) => updates.push(update),
      onRuntimeEvent: () => {},
    };
    session["transport"] = {
      setListener: (next: { onMessage: (message: unknown) => void }) => {
        onMessage = next.onMessage;
      },
      write: () => {},
      formatOutput: () => "",
    };

    (session["attachTransportHandlers"] as () => void).call(session);

    onMessage?.({
      jsonrpc: "2.0",
      method: "turn/completed",
    });

    expect(updates).toEqual([{ status: "idle", attention: "none" }]);
  });

  it("collapses a single usage-limit failure into one error event", () => {
    vi.useFakeTimers();
    try {
      const { onMessage, runtimeEvents } = makeNotificationSession();
      const usageLimit =
        "Error running remote compact task You've hit your usage limit. Visit https://chatgpt.com/codex/settings/usage to purchase more credits.";

      // Observed ordering: the bare systemError status change lands first, then
      // Codex reports the real reason via turn/completed(failed) and a
      // duplicate thread/error notification. The specific message must preempt
      // the generic system-error fallback, and the duplicate must be dropped.
      onMessage({
        jsonrpc: "2.0",
        method: "thread/status/changed",
        params: { threadId: "provider-thread", status: { type: "systemError" } },
      });
      onMessage({
        jsonrpc: "2.0",
        method: "turn/completed",
        params: {
          threadId: "provider-thread",
          turn: { id: "turn-1", status: "failed", error: { message: usageLimit } },
        },
      });
      onMessage({
        jsonrpc: "2.0",
        method: "thread/error",
        params: { message: usageLimit },
      });

      vi.advanceTimersByTime(1000);

      expect(runtimeEvents.filter((event) => event.type === "error")).toEqual([
        { type: "error", threadId: "local-thread", message: usageLimit },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("still surfaces the generic system-error fallback when no specific error follows", () => {
    vi.useFakeTimers();
    try {
      const { onMessage, runtimeEvents } = makeNotificationSession();

      onMessage({
        jsonrpc: "2.0",
        method: "thread/status/changed",
        params: { threadId: "provider-thread", status: { type: "systemError" } },
      });

      // The fallback is deferred — nothing is emitted synchronously.
      expect(runtimeEvents.filter((event) => event.type === "error")).toEqual([]);

      vi.advanceTimersByTime(1000);

      expect(runtimeEvents.filter((event) => event.type === "error")).toEqual([
        {
          type: "error",
          threadId: "local-thread",
          message:
            "Codex reported a system error. The session may be out of usage or otherwise unable to continue.",
        },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("mapCodexSlashCommands", () => {
  it("keeps built-in Codex slash commands available when app-server init omits commands", () => {
    expect(codexDefaultCapabilities.slashCommands?.map((cmd) => cmd.id)).toEqual(
      expect.arrayContaining(["status", "model", "review", "compact", "permissions"]),
    );
  });

  it("normalizes Codex app-server command metadata", () => {
    expect(
      mapCodexSlashCommands([
        { name: "review", description: "Review changes", argumentHint: " <scope> " },
        { id: "  " },
      ]),
    ).toEqual([
      {
        id: "review",
        label: "review — Review changes",
        description: "Review changes",
        argumentHint: "<scope>",
      },
    ]);
  });
});

describe("mapCodexRequirements", () => {
  it("includes on-failure in unrestricted approval policies", () => {
    expect(mapCodexRequirements(null).approvalPolicies?.map((policy) => policy.id)).toContain(
      "on-failure",
    );
  });
});

describe("parseCodexLoginStatusOutput", () => {
  it("extracts the login method when Codex reports it", () => {
    expect(parseCodexLoginStatusOutput("Logged in using ChatGPT")).toEqual({
      authState: "authenticated",
      providerMetadata: {
        authMethod: "ChatGPT",
      },
    });
  });

  // A confirmed "Not logged in" CLI message must report `missing`, not
  // `unknown` — the composer's Sign-in dock gate is `authState === "missing"`,
  // so reporting `unknown` here would hide the dock until the user hit a
  // runtime 401.
  it("reports missing when Codex explicitly says the user is not logged in", () => {
    expect(parseCodexLoginStatusOutput("Not logged in")).toEqual({ authState: "missing" });
  });
});

describe("createCodexAdapter buildAcpLogoutCommand", () => {
  it("returns `codex logout` so the Settings logout button can drive it", async () => {
    const adapter = createCodexAdapter();
    const command = await adapter.buildAcpLogoutCommand?.();
    expect(command).toBeDefined();
    const args = command?.args ?? [];
    const rendered = args.includes("-EncodedCommand")
      ? Buffer.from(args.at(-1) ?? "", "base64").toString("utf16le")
      : args.join(" ");
    expect(rendered).toMatch(/codex/i);
    expect(rendered).toContain("logout");
  });
});

describe("formatCodexPlanLabel", () => {
  it.each([
    ["free", "ChatGPT Free"],
    ["go", "ChatGPT Go"],
    ["plus", "ChatGPT Plus"],
    ["pro", "ChatGPT Pro 20x"],
    ["prolite", "ChatGPT Pro 5x"],
    ["team", "ChatGPT Team"],
    ["business", "ChatGPT Business"],
    ["self_serve_business_usage_based", "ChatGPT Business"],
    ["enterprise", "ChatGPT Enterprise"],
    ["enterprise_cbp_usage_based", "ChatGPT Enterprise"],
    ["edu", "ChatGPT Edu"],
    ["unknown", "ChatGPT"],
  ])("maps known plan token %s to %s", (token, label) => {
    expect(formatCodexPlanLabel(token)).toBe(label);
  });

  it("falls back to a title-cased label for unrecognised plan tokens", () => {
    expect(formatCodexPlanLabel("atlas")).toBe("Atlas");
  });
});

describe("detectCodexUpdatePrompt", () => {
  const SAMPLE_TEXT = [
    "🎉Update available! 0.116.0 -> 0.117.0",
    "",
    "Release notes: https://github.com/openai/codex/releases/latest",
    "",
    "> 1. Update now (runs `npm install -g @openai/codex`)",
    "  2. Skip",
    "  3. Skip until next version",
    "",
    "Press enter to continue",
  ].join("\n");

  it("detects the update prompt", () => {
    expect(detectCodexUpdatePrompt(SAMPLE_TEXT)).toBe(true);
  });

  it("returns false for unrelated text", () => {
    expect(detectCodexUpdatePrompt("hello world")).toBe(false);
  });

  it("returns false for empty text", () => {
    expect(detectCodexUpdatePrompt("")).toBe(false);
  });

  it("detects without emoji prefix", () => {
    expect(detectCodexUpdatePrompt("Update available! 0.116.0 -> 0.117.0")).toBe(true);
  });
});

describe("detectCodexReadyForInitialPrompt", () => {
  it("returns true for the normal Codex home screen", () => {
    const text = [
      "OpenAI Codex (v0.116.0)",
      "model: gpt-5.4-mini high /model to change",
      "directory: ~/work/site-search-ui",
    ].join("\n");

    expect(detectCodexReadyForInitialPrompt(text)).toBe(true);
  });

  it("returns false while the update prompt is visible", () => {
    const text = [
      "Update available! 0.116.0 -> 0.117.0",
      "OpenAI Codex (v0.116.0)",
      "directory: ~/work/site-search-ui",
      "model: gpt-5.4-mini high /model to change",
    ].join("\n");

    expect(detectCodexReadyForInitialPrompt(text)).toBe(false);
  });
});

function oscTitle(text: string, code: 0 | 1 | 2 = 0): OscTitle {
  return { code, text };
}

describe("createCodexAdapter handleOscTitle", () => {
  const adapter = createCodexAdapter();

  it("maps braille-prefixed titles to working (Codex spinner glyphs)", () => {
    expect(adapter.handleOscTitle?.(oscTitle("⠋ Working (5s • esc to interrupt)"))).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
    expect(adapter.handleOscTitle?.(oscTitle("⠸ Thinking"))).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
  });

  it("accepts any glyph in the braille range (U+2800–U+28FF)", () => {
    for (const glyph of ["⠀", "⠁", "⠂", "⠐", "⣾", "⣿"]) {
      expect(adapter.handleOscTitle?.(oscTitle(`${glyph} anything`))?.status).toBe("working");
    }
  });

  it("returns null for the idle title with no spinner prefix", () => {
    expect(adapter.handleOscTitle?.(oscTitle("codex"))).toBeNull();
    expect(adapter.handleOscTitle?.(oscTitle("Codex"))).toBeNull();
  });

  it("returns null when the braille glyph is not leading", () => {
    // A braille glyph mid-string is not Codex's working spinner — don't match.
    expect(adapter.handleOscTitle?.(oscTitle("codex ⠸"))).toBeNull();
  });

  it("returns null for OSC 1 (icon name) with a plain app name", () => {
    expect(adapter.handleOscTitle?.(oscTitle("codex", 1))).toBeNull();
  });
});

function osc(body: string, title = ""): OscNotification {
  return { code: 9, title, body, payload: undefined };
}

describe("createCodexAdapter handleOscNotification", () => {
  const adapter = createCodexAdapter();

  it("maps approval notifications to needs_approval", () => {
    expect(adapter.handleOscNotification?.(osc("approval-requested"))).toEqual({
      status: "needs_approval",
      attention: "needs_approval",
      corroborated: true,
    });
  });

  it("maps agent-turn-complete to idle", () => {
    expect(adapter.handleOscNotification?.(osc("agent-turn-complete"))).toEqual({
      status: "idle",
      attention: "none",
      corroborated: true,
    });
  });

  it("maps generic turn complete phrasing to idle", () => {
    expect(adapter.handleOscNotification?.(osc("Turn complete"))).toEqual({
      status: "idle",
      attention: "none",
      corroborated: true,
    });
  });

  it("maps plan-mode prompt OSC notify to needs_approval", () => {
    // Codex emits OSC 9 with body "Plan mode prompt: <title>" when it has
    // presented a plan and is waiting on the user to approve / edit / reject.
    expect(adapter.handleOscNotification?.(osc("Plan mode prompt: Plan Target"))).toEqual({
      status: "needs_approval",
      attention: "needs_approval",
      corroborated: true,
    });
  });

  it("maps non-approval OSC notify (notify-as-turn-complete) to idle", () => {
    // Codex 0.122+ emits OSC 9 per Growl/notify semantics: the body is the
    // assistant's response text (e.g. "Hi."), not a lifecycle keyword. Any
    // such notification corresponds to turn-complete → idle.
    expect(adapter.handleOscNotification?.(osc("Hi."))).toEqual({
      status: "idle",
      attention: "none",
      corroborated: true,
    });
    expect(adapter.handleOscNotification?.(osc("Hi! What should we work on?"))).toEqual({
      status: "idle",
      attention: "none",
      corroborated: true,
    });
  });

  it("returns null for empty OSC bodies", () => {
    expect(adapter.handleOscNotification?.(osc(""))).toBeNull();
  });

  it("maps status from JSON payload slugs in OSC body", () => {
    const n9: OscNotification = {
      code: 9,
      title: "",
      body: '{"type":"agent_turn_complete","v":1}',
      payload: { type: "agent_turn_complete", v: 1 },
    };
    expect(adapter.handleOscNotification?.(n9)).toEqual({
      status: "idle",
      attention: "none",
      corroborated: true,
    });
    const nOk: OscNotification = {
      code: 9,
      title: "",
      body: '{"event":"exec_approval_requested"}',
      payload: { event: "exec_approval_requested" },
    };
    expect(adapter.handleOscNotification?.(nOk)?.status).toBe("needs_approval");
  });
});

describe("codexIntentFor", () => {
  it("maps hook events to Lightcode intents", () => {
    expect(codexIntentFor("SessionStart", { hook_event_name: "SessionStart" }, false)).toBe(
      "session.started",
    );
    expect(codexIntentFor("UserPromptSubmit", { hook_event_name: "UserPromptSubmit" }, false)).toBe(
      "session.turn_started",
    );
    expect(
      codexIntentFor("PermissionRequest", { hook_event_name: "PermissionRequest" }, false),
    ).toBe("session.needs_approval");
    expect(codexIntentFor("Stop", { hook_event_name: "Stop" }, false)).toBe(
      "session.turn_finished",
    );
    expect(codexIntentFor("PreToolUse", { hook_event_name: "PreToolUse" }, false)).toBeUndefined();
    expect(codexIntentFor("PreToolUse", { hook_event_name: "PreToolUse" }, true)).toBe(
      "session.turn_started",
    );
  });
});

describe("mapCodexModels", () => {
  it("promotes GPT-5.5 to the Codex default model when available", () => {
    expect(
      mapCodexModels([
        {
          id: "gpt-5.4",
          model: "gpt-5.4",
          displayName: "gpt-5.4",
          hidden: false,
          isDefault: true,
          defaultReasoningEffort: "medium",
          supportedReasoningEfforts: [
            { reasoningEffort: "low", description: "Low" },
            { reasoningEffort: "medium", description: "Medium" },
          ],
        },
        {
          id: "gpt-5.5",
          model: "gpt-5.5",
          displayName: "gpt-5.5",
          hidden: false,
          isDefault: false,
          defaultReasoningEffort: "medium",
          supportedReasoningEfforts: [
            { reasoningEffort: "medium", description: "Medium" },
            { reasoningEffort: "high", description: "High" },
          ],
        },
      ]),
    ).toMatchObject({
      models: [
        { id: "gpt-5.5", label: "5.5" },
        { id: "gpt-5.4", label: "5.4" },
      ],
      defaultEffort: "high",
    });
  });

  it("prefers high as the default effort when the default model supports it", () => {
    expect(
      mapCodexModels([
        {
          id: "gpt-5.4",
          model: "gpt-5.4",
          displayName: "gpt-5.4",
          hidden: false,
          isDefault: true,
          defaultReasoningEffort: "medium",
          supportedReasoningEfforts: [
            { reasoningEffort: "low", description: "Low" },
            { reasoningEffort: "medium", description: "Medium" },
            { reasoningEffort: "high", description: "High" },
          ],
        },
      ]),
    ).toMatchObject({
      defaultEffort: "high",
      efforts: ["low", "medium", "high"],
    });
  });
});
